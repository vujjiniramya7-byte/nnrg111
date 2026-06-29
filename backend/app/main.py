"""
NNRG RAG Chatbot Backend
FastAPI + FAISS + Gemini Embeddings (free API) + Groq LLM
Memory-optimised for Render free tier (512 MB RAM)
- No local ML model loaded — embeddings via Gemini API
- Batch encoding (20 chunks at a time to stay under rate limits)
- Per-upload memory guard (5 MB file size limit)
- gc.collect() after every heavy operation
"""

import os
import gc
import json
import uuid
import time
from pathlib import Path
from typing import Optional

import faiss
import numpy as np
import google.generativeai as genai
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from groq import Groq

try:
    from pypdf import PdfReader
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

try:
    from docx import Document as DocxDocument
    HAS_DOCX = True
except ImportError:
    HAS_DOCX = False

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

load_dotenv()

GROQ_API_KEY   = os.getenv("GROQ_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
BASE_DIR       = Path(__file__).parent.parent
UPLOADS_DIR    = BASE_DIR / "uploads"
VS_DIR         = BASE_DIR / "vectorstore"
KNOWLEDGE_FILE = BASE_DIR / "nnrg_knowledge.txt"
META_FILE      = VS_DIR / "meta.json"
INDEX_FILE     = VS_DIR / "index.faiss"
DOC_REG_FILE   = VS_DIR / "documents.json"
CHUNK_SIZE     = 500
OVERLAP        = 100
TOP_K          = 4
EMBED_BATCH    = 20          # Gemini free tier: stay well under rate limits
MAX_FILE_MB    = 5
MAX_TOTAL_DOCS = 20
EMBED_MODEL    = "models/text-embedding-004"   # 768-dim, free, 1500 req/day
LLM_MODEL      = "llama-3.3-70b-versatile"
EMBED_DIM      = 768

UPLOADS_DIR.mkdir(exist_ok=True)
VS_DIR.mkdir(exist_ok=True)

# Configure Gemini
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(title="NNRG RAG API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_groq_client: Optional[Groq] = None


def get_groq():
    global _groq_client
    if _groq_client is None:
        if not GROQ_API_KEY:
            raise HTTPException(500, "GROQ_API_KEY not set")
        _groq_client = Groq(api_key=GROQ_API_KEY)
    return _groq_client


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embed a list of strings using Gemini API, in batches."""
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY not set")
    all_vecs = []
    for i in range(0, len(texts), EMBED_BATCH):
        batch = texts[i : i + EMBED_BATCH]
        result = genai.embed_content(
            model=EMBED_MODEL,
            content=batch,
            task_type="retrieval_document",
        )
        all_vecs.extend(result["embedding"])
        # Small pause to respect free-tier rate limits (1500 req/day, ~1/min burst)
        if i + EMBED_BATCH < len(texts):
            time.sleep(0.1)
    return np.array(all_vecs, dtype="float32")


def embed_query(text: str) -> np.ndarray:
    """Embed a single query string."""
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY not set")
    result = genai.embed_content(
        model=EMBED_MODEL,
        content=text,
        task_type="retrieval_query",
    )
    return np.array([result["embedding"]], dtype="float32")


_index: Optional[faiss.IndexFlatL2] = None
_chunks: list = []
_meta: list = []

# ── vector store helpers ──────────────────────────────────────────────────────

def load_vector_store():
    global _index, _chunks, _meta
    if INDEX_FILE.exists() and META_FILE.exists():
        _index  = faiss.read_index(str(INDEX_FILE))
        data    = json.loads(META_FILE.read_text())
        _chunks = data["chunks"]
        _meta   = data["meta"]
    else:
        _index, _chunks, _meta = None, [], []


def save_vector_store():
    if _index is not None:
        faiss.write_index(_index, str(INDEX_FILE))
        META_FILE.write_text(json.dumps({"chunks": _chunks, "meta": _meta}))


def load_doc_registry():
    return json.loads(DOC_REG_FILE.read_text()) if DOC_REG_FILE.exists() else []


def save_doc_registry(docs):
    DOC_REG_FILE.write_text(json.dumps(docs, indent=2))

# ── text helpers ──────────────────────────────────────────────────────────────

def chunk_text(text, source="", doc_id=""):
    chunks, metas = [], []
    start = 0
    while start < len(text):
        chunk = text[start : start + CHUNK_SIZE].strip()
        if chunk:
            chunks.append(chunk)
            metas.append({"source": source, "doc_id": doc_id})
        start += CHUNK_SIZE - OVERLAP
    return chunks, metas


def extract_text(path: Path, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower()
    if ext in ("txt", "md"):
        return path.read_text(errors="ignore")
    if ext == "pdf":
        if not HAS_PDF:
            return "[PDF support not installed]"
        return "\n".join(p.extract_text() or "" for p in PdfReader(str(path)).pages)
    if ext == "docx":
        if not HAS_DOCX:
            return "[DOCX support not installed]"
        return "\n".join(p.text for p in DocxDocument(str(path)).paragraphs)
    if ext in ("xlsx", "xls", "csv"):
        if not HAS_PANDAS:
            return "[Pandas not installed]"
        df = pd.read_excel(str(path)) if ext != "csv" else pd.read_csv(str(path))
        return df.to_string(index=False)
    if ext == "json":
        return path.read_text(errors="ignore")
    if ext == "html":
        from bs4 import BeautifulSoup
        return BeautifulSoup(path.read_text(errors="ignore"), "html.parser").get_text("\n")
    return path.read_text(errors="ignore")


def index_text(text: str, source: str, doc_id: str):
    global _index, _chunks, _meta
    new_chunks, new_metas = chunk_text(text, source, doc_id)
    if not new_chunks:
        return
    vecs = embed_texts(new_chunks)
    if _index is None:
        _index = faiss.IndexFlatL2(EMBED_DIM)
    _index.add(vecs)
    _chunks.extend(new_chunks)
    _meta.extend(new_metas)
    save_vector_store()
    del vecs
    gc.collect()

# ── startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def seed_knowledge():
    load_vector_store()
    docs = load_doc_registry()
    if not any(d.get("doc_id") == "nnrg_builtin" for d in docs) and KNOWLEDGE_FILE.exists():
        text = KNOWLEDGE_FILE.read_text()
        index_text(text, "NNRG Official Documentation", "nnrg_builtin")
        docs.append({
            "doc_id": "nnrg_builtin",
            "filename": "NNRG_College_Documentation.txt",
            "source": "Built-in",
            "size": len(text),
        })
        save_doc_registry(docs)

# ── retrieval ─────────────────────────────────────────────────────────────────

def retrieve(query: str):
    if _index is None or not _chunks:
        return []
    qvec = embed_query(query)
    _, idxs = _index.search(qvec, min(TOP_K, len(_chunks)))
    return [
        (_chunks[i], _meta[i].get("source", "NNRG Docs"))
        for i in idxs[0]
        if 0 <= i < len(_chunks)
    ]


SYSTEM_PROMPT = """You are the official AI assistant for NNRG (Nalla Narasimha Reddy Group of Institutions), Hyderabad.

Answer questions ONLY from the provided context from NNRG's official documentation.
- If the answer is not in the context, say: "I couldn't find that information in the available college documents. Please contact NNRG at +91 8886531118 or admin@nnrg.edu.in"
- Never hallucinate or invent information.
- Be concise, friendly, and professional.
- Use bullet points or numbered lists for clarity when appropriate.
"""

# ── endpoints ─────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list = []


@app.post("/chat")
async def chat(req: ChatRequest):
    query = req.message.strip()
    if not query:
        raise HTTPException(400, "Message cannot be empty")
    hits = retrieve(query)
    context = "\n\n---\n\n".join(f"[Source: {src}]\n{c}" for c, src in hits) if hits else "No relevant documents found."
    sources = list({src for _, src in hits})
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in req.history[-4:]:
        if turn.get("role") in ("user", "assistant"):
            messages.append(turn)
    messages.append({"role": "user", "content": f"Context:\n{context}\n\nQuestion: {query}"})
    try:
        resp = get_groq().chat.completions.create(
            model=LLM_MODEL, messages=messages, max_tokens=800, temperature=0.1
        )
        answer = resp.choices[0].message.content
    except Exception as e:
        raise HTTPException(500, f"LLM error: {e}")
    return {"response": answer, "sources": sources}


@app.get("/chat")
async def chat_get(prompt: str = Query(...)):
    from fastapi.responses import JSONResponse
    result = await chat(ChatRequest(message=prompt))
    return JSONResponse({"response": result["response"]})


@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    allowed = {"pdf", "docx", "txt", "csv", "xlsx", "xls", "md", "html", "json"}
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported file type: .{ext}")

    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_FILE_MB:
        raise HTTPException(413, f"File too large ({size_mb:.1f} MB). Max allowed: {MAX_FILE_MB} MB.")

    docs = load_doc_registry()
    user_docs = [d for d in docs if d.get("doc_id") != "nnrg_builtin"]
    if len(user_docs) >= MAX_TOTAL_DOCS:
        raise HTTPException(429, f"Maximum {MAX_TOTAL_DOCS} uploaded documents reached. Delete some first.")

    doc_id = str(uuid.uuid4())
    save_path = UPLOADS_DIR / f"{doc_id}_{file.filename}"
    save_path.write_bytes(contents)
    del contents
    gc.collect()

    try:
        index_text(extract_text(save_path, file.filename or ""), file.filename or "", doc_id)
    except Exception as e:
        save_path.unlink(missing_ok=True)
        raise HTTPException(500, f"Failed to index: {e}")

    docs = load_doc_registry()
    docs.append({"doc_id": doc_id, "filename": file.filename,
                 "size": save_path.stat().st_size, "source": "Upload"})
    save_doc_registry(docs)
    return {"doc_id": doc_id, "filename": file.filename, "status": "indexed"}


@app.post("/reindex")
async def reindex():
    global _index, _chunks, _meta
    _index, _chunks, _meta = None, [], []
    gc.collect()
    for doc in load_doc_registry():
        if doc.get("doc_id") == "nnrg_builtin" and KNOWLEDGE_FILE.exists():
            index_text(KNOWLEDGE_FILE.read_text(), "NNRG Official Documentation", "nnrg_builtin")
        else:
            matches = list(UPLOADS_DIR.glob(f"{doc['doc_id']}_*"))
            if matches:
                index_text(
                    extract_text(matches[0], doc.get("filename", "")),
                    doc.get("filename", ""), doc["doc_id"]
                )
    return {"status": "reindexed", "total_chunks": len(_chunks)}


@app.get("/documents")
async def list_documents():
    return {"documents": load_doc_registry(), "total_chunks": len(_chunks)}


@app.delete("/documents/{doc_id}")
async def delete_document(doc_id: str):
    if doc_id == "nnrg_builtin":
        raise HTTPException(400, "Cannot delete built-in knowledge base")
    docs = [d for d in load_doc_registry() if d["doc_id"] != doc_id]
    save_doc_registry(docs)
    for f in UPLOADS_DIR.glob(f"{doc_id}_*"):
        f.unlink(missing_ok=True)

    global _index, _chunks, _meta
    new_chunks = [c for c, m in zip(_chunks, _meta) if m.get("doc_id") != doc_id]
    new_meta   = [m for m in _meta if m.get("doc_id") != doc_id]
    _index, _chunks, _meta = None, [], []
    gc.collect()

    if new_chunks:
        vecs = embed_texts(new_chunks)
        _index = faiss.IndexFlatL2(EMBED_DIM)
        _index.add(vecs)
        _chunks, _meta = new_chunks, new_meta
        del vecs
        gc.collect()

    save_vector_store()
    return {"status": "deleted", "doc_id": doc_id}


@app.get("/health")
async def health():
    import psutil
    mem = psutil.virtual_memory()
    return {
        "status": "ok",
        "chunks_indexed": len(_chunks),
        "groq_configured": bool(GROQ_API_KEY),
        "gemini_configured": bool(GEMINI_API_KEY),
        "embed_model": EMBED_MODEL,
        "llm_model": LLM_MODEL,
        "memory_used_mb": round(mem.used / 1024 / 1024),
        "memory_available_mb": round(mem.available / 1024 / 1024),
    }
