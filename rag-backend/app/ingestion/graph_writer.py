import os
from neo4j import GraphDatabase
from app.ingestion.extractor import (
    ExtractedPrescription,
    ExtractedCondition,
    ExtractedObservation,
)

# Initialize Neo4j driver at module level
uri = os.environ.get("NEO4J_URI")
user = os.environ.get("NEO4J_USER")
password = os.environ.get("NEO4J_PASSWORD")

driver = None
if uri and user and password:
    driver = GraphDatabase.driver(uri, auth=(user, password))
else:
    print("Warning: Neo4j credentials missing in environment. Driver not initialized.")

def write_encounter_and_patient(
    patient_id: str,
    encounter_id: str,
    encounter_date: str,
    encounter_type: str,
):
    """MERGE Patient and Encounter nodes and link them."""
    if not driver:
        raise RuntimeError("Neo4j driver is not initialized")
    
    with driver.session() as session:
        session.run(
            """
            MERGE (p:Patient {patient_id: $patient_id})
            MERGE (e:Encounter {encounter_id: $encounter_id})
              ON CREATE SET e.visit_date      = date($encounter_date),
                            e.encounter_type  = $encounter_type
            MERGE (p)-[:HAD_ENCOUNTER]->(e)
            """,
            patient_id=patient_id,
            encounter_id=encounter_id,
            encounter_date=encounter_date,
            encounter_type=encounter_type,
        )

def write_prescription(
    extraction: ExtractedPrescription,
    encounter_id: str,
    confidence: float,
):
    """Write verified Prescription and link to static Medication node."""
    if not driver:
        raise RuntimeError("Neo4j driver is not initialized")
        
    with driver.session() as session:
        session.run(
            """
            MATCH (m:Medication {rxnorm_code: $rxnorm_code})
            MATCH (e:Encounter {encounter_id: $encounter_id})
            CREATE (rx:Prescription {
                prescription_id: randomUUID(),
                dose_amount: $dose_amount,
                frequency: $frequency,
                status: 'Active',
                source_sentence: $source_sentence,
                extraction_method: 'llm_verified',
                extraction_confidence: $confidence,
                verified_by: 'system'
            })
            CREATE (e)-[:RESULTED_IN]->(rx)
            CREATE (rx)-[:SPECIFIES_DRUG]->(m)
            """,
            rxnorm_code=extraction.rxnorm_code_guess,
            encounter_id=encounter_id,
            dose_amount=extraction.dose_amount_text,
            frequency=extraction.frequency_text,
            source_sentence=extraction.source_sentence,
            confidence=confidence,
        )

def write_condition_link(
    extraction: ExtractedCondition,
    encounter_id: str,
    confidence: float,
):
    """Write verified Condition link to static Condition node."""
    if not driver:
        raise RuntimeError("Neo4j driver is not initialized")
        
    with driver.session() as session:
        session.run(
            """
            MATCH (c:Condition {condition_id: $icd10_code})
            MATCH (e:Encounter {encounter_id: $encounter_id})
            CREATE (obs:Observation {
                observation_id: randomUUID(),
                type: 'Diagnosis',
                value: $condition_text,
                source_sentence: $source_sentence,
                extraction_method: 'llm_verified',
                extraction_confidence: $confidence
            })
            CREATE (e)-[:RECORDED]->(obs)
            CREATE (obs)-[:CONFIRMS_DIAGNOSIS]->(c)
            """,
            icd10_code=extraction.icd10_guess,
            encounter_id=encounter_id,
            condition_text=extraction.condition_mentioned_text,
            source_sentence=extraction.source_sentence,
            confidence=confidence,
        )

def write_observation(
    extraction: ExtractedObservation,
    encounter_id: str,
    confidence: float,
):
    """Write verified generic Observation and link to Encounter."""
    if not driver:
        raise RuntimeError("Neo4j driver is not initialized")
        
    with driver.session() as session:
        session.run(
            """
            MATCH (e:Encounter {encounter_id: $encounter_id})
            CREATE (obs:Observation {
                observation_id: randomUUID(),
                type: $obs_type,
                value: $value,
                source_sentence: $source_sentence,
                extraction_method: 'llm_verified',
                extraction_confidence: $confidence
            })
            CREATE (e)-[:RECORDED]->(obs)
            """,
            encounter_id=encounter_id,
            obs_type=extraction.observation_type,
            value=extraction.value_text,
            source_sentence=extraction.source_sentence,
            confidence=confidence,
        )
