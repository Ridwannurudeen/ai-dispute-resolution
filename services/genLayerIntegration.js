// services/genLayerIntegration.js
/**
 * GenLayer AI Consensus Integration Service
 * Handles communication between Base L2 contracts and GenLayer network
 */

const { ethers } = require('ethers');
const axios = require('axios');

class GenLayerService {
    constructor(config) {
        this.config = {
            genLayerEndpoint: config.genLayerEndpoint || process.env.GENLAYER_ENDPOINT,
            genLayerApiKey: config.genLayerApiKey || process.env.GENLAYER_API_KEY,
            baseRpcUrl: config.baseRpcUrl || process.env.BASE_RPC_URL,
            oracleAdapterAddress: config.oracleAdapterAddress,
            disputeContractAddress: config.disputeContractAddress,
            relayerPrivateKey: config.relayerPrivateKey || process.env.RELAYER_PRIVATE_KEY,
            ipfsGateway: config.ipfsGateway || 'https://ipfs.io/ipfs/',
            pollingInterval: config.pollingInterval || 30000, // 30 seconds
        };

        this.provider = new ethers.JsonRpcProvider(this.config.baseRpcUrl);
        this.relayerWallet = new ethers.Wallet(this.config.relayerPrivateKey, this.provider);
        
        this.oracleAdapterAbi = [
            "function fulfillRequest(bytes32 _requestId, uint8 _resolution, uint8 _confidenceScore, string calldata _reasoningHash) external",
            "function failRequest(bytes32 _requestId, string calldata _reason) external",
            "function getRequest(bytes32 _requestId) external view returns (tuple(uint256 disputeId, address disputeContract, bytes32 requestId, uint256 timestamp, uint8 status, string prompt))",
            "event OracleRequestCreated(bytes32 indexed requestId, uint256 indexed disputeId, string prompt)"
        ];

        this.disputeAbi = [
            "function getDispute(uint256 _disputeId) external view returns (tuple(uint256 id, address claimant, address respondent, uint256 amount, uint256 createdAt, uint256 evidenceDeadline, uint256 appealDeadline, uint8 status, uint8 resolution, uint8 category, string descriptionHash, uint8 aiConfidenceScore, bool appealed))",
            "function getDisputeEvidence(uint256 _disputeId) external view returns (tuple(address submitter, string contentHash, uint256 timestamp, uint8 evidenceType)[])"
        ];

        this.oracleAdapter = new ethers.Contract(
            this.config.oracleAdapterAddress,
            this.oracleAdapterAbi,
            this.relayerWallet
        );

        this.disputeContract = new ethers.Contract(
            this.config.disputeContractAddress,
            this.disputeAbi,
            this.provider
        );

        this.pendingRequests = new Map();
        this.isRunning = false;
    }

    /**
     * Start the GenLayer integration service
     */
    async start() {
        console.log('🚀 Starting GenLayer Integration Service...');
        this.isRunning = true;

        // Start listening for oracle requests
        this.startEventListener();

        // Start polling for pending requests
        this.startPolling();

        console.log('✅ GenLayer Integration Service started');
    }

    /**
     * Stop the service
     */
    async stop() {
        console.log('🛑 Stopping GenLayer Integration Service...');
        this.isRunning = false;
        this.oracleAdapter.removeAllListeners();
        console.log('✅ Service stopped');
    }

    /**
     * Listen for OracleRequestCreated events
     */
    startEventListener() {
        this.oracleAdapter.on('OracleRequestCreated', async (requestId, disputeId, prompt) => {
            console.log(`📥 New oracle request: ${requestId} for dispute ${disputeId}`);
            
            try {
                await this.processOracleRequest(requestId, disputeId, prompt);
            } catch (error) {
                console.error(`❌ Error processing request ${requestId}:`, error.message);
                await this.failRequest(requestId, error.message);
            }
        });

        console.log('👂 Listening for oracle requests...');
    }

