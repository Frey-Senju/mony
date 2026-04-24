from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.auth import router as auth_router
from routes.transactions import router as transactions_router
from routes.accounts import router as accounts_router
from routes.reports import router as reports_router
from routes.open_finance import router as open_finance_router

app = FastAPI(
    title="Mony API",
    description="Money management API",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://web-flame-alpha-37.vercel.app",
        # Add production Vercel URL when ready
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

# Register routers
app.include_router(auth_router)
app.include_router(transactions_router)
app.include_router(accounts_router)
app.include_router(reports_router)
app.include_router(open_finance_router)

@app.get("/")
async def root():
    return {"message": "Mony API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
