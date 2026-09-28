from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, chat, personality, voice
from app.utils.db import connect_to_mongo, close_mongo_connection

# Load environment variables from .env (useful for local development)
load_dotenv()

app = FastAPI(title="Digital Twin API")

# CORS (needed when calling the API from the Next.js UI in the browser)
# Set CORS_ORIGINS in your environment like:
# CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
import os

cors_origins_env = os.getenv("CORS_ORIGINS", "")
origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]
if not origins:
    # Dev-friendly defaults (lock this down for production)
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Database Events
app.add_event_handler("startup", connect_to_mongo)
app.add_event_handler("shutdown", close_mongo_connection)

# Register Routers
app.include_router(auth.router)
app.include_router(personality.router)
app.include_router(chat.router)
app.include_router(voice.router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)