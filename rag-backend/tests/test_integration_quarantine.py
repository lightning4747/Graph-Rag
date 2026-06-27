import os
import uuid
import jwt
import json
import pytest
import psycopg2
from fastapi.testclient import TestClient
from neo4j import GraphDatabase

from app.main import app
from app.ingestion.graph_writer import write_encounter_and_patient
from tests.test_integration_ingest import cleanup_test_data, require_integration_env

JWT_SHARED_SECRET = os.environ.get("JWT_SHARED_SECRET") or "UCTYmi8VSBPQVJyxziCyi8noegzpMgdC+c4jwvJYvsw="
AUTH_DB_DSN = os.environ.get("AUTH_DB_DSN")

# Generate test UUIDs
TEST_REVIEWER_UUID = str(uuid.uuid4())
TEST_DOCTOR_UUID = str(uuid.uuid4())
TEST_QUARANTINE_UUID_1 = str(uuid.uuid4())
TEST_QUARANTINE_UUID_2 = str(uuid.uuid4())

TEST_NOTE_ID = "quarantine_test_note_999"
TEST_PATIENT_ID = "PATIENT_QUARANTINE_TEST"

@pytest.fixture
def doctor_auth_header():
    token = jwt.encode({"user_id": TEST_DOCTOR_UUID, "role": "doctor"}, JWT_SHARED_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def reviewer_auth_header():
    token = jwt.encode({"user_id": TEST_REVIEWER_UUID, "role": "reviewer"}, JWT_SHARED_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

def setup_postgres_test_data():
    conn = psycopg2.connect(AUTH_DB_DSN)
    try:
        with conn.cursor() as cur:
            # 1. Insert test users
            cur.execute(
                "INSERT INTO users (user_id, email, password_hash, role) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (TEST_REVIEWER_UUID, "reviewer_test@clinic.local", "dummy_hash", "reviewer")
            )
            cur.execute(
                "INSERT INTO users (user_id, email, password_hash, role) VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (TEST_DOCTOR_UUID, "doctor_test@clinic.local", "dummy_hash", "doctor")
            )
            # 2. Insert dummy quarantined items
            payload_1 = {
                "drug_mentioned_text": "Metformin",
                "rxnorm_code_guess": "RXN_855332",
                "dose_amount_text": "500mg",
                "frequency_text": "BID",
                "source_sentence": "Patient is prescribed Metformin 500mg BID."
            }
            cur.execute(
                """
                INSERT INTO quarantine_extractions (id, note_id, extraction_payload, errors, status)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (TEST_QUARANTINE_UUID_1, TEST_NOTE_ID, json.dumps(payload_1), ["Fuzzy match failed for generic name"], "pending_review")
            )
            
            payload_2 = {
                "observation_type": "Vitals",
                "value_text": "120/80 mmHg",
                "source_sentence": "Blood pressure was 120/80 mmHg."
            }
            cur.execute(
                """
                INSERT INTO quarantine_extractions (id, note_id, extraction_payload, errors, status)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
                """,
                (TEST_QUARANTINE_UUID_2, TEST_NOTE_ID, json.dumps(payload_2), ["Source sentence not found verbatim"], "pending_review")
            )
        conn.commit()
    finally:
        conn.close()

def cleanup_postgres_test_data():
    conn = psycopg2.connect(AUTH_DB_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM quarantine_extractions WHERE note_id = %s",
                (TEST_NOTE_ID,)
            )
            cur.execute(
                "DELETE FROM users WHERE user_id IN (%s, %s)",
                (TEST_REVIEWER_UUID, TEST_DOCTOR_UUID)
            )
        conn.commit()
    finally:
        conn.close()

def test_quarantine_flow_integration(doctor_auth_header, reviewer_auth_header):
    require_integration_env("NEO4J_URI", "NEO4J_USER", "NEO4J_PASSWORD", "AUTH_DB_DSN")
    # Prepare databases
    cleanup_postgres_test_data()
    cleanup_test_data(TEST_PATIENT_ID, TEST_NOTE_ID)
    
    setup_postgres_test_data()
    
    # Write the patient and encounter to Neo4j so we can link the approved prescription to it
    write_encounter_and_patient(
        patient_id=TEST_PATIENT_ID,
        encounter_id=TEST_NOTE_ID,
        encounter_date="2026-06-20",
        encounter_type="Routine Outpatient Clinic"
    )
    
    client = TestClient(app)
    
    try:
        # 1. Test GET /api/v1/quarantine - RBAC check
        # Doctor should be forbidden (403)
        res_get_doc = client.get("/api/v1/quarantine?status_filter=pending_review", headers=doctor_auth_header)
        assert res_get_doc.status_code == 403
        
        # Reviewer should be allowed (200)
        res_get_rev = client.get("/api/v1/quarantine?status_filter=pending_review", headers=reviewer_auth_header)
        assert res_get_rev.status_code == 200
        items = res_get_rev.json()
        assert len(items) >= 2
        item_ids = {item["id"] for item in items}
        assert TEST_QUARANTINE_UUID_1 in item_ids
        assert TEST_QUARANTINE_UUID_2 in item_ids
        
        # 2. Test POST /api/v1/quarantine/{id}/approve
        # Doctor should be forbidden
        corrected_payload = {
            "drug_mentioned_text": "Metformin",
            "rxnorm_code_guess": "RXN_855332",
            "dose_amount_text": "500mg",
            "frequency_text": "BID",
            "source_sentence": "Patient is prescribed Metformin 500mg BID."
        }
        res_approve_doc = client.post(
            f"/api/v1/quarantine/{TEST_QUARANTINE_UUID_1}/approve",
            json=corrected_payload,
            headers=doctor_auth_header
        )
        assert res_approve_doc.status_code == 403
        
        # Reviewer should approve successfully
        res_approve_rev = client.post(
            f"/api/v1/quarantine/{TEST_QUARANTINE_UUID_1}/approve",
            json=corrected_payload,
            headers=reviewer_auth_header
        )
        assert res_approve_rev.status_code == 200
        assert res_approve_rev.json() == {"ok": True, "status": "approved"}
        
        # Verify in Postgres that status is approved and reviewer_id is set
        conn = psycopg2.connect(AUTH_DB_DSN)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, reviewer_id FROM quarantine_extractions WHERE id = %s",
                    (TEST_QUARANTINE_UUID_1,)
                )
                row = cur.fetchone()
                assert row is not None
                assert row[0] == "approved"
                assert str(row[1]) == TEST_REVIEWER_UUID
        finally:
            conn.close()
            
        # Verify in Neo4j that prescription is written and specifies Metformin
        neo4j_uri = os.environ.get("NEO4J_URI")
        neo4j_user = os.environ.get("NEO4J_USER")
        neo4j_password = os.environ.get("NEO4J_PASSWORD")
        driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
        try:
            with driver.session() as session:
                rx_res = session.run(
                    """
                    MATCH (e:Encounter {encounter_id: $encounter_id})-[:RESULTED_IN]->(rx:Prescription)-[:SPECIFIES_DRUG]->(m:Medication)
                    RETURN rx, m
                    """,
                    encounter_id=TEST_NOTE_ID
                ).data()
                assert len(rx_res) == 1
                assert rx_res[0]["m"]["rxnorm_code"] == "RXN_855332"
                assert rx_res[0]["rx"]["dose_amount"] == "500mg"
                assert rx_res[0]["rx"]["extraction_method"] == "human_entered"
                assert rx_res[0]["rx"]["verified_by"] == TEST_REVIEWER_UUID
        finally:
            driver.close()
            
        # 3. Test POST /api/v1/quarantine/{id}/reject
        # Doctor should be forbidden
        res_reject_doc = client.post(
            f"/api/v1/quarantine/{TEST_QUARANTINE_UUID_2}/reject",
            headers=doctor_auth_header
        )
        assert res_reject_doc.status_code == 403
        
        # Reviewer should reject successfully
        res_reject_rev = client.post(
            f"/api/v1/quarantine/{TEST_QUARANTINE_UUID_2}/reject",
            headers=reviewer_auth_header
        )
        assert res_reject_rev.status_code == 200
        assert res_reject_rev.json() == {"ok": True, "status": "rejected"}
        
        # Verify in Postgres that status is rejected and reviewer_id is set
        conn = psycopg2.connect(AUTH_DB_DSN)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT status, reviewer_id FROM quarantine_extractions WHERE id = %s",
                    (TEST_QUARANTINE_UUID_2,)
                )
                row = cur.fetchone()
                assert row is not None
                assert row[0] == "rejected"
                assert str(row[1]) == TEST_REVIEWER_UUID
        finally:
            conn.close()
            
        # Verify in Neo4j that observation was NOT written
        driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
        try:
            with driver.session() as session:
                obs_res = session.run(
                    """
                    MATCH (e:Encounter {encounter_id: $encounter_id})-[:RECORDED]->(obs:Observation)
                    RETURN obs
                    """,
                    encounter_id=TEST_NOTE_ID
                ).data()
                assert len(obs_res) == 0
        finally:
            driver.close()
            
    finally:
        # Cleanup
        cleanup_postgres_test_data()
        cleanup_test_data(TEST_PATIENT_ID, TEST_NOTE_ID)