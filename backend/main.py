"""
FastAPI backend for Brain Bot Web Interface
Provides secure API endpoints to communicate with the bot
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import jwt
import redis
import json
import uuid
from datetime import datetime, timedelta
from passlib.context import CryptContext
import os

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-please")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Redis connection (same as bot)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# FastAPI app
app = FastAPI(title="Brain Bot API", version="1.0.0")

# CORS - configure based on your frontend domain
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # Add your domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# Models
class LoginRequest(BaseModel):
    username: str
    password: str

class MessageRequest(BaseModel):
    message: str

class MessageResponse(BaseModel):
    id: str
    message: str
    sender: str  # 'user' or 'bot'
    timestamp: str

# Simple user store (in production, use a database)
USERS_DB = {
    "admin": {
        "username": "admin",
        "hashed_password": pwd_context.hash("changeme123"),  # Change this!
        "user_id": "web_user_1"
    }
}

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return username
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

@app.get("/")
async def root():
    return {"message": "Brain Bot API", "status": "online"}

@app.post("/auth/login")
async def login(login_data: LoginRequest):
    """Login and get JWT token"""
    user = USERS_DB.get(login_data.username)
    if not user or not verify_password(login_data.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )

    access_token = create_access_token(data={"sub": user["username"]})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user["username"]
    }

@app.post("/messages/send", response_model=MessageResponse)
async def send_message(
    message_req: MessageRequest,
    username: str = Depends(verify_token)
):
    """Send a message to the bot"""

    user = USERS_DB.get(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Create job for the bot (same as Telegram bot does)
    from common.contracts import Job
    from common.config import TASK_QUEUE

    job = Job(
        current_agent="archivist",  # Default, will be routed
        payload={
            "text": message_req.message,
            "source": "web",
            "user_id": user["user_id"]
        }
    )

    # Queue the job
    redis_client.lpush(TASK_QUEUE, job.model_dump_json())

    # Store message in conversation history
    message_id = str(uuid.uuid4())
    message_data = {
        "id": message_id,
        "message": message_req.message,
        "sender": "user",
        "timestamp": datetime.now().isoformat()
    }

    # Store in Redis (conversation history)
    conv_key = f"web_conversation:{user['user_id']}"
    redis_client.lpush(conv_key, json.dumps(message_data))
    redis_client.expire(conv_key, 86400)  # Expire after 24 hours

    return MessageResponse(**message_data)

@app.get("/messages/history", response_model=List[MessageResponse])
async def get_message_history(
    limit: int = 50,
    username: str = Depends(verify_token)
):
    """Get conversation history"""

    user = USERS_DB.get(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    conv_key = f"web_conversation:{user['user_id']}"
    messages_raw = redis_client.lrange(conv_key, 0, limit - 1)

    messages = []
    for msg_json in messages_raw:
        msg_data = json.loads(msg_json)
        messages.append(MessageResponse(**msg_data))

    return list(reversed(messages))  # Oldest first

@app.get("/messages/pending")
async def check_pending_messages(
    username: str = Depends(verify_token)
):
    """Check for bot responses (polling endpoint)"""

    user = USERS_DB.get(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for completed jobs for this user
    response_key = f"web_response:{user['user_id']}"
    responses = []

    while True:
        response_data = redis_client.lpop(response_key)
        if not response_data:
            break
        responses.append(json.loads(response_data))

    return {"responses": responses}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
