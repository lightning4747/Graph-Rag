import os
from neo4j import GraphDatabase

# Initialize Neo4j driver at module level
uri = os.environ.get("NEO4J_URI")
user = os.environ.get("NEO4J_USER")
password = os.environ.get("NEO4J_PASSWORD")

driver = None
if uri and user and password:
    driver = GraphDatabase.driver(uri, auth=(user, password))
else:
    print("Warning: Neo4j credentials missing in environment. Driver not initialized in cypher_templates.")

def execute_dynamic_cypher(query: str, params: dict) -> list[dict]:
    """
    Execute a dynamically generated Cypher query with parameters.
    """
    # Safety gate: reject any query containing write or procedure invocation patterns
    import re
    write_patterns = r"\b(create|merge|set|delete|detach|remove|call)\b"
    if re.search(write_patterns, query, re.IGNORECASE):
        raise ValueError("Unsafe Cypher query rejected: write or procedure execution patterns are disallowed.")

    if not driver:
        raise RuntimeError("Neo4j driver is not initialized")

        
    def read_tx(tx):
        result = tx.run(query, **params)
        return [record.data() for record in result]

    with driver.session(default_access_mode="READ") as session:
        return session.execute_read(read_tx)


