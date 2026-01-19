// scripts/deploy-testnet.js
/**
 * Complete Testnet Deployment Script for Base Sepolia
 * Deploys all contracts, configures roles, and verifies on Basescan
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

// Deployment configuration
const CONFIG = {
    // Set these before deployment
    TREASURY_ADDRESS: process.env.TREASURY_ADDRESS || "", // Will use deployer if not set
    RELAYER_ADDRESS: process.env.RELAYER_ADDRESS || "",   // Will use deployer if not set
    
    // Contract parameters
    MIN_DISPUTE_AMOUNT: hre.ethers.parseEther("0.001"),
    MAX_DISPUTE_AMOUNT: hre.ethers.parseEther("100"),     // Lower for testnet
    ORACLE_FEE: hre.ethers.parseEther("0.0001"),          // Lower for testnet
    
    // Supported test tokens (Base Sepolia)
    TEST_TOKENS: [
        // Add testnet token addresses here if needed
    ]
};

async function main() {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 AI DISPUTE RESOLUTION - TESTNET DEPLOYMENT");
    console.log("=".repeat(60) + "\n");

    // Get network info
    const network = await hre.ethers.provider.getNetwork();
    console.log(`📡 Network: ${network.name} (Chain ID: ${network.chainId})`);
    
    if (network.chainId !== 84532n) {
        console.log("⚠️  Warning: Not on Base Sepolia (84532). Current chain:", network.chainId.toString());
        const proceed = process.env.FORCE_DEPLOY === "true";
        if (!proceed) {
            console.log("   Set FORCE_DEPLOY=true to deploy anyway\n");
            process.exit(1);
        }
    }

    // Get deployer
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    
    console.log(`👤 Deployer: ${deployer.address}`);
    console.log(`💰 Balance: ${hre.ethers.formatEther(balance)} ETH\n`);

    if (balance < hre.ethers.parseEther("0.05")) {
        console.log("❌ Insufficient balance. Need at least 0.05 ETH for deployment.");
        console.log("   Get testnet ETH from: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet\n");
        process.exit(1);
    }

    // Set addresses
    const treasuryAddress = CONFIG.TREASURY_ADDRESS || deployer.address;
    const relayerAddress = CONFIG.RELAYER_ADDRESS || deployer.address;
    
    console.log(`🏦 Treasury: ${treasuryAddress}`);
    console.log(`🔗 Relayer: ${relayerAddress}\n`);

    const deployedContracts = {};
    const deploymentLog = [];

    try {
        // ============ 1. Deploy EvidenceManager ============
        console.log("📦 [1/5] Deploying EvidenceManager...");
        const EvidenceManager = await hre.ethers.getContractFactory("EvidenceManager");
        const evidenceManager = await EvidenceManager.deploy();
        await evidenceManager.waitForDeployment();
        const evidenceManagerAddress = await evidenceManager.getAddress();
        
        deployedContracts.EvidenceManager = evidenceManagerAddress;
        deploymentLog.push({ contract: "EvidenceManager", address: evidenceManagerAddress, tx: evidenceManager.deploymentTransaction()?.hash });
        console.log(`   ✅ EvidenceManager: ${evidenceManagerAddress}\n`);

        // ============ 2. Deploy GenLayerOracleAdapter ============
        console.log("📦 [2/5] Deploying GenLayerOracleAdapter...");
        const GenLayerOracleAdapter = await hre.ethers.getContractFactory("GenLayerOracleAdapter");
        const oracleAdapter = await GenLayerOracleAdapter.deploy(relayerAddress);
        await oracleAdapter.waitForDeployment();
        const oracleAdapterAddress = await oracleAdapter.getAddress();
        
        deployedContracts.GenLayerOracleAdapter = oracleAdapterAddress;
        deploymentLog.push({ contract: "GenLayerOracleAdapter", address: oracleAdapterAddress, tx: oracleAdapter.deploymentTransaction()?.hash });
        console.log(`   ✅ GenLayerOracleAdapter: ${oracleAdapterAddress}\n`);

        // ============ 3. Deploy DisputeResolution ============
        console.log("📦 [3/5] Deploying DisputeResolution...");
        const DisputeResolution = await hre.ethers.getContractFactory("DisputeResolution");
        const disputeResolution = await DisputeResolution.deploy(treasuryAddress, oracleAdapterAddress);
        await disputeResolution.waitForDeployment();
        const disputeResolutionAddress = await disputeResolution.getAddress();
        
        deployedContracts.DisputeResolution = disputeResolutionAddress;
        deploymentLog.push({ contract: "DisputeResolution", address: disputeResolutionAddress, tx: disputeResolution.deploymentTransaction()?.hash });
        console.log(`   ✅ DisputeResolution: ${disputeResolutionAddress}\n`);

        // ============ 4. Deploy ReputationSystem ============
        console.log("📦 [4/5] Deploying ReputationSystem...");
        const ReputationSystem = await hre.ethers.getContractFactory("ReputationSystem");
        const reputationSystem = await ReputationSystem.deploy();
        await reputationSystem.waitForDeployment();
        const reputationSystemAddress = await reputationSystem.getAddress();
        
        deployedContracts.ReputationSystem = reputationSystemAddress;
        deploymentLog.push({ contract: "ReputationSystem", address: reputationSystemAddress, tx: reputationSystem.deploymentTransaction()?.hash });
        console.log(`   ✅ ReputationSystem: ${reputationSystemAddress}\n`);

        // ============ 5. Deploy MultiTokenDisputeResolution ============
        console.log("📦 [5/5] Deploying MultiTokenDisputeResolution...");
        const MultiTokenDisputeResolution = await hre.ethers.getContractFactory("MultiTokenDisputeResolution");
        const multiTokenDispute = await MultiTokenDisputeResolution.deploy(treasuryAddress, oracleAdapterAddress);
        await multiTokenDispute.waitForDeployment();
        const multiTokenDisputeAddress = await multiTokenDispute.getAddress();
        
        deployedContracts.MultiTokenDisputeResolution = multiTokenDisputeAddress;
        deploymentLog.push({ contract: "MultiTokenDisputeResolution", address: multiTokenDisputeAddress, tx: multiTokenDispute.deploymentTransaction()?.hash });
        console.log(`   ✅ MultiTokenDisputeResolution: ${multiTokenDisputeAddress}\n`);

        // ============ Configure Contracts ============
        console.log("⚙️  Configuring contracts...\n");

        // Set DisputeResolution address on Oracle Adapter
        console.log("   Setting dispute contract on oracle adapter...");
        let tx = await oracleAdapter.setDisputeContract(disputeResolutionAddress);
        await tx.wait();
        console.log("   ✅ Oracle adapter configured\n");

        // Grant DISPUTE_CONTRACT_ROLE on ReputationSystem
        console.log("   Granting DISPUTE_CONTRACT_ROLE to DisputeResolution...");
        tx = await reputationSystem.setDisputeContract(disputeResolutionAddress);
        await tx.wait();
        console.log("   ✅ Reputation system configured\n");

        // ============ Verify Contracts ============
        console.log("🔍 Verifying contracts on Basescan...\n");
        
        const verificationDelay = 30000; // 30 seconds
        console.log(`   Waiting ${verificationDelay/1000}s for Basescan to index...\n`);
        await new Promise(resolve => setTimeout(resolve, verificationDelay));

        for (const log of deploymentLog) {
            try {
                console.log(`   Verifying ${log.contract}...`);
                
                let constructorArgs = [];
                if (log.contract === "GenLayerOracleAdapter") {
                    constructorArgs = [relayerAddress];
                } else if (log.contract === "DisputeResolution" || log.contract === "MultiTokenDisputeResolution") {
                    constructorArgs = [treasuryAddress, oracleAdapterAddress];
                }

                await hre.run("verify:verify", {
                    address: log.address,
                    constructorArguments: constructorArgs,
                });
                console.log(`   ✅ ${log.contract} verified\n`);
            } catch (error) {
                if (error.message.includes("Already Verified")) {
                    console.log(`   ✅ ${log.contract} already verified\n`);
                } else {
                    console.log(`   ⚠️  ${log.contract} verification failed: ${error.message}\n`);
                }
            }
        }

        // ============ Save Deployment Info ============
        const deploymentInfo = {
            network: {
                name: network.name,
                chainId: network.chainId.toString(),
            },
            deployer: deployer.address,
            treasury: treasuryAddress,
            relayer: relayerAddress,
            contracts: deployedContracts,
            deploymentLog: deploymentLog,
            timestamp: new Date().toISOString(),
        };

        // Save to deployments folder
        const deploymentsDir = path.join(__dirname, "../deployments");
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const filename = `base-sepolia-${Date.now()}.json`;
        const filepath = path.join(deploymentsDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

        // Also save as latest
        const latestPath = path.join(deploymentsDir, "base-sepolia-latest.json");
        fs.writeFileSync(latestPath, JSON.stringify(deploymentInfo, null, 2));

        // ============ Print Summary ============
        console.log("\n" + "=".repeat(60));
        console.log("✅ DEPLOYMENT COMPLETE!");
        console.log("=".repeat(60));
        console.log("\n📋 Contract Addresses:\n");
        
        for (const [name, address] of Object.entries(deployedContracts)) {
            console.log(`   ${name}:`);
            console.log(`   ${address}`);
            console.log(`   https://sepolia.basescan.org/address/${address}\n`);
        }

        console.log("=".repeat(60));
        console.log("📝 Environment Variables (add to .env):\n");
        console.log(`DISPUTE_CONTRACT_ADDRESS=${deployedContracts.DisputeResolution}`);
        console.log(`ORACLE_ADAPTER_ADDRESS=${deployedContracts.GenLayerOracleAdapter}`);
        console.log(`EVIDENCE_MANAGER_ADDRESS=${deployedContracts.EvidenceManager}`);
        console.log(`REPUTATION_SYSTEM_ADDRESS=${deployedContracts.ReputationSystem}`);
        console.log(`MULTI_TOKEN_DISPUTE_ADDRESS=${deployedContracts.MultiTokenDisputeResolution}`);
        console.log("=".repeat(60));

        console.log(`\n💾 Deployment saved to: ${filepath}\n`);

        // ============ Post-Deployment Checklist ============
        console.log("📋 POST-DEPLOYMENT CHECKLIST:\n");
        console.log("   [ ] Update .env with contract addresses");
        console.log("   [ ] Update frontend config (VITE_CONTRACT_ADDRESS)");
        console.log("   [ ] Update subgraph.yaml with contract addresses");
        console.log("   [ ] Start GenLayer integration service");
        console.log("   [ ] Test creating a dispute");
        console.log("   [ ] Verify on Basescan (if failed above)\n");

        return deployedContracts;

    } catch (error) {
        console.error("\n❌ Deployment failed:", error.message);
        console.error(error);
        
        // Save partial deployment info for debugging
        if (Object.keys(deployedContracts).length > 0) {
            const partialDeployment = {
                status: "FAILED",
                error: error.message,
                contracts: deployedContracts,
                timestamp: new Date().toISOString(),
            };
            const errorPath = path.join(__dirname, "../deployments", `failed-${Date.now()}.json`);
            fs.writeFileSync(errorPath, JSON.stringify(partialDeployment, null, 2));
            console.log(`\n📝 Partial deployment saved to: ${errorPath}`);
        }
        
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
