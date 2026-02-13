"""
FastAPI backend for Brain Bot Web Interface
Provides secure API endpoints to communicate with the bot
"""

import sys
import os

# Add brain-os to path so we can import common modules
sys.path.insert(0, "/root/assistant-brain-os")

# Load brain-os .env (for OPENAI_API_KEY etc.) before any common imports
from dotenv import load_dotenv
load_dotenv("/root/assistant-brain-os/.env")

# Override relative database paths from .env with absolute paths
os.environ["DATABASE_PATH"] = "/root/assistant-brain-os/data/brain.db"
os.environ["CHROMA_PATH"] = "/root/assistant-brain-os/data/chroma"

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import jwt
import redis
import json
import uuid
import subprocess
import glob as globmod
from datetime import datetime, timedelta
import bcrypt
import asyncio
import pathlib

from common.routing import route_deterministic, is_casual, get_casual_response

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-in-production-please")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Redis connection (same as bot)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
redis_client = redis.from_url(REDIS_URL)

# FastAPI app
app = FastAPI(title="Brain Bot API", version="2.0.0")

# CORS
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://77.42.93.224").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# --- Models ---

class LoginRequest(BaseModel):
    username: str
    password: str

class MessageRequest(BaseModel):
    message: str
    agent: Optional[str] = None

class MessageResponse(BaseModel):
    id: str
    message: str
    sender: str
    timestamp: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

class TaskCreateRequest(BaseModel):
    title: str
    description: str = ""
    due_date: Optional[str] = None
    reminder_at: Optional[str] = None
    priority: str = "medium"
    tags: Optional[List[str]] = None

# --- User persistence (Phase 1c fix) ---

USERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "users.json")

DEFAULT_USERS = {
    "admin": {
        "username": "admin",
        "hashed_password": "$2b$12$74k.t8dt.vK0ZDR.9pz6QuPiwTKkDRfqhkAQUOmAKzuCJCpE8QhNy",
        "user_id": "web_user_1"
    }
}

