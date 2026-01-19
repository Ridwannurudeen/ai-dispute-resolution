// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EvidenceManager
 * @notice Manages evidence submission and verification for disputes
 * @dev Handles IPFS evidence references and metadata
 */
contract EvidenceManager is AccessControl, ReentrancyGuard {
    
    // ============ Roles ============
    bytes32 public constant DISPUTE_CONTRACT_ROLE = keccak256("DISPUTE_CONTRACT_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    // ============ Enums ============
    enum EvidenceType {
        Document,
        Image,
        Video,
        Audio,
        Contract,
        Communication,
        Transaction,
        Testimony,
        ExpertReport,
        Other
    }

    enum VerificationStatus {
        Unverified,
        Verified,
        Rejected,
        Disputed
    }

    // ============ Structs ============
    struct EvidenceItem {
        uint256 id;
        uint256 disputeId;
        address submitter;
        string ipfsHash;
        string metadataHash;
        EvidenceType evidenceType;
        uint256 timestamp;
        VerificationStatus status;
        uint256 fileSize;
        string mimeType;
        bool isConfidential;
    }

    struct EvidenceMetadata {
        string title;
        string description;
        string[] tags;
        uint256 relevanceScore; // 0-100, set by AI
    }

    // ============ State Variables ============
    uint256 public evidenceCounter;
    uint256 public constant MAX_EVIDENCE_PER_DISPUTE = 50;
    uint256 public constant MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    
    mapping(uint256 => EvidenceItem) public evidenceItems;
    mapping(uint256 => uint256[]) public disputeEvidence;
    mapping(uint256 => EvidenceMetadata) public evidenceMetadata;
    mapping(address => uint256[]) public submitterEvidence;
    mapping(string => bool) public usedHashes;

    // Allowed MIME types
    mapping(string => bool) public allowedMimeTypes;

    // ============ Events ============
    event EvidenceSubmitted(
        uint256 indexed evidenceId,
        uint256 indexed disputeId,
        address indexed submitter,
        string ipfsHash,
        EvidenceType evidenceType
    );
    
    event EvidenceVerified(
        uint256 indexed evidenceId,
        VerificationStatus status,
        address verifier
    );
    
    event EvidenceMetadataUpdated(
        uint256 indexed evidenceId,
        string title,
        uint256 relevanceScore
    );
    
    event EvidenceRemoved(
        uint256 indexed evidenceId,
        uint256 indexed disputeId,
        string reason
    );

    // ============ Constructor ============
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        
        // Initialize allowed MIME types
        allowedMimeTypes["application/pdf"] = true;
        allowedMimeTypes["image/jpeg"] = true;
        allowedMimeTypes["image/png"] = true;
        allowedMimeTypes["image/gif"] = true;
        allowedMimeTypes["video/mp4"] = true;
        allowedMimeTypes["audio/mpeg"] = true;
        allowedMimeTypes["text/plain"] = true;
        allowedMimeTypes["application/json"] = true;
        allowedMimeTypes["application/msword"] = true;
        allowedMimeTypes["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] = true;
    }

    // ============ Core Functions ============
    
    /**
     * @notice Submit evidence for a dispute
     * @param _disputeId ID of the dispute
     * @param _ipfsHash IPFS hash of evidence content
     * @param _metadataHash IPFS hash of evidence metadata
     * @param _evidenceType Type of evidence
     * @param _fileSize Size of the file in bytes
     * @param _mimeType MIME type of the file
     * @param _isConfidential Whether evidence should be treated as confidential
     */
    function submitEvidence(
        uint256 _disputeId,
        string calldata _ipfsHash,
        string calldata _metadataHash,
        EvidenceType _evidenceType,
        uint256 _fileSize,
        string calldata _mimeType,
        bool _isConfidential
    ) external nonReentrant returns (uint256) {
        require(_disputeId > 0, "Invalid dispute ID");
        require(bytes(_ipfsHash).length == 46, "Invalid IPFS hash"); // CIDv0 length
        require(!usedHashes[_ipfsHash], "Evidence already submitted");
        require(_fileSize <= MAX_FILE_SIZE, "File too large");
        require(
            disputeEvidence[_disputeId].length < MAX_EVIDENCE_PER_DISPUTE,
            "Max evidence reached"
        );
        require(
            allowedMimeTypes[_mimeType] || bytes(_mimeType).length == 0,
            "Invalid MIME type"
        );
        
        evidenceCounter++;
        uint256 evidenceId = evidenceCounter;
        
        evidenceItems[evidenceId] = EvidenceItem({
            id: evidenceId,
            disputeId: _disputeId,
            submitter: msg.sender,
            ipfsHash: _ipfsHash,
            metadataHash: _metadataHash,
            evidenceType: _evidenceType,
            timestamp: block.timestamp,
            status: VerificationStatus.Unverified,
            fileSize: _fileSize,
            mimeType: _mimeType,
            isConfidential: _isConfidential
        });
        
        disputeEvidence[_disputeId].push(evidenceId);
        submitterEvidence[msg.sender].push(evidenceId);
        usedHashes[_ipfsHash] = true;
        
        emit EvidenceSubmitted(
            evidenceId,
            _disputeId,
            msg.sender,
            _ipfsHash,
            _evidenceType
        );
        
        return evidenceId;
    }

    /**
     * @notice Batch submit multiple evidence items
     * @param _disputeId ID of the dispute
     * @param _ipfsHashes Array of IPFS hashes
     * @param _metadataHashes Array of metadata hashes
     * @param _evidenceTypes Array of evidence types
     */
    function batchSubmitEvidence(
        uint256 _disputeId,
        string[] calldata _ipfsHashes,
        string[] calldata _metadataHashes,
        EvidenceType[] calldata _evidenceTypes
    ) external nonReentrant returns (uint256[] memory) {
        require(
            _ipfsHashes.length == _metadataHashes.length &&
            _ipfsHashes.length == _evidenceTypes.length,
            "Array length mismatch"
        );
        require(_ipfsHashes.length <= 10, "Max 10 items per batch");
        require(
            disputeEvidence[_disputeId].length + _ipfsHashes.length <= MAX_EVIDENCE_PER_DISPUTE,
            "Would exceed max evidence"
        );
        
        uint256[] memory evidenceIds = new uint256[](_ipfsHashes.length);
        
        for (uint256 i = 0; i < _ipfsHashes.length; i++) {
            require(!usedHashes[_ipfsHashes[i]], "Duplicate hash");
            
            evidenceCounter++;
            uint256 evidenceId = evidenceCounter;
            
            evidenceItems[evidenceId] = EvidenceItem({
                id: evidenceId,
                disputeId: _disputeId,
                submitter: msg.sender,
                ipfsHash: _ipfsHashes[i],
                metadataHash: _metadataHashes[i],
                evidenceType: _evidenceTypes[i],
                timestamp: block.timestamp,
                status: VerificationStatus.Unverified,
                fileSize: 0,
                mimeType: "",
                isConfidential: false
            });
            
            disputeEvidence[_disputeId].push(evidenceId);
            submitterEvidence[msg.sender].push(evidenceId);
            usedHashes[_ipfsHashes[i]] = true;
            evidenceIds[i] = evidenceId;
            
            emit EvidenceSubmitted(
                evidenceId,
                _disputeId,
                msg.sender,
                _ipfsHashes[i],
                _evidenceTypes[i]
            );
        }
        
        return evidenceIds;
    }

    /**
     * @notice Verify evidence (by authorized verifier)
     * @param _evidenceId ID of the evidence
     * @param _status New verification status
     */
    function verifyEvidence(
        uint256 _evidenceId,
        VerificationStatus _status
    ) external onlyRole(VERIFIER_ROLE) {
        require(_evidenceId > 0 && _evidenceId <= evidenceCounter, "Invalid ID");
        require(_status != VerificationStatus.Unverified, "Invalid status");
        
        EvidenceItem storage item = evidenceItems[_evidenceId];
        require(item.status == VerificationStatus.Unverified, "Already verified");
        
        item.status = _status;
        
        emit EvidenceVerified(_evidenceId, _status, msg.sender);
    }

    /**
     * @notice Batch verify multiple evidence items
     * @param _evidenceIds Array of evidence IDs
     * @param _statuses Array of verification statuses
     */
    function batchVerifyEvidence(
        uint256[] calldata _evidenceIds,
        VerificationStatus[] calldata _statuses
    ) external onlyRole(VERIFIER_ROLE) {
        require(_evidenceIds.length == _statuses.length, "Array mismatch");
        require(_evidenceIds.length <= 50, "Max 50 per batch");
        
        for (uint256 i = 0; i < _evidenceIds.length; i++) {
            EvidenceItem storage item = evidenceItems[_evidenceIds[i]];
            if (item.status == VerificationStatus.Unverified) {
                item.status = _statuses[i];
                emit EvidenceVerified(_evidenceIds[i], _statuses[i], msg.sender);
            }
        }
    }

    /**
     * @notice Update evidence metadata (by AI or verifier)
     * @param _evidenceId ID of the evidence
     * @param _title Evidence title
     * @param _description Evidence description
     * @param _tags Evidence tags
     * @param _relevanceScore AI-determined relevance score
     */
    function updateMetadata(
        uint256 _evidenceId,
        string calldata _title,
        string calldata _description,
        string[] calldata _tags,
        uint256 _relevanceScore
    ) external onlyRole(VERIFIER_ROLE) {
        require(_evidenceId > 0 && _evidenceId <= evidenceCounter, "Invalid ID");
        require(_relevanceScore <= 100, "Invalid score");
        
        evidenceMetadata[_evidenceId] = EvidenceMetadata({
            title: _title,
            description: _description,
            tags: _tags,
            relevanceScore: _relevanceScore
        });
        
        emit EvidenceMetadataUpdated(_evidenceId, _title, _relevanceScore);
    }

    // ============ View Functions ============
    
    function getEvidence(uint256 _evidenceId) 
        external 
        view 
        returns (EvidenceItem memory) 
    {
        return evidenceItems[_evidenceId];
    }

    function getDisputeEvidence(uint256 _disputeId) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return disputeEvidence[_disputeId];
    }

    function getDisputeEvidenceItems(uint256 _disputeId) 
        external 
        view 
        returns (EvidenceItem[] memory) 
    {
        uint256[] memory ids = disputeEvidence[_disputeId];
        EvidenceItem[] memory items = new EvidenceItem[](ids.length);
        
        for (uint256 i = 0; i < ids.length; i++) {
            items[i] = evidenceItems[ids[i]];
        }
        
        return items;
    }

    function getSubmitterEvidence(address _submitter) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return submitterEvidence[_submitter];
    }

    function getEvidenceMetadata(uint256 _evidenceId) 
        external 
        view 
        returns (EvidenceMetadata memory) 
    {
        return evidenceMetadata[_evidenceId];
    }

    function getEvidenceCount() external view returns (uint256) {
        return evidenceCounter;
    }

    function getDisputeEvidenceCount(uint256 _disputeId) 
        external 
        view 
        returns (uint256) 
    {
        return disputeEvidence[_disputeId].length;
    }

    function isHashUsed(string calldata _hash) external view returns (bool) {
        return usedHashes[_hash];
    }

    // ============ Admin Functions ============
    
    function setDisputeContract(address _contract) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _grantRole(DISPUTE_CONTRACT_ROLE, _contract);
    }

    function addVerifier(address _verifier) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _grantRole(VERIFIER_ROLE, _verifier);
    }

    function removeVerifier(address _verifier) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        _revokeRole(VERIFIER_ROLE, _verifier);
    }

    function setAllowedMimeType(string calldata _mimeType, bool _allowed) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        allowedMimeTypes[_mimeType] = _allowed;
    }
}
