import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from routes.accounts import router as accounts_router
from routes.ai import router as ai_router
from routes.auth import router as auth_router
from routes.budgets import router as budgets_router
from routes.categories import router as categories_router
from routes.credit_cards import router as credit_cards_router
from routes.cron import router as cron_router
from routes.goals import router as goals_router
from routes.insights import router as insights_router
from routes.investments import router as investments_router
from routes.notifications import router as notifications_router
from routes.open_finance import router as open_finance_router
from routes.open_finance_pluggy import router as open_finance_pluggy_router
from routes.open_finance_sync import router as open_finance_sync_router
from routes.push import router as push_router
from routes.recurring import router as recurring_router
from routes.reports import router as reports_router
from routes.rules import router as rules_router
from routes.transactions import router as transactions_router

app = FastAPI(
    title="Mony API",
    description="Money management API",
    version="0.2.0",
)

# Rate limiting (slowapi) — active in production, relaxed in automated tests
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["200/minute"],
    enabled=not bool(os.getenv("PYTEST_CURRENT_TEST")),
)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please try again shortly."},
    )


# CORS configuration — includes PATCH for /goals/{id}/deposit and env override
_default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://web-flame-alpha-37.vercel.app",
    "https://mony-kappa.vercel.app",
]
_extra_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "").split(",")
    if o.strip()
]
_frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
if _frontend_url and _frontend_url not in _default_origins:
    _extra_origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(_default_origins + _extra_origins)),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Webhook-Signature"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return response


# Register routers
app.include_router(auth_router)
app.include_router(accounts_router)
app.include_router(categories_router)
app.include_router(transactions_router)
app.include_router(reports_router)
app.include_router(open_finance_router)
app.include_router(open_finance_pluggy_router)
app.include_router(open_finance_sync_router)
app.include_router(budgets_router)
app.include_router(insights_router)
app.include_router(goals_router)
app.include_router(ai_router)
app.include_router(recurring_router)
app.include_router(notifications_router)
app.include_router(investments_router)
app.include_router(rules_router)
app.include_router(cron_router)
app.include_router(push_router)
app.include_router(credit_cards_router)


@app.get("/")
async def root():
    return {"message": "Mony API is running", "version": "0.2.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
