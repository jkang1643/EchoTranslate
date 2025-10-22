@echo off
echo 🚀 Starting Real-Time Translation App...

REM Check if .env file exists
if not exist .env (
    echo ⚠️  .env file not found. Creating from template...
    copy env.example .env
    echo 📝 Please edit .env file and add your GEMINI_API_KEY
    echo    Get your API key from: https://aistudio.google.com/
    pause
    exit /b 1
)

REM Check if node_modules exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm run install:all
)

REM Start the application
echo 🎯 Starting development servers...
call npm run dev
