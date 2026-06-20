# main.py placeholder
from fastapi import FastAPI

app = FastAPI(title="Clinical GraphRAG Backend")

@app.get("/")
def read_root():
    return {"message": "Clinical GraphRAG API"}
