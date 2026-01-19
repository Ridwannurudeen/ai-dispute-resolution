// scripts/utils/interact.js
/**
 * Contract Interaction Utilities
 * Command-line tools for interacting with deployed contracts
 */

const { ethers } = require('hardhat');
const readline = require('readline');

// Contract ABIs
const DISPUTE_ABI = [
    "function createDispute(address _respondent, uint8 _category, string calldata _descriptionHash) external payable returns (uint256)",
    "function acceptDispute(uint256 _disputeId) external payable",
    "function submitEvidence(uint256 _disputeId, string calldata _contentHash, uint8 _evidenceType) external",
    "function requestAIVerdict(uint256 _disputeId) external",
    "function appealVerdict(uint256 _disputeId) external payable",
    "function finalizeDispute(uint256 _disputeId) external",
    "function cancelDispute(uint256 _disputeId) external",
    "function getDispute(uint256 _disputeId) external view returns (tuple(uint256 id, address claimant, address respondent, uint256 amount, uint256 createdAt, uint256 evidenceDeadline, uint256 appealDeadline, uint8 status, uint8 resolution, uint8 category, string descriptionHash, uint8 aiConfidenceScore, bool appealed))",
    "function getDisputeEvidence(uint256 _disputeId) external view returns (tuple(address submitter, string contentHash, uint256 timestamp, uint8 evidenceType)[])",
    "function getUserDisputes(address _user) external view returns (uint256[])",
    "function getAIVerdict(uint256 _disputeId) external view returns (tuple(uint8 decision, uint8 confidenceScore, string reasoningHash, uint256 timestamp, bytes32 genLayerRequestId))",
    "function getDisputeCount() external view returns (uint256)",
    "function treasury() external view returns (address)",
    "function genLayerOracle() external view returns (address)",
    "function pause() external",
    "function unpause() external"
];

const CATEGORIES = ['ContractBreach', 'ServiceQuality', 'PaymentDispute', 'IntellectualProperty', 'FraudClaim', 'Other'];
const STATUS_NAMES = ['Created', 'EvidenceSubmission', 'AwaitingAIVerdict', 'VerdictDelivered', 'AppealPeriod', 'Resolved', 'Cancelled'];
const RESOLUTION_NAMES = ['None', 'FavorClaimant', 'FavorRespondent', 'Split', 'Dismissed'];
const EVIDENCE_TYPES = ['Document', 'Image', 'Video', 'Contract', 'Communication', 'Transaction', 'Other'];

