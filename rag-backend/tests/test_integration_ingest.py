import os
import jwt
import pytest
from fastapi.testclient import TestClient
from neo4j import GraphDatabase
import psycopg2

from app.main import app

# Ensure environment has secret
JWT_SHARED_SECRET = os.environ.get("JWT_SHARED_SECRET", "UCTYmi8VSBPQVJyxziCyi8noegzpMgdC+c4jwvJYvsw=")

@pytest.fixture
def auth_header():
    token = jwt.encode({"user_id": "test-integration-doctor", "role": "doctor"}, JWT_SHARED_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

def cleanup_test_data(patient_id, note_id):
    # Neo4j cleanup
    neo4j_uri = os.environ.get("NEO4J_URI")
    neo4j_user = os.environ.get("NEO4J_USER")
    neo4j_password = os.environ.get("NEO4J_PASSWORD")
    if neo4j_uri and neo4j_user and neo4j_password:
        driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
        try:
            with driver.session() as session:
                # Delete Prescription and Observation nodes created in integration test
                session.run(
                    """
                    MATCH (e:Encounter {encounter_id: $encounter_id})
                    OPTIONAL MATCH (e)-[:RESULTED_IN]->(rx:Prescription)
                    OPTIONAL MATCH (e)-[:RECORDED]->(obs:Observation)
                    DETACH DELETE rx, obs, e
                    """,
                    encounter_id=note_id
                )
                # Delete Patient node if it has no encounters left
                session.run(
                    """
                    MATCH (p:Patient {patient_id: $patient_id})
                    WHERE NOT (p)-[:HAD_ENCOUNTER]->()
                    DETACH DELETE p
                    """,
                    patient_id=patient_id
                )
        finally:
            driver.close()

    # Postgres cleanup
    dsn = os.environ.get("AUTH_DB_DSN")
    if dsn:
        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM quarantine_extractions WHERE note_id = %s",
                    (note_id,)
                )
            conn.commit()
        finally:
            conn.close()

def test_ingest_integration(auth_header):
    client = TestClient(app)
    
    # Read the clean patient note
    note_path = "seed_data/raw_patient_notes.txt"
    with open(note_path, "r") as f:
        content = f.read()
        
    # Extract the note text for CASE_9942A
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
    
    # Build payload
    payload = {
        "note_text": note_text,
        "note_id": "integration_test_note_9942A",
        "patient_id": "CASE_9942A",
        "encounter_date": "2026-06-15",
        "encounter_type": "Routine Outpatient Clinic"
    }
    
    # Clean up any leftover database records from previous runs
    cleanup_test_data(payload["patient_id"], payload["note_id"])
    
    try:
        # Send the post request
        response = client.post("/api/v1/ingest", json=payload, headers=auth_header)
        assert response.status_code == 200, f"Ingestion failed: {response.text}"
        
        data = response.json()
        assert data["note_id"] == payload["note_id"]
        
        # Verify the returned object structure
        written = data["written"]
        quarantined = data["quarantined"]
        
        assert len(quarantined) == 0, f"Quarantined entities found: {quarantined}"
        assert len(written) >= 4, f"Expected at least 4 entities written, got: {written}"
        
        # Verify specific entities are in written list
        assert any("prescription:RXN_855332" in w for w in written), f"Metformin prescription write not in list: {written}"
        assert any("condition:ICD10_E11" in w for w in written), f"Type 2 Diabetes write not in list: {written}"
        assert any("condition:ICD10_I10" in w for w in written), f"Hypertension write not in list: {written}"
        assert any("observation:Vitals" in w or "observation:LabResult" in w for w in written), f"Observations write not in list: {written}"
        
        # Verify Neo4j data
        neo4j_uri = os.environ.get("NEO4J_URI")
        neo4j_user = os.environ.get("NEO4J_USER")
        neo4j_password = os.environ.get("NEO4J_PASSWORD")
        
        driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
        try:
            with driver.session() as session:
                # 1. Verify Patient and Encounter nodes
                res = session.run(
                    """
                    MATCH (p:Patient {patient_id: $patient_id})-[:HAD_ENCOUNTER]->(e:Encounter {encounter_id: $encounter_id})
                    RETURN p, e
                    """,
                    patient_id=payload["patient_id"],
                    encounter_id=payload["note_id"]
                ).data()
                assert len(res) == 1, "Patient or Encounter node missing or not linked"
                assert res[0]["e"]["encounter_type"] == payload["encounter_type"]
                
                # 2. Verify Prescription and Medication link (Metformin)
                rx_res = session.run(
                    """
                    MATCH (e:Encounter {encounter_id: $encounter_id})-[:RESULTED_IN]->(rx:Prescription)-[:SPECIFIES_DRUG]->(m:Medication)
                    RETURN rx, m
                    """,
                    encounter_id=payload["note_id"]
                ).data()
                assert len(rx_res) >= 1, "Prescription node or link to Medication missing"
                assert rx_res[0]["m"]["rxnorm_code"] == "RXN_855332", "Linked medication rxnorm code mismatch"
                assert rx_res[0]["rx"]["dose_amount"] == "500mg"
                assert "BID" in rx_res[0]["rx"]["frequency"] or "twice daily" in rx_res[0]["rx"]["frequency"]
                
                # 3. Verify Condition links (ICD10_E11 and ICD10_I10)
                cond_res = session.run(
                    """
                    MATCH (e:Encounter {encounter_id: $encounter_id})-[:RECORDED]->(obs:Observation {type: 'Diagnosis'})-[:CONFIRMS_DIAGNOSIS]->(c:Condition)
                    RETURN c.condition_id as condition_id
                    """,
                    encounter_id=payload["note_id"]
                ).data()
                condition_ids = {r["condition_id"] for r in cond_res}
                assert "ICD10_E11" in condition_ids, f"Type 2 Diabetes Condition link missing from: {condition_ids}"
                assert "ICD10_I10" in condition_ids, f"Essential Hypertension Condition link missing from: {condition_ids}"
                
                # 4. Verify Observations (BP, HbA1c, etc.)
                obs_res = session.run(
                    """
                    MATCH (e:Encounter {encounter_id: $encounter_id})-[:RECORDED]->(obs:Observation)
                    WHERE obs.type <> 'Diagnosis'
                    RETURN obs.type as type, obs.value as value
                    """,
                    encounter_id=payload["note_id"]
                ).data()
                assert len(obs_res) >= 2, "Expected at least 2 non-diagnosis observations (BP and HbA1c)"
                
        finally:
            driver.close()
            
        # Verify Postgres has no quarantined items for this note_id
        dsn = os.environ.get("AUTH_DB_DSN")
        conn = psycopg2.connect(dsn)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT COUNT(*) FROM quarantine_extractions WHERE note_id = %s",
                    (payload["note_id"],)
                )
                count = cur.fetchone()[0]
                assert count == 0, f"Expected 0 quarantined entries for this note, found {count}"
        finally:
            conn.close()

    finally:
        # Cleanup at the end of the test
        cleanup_test_data(payload["patient_id"], payload["note_id"])