    /**
     * Poll for pending requests
     */
    startPolling() {
        setInterval(async () => {
            if (!this.isRunning) return;
            
            // Check pending requests status
            for (const [requestId, data] of this.pendingRequests) {
                try {
                    const status = await this.checkGenLayerStatus(data.genLayerTaskId);
                    
                    if (status.completed) {
                        await this.deliverVerdict(requestId, status.result);
                        this.pendingRequests.delete(requestId);
                    } else if (status.failed) {
                        await this.failRequest(requestId, status.error);
                        this.pendingRequests.delete(requestId);
                    }
                } catch (error) {
                    console.error(`❌ Error checking request ${requestId}:`, error.message);
                }
            }
        }, this.config.pollingInterval);
    }

    /**
     * Process an oracle request
     */
    async processOracleRequest(requestId, disputeId, prompt) {
        console.log(`🔄 Processing request ${requestId}...`);

        // Fetch dispute details
        const dispute = await this.disputeContract.getDispute(disputeId);
        const evidence = await this.disputeContract.getDisputeEvidence(disputeId);

        // Fetch content from IPFS
        const disputeDescription = await this.fetchFromIPFS(dispute.descriptionHash);
        const evidenceContents = await Promise.all(
            evidence.map(async (e) => ({
                submitter: e.submitter,
                content: await this.fetchFromIPFS(e.contentHash),
                type: this.getEvidenceTypeName(e.evidenceType),
                timestamp: e.timestamp.toString()
            }))
        );

        // Build comprehensive prompt for GenLayer
        const fullPrompt = this.buildGenLayerPrompt(dispute, disputeDescription, evidenceContents);

        // Submit to GenLayer
        const genLayerTaskId = await this.submitToGenLayer(fullPrompt);

        // Store pending request
        this.pendingRequests.set(requestId, {
            disputeId: disputeId.toString(),
            genLayerTaskId,
            submittedAt: Date.now()
        });

        console.log(`✅ Submitted to GenLayer: Task ${genLayerTaskId}`);
    }

    /**
     * Build comprehensive prompt for AI analysis
     */
    buildGenLayerPrompt(dispute, description, evidence) {
        const categoryNames = [
            'Contract Breach',
            'Service Quality',
            'Payment Dispute',
            'Intellectual Property',
            'Fraud Claim',
            'Other'
        ];

        return `
## AI DISPUTE RESOLUTION ANALYSIS

### Dispute Information
- **Dispute ID**: ${dispute.id}
- **Category**: ${categoryNames[dispute.category] || 'Unknown'}
- **Amount at Stake**: ${ethers.formatEther(dispute.amount)} ETH (each party)
- **Created**: ${new Date(Number(dispute.createdAt) * 1000).toISOString()}

### Claimant Address
${dispute.claimant}

### Respondent Address
${dispute.respondent}

### Dispute Description
${description || 'No description provided'}

### Submitted Evidence
${evidence.map((e, i) => `
#### Evidence ${i + 1} (${e.type})
- Submitted by: ${e.submitter}
- Timestamp: ${new Date(Number(e.timestamp) * 1000).toISOString()}
- Content:
${e.content || 'Content not available'}
`).join('\n')}

### Instructions
Analyze this dispute carefully considering:
1. The category and nature of the dispute
2. All submitted evidence from both parties
3. Standard legal and ethical principles
4. Fairness and proportionality

Provide a resolution with the following format:
- RESOLUTION: One of [FAVOR_CLAIMANT, FAVOR_RESPONDENT, SPLIT, DISMISSED]
- CONFIDENCE: A score from 0-100 indicating certainty
- REASONING: Detailed explanation of the decision

Respond in JSON format:
{
    "resolution": "FAVOR_CLAIMANT|FAVOR_RESPONDENT|SPLIT|DISMISSED",
    "confidence": <0-100>,
    "reasoning": "Detailed explanation..."
}
`;
    }

