#!/bin/bash
# deploy.sh - One-command deployment script

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║     AI Dispute Resolution - Deploy to Base Sepolia        ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo ""
    echo "Run these commands first:"
    echo "  cp .env.testnet .env"
    echo "  # Then edit .env with your PRIVATE_KEY and BASESCAN_API_KEY"
    exit 1
fi

# Check if PRIVATE_KEY is set
if ! grep -q "PRIVATE_KEY=." .env; then
    echo -e "${RED}❌ PRIVATE_KEY not set in .env${NC}"
    echo ""
    echo "Edit .env and add your private key (without 0x prefix)"
    exit 1
fi

echo -e "${GREEN}✓${NC} Environment configured"
echo ""

# Check node_modules
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install
    echo ""
fi

# Compile
echo -e "${YELLOW}🔨 Compiling contracts...${NC}"
npm run compile
echo ""

# Deploy
echo -e "${YELLOW}🚀 Deploying to Base Sepolia...${NC}"
echo ""
npm run deploy:sepolia

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✅ Deployment Complete!                               ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Check deployments/base-sepolia-latest.json for addresses"
echo "  2. Run: npm run test:deployment"
echo "  3. Run: npm run test:e2e"
echo "  4. Start frontend: npm run frontend:dev"
echo ""
