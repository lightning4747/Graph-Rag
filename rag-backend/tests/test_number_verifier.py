import pytest
from app.query.number_verifier import verify_response_numbers, safe_respond

# Test cases for verify_response_numbers
def test_verify_response_numbers_exact_match():
    draft = "Metformin is dosed at 500mg BID, with a max limit of 2000mg."
    facts = [{"base_dosage": "500mg", "max_daily_limit": "2000mg"}]
    passed, hallucinated = verify_response_numbers(draft, facts)
    assert passed is True
    assert len(hallucinated) == 0

def test_verify_response_numbers_hallucination():
    draft = "Metformin has a max limit of 2500mg daily."
    facts = [{"base_dosage": "500mg", "max_daily_limit": "2000mg"}]
    passed, hallucinated = verify_response_numbers(draft, facts)
    assert passed is False
    assert "2500mg" in hallucinated or "2500" in hallucinated

def test_verify_response_numbers_no_numbers():
    draft = "The drug is given BID via oral route."
    facts = [{"route": "oral", "frequency": "BID"}]
    passed, hallucinated = verify_response_numbers(draft, facts)
    assert passed is True
    assert len(hallucinated) == 0

def test_verify_response_numbers_valid_with_units():
    draft = "The dose is 5mg daily."
    facts = [{"dose": "5mg"}]
    passed, hallucinated = verify_response_numbers(draft, facts)
    assert passed is True
    assert len(hallucinated) == 0

def test_verify_response_numbers_hallucination_float():
    draft = "The dose is 5.5mg daily."
    facts = [{"dose": "5mg"}]
    passed, hallucinated = verify_response_numbers(draft, facts)
    assert passed is False
    assert "5.5mg" in hallucinated or "5.5" in hallucinated

def test_verify_response_numbers_whitespace_tolerance():
    # Draft has space, facts do not
    draft = "Take 500 mg twice daily."
    facts = [{"dose": "500mg"}]
    passed, hallucinated = verify_response_numbers(draft, facts)
    assert passed is True
    
    # Facts have space, draft does not
    draft = "Take 500mg twice daily."
    facts = [{"dose": "500 mg"}]
    passed, hallucinated = verify_response_numbers(draft, facts)
    assert passed is True

def test_verify_response_numbers_casing_tolerance():
    draft = "Take 500MG twice daily."
    facts = [{"dose": "500mg"}]
    passed, hallucinated = verify_response_numbers(draft, facts)
    assert passed is True

# Test safe_respond with mocked generation
def test_safe_respond_passes(monkeypatch):
    # Mock generate_response to return a valid draft
    monkeypatch.setattr(
        "app.query.number_verifier.generate_response",
        lambda facts, intent: "The dose is 500mg."
    )
    facts = [{"dose": "500mg"}]
    res = safe_respond(facts, "dosage_lookup")
    assert res["type"] == "generated"
    assert res["text"] == "The dose is 500mg."
    assert res["facts"] == facts

def test_safe_respond_fails_and_falls_back(monkeypatch):
    # Mock generate_response to return a hallucinated draft
    monkeypatch.setattr(
        "app.query.number_verifier.generate_response",
        lambda facts, intent: "The dose is 1000mg."
    )
    facts = [{"dose": "500mg"}]
    res = safe_respond(facts, "dosage_lookup")
    assert res["type"] == "fallback_raw_facts"
    assert "Unable to confidently phrase a summary" in res["text"]
    assert res["facts"] == facts
