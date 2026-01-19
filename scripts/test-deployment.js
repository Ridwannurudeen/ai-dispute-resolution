// scripts/test-deployment.js
/**
 * Post-Deployment Test Script
 * Tests all deployed contracts on testnet
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load deployment info
function loadDeployment() {
    const deploymentPath = path.join(__dirname, "../deployments/base-sepolia-latest.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("No deployment found. Run deploy-testnet.js first.");
    }
    return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("🧪 POST-DEPLOYMENT TESTS");
    console.log("=".repeat(60) + "\n");

    const deployment = loadDeployment();
    const [tester, respondent] = await hre.ethers.getSigners();
    
    console.log(`📍 Testing deployment from: ${deployment.timestamp}`);
    console.log(`👤 Tester: ${tester.address}`);
    console.log(`👤 Respondent: ${respondent?.address || "N/A (need 2nd account)"}\n`);

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    function logTest(name, passed, details = "") {
        const status = passed ? "✅ PASS" : "❌ FAIL";
        console.log(`   ${status}: ${name}`);
        if (details) console.log(`          ${details}`);
        results.tests.push({ name, passed, details });
        passed ? results.passed++ : results.failed++;
    }

    try {
        // ============ Load Contracts ============
        console.log("📦 Loading contracts...\n");

        const DisputeResolution = await hre.ethers.getContractAt(
            "DisputeResolution",
            deployment.contracts.DisputeResolution
        );

        const EvidenceManager = await hre.ethers.getContractAt(
            "EvidenceManager",
            deployment.contracts.EvidenceManager
        );

        const ReputationSystem = await hre.ethers.getContractAt(
            "ReputationSystem",
            deployment.contracts.ReputationSystem
        );

        const OracleAdapter = await hre.ethers.getContractAt(
            "GenLayerOracleAdapter",
            deployment.contracts.GenLayerOracleAdapter
        );

        // ============ Test 1: Contract Deployment ============
        console.log("🔍 Test 1: Contract Deployment Verification\n");

        const disputeCode = await hre.ethers.provider.getCode(deployment.contracts.DisputeResolution);
        logTest("DisputeResolution deployed", disputeCode !== "0x");

        const evidenceCode = await hre.ethers.provider.getCode(deployment.contracts.EvidenceManager);
        logTest("EvidenceManager deployed", evidenceCode !== "0x");

        const reputationCode = await hre.ethers.provider.getCode(deployment.contracts.ReputationSystem);
        logTest("ReputationSystem deployed", reputationCode !== "0x");

        const oracleCode = await hre.ethers.provider.getCode(deployment.contracts.GenLayerOracleAdapter);
        logTest("GenLayerOracleAdapter deployed", oracleCode !== "0x");

        // ============ Test 2: Contract Configuration ============
        console.log("\n🔍 Test 2: Contract Configuration\n");

        const treasury = await DisputeResolution.treasury();
        logTest("Treasury configured", treasury === deployment.treasury, `Treasury: ${treasury}`);

        const oracle = await DisputeResolution.genLayerOracle();
        logTest("Oracle configured", oracle === deployment.contracts.GenLayerOracleAdapter, `Oracle: ${oracle}`);

        // ============ Test 3: Create Dispute ============
        console.log("\n🔍 Test 3: Create Dispute\n");

        const disputeAmount = hre.ethers.parseEther("0.01");
        const respondentAddr = respondent?.address || "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

        try {
            const tx = await DisputeResolution.createDispute(
                respondentAddr,
                0, // ContractBreach
                "QmTestDescriptionHash123",
                { value: disputeAmount }
            );
            const receipt = await tx.wait();
            
            logTest("Create dispute transaction", receipt.status === 1, `Gas used: ${receipt.gasUsed}`);

            // Get dispute count
            const disputeCount = await DisputeResolution.getDisputeCount();
            logTest("Dispute count incremented", disputeCount > 0n, `Count: ${disputeCount}`);

            // Get dispute details
            const dispute = await DisputeResolution.getDispute(disputeCount);
            logTest("Dispute data stored", dispute.claimant === tester.address);
            logTest("Dispute amount correct", dispute.amount === disputeAmount);

        } catch (error) {
            logTest("Create dispute", false, error.message);
        }

        // ============ Test 4: Reputation System ============
        console.log("\n🔍 Test 4: Reputation System\n");

        try {
            const reputation = await ReputationSystem.getReputation(tester.address);
            logTest("Get reputation works", reputation.score > 0n, `Score: ${reputation.score}`);

            const tier = await ReputationSystem.getUserTier(tester.address);
            logTest("Get tier works", tier[1].name.length > 0, `Tier: ${tier[1].name}`);

        } catch (error) {
            logTest("Reputation system", false, error.message);
        }

        // ============ Test 5: Evidence Manager ============
        console.log("\n🔍 Test 5: Evidence Manager\n");

        try {
            // Check allowed MIME types
            const isDocAllowed = await EvidenceManager.isAllowedMimeType("application/pdf");
            logTest("PDF MIME type allowed", isDocAllowed);

            const isImageAllowed = await EvidenceManager.isAllowedMimeType("image/png");
            logTest("PNG MIME type allowed", isImageAllowed);

        } catch (error) {
            logTest("Evidence manager", false, error.message);
        }

        // ============ Test 6: Oracle Adapter ============
        console.log("\n🔍 Test 6: Oracle Adapter\n");

        try {
            const oracleFee = await OracleAdapter.oracleFee();
            logTest("Oracle fee configured", oracleFee >= 0n, `Fee: ${hre.ethers.formatEther(oracleFee)} ETH`);

            const timeout = await OracleAdapter.REQUEST_TIMEOUT();
            logTest("Request timeout configured", timeout > 0n, `Timeout: ${timeout}s`);

        } catch (error) {
            logTest("Oracle adapter", false, error.message);
        }

        // ============ Test 7: View Functions ============
        console.log("\n🔍 Test 7: View Functions\n");

        try {
            const userDisputes = await DisputeResolution.getUserDisputes(tester.address);
            logTest("Get user disputes works", Array.isArray(userDisputes), `Disputes: ${userDisputes.length}`);

            const disputeCount = await DisputeResolution.getDisputeCount();
            if (disputeCount > 0n) {
                const evidence = await DisputeResolution.getDisputeEvidence(1);
                logTest("Get dispute evidence works", Array.isArray(evidence));
            }

        } catch (error) {
            logTest("View functions", false, error.message);
        }

        // ============ Test Summary ============
        console.log("\n" + "=".repeat(60));
        console.log("📊 TEST SUMMARY");
        console.log("=".repeat(60));
        console.log(`\n   ✅ Passed: ${results.passed}`);
        console.log(`   ❌ Failed: ${results.failed}`);
        console.log(`   📝 Total:  ${results.passed + results.failed}\n`);

        if (results.failed === 0) {
            console.log("🎉 All tests passed! Deployment is working correctly.\n");
        } else {
            console.log("⚠️  Some tests failed. Please review the issues above.\n");
        }

        // Save test results
        const resultsPath = path.join(__dirname, "../deployments/test-results.json");
        fs.writeFileSync(resultsPath, JSON.stringify({
            ...results,
            deployment: deployment.timestamp,
            testedAt: new Date().toISOString()
        }, null, 2));
        console.log(`💾 Results saved to: ${resultsPath}\n`);

        return results;

    } catch (error) {
        console.error("\n❌ Test execution failed:", error.message);
        console.error(error);
        process.exit(1);
    }
}

main()
    .then((results) => process.exit(results.failed > 0 ? 1 : 0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
