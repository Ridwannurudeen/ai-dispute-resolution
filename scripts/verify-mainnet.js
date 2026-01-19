// scripts/verify-mainnet.js
/**
 * Mainnet Deployment Verification Script
 * Verifies all contracts are working correctly after deployment
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Load deployment info
function loadDeployment() {
    const deploymentPath = path.join(__dirname, "../deployments/base-mainnet-latest.json");
    if (!fs.existsSync(deploymentPath)) {
        throw new Error("No mainnet deployment found. Run deploy-mainnet.js first.");
    }
    return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("🔍 MAINNET DEPLOYMENT VERIFICATION");
    console.log("=".repeat(60) + "\n");

    const deployment = loadDeployment();
    const [signer] = await hre.ethers.getSigners();
    
    console.log(`📍 Verifying deployment from: ${deployment.timestamp}`);
    console.log(`👤 Verifier: ${signer.address}\n`);

    const checks = {
        passed: 0,
        failed: 0,
        warnings: 0,
        details: []
    };

    function logCheck(name, status, details = "") {
        const icons = { pass: "✅", fail: "❌", warn: "⚠️" };
        console.log(`   ${icons[status]} ${name}`);
        if (details) console.log(`      ${details}`);
        checks.details.push({ name, status, details });
        if (status === "pass") checks.passed++;
        else if (status === "fail") checks.failed++;
        else checks.warnings++;
    }

    try {
        // ============ 1. Contract Deployment Verification ============
        console.log("📦 1. Contract Deployment Verification\n");

        for (const [name, address] of Object.entries(deployment.contracts)) {
            const code = await hre.ethers.provider.getCode(address);
            if (code !== "0x") {
                logCheck(`${name} deployed`, "pass", address);
            } else {
                logCheck(`${name} deployed`, "fail", `No code at ${address}`);
            }
        }

        // ============ 2. Contract Configuration ============
        console.log("\n📋 2. Contract Configuration\n");

        const DisputeResolution = await hre.ethers.getContractAt(
            "DisputeResolution",
            deployment.contracts.DisputeResolution
        );

        // Check treasury
        const treasury = await DisputeResolution.treasury();
        if (treasury.toLowerCase() === deployment.treasury.toLowerCase()) {
            logCheck("Treasury address", "pass", treasury);
        } else {
            logCheck("Treasury address", "fail", `Expected ${deployment.treasury}, got ${treasury}`);
        }

        // Check oracle
        const oracle = await DisputeResolution.genLayerOracle();
        if (oracle.toLowerCase() === deployment.contracts.GenLayerOracleAdapter.toLowerCase()) {
            logCheck("Oracle adapter linked", "pass", oracle);
        } else {
            logCheck("Oracle adapter linked", "fail", `Expected ${deployment.contracts.GenLayerOracleAdapter}, got ${oracle}`);
        }

        // ============ 3. Role Configuration ============
        console.log("\n🔐 3. Role Configuration\n");

        const OracleAdapter = await hre.ethers.getContractAt(
            "GenLayerOracleAdapter",
            deployment.contracts.GenLayerOracleAdapter
        );

        // Check relayer role
        const RELAYER_ROLE = await OracleAdapter.RELAYER_ROLE();
        const hasRelayerRole = await OracleAdapter.hasRole(RELAYER_ROLE, deployment.relayer);
        if (hasRelayerRole) {
            logCheck("Relayer role granted", "pass", deployment.relayer);
        } else {
            logCheck("Relayer role granted", "fail", "Relayer cannot submit verdicts!");
        }

        // Check admin role on main contract
        const ADMIN_ROLE = await DisputeResolution.ADMIN_ROLE();
        const deployerHasAdmin = await DisputeResolution.hasRole(ADMIN_ROLE, deployment.deployer);
        if (deployerHasAdmin) {
            logCheck("Admin role on DisputeResolution", "pass");
        } else {
            logCheck("Admin role on DisputeResolution", "warn", "Deployer lost admin role");
        }

        // ============ 4. Contract Parameters ============
        console.log("\n⚙️ 4. Contract Parameters\n");

        const minAmount = await DisputeResolution.MIN_DISPUTE_AMOUNT();
        logCheck("Min dispute amount", "pass", `${hre.ethers.formatEther(minAmount)} ETH`);

        const maxAmount = await DisputeResolution.MAX_DISPUTE_AMOUNT();
        logCheck("Max dispute amount", "pass", `${hre.ethers.formatEther(maxAmount)} ETH`);

        const platformFee = await DisputeResolution.PLATFORM_FEE_BPS();
        logCheck("Platform fee", "pass", `${platformFee / 100}%`);

        const evidencePeriod = await DisputeResolution.EVIDENCE_PERIOD();
        logCheck("Evidence period", "pass", `${evidencePeriod / 86400n} days`);

        const appealPeriod = await DisputeResolution.APPEAL_PERIOD();
        logCheck("Appeal period", "pass", `${appealPeriod / 86400n} days`);

        // ============ 5. Contract State ============
        console.log("\n📊 5. Contract State\n");

        const disputeCount = await DisputeResolution.getDisputeCount();
        logCheck("Dispute count", "pass", disputeCount.toString());

        const paused = await DisputeResolution.paused();
        if (!paused) {
            logCheck("Contract not paused", "pass");
        } else {
            logCheck("Contract not paused", "warn", "Contract is paused!");
        }

        // ============ 6. Basescan Verification ============
        console.log("\n🔎 6. Basescan Verification\n");

        for (const result of deployment.verification || []) {
            if (result.verified) {
                logCheck(`${result.contract} verified on Basescan`, "pass");
            } else {
                logCheck(`${result.contract} verified on Basescan`, "warn", result.error || "Not verified");
            }
        }

        // ============ 7. Treasury & Relayer Balances ============
        console.log("\n💰 7. Wallet Balances\n");

        const treasuryBalance = await hre.ethers.provider.getBalance(deployment.treasury);
        logCheck("Treasury balance", "pass", `${hre.ethers.formatEther(treasuryBalance)} ETH`);

        const relayerBalance = await hre.ethers.provider.getBalance(deployment.relayer);
        if (relayerBalance > hre.ethers.parseEther("0.01")) {
            logCheck("Relayer balance", "pass", `${hre.ethers.formatEther(relayerBalance)} ETH`);
        } else {
            logCheck("Relayer balance", "warn", `${hre.ethers.formatEther(relayerBalance)} ETH - Fund for gas!`);
        }

        // ============ 8. ReputationSystem Check ============
        console.log("\n👤 8. Reputation System\n");

        const ReputationSystem = await hre.ethers.getContractAt(
            "ReputationSystem",
            deployment.contracts.ReputationSystem
        );

        const tierCount = await ReputationSystem.tierCount();
        logCheck("Reputation tiers configured", "pass", `${tierCount} tiers`);

        const DISPUTE_CONTRACT_ROLE = await ReputationSystem.DISPUTE_CONTRACT_ROLE();
        const disputeHasRole = await ReputationSystem.hasRole(DISPUTE_CONTRACT_ROLE, deployment.contracts.DisputeResolution);
        if (disputeHasRole) {
            logCheck("DisputeResolution has reputation role", "pass");
        } else {
            logCheck("DisputeResolution has reputation role", "fail", "Cannot update reputations!");
        }

        // ============ Summary ============
        console.log("\n" + "=".repeat(60));
        console.log("📊 VERIFICATION SUMMARY");
        console.log("=".repeat(60));
        console.log(`\n   ✅ Passed:   ${checks.passed}`);
        console.log(`   ⚠️  Warnings: ${checks.warnings}`);
        console.log(`   ❌ Failed:   ${checks.failed}`);
        console.log(`   📝 Total:    ${checks.passed + checks.warnings + checks.failed}\n`);

        if (checks.failed === 0 && checks.warnings === 0) {
            console.log("🎉 All checks passed! Deployment is fully verified.\n");
        } else if (checks.failed === 0) {
            console.log("✅ Deployment verified with warnings. Review warnings above.\n");
        } else {
            console.log("❌ Deployment has failures! Address issues before going live.\n");
        }

        // Save verification results
        const resultsPath = path.join(__dirname, "../deployments/verification-results.json");
        fs.writeFileSync(resultsPath, JSON.stringify({
            ...checks,
            deployment: deployment.timestamp,
            verifiedAt: new Date().toISOString()
        }, null, 2));
        console.log(`💾 Results saved to: ${resultsPath}\n`);

        // Print useful links
        console.log("🔗 Useful Links:\n");
        console.log(`   Main Contract: https://basescan.org/address/${deployment.contracts.DisputeResolution}`);
        console.log(`   Treasury:      https://basescan.org/address/${deployment.treasury}`);
        console.log(`   Oracle:        https://basescan.org/address/${deployment.contracts.GenLayerOracleAdapter}\n`);

        return checks;

    } catch (error) {
        console.error("\n❌ Verification failed:", error.message);
        console.error(error);
        process.exit(1);
    }
}

main()
    .then((checks) => process.exit(checks.failed > 0 ? 1 : 0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
