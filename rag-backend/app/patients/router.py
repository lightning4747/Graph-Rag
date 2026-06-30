from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import Optional, List

from app.dependencies import get_current_user
from app.ingestion.graph_writer import driver

router = APIRouter()

class PatientCreateRequest(BaseModel):
    patient_id: str
    name: str
    birth_date: str  # YYYY-MM-DD
    gender: str
    phone: Optional[str] = None
    email: Optional[str] = None

class PatientUpdateRequest(BaseModel):
    name: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None

class PatientResponse(BaseModel):
    patient_id: str
    name: Optional[str] = None
    birth_date: Optional[str] = None
    gender: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


@router.get("", response_model=List[PatientResponse])
def list_patients(current_user: dict = Depends(get_current_user)):
    """
    Get all patient records.
    """
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Neo4j driver not initialized"
        )
    
    def read_tx(tx):
        result = tx.run(
            """
            MATCH (p:Patient)
            RETURN p.patient_id AS patient_id,
                   p.name AS name,
                   p.birth_date AS birth_date,
                   p.gender AS gender,
                   p.phone AS phone,
                   p.email AS email
            ORDER BY p.patient_id
            """
        )
        return [record.data() for record in result]
        
    try:
        with driver.session(default_access_mode="READ") as session:
            return session.execute_read(read_tx)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query failed: {str(e)}"
        )


@router.get("/{patient_id}", response_model=PatientResponse)
def get_patient(patient_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get demographic details for a single patient.
    """
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Neo4j driver not initialized"
        )
        
    def read_tx(tx):
        result = tx.run(
            """
            MATCH (p:Patient {patient_id: $patient_id})
            RETURN p.patient_id AS patient_id,
                   p.name AS name,
                   p.birth_date AS birth_date,
                   p.gender AS gender,
                   p.phone AS phone,
                   p.email AS email
            """,
            patient_id=patient_id
        )
        record = result.single()
        return record.data() if record else None
        
    try:
        with driver.session(default_access_mode="READ") as session:
            res = session.execute_read(read_tx)
            if not res:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Patient with ID '{patient_id}' not found"
                )
            return res
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database query failed: {str(e)}"
        )


@router.post("", response_model=PatientResponse, status_code=status.HTTP_201_CREATED)
def create_patient(request: PatientCreateRequest, current_user: dict = Depends(get_current_user)):
    """
    Create a new patient record.
    """
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Neo4j driver not initialized"
        )
        
    pid = request.patient_id.strip()
    
    def check_exists(tx):
        res = tx.run("MATCH (p:Patient {patient_id: $pid}) RETURN p.patient_id LIMIT 1", pid=pid)
        return res.single() is not None
        
    def write_tx(tx):
        tx.run(
            """
            CREATE (p:Patient {
                patient_id: $patient_id,
                name: $name,
                birth_date: $birth_date,
                gender: $gender,
                phone: $phone,
                email: $email
            })
            """,
            patient_id=pid,
            name=request.name.strip(),
            birth_date=request.birth_date.strip(),
            gender=request.gender.strip(),
            phone=request.phone.strip() if request.phone else None,
            email=request.email.strip() if request.email else None
        )
        
    try:
        with driver.session() as session:
            if session.execute_read(check_exists):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Patient with ID '{pid}' already exists."
                )
            session.execute_write(write_tx)
            
        return PatientResponse(
            patient_id=pid,
            name=request.name,
            birth_date=request.birth_date,
            gender=request.gender,
            phone=request.phone,
            email=request.email
        )
    except HTTPException:
        raise
    except Exception as e:
        if "already exists" in str(e) or "ConstraintValidation" in str(e):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Patient with ID '{pid}' already exists in database."
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database write failed: {str(e)}"
        )


@router.put("/{patient_id}", response_model=PatientResponse)
def update_patient(
    patient_id: str,
    request: PatientUpdateRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Update details of an existing patient record.
    """
    if not driver:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Neo4j driver not initialized"
        )
        
    def check_exists(tx):
        res = tx.run("MATCH (p:Patient {patient_id: $pid}) RETURN p.patient_id LIMIT 1", pid=patient_id)
        return res.single() is not None

    def write_tx(tx):
        tx.run(
            """
            MATCH (p:Patient {patient_id: $patient_id})
            SET p.name = coalesce($name, p.name),
                p.birth_date = coalesce($birth_date, p.birth_date),
                p.gender = coalesce($gender, p.gender),
                p.phone = coalesce($phone, p.phone),
                p.email = coalesce($email, p.email)
            """,
            patient_id=patient_id,
            name=request.name.strip() if request.name is not None else None,
            birth_date=request.birth_date.strip() if request.birth_date is not None else None,
            gender=request.gender.strip() if request.gender is not None else None,
            phone=request.phone.strip() if request.phone is not None else None,
            email=request.email.strip() if request.email is not None else None
        )
        
    def read_tx(tx):
        result = tx.run(
            """
            MATCH (p:Patient {patient_id: $patient_id})
            RETURN p.patient_id AS patient_id,
                   p.name AS name,
                   p.birth_date AS birth_date,
                   p.gender AS gender,
                   p.phone AS phone,
                   p.email AS email
            """,
            patient_id=patient_id
        )
        record = result.single()
        return record.data() if record else None

    try:
        with driver.session() as session:
            if not session.execute_read(check_exists):
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Patient '{patient_id}' not found"
                )
            session.execute_write(write_tx)
            updated = session.execute_read(read_tx)
            return updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failed: {str(e)}"
        )
