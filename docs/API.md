# API Documentation

## Overview

The AI-Verified Dispute Resolution system provides multiple interfaces for interaction:
- **Smart Contract API** - Direct blockchain interaction
- **REST API** - HTTP endpoints for queries and monitoring
- **WebSocket API** - Real-time event streaming
- **JavaScript SDK** - Client library for easy integration

---

## Smart Contract API

### Contract Addresses

| Network | Contract | Address |
|---------|----------|---------|
| Base Mainnet | DisputeResolution | `0x...` |
| Base Mainnet | GenLayerOracleAdapter | `0x...` |
| Base Mainnet | EvidenceManager | `0x...` |
| Base Sepolia | DisputeResolution | `0x...` |

### Core Functions

#### createDispute

Create a new dispute with an initial stake.

```solidity
function createDispute(
    address _respondent,
    uint8 _category,
    string calldata _descriptionHash
) external payable returns (uint256)
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| _respondent | address | Address of the party being disputed against |
| _category | uint8 | Dispute category (0-5) |
| _descriptionHash | string | IPFS hash of dispute description |

**Returns:** `uint256` - The ID of the created dispute

**Category Values:**
| Value | Category |
|-------|----------|
| 0 | ContractBreach |
| 1 | ServiceQuality |
| 2 | PaymentDispute |
| 3 | IntellectualProperty |
| 4 | FraudClaim |
| 5 | Other |

**Example:**
```javascript
const tx = await contract.createDispute(
    "0xRespondentAddress",
    0, // ContractBreach
    "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
    { value: ethers.parseEther("1.0") }
);
```

---

#### acceptDispute

Accept a dispute and stake matching amount (respondent only).

```solidity
function acceptDispute(uint256 _disputeId) external payable
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| _disputeId | uint256 | ID of the dispute to accept |

**Requirements:**
- Caller must be the respondent
- msg.value must equal the dispute amount
- Dispute status must be `Created`

---

#### submitEvidence

Submit evidence for a dispute.

```solidity
function submitEvidence(
    uint256 _disputeId,
    string calldata _contentHash,
    uint8 _evidenceType
) external
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| _disputeId | uint256 | ID of the dispute |
| _contentHash | string | IPFS hash of evidence content |
| _evidenceType | uint8 | Type of evidence (0-6) |

**Evidence Types:**
| Value | Type |
|-------|------|
| 0 | Document |
| 1 | Image |
| 2 | Video |
| 3 | Contract |
| 4 | Communication |
| 5 | Transaction |
| 6 | Other |

---

#### requestAIVerdict

Request AI analysis and verdict from GenLayer.

```solidity
function requestAIVerdict(uint256 _disputeId) external
```

**Requirements:**
- Dispute must be in `EvidenceSubmission` status
- Evidence period must be complete OR at least 2 evidence items submitted

---

#### appealVerdict

Appeal an AI verdict with additional stake.

```solidity
function appealVerdict(uint256 _disputeId) external payable
```

**Requirements:**
- Dispute must be in `VerdictDelivered` status
- Within appeal period (2 days after verdict)
- msg.value must be at least 10% of total pool

---

#### finalizeDispute

Execute the final resolution and distribute funds.

```solidity
function finalizeDispute(uint256 _disputeId) external
```

**Requirements:**
- Dispute must be in `VerdictDelivered` or `AppealPeriod` status
- Appeal period must have ended

---

#### cancelDispute

Cancel a dispute before acceptance (claimant only).

```solidity
function cancelDispute(uint256 _disputeId) external
```

**Requirements:**
- Caller must be the claimant
- Dispute status must be `Created`

---

### View Functions

#### getDispute

```solidity
function getDispute(uint256 _disputeId) external view returns (Dispute memory)
```

**Returns Dispute struct:**
```solidity
struct Dispute {
    uint256 id;
    address claimant;
    address respondent;
    uint256 amount;
    uint256 createdAt;
    uint256 evidenceDeadline;
    uint256 appealDeadline;
    DisputeStatus status;
    Resolution resolution;
    DisputeCategory category;
    string descriptionHash;
    uint8 aiConfidenceScore;
    bool appealed;
}
```

---

#### getDisputeEvidence

```solidity
function getDisputeEvidence(uint256 _disputeId) external view returns (Evidence[] memory)
```

---

#### getAIVerdict

```solidity
function getAIVerdict(uint256 _disputeId) external view returns (AIVerdict memory)
```

**Returns AIVerdict struct:**
```solidity
struct AIVerdict {
    Resolution decision;
    uint8 confidenceScore;
    string reasoningHash;
    uint256 timestamp;
    bytes32 genLayerRequestId;
}
```

---

#### getUserDisputes

```solidity
function getUserDisputes(address _user) external view returns (uint256[] memory)
```

---

### Events

#### DisputeCreated
```solidity
event DisputeCreated(
    uint256 indexed disputeId,
    address indexed claimant,
    address indexed respondent,
    uint256 amount,
    DisputeCategory category
);
```

#### EvidenceSubmitted
```solidity
event EvidenceSubmitted(
    uint256 indexed disputeId,
    address indexed submitter,
    string contentHash,
    EvidenceType evidenceType
);
```

#### AIVerdictRequested
```solidity
event AIVerdictRequested(
    uint256 indexed disputeId,
    bytes32 indexed genLayerRequestId
);
```

#### AIVerdictReceived
```solidity
event AIVerdictReceived(
    uint256 indexed disputeId,
    Resolution resolution,
    uint8 confidenceScore
);
```

#### DisputeAppealed
```solidity
event DisputeAppealed(
    uint256 indexed disputeId,
    address indexed appealer,
    uint256 stakeAmount
);
```

#### DisputeResolved
```solidity
event DisputeResolved(
    uint256 indexed disputeId,
    Resolution resolution,
    uint256 claimantPayout,
    uint256 respondentPayout
);
```

---

## REST API

Base URL: `https://api.dispute-resolution.example.com`

