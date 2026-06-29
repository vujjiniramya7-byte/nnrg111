# Deploying NNRG RAG Chatbot to Render

## Prerequisites
- A free account at [render.com](https://render.com)
- Your project pushed to a GitHub/GitLab repository
- A free Groq API key from [console.groq.com](https://console.groq.com)

---

## Option A: Render Blueprint (Recommended — deploys both services at once)

1. Push this entire project folder to a GitHub repo
2. In Render Dashboard → **New → Blueprint**
3. Connect your GitHub repo
4. Render will detect `render.yaml` and show 2 services: `nnrg-backend` and `nnrg-frontend`
5. Before clicking **Apply**, set the secret environment variable:
   - `GROQ_API_KEY` → paste your Groq key
6. Click **Apply** — Render will build and deploy both services
7. Once backend is live, copy its URL (e.g. `https://nnrg-backend.onrender.com`)
8. Update `render.yaml` → change `VITE_BACKEND_URL` to that URL
9. Push the change → Render auto-redeploys the frontend

---

## Option B: Manual Setup (deploy services separately)

### Step 1 — Deploy the Backend

1. Render Dashboard → **New → Web Service**
2. Connect your repo, set **Root Directory** to `backend`
3. Set **Runtime** to **Docker**
4. Environment Variables:
   | Key | Value |
   |-----|-------|
   | `GROQ_API_KEY` | your key (mark as Secret) |
   | `ADMIN_API_KEY` | `nnrg_admin_2024` (change this!) |
   | `VECTOR_STORE_BACKEND` | `faiss` |
5. Add a **Disk** (under Advanced):
   - Name: `nnrg-data`
   - Mount Path: `/app`
   - Size: 1 GB
   > ⚠️ Without the disk, uploads and the vector store reset on every deploy!
6. Click **Create Web Service**
7. Wait for deploy → note the URL (e.g. `https://nnrg-backend.onrender.com`)

### Step 2 — Deploy the Frontend

1. Render Dashboard → **New → Web Service**
2. Connect your repo, set **Root Directory** to `frontend`
3. Set **Runtime** to **Docker**
4. Build Arguments:
   | Key | Value |
   |-----|-------|
   | `VITE_BACKEND_URL` | `https://nnrg-backend.onrender.com` (your backend URL) |
5. Click **Create Web Service**

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Chat says "Cannot connect to backend" | Check `VITE_BACKEND_URL` build arg matches actual backend URL |
| Backend returns 500 on /chat | Check `GROQ_API_KEY` is set correctly in backend env vars |
| Vector store lost after redeploy | Add a Render Disk mounted at `/app` on the backend service |
| Build times out | Free plan has 15 min build limit; torch+faiss are large. Consider upgrading to Starter |
| CORS errors in browser | Ensure backend `VITE_BACKEND_URL` is the exact origin including `https://` |

---

## Local Development (unchanged)

```bash
# Backend
cd backend
cp .env.example .env   # fill in GROQ_API_KEY
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
cp .env.example .env   # VITE_BACKEND_URL=http://127.0.0.1:8000
npm install
npm run dev
```

## Local Docker

```bash
cp backend/.env.example .env
# Edit .env → add GROQ_API_KEY
docker-compose up --build
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
```