class ContractInteraction {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contract = null;
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async initialize() {
        console.log('\n🔧 Initializing Contract Interaction Tool...\n');
        
        this.provider = ethers.provider;
        [this.signer] = await ethers.getSigners();
        
        const contractAddress = process.env.DISPUTE_CONTRACT_ADDRESS;
        if (!contractAddress) {
            throw new Error('DISPUTE_CONTRACT_ADDRESS not set in environment');
        }

        this.contract = new ethers.Contract(contractAddress, DISPUTE_ABI, this.signer);
        
        console.log(`📍 Contract: ${contractAddress}`);
        console.log(`👤 Signer: ${this.signer.address}`);
        
        const balance = await this.provider.getBalance(this.signer.address);
        console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);
    }

    prompt(question) {
        return new Promise((resolve) => {
            this.rl.question(question, resolve);
        });
    }

    async showMenu() {
        console.log('\n' + '='.repeat(50));
        console.log('📋 DISPUTE RESOLUTION - INTERACTION MENU');
        console.log('='.repeat(50));
        console.log('1.  View Platform Stats');
        console.log('2.  View Dispute Details');
        console.log('3.  View My Disputes');
        console.log('4.  Create New Dispute');
        console.log('5.  Accept Dispute');
        console.log('6.  Submit Evidence');
        console.log('7.  Request AI Verdict');
        console.log('8.  Appeal Verdict');
        console.log('9.  Finalize Dispute');
        console.log('10. Cancel Dispute');
        console.log('11. View Dispute Evidence');
        console.log('12. View AI Verdict');
        console.log('0.  Exit');
        console.log('='.repeat(50));
    }

    async viewStats() {
        console.log('\n📊 Platform Statistics\n');
        
        const disputeCount = await this.contract.getDisputeCount();
        const treasury = await this.contract.treasury();
        const oracle = await this.contract.genLayerOracle();

        console.log(`Total Disputes: ${disputeCount}`);
        console.log(`Treasury: ${treasury}`);
        console.log(`Oracle Adapter: ${oracle}`);
    }

    async viewDispute() {
        const disputeId = await this.prompt('Enter Dispute ID: ');
        
        try {
            const dispute = await this.contract.getDispute(disputeId);
            
            console.log('\n📄 Dispute Details\n');
            console.log(`ID: ${dispute.id}`);
            console.log(`Claimant: ${dispute.claimant}`);
            console.log(`Respondent: ${dispute.respondent}`);
            console.log(`Amount: ${ethers.formatEther(dispute.amount)} ETH`);
            console.log(`Category: ${CATEGORIES[Number(dispute.category)]}`);
            console.log(`Status: ${STATUS_NAMES[Number(dispute.status)]}`);
            console.log(`Resolution: ${RESOLUTION_NAMES[Number(dispute.resolution)]}`);
            console.log(`AI Confidence: ${dispute.aiConfidenceScore}%`);
            console.log(`Appealed: ${dispute.appealed}`);
            console.log(`Created: ${new Date(Number(dispute.createdAt) * 1000).toLocaleString()}`);
            console.log(`Evidence Deadline: ${new Date(Number(dispute.evidenceDeadline) * 1000).toLocaleString()}`);
            if (Number(dispute.appealDeadline) > 0) {
                console.log(`Appeal Deadline: ${new Date(Number(dispute.appealDeadline) * 1000).toLocaleString()}`);
            }
            console.log(`Description Hash: ${dispute.descriptionHash}`);
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async viewMyDisputes() {
        try {
            const disputes = await this.contract.getUserDisputes(this.signer.address);
            
            console.log(`\n📋 Your Disputes (${disputes.length} total)\n`);
            
            if (disputes.length === 0) {
                console.log('No disputes found.');
                return;
            }

            for (const id of disputes) {
                const dispute = await this.contract.getDispute(id);
                const role = dispute.claimant === this.signer.address ? 'Claimant' : 'Respondent';
                console.log(`#${id} | ${STATUS_NAMES[Number(dispute.status)]} | ${ethers.formatEther(dispute.amount)} ETH | ${role}`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async createDispute() {
        console.log('\n📝 Create New Dispute\n');
        
        const respondent = await this.prompt('Respondent Address: ');
        
        console.log('\nCategories:');
        CATEGORIES.forEach((cat, i) => console.log(`  ${i}: ${cat}`));
        const category = await this.prompt('Category (0-5): ');
        
        const amount = await this.prompt('Stake Amount (ETH): ');
        const description = await this.prompt('Description Hash (IPFS): ');

        console.log('\nCreating dispute...');
        
        try {
            const tx = await this.contract.createDispute(
                respondent,
                parseInt(category),
                description || 'QmDefaultHash',
                { value: ethers.parseEther(amount) }
            );
            
            console.log(`📤 Transaction sent: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`✅ Dispute created! Gas used: ${receipt.gasUsed}`);
            
            // Get dispute ID from event
            const event = receipt.logs.find(log => {
                try {
                    return this.contract.interface.parseLog(log)?.name === 'DisputeCreated';
                } catch { return false; }
            });
            
            if (event) {
                const parsed = this.contract.interface.parseLog(event);
                console.log(`🆔 Dispute ID: ${parsed.args.disputeId}`);
            }
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async acceptDispute() {
        const disputeId = await this.prompt('Enter Dispute ID to accept: ');
        
        try {
            const dispute = await this.contract.getDispute(disputeId);
            const amount = dispute.amount;
            
            console.log(`\nAccepting dispute with stake of ${ethers.formatEther(amount)} ETH...`);
            
            const tx = await this.contract.acceptDispute(disputeId, { value: amount });
            console.log(`📤 Transaction sent: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`✅ Dispute accepted! Gas used: ${receipt.gasUsed}`);
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async submitEvidence() {
        const disputeId = await this.prompt('Enter Dispute ID: ');
        const contentHash = await this.prompt('Evidence IPFS Hash: ');
        
        console.log('\nEvidence Types:');
        EVIDENCE_TYPES.forEach((type, i) => console.log(`  ${i}: ${type}`));
        const evidenceType = await this.prompt('Evidence Type (0-6): ');

        console.log('\nSubmitting evidence...');
        
        try {
            const tx = await this.contract.submitEvidence(
                disputeId,
                contentHash,
                parseInt(evidenceType)
            );
            
            console.log(`📤 Transaction sent: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`✅ Evidence submitted! Gas used: ${receipt.gasUsed}`);
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async requestAIVerdict() {
        const disputeId = await this.prompt('Enter Dispute ID: ');
        
        console.log('\nRequesting AI verdict...');
        
        try {
            const tx = await this.contract.requestAIVerdict(disputeId);
            console.log(`📤 Transaction sent: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`✅ AI verdict requested! Gas used: ${receipt.gasUsed}`);
            console.log('⏳ The AI will analyze the dispute and deliver a verdict shortly.');
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async appealVerdict() {
        const disputeId = await this.prompt('Enter Dispute ID: ');
        
        try {
            const dispute = await this.contract.getDispute(disputeId);
            const appealStake = (dispute.amount * 2n * 1000n) / 10000n;
            
            console.log(`\nAppealing verdict with stake of ${ethers.formatEther(appealStake)} ETH...`);
            
            const tx = await this.contract.appealVerdict(disputeId, { value: appealStake });
            console.log(`📤 Transaction sent: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`✅ Appeal submitted! Gas used: ${receipt.gasUsed}`);
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async finalizeDispute() {
        const disputeId = await this.prompt('Enter Dispute ID: ');
        
        console.log('\nFinalizing dispute...');
        
        try {
            const tx = await this.contract.finalizeDispute(disputeId);
            console.log(`📤 Transaction sent: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`✅ Dispute finalized! Gas used: ${receipt.gasUsed}`);
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async cancelDispute() {
        const disputeId = await this.prompt('Enter Dispute ID: ');
        
        console.log('\nCancelling dispute...');
        
        try {
            const tx = await this.contract.cancelDispute(disputeId);
            console.log(`📤 Transaction sent: ${tx.hash}`);
            
            const receipt = await tx.wait();
            console.log(`✅ Dispute cancelled! Gas used: ${receipt.gasUsed}`);
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async viewEvidence() {
        const disputeId = await this.prompt('Enter Dispute ID: ');
        
        try {
            const evidence = await this.contract.getDisputeEvidence(disputeId);
            
            console.log(`\n📎 Evidence for Dispute #${disputeId} (${evidence.length} items)\n`);
            
            if (evidence.length === 0) {
                console.log('No evidence submitted.');
                return;
            }

            evidence.forEach((item, index) => {
                console.log(`--- Evidence ${index + 1} ---`);
                console.log(`Submitter: ${item.submitter}`);
                console.log(`Type: ${EVIDENCE_TYPES[Number(item.evidenceType)]}`);
                console.log(`Hash: ${item.contentHash}`);
                console.log(`Timestamp: ${new Date(Number(item.timestamp) * 1000).toLocaleString()}`);
                console.log('');
            });
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async viewAIVerdict() {
        const disputeId = await this.prompt('Enter Dispute ID: ');
        
        try {
            const verdict = await this.contract.getAIVerdict(disputeId);
            
            console.log(`\n🤖 AI Verdict for Dispute #${disputeId}\n`);
            console.log(`Decision: ${RESOLUTION_NAMES[Number(verdict.decision)]}`);
            console.log(`Confidence Score: ${verdict.confidenceScore}%`);
            console.log(`Reasoning Hash: ${verdict.reasoningHash}`);
            console.log(`Timestamp: ${new Date(Number(verdict.timestamp) * 1000).toLocaleString()}`);
            console.log(`GenLayer Request ID: ${verdict.genLayerRequestId}`);
        } catch (error) {
            console.log(`❌ Error: ${error.reason || error.message}`);
        }
    }

    async run() {
        await this.initialize();

        while (true) {
            await this.showMenu();
            const choice = await this.prompt('\nEnter your choice: ');

            switch (choice) {
                case '1': await this.viewStats(); break;
                case '2': await this.viewDispute(); break;
                case '3': await this.viewMyDisputes(); break;
                case '4': await this.createDispute(); break;
                case '5': await this.acceptDispute(); break;
                case '6': await this.submitEvidence(); break;
                case '7': await this.requestAIVerdict(); break;
                case '8': await this.appealVerdict(); break;
                case '9': await this.finalizeDispute(); break;
                case '10': await this.cancelDispute(); break;
                case '11': await this.viewEvidence(); break;
                case '12': await this.viewAIVerdict(); break;
                case '0':
                    console.log('\n👋 Goodbye!\n');
                    this.rl.close();
                    process.exit(0);
                default:
                    console.log('\n❌ Invalid choice. Please try again.');
            }
        }
    }
}

// Run
const interaction = new ContractInteraction();
interaction.run().catch(console.error);
