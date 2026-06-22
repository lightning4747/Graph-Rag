import re
import json
from app.query.response_generator import generate_response

def normalize_number_units(text: str) -> str:
    """
    Remove spaces between digits and common medical units (e.g. '500 mg' -> '500mg')
    and convert to lowercase to make numeric comparisons robust.
    """
    if not text:
        return ""
    # Collapse spaces between numbers and units (mg, ml, %)
    return re.sub(r"(\d+(?:\.\d+)?)\s*(mg|ml|%)", r"\1\2", text.lower())

def verify_response_numbers(response_text: str, source_facts: list[dict]) -> tuple[bool, set]:
    """
    Verify that every number (with or without units) in the response text is present in the source facts.
    Returns (True, set()) if verified, or (False, hallucinated_numbers) if any discrepancies are found.
    """
    normalized_response = normalize_number_units(response_text)
    normalized_facts = normalize_number_units(json.dumps(source_facts))
    
    # Match numbers optionally followed by mg, ml, or %
    pattern = r"\d+(?:\.\d+)?(?:mg|ml|%)?"
    
    response_numbers = set(re.findall(pattern, normalized_response))
    fact_numbers = set(re.findall(pattern, normalized_facts))
    
    # Find any numbers in the response that do not exist in the source facts
    hallucinated = response_numbers - fact_numbers
    
    return len(hallucinated) == 0, hallucinated

def safe_respond(facts: list[dict], intent: str) -> dict:
    """
    Orchestrate generating a natural language summary and performing post-hoc verification.
    If the response passes numeric checks, returns type='generated', else returns type='fallback_raw_facts'.
    """
    draft = generate_response(facts, intent)
    passed, bad_numbers = verify_response_numbers(draft, facts)
    
    if passed:
        return {
            "type": "generated",
            "text": draft,
            "facts": facts,
            "intent": intent
        }
    else:
        return {
            "type": "fallback_raw_facts",
            "text": "Unable to confidently phrase a summary — showing verified data directly.",
            "facts": facts,
            "intent": intent
        }
