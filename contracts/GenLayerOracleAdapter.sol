// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title GenLayerOracleAdapter
 * @notice Adapter contract for GenLayer AI consensus integration
 * @dev Handles communication between Base L2 and GenLayer network
 */
contract GenLayerOracleAdapter is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    struct OracleRequest {
        uint256 disputeId;
        address disputeContract;
        bytes32 requestId;
        uint256 timestamp;
        RequestStatus status;
        string prompt;
    }

    enum RequestStatus {
        Pending,
        Processing,
        Fulfilled,
        Failed,
        Expired
    }

    // ============ State Variables ============
    address public disputeResolutionContract;
    address public genLayerRelayer;
    
    uint256 public requestCounter;
    uint256 public constant REQUEST_TIMEOUT = 24 hours;
    uint256 public oracleFee = 0.001 ether;
    
    mapping(bytes32 => OracleRequest) public requests;
    mapping(uint256 => bytes32) public disputeToRequest;
    
    // AI prompt template for dispute analysis
    string public aiPromptTemplate;

    // ============ Events ============
    event OracleRequestCreated(
        bytes32 indexed requestId,
        uint256 indexed disputeId,
        string prompt
    );
    
    event OracleRequestFulfilled(
        bytes32 indexed requestId,
        uint256 indexed disputeId,
        uint8 resolution,
        uint8 confidenceScore
    );
    
    event OracleRequestFailed(
        bytes32 indexed requestId,
        uint256 indexed disputeId,
        string reason
    );
    
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    // ============ Modifiers ============
    modifier onlyDisputeContract() {
        require(
            msg.sender == disputeResolutionContract,
            "Only dispute contract"
        );
        _;
    }

    modifier onlyRelayer() {
        require(msg.sender == genLayerRelayer, "Only relayer");
        _;
    }

    // ============ Constructor ============
    constructor(address _genLayerRelayer) Ownable(msg.sender) {
        require(_genLayerRelayer != address(0), "Invalid relayer");
        genLayerRelayer = _genLayerRelayer;
        
        // Set default AI prompt template
        aiPromptTemplate = "Analyze the following dispute and provide a fair resolution. "
            "Consider all submitted evidence, the dispute category, and applicable standards. "
            "Return a resolution (1=FavorClaimant, 2=FavorRespondent, 3=Split, 4=Dismissed) "
            "and a confidence score (0-100).";
    }

    // ============ Core Functions ============
    
    /**
     * @notice Request AI analysis for a dispute
     * @param _disputeId ID of the dispute
     * @param _disputeData Encoded dispute data for AI analysis
     */
    function requestAIAnalysis(
        uint256 _disputeId,
        bytes calldata _disputeData
    ) external payable onlyDisputeContract nonReentrant returns (bytes32) {
        require(msg.value >= oracleFee, "Insufficient fee");
        require(disputeToRequest[_disputeId] == bytes32(0), "Request exists");
        
        requestCounter++;
        
        bytes32 requestId = keccak256(
            abi.encodePacked(
                _disputeId,
                requestCounter,
                block.timestamp,
                blockhash(block.number - 1)
            )
        );
        
        // Build the prompt with dispute data
        string memory prompt = _buildPrompt(_disputeData);
        
        requests[requestId] = OracleRequest({
            disputeId: _disputeId,
            disputeContract: disputeResolutionContract,
            requestId: requestId,
            timestamp: block.timestamp,
            status: RequestStatus.Pending,
            prompt: prompt
        });
        
        disputeToRequest[_disputeId] = requestId;
        
        emit OracleRequestCreated(requestId, _disputeId, prompt);
        
        return requestId;
    }

    /**
     * @notice Fulfill oracle request with AI verdict
     * @param _requestId Request ID
     * @param _resolution AI resolution (1-4)
     * @param _confidenceScore Confidence score (0-100)
     * @param _reasoningHash IPFS hash of detailed reasoning
     */
    function fulfillRequest(
        bytes32 _requestId,
        uint8 _resolution,
        uint8 _confidenceScore,
        string calldata _reasoningHash
    ) external onlyRelayer nonReentrant {
        OracleRequest storage request = requests[_requestId];
        require(request.disputeId > 0, "Request not found");
        require(request.status == RequestStatus.Pending, "Invalid status");
        require(_resolution >= 1 && _resolution <= 4, "Invalid resolution");
        require(_confidenceScore <= 100, "Invalid confidence");
        
        request.status = RequestStatus.Fulfilled;
        
        // Call back to dispute resolution contract
        IDisputeResolution(request.disputeContract).deliverAIVerdict(
            _requestId,
            IDisputeResolution.Resolution(_resolution),
            _confidenceScore,
            _reasoningHash
        );
        
        emit OracleRequestFulfilled(
            _requestId,
            request.disputeId,
            _resolution,
            _confidenceScore
        );
    }

    /**
     * @notice Mark request as failed
     * @param _requestId Request ID
     * @param _reason Failure reason
     */
    function failRequest(
        bytes32 _requestId,
        string calldata _reason
    ) external onlyRelayer {
        OracleRequest storage request = requests[_requestId];
        require(request.disputeId > 0, "Request not found");
        require(
            request.status == RequestStatus.Pending ||
            request.status == RequestStatus.Processing,
            "Invalid status"
        );
        
        request.status = RequestStatus.Failed;
        
        emit OracleRequestFailed(_requestId, request.disputeId, _reason);
    }

    /**
     * @notice Handle expired requests
     * @param _requestId Request ID
     */
    function handleExpiredRequest(bytes32 _requestId) external {
        OracleRequest storage request = requests[_requestId];
        require(request.disputeId > 0, "Request not found");
        require(request.status == RequestStatus.Pending, "Not pending");
        require(
            block.timestamp > request.timestamp + REQUEST_TIMEOUT,
            "Not expired"
        );
        
        request.status = RequestStatus.Expired;
        
        emit OracleRequestFailed(_requestId, request.disputeId, "Request expired");
    }

    // ============ Internal Functions ============
    
    /**
     * @dev Build AI prompt from dispute data
     */
    function _buildPrompt(bytes calldata _disputeData) 
        internal 
        view 
        returns (string memory) 
    {
        // Decode dispute data
        (
            uint256 disputeId,
            uint8 category,
            string memory descriptionHash,
            string[] memory evidenceHashes
        ) = abi.decode(_disputeData, (uint256, uint8, string, string[]));
        
        // Build comprehensive prompt
        string memory prompt = string(abi.encodePacked(
            aiPromptTemplate,
            "\n\nDispute ID: ", _uint2str(disputeId),
            "\nCategory: ", _getCategoryName(category),
            "\nDescription IPFS: ", descriptionHash,
            "\nEvidence count: ", _uint2str(evidenceHashes.length)
        ));
        
        return prompt;
    }

    /**
     * @dev Convert uint to string
     */
    function _uint2str(uint256 _i) internal pure returns (string memory) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 length;
        while (j != 0) {
            length++;
            j /= 10;
        }
        bytes memory bstr = new bytes(length);
        uint256 k = length;
        j = _i;
        while (j != 0) {
            bstr[--k] = bytes1(uint8(48 + j % 10));
            j /= 10;
        }
        return string(bstr);
    }

    /**
     * @dev Get category name from enum value
     */
    function _getCategoryName(uint8 _category) 
        internal 
        pure 
        returns (string memory) 
    {
        if (_category == 0) return "ContractBreach";
        if (_category == 1) return "ServiceQuality";
        if (_category == 2) return "PaymentDispute";
        if (_category == 3) return "IntellectualProperty";
        if (_category == 4) return "FraudClaim";
        return "Other";
    }

    // ============ View Functions ============
    
    function getRequest(bytes32 _requestId) 
        external 
        view 
        returns (OracleRequest memory) 
    {
        return requests[_requestId];
    }

    function getRequestByDispute(uint256 _disputeId) 
        external 
        view 
        returns (OracleRequest memory) 
    {
        bytes32 requestId = disputeToRequest[_disputeId];
        return requests[requestId];
    }

    function isRequestPending(bytes32 _requestId) 
        external 
        view 
        returns (bool) 
    {
        return requests[_requestId].status == RequestStatus.Pending;
    }

    // ============ Admin Functions ============
    
    function setDisputeResolutionContract(address _contract) 
        external 
        onlyOwner 
    {
        require(_contract != address(0), "Invalid address");
        disputeResolutionContract = _contract;
    }

    function setRelayer(address _relayer) external onlyOwner {
        require(_relayer != address(0), "Invalid relayer");
        address oldRelayer = genLayerRelayer;
        genLayerRelayer = _relayer;
        emit RelayerUpdated(oldRelayer, _relayer);
    }

    function setOracleFee(uint256 _fee) external onlyOwner {
        uint256 oldFee = oracleFee;
        oracleFee = _fee;
        emit FeeUpdated(oldFee, _fee);
    }

    function setPromptTemplate(string calldata _template) external onlyOwner {
        aiPromptTemplate = _template;
    }

    function withdrawFees() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        require(success, "Withdrawal failed");
    }

    receive() external payable {}
}

// ============ Interface ============
interface IDisputeResolution {
    enum Resolution {
        None,
        FavorClaimant,
        FavorRespondent,
        Split,
        Dismissed
    }

    function deliverAIVerdict(
        bytes32 _requestId,
        Resolution _resolution,
        uint8 _confidenceScore,
        string calldata _reasoningHash
    ) external;
}
