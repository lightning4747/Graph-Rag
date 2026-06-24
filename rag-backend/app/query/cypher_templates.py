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
    if not driver:
        raise RuntimeError("Neo4j driver is not initialized")
    with driver.session() as session:
        result = session.run(query, **params)
        return [record.data() for record in result]

