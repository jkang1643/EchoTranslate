#!/bin/bash

# Real-Time Translation App Startup Script

echo "🚀 Starting Real-Time Translation App..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp env.example .env
    echo "📝 Please edit .env file and add your GEMINI_API_KEY"
    echo "   Get your API key from: https://aistudio.google.com/"
    exit 1
fi

# Check if node_modules exist
if [ ! -d "node_modules" ] || [ ! -d "backend/node_modules" ] || [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm run install:all
fi

# Start the application
echo "🎯 Starting development servers..."
npm run dev