### Endpoints

#### GET /health

Health check endpoint.

**Response:**
```json
{
    "status": "healthy",
    "timestamp": 1704067200000
}
```

---

#### GET /api/metrics

Get comprehensive platform metrics.

**Response:**
```json
{
    "totalDisputes": 150,
    "activeDisputes": 12,
    "resolvedDisputes": 135,
    "cancelledDisputes": 3,
    "totalValueLocked": "45.5",
    "averageResolutionTime": 345600,
    "averageConfidenceScore": 87,
    "disputesByCategory": {
        "0": 45,
        "1": 30,
        "2": 50,
        "3": 15,
        "4": 5,
        "5": 5
    },
    "timestamp": 1704067200000
}
```

---

#### GET /api/stats

Get summary statistics.

**Response:**
```json
{
    "totalDisputes": 150,
    "activeDisputes": 12,
    "resolvedDisputes": 135,
    "totalValueLocked": "45.5",
    "averageResolutionTime": 345600,
    "averageConfidenceScore": 87,
    "timestamp": 1704067200000
}
```

---

#### GET /api/events

Get recent events.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| limit | number | 50 | Max events to return (max 100) |

**Response:**
```json
{
    "events": [
        {
            "type": "DisputeCreated",
            "disputeId": "42",
            "claimant": "0x...",
            "respondent": "0x...",
            "amount": "1.0",
            "category": 0,
            "timestamp": 1704067200000,
            "txHash": "0x..."
        }
    ],
    "total": 100
}
```

---

#### GET /api/disputes/:id

Get specific dispute details.

**Response:**
```json
{
    "id": "42",
    "claimant": "0x...",
    "respondent": "0x...",
    "amount": "1.0",
    "status": 3,
    "resolution": 1,
    "category": 0,
    "aiConfidenceScore": 85,
    "createdAt": 1704067200,
    "evidenceDeadline": 1704326400,
    "appealDeadline": 1704499200,
    "appealed": false
}
```

---

#### GET /api/analytics/categories

