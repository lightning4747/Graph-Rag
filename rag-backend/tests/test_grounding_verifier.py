from app.ingestion.extractor import (
    ExtractedPrescription,
    ExtractedCondition,
    ExtractedObservation,
)
from app.ingestion.grounding_verifier import (
    verify_prescription,
    verify_condition,
    verify_observation,
    verify_entity,
    fuzzy_match,
)

# Dummy seed data for testing
DUMMY_MEDICATIONS = {
    "RXN_855332": {
        "rxnorm_code": "RXN_855332",
        "generic_name": "Metformin",
        "brand_name": "Glucophage",
    },
    "RXN_197361": {
        "rxnorm_code": "RXN_197361",
        "generic_name": "Amlodipine",
        "brand_name": "Norvasc",
    }
}

DUMMY_CONDITIONS = {
    "ICD10_E11": {
        "condition_id": "ICD10_E11",
        "condition_name": "Type 2 Diabetes Mellitus",
    }
}

def test_fuzzy_match():
    # Valid pairs (case insensitive)
    assert fuzzy_match("Metformin", "metformin") is True
    assert fuzzy_match("Metformin", "Metformin 500mg") is True  # token_set_ratio handles subsets
    # Confusable pairs (should fail)
    assert fuzzy_match("Amlodipine", "Amiloride") is False

def test_verify_prescription_success():
    source_text = "The patient was prescribed Metformin 500mg daily. She takes it with breakfast."
    extraction = ExtractedPrescription(
        drug_mentioned_text="Metformin",
        rxnorm_code_guess="RXN_855332",
        dose_amount_text="500mg",
        frequency_text="daily",
        source_sentence="The patient was prescribed Metformin 500mg daily."
    )
    result = verify_prescription(extraction, source_text, DUMMY_MEDICATIONS)
    assert result.passed is True
    assert len(result.errors) == 0
    assert result.confidence == 1.0

def test_verify_prescription_dose_not_in_source():
    source_text = "The patient takes Metformin daily."
    extraction = ExtractedPrescription(
        drug_mentioned_text="Metformin",
        rxnorm_code_guess="RXN_855332",
        dose_amount_text="500mg", # Not verbatim in source
        frequency_text="daily",
        source_sentence="The patient takes Metformin daily."
    )
    result = verify_prescription(extraction, source_text, DUMMY_MEDICATIONS)
    assert result.passed is False
    assert any("Dose '500mg' not found verbatim" in err for err in result.errors)
    assert result.confidence == 0.75  # 3 of 4 checks passed

def test_verify_prescription_sentence_not_in_source():
    source_text = "The patient takes Metformin 500mg."
    extraction = ExtractedPrescription(
        drug_mentioned_text="Metformin",
        rxnorm_code_guess="RXN_855332",
        dose_amount_text="500mg",
        frequency_text="daily",
        source_sentence="The patient takes Lisinopril." # Not in source
    )
    result = verify_prescription(extraction, source_text, DUMMY_MEDICATIONS)
    assert result.passed is False
    assert any("Cited sentence does not exist in source" in err for err in result.errors)

def test_verify_prescription_code_not_in_seed():
    source_text = "The patient takes Lisinopril 10mg daily. The patient takes Lisinopril."
    extraction = ExtractedPrescription(
        drug_mentioned_text="Lisinopril",
        rxnorm_code_guess="RXN_6809", # Valid code but not in DUMMY_MEDICATIONS lookup
        dose_amount_text="10mg",
        frequency_text="daily",
        source_sentence="The patient takes Lisinopril 10mg daily."
    )
    result = verify_prescription(extraction, source_text, DUMMY_MEDICATIONS)
    assert result.passed is False
    assert any("not in seed dictionary" in err for err in result.errors)

def test_verify_prescription_drug_mismatch():
    source_text = "The patient was prescribed Amlodipine 5mg. The patient was prescribed Amlodipine 5mg."
    extraction = ExtractedPrescription(
        drug_mentioned_text="Amiloride", # Mismatch with Amlodipine generic name
        rxnorm_code_guess="RXN_197361",
        dose_amount_text="5mg",
        frequency_text="QD",
        source_sentence="The patient was prescribed Amlodipine 5mg."
    )
    result = verify_prescription(extraction, source_text, DUMMY_MEDICATIONS)
    assert result.passed is False
    assert any("does not match seed entry" in err for err in result.errors)

def test_verify_prescription_missing_code():
    source_text = "The patient was prescribed Metformin 500mg. The patient was prescribed Metformin 500mg."
    extraction = ExtractedPrescription(
        drug_mentioned_text="Metformin",
        rxnorm_code_guess=None,
        dose_amount_text="500mg",
        frequency_text="daily",
        source_sentence="The patient was prescribed Metformin 500mg."
    )
    result = verify_prescription(extraction, source_text, DUMMY_MEDICATIONS)
    assert result.passed is False
    assert any("No rxnorm_code_guess provided" in err for err in result.errors)

def test_verify_condition_success():
    source_text = "Patient was diagnosed with Type 2 Diabetes Mellitus."
    extraction = ExtractedCondition(
        condition_mentioned_text="Type 2 Diabetes Mellitus",
        icd10_guess="ICD10_E11",
        source_sentence="Patient was diagnosed with Type 2 Diabetes Mellitus."
    )
    result = verify_condition(extraction, source_text, DUMMY_CONDITIONS)
    assert result.passed is True
    assert len(result.errors) == 0
    assert result.confidence == 1.0

def test_verify_observation_success():
    source_text = "Vitals check showed blood pressure of 145/92 mmHg."
    extraction = ExtractedObservation(
        observation_type="Vitals",
        value_text="145/92 mmHg",
        source_sentence="Vitals check showed blood pressure of 145/92 mmHg."
    )
    result = verify_observation(extraction, source_text)
    assert result.passed is True
    assert result.confidence == 1.0

def test_verify_entity_dispatcher():
    source_text = "The patient was prescribed Metformin 500mg daily. She takes it with breakfast."
    rx_extraction = ExtractedPrescription(
        drug_mentioned_text="Metformin",
        rxnorm_code_guess="RXN_855332",
        dose_amount_text="500mg",
        frequency_text="daily",
        source_sentence="The patient was prescribed Metformin 500mg daily."
    )
    lookups = {
        "medications": DUMMY_MEDICATIONS,
        "conditions": DUMMY_CONDITIONS,
    }
    result = verify_entity(rx_extraction, source_text, lookups)
    assert result.passed is True
    assert result.confidence == 1.0
