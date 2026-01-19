# 🚀 QUICKSTART GUIDE - AI Dispute Resolution on Base

## Prerequisites

- Node.js 18+ installed
- A wallet with private key
- ~0.1 ETH on Base Sepolia testnet

---

## Step 1: Setup (5 minutes)

```bash
# 1. Navigate to project
cd base-ai-dispute-resolution

# 2. Install dependencies
npm install

# 3. Install backend dependencies
cd backend && npm install && cd ..

# 4. Install frontend dependencies
cd frontend && npm install && cd ..

# 5. Copy environment file
cp .env.testnet .env
```

---

## Step 2: Configure Environment (2 minutes)

Edit `.env` file:

```bash
# REQUIRED - Your deployer wallet private key (without 0x)
PRIVATE_KEY=abc123...your_private_key_here

# REQUIRED - Get from https://basescan.org/myapikey
BASESCAN_API_KEY=your_api_key

# REQUIRED - Base Sepolia RPC (free, no signup)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

---

## Step 3: Get Testnet ETH (2 minutes)

1. Go to: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
2. Connect your wallet
3. Request 0.1 ETH (enough for deployment + testing)

---

## Step 4: Compile Contracts (1 minute)

```bash
npm run compile
```

Expected output:
```
Compiled 5 Solidity files successfully
```

---

## Step 5: Run Tests (2 minutes)

```bash
npm test
```

Expected: All 40+ tests passing

---

## Step 6: Deploy to Base Sepolia (5 minutes)

```bash
npm run deploy:sepolia
```

Expected output:
```
🚀 AI DISPUTE RESOLUTION - TESTNET DEPLOYMENT
============================================

📡 Network: base-sepolia (Chain ID: 84532)
👤 Deployer: 0x...
💰 Balance: 0.1 ETH

📦 [1/5] Deploying EvidenceManager...
   ✅ EvidenceManager: 0x...

📦 [2/5] Deploying GenLayerOracleAdapter...
   ✅ GenLayerOracleAdapter: 0x...

📦 [3/5] Deploying DisputeResolution...
   ✅ DisputeResolution: 0x...

📦 [4/5] Deploying ReputationSystem...
   ✅ ReputationSystem: 0x...

📦 [5/5] Deploying MultiTokenDisputeResolution...
   ✅ MultiTokenDisputeResolution: 0x...

✅ DEPLOYMENT COMPLETE!
```

**Save the contract addresses!** They'll be in `deployments/base-sepolia-latest.json`

---

## Step 7: Update Environment with Deployed Addresses

After deployment, add to `.env`:

```bash
DISPUTE_CONTRACT_ADDRESS=0x...  # From deployment output
ORACLE_ADAPTER_ADDRESS=0x...
EVIDENCE_MANAGER_ADDRESS=0x...
REPUTATION_SYSTEM_ADDRESS=0x...
MULTI_TOKEN_DISPUTE_ADDRESS=0x...
```

---

## Step 8: Test Deployment (2 minutes)

```bash
npm run test:deployment
```

This will:
- Verify all contracts are deployed
- Create a test dispute
- Check all functions work

---

## Step 9: Start Backend Services

Terminal 1 - Backend API:
```bash
npm run backend:dev
```

Terminal 2 - Monitoring Service:
```bash
npm run monitor:start
```

Terminal 3 - GenLayer Integration:
```bash
npm run genlayer:start
```

---

## Step 10: Start Frontend

```bash
# Update frontend config
echo "VITE_CONTRACT_ADDRESS=0x_YOUR_DISPUTE_CONTRACT" > frontend/.env

# Start development server
npm run frontend:dev
```

Open http://localhost:3000

---

## 🎉 You're Live!

Your dispute resolution platform is now running on Base Sepolia testnet.

### Test it:

1. **Connect Wallet** - Use MetaMask on Base Sepolia
2. **Create Dispute** - Enter respondent address, amount, description
3. **Submit Evidence** - Upload files to IPFS
4. **Request Verdict** - Trigger AI analysis
5. **View Results** - See resolution and payouts

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run compile` | Compile contracts |
| `npm test` | Run test suite |
| `npm run deploy:sepolia` | Deploy to testnet |
| `npm run test:deployment` | Test deployed contracts |
| `npm run frontend:dev` | Start frontend |
| `npm run backend:dev` | Start backend |
| `npm run monitor:start` | Start monitoring |
| `npm run docker:up` | Start all with Docker |

---

## Troubleshooting

### "Insufficient funds"
→ Get more testnet ETH from the faucet

### "Contract not verified"
→ Run: `npx hardhat verify --network base-sepolia CONTRACT_ADDRESS CONSTRUCTOR_ARGS`

### "Transaction failed"
→ Check gas price, increase if network is congested

### "IPFS upload failed"
→ Configure Infura IPFS keys in `.env`

---

## Next Steps

1. ✅ **Testnet working** - You are here
2. 🔜 **Get GenLayer API access** - Contact GenLayer team
3. 🔜 **Security audit** - Before mainnet
4. 🔜 **Mainnet deployment** - Run `npm run deploy:mainnet`

---

## Support

- GitHub Issues: [your-repo]/issues
- Documentation: `docs/` folder
- API Reference: `docs/API.md`
