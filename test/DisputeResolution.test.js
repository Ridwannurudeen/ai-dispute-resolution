// test/DisputeResolution.test.js
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("DisputeResolution", function () {
    let disputeResolution;
    let oracleAdapter;
    let evidenceManager;
    let owner, treasury, oracle, claimant, respondent, arbiter;
    
    const MIN_AMOUNT = ethers.parseEther("0.001");
    const DISPUTE_AMOUNT = ethers.parseEther("1.0");
    const EVIDENCE_PERIOD = 3 * 24 * 60 * 60; // 3 days
    const APPEAL_PERIOD = 2 * 24 * 60 * 60; // 2 days

    beforeEach(async function () {
        [owner, treasury, oracle, claimant, respondent, arbiter] = await ethers.getSigners();

        // Deploy EvidenceManager
        const EvidenceManager = await ethers.getContractFactory("EvidenceManager");
        evidenceManager = await EvidenceManager.deploy();
        await evidenceManager.waitForDeployment();

        // Deploy GenLayerOracleAdapter
        const GenLayerOracleAdapter = await ethers.getContractFactory("GenLayerOracleAdapter");
        oracleAdapter = await GenLayerOracleAdapter.deploy(oracle.address);
        await oracleAdapter.waitForDeployment();

        // Deploy DisputeResolution
        const DisputeResolution = await ethers.getContractFactory("DisputeResolution");
        disputeResolution = await DisputeResolution.deploy(
            treasury.address,
            await oracleAdapter.getAddress()
        );
        await disputeResolution.waitForDeployment();

        // Setup roles
        await oracleAdapter.setDisputeResolutionContract(await disputeResolution.getAddress());
    });

    describe("Deployment", function () {
        it("Should set the correct treasury", async function () {
            expect(await disputeResolution.treasury()).to.equal(treasury.address);
        });

        it("Should set the correct oracle", async function () {
            expect(await disputeResolution.genLayerOracle()).to.equal(
                await oracleAdapter.getAddress()
            );
        });

        it("Should grant admin role to deployer", async function () {
            const ADMIN_ROLE = await disputeResolution.ADMIN_ROLE();
            expect(await disputeResolution.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should have correct constants", async function () {
            expect(await disputeResolution.MIN_DISPUTE_AMOUNT()).to.equal(MIN_AMOUNT);
            expect(await disputeResolution.PLATFORM_FEE_BPS()).to.equal(250);
            expect(await disputeResolution.APPEAL_STAKE_BPS()).to.equal(1000);
        });
    });

    describe("Creating Disputes", function () {
        it("Should create a dispute successfully", async function () {
            const descriptionHash = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
            
            await expect(
                disputeResolution.connect(claimant).createDispute(
                    respondent.address,
                    0, // ContractBreach
                    descriptionHash,
                    { value: DISPUTE_AMOUNT }
                )
            ).to.emit(disputeResolution, "DisputeCreated")
             .withArgs(1, claimant.address, respondent.address, DISPUTE_AMOUNT, 0);

            const dispute = await disputeResolution.getDispute(1);
            expect(dispute.claimant).to.equal(claimant.address);
            expect(dispute.respondent).to.equal(respondent.address);
            expect(dispute.amount).to.equal(DISPUTE_AMOUNT);
            expect(dispute.status).to.equal(0); // Created
        });

        it("Should reject dispute with amount too low", async function () {
            await expect(
                disputeResolution.connect(claimant).createDispute(
                    respondent.address,
                    0,
                    "QmHash",
                    { value: ethers.parseEther("0.0001") }
                )
            ).to.be.revertedWith("Amount too low");
        });

        it("Should reject dispute against self", async function () {
            await expect(
                disputeResolution.connect(claimant).createDispute(
                    claimant.address,
                    0,
                    "QmHash",
                    { value: DISPUTE_AMOUNT }
                )
            ).to.be.revertedWith("Cannot dispute yourself");
        });

        it("Should reject dispute with zero address respondent", async function () {
            await expect(
                disputeResolution.connect(claimant).createDispute(
                    ethers.ZeroAddress,
                    0,
                    "QmHash",
                    { value: DISPUTE_AMOUNT }
                )
            ).to.be.revertedWith("Invalid respondent");
        });

        it("Should track user disputes correctly", async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash1",
                { value: DISPUTE_AMOUNT }
            );

            const claimantDisputes = await disputeResolution.getUserDisputes(claimant.address);
            const respondentDisputes = await disputeResolution.getUserDisputes(respondent.address);
            
            expect(claimantDisputes.length).to.equal(1);
            expect(respondentDisputes.length).to.equal(1);
            expect(claimantDisputes[0]).to.equal(1n);
        });
    });

    describe("Accepting Disputes", function () {
        beforeEach(async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
        });

        it("Should allow respondent to accept dispute", async function () {
            await disputeResolution.connect(respondent).acceptDispute(1, { value: DISPUTE_AMOUNT });
            
            const dispute = await disputeResolution.getDispute(1);
            expect(dispute.status).to.equal(1); // EvidenceSubmission
        });

        it("Should reject if not respondent", async function () {
            await expect(
                disputeResolution.connect(claimant).acceptDispute(1, { value: DISPUTE_AMOUNT })
            ).to.be.revertedWith("Not respondent");
        });

        it("Should reject if amount doesn't match", async function () {
            await expect(
                disputeResolution.connect(respondent).acceptDispute(1, { 
                    value: ethers.parseEther("0.5") 
                })
            ).to.be.revertedWith("Must match dispute amount");
        });
    });

    describe("Evidence Submission", function () {
        beforeEach(async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
            await disputeResolution.connect(respondent).acceptDispute(1, { value: DISPUTE_AMOUNT });
        });

        it("Should allow claimant to submit evidence", async function () {
            const evidenceHash = "QmEvidence1234567890123456789012345678901234";
            
            await expect(
                disputeResolution.connect(claimant).submitEvidence(1, evidenceHash, 0)
            ).to.emit(disputeResolution, "EvidenceSubmitted")
             .withArgs(1, claimant.address, evidenceHash, 0);
        });

        it("Should allow respondent to submit evidence", async function () {
            const evidenceHash = "QmEvidence1234567890123456789012345678901234";
            
            await disputeResolution.connect(respondent).submitEvidence(1, evidenceHash, 1);
            
            const evidence = await disputeResolution.getDisputeEvidence(1);
            expect(evidence.length).to.equal(1);
        });

        it("Should reject evidence from non-party", async function () {
            await expect(
                disputeResolution.connect(arbiter).submitEvidence(1, "QmHash", 0)
            ).to.be.revertedWith("Not a dispute party");
        });

        it("Should reject evidence after deadline", async function () {
            // Fast forward past evidence period
            await time.increase(EVIDENCE_PERIOD + 1);

            await expect(
                disputeResolution.connect(claimant).submitEvidence(1, "QmHash", 0)
            ).to.be.revertedWith("Deadline passed");
        });
    });

    describe("AI Verdict", function () {
        beforeEach(async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
            await disputeResolution.connect(respondent).acceptDispute(1, { value: DISPUTE_AMOUNT });
            await disputeResolution.connect(claimant).submitEvidence(1, "QmEvidence1", 0);
            await disputeResolution.connect(respondent).submitEvidence(1, "QmEvidence2", 0);
        });

        it("Should allow requesting AI verdict after evidence submitted", async function () {
            await expect(
                disputeResolution.connect(claimant).requestAIVerdict(1)
            ).to.emit(disputeResolution, "AIVerdictRequested");

            const dispute = await disputeResolution.getDispute(1);
            expect(dispute.status).to.equal(2); // AwaitingAIVerdict
        });

        it("Should deliver AI verdict correctly", async function () {
            await disputeResolution.connect(claimant).requestAIVerdict(1);

            // Get the request ID from events
            const filter = disputeResolution.filters.AIVerdictRequested();
            const events = await disputeResolution.queryFilter(filter);
            const requestId = events[0].args.genLayerRequestId;

            // Grant oracle role and deliver verdict
            const ORACLE_ROLE = await disputeResolution.ORACLE_ROLE();
            await disputeResolution.connect(owner).grantRole(ORACLE_ROLE, oracle.address);

            await expect(
                disputeResolution.connect(oracle).deliverAIVerdict(
                    requestId,
                    1, // FavorClaimant
                    85, // Confidence score
                    "QmReasoning"
                )
            ).to.emit(disputeResolution, "AIVerdictReceived")
             .withArgs(1, 1, 85);

            const dispute = await disputeResolution.getDispute(1);
            expect(dispute.status).to.equal(3); // VerdictDelivered
            expect(dispute.resolution).to.equal(1); // FavorClaimant
            expect(dispute.aiConfidenceScore).to.equal(85);
        });
    });

    describe("Appeals", function () {
        beforeEach(async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
            await disputeResolution.connect(respondent).acceptDispute(1, { value: DISPUTE_AMOUNT });
            await disputeResolution.connect(claimant).submitEvidence(1, "QmEvidence1", 0);
            await disputeResolution.connect(respondent).submitEvidence(1, "QmEvidence2", 0);
            await disputeResolution.connect(claimant).requestAIVerdict(1);

            // Deliver verdict
            const filter = disputeResolution.filters.AIVerdictRequested();
            const events = await disputeResolution.queryFilter(filter);
            const requestId = events[0].args.genLayerRequestId;
            
            const ORACLE_ROLE = await disputeResolution.ORACLE_ROLE();
            await disputeResolution.connect(owner).grantRole(ORACLE_ROLE, oracle.address);
            await disputeResolution.connect(oracle).deliverAIVerdict(
                requestId, 1, 85, "QmReasoning"
            );
        });

        it("Should allow respondent to appeal", async function () {
            const appealStake = (DISPUTE_AMOUNT * 2n * 1000n) / 10000n; // 10% of total pool
            
            await expect(
                disputeResolution.connect(respondent).appealVerdict(1, { value: appealStake })
            ).to.emit(disputeResolution, "DisputeAppealed")
             .withArgs(1, respondent.address, appealStake);

            const dispute = await disputeResolution.getDispute(1);
            expect(dispute.appealed).to.be.true;
            expect(dispute.status).to.equal(4); // AppealPeriod
        });

        it("Should reject appeal with insufficient stake", async function () {
            await expect(
                disputeResolution.connect(respondent).appealVerdict(1, { 
                    value: ethers.parseEther("0.01") 
                })
            ).to.be.revertedWith("Insufficient appeal stake");
        });

        it("Should reject appeal after deadline", async function () {
            await time.increase(APPEAL_PERIOD + 1);

            await expect(
                disputeResolution.connect(respondent).appealVerdict(1, { 
                    value: ethers.parseEther("0.2") 
                })
            ).to.be.revertedWith("Appeal period ended");
        });
    });

    describe("Finalization", function () {
        beforeEach(async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
            await disputeResolution.connect(respondent).acceptDispute(1, { value: DISPUTE_AMOUNT });
            await disputeResolution.connect(claimant).submitEvidence(1, "QmEvidence1", 0);
            await disputeResolution.connect(respondent).submitEvidence(1, "QmEvidence2", 0);
            await disputeResolution.connect(claimant).requestAIVerdict(1);

            const filter = disputeResolution.filters.AIVerdictRequested();
            const events = await disputeResolution.queryFilter(filter);
            const requestId = events[0].args.genLayerRequestId;
            
            const ORACLE_ROLE = await disputeResolution.ORACLE_ROLE();
            await disputeResolution.connect(owner).grantRole(ORACLE_ROLE, oracle.address);
            await disputeResolution.connect(oracle).deliverAIVerdict(
                requestId, 1, 85, "QmReasoning" // FavorClaimant
            );
        });

        it("Should finalize dispute after appeal period", async function () {
            await time.increase(APPEAL_PERIOD + 1);

            const claimantBalanceBefore = await ethers.provider.getBalance(claimant.address);
            const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);

            await expect(
                disputeResolution.finalizeDispute(1)
            ).to.emit(disputeResolution, "DisputeResolved");

            const dispute = await disputeResolution.getDispute(1);
            expect(dispute.status).to.equal(5); // Resolved

            // Check balances
            const claimantBalanceAfter = await ethers.provider.getBalance(claimant.address);
            const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);

            // Claimant should receive ~1.95 ETH (2 ETH pool - 2.5% fee)
            expect(claimantBalanceAfter - claimantBalanceBefore).to.be.closeTo(
                ethers.parseEther("1.95"),
                ethers.parseEther("0.001")
            );

            // Treasury should receive 2.5% fee
            expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(
                ethers.parseEther("0.05")
            );
        });

        it("Should not allow finalization during appeal period", async function () {
            await expect(
                disputeResolution.finalizeDispute(1)
            ).to.be.revertedWith("Appeal period active");
        });
    });

    describe("Cancellation", function () {
        beforeEach(async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
        });

        it("Should allow claimant to cancel before acceptance", async function () {
            const balanceBefore = await ethers.provider.getBalance(claimant.address);
            
            const tx = await disputeResolution.connect(claimant).cancelDispute(1);
            const receipt = await tx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            const balanceAfter = await ethers.provider.getBalance(claimant.address);

            expect(balanceAfter + gasUsed - balanceBefore).to.equal(DISPUTE_AMOUNT);

            const dispute = await disputeResolution.getDispute(1);
            expect(dispute.status).to.equal(6); // Cancelled
        });

        it("Should not allow respondent to cancel", async function () {
            await expect(
                disputeResolution.connect(respondent).cancelDispute(1)
            ).to.be.revertedWith("Only claimant");
        });

        it("Should not allow cancellation after acceptance", async function () {
            await disputeResolution.connect(respondent).acceptDispute(1, { value: DISPUTE_AMOUNT });

            await expect(
                disputeResolution.connect(claimant).cancelDispute(1)
            ).to.be.revertedWith("Cannot cancel");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow admin to update treasury", async function () {
            const newTreasury = arbiter.address;
            await disputeResolution.setTreasury(newTreasury);
            expect(await disputeResolution.treasury()).to.equal(newTreasury);
        });

        it("Should allow admin to pause/unpause", async function () {
            await disputeResolution.pause();
            
            await expect(
                disputeResolution.connect(claimant).createDispute(
                    respondent.address,
                    0,
                    "QmHash",
                    { value: DISPUTE_AMOUNT }
                )
            ).to.be.revertedWith("Pausable: paused");

            await disputeResolution.unpause();

            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
        });

        it("Should not allow non-admin to change treasury", async function () {
            await expect(
                disputeResolution.connect(claimant).setTreasury(arbiter.address)
            ).to.be.reverted;
        });
    });

    describe("View Functions", function () {
        beforeEach(async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
        });

        it("Should return dispute count", async function () {
            expect(await disputeResolution.getDisputeCount()).to.equal(1);
        });

        it("Should return dispute details", async function () {
            const dispute = await disputeResolution.getDispute(1);
            expect(dispute.id).to.equal(1);
            expect(dispute.claimant).to.equal(claimant.address);
            expect(dispute.respondent).to.equal(respondent.address);
        });

        it("Should return user disputes", async function () {
            const disputes = await disputeResolution.getUserDisputes(claimant.address);
            expect(disputes.length).to.equal(1);
            expect(disputes[0]).to.equal(1n);
        });
    });

    describe("Split Resolution", function () {
        it("Should split funds equally on Split verdict", async function () {
            await disputeResolution.connect(claimant).createDispute(
                respondent.address,
                0,
                "QmHash",
                { value: DISPUTE_AMOUNT }
            );
            await disputeResolution.connect(respondent).acceptDispute(1, { value: DISPUTE_AMOUNT });
            await disputeResolution.connect(claimant).submitEvidence(1, "QmEvidence1", 0);
            await disputeResolution.connect(respondent).submitEvidence(1, "QmEvidence2", 0);
            await disputeResolution.connect(claimant).requestAIVerdict(1);

            const filter = disputeResolution.filters.AIVerdictRequested();
            const events = await disputeResolution.queryFilter(filter);
            const requestId = events[0].args.genLayerRequestId;
            
            const ORACLE_ROLE = await disputeResolution.ORACLE_ROLE();
            await disputeResolution.connect(owner).grantRole(ORACLE_ROLE, oracle.address);
            await disputeResolution.connect(oracle).deliverAIVerdict(
                requestId, 3, 70, "QmReasoning" // Split
            );

            await time.increase(APPEAL_PERIOD + 1);

            const claimantBefore = await ethers.provider.getBalance(claimant.address);
            const respondentBefore = await ethers.provider.getBalance(respondent.address);

            await disputeResolution.finalizeDispute(1);

            const claimantAfter = await ethers.provider.getBalance(claimant.address);
            const respondentAfter = await ethers.provider.getBalance(respondent.address);

            // Each should receive ~0.975 ETH (half of 1.95 ETH after fee)
            expect(claimantAfter - claimantBefore).to.be.closeTo(
                ethers.parseEther("0.975"),
                ethers.parseEther("0.001")
            );
            expect(respondentAfter - respondentBefore).to.be.closeTo(
                ethers.parseEther("0.975"),
                ethers.parseEther("0.001")
            );
        });
    });
});

