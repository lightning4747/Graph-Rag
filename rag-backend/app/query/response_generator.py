import os
import json
from openai import OpenAI

# Initialize OpenRouter-compatible client for plain generation
_openrouter = OpenAI(
    base_url=os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api"),
    api_key=os.environ.get("OPENROUTER_API_KEY") or "placeholder_key",
)
_openai = _openrouter

def generate_response(facts: list[dict], intent: str) -> str:
    """
    Generate a one or two sentence clinical answer based ONLY on the structured facts.
    Strictly forbids introducing, rounding, or inferring any numeric values not present in the facts.
    """
    if not facts:
        return "No factual records found matching your query."
        
    prompt = (
        "Using ONLY the facts in the JSON below, write a one or two "
        "sentence clinical answer. Every numeric value you state must "
        "appear verbatim in the facts. Do not add, round, infer, or "
        "convert units for any number not explicitly present. Include "
        f"the source reference if one is present.\n\nFACTS: {json.dumps(facts)}"
    )
    
    response = _openai.chat.completions.create(
        model="openrouter/owl-alpha",
        temperature=0,
        messages=[{
            "role": "user",
            "content": prompt,
        }],
    )
    
    return response.choices[0].message.content.strip()