def _load_users() -> dict:
    if os.path.exists(USERS_FILE):
        try:
            with open(USERS_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return DEFAULT_USERS.copy()

def _save_users(users: dict):
    with open(USERS_FILE, "w") as f:
        json.dump(users, f, indent=2)

USERS_DB = _load_users()

# --- Auth helpers ---

def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

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
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def _get_user(username: str) -> dict:
    user = USERS_DB.get(username)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# --- Auth endpoints ---

@app.get("/")
async def root():
    return {"message": "Brain Bot API", "status": "online"}

@app.post("/auth/login")
async def login(login_data: LoginRequest):
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

@app.post("/auth/change-password")
async def change_password(
    password_req: PasswordChangeRequest,
    username: str = Depends(verify_token)
):
    user = _get_user(username)
    if not verify_password(password_req.current_password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    new_hash = bcrypt.hashpw(password_req.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    USERS_DB[username]["hashed_password"] = new_hash
    _save_users(USERS_DB)
    return {"message": "Password changed successfully"}

# --- Chat / Messages ---

@app.post("/messages/send", response_model=MessageResponse)
async def send_message(
    message_req: MessageRequest,
    username: str = Depends(verify_token)
):
    user = _get_user(username)
    from common.contracts import Job
    from common.config import TASK_QUEUE

    conv_key = f"web_conversation:{user['user_id']}"
    now = datetime.now().isoformat()

    # Store user message in conversation history
    message_id = str(uuid.uuid4())
    message_data = {
        "id": message_id,
        "message": message_req.message,
        "sender": "user",
        "timestamp": now
    }
    redis_client.lpush(conv_key, json.dumps(message_data))
    redis_client.expire(conv_key, 86400)

    # Check for casual messages - respond instantly without queuing a job
    if (not message_req.agent or message_req.agent == "auto") and is_casual(message_req.message):
        casual_response = get_casual_response(message_req.message)
        response_data = {
            "id": str(uuid.uuid4()),
            "message": casual_response,
            "sender": "bot",
            "agent": "casual",
            "timestamp": datetime.now().isoformat()
        }
        response_key = f"web_response:{user['user_id']}"
        redis_client.lpush(response_key, json.dumps(response_data))
        redis_client.expire(response_key, 3600)
        redis_client.lpush(conv_key, json.dumps(response_data))
        redis_client.expire(conv_key, 86400)
        return MessageResponse(**message_data)

    # Route to agent
    if message_req.agent and message_req.agent != "auto":
        agent = message_req.agent
    else:
        agent = route_deterministic(message_req.message)

    # Attach recent conversation context for agents that use LLM
    recent_msgs = redis_client.lrange(conv_key, 0, 5)
    conversation_history = []
    for msg_json in recent_msgs:
        try:
            conversation_history.append(json.loads(msg_json))
        except Exception:
            pass

    job = Job(
        current_agent=agent,
        payload={
            "text": message_req.message,
            "source": "web",
            "user_id": user["user_id"],
            "conversation_history": list(reversed(conversation_history[-6:]))
        }
    )
    redis_client.lpush(TASK_QUEUE, job.model_dump_json())

    return MessageResponse(**message_data)

@app.get("/messages/history", response_model=List[MessageResponse])
async def get_message_history(
    limit: int = 50,
    username: str = Depends(verify_token)
):
    user = _get_user(username)
    conv_key = f"web_conversation:{user['user_id']}"
    messages_raw = redis_client.lrange(conv_key, 0, limit - 1)
    messages = []
    for msg_json in messages_raw:
        msg_data = json.loads(msg_json)
        messages.append(MessageResponse(**msg_data))
    return list(reversed(messages))

@app.get("/messages/pending")
async def check_pending_messages(username: str = Depends(verify_token)):
    user = _get_user(username)
    response_key = f"web_response:{user['user_id']}"
    responses = []
    while True:
        response_data = redis_client.lpop(response_key)
        if not response_data:
            break
        responses.append(json.loads(response_data))
    return {"responses": responses}

@app.get("/messages/stream")
async def message_stream(token: str = ""):
    """SSE endpoint for real-time message delivery."""
    # Validate token from query param (EventSource can't set headers)
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = _get_user(username)
    response_key = f"web_response:{user['user_id']}"

    async def event_generator():
        while True:
            try:
                msg = redis_client.lpop(response_key)
                if msg:
                    yield f"data: {msg.decode()}\n\n"
                else:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(0.3)
            except Exception:
                break

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )

# --- Knowledge Base ---

@app.get("/knowledge/stats")
async def get_knowledge_stats(username: str = Depends(verify_token)):
    try:
        from common.database import db
        total_entries = db.get_all_entries_count()
        week_ago = (datetime.now() - timedelta(days=7)).isoformat()
        all_entries = db.get_all_entries(limit=total_entries)
        recent_entries = [e for e in all_entries if e.get('created_at', '') >= week_ago]
        return {
            "total_entries": total_entries,
            "recent_entries": len(recent_entries),
            "last_updated": all_entries[0].get('created_at') if all_entries else None
        }
    except Exception as e:
        return {"total_entries": 0, "recent_entries": 0, "last_updated": None, "error": str(e)}

@app.get("/knowledge/entries")
async def get_knowledge_entries(
    query: str = "",
    limit: int = 50,
    offset: int = 0,
    username: str = Depends(verify_token)
):
    """Browse or search knowledge base entries. Phase 1b fix: uses search_clean for queries."""
    try:
        from common.database import db
        if query.strip():
            results = db.search_clean(query, limit=limit + offset)
        else:
            results = db.get_all_entries(limit=limit + offset)
        results = results[offset:offset + limit] if offset < len(results) else []
        return {"entries": results, "count": len(results), "query": query}
    except Exception as e:
        return {"entries": [], "count": 0, "query": query, "error": str(e)}

@app.get("/knowledge/search")
async def advanced_search(
    query: str = "",
    tags: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    content_type: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 50,
    username: str = Depends(verify_token)
):
    """Advanced search with filters."""
    try:
        from common.database import db
        tag_list = [t.strip() for t in tags.split(",")] if tags else None
        results = db.search_with_filters(
            query=query or "",
            limit=limit,
            tags=tag_list,
            date_from=date_from,
            date_to=date_to,
            content_type=content_type,
            source=source,
        )
        return {"entries": results, "count": len(results), "query": query}
    except Exception as e:
        return {"entries": [], "count": 0, "query": query, "error": str(e)}

class KnowledgeAddRequest(BaseModel):
    text: str
    tags: Optional[List[str]] = None
    source: str = "web"
    url: Optional[str] = None

@app.post("/knowledge/add")
async def add_knowledge_entry(
    req: KnowledgeAddRequest,
    username: str = Depends(verify_token)
):
    """Add a knowledge entry directly from the web interface."""
    from common.database import db
    from common.contracts import KnowledgeEntry

    text = req.text.strip()
    if len(text) < 3:
        raise HTTPException(400, "Content too short to save")

    # Auto-extract tags if none provided
    if req.tags:
        tags = req.tags
    else:
        from agents.archivist import _extract_tags
        tags = _extract_tags(text)

    metadata = {}
    if req.url:
        metadata["url"] = req.url

    entry = KnowledgeEntry(
        text=text,
        tags=tags,
        source=req.source,
        metadata=metadata,
        embedding_id=str(uuid.uuid4())
    )
    db.add_knowledge(entry)

    return {"message": "Saved", "id": entry.embedding_id, "tags": tags}

@app.delete("/knowledge/{entry_id}")
async def delete_knowledge_entry(
    entry_id: str,
    username: str = Depends(verify_token)
):
    """Delete a knowledge entry."""
    from common.database import db
    try:
        db.delete_entry(entry_id)
        return {"message": "Deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Dashboard Overview ---

@app.get("/dashboard/overview")
async def dashboard_overview(username: str = Depends(verify_token)):
    """Single aggregated call for the dashboard."""
    data = {
        "knowledge_total": 0,
        "knowledge_recent": 0,
        "pending_tasks": [],
        "overdue_tasks": [],
        "journal_streak": 0,
        "journal_latest_mood": None,
        "journal_recent": [],
        "graph_nodes": 0,
        "graph_edges": 0,
        "graph_top_tags": [],
        "queue_length": 0,
        "processes": [],
        "recent_activity": [],
    }

    # Knowledge stats
    try:
        from common.database import db
        data["knowledge_total"] = db.get_all_entries_count()
        week_ago = (datetime.now() - timedelta(days=7)).isoformat()
        all_entries = db.get_all_entries(limit=data["knowledge_total"])
        data["knowledge_recent"] = len([e for e in all_entries if e.get('created_at', '') >= week_ago])
    except Exception:
        pass

    # Tasks
    try:
        from common.database import db
        user = _get_user(username)
        pending = db.get_tasks(user["user_id"], status="pending")
        data["pending_tasks"] = pending[:10]
        now_iso = datetime.now().isoformat()
        data["overdue_tasks"] = [t for t in pending if t.get("due_date") and t["due_date"] < now_iso][:5]
    except Exception:
        pass

    # Journal
    try:
        from common.database import db
        entries = db.get_journal_entries(limit=10)
        data["journal_recent"] = entries[:3]
        if entries:
            data["journal_latest_mood"] = entries[0].get("metadata", {}).get("mood") if isinstance(entries[0].get("metadata"), dict) else None
        # Streak: count consecutive days with journal entries
        dates_with_entries = set()
        for e in entries:
            created = e.get("created_at", "")
            if created:
                dates_with_entries.add(created[:10])
        streak = 0
        check_date = datetime.now()
        for _ in range(30):
            if check_date.strftime("%Y-%m-%d") in dates_with_entries:
                streak += 1
                check_date -= timedelta(days=1)
            else:
                break
        data["journal_streak"] = streak
    except Exception:
        pass

    # Graph stats
    try:
        from common.knowledge_graph import KnowledgeGraph
        kg = KnowledgeGraph("/root/assistant-brain-os/data/knowledge_graph.pkl")
        stats = kg.get_stats()
        data["graph_nodes"] = stats.get("total_nodes", 0)
        data["graph_edges"] = stats.get("total_edges", 0)
        data["graph_top_tags"] = list(stats.get("tags", {}).items())[:10]
    except Exception:
        pass

    # Queue
    try:
        from common.config import TASK_QUEUE
        data["queue_length"] = redis_client.llen(TASK_QUEUE)
    except Exception:
        pass

    # PM2 processes
    try:
        result = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            processes = json.loads(result.stdout)
            data["processes"] = [
                {
                    "name": p.get("name", "?"),
                    "status": p.get("pm2_env", {}).get("status", "unknown"),
                    "cpu": p.get("monit", {}).get("cpu", 0),
                    "memory": round(p.get("monit", {}).get("memory", 0) / (1024 * 1024), 1),
                    "uptime": p.get("pm2_env", {}).get("pm_uptime", 0),
                    "restarts": p.get("pm2_env", {}).get("restart_time", 0),
                }
                for p in processes
            ]
    except Exception:
        pass

    # Recent activity from Redis conversations
    try:
        activities = []
        conv_keys = redis_client.keys("web_conversation:*") + redis_client.keys("conversation:*")
        for key in conv_keys[:5]:
            msgs = redis_client.lrange(key, 0, 2)
            for msg_json in msgs:
                try:
                    msg = json.loads(msg_json)
                    activities.append({
                        "timestamp": msg.get("timestamp", ""),
                        "source": "web" if b"web" in key else "telegram",
                        "content": msg.get("message", "")[:80]
                    })
                except Exception:
                    pass
        activities.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
        data["recent_activity"] = activities[:5]
    except Exception:
        pass

    return data

# --- Tasks CRUD ---

@app.get("/tasks")
async def get_tasks(
    task_status: Optional[str] = None,
    due_before: Optional[str] = None,
    limit: int = 50,
    username: str = Depends(verify_token)
):
    try:
        from common.database import db
        user = _get_user(username)
        tasks = db.get_tasks(user["user_id"], status=task_status, due_before=due_before, limit=limit)
        return {"tasks": tasks, "count": len(tasks)}
    except Exception as e:
        return {"tasks": [], "count": 0, "error": str(e)}

@app.post("/tasks")
async def create_task(
    task_req: TaskCreateRequest,
    username: str = Depends(verify_token)
):
    try:
        from common.database import db
        user = _get_user(username)
        task_id = db.add_task(
            user_id=user["user_id"],
            title=task_req.title,
            description=task_req.description,
            due_date=task_req.due_date,
            reminder_at=task_req.reminder_at,
            priority=task_req.priority,
            tags=task_req.tags,
        )
        return {"task_id": task_id, "message": "Task created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/tasks/{task_id}/complete")
async def complete_task(task_id: str, username: str = Depends(verify_token)):
    try:
        from common.database import db
        user = _get_user(username)
        ok = db.complete_task(task_id, user["user_id"])
        if not ok:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"message": "Task completed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/tasks/{task_id}")
async def delete_task(task_id: str, username: str = Depends(verify_token)):
    try:
        from common.database import db
        user = _get_user(username)
        ok = db.delete_task(task_id, user["user_id"])
        if not ok:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"message": "Task deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Journal ---

@app.get("/journal")
async def get_journal(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
    username: str = Depends(verify_token)
):
    try:
        from common.database import db
        entries = db.get_journal_entries(date_from=date_from, date_to=date_to, limit=limit)
        return {"entries": entries, "count": len(entries)}
    except Exception as e:
        return {"entries": [], "count": 0, "error": str(e)}

# --- Knowledge Graph ---

@app.get("/graph/stats")
async def graph_stats(username: str = Depends(verify_token)):
    try:
        from common.knowledge_graph import KnowledgeGraph
        kg = KnowledgeGraph("/root/assistant-brain-os/data/knowledge_graph.pkl")
        stats = kg.get_stats()
        return stats
    except Exception as e:
        return {"total_nodes": 0, "total_edges": 0, "error": str(e)}

@app.get("/graph/data")
async def graph_data(max_nodes: int = 200, username: str = Depends(verify_token)):
    """Return nodes and edges for force-graph rendering."""
    try:
        from common.knowledge_graph import KnowledgeGraph
        kg = KnowledgeGraph("/root/assistant-brain-os/data/knowledge_graph.pkl")

        nodes = []
        for node_id, attrs in list(kg.graph.nodes(data=True))[:max_nodes]:
            nodes.append({
                "id": node_id,
                "title": attrs.get("title", node_id),
                "type": attrs.get("type", "note"),
                "tags": attrs.get("tags", []),
            })

        node_ids = {n["id"] for n in nodes}
        edges = []
        for src, tgt, edge_attrs in kg.graph.edges(data=True):
            if src in node_ids and tgt in node_ids:
                edges.append({
                    "source": src,
                    "target": tgt,
                    "relationship": edge_attrs.get("relationship", "related"),
                })

        return {"nodes": nodes, "edges": edges}
    except Exception as e:
        return {"nodes": [], "edges": [], "error": str(e)}

@app.get("/graph/node/{node_id}")
async def graph_node(node_id: str, username: str = Depends(verify_token)):
    """Get details for a single graph node."""
    try:
        from common.knowledge_graph import KnowledgeGraph
        kg = KnowledgeGraph("/root/assistant-brain-os/data/knowledge_graph.pkl")
        node = kg.get_node(node_id)
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")
        related = kg.get_related_notes(node_id)
        backlinks = kg.get_backlinks(node_id)
        return {"node": node, "related": related, "backlinks": backlinks}
    except HTTPException:
        raise
    except Exception as e:
        return {"node": None, "error": str(e)}

# --- Monitor ---

@app.get("/monitor/stats")
async def get_monitor_stats(username: str = Depends(verify_token)):
    try:
        from common.config import TASK_QUEUE
        queue_length = redis_client.llen(TASK_QUEUE)
        conv_keys = redis_client.keys("web_conversation:*")
        telegram_keys = redis_client.keys("conversation:*")
        redis_info = redis_client.info()
        redis_memory = redis_info.get('used_memory_human', 'N/A')
        redis_uptime = redis_info.get('uptime_in_seconds', 0)

        total_knowledge = 0
        topics = {}
        vector_count = 0
        total_content_size = 0
        try:
            from common.database import db
            total_knowledge = db.get_all_entries_count()
            all_entries = db.get_all_entries(limit=total_knowledge)
            for entry in all_entries:
                category = entry.get('category', 'uncategorized')
                topics[category] = topics.get(category, 0) + 1
                content = entry.get('content', '') or entry.get('summary', '')
                total_content_size += len(content)
            try:
                vector_count = db.collection.count()
            except Exception:
                vector_count = total_knowledge
        except Exception as e:
            print(f"Knowledge stats error: {e}")

        if total_content_size > 1024 * 1024:
            content_size_str = f"{total_content_size / (1024 * 1024):.2f} MB"
        elif total_content_size > 1024:
            content_size_str = f"{total_content_size / 1024:.2f} KB"
        else:
            content_size_str = f"{total_content_size} B"

        top_topics = sorted(topics.items(), key=lambda x: x[1], reverse=True)[:5]
        return {
            "queue_length": queue_length,
            "active_conversations": len(conv_keys) + len(telegram_keys),
            "total_knowledge_entries": total_knowledge,
            "vector_embeddings": vector_count,
            "content_size": content_size_str,
            "topics": dict(top_topics),
            "redis_memory": redis_memory,
            "redis_uptime_hours": round(redis_uptime / 3600, 1),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {"error": str(e)}

@app.get("/monitor/activity")
async def get_recent_activity(limit: int = 50, username: str = Depends(verify_token)):
    try:
        activities = []
        conv_keys = redis_client.keys("web_conversation:*") + redis_client.keys("conversation:*")
        for key in conv_keys[:10]:
            messages = redis_client.lrange(key, 0, 5)
            for msg_json in messages:
                try:
                    msg = json.loads(msg_json)
                    activities.append({
                        "timestamp": msg.get("timestamp", datetime.now().isoformat()),
                        "type": "message",
                        "source": "web" if "web" in key.decode() else "telegram",
                        "content": msg.get("message", "")[:100]
                    })
                except Exception:
                    pass
        activities.sort(key=lambda x: x["timestamp"], reverse=True)
        return {"activities": activities[:limit], "count": len(activities)}
    except Exception as e:
        return {"activities": [], "count": 0, "error": str(e)}

@app.get("/monitor/queue")
async def get_queue_status(username: str = Depends(verify_token)):
    try:
        from common.config import TASK_QUEUE
        queue_items = redis_client.lrange(TASK_QUEUE, 0, 20)
        jobs = []
        for item in queue_items:
            try:
                job_data = json.loads(item)
                jobs.append({
                    "agent": job_data.get("current_agent", "unknown"),
                    "source": job_data.get("payload", {}).get("source", "unknown"),
                    "preview": str(job_data.get("payload", {}).get("text", ""))[:50]
                })
            except Exception:
                pass
        return {"queue_length": len(queue_items), "jobs": jobs}
    except Exception as e:
        return {"queue_length": 0, "jobs": [], "error": str(e)}

@app.get("/monitor/processes")
async def get_processes(username: str = Depends(verify_token)):
    """Get pm2 process status."""
    try:
        result = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, timeout=5)
        if result.returncode != 0:
            return {"processes": [], "error": "pm2 not available"}
        processes = json.loads(result.stdout)
        return {
            "processes": [
                {
                    "name": p.get("name", "?"),
                    "status": p.get("pm2_env", {}).get("status", "unknown"),
                    "cpu": p.get("monit", {}).get("cpu", 0),
                    "memory_mb": round(p.get("monit", {}).get("memory", 0) / (1024 * 1024), 1),
                    "uptime": p.get("pm2_env", {}).get("pm_uptime", 0),
                    "restarts": p.get("pm2_env", {}).get("restart_time", 0),
                }
                for p in processes
            ]
        }
    except Exception as e:
        return {"processes": [], "error": str(e)}

@app.get("/monitor/errors")
async def get_errors(limit: int = 20, username: str = Depends(verify_token)):
    """Read recent error reports from rescue issues."""
    try:
        error_files = sorted(
            globmod.glob("/tmp/rescue_issues/*.json"),
            key=os.path.getmtime,
            reverse=True
        )[:limit]
        errors = []
        for f in error_files:
            try:
                with open(f) as fh:
                    errors.append(json.load(fh))
            except Exception:
                pass
        return {"errors": errors, "count": len(errors)}
    except Exception as e:
        return {"errors": [], "count": 0, "error": str(e)}

# --- Health ---

# --- Settings ---

SETTINGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "settings.json")

def _load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}

