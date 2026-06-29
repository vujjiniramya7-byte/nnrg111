# NNRG College Website + RAG Chatbot

Full-stack AI-powered college website with a RAG (Retrieval-Augmented Generation) chatbot that answers questions exclusively from NNRG's official documentation.

**Tech Stack:** React + Vite · FastAPI · FAISS · Sentence Transformers · Groq LLM

---

## Quick Start

### 1. Get a free Groq API key
Sign up at https://console.groq.com → create an API key (free tier).

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env → add your GROQ_API_KEY
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend runs at → http://127.0.0.1:8000

### 3. Frontend Setup

```bash
cd frontend
cp .env.example .env            # VITE_BACKEND_URL=http://127.0.0.1:8000
npm install
npm run dev
```

Frontend runs at → http://localhost:5173

---

## Features

- **RAG Chatbot** — answers from NNRG official docs only, no hallucination
- **Built-in Knowledge Base** — NNRG documentation pre-indexed on startup
- **Admin Dashboard** at `/admin` — upload/delete/reindex documents
- **Floating Chat Widget** — typing animation, suggested questions, source citations
- **Markdown rendering** — bold, bullets, formatted responses

---

## Admin Dashboard

Visit `http://localhost:5173/admin`

Default ADMIN_API_KEY: `nnrg_admin_2024` (change in `.env`)

Allows:
- Upload new documents (PDF, DOCX, TXT, CSV, XLSX, MD, HTML, JSON)
- Delete documents
- Re-index the full knowledge base
- View health status

---

## Docker

```bash
cp backend/.env.example .env
# Edit .env
docker-compose up --build
```

---

## Environment Variables

### Backend (.env)
```
GROQ_API_KEY=your_key_here
ADMIN_API_KEY=nnrg_admin_2024
VECTOR_STORE_BACKEND=faiss
```

### Frontend (.env)
```
VITE_BACKEND_URL=http://127.0.0.1:8000
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /chat | Chat with RAG bot |
| GET | /chat?prompt= | Legacy GET chat |
| POST | /upload | Upload document (admin) |
| POST | /reindex | Re-index all docs (admin) |
| GET | /documents | List documents (admin) |
| DELETE | /documents/{id} | Delete document (admin) |
| GET | /health | Health check |

Admin endpoints require header: `x-admin-key: your_key`
