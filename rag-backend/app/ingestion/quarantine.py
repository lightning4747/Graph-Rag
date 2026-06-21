import os
import json
import psycopg2

def quarantine_extraction(extraction, errors: list, note_id: str):
    """
    Insert a failed clinical extraction into the PostgreSQL quarantine table.
    Stores the payload as JSONB and errors as a text array.
    """
    dsn = os.environ.get("AUTH_DB_DSN")
    if not dsn:
        raise RuntimeError("AUTH_DB_DSN environment variable is not set")

    # Connect to PostgreSQL
    conn = psycopg2.connect(dsn)
    try:
        with conn.cursor() as cur:
            # Serialize the Pydantic model to a JSON string for JSONB insertion
            payload_dict = extraction.model_dump()
            payload_json = json.dumps(payload_dict)
            
            cur.execute(
                """
                INSERT INTO quarantine_extractions (note_id, extraction_payload, errors, status)
                VALUES (%s, %s, %s, 'pending_review')
                """,
                (note_id, payload_json, errors)
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
