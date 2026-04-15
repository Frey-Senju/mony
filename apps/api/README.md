# Mony API

FastAPI backend for Mony money management application.

## Setup

```bash
# Install dependencies
poetry install

# Setup environment
cp .env.example .env

# Run development server
python -m uvicorn main:app --reload

# Run tests
pytest
```

## API Docs

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
