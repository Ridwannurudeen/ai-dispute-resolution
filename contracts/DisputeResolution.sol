// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title DisputeResolution
 * @author AI Dispute Resolution Team
 * @notice Main contract for AI-verified dispute resolution on Base L2
 * @dev Integrates with GenLayer for AI consensus verdicts
 */
contract DisputeResolution is ReentrancyGuard, AccessControl, Pausable {
    
    // ============ Roles ============
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant ARBITER_ROLE = keccak256("ARBITER_ROLE");

    // ============ Enums ============
    enum DisputeStatus {
        Created,
        EvidenceSubmission,
        AwaitingAIVerdict,
        VerdictDelivered,
        AppealPeriod,
        Resolved,
        Cancelled
    }

    enum Resolution {
        None,
        FavorClaimant,
        FavorRespondent,
        Split,
        Dismissed
    }

    enum DisputeCategory {
        ContractBreach,
        ServiceQuality,
        PaymentDispute,
        IntellectualProperty,
        FraudClaim,
        Other
    }

    // ============ Structs ============
    struct Dispute {
        uint256 id;
        address claimant;
        address respondent;
        uint256 amount;
        uint256 createdAt;
        uint256 evidenceDeadline;
        uint256 appealDeadline;
        DisputeStatus status;
        Resolution resolution;
        DisputeCategory category;
        string descriptionHash;  // IPFS hash
        uint8 aiConfidenceScore; // 0-100
        bool appealed;
    }

    struct Evidence {
        address submitter;
        string contentHash;     // IPFS hash
        uint256 timestamp;
        EvidenceType evidenceType;
    }

    enum EvidenceType {
        Document,
        Image,
        Video,
        Contract,
        Communication,
        Transaction,
        Other
    }

    struct AIVerdict {
        Resolution decision;
        uint8 confidenceScore;
        string reasoningHash;   // IPFS hash for detailed reasoning
        uint256 timestamp;
        bytes32 genLayerRequestId;
    }

    // ============ State Variables ============
    uint256 public disputeCounter;
    uint256 public constant MIN_DISPUTE_AMOUNT = 0.001 ether;
    uint256 public constant MAX_DISPUTE_AMOUNT = 1000 ether;
    uint256 public constant EVIDENCE_PERIOD = 3 days;
    uint256 public constant APPEAL_PERIOD = 2 days;
    uint256 public constant PLATFORM_FEE_BPS = 250; // 2.5%
    uint256 public constant APPEAL_STAKE_BPS = 1000; // 10%
    
    address public treasury;
    address public genLayerOracle;
    
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => Evidence[]) public disputeEvidence;
    mapping(uint256 => AIVerdict) public aiVerdicts;
    mapping(uint256 => uint256) public appealStakes;
    mapping(address => uint256[]) public userDisputes;
    mapping(bytes32 => uint256) public genLayerRequestToDispute;

    // ============ Events ============
    event DisputeCreated(
        uint256 indexed disputeId,
        address indexed claimant,
        address indexed respondent,
        uint256 amount,
        DisputeCategory category
    );
    
    event EvidenceSubmitted(
        uint256 indexed disputeId,
        address indexed submitter,
        string contentHash,
        EvidenceType evidenceType
    );
    
    event AIVerdictRequested(
        uint256 indexed disputeId,
        bytes32 indexed genLayerRequestId
    );
    
    event AIVerdictReceived(
        uint256 indexed disputeId,
        Resolution resolution,
        uint8 confidenceScore
    );
    
    event DisputeAppealed(
        uint256 indexed disputeId,
        address indexed appealer,
        uint256 stakeAmount
    );
    
    event DisputeResolved(
        uint256 indexed disputeId,
        Resolution resolution,
        uint256 claimantPayout,
        uint256 respondentPayout
    );
    
    event DisputeCancelled(uint256 indexed disputeId);

    // ============ Modifiers ============
    modifier validDispute(uint256 _disputeId) {
        require(_disputeId > 0 && _disputeId <= disputeCounter, "Invalid dispute ID");
        _;
    }

    modifier onlyDisputeParty(uint256 _disputeId) {
        Dispute storage d = disputes[_disputeId];
        require(
            msg.sender == d.claimant || msg.sender == d.respondent,
            "Not a dispute party"
        );
        _;
    }

    // ============ Constructor ============
    constructor(address _treasury, address _genLayerOracle) {
        require(_treasury != address(0), "Invalid treasury");
        require(_genLayerOracle != address(0), "Invalid oracle");
        
        treasury = _treasury;
        genLayerOracle = _genLayerOracle;
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, _genLayerOracle);
    }

    // ============ Core Functions ============
    
    /**
     * @notice Create a new dispute
     * @param _respondent Address of the party being disputed against
     * @param _category Category of the dispute
     * @param _descriptionHash IPFS hash of dispute description
     */
    function createDispute(
        address _respondent,
        DisputeCategory _category,
        string calldata _descriptionHash
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        require(msg.value >= MIN_DISPUTE_AMOUNT, "Amount too low");
        require(msg.value <= MAX_DISPUTE_AMOUNT, "Amount too high");
        require(_respondent != address(0), "Invalid respondent");
        require(_respondent != msg.sender, "Cannot dispute yourself");
        require(bytes(_descriptionHash).length > 0, "Description required");
        
        disputeCounter++;
        uint256 disputeId = disputeCounter;
        
        disputes[disputeId] = Dispute({
            id: disputeId,
            claimant: msg.sender,
            respondent: _respondent,
            amount: msg.value,
            createdAt: block.timestamp,
            evidenceDeadline: block.timestamp + EVIDENCE_PERIOD,
            appealDeadline: 0,
            status: DisputeStatus.Created,
            resolution: Resolution.None,
            category: _category,
            descriptionHash: _descriptionHash,
            aiConfidenceScore: 0,
            appealed: false
        });
        
        userDisputes[msg.sender].push(disputeId);
        userDisputes[_respondent].push(disputeId);
        
        emit DisputeCreated(disputeId, msg.sender, _respondent, msg.value, _category);
        
        return disputeId;
    }

    /**
     * @notice Respondent accepts the dispute and stakes matching amount
     * @param _disputeId ID of the dispute
     */
    function acceptDispute(uint256 _disputeId) 
        external 
        payable 
        nonReentrant 
        validDispute(_disputeId) 
    {
        Dispute storage d = disputes[_disputeId];
        require(msg.sender == d.respondent, "Not respondent");
        require(d.status == DisputeStatus.Created, "Invalid status");
        require(msg.value == d.amount, "Must match dispute amount");
        
        d.status = DisputeStatus.EvidenceSubmission;
        d.evidenceDeadline = block.timestamp + EVIDENCE_PERIOD;
    }

    /**
     * @notice Submit evidence for a dispute
     * @param _disputeId ID of the dispute
     * @param _contentHash IPFS hash of evidence content
     * @param _evidenceType Type of evidence being submitted
     */
    function submitEvidence(
        uint256 _disputeId,
        string calldata _contentHash,
        EvidenceType _evidenceType
    ) external validDispute(_disputeId) onlyDisputeParty(_disputeId) {
        Dispute storage d = disputes[_disputeId];
        require(
            d.status == DisputeStatus.EvidenceSubmission ||
            d.status == DisputeStatus.Created,
            "Evidence period ended"
        );
        require(block.timestamp <= d.evidenceDeadline, "Deadline passed");
        require(bytes(_contentHash).length > 0, "Content hash required");
        
        disputeEvidence[_disputeId].push(Evidence({
            submitter: msg.sender,
            contentHash: _contentHash,
            timestamp: block.timestamp,
            evidenceType: _evidenceType
        }));
        
        emit EvidenceSubmitted(_disputeId, msg.sender, _contentHash, _evidenceType);
    }

    /**
     * @notice Request AI verdict from GenLayer
     * @param _disputeId ID of the dispute
     */
    function requestAIVerdict(uint256 _disputeId) 
        external 
        validDispute(_disputeId) 
        onlyDisputeParty(_disputeId) 
    {
        Dispute storage d = disputes[_disputeId];
        require(
            d.status == DisputeStatus.EvidenceSubmission,
            "Not in evidence phase"
        );
        require(
            block.timestamp >= d.evidenceDeadline || 
            disputeEvidence[_disputeId].length >= 2,
            "Evidence period not complete"
        );
        
        d.status = DisputeStatus.AwaitingAIVerdict;
        
        // Generate unique request ID for GenLayer
        bytes32 requestId = keccak256(
            abi.encodePacked(_disputeId, block.timestamp, blockhash(block.number - 1))
        );
        genLayerRequestToDispute[requestId] = _disputeId;
        
        emit AIVerdictRequested(_disputeId, requestId);
    }

    /**
     * @notice Callback function for GenLayer oracle to deliver verdict
     * @param _requestId GenLayer request ID
     * @param _resolution AI determined resolution
     * @param _confidenceScore Confidence score (0-100)
     * @param _reasoningHash IPFS hash of detailed reasoning
     */
    function deliverAIVerdict(
        bytes32 _requestId,
        Resolution _resolution,
        uint8 _confidenceScore,
        string calldata _reasoningHash
    ) external onlyRole(ORACLE_ROLE) {
        uint256 disputeId = genLayerRequestToDispute[_requestId];
        require(disputeId > 0, "Unknown request");
        
        Dispute storage d = disputes[disputeId];
        require(d.status == DisputeStatus.AwaitingAIVerdict, "Not awaiting verdict");
        require(_resolution != Resolution.None, "Invalid resolution");
        require(_confidenceScore <= 100, "Invalid confidence score");
        
        aiVerdicts[disputeId] = AIVerdict({
            decision: _resolution,
            confidenceScore: _confidenceScore,
            reasoningHash: _reasoningHash,
            timestamp: block.timestamp,
            genLayerRequestId: _requestId
        });
        
        d.resolution = _resolution;
        d.aiConfidenceScore = _confidenceScore;
        d.status = DisputeStatus.VerdictDelivered;
        d.appealDeadline = block.timestamp + APPEAL_PERIOD;
        
        emit AIVerdictReceived(disputeId, _resolution, _confidenceScore);
    }

    /**
     * @notice Appeal the AI verdict
     * @param _disputeId ID of the dispute
     */
    function appealVerdict(uint256 _disputeId) 
        external 
        payable 
        nonReentrant 
        validDispute(_disputeId)
        onlyDisputeParty(_disputeId)
    {
        Dispute storage d = disputes[_disputeId];
        require(d.status == DisputeStatus.VerdictDelivered, "Cannot appeal");
        require(block.timestamp <= d.appealDeadline, "Appeal period ended");
        require(!d.appealed, "Already appealed");
        
        uint256 appealStake = (d.amount * 2 * APPEAL_STAKE_BPS) / 10000;
        require(msg.value >= appealStake, "Insufficient appeal stake");
        
        d.appealed = true;
        d.status = DisputeStatus.AppealPeriod;
        appealStakes[_disputeId] = msg.value;
        
        emit DisputeAppealed(_disputeId, msg.sender, msg.value);
    }

    /**
     * @notice Finalize and execute the dispute resolution
     * @param _disputeId ID of the dispute
     */
    function finalizeDispute(uint256 _disputeId) 
        external 
        nonReentrant 
        validDispute(_disputeId) 
    {
        Dispute storage d = disputes[_disputeId];
        require(
            d.status == DisputeStatus.VerdictDelivered ||
            d.status == DisputeStatus.AppealPeriod,
            "Cannot finalize"
        );
        require(
            block.timestamp > d.appealDeadline,
            "Appeal period active"
        );
        
        d.status = DisputeStatus.Resolved;
        
        uint256 totalPool = d.amount * 2;
        uint256 platformFee = (totalPool * PLATFORM_FEE_BPS) / 10000;
        uint256 distributable = totalPool - platformFee;
        
        uint256 claimantPayout;
        uint256 respondentPayout;
        
        if (d.resolution == Resolution.FavorClaimant) {
            claimantPayout = distributable;
            respondentPayout = 0;
        } else if (d.resolution == Resolution.FavorRespondent) {
            claimantPayout = 0;
            respondentPayout = distributable;
        } else if (d.resolution == Resolution.Split) {
            claimantPayout = distributable / 2;
            respondentPayout = distributable - claimantPayout;
        } else {
            // Dismissed - return original stakes minus fee
            uint256 feePerParty = platformFee / 2;
            claimantPayout = d.amount - feePerParty;
            respondentPayout = d.amount - feePerParty;
        }
        
        // Transfer platform fee
        (bool feeSuccess, ) = treasury.call{value: platformFee}("");
        require(feeSuccess, "Fee transfer failed");
        
        // Distribute to parties
        if (claimantPayout > 0) {
            (bool claimantSuccess, ) = d.claimant.call{value: claimantPayout}("");
            require(claimantSuccess, "Claimant transfer failed");
        }
        
        if (respondentPayout > 0) {
            (bool respondentSuccess, ) = d.respondent.call{value: respondentPayout}("");
            require(respondentSuccess, "Respondent transfer failed");
        }
        
        // Return appeal stake if applicable
        if (d.appealed && appealStakes[_disputeId] > 0) {
            // Logic for appeal stake distribution would go here
            // For now, return to treasury for human review
            (bool appealSuccess, ) = treasury.call{value: appealStakes[_disputeId]}("");
            require(appealSuccess, "Appeal stake transfer failed");
        }
        
        emit DisputeResolved(_disputeId, d.resolution, claimantPayout, respondentPayout);
    }

    /**
     * @notice Cancel dispute (only if respondent hasn't accepted)
     * @param _disputeId ID of the dispute
     */
    function cancelDispute(uint256 _disputeId) 
        external 
        nonReentrant 
        validDispute(_disputeId) 
    {
        Dispute storage d = disputes[_disputeId];
        require(msg.sender == d.claimant, "Only claimant");
        require(d.status == DisputeStatus.Created, "Cannot cancel");
        
        d.status = DisputeStatus.Cancelled;
        
        // Return claimant's stake
        (bool success, ) = d.claimant.call{value: d.amount}("");
        require(success, "Refund failed");
        
        emit DisputeCancelled(_disputeId);
    }

    // ============ View Functions ============
    
    function getDispute(uint256 _disputeId) 
        external 
        view 
        returns (Dispute memory) 
    {
        return disputes[_disputeId];
    }
    
    function getDisputeEvidence(uint256 _disputeId) 
        external 
        view 
        returns (Evidence[] memory) 
    {
        return disputeEvidence[_disputeId];
    }
    
    function getAIVerdict(uint256 _disputeId) 
        external 
        view 
        returns (AIVerdict memory) 
    {
        return aiVerdicts[_disputeId];
    }
    
    function getUserDisputes(address _user) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return userDisputes[_user];
    }

    function getDisputeCount() external view returns (uint256) {
        return disputeCounter;
    }

    // ============ Admin Functions ============
    
    function setTreasury(address _treasury) external onlyRole(ADMIN_ROLE) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }
    
    function setGenLayerOracle(address _oracle) external onlyRole(ADMIN_ROLE) {
        require(_oracle != address(0), "Invalid oracle");
        _revokeRole(ORACLE_ROLE, genLayerOracle);
        genLayerOracle = _oracle;
        _grantRole(ORACLE_ROLE, _oracle);
    }
    
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }
    
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============ Emergency Functions ============
    
    function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
        (bool success, ) = treasury.call{value: address(this).balance}("");
        require(success, "Withdrawal failed");
    }

    receive() external payable {}
}
