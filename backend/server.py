from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import re
import json
import uuid
import logging
from pathlib import Path
from pydantic import BaseModel, Field, BeforeValidator
from typing import List, Optional, Annotated, Any
from datetime import datetime, timezone

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone  # noqa: E402

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
api_router = APIRouter(prefix="/api")
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v))]


class BaseDocument(BaseModel):
    id: Optional[PyObjectId] = None

    @classmethod
    def from_mongo(cls, doc: dict):
        data = dict(doc)
        if "_id" in data:
            data["id"] = data.pop("_id")
        return cls(**data)

    def to_mongo(self) -> dict:
        data = self.model_dump(exclude={"id"})
        return data


# ---------- Models ----------
class SyncDoc(BaseModel):
    id: str
    name: str
    content: str
    language: str = "auto"
    pinned: bool = False
    createdAt: float
    updatedAt: float


class SyncSpace(BaseDocument):
    sync_id: str
    docs: List[SyncDoc] = []
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class SyncPushIn(BaseModel):
    sync_id: str
    docs: List[SyncDoc]


class CoachIn(BaseModel):
    text: str
    mode: str = "writing"  # writing | code
    language: str = "plaintext"


class CoachIssue(BaseModel):
    type: str = "style"
    original: str = ""
    replacement: str = ""
    explanation: str = ""


class CoachOut(BaseModel):
    score: int = 0
    summary: str = ""
    issues: List[CoachIssue] = []
    tips: List[str] = []


class CoachLog(BaseDocument):
    mode: str
    language: str
    chars: int
    result: CoachOut
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "NexaEdit API"}


def valid_sync_id(sync_id: str) -> str:
    sid = sync_id.strip().upper()
    if not re.fullmatch(r"[A-Z0-9-]{6,40}", sid):
        raise HTTPException(status_code=400, detail="Invalid sync code")
    return sid


@api_router.post("/sync/push")
async def sync_push(body: SyncPushIn):
    sid = valid_sync_id(body.sync_id)
    existing = await db.sync_spaces.find_one({"sync_id": sid})
    merged: dict = {}
    if existing:
        for d in SyncSpace.from_mongo(existing).docs:
            merged[d.id] = d
    for d in body.docs:
        cur = merged.get(d.id)
        if cur is None or d.updatedAt >= cur.updatedAt:
            merged[d.id] = d
    space = SyncSpace(sync_id=sid, docs=list(merged.values()))
    await db.sync_spaces.update_one({"sync_id": sid}, {"$set": space.to_mongo()}, upsert=True)
    return {"sync_id": sid, "count": len(space.docs), "updated_at": space.updated_at}


@api_router.get("/sync/pull/{sync_id}")
async def sync_pull(sync_id: str):
    sid = valid_sync_id(sync_id)
    existing = await db.sync_spaces.find_one({"sync_id": sid})
    if not existing:
        return {"sync_id": sid, "docs": [], "updated_at": None}
    space = SyncSpace.from_mongo(existing)
    return {"sync_id": sid, "docs": [d.model_dump() for d in space.docs], "updated_at": space.updated_at}


WRITING_PROMPT = """You are an expert writing coach. Analyze the user's text for spelling, grammar, punctuation, clarity and style.
Return ONLY valid JSON (no markdown fences) with this exact shape:
{"score": <0-100 integer writing quality>, "summary": "<2 sentence overall feedback>",
 "issues": [{"type": "spelling|grammar|style|clarity", "original": "<exact substring copied from the text>", "replacement": "<improved text>", "explanation": "<short why>"}],
 "tips": ["<actionable tip to improve the writer's technique>", ...]}
Give at most 12 issues and 3-5 tips. "original" MUST be an exact substring of the text."""

CODE_PROMPT = """You are a senior code reviewer. Review the user's {lang} code for bugs, bad practices, readability and performance.
Return ONLY valid JSON (no markdown fences) with this exact shape:
{{"score": <0-100 integer code quality>, "summary": "<2 sentence overall feedback>",
 "issues": [{{"type": "bug|style|performance|clarity", "original": "<exact substring copied from the code, single line preferred>", "replacement": "<improved code>", "explanation": "<short why>"}}],
 "tips": ["<actionable tip>", ...]}}
Give at most 10 issues and 3-5 tips. "original" MUST be an exact substring of the code."""


def parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw)
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("no json")
    return json.loads(raw[start:end + 1])


@api_router.post("/ai/coach", response_model=CoachOut)
async def ai_coach(body: CoachIn):
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")
    text = text[:12000]
    system = CODE_PROMPT.format(lang=body.language) if body.mode == "code" else WRITING_PROMPT
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"coach-{uuid.uuid4()}", system_message=system) \
        .with_model("anthropic", "claude-sonnet-5-5")
    full = ""
    try:
        async for ev in chat.stream_message(UserMessage(text=text)):
            if isinstance(ev, TextDelta):
                full += ev.content
            elif isinstance(ev, StreamDone):
                break
        data = parse_json(full)
        result = CoachOut(**{
            "score": int(data.get("score", 0)),
            "summary": str(data.get("summary", "")),
            "issues": [CoachIssue(**{k: str(v) for k, v in i.items() if k in ("type", "original", "replacement", "explanation")})
                       for i in data.get("issues", []) if isinstance(i, dict)],
            "tips": [str(t) for t in data.get("tips", [])],
        })
    except Exception as e:
        logger.exception("coach failed")
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {e}")
    log = CoachLog(mode=body.mode, language=body.language, chars=len(text), result=result)
    await db.coach_logs.insert_one(log.to_mongo())
    return result


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


_unused: Any = None
