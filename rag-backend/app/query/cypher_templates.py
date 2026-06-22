import os
from neo4j import GraphDatabase
from app.query.intent_classifier import QueryIntent

# Expected entity keys per intent as defined in plan.md
REQUIRED_ENTITIES = {
    "drug_interaction_check": {"drug_a", "drug_b"},
    "dosage_lookup": {"drug", "condition"},
    "active_prescriptions_for_patient": {"patient_id"},
    "contraindication_check": {"drug"},
    "condition_treatment_options": {"condition"},
}

# Parameters matching is done case-insensitively using toLower for robust user queries
CYPHER_TEMPLATES = {
    "drug_interaction_check": """
        MATCH (m1:Medication)-[i:INTERACTS_WITH]-(m2:Medication)
        WHERE (toLower(m1.generic_name) CONTAINS toLower($drug_a) OR toLower($drug_a) CONTAINS toLower(m1.generic_name))
          AND (toLower(m2.generic_name) CONTAINS toLower($drug_b) OR toLower($drug_b) CONTAINS toLower(m2.generic_name))
        RETURN m1.generic_name AS drug_a, m2.generic_name AS drug_b,
               i.severity AS severity, i.mechanism AS mechanism,
               i.fda_warning AS warning, i.source_id AS source
    """,
    "dosage_lookup": """
        MATCH (m:Medication)-[t:CLINICALLY_TREATS]->(c:Condition)
        WHERE (toLower(m.generic_name) CONTAINS toLower($drug) OR toLower($drug) CONTAINS toLower(m.generic_name))
          AND (toLower(c.name) CONTAINS toLower($condition) OR toLower($condition) CONTAINS toLower(c.name))
        RETURN m.generic_name AS drug, t.base_dosage AS base_dosage,
               t.max_daily_limit AS max_daily_limit, t.frequency AS frequency,
               t.route AS route
    """,
    "active_prescriptions_for_patient": """
        MATCH (p:Patient)-[:HAD_ENCOUNTER]->(:Encounter)
              -[:RESULTED_IN]->(rx:Prescription {status: 'Active'})-[:SPECIFIES_DRUG]->(m:Medication)
        WHERE toLower(p.patient_id) = toLower($patient_id)
        RETURN m.generic_name AS drug, rx.dose_amount AS dose,
               rx.frequency AS frequency, rx.start_date AS start_date
    """,
    "contraindication_check": """
        MATCH (m:Medication)-[:CONTRAINDICATED_BY]->(lt:LabTest)
        WHERE toLower(m.generic_name) CONTAINS toLower($drug) OR toLower($drug) CONTAINS toLower(m.generic_name)
        RETURN m.generic_name AS drug, lt.test_name AS test, lt.normal_range AS normal_range
    """,
    "condition_treatment_options": """
        MATCH (c:Condition)<-[t:CLINICALLY_TREATS]-(m:Medication)
        WHERE toLower(c.name) CONTAINS toLower($condition) OR toLower($condition) CONTAINS toLower(c.name)
        RETURN m.generic_name AS drug, t.base_dosage AS base_dosage,
               t.max_daily_limit AS max_daily_limit, t.route AS route
    """,
}

# Initialize Neo4j driver at module level
uri = os.environ.get("NEO4J_URI")
user = os.environ.get("NEO4J_USER")
password = os.environ.get("NEO4J_PASSWORD")

driver = None
if uri and user and password:
    driver = GraphDatabase.driver(uri, auth=(user, password))
else:
    print("Warning: Neo4j credentials missing in environment. Driver not initialized in cypher_templates.")

def validate_entities(intent: QueryIntent) -> str | None:
    """
    Validate that all required entity keys are present in the intent's entities dict.
    Returns None if validation passes, or an error description string on failure.
    """
    required_keys = REQUIRED_ENTITIES.get(intent.intent)
    if not required_keys:
        return None
        
    for key in required_keys:
        if key not in intent.entities or not intent.entities[key]:
            return f"Missing required entity '{key}' for intent '{intent.intent}'"
            
    return None

def execute_template(intent: QueryIntent) -> list[dict]:
    """
    Execute the hand-written parameterized Cypher query mapped to the intent.
    Saves database values strictly in parameters.
    """
    if not driver:
        raise RuntimeError("Neo4j driver is not initialized")
        
    template = CYPHER_TEMPLATES.get(intent.intent)
    if not template:
        raise ValueError(f"No Cypher template mapped to intent: {intent.intent}")
        
    with driver.session() as session:
        result = session.run(template, **intent.entities)
        return [record.data() for record in result]