Get disputes grouped by category.

**Response:**
```json
{
    "data": [
        { "category": "ContractBreach", "count": 45 },
        { "category": "ServiceQuality", "count": 30 },
        { "category": "PaymentDispute", "count": 50 },
        { "category": "IntellectualProperty", "count": 15 },
        { "category": "FraudClaim", "count": 5 },
        { "category": "Other", "count": 5 }
    ]
}
```

---

#### GET /api/analytics/resolutions

Get disputes grouped by resolution type.

**Response:**
```json
{
    "data": [
        { "resolution": "None", "count": 12 },
        { "resolution": "FavorClaimant", "count": 60 },
        { "resolution": "FavorRespondent", "count": 45 },
        { "resolution": "Split", "count": 25 },
        { "resolution": "Dismissed", "count": 8 }
    ]
}
```

---

## WebSocket API

### Connection

```javascript
const ws = new WebSocket('wss://api.dispute-resolution.example.com/ws');
```

### Message Types

#### metrics
Sent on connection and periodically with updated metrics.

```json
{
    "type": "metrics",
    "data": {
        "totalDisputes": 150,
        "activeDisputes": 12,
        "resolvedDisputes": 135,
        "totalValueLocked": "45.5"
    }
}
```

#### event
Real-time blockchain events.

```json
{
    "type": "event",
    "data": {
        "type": "DisputeCreated",
        "disputeId": "42",
        "claimant": "0x...",
        "respondent": "0x...",
        "amount": "1.0",
        "timestamp": 1704067200000
    }
}
```

#### alert
System alerts (high value disputes, low confidence verdicts, etc.)

```json
{
    "type": "alert",
    "alertType": "HIGH_VALUE_DISPUTE",
    "data": {
        "disputeId": "42",
        "amount": "100.0"
    },
    "timestamp": 1704067200000
}
```

---

## JavaScript SDK

### Installation

```bash
npm install @example/dispute-resolution-sdk
```

### Basic Usage

```javascript
import { DisputeResolution } from '@example/dispute-resolution-sdk';

// Initialize
const dr = new DisputeResolution({
    provider: window.ethereum,
    network: 'base-mainnet' // or 'base-sepolia'
});

// Connect wallet
await dr.connect();

// Create dispute
const disputeId = await dr.createDispute({
    respondent: '0x...',
    category: 'ContractBreach',
    amount: '1.0',
    description: 'Service not delivered as promised'
});

// Submit evidence
await dr.submitEvidence(disputeId, {
    file: evidenceFile,
    type: 'Document',
    description: 'Contract PDF'
});

// Listen for events
dr.on('AIVerdictReceived', (event) => {
    console.log('Verdict:', event.resolution);
    console.log('Confidence:', event.confidenceScore);
});

// Get dispute details
const dispute = await dr.getDispute(disputeId);
console.log(dispute);
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Smart Contract | Gas-limited by network |
| REST API | 100 requests/minute |
| WebSocket | 1000 messages/minute |
| IPFS Upload | 50 uploads/hour |

---

## Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 1001 | Amount too low | Below MIN_DISPUTE_AMOUNT (0.001 ETH) |
| 1002 | Amount too high | Above MAX_DISPUTE_AMOUNT (1000 ETH) |
| 1003 | Invalid respondent | Zero address or same as claimant |
| 1004 | Not respondent | Caller is not the dispute respondent |
| 1005 | Invalid status | Operation not allowed in current status |
| 1006 | Evidence period ended | Cannot submit evidence |
| 1007 | Appeal period active | Cannot finalize during appeal |
| 1008 | Insufficient appeal stake | Need 10% of dispute pool |
| 1009 | Not claimant | Only claimant can cancel |
| 1010 | Already appealed | Dispute already appealed |

---

## Support

- **Documentation**: https://docs.example.com
- **Discord**: https://discord.gg/example
- **GitHub Issues**: https://github.com/your-org/base-ai-dispute-resolution/issues
- **Email**: api-support@example.com
