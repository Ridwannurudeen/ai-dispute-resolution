# 🚀 DEPLOYMENT CHECKLIST

## Pre-Deployment (Do These First)

### 1. Get Your API Keys
- [ ] **Basescan API Key**: https://basescan.org/myapikey (free, takes 2 min)
- [ ] **Wallet Private Key**: Export from MetaMask (Settings → Security → Export)

### 2. Get Testnet ETH
- [ ] Go to: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- [ ] Connect wallet, request 0.1 ETH
- [ ] Wait ~30 seconds for confirmation

### 3. Configure Environment
```bash
# Copy the template
cp .env.testnet .env

# Edit .env and fill in:
PRIVATE_KEY=your_private_key_without_0x_prefix
BASESCAN_API_KEY=your_basescan_api_key
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

---

## Deployment Commands (Run In Order)

```bash
# Step 1: Install dependencies
npm install

# Step 2: Compile contracts
npm run compile

# Step 3: Run tests (optional but recommended)
npm test

# Step 4: Deploy to Base Sepolia
npm run deploy:sepolia

# Step 5: Test the deployment
npm run test:deployment

# Step 6: Run end-to-end test
npm run test:e2e
```

---

## Post-Deployment

After successful deployment, you'll see output like:
```
✅ DEPLOYMENT COMPLETE!

📋 Contract Addresses:

   EvidenceManager:
   0x1234...
   
   GenLayerOracleAdapter:
   0x5678...
   
   DisputeResolution:
   0x9abc...
   
   ReputationSystem:
   0xdef0...
   
   MultiTokenDisputeResolution:
   0x1357...
```

### Update your .env with deployed addresses:
```bash
DISPUTE_CONTRACT_ADDRESS=0x...
ORACLE_ADAPTER_ADDRESS=0x...
EVIDENCE_MANAGER_ADDRESS=0x...
REPUTATION_SYSTEM_ADDRESS=0x...
MULTI_TOKEN_DISPUTE_ADDRESS=0x...
```

### Start services:
```bash
# Terminal 1: Backend
npm run backend:dev

# Terminal 2: Frontend
npm run frontend:dev

# Terminal 3: Monitoring (optional)
npm run monitor:start
```

---

## Verify on Basescan

Your contracts should auto-verify during deployment. If not:
```bash
npx hardhat verify --network base-sepolia CONTRACT_ADDRESS CONSTRUCTOR_ARGS
```

View your contracts:
- https://sepolia.basescan.org/address/YOUR_CONTRACT_ADDRESS

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Insufficient funds" | Get more ETH from faucet |
| "Nonce too high" | Reset account in MetaMask |
| "Contract not verified" | Run verify command manually |
| "Network error" | Check RPC URL in .env |
| "Invalid private key" | Remove 0x prefix from key |

---

## Success Criteria

- [ ] All 5 contracts deployed
- [ ] Contracts verified on Basescan
- [ ] test:deployment passes
- [ ] test:e2e creates and cancels a dispute
- [ ] Frontend connects to contracts

---

## Next Phase: Mainnet

Once testnet is stable:
1. Complete security audit
2. Get GenLayer production API key
3. Set up multisig treasury
4. Run: `npm run deploy:mainnet`
