# Clinical GraphRAG

**Clinical GraphRAG** is a specialized Retrieval-Augmented Generation (RAG) system designed to reduce hallucinations in clinical Q&A by grounding LLM responses in a curated knowledge graph and a closed set of trusted documents. The system implements a hallucination-resistant architecture that enforces knowledge-grounded responses through multi-stage verification and a quarantine feedback loop.

## Architecture Overview

The system follows a modular, containerized microservices architecture:

- **`web-frontend`**: Next.js-based user interface with role-based access control, chat interface, and document quarantine review workflow.
- **`rag-backend`**: FastAPI-based AI pipeline responsible for intent classification, retrieval, generation, and verification.
- **`auth-db`**: PostgreSQL database for user authentication and role management.
- **`nginx`**: Reverse proxy for TLS termination and routing.

### Hallucination-Resistant Pipeline

The backend implements a multi-stage verification process to minimize hallucinations:

1. **Intent Classification**: Determines if the query requires knowledge-grounded retrieval (vs. simple navigation or FAQs).
2. **Intent-Aware Retrieval**: Queries the knowledge graph and/or document index based on the identified intent.
3. **Response Generation**: LLM generates a response grounded in the retrieved context.
4. **Number Verification**: Validates numeric extractions (dosages, lab values) against the retrieved graph data.
5. **Response Verification**: Verifies the complete response for factual consistency with the retrieved context before returning to the user.
6. **Quarantine Loop**: Responses flagged as potentially hallucinated are routed to a quarantine area for human review and potential knowledge base enrichment.

## Local Development

### Prerequisites

- Node.js 20 LTS
- Python 3.12
- Docker

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/lightning4747/Graph-Rag
   cd clinical-rag
   ```

2. **Initialize submodules** (if any):
   ```bash
   git submodule update --init --recursive
   ```

3. **Install dependencies**:
   - Frontend: `npm install` in `web-frontend`
   - Backend: `pip install -r rag-backend/requirements.txt` in `rag-backend`

4. **Configure environment**:
   - Copy `.env.example` to `.env` in the project root
   - Fill in the required environment variables (JWT secret, database credentials, etc.)

### Running Services

Use Docker Compose to start the four services:

```bash
docker compose up --build
```

The services will be available at:

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **Nginx**: http://localhost:80

## Testing

### Backend Tests

Run backend unit and integration tests:

```bash
pytest rag-backend/tests/ -v
```

### Frontend Tests

Run frontend type checks:

```bash
cd web-frontend && npx tsc --noEmit
```

## CI/CD

### GitHub Actions

The repository includes GitHub Actions workflows for automated CI:

- **`rag-backend`**: Runs linting and tests on push/pull requests to the main branch.
- **`web-frontend`**: Runs type checks and build verification on push/pull requests.

### Production Deployment

Production deployment is orchestrated through:

- **Cloud Build** → **Artifact Registry**: Builds and stores production container images.
- **Cloud Run**: Deploys the frontend and backend services with autoscaling, managed TLS, and Cloud SQL integration.
- **Cloud SQL**: Managed PostgreSQL instance for the authentication database.

## Configuration

See `.env.example` for required environment variables. Key configuration parameters include:

- **JWT**: `JWT_SHARED_SECRET`, `JWT_ALGORITHM`, `JWT_TOKEN_EXP`
- **Database**: `AUTH_DB_DSN`, `AUTH_DB_PASSWORD`
- **AI**: `OPENAI_API_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`
- **Service URLs**: `RAG_BACKEND_URL`, `WEB_FRONTEND_URL`

## License

This project is licensed under the terms of the MIT license.
