from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Literal, List, Optional, Dict, Any

from app.dependencies import get_current_user
from app.query.intent_classifier import classify_intent
from app.query.cypher_templates import validate_entities, execute_template
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
        # Step 1: Classify Query Intent
        intent = classify_intent(question_text)
        
        # Guard: Check for unknown intent
        if intent.intent == "unknown":
            return QueryResponse(
                type="unknown_intent",
                text="No matching query available for this question.",
                facts=[],
                intent="unknown"
            )
            
        # Merge patient_id from request body if intent requires it and it was provided
        if intent.intent == "active_prescriptions_for_patient" and request.patient_id:
            intent.entities["patient_id"] = request.patient_id.strip()
            
        # Step 2: Validate that all required entity keys are present
        validation_err = validate_entities(intent)
        if validation_err:
            return QueryResponse(
                type="unknown_intent",
                text=validation_err,
                facts=[],
                intent=intent.intent
            )
            
        # Step 3: Execute Parameterized Cypher Template
        facts = execute_template(intent)
        
        # Step 4 & 5: Generate and verify natural language summary
        result = safe_respond(facts, intent.intent)
        
        return QueryResponse(
            type=result["type"],
            text=result["text"],
            facts=result["facts"],
            intent=result["intent"]
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Query pipeline failed: {str(e)}"
        )
