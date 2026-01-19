// backend/services/blockchainListener.js
const { ethers } = require('ethers');
const db = require('../config/database');

const DISPUTE_ABI = [
    "event DisputeCreated(uint256 indexed disputeId, address indexed claimant, address indexed respondent, uint256 amount, uint8 category)",
    "event EvidenceSubmitted(uint256 indexed disputeId, address indexed submitter, string contentHash, uint8 evidenceType)",
    "event AIVerdictReceived(uint256 indexed disputeId, uint8 resolution, uint8 confidenceScore)",
    "event DisputeResolved(uint256 indexed disputeId, uint8 resolution, uint256 claimantPayout, uint256 respondentPayout)",
    "event DisputeCancelled(uint256 indexed disputeId)"
];

class BlockchainListener {
    constructor(io) {
        this.io = io;
        this.provider = null;
        this.contract = null;
    }

    async start() {
        const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
        const contractAddress = process.env.DISPUTE_CONTRACT_ADDRESS;

        if (!contractAddress) {
            console.log('⚠️ No contract address configured, blockchain listener disabled');
            return;
        }

        this.provider = new ethers.JsonRpcProvider(rpcUrl);
        this.contract = new ethers.Contract(contractAddress, DISPUTE_ABI, this.provider);

        // Listen for events
        this.contract.on('DisputeCreated', async (disputeId, claimant, respondent, amount, category, event) => {
            const data = {
                disputeId: disputeId.toString(),
                claimant,
                respondent,
                amount: ethers.formatEther(amount),
                category: Number(category),
                txHash: event.log.transactionHash
            };

            // Save to database
            await db.disputes.create({
                id: data.disputeId,
                ...data,
                status: 0,
                createdAt: new Date()
            });

            // Notify via WebSocket
            this.io.to(`user:${claimant.toLowerCase()}`).emit('dispute:created', data);
            this.io.to(`user:${respondent.toLowerCase()}`).emit('dispute:created', data);

            // Create notifications
            await db.notifications.create(respondent, {
                type: 'dispute_created',
                title: 'New Dispute',
                message: `You have been added as respondent in dispute #${data.disputeId}`,
                data
            });

            console.log('📝 Dispute created:', data.disputeId);
        });

        this.contract.on('AIVerdictReceived', async (disputeId, resolution, confidenceScore, event) => {
            const data = {
                disputeId: disputeId.toString(),
                resolution: Number(resolution),
                confidenceScore: Number(confidenceScore)
            };

            await db.disputes.update(data.disputeId, { 
                status: 3, 
                resolution: data.resolution, 
                aiConfidenceScore: data.confidenceScore 
            });

            this.io.to(`dispute:${data.disputeId}`).emit('verdict:received', data);
            console.log('⚖️ Verdict received for dispute:', data.disputeId);
        });

        this.contract.on('DisputeResolved', async (disputeId, resolution, claimantPayout, respondentPayout, event) => {
            const data = {
                disputeId: disputeId.toString(),
                resolution: Number(resolution),
                claimantPayout: ethers.formatEther(claimantPayout),
                respondentPayout: ethers.formatEther(respondentPayout)
            };

            await db.disputes.update(data.disputeId, { status: 5 });
            this.io.to(`dispute:${data.disputeId}`).emit('dispute:resolved', data);
            console.log('✅ Dispute resolved:', data.disputeId);
        });

        console.log('👂 Blockchain listener started');
    }

    stop() {
        if (this.contract) {
            this.contract.removeAllListeners();
        }
    }
}

module.exports = BlockchainListener;
