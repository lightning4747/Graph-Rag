import os
import jwt
import pytest
from fastapi.testclient import TestClient
from tests.test_integration_ingest import cleanup_test_data, read_case_9942a_note_text, require_integration_env

from app.main import app

JWT_SHARED_SECRET = os.environ.get("JWT_SHARED_SECRET") or "UCTYmi8VSBPQVJyxziCyi8noegzpMgdC+c4jwvJYvsw="

@pytest.fixture
def doctor_auth_header():
    token = jwt.encode({"user_id": "test-query-doctor", "role": "doctor"}, JWT_SHARED_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def reviewer_auth_header():
    token = jwt.encode({"user_id": "test-query-reviewer", "role": "reviewer"}, JWT_SHARED_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

def test_query_pipeline_integration(doctor_auth_header, reviewer_auth_header):
    require_integration_env("OPENROUTER_API_KEY", "NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD", "AUTH_DB_DSN")
    client = TestClient(app)
    
    # 1. Ingest CASE_9942A data first to ensure graph records exist
    note_text = read_case_9942a_note_text()
    
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
        assert data_a["intent"] in ("dosage_lookup", "condition_treatment_options")
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
    require_integration_env("OPENROUTER_API_KEY")
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


def test_query_pipeline_read_only_enforcement(doctor_auth_header, monkeypatch):
    client = TestClient(app)
    
    from app.query.cypher_generator import DynamicCypher
    
    # 1. Test case: Unsafe write pattern (CREATE)
    monkeypatch.setattr(
        "app.query.router.generate_cypher",
        lambda question, patient_id: DynamicCypher(
            intent="dosage_lookup",
            cypher_query="CREATE (m:Medication {generic_name: 'SuperDrug'}) RETURN m",
            parameters={}
        )
    )
    
    payload = {"question": "Some query"}
    res = client.post("/api/v1/query", json=payload, headers=doctor_auth_header)
    assert res.status_code == 400
    assert "Unsafe query pattern detected" in res.json()["detail"]

    # 2. Test case: Unsafe write pattern (CALL procedure)
    monkeypatch.setattr(
        "app.query.router.generate_cypher",
        lambda question, patient_id: DynamicCypher(
            intent="dosage_lookup",
            cypher_query="CALL apoc.periodic.iterate()",
            parameters={}
        )
    )
    res = client.post("/api/v1/query", json=payload, headers=doctor_auth_header)
    assert res.status_code == 400
    assert "Unsafe query pattern detected" in res.json()["detail"]

    # 3. Test case: Unauthorized intent (allowlist check)
    monkeypatch.setattr(
        "app.query.router.generate_cypher",
        lambda question, patient_id: DynamicCypher(
            intent="malicious_intent_not_in_allowlist",
            cypher_query="MATCH (m:Medication) RETURN m",
            parameters={}
        )
    )
    res = client.post("/api/v1/query", json=payload, headers=doctor_auth_header)
    assert res.status_code == 400
    assert "Unauthorized query intent detected" in res.json()["detail"]


def test_execute_dynamic_cypher_read_only_enforcement():
    from app.query.cypher_templates import execute_dynamic_cypher
    
    with pytest.raises(ValueError, match="Unsafe Cypher query rejected"):
        execute_dynamic_cypher("CREATE (m:Medication) RETURN m", {})
        
    with pytest.raises(ValueError, match="Unsafe Cypher query rejected"):
        execute_dynamic_cypher("MATCH (m:Medication) DETACH DELETE m", {})

    with pytest.raises(ValueError, match="Unsafe Cypher query rejected"):
        execute_dynamic_cypher("CALL apoc.warmup.run()", {})


def test_query_pipeline_patient_scoping_enforcement(doctor_auth_header, monkeypatch):
    client = TestClient(app)
    
    from app.query.cypher_generator import DynamicCypher
    
    # 1. Test case: request patient_id missing
    monkeypatch.setattr(
        "app.query.router.generate_cypher",
        lambda question, patient_id: DynamicCypher(
            intent="active_prescriptions_for_patient",
            cypher_query="MATCH (p:Patient {patient_id: $patient_id}) RETURN p",
            parameters={"patient_id": "CASE_9942A"}
        )
    )
    payload = {"question": "Show active prescriptions"}
    res = client.post("/api/v1/query", json=payload, headers=doctor_auth_header)
    assert res.status_code == 400
    assert "Patient-scoped query requires a patient ID" in res.json()["detail"]

    # 2. Test case: parameters patient_id mismatch
    monkeypatch.setattr(
        "app.query.router.generate_cypher",
        lambda question, patient_id: DynamicCypher(
            intent="active_prescriptions_for_patient",
            cypher_query="MATCH (p:Patient {patient_id: $patient_id}) RETURN p",
            parameters={"patient_id": "DIFFERENT_ID"}
        )
    )
    payload = {"question": "Show active prescriptions", "patient_id": "CASE_9942A"}
    res = client.post("/api/v1/query", json=payload, headers=doctor_auth_header)
    assert res.status_code == 400
    assert "Unmatched patient ID in query parameters" in res.json()["detail"]

    # 3. Test case: query missing $patient_id parameter reference
    monkeypatch.setattr(
        "app.query.router.generate_cypher",
        lambda question, patient_id: DynamicCypher(
            intent="active_prescriptions_for_patient",
            cypher_query="MATCH (p:Patient) RETURN p",
            parameters={"patient_id": "CASE_9942A"}
        )
    )
    payload = {"question": "Show active prescriptions", "patient_id": "CASE_9942A"}
    res = client.post("/api/v1/query", json=payload, headers=doctor_auth_header)
    assert res.status_code == 400
    assert "Unsafe patient-scoped query: query does not reference patient_id parameter" in res.json()["detail"]


def test_query_pipeline_missing_entities_enforcement(doctor_auth_header, monkeypatch):
    client = TestClient(app)
    
    from app.query.cypher_generator import DynamicCypher
    
    # Mock generate_cypher to return dosage_lookup intent but missing both "drug" and "condition"
    monkeypatch.setattr(
        "app.query.router.generate_cypher",
        lambda question, patient_id: DynamicCypher(
            intent="dosage_lookup",
            cypher_query="MATCH (m:Medication)-[t:CLINICALLY_TREATS]->(c:Condition) RETURN m",
            parameters={}
        )
    )
    
    payload = {"question": "Dosage lookup"}
    res = client.post("/api/v1/query", json=payload, headers=doctor_auth_header)
    assert res.status_code == 200
    data = res.json()
    assert data["type"] == "unknown_intent"
    assert "Missing required entity parameters" in data["text"]
    assert "drug" in data["text"]
    assert "condition" in data["text"]


