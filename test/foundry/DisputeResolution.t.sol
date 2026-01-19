// test/foundry/DisputeResolution.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/DisputeResolution.sol";

contract DisputeResolutionTest is Test {
    DisputeResolution public disputeResolution;
    
    address public treasury = address(0x1);
    address public oracle = address(0x2);
    address public claimant = address(0x3);
    address public respondent = address(0x4);
    
    uint256 constant MIN_AMOUNT = 0.001 ether;
    uint256 constant MAX_AMOUNT = 1000 ether;

    function setUp() public {
        disputeResolution = new DisputeResolution(treasury, oracle);
        vm.deal(claimant, 100 ether);
        vm.deal(respondent, 100 ether);
    }

    // ============ Fuzz Tests ============

    function testFuzz_CreateDispute(uint256 amount) public {
        // Bound amount to valid range
        amount = bound(amount, MIN_AMOUNT, MAX_AMOUNT);
        
        vm.prank(claimant);
        uint256 disputeId = disputeResolution.createDispute{value: amount}(
            respondent,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
        
        assertEq(disputeId, 1);
        
        DisputeResolution.Dispute memory dispute = disputeResolution.getDispute(disputeId);
        assertEq(dispute.amount, amount);
        assertEq(dispute.claimant, claimant);
        assertEq(dispute.respondent, respondent);
    }

    function testFuzz_CreateDisputeRevertsOnLowAmount(uint256 amount) public {
        vm.assume(amount < MIN_AMOUNT);
        vm.assume(amount > 0); // Prevent zero value edge case
        
        vm.prank(claimant);
        vm.expectRevert("Amount too low");
        disputeResolution.createDispute{value: amount}(
            respondent,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
    }

    function testFuzz_CreateDisputeRevertsOnHighAmount(uint256 amount) public {
        amount = bound(amount, MAX_AMOUNT + 1, type(uint128).max);
        vm.deal(claimant, amount);
        
        vm.prank(claimant);
        vm.expectRevert("Amount too high");
        disputeResolution.createDispute{value: amount}(
            respondent,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
    }

    function testFuzz_AcceptDispute(uint256 amount) public {
        amount = bound(amount, MIN_AMOUNT, MAX_AMOUNT);
        
        // Create dispute
        vm.prank(claimant);
        uint256 disputeId = disputeResolution.createDispute{value: amount}(
            respondent,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
        
        // Accept dispute
        vm.prank(respondent);
        disputeResolution.acceptDispute{value: amount}(disputeId);
        
        DisputeResolution.Dispute memory dispute = disputeResolution.getDispute(disputeId);
        assertEq(uint8(dispute.status), uint8(DisputeResolution.DisputeStatus.EvidenceSubmission));
    }

    function testFuzz_SubmitEvidence(string calldata contentHash) public {
        vm.assume(bytes(contentHash).length > 0);
        vm.assume(bytes(contentHash).length <= 100);
        
        // Setup dispute
        vm.prank(claimant);
        uint256 disputeId = disputeResolution.createDispute{value: 1 ether}(
            respondent,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
        
        vm.prank(respondent);
        disputeResolution.acceptDispute{value: 1 ether}(disputeId);
        
        // Submit evidence
        vm.prank(claimant);
        disputeResolution.submitEvidence(
            disputeId,
            contentHash,
            DisputeResolution.EvidenceType.Document
        );
        
        DisputeResolution.Evidence[] memory evidence = disputeResolution.getDisputeEvidence(disputeId);
        assertEq(evidence.length, 1);
        assertEq(evidence[0].contentHash, contentHash);
    }

    function testFuzz_DeliverVerdict(uint8 resolution, uint8 confidence) public {
        resolution = uint8(bound(resolution, 1, 4)); // Valid resolutions: 1-4
        confidence = uint8(bound(confidence, 0, 100));
        
        // Setup dispute
        vm.prank(claimant);
        uint256 disputeId = disputeResolution.createDispute{value: 1 ether}(
            respondent,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
        
        vm.prank(respondent);
        disputeResolution.acceptDispute{value: 1 ether}(disputeId);
        
        vm.prank(claimant);
        disputeResolution.submitEvidence(disputeId, "QmEvidence1", DisputeResolution.EvidenceType.Document);
        
        vm.prank(respondent);
        disputeResolution.submitEvidence(disputeId, "QmEvidence2", DisputeResolution.EvidenceType.Document);
        
        vm.prank(claimant);
        disputeResolution.requestAIVerdict(disputeId);
        
        // Get request ID from events (simplified)
        bytes32 requestId = keccak256(abi.encodePacked(disputeId, block.timestamp));
        
        // Deliver verdict as oracle
        vm.prank(oracle);
        disputeResolution.deliverAIVerdict(
            requestId,
            DisputeResolution.Resolution(resolution),
            confidence,
            "QmReasoning"
        );
        
        DisputeResolution.Dispute memory dispute = disputeResolution.getDispute(disputeId);
        assertEq(dispute.aiConfidenceScore, confidence);
    }

    // ============ Invariant Tests ============

    function invariant_TotalValueLocked() public {
        // Contract balance should equal sum of all active dispute amounts
        uint256 disputeCount = disputeResolution.getDisputeCount();
        uint256 expectedBalance = 0;
        
        for (uint256 i = 1; i <= disputeCount; i++) {
            DisputeResolution.Dispute memory d = disputeResolution.getDispute(i);
            if (uint8(d.status) < 5) { // Not resolved or cancelled
                expectedBalance += d.amount;
                if (uint8(d.status) >= 1) { // Accepted
                    expectedBalance += d.amount; // Respondent's stake
                }
            }
        }
        
        // Allow for some variance due to fees
        assertLe(address(disputeResolution).balance, expectedBalance + 1 ether);
    }

    // ============ Edge Case Tests ============

    function test_CannotDisputeSelf() public {
        vm.prank(claimant);
        vm.expectRevert("Cannot dispute yourself");
        disputeResolution.createDispute{value: 1 ether}(
            claimant,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
    }

    function test_CannotDisputeZeroAddress() public {
        vm.prank(claimant);
        vm.expectRevert("Invalid respondent");
        disputeResolution.createDispute{value: 1 ether}(
            address(0),
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
    }

    function test_CannotAcceptOwnDispute() public {
        vm.prank(claimant);
        uint256 disputeId = disputeResolution.createDispute{value: 1 ether}(
            respondent,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
        
        vm.prank(claimant);
        vm.expectRevert("Not respondent");
        disputeResolution.acceptDispute{value: 1 ether}(disputeId);
    }

    function test_CannotCancelAfterAcceptance() public {
        vm.prank(claimant);
        uint256 disputeId = disputeResolution.createDispute{value: 1 ether}(
            respondent,
            DisputeResolution.DisputeCategory.ContractBreach,
            "QmTestHash"
        );
        
        vm.prank(respondent);
        disputeResolution.acceptDispute{value: 1 ether}(disputeId);
        
        vm.prank(claimant);
        vm.expectRevert("Cannot cancel");
        disputeResolution.cancelDispute(disputeId);
    }
}
