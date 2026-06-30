import os
import jwt
import pytest
from fastapi.testclient import TestClient
from neo4j import GraphDatabase

from app.main import app

JWT_SHARED_SECRET = os.environ.get("JWT_SHARED_SECRET") or "UCTYmi8VSBPQVJyxziCyi8noegzpMgdC+c4jwvJYvsw="

@pytest.fixture
def auth_header():
    token = jwt.encode({"user_id": "test-patient-doctor", "role": "doctor"}, JWT_SHARED_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def neo4j_driver():
    uri = os.environ.get("NEO4J_URI")
    user = os.environ.get("NEO4J_USER")
    password = os.environ.get("NEO4J_PASSWORD")
    if not all([uri, user, password]):
        pytest.skip("Neo4j AuraDB credentials not set")
    driver = GraphDatabase.driver(uri, auth=(user, password))
    yield driver
    driver.close()

def test_patient_crud_flow(auth_header, neo4j_driver):
    client = TestClient(app)
    test_pid = "CASE_TEST_CRUD"
    
    # 1. Cleanup patient CASE_TEST_CRUD if it exists
    with neo4j_driver.session() as session:
        session.run("MATCH (p:Patient {patient_id: $pid}) DETACH DELETE p", pid=test_pid)
        
    try:
        # 2. Create Patient
        payload = {
            "patient_id": test_pid,
            "name": "Jane Test Doe",
            "birth_date": "1990-01-01",
            "gender": "Female",
            "phone": "555-987-6543",
            "email": "jane.doe@example.com"
        }
        response = client.post("/api/v1/patients", json=payload, headers=auth_header)
        assert response.status_code == 201
        data = response.json()
        assert data["patient_id"] == test_pid
        assert data["name"] == "Jane Test Doe"
        assert data["gender"] == "Female"
        
        # 3. Create Duplicate Patient (should fail)
        response_dup = client.post("/api/v1/patients", json=payload, headers=auth_header)
        assert response_dup.status_code == 400
        assert "already exists" in response_dup.json()["detail"].lower()
        
        # 4. Get Patient
        response = client.get(f"/api/v1/patients/{test_pid}", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Jane Test Doe"
        
        # 5. List Patients
        response = client.get("/api/v1/patients", headers=auth_header)
        assert response.status_code == 200
        patients = response.json()
        assert any(p["patient_id"] == test_pid for p in patients)
        
        # 6. Update Patient
        update_payload = {
            "name": "Jane Updated Doe",
            "email": "jane.updated@example.com"
        }
        response = client.put(f"/api/v1/patients/{test_pid}", json=update_payload, headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Jane Updated Doe"
        assert data["email"] == "jane.updated@example.com"
        assert data["gender"] == "Female"  # preserved
        
        # 7. Get non-existent Patient (should 404)
        response = client.get("/api/v1/patients/NON_EXISTENT_ID", headers=auth_header)
        assert response.status_code == 404
        
        # 8. Update non-existent Patient (should 404)
        response = client.put("/api/v1/patients/NON_EXISTENT_ID", json=update_payload, headers=auth_header)
        assert response.status_code == 404
        
    finally:
        # Cleanup
        with neo4j_driver.session() as session:
            session.run("MATCH (p:Patient {patient_id: $pid}) DETACH DELETE p", pid=test_pid)
