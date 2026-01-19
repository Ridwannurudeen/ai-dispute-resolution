// scripts/deploy-mainnet.js
/**
 * MAINNET Deployment Script for Base
 * Deploys all contracts with safety checks and confirmations
 * 
 * ⚠️  WARNING: This deploys to MAINNET with REAL funds
 */

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// Mainnet configuration
const CONFIG = {
    CHAIN_ID: 8453n,
    CHAIN_NAME: "Base Mainnet",
    EXPLORER: "https://basescan.org",
    
    // REQUIRED - Set before deployment
    TREASURY_ADDRESS: process.env.TREASURY_ADDRESS,
    RELAYER_ADDRESS: process.env.RELAYER_ADDRESS,
    
    // Minimum ETH required for deployment
    MIN_DEPLOYER_BALANCE: hre.ethers.parseEther("0.1"),
    
    // Contract parameters
    ORACLE_FEE: hre.ethers.parseEther("0.001"),
};

// Prompt for confirmation
async function confirm(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        });
    });
}

async function main() {
    console.log("\n" + "=".repeat(70));
    console.log("🚀 AI DISPUTE RESOLUTION - BASE MAINNET DEPLOYMENT");
    console.log("=".repeat(70));
    console.log("\n⚠️  WARNING: This will deploy contracts to MAINNET with REAL funds!\n");

    // ============ Pre-flight Checks ============
    console.log("🔍 Running pre-flight checks...\n");

    // Check network
    const network = await hre.ethers.provider.getNetwork();
    console.log(`   Network: ${network.name} (Chain ID: ${network.chainId})`);
    
    if (network.chainId !== CONFIG.CHAIN_ID) {
        console.log(`\n❌ ERROR: Wrong network!`);
        console.log(`   Expected: Base Mainnet (${CONFIG.CHAIN_ID})`);
        console.log(`   Got: ${network.chainId}`);
        console.log(`\n   Make sure you're using --network base`);
        process.exit(1);
    }
    console.log(`   ✅ Correct network (Base Mainnet)\n`);

    // Check deployer
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Balance: ${hre.ethers.formatEther(balance)} ETH`);

    if (balance < CONFIG.MIN_DEPLOYER_BALANCE) {
        console.log(`\n❌ ERROR: Insufficient balance!`);
        console.log(`   Required: ${hre.ethers.formatEther(CONFIG.MIN_DEPLOYER_BALANCE)} ETH`);
        console.log(`   Current: ${hre.ethers.formatEther(balance)} ETH`);
        process.exit(1);
    }
    console.log(`   ✅ Sufficient balance\n`);

    // Check required addresses
    if (!CONFIG.TREASURY_ADDRESS) {
        console.log(`❌ ERROR: TREASURY_ADDRESS not set in environment!`);
        console.log(`   This address will receive platform fees.`);
        process.exit(1);
    }
    console.log(`   Treasury: ${CONFIG.TREASURY_ADDRESS}`);
    console.log(`   ✅ Treasury configured\n`);

    if (!CONFIG.RELAYER_ADDRESS) {
        console.log(`❌ ERROR: RELAYER_ADDRESS not set in environment!`);
        console.log(`   This address will be the GenLayer oracle relayer.`);
        process.exit(1);
    }
    console.log(`   Relayer: ${CONFIG.RELAYER_ADDRESS}`);
    console.log(`   ✅ Relayer configured\n`);

    // ============ Confirmation ============
    console.log("=".repeat(70));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(70));
    console.log(`
   Network:     Base Mainnet (8453)
   Deployer:    ${deployer.address}
   Balance:     ${hre.ethers.formatEther(balance)} ETH
   Treasury:    ${CONFIG.TREASURY_ADDRESS}
   Relayer:     ${CONFIG.RELAYER_ADDRESS}

   Contracts to deploy:
   - EvidenceManager
   - GenLayerOracleAdapter  
   - DisputeResolution
   - ReputationSystem
   - MultiTokenDisputeResolution

   Estimated gas cost: ~0.05-0.08 ETH
`);
    console.log("=".repeat(70) + "\n");

    // Skip confirmation if CI or explicit flag
    if (process.env.CI !== 'true' && process.env.SKIP_CONFIRM !== 'true') {
        const confirmed = await confirm("Type 'yes' to proceed with mainnet deployment: ");
        if (!confirmed) {
            console.log("\n❌ Deployment cancelled by user.\n");
            process.exit(0);
        }
    }

    console.log("\n🚀 Starting deployment...\n");

    const deployedContracts = {};
    const deploymentLog = [];
    const gasUsed = { total: 0n };

    try {
        // ============ 1. Deploy EvidenceManager ============
        console.log("📦 [1/5] Deploying EvidenceManager...");
        const EvidenceManager = await hre.ethers.getContractFactory("EvidenceManager");
        const evidenceManager = await EvidenceManager.deploy();
        await evidenceManager.waitForDeployment();
        const evidenceManagerAddress = await evidenceManager.getAddress();
        const emReceipt = await evidenceManager.deploymentTransaction()?.wait();
        gasUsed.total += emReceipt?.gasUsed || 0n;
        
        deployedContracts.EvidenceManager = evidenceManagerAddress;
        deploymentLog.push({ 
            contract: "EvidenceManager", 
            address: evidenceManagerAddress, 
            tx: evidenceManager.deploymentTransaction()?.hash,
            gasUsed: emReceipt?.gasUsed?.toString()
        });
        console.log(`   ✅ ${evidenceManagerAddress}`);
        console.log(`   Gas: ${emReceipt?.gasUsed}\n`);

        // ============ 2. Deploy GenLayerOracleAdapter ============
        console.log("📦 [2/5] Deploying GenLayerOracleAdapter...");
        const GenLayerOracleAdapter = await hre.ethers.getContractFactory("GenLayerOracleAdapter");
        const oracleAdapter = await GenLayerOracleAdapter.deploy(CONFIG.RELAYER_ADDRESS);
        await oracleAdapter.waitForDeployment();
        const oracleAdapterAddress = await oracleAdapter.getAddress();
        const oaReceipt = await oracleAdapter.deploymentTransaction()?.wait();
        gasUsed.total += oaReceipt?.gasUsed || 0n;
        
        deployedContracts.GenLayerOracleAdapter = oracleAdapterAddress;
        deploymentLog.push({ 
            contract: "GenLayerOracleAdapter", 
            address: oracleAdapterAddress, 
            tx: oracleAdapter.deploymentTransaction()?.hash,
            gasUsed: oaReceipt?.gasUsed?.toString()
        });
        console.log(`   ✅ ${oracleAdapterAddress}`);
        console.log(`   Gas: ${oaReceipt?.gasUsed}\n`);

        // ============ 3. Deploy DisputeResolution ============
        console.log("📦 [3/5] Deploying DisputeResolution (main contract)...");
        const DisputeResolution = await hre.ethers.getContractFactory("DisputeResolution");
        const disputeResolution = await DisputeResolution.deploy(
            CONFIG.TREASURY_ADDRESS, 
            oracleAdapterAddress
        );
        await disputeResolution.waitForDeployment();
        const disputeResolutionAddress = await disputeResolution.getAddress();
        const drReceipt = await disputeResolution.deploymentTransaction()?.wait();
        gasUsed.total += drReceipt?.gasUsed || 0n;
        
        deployedContracts.DisputeResolution = disputeResolutionAddress;
        deploymentLog.push({ 
            contract: "DisputeResolution", 
            address: disputeResolutionAddress, 
            tx: disputeResolution.deploymentTransaction()?.hash,
            gasUsed: drReceipt?.gasUsed?.toString()
        });
        console.log(`   ✅ ${disputeResolutionAddress}`);
        console.log(`   Gas: ${drReceipt?.gasUsed}\n`);

        // ============ 4. Deploy ReputationSystem ============
        console.log("📦 [4/5] Deploying ReputationSystem...");
        const ReputationSystem = await hre.ethers.getContractFactory("ReputationSystem");
        const reputationSystem = await ReputationSystem.deploy();
        await reputationSystem.waitForDeployment();
        const reputationSystemAddress = await reputationSystem.getAddress();
        const rsReceipt = await reputationSystem.deploymentTransaction()?.wait();
        gasUsed.total += rsReceipt?.gasUsed || 0n;
        
        deployedContracts.ReputationSystem = reputationSystemAddress;
        deploymentLog.push({ 
            contract: "ReputationSystem", 
            address: reputationSystemAddress, 
            tx: reputationSystem.deploymentTransaction()?.hash,
            gasUsed: rsReceipt?.gasUsed?.toString()
        });
        console.log(`   ✅ ${reputationSystemAddress}`);
        console.log(`   Gas: ${rsReceipt?.gasUsed}\n`);

        // ============ 5. Deploy MultiTokenDisputeResolution ============
        console.log("📦 [5/5] Deploying MultiTokenDisputeResolution...");
        const MultiTokenDisputeResolution = await hre.ethers.getContractFactory("MultiTokenDisputeResolution");
        const multiTokenDispute = await MultiTokenDisputeResolution.deploy(
            CONFIG.TREASURY_ADDRESS, 
            oracleAdapterAddress
        );
        await multiTokenDispute.waitForDeployment();
        const multiTokenDisputeAddress = await multiTokenDispute.getAddress();
        const mtReceipt = await multiTokenDispute.deploymentTransaction()?.wait();
        gasUsed.total += mtReceipt?.gasUsed || 0n;
        
        deployedContracts.MultiTokenDisputeResolution = multiTokenDisputeAddress;
        deploymentLog.push({ 
            contract: "MultiTokenDisputeResolution", 
            address: multiTokenDisputeAddress, 
            tx: multiTokenDispute.deploymentTransaction()?.hash,
            gasUsed: mtReceipt?.gasUsed?.toString()
        });
        console.log(`   ✅ ${multiTokenDisputeAddress}`);
        console.log(`   Gas: ${mtReceipt?.gasUsed}\n`);

        // ============ Configure Contracts ============
        console.log("⚙️  Configuring contracts...\n");

        console.log("   [1/2] Setting dispute contract on oracle adapter...");
        let tx = await oracleAdapter.setDisputeContract(disputeResolutionAddress);
        let receipt = await tx.wait();
        gasUsed.total += receipt?.gasUsed || 0n;
        console.log(`   ✅ Done (Gas: ${receipt?.gasUsed})\n`);

        console.log("   [2/2] Granting DISPUTE_CONTRACT_ROLE on ReputationSystem...");
        tx = await reputationSystem.setDisputeContract(disputeResolutionAddress);
        receipt = await tx.wait();
        gasUsed.total += receipt?.gasUsed || 0n;
        console.log(`   ✅ Done (Gas: ${receipt?.gasUsed})\n`);

        // ============ Verify Contracts ============
        if (process.env.BASESCAN_API_KEY) {
            console.log("🔍 Verifying contracts on Basescan...\n");
            console.log("   Waiting 30s for indexing...\n");
            await new Promise(resolve => setTimeout(resolve, 30000));

            const verifications = [
                { name: "EvidenceManager", address: evidenceManagerAddress, args: [] },
                { name: "GenLayerOracleAdapter", address: oracleAdapterAddress, args: [CONFIG.RELAYER_ADDRESS] },
                { name: "DisputeResolution", address: disputeResolutionAddress, args: [CONFIG.TREASURY_ADDRESS, oracleAdapterAddress] },
                { name: "ReputationSystem", address: reputationSystemAddress, args: [] },
                { name: "MultiTokenDisputeResolution", address: multiTokenDisputeAddress, args: [CONFIG.TREASURY_ADDRESS, oracleAdapterAddress] },
            ];

            for (const v of verifications) {
                try {
                    console.log(`   Verifying ${v.name}...`);
                    await hre.run("verify:verify", {
                        address: v.address,
                        constructorArguments: v.args,
                    });
                    console.log(`   ✅ Verified\n`);
                } catch (error) {
                    if (error.message.includes("Already Verified")) {
                        console.log(`   ✅ Already verified\n`);
                    } else {
                        console.log(`   ⚠️  Failed: ${error.message}\n`);
                    }
                }
            }
        }

        // ============ Save Deployment ============
        const finalBalance = await hre.ethers.provider.getBalance(deployer.address);
        const deploymentCost = balance - finalBalance;

        const deploymentInfo = {
            network: {
                name: "Base Mainnet",
                chainId: "8453",
                explorer: CONFIG.EXPLORER,
            },
            deployer: deployer.address,
            treasury: CONFIG.TREASURY_ADDRESS,
            relayer: CONFIG.RELAYER_ADDRESS,
            contracts: deployedContracts,
            deploymentLog,
            gasUsed: {
                total: gasUsed.total.toString(),
                cost: hre.ethers.formatEther(deploymentCost) + " ETH"
            },
            timestamp: new Date().toISOString(),
        };

        const deploymentsDir = path.join(__dirname, "../deployments");
        if (!fs.existsSync(deploymentsDir)) {
            fs.mkdirSync(deploymentsDir, { recursive: true });
        }

        const filename = `base-mainnet-${Date.now()}.json`;
        fs.writeFileSync(path.join(deploymentsDir, filename), JSON.stringify(deploymentInfo, null, 2));
        fs.writeFileSync(path.join(deploymentsDir, "base-mainnet-latest.json"), JSON.stringify(deploymentInfo, null, 2));

        // ============ Print Summary ============
        console.log("\n" + "=".repeat(70));
        console.log("✅ MAINNET DEPLOYMENT COMPLETE!");
        console.log("=".repeat(70));
        
        console.log("\n📋 DEPLOYED CONTRACTS:\n");
        for (const [name, address] of Object.entries(deployedContracts)) {
            console.log(`   ${name}:`);
            console.log(`   ${address}`);
            console.log(`   ${CONFIG.EXPLORER}/address/${address}\n`);
        }

        console.log("=".repeat(70));
        console.log("💰 DEPLOYMENT COST:");
        console.log(`   Total Gas: ${gasUsed.total}`);
        console.log(`   ETH Spent: ${hre.ethers.formatEther(deploymentCost)} ETH`);
        console.log("=".repeat(70));

        console.log("\n📝 ADD TO .env:\n");
        console.log(`DISPUTE_CONTRACT_ADDRESS=${deployedContracts.DisputeResolution}`);
        console.log(`ORACLE_ADAPTER_ADDRESS=${deployedContracts.GenLayerOracleAdapter}`);
        console.log(`EVIDENCE_MANAGER_ADDRESS=${deployedContracts.EvidenceManager}`);
        console.log(`REPUTATION_SYSTEM_ADDRESS=${deployedContracts.ReputationSystem}`);
        console.log(`MULTI_TOKEN_DISPUTE_ADDRESS=${deployedContracts.MultiTokenDisputeResolution}`);

        console.log("\n" + "=".repeat(70));
        console.log(`💾 Saved to: deployments/${filename}`);
        console.log("=".repeat(70) + "\n");

        return deployedContracts;

    } catch (error) {
        console.error("\n❌ DEPLOYMENT FAILED:", error.message);
        
        if (Object.keys(deployedContracts).length > 0) {
            console.log("\nPartially deployed:");
            for (const [name, addr] of Object.entries(deployedContracts)) {
                console.log(`   ${name}: ${addr}`);
            }
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
