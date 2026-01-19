# 🚀 Base Mainnet Deployment Guide

## Pre-Deployment Checklist

### 1. Prerequisites
- [ ] Node.js >= 18.0.0 installed
- [ ] Git installed
- [ ] Funded wallet with **at least 0.1 ETH** on Base Mainnet
- [ ] Basescan API key (for verification)
- [ ] GenLayer API key (for AI verdicts)

### 2. Required Addresses
Before deploying, you need to decide on these addresses:

| Address | Purpose | Recommendation |
|---------|---------|----------------|
| **Treasury** | Receives 2.5% platform fees | Use a multisig (e.g., Safe) |
| **Relayer** | Submits AI verdicts on-chain | Dedicated hot wallet with ~0.1 ETH |
| **Deployer** | Deploys contracts | Can be any funded wallet |

---

## Deployment Steps

### Step 1: Clone & Install

```bash
git clone <your-repo>
cd base-ai-dispute-resolution
npm install
```

### Step 2: Configure Environment

```bash
# Copy the mainnet template
cp .env.mainnet .env

# Edit with your values
nano .env
```

**Required `.env` values:**
```bash
PRIVATE_KEY=<your-deployer-private-key-without-0x>
BASE_RPC_URL=https://mainnet.base.org
BASESCAN_API_KEY=<your-basescan-api-key>
TREASURY_ADDRESS=<your-treasury-address>
RELAYER_ADDRESS=<your-relayer-address>
```

### Step 3: Compile Contracts

```bash
npm run compile
```

Expected output:
```
Compiled 5 Solidity files successfully
```

### Step 4: Run Tests (Optional but Recommended)

```bash
npm test
```

### Step 5: Deploy to Mainnet

```bash
npm run deploy:mainnet
```

You will see:
```
⚠️ MAINNET DEPLOYMENT CONFIRMATION ⚠️

You are about to deploy to BASE MAINNET with REAL funds.

   Network:    Base Mainnet (Chain ID: 8453)
   Deployer:   0x...
   Balance:    0.15 ETH
   Treasury:   0x...
   Relayer:    0x...
   Est. Cost:  ~0.05-0.1 ETH

Type "DEPLOY TO MAINNET" to confirm:
```

Type `DEPLOY TO MAINNET` and press Enter.

### Step 6: Verify Deployment

```bash
npm run verify:mainnet
```

This checks:
- All contracts deployed correctly
- Roles configured properly
- Parameters set correctly

---

## Post-Deployment

### 1. Save Deployment Info
The deployment creates a file at:
```
deployments/base-mainnet-latest.json
```

**Back this up securely!** It contains all contract addresses.

### 2. Update Your .env
Add the deployed addresses:
```bash
DISPUTE_CONTRACT_ADDRESS=0x...
ORACLE_ADAPTER_ADDRESS=0x...
EVIDENCE_MANAGER_ADDRESS=0x...
REPUTATION_SYSTEM_ADDRESS=0x...
MULTI_TOKEN_DISPUTE_ADDRESS=0x...
```

### 3. Fund the Relayer
The relayer wallet needs ETH to submit AI verdicts:
```bash
# Send 0.1 ETH to your relayer address
```

### 4. Start the GenLayer Service
```bash
npm run genlayer:start
```

### 5. Start the Backend (Optional)
```bash
cd backend && npm install && npm start
```

### 6. Deploy Frontend
```bash
cd frontend && npm install && npm run build
# Deploy to Vercel/Netlify/etc.
```

---

## Contract Addresses (Fill After Deployment)

| Contract | Address | Basescan |
|----------|---------|----------|
| DisputeResolution | `0x...` | [View](https://basescan.org/address/...) |
| GenLayerOracleAdapter | `0x...` | [View](https://basescan.org/address/...) |
| EvidenceManager | `0x...` | [View](https://basescan.org/address/...) |
| ReputationSystem | `0x...` | [View](https://basescan.org/address/...) |
| MultiTokenDisputeResolution | `0x...` | [View](https://basescan.org/address/...) |

---

## Testing on Mainnet

### Create a Test Dispute
```javascript
// Using ethers.js
const disputeResolution = new ethers.Contract(
    DISPUTE_CONTRACT_ADDRESS,
    DisputeResolution.abi,
    signer
);

const tx = await disputeResolution.createDispute(
    "0xRespondentAddress",
    0, // ContractBreach
    "QmDescriptionHash",
    { value: ethers.parseEther("0.01") } // Start small!
);

await tx.wait();
console.log("Dispute created:", tx.hash);
```

---

## Troubleshooting

### "Insufficient funds"
- Ensure deployer has at least 0.1 ETH
- Gas prices may be higher than expected

### "Contract verification failed"
- Wait 1-2 minutes and run `npm run verify:mainnet` again
- Basescan may be slow to index

### "Relayer cannot submit verdicts"
- Check that RELAYER_ADDRESS has the RELAYER_ROLE
- Fund the relayer wallet with ETH

### "Treasury address mismatch"
- Cannot be changed after deployment
- Redeploy if wrong address used

---

## Security Reminders

1. **Never share your private keys**
2. **Use a multisig for treasury** (recommended: Safe)
3. **Keep relayer wallet separate** from main funds
4. **Monitor first disputes** closely
5. **Have incident response plan** ready

---

## Support

- GitHub Issues: [Link]
- Discord: [Link]
- Email: support@example.com

---

**Good luck with your deployment! 🎉**
