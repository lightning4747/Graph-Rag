import os
import instructor
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Dict, Any

class DynamicCypher(BaseModel):
    cypher_query: str = Field(
        description="The executable Neo4j Cypher query to retrieve exactly the facts needed to answer the user's question."
    )
    parameters: Dict[str, Any] = Field(
        default_factory=dict,
        description="Parameters referenced in the Cypher query (e.g. {'drug': 'Metformin', 'patient_id': 'CASE_9942A'}). Keys must match exactly."
    )
    intent: str = Field(
        description="One of the known intents: 'drug_interaction_check', 'dosage_lookup', 'active_prescriptions_for_patient', 'contraindication_check', 'condition_treatment_options', or 'unknown'."
    )

# Initialize OpenRouter-compatible client
_openrouter = OpenAI(
    base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api"),
    api_key=os.environ.get("OPENROUTER_API_KEY", "placeholder_key"),
)
_client = instructor.from_openai(_openrouter)

SCHEMA_PROMPT = """
You are a clinical database assistant. Given a user's question, write a Neo4j Cypher query to retrieve the necessary facts to answer the question.
The Cypher query must be executable and return relevant nodes or properties.

Here is the database schema:
Nodes:
- Medication {rxnorm_code, generic_name, brand_name, availability_status, fda_pregnancy_category, drug_class}
- Condition {condition_id, name, clinical_status}
- Patient {patient_id}
- Encounter {encounter_id, date, type}
- Prescription {prescription_id, dose_amount, frequency, start_date, status}
- LabTest {test_id, test_name, normal_range}

Relationships:
- (:Medication)-[:CLINICALLY_TREATS]->(:Condition) with properties: {base_dosage, frequency, max_daily_limit, route}
- (:Medication)-[:INTERACTS_WITH]-(:Medication) with properties: {severity, mechanism, source_id, fda_warning}
- (:Patient)-[:HAD_ENCOUNTER]->(:Encounter)
- (:Encounter)-[:RESULTED_IN]->(:Prescription)
- (:Prescription)-[:SPECIFIES_DRUG]->(:Medication)
- (:Medication)-[:CONTRAINDICATED_BY]->(:LabTest)

Constraints & rules:
1. Make parameter matching case-insensitive using toLower() (e.g., toLower(m.generic_name) CONTAINS toLower($drug) or toLower($drug) CONTAINS toLower(m.generic_name)).
2. Return properties with aliases. Make sure to bind relationships to variables (e.g. `-[t:CLINICALLY_TREATS]->`, `-[i:INTERACTS_WITH]-`) when returning their properties (e.g. `t.base_dosage AS base_dosage`, `i.severity AS severity`).
3. If the query does not map to any logical schema query, set intent='unknown', cypher_query='', and parameters={}.
"""

def generate_cypher(question: str, patient_id: str | None = None) -> DynamicCypher:
    """
    Generate a Cypher query dynamically based on the clinical question.
    """
    prompt = (
        f"{SCHEMA_PROMPT}\n\n"
        f"QUESTION: {question}\n"
    )
    if patient_id:
        prompt += f"PASSED PATIENT ID: {patient_id}\n"

    try:
        result = _client.chat.completions.create(
            model="openrouter/owl-alpha",
            response_model=DynamicCypher,
            temperature=0,
            messages=[{
                "role": "user",
                "content": prompt,
            }],
        )
    except Exception:
        return DynamicCypher(intent="unknown", cypher_query="", parameters={})

    ALLOWED_INTENTS = {
        "drug_interaction_check",
        "dosage_lookup",
        "active_prescriptions_for_patient",
        "contraindication_check",
        "condition_treatment_options"
    }

    if result.intent not in ALLOWED_INTENTS or not result.cypher_query:
        result.intent = "unknown"
        result.cypher_query = ""
        result.parameters = {}

    return result
