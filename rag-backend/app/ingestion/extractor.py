import os
import instructor
from openai import OpenAI
from pydantic import BaseModel
from typing import Literal, Optional, List

class ExtractedPrescription(BaseModel):
    drug_mentioned_text: str          # verbatim substring from the note
    rxnorm_code_guess: Optional[str]  # LLM's best guess — NOT trusted yet
    dose_amount_text: str             # verbatim, e.g. "500mg"
    frequency_text: str               # verbatim, e.g. "BID"
    source_sentence: str              # exact sentence it was taken from

class ExtractedCondition(BaseModel):
    condition_mentioned_text: str
    icd10_guess: Optional[str]
    source_sentence: str

class ExtractedObservation(BaseModel):
    observation_type: Literal["Symptom", "LabResult", "Vitals"]  # enforced by instructor
    value_text: str                   # verbatim, e.g. "145/92 mmHg"
    source_sentence: str

class ExtractionResult(BaseModel):
    prescriptions: List[ExtractedPrescription]
    conditions: List[ExtractedCondition]
    observations: List[ExtractedObservation]

# Initialize OpenRouter-compatible client at module level
_openrouter = OpenAI(
    base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.environ.get("OPENROUTER_API_KEY") or "placeholder_key",
)
_client = instructor.from_openai(_openrouter)
_openai = _openrouter

def extract_structured(note_text: str) -> ExtractionResult:
    """
    Extract structured clinical entities from raw text using structured outputs.
    Instructs the model to quote verbatim and not paraphrase or guess.
    """
    prompt = (
        "Extract clinical entities from the note below. For every field "
        "marked 'verbatim' (such as drug_mentioned_text, dose_amount_text, value_text, condition_mentioned_text, and source_sentence), "
        "copy the exact text span from the source — do not paraphrase, normalize units, or infer values "
        "not explicitly written. If a value is not explicitly stated, omit that entity entirely "
        "rather than guessing. For non-verbatim code guess fields (rxnorm_code_guess and icd10_guess), "
        "provide your best clinical guess (e.g., RXN_197361 for Amlodipine, ICD10_E11 for Type 2 Diabetes) "
        "based on the name of the drug or condition.\n"
        "CLASSIFICATION RULE: Categorize symptoms or patient complaints (e.g. polyuria, polydipsia, headache) as ExtractedObservation with observation_type='Symptom'. Only classify actual diagnosed clinical conditions or chronic diseases (e.g. Diabetes, Hypertension) as ExtractedCondition.\n\n"
        "NOTE:\n" + note_text
    )
    
    return _client.chat.completions.create(
        model="meta-llama/llama-3.3-70b-instruct",
        response_model=ExtractionResult,
        temperature=0,
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": prompt,
        }],
    )
