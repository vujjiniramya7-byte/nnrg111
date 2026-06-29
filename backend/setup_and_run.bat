@echo off
echo ========================================
echo   NNRG RAG Backend - Auto Setup
echo ========================================

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)

:: Create venv if not exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

:: Activate
call venv\Scripts\activate.bat

:: Install deps
echo Installing packages (first time takes 5-10 mins)...
pip install --upgrade pip
pip install fastapi==0.111.0 uvicorn[standard]==0.29.0 python-multipart==0.0.9 python-dotenv==1.0.1 groq==0.9.0 sentence-transformers==3.0.1 faiss-cpu==1.8.0 numpy==1.26.4 pypdf==4.2.0 python-docx==1.1.2 openpyxl==3.1.4 pandas==2.2.2 beautifulsoup4==4.12.3 aiofiles==23.2.1

:: Create .env if missing
if not exist ".env" (
    echo.
    echo ============================================================
    echo  IMPORTANT: Enter your Groq API key below
    echo  Get free key at: https://console.groq.com
    echo ============================================================
    set /p GROQ_KEY="Paste your GROQ_API_KEY here: "
    echo GROQ_API_KEY=%GROQ_KEY%> .env
    echo VECTOR_STORE_BACKEND=faiss>> .env
    echo .env file created!
)

:: Start server
echo.
echo Starting backend on http://localhost:8000 ...
echo Press Ctrl+C to stop
echo.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
