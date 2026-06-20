import os
import sys
from dotenv import load_dotenv
from neo4j import GraphDatabase

# Load environment variables from root .env if running locally
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

def main():
    uri = os.environ.get("NEO4J_URI")
    user = os.environ.get("NEO4J_USER")
    password = os.environ.get("NEO4J_PASSWORD")
    
    if not all([uri, user, password]):
        print("Error: NEO4J_URI, NEO4J_USER, or NEO4J_PASSWORD not set in environment.")
        sys.exit(1)
        
    print(f"Connecting to Neo4j AuraDB at {uri}...")
    driver = GraphDatabase.driver(uri, auth=(user, password))
    
    constraints = [
        "CREATE CONSTRAINT medication_rxnorm IF NOT EXISTS FOR (m:Medication) REQUIRE m.rxnorm_code IS UNIQUE",
        "CREATE CONSTRAINT condition_id IF NOT EXISTS FOR (c:Condition) REQUIRE c.condition_id IS UNIQUE",
        "CREATE CONSTRAINT labtest_id IF NOT EXISTS FOR (l:LabTest) REQUIRE l.test_id IS UNIQUE",
        "CREATE CONSTRAINT patient_id IF NOT EXISTS FOR (p:Patient) REQUIRE p.patient_id IS UNIQUE",
        "CREATE CONSTRAINT encounter_id IF NOT EXISTS FOR (e:Encounter) REQUIRE e.encounter_id IS UNIQUE",
        "CREATE CONSTRAINT prescription_id IF NOT EXISTS FOR (rx:Prescription) REQUIRE rx.prescription_id IS UNIQUE"
    ]
    
    try:
        with driver.session() as session:
            for constraint in constraints:
                print(f"Running Cypher: {constraint}")
                session.run(constraint)
        print("All Neo4j constraints applied successfully!")
    except Exception as e:
        print(f"Error applying constraints: {e}")
        sys.exit(1)
    finally:
        driver.close()

if __name__ == "__main__":
    main()
