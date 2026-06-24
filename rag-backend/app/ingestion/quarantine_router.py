import os
import json
import psycopg2
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any, List, Optional

from app.dependencies import get_current_user
from app.ingestion.extractor import (
    ExtractedPrescription,
    ExtractedCondition,
    ExtractedObservation,
)
from app.ingestion.graph_writer import (
    write_prescription,
    write_condition_link,
    write_observation,
)

router = APIRouter()
dsn = os.environ.get("AUTH_DB_DSN")

@router.get("")
def get_quarantined_items(
    # spec/plan.md §Phase 6 calls this ?status=pending_review
    # Legacy param ?status_filter= also accepted for backwards compatibility
    status: Optional[str] = None,
    status_filter: Optional[str] = "pending_review",
    current_user: dict = Depends(get_current_user)
):
    """
    Get quarantined extractions. Restricted to roles 'reviewer' and 'admin'.
    """
    if current_user.get("role") not in ("reviewer", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Role is not authorized to access quarantine review console"
        )
    
    # Resolve effective filter: 'status' param (spec) takes precedence over legacy 'status_filter'
    effective_status = status or status_filter or "pending_review"
        
    if not dsn:
        raise RuntimeError("AUTH_DB_DSN environment variable is not set")
        
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, note_id, extraction_payload, errors, status, created_at, reviewed_at, reviewer_id
                FROM quarantine_extractions
                WHERE status = %s
                ORDER BY created_at DESC
                """,
                (effective_status,)
            )
            rows = cur.fetchall()
            results = []
            for row in rows:
                results.append({
                    "id": str(row[0]),
                    "note_id": row[1],
                    "extraction_payload": row[2],
                    "errors": row[3],
                    "status": row[4],
                    "created_at": row[5].isoformat() if row[5] else None,
                    "reviewed_at": row[6].isoformat() if row[6] else None,
                    "reviewer_id": str(row[7]) if row[7] else None,
                })
            return results
    finally:
        conn.close()

@router.post("/{id}/approve")
def approve_quarantine_item(
    id: str,
    corrected_payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    """
    Approve a quarantined item after correcting it.
    Writes the corrected extraction payload to Neo4j and marks it approved in Postgres.
    Restricted to roles 'reviewer' and 'admin'.
    """
    if current_user.get("role") not in ("reviewer", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Role is not authorized to approve quarantined items"
        )
        
    if not dsn:
        raise RuntimeError("AUTH_DB_DSN environment variable is not set")
        
    conn = psycopg2.connect(dsn)
    try:
        # 1. Fetch note_id and current status
        with conn.cursor() as cur:
            cur.execute(
                "SELECT note_id, status FROM quarantine_extractions WHERE id = %s",
                (id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Quarantine record not found")
            note_id, current_status = row
            
            if current_status != "pending_review":
                raise HTTPException(
                    status_code=400,
                    detail=f"Quarantine record is already {current_status} and cannot be approved"
                )
                
        # 2. Parse and write corrected payload to Neo4j
        reviewer_id = current_user.get("user_id")
        
        if "drug_mentioned_text" in corrected_payload:
            # Parse as prescription
            extraction = ExtractedPrescription(**corrected_payload)
            write_prescription(
                extraction,
                note_id,
                confidence=1.0,
                extraction_method="human_entered",
                verified_by=reviewer_id
            )
        elif "condition_mentioned_text" in corrected_payload:
            # Parse as condition
            extraction = ExtractedCondition(**corrected_payload)
            write_condition_link(
                extraction,
                note_id,
                confidence=1.0,
                extraction_method="human_entered",
                verified_by=reviewer_id
            )
        elif "observation_type" in corrected_payload:
            # Parse as observation
            extraction = ExtractedObservation(**corrected_payload)
            write_observation(
                extraction,
                note_id,
                confidence=1.0,
                extraction_method="human_entered",
                verified_by=reviewer_id
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid corrected payload structure — could not determine entity type"
            )
            
        # 3. Update status in Postgres
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE quarantine_extractions
                SET status = 'approved',
                    reviewer_id = %s,
                    reviewed_at = NOW(),
                    extraction_payload = %s
                WHERE id = %s
                """,
                (reviewer_id, json.dumps(corrected_payload), id)
            )
        conn.commit()
        return {"ok": True, "status": "approved"}
    except HTTPException as he:
        conn.rollback()
        raise he
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve quarantined item: {str(e)}"
        )
    finally:
        conn.close()

@router.post("/{id}/reject")
def reject_quarantine_item(
    id: str,
    current_user: dict = Depends(get_current_user)
):
    """
    Reject a quarantined item. Marks it as rejected in Postgres.
    Restricted to roles 'reviewer' and 'admin'.
    """
    if current_user.get("role") not in ("reviewer", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Role is not authorized to reject quarantined items"
        )
        
    if not dsn:
        raise RuntimeError("AUTH_DB_DSN environment variable is not set")
        
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT status FROM quarantine_extractions WHERE id = %s",
                (id,)
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Quarantine record not found")
            current_status = row[0]
            
            if current_status != "pending_review":
                raise HTTPException(
                    status_code=400,
                    detail=f"Quarantine record is already {current_status} and cannot be rejected"
                )
                
            reviewer_id = current_user.get("user_id")
            cur.execute(
                """
                UPDATE quarantine_extractions
                SET status = 'rejected',
                    reviewer_id = %s,
                    reviewed_at = NOW()
                WHERE id = %s
                """,
                (reviewer_id, id)
            )
        conn.commit()
        return {"ok": True, "status": "rejected"}
    except HTTPException as he:
        conn.rollback()
        raise he
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject quarantined item: {str(e)}"
        )
    finally:
        conn.close()
