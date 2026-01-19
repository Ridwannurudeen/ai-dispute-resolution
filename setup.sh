#!/bin/bash
# setup.sh - Quick setup script for AI Dispute Resolution

set -e

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     AI Dispute Resolution - Setup Script                  ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ required. Found: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not found"
    exit 1
fi
echo "✅ npm $(npm -v)"

# Install root dependencies
echo ""
echo "📦 Installing main dependencies..."
npm install

# Install backend dependencies
echo ""
echo "📦 Installing backend dependencies..."
cd backend && npm install && cd ..

# Install frontend dependencies
echo ""
echo "📦 Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Setup environment
echo ""
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cp .env.testnet .env
    echo "✅ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Edit .env and add your:"
    echo "   - PRIVATE_KEY"
    echo "   - BASESCAN_API_KEY"
else
    echo "✅ .env already exists"
fi

# Create deployments directory
mkdir -p deployments

# Summary
echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     ✅ Setup Complete!                                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  1. Edit .env with your private key and API keys"
echo "  2. Get testnet ETH from:"
echo "     https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet"
echo "  3. Compile contracts:"
echo "     npm run compile"
echo "  4. Run tests:"
echo "     npm test"
echo "  5. Deploy to testnet:"
echo "     npm run deploy:sepolia"
echo ""
