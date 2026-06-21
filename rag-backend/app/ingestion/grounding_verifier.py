import os
import json
from dataclasses import dataclass
from typing import List
from rapidfuzz import fuzz
from app.ingestion.extractor import (
    ExtractedPrescription,
    ExtractedCondition,
    ExtractedObservation,
)

@dataclass
class VerificationResult:
    passed: bool
    errors: List[str]
    confidence: float

# Helper to load seed ontology data
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SEED_DATA_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", "seed_data"))

def load_seed_json(filename: str):
    path = os.path.join(SEED_DATA_DIR, filename)
    if not os.path.exists(path):
        # Fallback for alternative environments or test runners
        alternate_path = os.path.abspath(os.path.join(os.getcwd(), "seed_data", filename))
        if os.path.exists(alternate_path):
            path = alternate_path
    
    with open(path, "r") as f:
        return json.load(f)

# Load lookups at module startup
try:
    medications_list = load_seed_json("medications.json")
    medications_lookup = {item["rxnorm_code"]: item for item in medications_list}
except Exception as e:
    print(f"Warning: Could not load medications seed data: {e}")
    medications_lookup = {}

try:
    conditions_list = load_seed_json("treatments.json")
    conditions_lookup = {item["condition_id"]: item for item in conditions_list}
except Exception as e:
    print(f"Warning: Could not load conditions seed data: {e}")
    conditions_lookup = {}

def fuzzy_match(a: str, b: str) -> bool:
    """Fuzzy match string comparison using rapidfuzz token_set_ratio."""
    if not a or not b:
        return False
    return fuzz.token_set_ratio(a.lower(), b.lower()) >= 85

def normalize_whitespace(text: str) -> str:
    """Normalize whitespace by collapsing consecutive spaces, newlines, and tabs into a single space."""
    if not text:
        return ""
    return " ".join(text.split())

def verify_prescription(
    extraction: ExtractedPrescription,
    source_text: str,
    medications_dict: dict = None,
) -> VerificationResult:
    """Verify prescription extraction against source text and static ontology."""
    if medications_dict is None:
        medications_dict = medications_lookup

    errors = []
    checks_passed = 0
    
    normalized_source = normalize_whitespace(source_text)
    normalized_dose = normalize_whitespace(extraction.dose_amount_text)
    normalized_sentence = normalize_whitespace(extraction.source_sentence)

    # 1. Verbatim check: dose amount in source text
    if extraction.dose_amount_text and normalized_dose in normalized_source:
        checks_passed += 1
    else:
        errors.append(f"Dose '{extraction.dose_amount_text}' not found verbatim in source")

    # 2. Verbatim check: source sentence in source text
    if extraction.source_sentence and normalized_sentence in normalized_source:
        checks_passed += 1
    else:
        errors.append("Cited sentence does not exist in source document")

    # 3. Code cross-reference check
    known_drug = None
    if extraction.rxnorm_code_guess:
        known_drug = medications_dict.get(extraction.rxnorm_code_guess)
        if known_drug:
            checks_passed += 1
        else:
            errors.append(f"RxNorm code {extraction.rxnorm_code_guess} not in seed dictionary")
    else:
        errors.append("No rxnorm_code_guess provided — cannot resolve to known medication")

    # 4. Fuzzy generic name match
    if known_drug:
        if fuzzy_match(known_drug["generic_name"], extraction.drug_mentioned_text):
            checks_passed += 1
        else:
            errors.append(
                f"Mentioned drug '{extraction.drug_mentioned_text}' does not match "
                f"seed entry '{known_drug['generic_name']}' for that code"
            )
    else:
        # If code was invalid or missing, fuzzy check fails automatically
        pass

    confidence = checks_passed / 4.0
    return VerificationResult(passed=len(errors) == 0, errors=errors, confidence=confidence)

def verify_condition(
    extraction: ExtractedCondition,
    source_text: str,
    conditions_dict: dict = None,
) -> VerificationResult:
    """Verify condition extraction against source text and static ontology."""
    if conditions_dict is None:
        conditions_dict = conditions_lookup

    errors = []
    checks_passed = 0

    normalized_source = normalize_whitespace(source_text)
    normalized_sentence = normalize_whitespace(extraction.source_sentence)

    # 1. Verbatim check: source sentence in source text
    if extraction.source_sentence and normalized_sentence in normalized_source:
        checks_passed += 1
    else:
        errors.append("Cited sentence does not exist in source document")

    # 2. Code cross-reference check
    known_condition = None
    if extraction.icd10_guess:
        known_condition = conditions_dict.get(extraction.icd10_guess)
        if known_condition:
            checks_passed += 1
        else:
            errors.append(f"ICD-10 code {extraction.icd10_guess} not in seed dictionary")
    else:
        errors.append("No icd10_guess provided — cannot resolve to known condition")

    # 3. Fuzzy condition name match
    if known_condition:
        if fuzzy_match(known_condition["condition_name"], extraction.condition_mentioned_text):
            checks_passed += 1
        else:
            errors.append(
                f"Mentioned condition '{extraction.condition_mentioned_text}' does not match "
                f"seed entry '{known_condition['condition_name']}' for that code"
            )
    else:
        pass

    confidence = checks_passed / 3.0
    return VerificationResult(passed=len(errors) == 0, errors=errors, confidence=confidence)

def verify_observation(
    extraction: ExtractedObservation,
    source_text: str,
) -> VerificationResult:
    """Verify observation extraction verbatim checks only."""
    errors = []
    has_source_sentence = False
    has_value_text = False

    normalized_source = normalize_whitespace(source_text)
    normalized_sentence = normalize_whitespace(extraction.source_sentence)
    normalized_value = normalize_whitespace(extraction.value_text)

    # 1. Verbatim check: source sentence in source text
    if extraction.source_sentence and normalized_sentence in normalized_source:
        has_source_sentence = True
    else:
        errors.append("Cited sentence does not exist in source document")

    # 2. Verbatim check: value in source text
    if extraction.value_text and normalized_value in normalized_source:
        has_value_text = True
    else:
        errors.append(f"Observation value '{extraction.value_text}' not found verbatim in source")

    # Confidence logic
    if has_source_sentence and has_value_text:
        confidence = 1.0
    elif has_source_sentence:
        confidence = 0.5
    else:
        confidence = 0.0

    return VerificationResult(passed=len(errors) == 0, errors=errors, confidence=confidence)

def verify_entity(extraction, source_text: str, lookups: dict = None) -> VerificationResult:
    """Dispatch verification request to the appropriate verifier function based on type."""
    if lookups is None:
        lookups = {
            "medications": medications_lookup,
            "conditions": conditions_lookup,
        }
    
    if isinstance(extraction, ExtractedPrescription):
        return verify_prescription(extraction, source_text, lookups.get("medications"))
    elif isinstance(extraction, ExtractedCondition):
        return verify_condition(extraction, source_text, lookups.get("conditions"))
    elif isinstance(extraction, ExtractedObservation):
        return verify_observation(extraction, source_text)
    else:
        raise ValueError(f"Unknown extraction type: {type(extraction)}")
