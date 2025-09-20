#!/bin/bash
# MediConnect Deployment Script

echo "🚀 Starting MediConnect Deployment..."

# Check prerequisites
command -v docker >/dev/null 2>&1 || { echo "Docker is required but not installed. Aborting." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js is required but not installed. Aborting." >&2; exit 1; }

# Load environment variables
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo "Please update .env with your configuration and run this script again."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Start infrastructure
echo "🐳 Starting Docker containers..."
docker-compose up -d postgres redis

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 10

# Run database migrations
echo "🗄️  Running database migrations..."
cd packages/backend
npm run db:migrate
npm run db:seed
cd ../..

# Build applications
echo "🔨 Building applications..."
npm run build

# Start services
echo "✅ Starting all services..."
npm run dev

echo "🎉 MediConnect is now running!"
echo "   Backend API: http://localhost:3000"
echo "   Web Portals: http://localhost:3001"
echo "   Health Check: http://localhost:3000/health"
