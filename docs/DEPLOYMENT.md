# Deployment Guide

This guide covers deploying the AI-Verified Dispute Resolution system to Base network.

## Prerequisites

### Required Software
- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### Required Accounts & Keys
- **Ethereum Wallet** with Base ETH for gas
- **Basescan API Key** for contract verification
- **GenLayer API Key** for AI consensus integration
- **Infura Account** for IPFS (optional)

### Minimum Balances
| Network | Minimum ETH |
|---------|-------------|
| Base Sepolia | 0.1 ETH |
| Base Mainnet | 0.5 ETH |

---

## Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/base-ai-dispute-resolution.git
cd base-ai-dispute-resolution
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
PRIVATE_KEY=your_deployer_private_key
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=your_basescan_api_key

# GenLayer
GENLAYER_ENDPOINT=https://api.genlayer.io
GENLAYER_API_KEY=your_genlayer_api_key
RELAYER_PRIVATE_KEY=your_relayer_private_key

# Treasury (platform fee recipient)
TREASURY_ADDRESS=0x...
RELAYER_ADDRESS=0x...

# Optional - IPFS
INFURA_IPFS_PROJECT_ID=your_project_id
INFURA_IPFS_SECRET=your_secret
```

---

## Local Development

### Start Local Node

```bash
npm run node
```

This starts a Hardhat node on `http://localhost:8545`.

### Deploy Locally

In a new terminal:

```bash
npm run deploy:local
```

### Run Tests

```bash
npm test
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

---

## Testnet Deployment (Base Sepolia)

### 1. Get Testnet ETH

- Use Base Sepolia faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

### 2. Deploy Contracts

```bash
npm run deploy:sepolia
```

### 3. Verify Deployment

The deployment script automatically verifies contracts. If verification fails:

```bash
npx hardhat verify --network base-sepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### 4. Update Environment

After deployment, update your `.env`:

```env
DISPUTE_CONTRACT_ADDRESS=0x...deployed_address
ORACLE_ADAPTER_ADDRESS=0x...deployed_address
EVIDENCE_MANAGER_ADDRESS=0x...deployed_address
```

---

## Mainnet Deployment (Base)

### Pre-Deployment Checklist

- [ ] All tests passing
- [ ] Code reviewed and audited
- [ ] Environment variables configured
- [ ] Sufficient ETH balance (recommend 0.5+ ETH)
- [ ] Treasury address finalized
- [ ] Relayer wallet funded

### 1. Final Review

```bash
# Compile contracts
npm run compile

# Run full test suite
npm test

# Check gas usage
npm run test:gas
```

### 2. Deploy to Mainnet

```bash
npm run deploy:base
```

### 3. Post-Deployment

1. **Verify contracts on Basescan**
   - The script attempts automatic verification
   - Manual verification if needed:
   ```bash
   npx hardhat verify --network base <ADDRESS> <ARGS>
   ```

2. **Save deployment info**
   - Deployment details saved to `./deployments/`
   - Back up this file securely

3. **Update configuration**
   - Update `.env` with deployed addresses
   - Update frontend configuration

4. **Test on mainnet**
   - Create a small test dispute
   - Verify all functionality works

---

## Service Deployment

### GenLayer Integration Service

```bash
# Start the service
npm run genlayer:start

# Or with PM2 for production
pm2 start services/genLayerIntegration.js --name genlayer-service
```

### Monitoring Service

```bash
# Start monitoring
npm run monitor:start

# Or with PM2
pm2 start services/monitoring.js --name monitoring-service
```

### Environment for Services

Additional `.env` variables for services:

```env
# Monitoring
HTTP_PORT=3001
WS_PORT=3002
METRICS_INTERVAL=60000
LOG_LEVEL=info
```

---

## Frontend Deployment

### Build Frontend

```bash
cd frontend
npm install
npm run build
```

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

### Deploy to Netlify

```bash
npm install -g netlify-cli
netlify deploy --prod
```

### Environment Variables for Frontend

Set in your hosting platform:

```
VITE_CONTRACT_ADDRESS=0x...
VITE_CHAIN_ID=8453
VITE_NETWORK_NAME=Base Mainnet
```

---

## Infrastructure Architecture

### Recommended Setup

```
┌─────────────────────────────────────────────────────────────┐
│                      Load Balancer                          │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Frontend CDN   │ │   API Server    │ │  WebSocket      │
│  (Vercel/CF)    │ │   (Node.js)     │ │  Server         │
└─────────────────┘ └─────────────────┘ └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Base L2 Node   │
                    │  (Infura/Alchemy)│
                    └─────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ GenLayer Service│ │ Monitoring      │ │  IPFS Gateway   │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Resource Recommendations

| Service | CPU | Memory | Storage |
|---------|-----|--------|---------|
| API Server | 2 vCPU | 4 GB | 20 GB |
| GenLayer Service | 1 vCPU | 2 GB | 10 GB |
| Monitoring | 1 vCPU | 2 GB | 50 GB |

---

## Security Considerations

### Private Keys

- Never commit private keys
- Use hardware wallets for mainnet
- Consider multi-sig for treasury

### Contract Security

- All contracts use ReentrancyGuard
- Role-based access control (RBAC)
- Pausable functionality

### Operational Security

- Enable 2FA on all accounts
- Rotate API keys regularly
- Monitor for unusual activity

---

## Upgradeability

The current contracts are **not upgradeable**. For future upgrades:

1. Deploy new contracts
2. Migrate active disputes (if possible)
3. Update frontend to new addresses
4. Deprecate old contracts

For upgradeable contracts, consider:
- OpenZeppelin Transparent Proxy
- UUPS Pattern

---

## Monitoring & Alerts

### Recommended Alerts

| Alert | Threshold | Action |
|-------|-----------|--------|
| High Value Dispute | > 10 ETH | Manual review |
| Low Confidence | < 60% | Flag for review |
| Long Resolution | > 7 days | Investigate |
| Contract Paused | N/A | Immediate action |

### Monitoring Endpoints

- Health: `GET /health`
- Metrics: `GET /api/metrics`
- WebSocket: `ws://server/ws`

---

## Troubleshooting

### Common Issues

**Deployment fails with "insufficient funds"**
- Ensure wallet has enough ETH
- Check gas price settings

**Contract verification fails**
- Wait 30-60 seconds after deployment
- Ensure Basescan API key is valid
- Try manual verification

**GenLayer service not receiving events**
- Check RPC URL is correct
- Verify contract addresses
- Check relayer has ORACLE_ROLE

### Support

- GitHub Issues: https://github.com/your-org/base-ai-dispute-resolution/issues
- Discord: https://discord.gg/example
- Email: support@example.com

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial release |

---

## License

MIT License - See [LICENSE](../LICENSE) for details.
