import os
import instructor
from openai import OpenAI
from pydantic import BaseModel, Field
from typing import Literal, Dict

class QueryIntent(BaseModel):
    intent: Literal[
        "drug_interaction_check",
        "dosage_lookup",
        "active_prescriptions_for_patient",
        "contraindication_check",
        "condition_treatment_options",
        "unknown"
    ] = Field(
        description="The classified query intent. If the question does not map cleanly to any of the other five intents, use 'unknown'."
    )
    entities: Dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Extracted entities. Keys must match the intent's expectations:\n"
            "- drug_interaction_check: keys must be exactly 'drug_a' and 'drug_b'\n"
            "- dosage_lookup: keys must be exactly 'drug' and 'condition'\n"
            "- active_prescriptions_for_patient: key must be 'patient_id'\n"
            "- contraindication_check: key must be 'drug'\n"
            "- condition_treatment_options: key must be 'condition'\n"
            "Values should be generic or brand names of medications, condition names, or patient IDs."
        )
    )

# Initialize OpenRouter-compatible client at module level
_openrouter = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ.get("OPENROUTER_API_KEY", "placeholder_key"),
)
_client = instructor.from_openai(_openrouter)

def classify_intent(question: str) -> QueryIntent:
    """
    Classify a clinical query question into one of the known intents and extract entities.
    If the intent cannot be determined, returns 'unknown'.
    """
    prompt = (
        "Classify the following clinical question into exactly one known intent "
        "and extract the entities needed for it. If the question does not clearly fit "
        "any of the known intents, classify it as 'unknown' and return an empty entities dictionary.\n\n"
        f"QUESTION: {question}"
    )
    
    return _client.chat.completions.create(
        model="openai/gpt-4o-mini",
        response_model=QueryIntent,
        max_tokens=1000,
        temperature=0,
        messages=[{
            "role": "user",
            "content": prompt,
        }],
    )
