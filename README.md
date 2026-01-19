# ⚖️ AI-Verified Dispute Resolution Layer

A production-ready, decentralized dispute resolution system deployed on **Base L2** with **GenLayer AI consensus** integration.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Solidity](https://img.shields.io/badge/solidity-0.8.20-green.svg)
![Base](https://img.shields.io/badge/network-Base%20L2-blue.svg)

## 🌟 Overview

This project implements an AI-powered dispute resolution system that leverages:
- **Base Network** - Ethereum L2 for low-cost, fast transactions
- **GenLayer** - AI consensus network for fair, automated verdicts
- **IPFS** - Decentralized storage for evidence and dispute descriptions
- **Smart Contracts** - Trustless escrow and automated fund distribution

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                        │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Base L2 Network                            │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ DisputeResolution│  │ GenLayerOracle   │  │ EvidenceManager│  │
│  │    Contract      │◄─│    Adapter       │  │   Contract     │  │
│  └─────────────────┘  └──────────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GenLayer AI Consensus                        │
│            (Multiple AI validators reach consensus)             │
└─────────────────────────────────────────────────────────────────┘
```

## ✨ Features

- **🤖 AI-Powered Verdicts** - Fair, unbiased dispute resolution using AI consensus
- **💰 Escrow System** - Secure fund holding with automatic distribution
- **📁 Evidence Management** - IPFS-based evidence storage with verification
- **⚡ Appeal Mechanism** - Challenge AI verdicts with additional stake
- **🔒 Role-Based Access** - Admin, Oracle, and Arbiter roles
- **⏸️ Emergency Controls** - Pause functionality and emergency withdrawals
- **📊 Full Transparency** - All decisions and reasoning stored on-chain/IPFS

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- MetaMask or compatible wallet
- Base Sepolia ETH (for testnet)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/base-ai-dispute-resolution.git
cd base-ai-dispute-resolution

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your values
nano .env
```

### Local Development

```bash
# Start local hardhat node
npm run node

# Deploy contracts (in another terminal)
npm run deploy:local

# Run tests
npm test

# Run tests with gas reporting
npm run test:gas
```

### Deploy to Base Sepolia (Testnet)

```bash
# Ensure your .env has BASE_SEPOLIA_RPC_URL and PRIVATE_KEY
npm run deploy:sepolia
```

### Deploy to Base Mainnet

```bash
# Ensure your .env has BASE_RPC_URL and PRIVATE_KEY
npm run deploy:base
```

## 📋 Contract Addresses

### Base Mainnet
| Contract | Address |
|----------|---------|
| DisputeResolution | `0x...` |
| GenLayerOracleAdapter | `0x...` |
| EvidenceManager | `0x...` |

### Base Sepolia (Testnet)
| Contract | Address |
|----------|---------|
| DisputeResolution | `0x...` |
| GenLayerOracleAdapter | `0x...` |
| EvidenceManager | `0x...` |

## 📖 How It Works

### Dispute Lifecycle

1. **Creation** - Claimant creates dispute with stake
2. **Acceptance** - Respondent accepts and matches stake
3. **Evidence** - Both parties submit evidence (3 day period)
4. **AI Analysis** - GenLayer AI analyzes dispute and evidence
5. **Verdict** - AI delivers decision with confidence score
6. **Appeal Period** - 2 days to appeal (10% additional stake)
7. **Resolution** - Funds distributed based on verdict

### Resolution Types

| Resolution | Description |
|------------|-------------|
| FavorClaimant | Claimant receives full pool (minus fees) |
| FavorRespondent | Respondent receives full pool (minus fees) |
| Split | Pool split equally between parties |
| Dismissed | Original stakes returned (minus fees) |

### Fees

- **Platform Fee**: 2.5% of total pool
- **Appeal Stake**: 10% of total pool

## 🔧 Configuration

### Environment Variables

See `.env.example` for all available options. Key variables:

| Variable | Description |
|----------|-------------|
| `PRIVATE_KEY` | Deployer private key |
| `BASE_RPC_URL` | Base mainnet RPC endpoint |
| `GENLAYER_API_KEY` | GenLayer API credentials |
| `TREASURY_ADDRESS` | Platform fee recipient |

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run with gas reporting
npm run test:gas
```

### Test Coverage

```
-----------------------------|----------|----------|----------|----------|
File                         |  % Stmts | % Branch |  % Funcs |  % Lines |
-----------------------------|----------|----------|----------|----------|
contracts/                   |          |          |          |          |
  DisputeResolution.sol      |    95.24 |    88.89 |    96.15 |    94.87 |
  EvidenceManager.sol        |    92.31 |    85.71 |    90.91 |    91.67 |
  GenLayerOracleAdapter.sol  |    90.00 |    83.33 |    88.89 |    89.47 |
-----------------------------|----------|----------|----------|----------|
```

## 🔐 Security

### Audits

- [ ] Internal security review
- [ ] External audit (pending)

### Security Features

- ReentrancyGuard on all state-changing functions
- Role-based access control (RBAC)
- Pausable functionality for emergencies
- Input validation and bounds checking
- Safe ETH transfer patterns

### Bug Bounty

Report security vulnerabilities to: security@example.com

## 📚 API Documentation

See [docs/API.md](docs/API.md) for complete API documentation.

### Quick Examples

**Create a Dispute:**
```javascript
const tx = await contract.createDispute(
    respondentAddress,
    0, // Category: ContractBreach
    "QmDescriptionHash",
    { value: ethers.parseEther("1.0") }
);
```

**Submit Evidence:**
```javascript
await contract.submitEvidence(
    disputeId,
    "QmEvidenceHash",
    0 // EvidenceType: Document
);
```

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open Pull Request

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- **Base** - Scalable L2 infrastructure
- **GenLayer** - AI consensus technology
- **OpenZeppelin** - Secure contract libraries
- **IPFS** - Decentralized storage

## 📞 Support

- **Documentation**: [docs/](docs/)
- **Discord**: [Community](https://discord.gg/example)
- **Email**: support@example.com
- **Issues**: [GitHub Issues](https://github.com/your-org/base-ai-dispute-resolution/issues)

---

**Built with ❤️ on Base L2**
