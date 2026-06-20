import os
import json
import sys
from dotenv import load_dotenv
from neo4j import GraphDatabase

# Load environment variables from root .env if running locally
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

def get_db_summary(session):
    meds_count = session.run("MATCH (m:Medication) RETURN count(m) AS c").single()["c"]
    conds_count = session.run("MATCH (c:Condition) RETURN count(c) AS c").single()["c"]
    treats_count = session.run("MATCH ()-[r:CLINICALLY_TREATS]->() RETURN count(r) AS c").single()["c"]
    inter_count = session.run("MATCH ()-[r:INTERACTS_WITH]->() RETURN count(r) AS c").single()["c"]
    
    return {
        "Medication": meds_count,
        "Condition": conds_count,
        "CLINICALLY_TREATS": treats_count,
        "INTERACTS_WITH": inter_count
    }

def main():
    uri = os.environ.get("NEO4J_URI")
    user = os.environ.get("NEO4J_USER")
    password = os.environ.get("NEO4J_PASSWORD")
    
    if not all([uri, user, password]):
        print("Error: NEO4J_URI, NEO4J_USER, or NEO4J_PASSWORD not set in environment.")
        sys.exit(1)
        
    script_dir = os.path.dirname(os.path.abspath(__file__))
    seed_dir = os.path.join(script_dir, "../seed_data")
    
    # Load JSON files
    with open(os.path.join(seed_dir, "medications.json"), "r") as f:
        meds = json.load(f)
    with open(os.path.join(seed_dir, "treatments.json"), "r") as f:
        treatments_data = json.load(f)
    with open(os.path.join(seed_dir, "interactions.json"), "r") as f:
        interactions = json.load(f)
        
    print(f"Connecting to Neo4j AuraDB at {uri}...")
    driver = GraphDatabase.driver(uri, auth=(user, password))
    
    try:
        with driver.session() as session:
            print("Before Seeding:")
            summary_before = get_db_summary(session)
            print(f"  Nodes: Medication={summary_before['Medication']}, Condition={summary_before['Condition']}")
            print(f"  Relationships: CLINICALLY_TREATS={summary_before['CLINICALLY_TREATS']}, INTERACTS_WITH={summary_before['INTERACTS_WITH']}")
            
            # 1. Seed Medications
            print("\nSeeding Medications...")
            for med in meds:
                session.run(
                    """
                    MERGE (m:Medication {rxnorm_code: $rxnorm_code})
                    SET m += $props
                    """,
                    rxnorm_code=med["rxnorm_code"],
                    props={
                        "generic_name": med["generic_name"],
                        "brand_name": med["brand_name"],
                        "drug_class": med["drug_class"],
                        "availability_status": med["availability_status"],
                        "fda_pregnancy_category": med["fda_pregnancy_category"]
                    }
                )
                print(f"  Merged Medication: {med['generic_name']} ({med['rxnorm_code']})")
                
            # 2. Seed Conditions and Treatments
            print("\nSeeding Conditions and Treatments...")
            for condition in treatments_data:
                session.run(
                    """
                    MERGE (c:Condition {condition_id: $condition_id})
                    SET c.name = $name,
                        c.clinical_status = $clinical_status
                    """,
                    condition_id=condition["condition_id"],
                    name=condition["condition_name"],
                    clinical_status=condition["clinical_status"]
                )
                print(f"  Merged Condition: {condition['condition_name']} ({condition['condition_id']})")
                
                for tx in condition["treatments"]:
                    session.run(
                        """
                        MATCH (m:Medication {rxnorm_code: $rxnorm_code})
                        MATCH (c:Condition {condition_id: $condition_id})
                        MERGE (m)-[t:CLINICALLY_TREATS]->(c)
                        SET t += $props
                        """,
                        rxnorm_code=tx["rxnorm_code"],
                        condition_id=condition["condition_id"],
                        props={
                            "base_dosage": tx["base_dosage"],
                            "frequency": tx["frequency"],
                            "max_daily_limit": tx["max_daily_limit"],
                            "route": tx["route"]
                        }
                    )
                    print(f"    Merged CLINICALLY_TREATS: {tx['rxnorm_code']} -> {condition['condition_id']}")
            
            # 3. Seed Interactions
            print("\nSeeding Interactions...")
            for inter in interactions:
                session.run(
                    """
                    MATCH (m1:Medication {rxnorm_code: $drug_a})
                    MATCH (m2:Medication {rxnorm_code: $drug_b})
                    MERGE (m1)-[i:INTERACTS_WITH]-(m2)
                    SET i += $props
                    """,
                    drug_a=inter["drug_a"],
                    drug_b=inter["drug_b"],
                    props={
                        "severity": inter["severity"],
                        "mechanism": inter["mechanism"],
                        "source_id": inter["source_id"],
                        "fda_warning": inter["fda_warning"]
                    }
                )
                print(f"  Merged INTERACTS_WITH between {inter['drug_a']} and {inter['drug_b']}")
                
            print("\nAfter Seeding:")
            summary_after = get_db_summary(session)
            print(f"  Nodes: Medication={summary_after['Medication']}, Condition={summary_after['Condition']}")
            print(f"  Relationships: CLINICALLY_TREATS={summary_after['CLINICALLY_TREATS']}, INTERACTS_WITH={summary_after['INTERACTS_WITH']}")
            
            # Print differences
            nodes_created = (summary_after['Medication'] - summary_before['Medication']) + (summary_after['Condition'] - summary_before['Condition'])
            rels_created = (summary_after['CLINICALLY_TREATS'] - summary_before['CLINICALLY_TREATS']) + (summary_after['INTERACTS_WITH'] - summary_before['INTERACTS_WITH'])
            print(f"\nSummary of changes in this run: Nodes Created={nodes_created}, Relationships Created={rels_created}")
            
    except Exception as e:
        print(f"Error seeding ontology: {e}")
        sys.exit(1)
    finally:
        driver.close()

if __name__ == "__main__":
    main()
