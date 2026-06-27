import hashlib
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional

from app.dependencies import get_current_user
from app.ingestion.extractor import extract_structured
from app.ingestion.grounding_verifier import verify_entity
from app.ingestion.graph_writer import (
    write_encounter_and_patient,
    write_prescription,
    write_condition_link,
    write_observation,
)
from app.ingestion.quarantine import quarantine_extraction

router = APIRouter()

class IngestRequest(BaseModel):
    note_text: str
    note_id: Optional[str] = None
    patient_id: str
    encounter_date: str
    encounter_type: str

class IngestResponse(BaseModel):
    note_id: str
    written: List[str]
    quarantined: List[dict]

@router.post("", response_model=IngestResponse)
def ingest_clinical_note(
    request: IngestRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Ingests a clinical note, extracts medical entities, verifies them,
    writes them to Neo4j, or quarantines them in PostgreSQL.
    """
    note_text = request.note_text.strip()
    
    # Generate note_id if not provided
    if not request.note_id:
        note_id = hashlib.sha256(note_text.encode("utf-8")).hexdigest()[:16]
    else:
        note_id = request.note_id.strip()
        
    try:
        # Step 0: Write Patient and Encounter to Neo4j
        write_encounter_and_patient(
            patient_id=request.patient_id,
            encounter_id=note_id,
            encounter_date=request.encounter_date,
            encounter_type=request.encounter_type,
        )
        
        # Step 1: LLM Extraction
        extraction_result = extract_structured(note_text)
        
        written_entities = []
        quarantined_entities = []
        
        # Process prescriptions
        for rx in extraction_result.prescriptions:
            verifier_result = verify_entity(rx, note_text)
            if verifier_result.passed:
                write_prescription(rx, note_id, verifier_result.confidence)
                written_entities.append(f"prescription:{rx.rxnorm_code_guess}")
            else:
                quarantine_extraction(rx, verifier_result.errors, note_id)
                quarantined_entities.append({
                    "type": "prescription",
                    "payload": rx.model_dump(),
                    "errors": verifier_result.errors,
                })
                
        # Process conditions
        for cond in extraction_result.conditions:
            verifier_result = verify_entity(cond, note_text)
            if verifier_result.passed:
                write_condition_link(cond, note_id, verifier_result.confidence)
                written_entities.append(f"condition:{cond.icd10_guess}")
            else:
                quarantine_extraction(cond, verifier_result.errors, note_id)
                quarantined_entities.append({
                    "type": "condition",
                    "payload": cond.model_dump(),
                    "errors": verifier_result.errors,
                })
                
        # Process observations
        for obs in extraction_result.observations:
            verifier_result = verify_entity(obs, note_text)
            if verifier_result.passed:
                write_observation(obs, note_id, verifier_result.confidence)
                written_entities.append(f"observation:{obs.observation_type}")
            else:
                quarantine_extraction(obs, verifier_result.errors, note_id)
                quarantined_entities.append({
                    "type": "observation",
                    "payload": obs.model_dump(),
                    "errors": verifier_result.errors,
                })
                
        return IngestResponse(
            note_id=note_id,
            written=written_entities,
            quarantined=quarantined_entities,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ingestion pipeline failed: {str(e)}"
        )
