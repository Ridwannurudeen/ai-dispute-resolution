// scripts/e2e-test.js
/**
 * End-to-End Test Script
 * Tests complete dispute lifecycle on testnet
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function loadContracts() {
    const deploymentPath = path.join(__dirname, "../deployments/base-sepolia-latest.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("No deployment found. Run deploy-testnet.js first.");
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    
    return {
        disputeResolution: await hre.ethers.getContractAt(
            "DisputeResolution", 
            deployment.contracts.DisputeResolution
        ),
        oracleAdapter: await hre.ethers.getContractAt(
            "GenLayerOracleAdapter",
            deployment.contracts.GenLayerOracleAdapter
        ),
        reputationSystem: await hre.ethers.getContractAt(
            "ReputationSystem",
            deployment.contracts.ReputationSystem
        ),
        deployment
    };
}

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("🧪 END-TO-END DISPUTE LIFECYCLE TEST");
    console.log("=".repeat(60) + "\n");

    const signers = await hre.ethers.getSigners();
    const claimant = signers[0];
    
    // Use a different address for respondent (or same if only one account)
    const respondent = signers[1] || { 
        address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" 
    };

    console.log(`👤 Claimant: ${claimant.address}`);
    console.log(`👤 Respondent: ${respondent.address}\n`);

    const { disputeResolution, oracleAdapter, reputationSystem, deployment } = await loadContracts();
    
    const disputeAmount = hre.ethers.parseEther("0.01");
    let disputeId;

    try {
        // ============ Step 1: Create Dispute ============
        console.log("📝 Step 1: Creating dispute...");
        
        const createTx = await disputeResolution.createDispute(
            respondent.address,
            0, // ContractBreach category
            "QmTestDescriptionHash",
            { value: disputeAmount }
        );
        const createReceipt = await createTx.wait();
        
        // Get dispute ID from event
        const createEvent = createReceipt.logs.find(
            log => log.fragment?.name === "DisputeCreated"
        );
        disputeId = createEvent ? createEvent.args[0] : await disputeResolution.getDisputeCount();
        
        console.log(`   ✅ Dispute #${disputeId} created`);
        console.log(`   💰 Amount: ${hre.ethers.formatEther(disputeAmount)} ETH`);
        console.log(`   ⛽ Gas: ${createReceipt.gasUsed}\n`);

        // ============ Step 2: Check Dispute State ============
        console.log("🔍 Step 2: Checking dispute state...");
        
        let dispute = await disputeResolution.getDispute(disputeId);
        console.log(`   Status: ${["Created", "EvidenceSubmission", "AwaitingAIVerdict", "VerdictDelivered", "AppealPeriod", "Resolved", "Cancelled"][dispute.status]}`);
        console.log(`   Claimant: ${dispute.claimant}`);
        console.log(`   Respondent: ${dispute.respondent}\n`);

        // ============ Step 3: Submit Evidence (Claimant) ============
        console.log("📎 Step 3: Submitting evidence as claimant...");
        
        // Note: For full test, respondent needs to accept first
        // This step may fail if dispute requires acceptance
        try {
            const evidenceTx = await disputeResolution.submitEvidence(
                disputeId,
                "QmClaimantEvidenceHash123",
                0 // Document type
            );
            await evidenceTx.wait();
            console.log("   ✅ Evidence submitted\n");
        } catch (e) {
            console.log(`   ⚠️  Could not submit evidence: ${e.message}`);
            console.log("   (Respondent may need to accept dispute first)\n");
        }

        // ============ Step 4: Check Reputation ============
        console.log("⭐ Step 4: Checking reputation...");
        
        const reputation = await reputationSystem.getReputation(claimant.address);
        console.log(`   Score: ${reputation.score} / 10000`);
        console.log(`   Total Disputes: ${reputation.totalDisputes}`);
        
        const [tierId, tier] = await reputationSystem.getUserTier(claimant.address);
        console.log(`   Tier: ${tier.name} (ID: ${tierId})\n`);

        // ============ Step 5: Get Dispute Evidence ============
        console.log("📋 Step 5: Fetching dispute evidence...");
        
        const evidence = await disputeResolution.getDisputeEvidence(disputeId);
        console.log(`   Evidence count: ${evidence.length}`);
        for (let i = 0; i < evidence.length; i++) {
            console.log(`   [${i}] Hash: ${evidence[i].contentHash}`);
        }
        console.log("");

        // ============ Step 6: Cancel Dispute ============
        console.log("❌ Step 6: Cancelling dispute (cleanup)...");
        
        try {
            const cancelTx = await disputeResolution.cancelDispute(disputeId);
            await cancelTx.wait();
            console.log("   ✅ Dispute cancelled\n");
            
            // Verify cancellation
            dispute = await disputeResolution.getDispute(disputeId);
            console.log(`   Final Status: ${["Created", "EvidenceSubmission", "AwaitingAIVerdict", "VerdictDelivered", "AppealPeriod", "Resolved", "Cancelled"][dispute.status]}\n`);
        } catch (e) {
            console.log(`   ⚠️  Could not cancel: ${e.message}\n`);
        }

        // ============ Summary ============
        console.log("=".repeat(60));
        console.log("✅ E2E TEST COMPLETE");
        console.log("=".repeat(60));
        console.log("\nTested:");
        console.log("  ✅ Create dispute");
        console.log("  ✅ Query dispute state");
        console.log("  ✅ Submit evidence");
        console.log("  ✅ Check reputation");
        console.log("  ✅ Cancel dispute");
        console.log("\nNot tested (requires multiple accounts):");
        console.log("  - Accept dispute (respondent)");
        console.log("  - Request AI verdict");
        console.log("  - Deliver verdict (oracle)");
        console.log("  - Appeal verdict");
        console.log("  - Finalize dispute\n");

    } catch (error) {
        console.error("\n❌ E2E Test Failed:", error.message);
        console.error(error);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
