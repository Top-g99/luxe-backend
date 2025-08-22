#!/bin/bash

# Luxe Staycations - Backend Startup Script
# This script starts the backend server and runs basic tests

echo "🚀 Starting Luxe Staycations Backend Server"
echo "============================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Please run this script from the luxe-api directory"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed successfully"
fi

# Check environment variables
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found"
    echo "📝 Please create a .env file with the following variables:"
    echo "   SUPABASE_URL=your_supabase_url"
    echo "   SUPABASE_SERVICE_ROLE_KEY=your_service_key"
    echo "   FRONTEND_URL=http://localhost:3000"
    echo ""
    echo "💡 You can copy from env.example and fill in your values"
    echo ""
    read -p "Do you want to continue without .env file? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled"
        exit 1
    fi
fi

# Test database connection
echo "🔍 Testing database connection..."
node -e "
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.log('❌ Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

supabase.from('users').select('count', { count: 'exact', head: true })
    .then(({ count, error }) => {
        if (error) {
            console.log('❌ Database connection failed:', error.message);
            process.exit(1);
        }
        console.log('✅ Database connection successful');
        console.log('📊 Total users in database:', count || 0);
    })
    .catch(err => {
        console.log('❌ Database connection error:', err.message);
        process.exit(1);
    });
"

if [ $? -ne 0 ]; then
    echo "❌ Database connection test failed"
    exit 1
fi

echo ""
echo "🎯 Starting server in development mode..."
echo "📱 Server will be available at: http://localhost:3001"
echo "📊 Health check: http://localhost:3001/health"
echo "📚 API docs: http://localhost:3001/api"
echo ""
echo "🔄 Press Ctrl+C to stop the server"
echo ""

# Start the server
npm run dev
