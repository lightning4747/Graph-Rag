import os
import jwt
import pytest
from fastapi.testclient import TestClient
from tests.test_integration_ingest import cleanup_test_data

from app.main import app

JWT_SHARED_SECRET = os.environ.get("JWT_SHARED_SECRET", "UCTYmi8VSBPQVJyxziCyi8noegzpMgdC+c4jwvJYvsw=")

@pytest.fixture
def doctor_auth_header():
    token = jwt.encode({"user_id": "test-query-doctor", "role": "doctor"}, JWT_SHARED_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def reviewer_auth_header():
    token = jwt.encode({"user_id": "test-query-reviewer", "role": "reviewer"}, JWT_SHARED_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

def test_query_pipeline_integration(doctor_auth_header, reviewer_auth_header):
    client = TestClient(app)
    
    # 1. Ingest CASE_9942A data first to ensure graph records exist
    note_path = "seed_data/raw_patient_notes.txt"
    with open(note_path, "r") as f:
        content = f.read()
        
    lines = content.splitlines()
    note_lines = []
    capture = False
    for line in lines:
        if "PATIENT LOG: CASE_9942A" in line:
            capture = True
            continue
        if capture:
            if line.startswith("===") and not note_lines:
                continue
            if line.startswith("==="):
                break
            note_lines.append(line)
            
    note_text = "\n".join(note_lines).strip()
    
    ingest_payload = {
        "note_text": note_text,
        "note_id": "query_test_note_9942A",
        "patient_id": "CASE_9942A",
        "encounter_date": "2026-06-15",
        "encounter_type": "Routine Outpatient Clinic"
    }
    
    # Clear any previous test data
    cleanup_test_data(ingest_payload["patient_id"], ingest_payload["note_id"])
    
    try:
        # Perform Ingestion
        ingest_res = client.post("/api/v1/ingest", json=ingest_payload, headers=doctor_auth_header)
        assert ingest_res.status_code == 200, f"Ingest setup failed: {ingest_res.text}"
        
        # Test Case A: Dosage Lookup (Metformin for Type 2 Diabetes)
        query_payload_a = {
            "question": "What is the max dose of Metformin for Type 2 Diabetes?",
            "patient_id": "CASE_9942A"
        }
        res_a = client.post("/api/v1/query", json=query_payload_a, headers=doctor_auth_header)
        assert res_a.status_code == 200, f"Query A failed: {res_a.text}"
        
        data_a = res_a.json()
        assert data_a["type"] == "generated"
        assert data_a["intent"] == "dosage_lookup"
        assert "500mg" in data_a["text"]
        assert "2000mg" in data_a["text"]
        assert len(data_a["facts"]) > 0
        
        # Test Case B: Active Prescriptions for Patient CASE_9942A
        query_payload_b = {
            "question": "Show active prescriptions for this patient.",
            "patient_id": "CASE_9942A"
        }
        res_b = client.post("/api/v1/query", json=query_payload_b, headers=doctor_auth_header)
        assert res_b.status_code == 200, f"Query B failed: {res_b.text}"
        
        data_b = res_b.json()
        assert data_b["type"] == "generated"
        assert data_b["intent"] == "active_prescriptions_for_patient"
        assert "Metformin" in data_b["text"]
        assert "Amlodipine" in data_b["text"]
        
        # Test Case C: Guard against unknown intent
        query_payload_c = {
            "question": "Tell me a joke about medical software."
        }
        res_c = client.post("/api/v1/query", json=query_payload_c, headers=doctor_auth_header)
        assert res_c.status_code == 200
        data_c = res_c.json()
        assert data_c["type"] == "unknown_intent"
        assert data_c["intent"] == "unknown"
        
        # Test Case D: Reject role='reviewer' from querying
        res_d = client.post("/api/v1/query", json=query_payload_a, headers=reviewer_auth_header)
        assert res_d.status_code == 403, "Reviewer role was allowed to query, but should be forbidden."

    finally:
        # Cleanup Neo4j and Postgres
        cleanup_test_data(ingest_payload["patient_id"], ingest_payload["note_id"])

def test_query_pipeline_hallucination_fallback(doctor_auth_header, monkeypatch):
    client = TestClient(app)
    
    # Mock generate_response to return a response containing a hallucinated dosage amount (2500mg)
    monkeypatch.setattr(
        "app.query.number_verifier.generate_response",
        lambda facts, intent: "Metformin has a maximum daily limit of 2500mg."
    )
    
    query_payload = {
        "question": "What is the max dose of Metformin for Type 2 Diabetes?",
        "patient_id": "CASE_9942A"
    }
    
    # Even without the patient log ingested, dosage_lookup intent works on static treatments seed data
    res = client.post("/api/v1/query", json=query_payload, headers=doctor_auth_header)
    assert res.status_code == 200
    
    data = res.json()
    # Should fall back to raw facts table because 2500mg is not in the source facts (2000mg)
    assert data["type"] == "fallback_raw_facts"
    assert "Unable to confidently phrase a summary" in data["text"]
    assert len(data["facts"]) > 0