def _save_settings(settings: dict):
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)

class LLMSettingsRequest(BaseModel):
    provider: str  # "openai", "deepseek", "openrouter"
    api_key: Optional[str] = None
    model: Optional[str] = None

@app.get("/settings/llm")
async def get_llm_settings(username: str = Depends(verify_token)):
    """Get current LLM provider settings."""
    from common.config import LLM_PROVIDER, MODEL_NAME
    settings = _load_settings()
    user_settings = settings.get(username, {}).get("llm", {})

    # Mask API keys for display
    def mask_key(key):
        if not key:
            return ""
        if len(key) <= 8:
            return "***"
        return key[:4] + "..." + key[-4:]

    return {
        "provider": user_settings.get("provider", LLM_PROVIDER),
        "model": user_settings.get("model", MODEL_NAME),
        "has_openai_key": bool(os.getenv("OPENAI_API_KEY")),
        "has_deepseek_key": bool(os.getenv("DEEPSEEK_API_KEY")),
        "has_openrouter_key": bool(os.getenv("OPENROUTER_API_KEY") or user_settings.get("openrouter_key")),
        "openrouter_key_masked": mask_key(user_settings.get("openrouter_key", os.getenv("OPENROUTER_API_KEY", ""))),
    }

@app.post("/settings/llm")
async def update_llm_settings(
    req: LLMSettingsRequest,
    username: str = Depends(verify_token)
):
    """Update LLM provider settings. Writes to .env.overrides for worker pickup."""
    settings = _load_settings()
    if username not in settings:
        settings[username] = {}

    settings[username]["llm"] = {
        "provider": req.provider,
        "model": req.model,
    }

    # Store OpenRouter key per-user if provided
    if req.api_key and req.provider == "openrouter":
        settings[username]["llm"]["openrouter_key"] = req.api_key

    _save_settings(settings)

    # Write overrides to .env.overrides for worker to pick up
    overrides_path = "/root/assistant-brain-os/.env.overrides"
    overrides = {}
    if os.path.exists(overrides_path):
        try:
            with open(overrides_path) as f:
                for line in f:
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        k, v = line.split('=', 1)
                        overrides[k] = v
        except Exception:
            pass

    overrides["LLM_PROVIDER"] = req.provider
    if req.model:
        if req.provider == "openrouter":
            overrides["OPENROUTER_MODEL"] = req.model
    if req.api_key and req.provider == "openrouter":
        overrides["OPENROUTER_API_KEY"] = req.api_key

    with open(overrides_path, "w") as f:
        for k, v in overrides.items():
            f.write(f"{k}={v}\n")

    return {"message": "Settings saved", "provider": req.provider, "model": req.model}

# --- Health ---

@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