describe("EvidenceManager", function () {
    let evidenceManager;
    let owner, submitter, verifier;

    beforeEach(async function () {
        [owner, submitter, verifier] = await ethers.getSigners();

        const EvidenceManager = await ethers.getContractFactory("EvidenceManager");
        evidenceManager = await EvidenceManager.deploy();
        await evidenceManager.waitForDeployment();

        const VERIFIER_ROLE = await evidenceManager.VERIFIER_ROLE();
        await evidenceManager.grantRole(VERIFIER_ROLE, verifier.address);
    });

    it("Should submit evidence successfully", async function () {
        const ipfsHash = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
        
        await expect(
            evidenceManager.connect(submitter).submitEvidence(
                1, // disputeId
                ipfsHash,
                "QmMetadata",
                0, // Document type
                1024, // file size
                "application/pdf",
                false // not confidential
            )
        ).to.emit(evidenceManager, "EvidenceSubmitted");

        const evidence = await evidenceManager.getEvidence(1);
        expect(evidence.ipfsHash).to.equal(ipfsHash);
        expect(evidence.submitter).to.equal(submitter.address);
    });

    it("Should verify evidence", async function () {
        await evidenceManager.connect(submitter).submitEvidence(
            1,
            "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
            "QmMetadata",
            0,
            1024,
            "application/pdf",
            false
        );

        await expect(
            evidenceManager.connect(verifier).verifyEvidence(1, 1) // Verified status
        ).to.emit(evidenceManager, "EvidenceVerified")
         .withArgs(1, 1, verifier.address);

        const evidence = await evidenceManager.getEvidence(1);
        expect(evidence.status).to.equal(1); // Verified
    });

    it("Should reject duplicate evidence hash", async function () {
        const ipfsHash = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";
        
        await evidenceManager.connect(submitter).submitEvidence(
            1, ipfsHash, "QmMeta1", 0, 1024, "application/pdf", false
        );

        await expect(
            evidenceManager.connect(submitter).submitEvidence(
                1, ipfsHash, "QmMeta2", 0, 1024, "application/pdf", false
            )
        ).to.be.revertedWith("Evidence already submitted");
    });

    it("Should batch submit evidence", async function () {
        const hashes = [
            "QmHash1234567890123456789012345678901234567890a",
            "QmHash1234567890123456789012345678901234567890b",
            "QmHash1234567890123456789012345678901234567890c"
        ];
        const metaHashes = ["QmMeta1", "QmMeta2", "QmMeta3"];
        const types = [0, 1, 2];

        const tx = await evidenceManager.connect(submitter).batchSubmitEvidence(
            1, hashes, metaHashes, types
        );

        const receipt = await tx.wait();
        
        const count = await evidenceManager.getDisputeEvidenceCount(1);
        expect(count).to.equal(3);
    });
});

