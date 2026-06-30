from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.ingestion.router import router as ingestion_router
from app.query.router import router as query_router
from app.ingestion.quarantine_router import router as quarantine_router
from app.patients.router import router as patients_router

app = FastAPI(
    title="Clinical GraphRAG Backend",
    description="FastAPI Backend for Hallucination-Resistant Clinical GraphRAG",
    version="1.0.0"
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Local development CORS policy (behind Nginx proxy)
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingestion_router, prefix="/api/v1/ingest", tags=["Ingestion"])
app.include_router(query_router, prefix="/api/v1/query", tags=["Query"])
app.include_router(quarantine_router, prefix="/api/v1/quarantine", tags=["Quarantine"])
app.include_router(patients_router, prefix="/api/v1/patients", tags=["Patients"])

@app.get("/")
def read_root():
    return {
        "status": "online",
        "service": "Clinical GraphRAG Backend",
        "message": "Clinical GraphRAG API is running"
    }