    /**
     * Submit analysis request to GenLayer
     */
    async submitToGenLayer(prompt) {
        try {
            const response = await axios.post(
                `${this.config.genLayerEndpoint}/v1/consensus/submit`,
                {
                    prompt,
                    model: 'dispute-resolver-v1',
                    consensus_type: 'majority',
                    min_validators: 3,
                    timeout: 300 // 5 minutes
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.genLayerApiKey}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return response.data.task_id;
        } catch (error) {
            console.error('GenLayer submission error:', error.response?.data || error.message);
            throw new Error(`GenLayer submission failed: ${error.message}`);
        }
    }

    /**
     * Check GenLayer task status
     */
    async checkGenLayerStatus(taskId) {
        try {
            const response = await axios.get(
                `${this.config.genLayerEndpoint}/v1/consensus/status/${taskId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.config.genLayerApiKey}`
                    }
                }
            );

            const { status, result, error } = response.data;

            if (status === 'completed') {
                return { completed: true, result: JSON.parse(result) };
            } else if (status === 'failed') {
                return { failed: true, error: error || 'Unknown error' };
            }

            return { completed: false, failed: false };
        } catch (error) {
            console.error('GenLayer status check error:', error.message);
            return { completed: false, failed: false };
        }
    }

    /**
     * Deliver AI verdict to the oracle adapter
     */
    async deliverVerdict(requestId, result) {
        console.log(`📤 Delivering verdict for ${requestId}...`);

        const resolutionMap = {
            'FAVOR_CLAIMANT': 1,
            'FAVOR_RESPONDENT': 2,
            'SPLIT': 3,
            'DISMISSED': 4
        };

        const resolution = resolutionMap[result.resolution] || 4;
        const confidence = Math.min(100, Math.max(0, Math.round(result.confidence)));

        // Upload reasoning to IPFS
        const reasoningHash = await this.uploadToIPFS(JSON.stringify({
            reasoning: result.reasoning,
            timestamp: Date.now(),
            model: 'dispute-resolver-v1'
        }));

        // Submit to oracle adapter
        const tx = await this.oracleAdapter.fulfillRequest(
            requestId,
            resolution,
            confidence,
            reasoningHash
        );

        await tx.wait();
        console.log(`✅ Verdict delivered: ${tx.hash}`);
    }

    /**
     * Mark request as failed
     */
    async failRequest(requestId, reason) {
        console.log(`❌ Failing request ${requestId}: ${reason}`);

        try {
            const tx = await this.oracleAdapter.failRequest(requestId, reason);
            await tx.wait();
            console.log(`✅ Request marked as failed: ${tx.hash}`);
        } catch (error) {
            console.error('Error failing request:', error.message);
        }
    }

    /**
     * Fetch content from IPFS
     */
    async fetchFromIPFS(hash) {
        if (!hash || hash.length === 0) return null;

        try {
            const response = await axios.get(`${this.config.ipfsGateway}${hash}`, {
                timeout: 30000
            });
            return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        } catch (error) {
            console.warn(`Failed to fetch from IPFS: ${hash}`);
            return null;
        }
    }

    /**
     * Upload content to IPFS
     */
    async uploadToIPFS(content) {
        try {
            // Using Infura IPFS or similar service
            const response = await axios.post(
                'https://ipfs.infura.io:5001/api/v0/add',
                content,
                {
                    headers: {
                        'Content-Type': 'text/plain',
                        'Authorization': `Basic ${Buffer.from(
                            process.env.INFURA_IPFS_PROJECT_ID + ':' + process.env.INFURA_IPFS_SECRET
                        ).toString('base64')}`
                    }
                }
            );

            return response.data.Hash;
        } catch (error) {
            console.error('IPFS upload error:', error.message);
            // Return a placeholder hash
            return 'QmPlaceholderHash' + Date.now();
        }
    }

    /**
     * Get evidence type name
     */
    getEvidenceTypeName(typeId) {
        const types = [
            'Document',
            'Image',
            'Video',
            'Contract',
            'Communication',
            'Transaction',
            'Other'
        ];
        return types[typeId] || 'Unknown';
    }
}

// Export for use
module.exports = { GenLayerService };

// Run directly if called as script
if (require.main === module) {
    require('dotenv').config();

    const service = new GenLayerService({
        oracleAdapterAddress: process.env.ORACLE_ADAPTER_ADDRESS,
        disputeContractAddress: process.env.DISPUTE_CONTRACT_ADDRESS
    });

    service.start().catch(console.error);

    // Handle shutdown
    process.on('SIGINT', async () => {
        await service.stop();
        process.exit(0);
    });
}
