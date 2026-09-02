@echo off
echo Starting Dentist on Call FastAPI Backend on http://localhost:8000 ...
cd apps\api
set PYTHONPATH=.
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
