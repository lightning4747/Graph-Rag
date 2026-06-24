from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Literal, List, Optional, Dict, Any

from app.dependencies import get_current_user
from app.query.cypher_generator import generate_cypher
from app.query.cypher_templates import execute_dynamic_cypher
from app.query.number_verifier import safe_respond

router = APIRouter()

class QueryRequest(BaseModel):
    question: str
    patient_id: Optional[str] = None

class QueryResponse(BaseModel):
    type: Literal["generated", "fallback_raw_facts", "unknown_intent"]
    text: str
    facts: List[Dict[str, Any]]
    intent: Optional[str] = None

@router.post("", response_model=QueryResponse)
def execute_query(
    request: QueryRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Protected Clinical Query Endpoint.
    Only allows role='doctor' or 'admin'. Returns verified facts or summary.
    """
    # Restrict to doctor and admin roles
    if current_user.get("role") not in ("doctor", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Role is not authorized to query the clinical graph"
        )
        
    question_text = request.question.strip()
    
    try:
        # Step 1: Generate dynamic Cypher query and parameters
        gen_result = generate_cypher(question_text, request.patient_id)
        
        # Guard: Check for unknown intent
        if gen_result.intent == "unknown" or not gen_result.cypher_query:
            return QueryResponse(
                type="unknown_intent",
                text="No matching query available for this question.",
                facts=[],
                intent="unknown"
            )

        # Enforce server-side read-only allowlist and safety patterns
        ALLOWED_INTENTS = {
            "drug_interaction_check",
            "dosage_lookup",
            "active_prescriptions_for_patient",
            "contraindication_check",
            "condition_treatment_options"
        }
        if gen_result.intent not in ALLOWED_INTENTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unauthorized query intent detected"
            )

        import re
        write_patterns = r"\b(create|merge|set|delete|detach|remove|call)\b"
        if re.search(write_patterns, gen_result.cypher_query, re.IGNORECASE):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsafe query pattern detected. Writing or calling procedures is not allowed."
            )

        # Enforce patient scoping validation for patient-specific intents
        if gen_result.intent == "active_prescriptions_for_patient":
            if not request.patient_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Patient-scoped query requires a patient ID"
                )
            if gen_result.parameters.get("patient_id") != request.patient_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unmatched patient ID in query parameters"
                )
            if "$patient_id" not in gen_result.cypher_query:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unsafe patient-scoped query: query does not reference patient_id parameter"
                )
            
        # Step 2: Execute dynamically generated Cypher query on Neo4j
        facts = execute_dynamic_cypher(gen_result.cypher_query, gen_result.parameters)
        
        # Step 3 & 4: Generate and verify natural language summary
        result = safe_respond(facts, gen_result.intent)
        
        return QueryResponse(
            type=result["type"],
            text=result["text"],
            facts=result["facts"],
            intent=result["intent"]
        )
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query pipeline failed: {str(e)}"
        )