describe("GenLayerOracleAdapter", function () {
    let oracleAdapter;
    let owner, relayer, disputeContract;

    beforeEach(async function () {
        [owner, relayer, disputeContract] = await ethers.getSigners();

        const GenLayerOracleAdapter = await ethers.getContractFactory("GenLayerOracleAdapter");
        oracleAdapter = await GenLayerOracleAdapter.deploy(relayer.address);
        await oracleAdapter.waitForDeployment();

        await oracleAdapter.setDisputeResolutionContract(disputeContract.address);
    });

    it("Should have correct initial state", async function () {
        expect(await oracleAdapter.genLayerRelayer()).to.equal(relayer.address);
        expect(await oracleAdapter.disputeResolutionContract()).to.equal(disputeContract.address);
    });

    it("Should update relayer", async function () {
        const newRelayer = owner.address;
        
        await expect(
            oracleAdapter.setRelayer(newRelayer)
        ).to.emit(oracleAdapter, "RelayerUpdated")
         .withArgs(relayer.address, newRelayer);

        expect(await oracleAdapter.genLayerRelayer()).to.equal(newRelayer);
    });

    it("Should update oracle fee", async function () {
        const newFee = ethers.parseEther("0.002");
        
        await expect(
            oracleAdapter.setOracleFee(newFee)
        ).to.emit(oracleAdapter, "FeeUpdated");

        expect(await oracleAdapter.oracleFee()).to.equal(newFee);
    });

    it("Should not allow non-owner to update settings", async function () {
        await expect(
            oracleAdapter.connect(relayer).setRelayer(owner.address)
        ).to.be.reverted;
    });
});
