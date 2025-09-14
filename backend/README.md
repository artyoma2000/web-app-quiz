# Birthday Raffle Quiz - Backend

This is a FastAPI backend for the Birthday Raffle Quiz.

- SQLite DB `app.db` is auto-initialized on startup (creates tables, admin user, sample questions).
- Run with Uvicorn from the `backend` folder.

Example:

```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Running with Docker Compose

To run the full stack (Postgres, backend, frontend) with Docker Compose for development:

1. Build and start the services:

```
docker-compose up --build
```

2. The frontend will be available at http://localhost:5173 and the backend at http://localhost:8000.

Notes:
- The backend container expects the Postgres service to be available at the hostname `db` (this is provided by compose).
- The backend will create tables on startup if the environment variable `CREATE_TABLES` is set to a truthy value (1).
