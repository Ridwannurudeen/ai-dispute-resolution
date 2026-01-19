// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title MultiTokenDisputeResolution
 * @notice Dispute resolution supporting multiple ERC20 tokens and ETH
 * @dev Extends base functionality with multi-token support
 */
contract MultiTokenDisputeResolution is ReentrancyGuard, AccessControl, Pausable {
    using SafeERC20 for IERC20;

    // ============ Roles ============
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant TOKEN_MANAGER_ROLE = keccak256("TOKEN_MANAGER_ROLE");

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
    struct TokenConfig {
        bool isSupported;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 platformFeeBps;    // Can have different fees per token
        address priceFeed;         // Chainlink price feed for USD conversion
        uint8 decimals;
    }

    struct Dispute {
        uint256 id;
        address claimant;
        address respondent;
        address token;             // address(0) for ETH
        uint256 amount;
        uint256 createdAt;
        uint256 evidenceDeadline;
        uint256 appealDeadline;
        DisputeStatus status;
        Resolution resolution;
        DisputeCategory category;
        string descriptionHash;
        uint8 aiConfidenceScore;
        bool appealed;
    }

    struct Evidence {
        address submitter;
        string contentHash;
        uint256 timestamp;
        uint8 evidenceType;
    }

    struct AIVerdict {
        Resolution decision;
        uint8 confidenceScore;
        string reasoningHash;
        uint256 timestamp;
        bytes32 genLayerRequestId;
    }

    // ============ State Variables ============
    uint256 public disputeCounter;
    uint256 public constant EVIDENCE_PERIOD = 3 days;
    uint256 public constant APPEAL_PERIOD = 2 days;
    uint256 public constant DEFAULT_FEE_BPS = 250;      // 2.5%
    uint256 public constant APPEAL_STAKE_BPS = 1000;    // 10%
    
    // ETH config
    uint256 public minEthAmount = 0.001 ether;
    uint256 public maxEthAmount = 1000 ether;
    
    address public treasury;
    address public genLayerOracle;

    // Token configurations
    mapping(address => TokenConfig) public tokenConfigs;
    address[] public supportedTokens;

    // Dispute data
    mapping(uint256 => Dispute) public disputes;
    mapping(uint256 => Evidence[]) public disputeEvidence;
    mapping(uint256 => AIVerdict) public aiVerdicts;
    mapping(uint256 => uint256) public appealStakes;
    mapping(address => uint256[]) public userDisputes;
    mapping(bytes32 => uint256) public genLayerRequestToDispute;

    // Token balances tracking
    mapping(uint256 => mapping(address => uint256)) public disputeTokenBalances;

    // ============ Events ============
    event TokenAdded(address indexed token, uint256 minAmount, uint256 maxAmount, uint256 feeBps);
    event TokenRemoved(address indexed token);
    event TokenConfigUpdated(address indexed token, uint256 minAmount, uint256 maxAmount, uint256 feeBps);
    
    event DisputeCreated(
        uint256 indexed disputeId,
        address indexed claimant,
        address indexed respondent,
        address token,
        uint256 amount,
        DisputeCategory category
    );
    
    event EvidenceSubmitted(
        uint256 indexed disputeId,
        address indexed submitter,
        string contentHash,
        uint8 evidenceType
    );
    
    event AIVerdictRequested(uint256 indexed disputeId, bytes32 indexed genLayerRequestId);
    event AIVerdictReceived(uint256 indexed disputeId, Resolution resolution, uint8 confidenceScore);
    event DisputeAppealed(uint256 indexed disputeId, address indexed appealer, uint256 stakeAmount);
    event DisputeResolved(uint256 indexed disputeId, Resolution resolution, uint256 claimantPayout, uint256 respondentPayout);
    event DisputeCancelled(uint256 indexed disputeId);

    // ============ Modifiers ============
    modifier validDispute(uint256 _disputeId) {
        require(_disputeId > 0 && _disputeId <= disputeCounter, "Invalid dispute ID");
        _;
    }

    modifier onlyDisputeParty(uint256 _disputeId) {
        Dispute storage d = disputes[_disputeId];
        require(msg.sender == d.claimant || msg.sender == d.respondent, "Not a dispute party");
        _;
    }

    modifier supportedToken(address _token) {
        require(_token == address(0) || tokenConfigs[_token].isSupported, "Token not supported");
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
        _grantRole(TOKEN_MANAGER_ROLE, msg.sender);
        _grantRole(ORACLE_ROLE, _genLayerOracle);
    }

    // ============ Token Management ============

    /**
     * @notice Add a supported ERC20 token
     * @param _token Token address
     * @param _minAmount Minimum dispute amount
     * @param _maxAmount Maximum dispute amount
     * @param _feeBps Platform fee in basis points
     * @param _priceFeed Chainlink price feed address (optional)
     */
    function addSupportedToken(
        address _token,
        uint256 _minAmount,
        uint256 _maxAmount,
        uint256 _feeBps,
        address _priceFeed
    ) external onlyRole(TOKEN_MANAGER_ROLE) {
        require(_token != address(0), "Invalid token");
        require(!tokenConfigs[_token].isSupported, "Already supported");
        require(_minAmount < _maxAmount, "Invalid amounts");
        require(_feeBps <= 1000, "Fee too high"); // Max 10%

        uint8 decimals = 18;
        try IERC20Metadata(_token).decimals() returns (uint8 d) {
            decimals = d;
        } catch {}

        tokenConfigs[_token] = TokenConfig({
            isSupported: true,
            minAmount: _minAmount,
            maxAmount: _maxAmount,
            platformFeeBps: _feeBps,
            priceFeed: _priceFeed,
            decimals: decimals
        });

        supportedTokens.push(_token);
        emit TokenAdded(_token, _minAmount, _maxAmount, _feeBps);
    }

    /**
     * @notice Remove a supported token
     */
    function removeSupportedToken(address _token) external onlyRole(TOKEN_MANAGER_ROLE) {
        require(tokenConfigs[_token].isSupported, "Not supported");
        tokenConfigs[_token].isSupported = false;
        emit TokenRemoved(_token);
    }

    /**
     * @notice Update token configuration
     */
    function updateTokenConfig(
        address _token,
        uint256 _minAmount,
        uint256 _maxAmount,
        uint256 _feeBps,
        address _priceFeed
    ) external onlyRole(TOKEN_MANAGER_ROLE) {
        require(tokenConfigs[_token].isSupported, "Not supported");
        require(_minAmount < _maxAmount, "Invalid amounts");
        require(_feeBps <= 1000, "Fee too high");

        tokenConfigs[_token].minAmount = _minAmount;
        tokenConfigs[_token].maxAmount = _maxAmount;
        tokenConfigs[_token].platformFeeBps = _feeBps;
        tokenConfigs[_token].priceFeed = _priceFeed;

        emit TokenConfigUpdated(_token, _minAmount, _maxAmount, _feeBps);
    }

    // ============ Core Functions ============

    /**
     * @notice Create a dispute with ETH
     */
    function createDisputeETH(
        address _respondent,
        DisputeCategory _category,
        string calldata _descriptionHash
    ) external payable nonReentrant whenNotPaused returns (uint256) {
        require(msg.value >= minEthAmount, "Amount too low");
        require(msg.value <= maxEthAmount, "Amount too high");
        
        return _createDispute(_respondent, address(0), msg.value, _category, _descriptionHash);
    }

    /**
     * @notice Create a dispute with ERC20 token
     */
    function createDisputeToken(
        address _respondent,
        address _token,
        uint256 _amount,
        DisputeCategory _category,
        string calldata _descriptionHash
    ) external nonReentrant whenNotPaused supportedToken(_token) returns (uint256) {
        TokenConfig memory config = tokenConfigs[_token];
        require(_amount >= config.minAmount, "Amount too low");
        require(_amount <= config.maxAmount, "Amount too high");

        // Transfer tokens from claimant
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        
        return _createDispute(_respondent, _token, _amount, _category, _descriptionHash);
    }

    function _createDispute(
        address _respondent,
        address _token,
        uint256 _amount,
        DisputeCategory _category,
        string calldata _descriptionHash
    ) internal returns (uint256) {
        require(_respondent != address(0), "Invalid respondent");
        require(_respondent != msg.sender, "Cannot dispute yourself");
        require(bytes(_descriptionHash).length > 0, "Description required");

        disputeCounter++;
        uint256 disputeId = disputeCounter;

        disputes[disputeId] = Dispute({
            id: disputeId,
            claimant: msg.sender,
            respondent: _respondent,
            token: _token,
            amount: _amount,
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

        disputeTokenBalances[disputeId][_token] = _amount;
        userDisputes[msg.sender].push(disputeId);
        userDisputes[_respondent].push(disputeId);

        emit DisputeCreated(disputeId, msg.sender, _respondent, _token, _amount, _category);
        return disputeId;
    }

    /**
     * @notice Accept dispute with ETH
     */
    function acceptDisputeETH(uint256 _disputeId) 
        external 
        payable 
        nonReentrant 
        validDispute(_disputeId) 
    {
        Dispute storage d = disputes[_disputeId];
        require(msg.sender == d.respondent, "Not respondent");
        require(d.status == DisputeStatus.Created, "Invalid status");
        require(d.token == address(0), "Not ETH dispute");
        require(msg.value == d.amount, "Must match amount");

        d.status = DisputeStatus.EvidenceSubmission;
        d.evidenceDeadline = block.timestamp + EVIDENCE_PERIOD;
        disputeTokenBalances[_disputeId][address(0)] += msg.value;
    }

    /**
     * @notice Accept dispute with ERC20 token
     */
    function acceptDisputeToken(uint256 _disputeId) 
        external 
        nonReentrant 
        validDispute(_disputeId) 
    {
        Dispute storage d = disputes[_disputeId];
        require(msg.sender == d.respondent, "Not respondent");
        require(d.status == DisputeStatus.Created, "Invalid status");
        require(d.token != address(0), "Not token dispute");

        IERC20(d.token).safeTransferFrom(msg.sender, address(this), d.amount);

        d.status = DisputeStatus.EvidenceSubmission;
        d.evidenceDeadline = block.timestamp + EVIDENCE_PERIOD;
        disputeTokenBalances[_disputeId][d.token] += d.amount;
    }

    /**
     * @notice Submit evidence
     */
    function submitEvidence(
        uint256 _disputeId,
        string calldata _contentHash,
        uint8 _evidenceType
    ) external validDispute(_disputeId) onlyDisputeParty(_disputeId) {
        Dispute storage d = disputes[_disputeId];
        require(
            d.status == DisputeStatus.EvidenceSubmission || d.status == DisputeStatus.Created,
            "Evidence period ended"
        );
        require(block.timestamp <= d.evidenceDeadline, "Deadline passed");

        disputeEvidence[_disputeId].push(Evidence({
            submitter: msg.sender,
            contentHash: _contentHash,
            timestamp: block.timestamp,
            evidenceType: _evidenceType
        }));

        emit EvidenceSubmitted(_disputeId, msg.sender, _contentHash, _evidenceType);
    }

    /**
     * @notice Request AI verdict
     */
    function requestAIVerdict(uint256 _disputeId) 
        external 
        validDispute(_disputeId) 
        onlyDisputeParty(_disputeId) 
    {
        Dispute storage d = disputes[_disputeId];
        require(d.status == DisputeStatus.EvidenceSubmission, "Not in evidence phase");
        require(
            block.timestamp >= d.evidenceDeadline || disputeEvidence[_disputeId].length >= 2,
            "Evidence period not complete"
        );

        d.status = DisputeStatus.AwaitingAIVerdict;

        bytes32 requestId = keccak256(
            abi.encodePacked(_disputeId, block.timestamp, blockhash(block.number - 1))
        );
        genLayerRequestToDispute[requestId] = _disputeId;

        emit AIVerdictRequested(_disputeId, requestId);
    }

    /**
     * @notice Deliver AI verdict (oracle only)
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
     * @notice Appeal verdict
     */
    function appealVerdictETH(uint256 _disputeId) 
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
        require(d.token == address(0), "Use appealVerdictToken for token disputes");

        uint256 appealStake = (d.amount * 2 * APPEAL_STAKE_BPS) / 10000;
        require(msg.value >= appealStake, "Insufficient stake");

        d.appealed = true;
        d.status = DisputeStatus.AppealPeriod;
        appealStakes[_disputeId] = msg.value;

        emit DisputeAppealed(_disputeId, msg.sender, msg.value);
    }

    /**
     * @notice Appeal verdict with token
     */
    function appealVerdictToken(uint256 _disputeId) 
        external 
        nonReentrant 
        validDispute(_disputeId)
        onlyDisputeParty(_disputeId)
    {
        Dispute storage d = disputes[_disputeId];
        require(d.status == DisputeStatus.VerdictDelivered, "Cannot appeal");
        require(block.timestamp <= d.appealDeadline, "Appeal period ended");
        require(!d.appealed, "Already appealed");
        require(d.token != address(0), "Use appealVerdictETH for ETH disputes");

        uint256 appealStake = (d.amount * 2 * APPEAL_STAKE_BPS) / 10000;
        IERC20(d.token).safeTransferFrom(msg.sender, address(this), appealStake);

        d.appealed = true;
        d.status = DisputeStatus.AppealPeriod;
        appealStakes[_disputeId] = appealStake;

        emit DisputeAppealed(_disputeId, msg.sender, appealStake);
    }

    /**
     * @notice Finalize dispute and distribute funds
     */
    function finalizeDispute(uint256 _disputeId) 
        external 
        nonReentrant 
        validDispute(_disputeId) 
    {
        Dispute storage d = disputes[_disputeId];
        require(
            d.status == DisputeStatus.VerdictDelivered || d.status == DisputeStatus.AppealPeriod,
            "Cannot finalize"
        );
        require(block.timestamp > d.appealDeadline, "Appeal period active");

        d.status = DisputeStatus.Resolved;

        uint256 totalPool = d.amount * 2;
        uint256 feeBps = d.token == address(0) ? DEFAULT_FEE_BPS : tokenConfigs[d.token].platformFeeBps;
        uint256 platformFee = (totalPool * feeBps) / 10000;
        uint256 distributable = totalPool - platformFee;

        uint256 claimantPayout;
        uint256 respondentPayout;

        if (d.resolution == Resolution.FavorClaimant) {
            claimantPayout = distributable;
        } else if (d.resolution == Resolution.FavorRespondent) {
            respondentPayout = distributable;
        } else if (d.resolution == Resolution.Split) {
            claimantPayout = distributable / 2;
            respondentPayout = distributable - claimantPayout;
        } else {
            uint256 feePerParty = platformFee / 2;
            claimantPayout = d.amount - feePerParty;
            respondentPayout = d.amount - feePerParty;
        }

        // Transfer funds
        if (d.token == address(0)) {
            _transferETH(treasury, platformFee);
            if (claimantPayout > 0) _transferETH(d.claimant, claimantPayout);
            if (respondentPayout > 0) _transferETH(d.respondent, respondentPayout);
            if (d.appealed && appealStakes[_disputeId] > 0) {
                _transferETH(treasury, appealStakes[_disputeId]);
            }
        } else {
            IERC20(d.token).safeTransfer(treasury, platformFee);
            if (claimantPayout > 0) IERC20(d.token).safeTransfer(d.claimant, claimantPayout);
            if (respondentPayout > 0) IERC20(d.token).safeTransfer(d.respondent, respondentPayout);
            if (d.appealed && appealStakes[_disputeId] > 0) {
                IERC20(d.token).safeTransfer(treasury, appealStakes[_disputeId]);
            }
        }

        emit DisputeResolved(_disputeId, d.resolution, claimantPayout, respondentPayout);
    }

    /**
     * @notice Cancel dispute (claimant only, before acceptance)
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

        if (d.token == address(0)) {
            _transferETH(d.claimant, d.amount);
        } else {
            IERC20(d.token).safeTransfer(d.claimant, d.amount);
        }

        emit DisputeCancelled(_disputeId);
    }

    function _transferETH(address to, uint256 amount) internal {
        (bool success, ) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
    }

    // ============ View Functions ============

    function getDispute(uint256 _disputeId) external view returns (Dispute memory) {
        return disputes[_disputeId];
    }

    function getDisputeEvidence(uint256 _disputeId) external view returns (Evidence[] memory) {
        return disputeEvidence[_disputeId];
    }

    function getAIVerdict(uint256 _disputeId) external view returns (AIVerdict memory) {
        return aiVerdicts[_disputeId];
    }

    function getUserDisputes(address _user) external view returns (uint256[] memory) {
        return userDisputes[_user];
    }

    function getSupportedTokens() external view returns (address[] memory) {
        return supportedTokens;
    }

    function getTokenConfig(address _token) external view returns (TokenConfig memory) {
        return tokenConfigs[_token];
    }

    function isTokenSupported(address _token) external view returns (bool) {
        return _token == address(0) || tokenConfigs[_token].isSupported;
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

    function setEthLimits(uint256 _min, uint256 _max) external onlyRole(ADMIN_ROLE) {
        require(_min < _max, "Invalid limits");
        minEthAmount = _min;
        maxEthAmount = _max;
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function emergencyWithdraw(address _token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_token == address(0)) {
            _transferETH(treasury, address(this).balance);
        } else {
            uint256 balance = IERC20(_token).balanceOf(address(this));
            IERC20(_token).safeTransfer(treasury, balance);
        }
    }

    receive() external payable {}
}

interface IERC20Metadata {
    function decimals() external view returns (uint8);
}
