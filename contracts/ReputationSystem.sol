// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ReputationSystem
 * @notice Manages user reputation scores based on dispute outcomes
 * @dev Reputation affects dispute weighting and platform privileges
 */
contract ReputationSystem is AccessControl, ReentrancyGuard {
    
    // ============ Roles ============
    bytes32 public constant DISPUTE_CONTRACT_ROLE = keccak256("DISPUTE_CONTRACT_ROLE");
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");

    // ============ Structs ============
    struct UserReputation {
        uint256 score;              // Current reputation score (basis points, 10000 = 100%)
        uint256 totalDisputes;      // Total disputes participated in
        uint256 disputesWon;        // Disputes won
        uint256 disputesLost;       // Disputes lost
        uint256 disputesSplit;      // Disputes ended in split
        uint256 evidenceQuality;    // Average evidence quality score
        uint256 responseTime;       // Average response time in seconds
        uint256 appealSuccessRate;  // Successful appeals (basis points)
        uint256 lastActivityAt;     // Last activity timestamp
        uint256 createdAt;          // First activity timestamp
        bool isBanned;              // Ban status
        string banReason;           // Reason for ban
    }

    struct ReputationTier {
        string name;
        uint256 minScore;
        uint256 maxFeeDiscount;     // Fee discount in basis points
        uint256 maxDisputeAmount;   // Maximum dispute amount allowed
        bool canAppeal;             // Can appeal verdicts
        bool prioritySupport;       // Gets priority in queue
    }

    // ============ State Variables ============
    mapping(address => UserReputation) public userReputations;
    mapping(uint256 => ReputationTier) public reputationTiers;
    uint256 public tierCount;

    // Reputation change weights
    uint256 public constant WIN_BONUS = 500;           // +5%
    uint256 public constant LOSS_PENALTY = 300;        // -3%
    uint256 public constant SPLIT_BONUS = 100;         // +1%
    uint256 public constant APPEAL_SUCCESS_BONUS = 800; // +8%
    uint256 public constant APPEAL_FAIL_PENALTY = 400; // -4%
    uint256 public constant HIGH_CONFIDENCE_BONUS = 200; // +2% for high AI confidence
    uint256 public constant EVIDENCE_QUALITY_BONUS = 150; // +1.5% per quality point
    uint256 public constant FAST_RESPONSE_BONUS = 100;  // +1% for fast response
    
    uint256 public constant BASE_REPUTATION = 5000;    // 50% starting reputation
    uint256 public constant MIN_REPUTATION = 100;      // 1% minimum
    uint256 public constant MAX_REPUTATION = 10000;    // 100% maximum
    
    uint256 public constant BAN_THRESHOLD = 500;       // Auto-ban below 5%
    uint256 public constant FRAUD_PENALTY = 2000;      // -20% for fraud

    // ============ Events ============
    event ReputationUpdated(
        address indexed user,
        uint256 oldScore,
        uint256 newScore,
        string reason
    );
    
    event UserBanned(
        address indexed user,
        string reason,
        address bannedBy
    );
    
    event UserUnbanned(
        address indexed user,
        address unbannedBy
    );
    
    event TierCreated(
        uint256 indexed tierId,
        string name,
        uint256 minScore
    );

    event EvidenceQualityRated(
        address indexed user,
        uint256 disputeId,
        uint256 qualityScore
    );

    // ============ Constructor ============
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MODERATOR_ROLE, msg.sender);
        
        // Initialize default tiers
        _createDefaultTiers();
    }

    // ============ Internal Functions ============
    
    function _createDefaultTiers() internal {
        // Tier 0: New User
        reputationTiers[0] = ReputationTier({
            name: "New User",
            minScore: 0,
            maxFeeDiscount: 0,
            maxDisputeAmount: 1 ether,
            canAppeal: false,
            prioritySupport: false
        });

        // Tier 1: Bronze
        reputationTiers[1] = ReputationTier({
            name: "Bronze",
            minScore: 3000,
            maxFeeDiscount: 500,  // 5% discount
            maxDisputeAmount: 10 ether,
            canAppeal: true,
            prioritySupport: false
        });

        // Tier 2: Silver
        reputationTiers[2] = ReputationTier({
            name: "Silver",
            minScore: 5000,
            maxFeeDiscount: 1000, // 10% discount
            maxDisputeAmount: 50 ether,
            canAppeal: true,
            prioritySupport: false
        });

        // Tier 3: Gold
        reputationTiers[3] = ReputationTier({
            name: "Gold",
            minScore: 7000,
            maxFeeDiscount: 1500, // 15% discount
            maxDisputeAmount: 200 ether,
            canAppeal: true,
            prioritySupport: true
        });

        // Tier 4: Platinum
        reputationTiers[4] = ReputationTier({
            name: "Platinum",
            minScore: 9000,
            maxFeeDiscount: 2500, // 25% discount
            maxDisputeAmount: 1000 ether,
            canAppeal: true,
            prioritySupport: true
        });

        tierCount = 5;
    }

    function _getOrCreateReputation(address user) internal returns (UserReputation storage) {
        UserReputation storage rep = userReputations[user];
        if (rep.createdAt == 0) {
            rep.score = BASE_REPUTATION;
            rep.createdAt = block.timestamp;
            rep.lastActivityAt = block.timestamp;
        }
        return rep;
    }

    function _adjustScore(uint256 currentScore, int256 change) internal pure returns (uint256) {
        if (change >= 0) {
            uint256 newScore = currentScore + uint256(change);
            return newScore > MAX_REPUTATION ? MAX_REPUTATION : newScore;
        } else {
            uint256 decrease = uint256(-change);
            if (decrease >= currentScore) {
                return MIN_REPUTATION;
            }
            return currentScore - decrease;
        }
    }

    // ============ Core Functions ============

    /**
     * @notice Record a dispute outcome and update reputation
     * @param user Address of the user
     * @param won Whether the user won
     * @param split Whether it was a split decision
     * @param aiConfidence AI confidence score (0-100)
     */
    function recordDisputeOutcome(
        address user,
        bool won,
        bool split,
        uint8 aiConfidence
    ) external onlyRole(DISPUTE_CONTRACT_ROLE) {
        UserReputation storage rep = _getOrCreateReputation(user);
        require(!rep.isBanned, "User is banned");

        uint256 oldScore = rep.score;
        int256 scoreChange = 0;

        rep.totalDisputes++;
        rep.lastActivityAt = block.timestamp;

        if (split) {
            rep.disputesSplit++;
            scoreChange = int256(SPLIT_BONUS);
        } else if (won) {
            rep.disputesWon++;
            scoreChange = int256(WIN_BONUS);
            
            // Bonus for high AI confidence agreement
            if (aiConfidence >= 85) {
                scoreChange += int256(HIGH_CONFIDENCE_BONUS);
            }
        } else {
            rep.disputesLost++;
            scoreChange = -int256(LOSS_PENALTY);
            
            // Extra penalty for high AI confidence loss
            if (aiConfidence >= 90) {
                scoreChange -= int256(HIGH_CONFIDENCE_BONUS);
            }
        }

        rep.score = _adjustScore(oldScore, scoreChange);

        // Check for auto-ban
        if (rep.score <= BAN_THRESHOLD) {
            rep.isBanned = true;
            rep.banReason = "Reputation too low";
            emit UserBanned(user, rep.banReason, address(this));
        }

        emit ReputationUpdated(user, oldScore, rep.score, won ? "Won dispute" : (split ? "Split decision" : "Lost dispute"));
    }

    /**
     * @notice Record an appeal outcome
     * @param user Address of the user who appealed
     * @param successful Whether the appeal was successful
     */
    function recordAppealOutcome(
        address user,
        bool successful
    ) external onlyRole(DISPUTE_CONTRACT_ROLE) {
        UserReputation storage rep = _getOrCreateReputation(user);
        require(!rep.isBanned, "User is banned");

        uint256 oldScore = rep.score;
        int256 scoreChange;

        if (successful) {
            scoreChange = int256(APPEAL_SUCCESS_BONUS);
            // Update appeal success rate
            uint256 totalAppeals = rep.totalDisputes > 0 ? rep.totalDisputes / 10 : 1;
            rep.appealSuccessRate = (rep.appealSuccessRate * (totalAppeals - 1) + 10000) / totalAppeals;
        } else {
            scoreChange = -int256(APPEAL_FAIL_PENALTY);
        }

        rep.score = _adjustScore(oldScore, scoreChange);
        rep.lastActivityAt = block.timestamp;

        emit ReputationUpdated(user, oldScore, rep.score, successful ? "Successful appeal" : "Failed appeal");
    }

    /**
     * @notice Rate the quality of evidence submitted by a user
     * @param user Address of the user
     * @param disputeId ID of the dispute
     * @param qualityScore Quality score (0-100)
     */
    function rateEvidenceQuality(
        address user,
        uint256 disputeId,
        uint256 qualityScore
    ) external onlyRole(MODERATOR_ROLE) {
        require(qualityScore <= 100, "Invalid quality score");
        
        UserReputation storage rep = _getOrCreateReputation(user);
        
        // Update rolling average
        if (rep.evidenceQuality == 0) {
            rep.evidenceQuality = qualityScore;
        } else {
            rep.evidenceQuality = (rep.evidenceQuality + qualityScore) / 2;
        }

        // Bonus for high quality evidence
        if (qualityScore >= 80) {
            uint256 oldScore = rep.score;
            uint256 bonus = (qualityScore - 80) * EVIDENCE_QUALITY_BONUS / 20;
            rep.score = _adjustScore(oldScore, int256(bonus));
            emit ReputationUpdated(user, oldScore, rep.score, "High quality evidence");
        }

        emit EvidenceQualityRated(user, disputeId, qualityScore);
    }

    /**
     * @notice Record response time for a dispute
     * @param user Address of the user
     * @param responseTimeSeconds Response time in seconds
     */
    function recordResponseTime(
        address user,
        uint256 responseTimeSeconds
    ) external onlyRole(DISPUTE_CONTRACT_ROLE) {
        UserReputation storage rep = _getOrCreateReputation(user);
        
        // Update rolling average
        if (rep.responseTime == 0) {
            rep.responseTime = responseTimeSeconds;
        } else {
            rep.responseTime = (rep.responseTime + responseTimeSeconds) / 2;
        }

        // Bonus for fast response (under 1 hour)
        if (responseTimeSeconds < 3600) {
            uint256 oldScore = rep.score;
            rep.score = _adjustScore(oldScore, int256(FAST_RESPONSE_BONUS));
            emit ReputationUpdated(user, oldScore, rep.score, "Fast response");
        }
    }

    /**
     * @notice Apply fraud penalty to a user
     * @param user Address of the user
     * @param reason Reason for the penalty
     */
    function applyFraudPenalty(
        address user,
        string calldata reason
    ) external onlyRole(MODERATOR_ROLE) {
        UserReputation storage rep = _getOrCreateReputation(user);
        
        uint256 oldScore = rep.score;
        rep.score = _adjustScore(oldScore, -int256(FRAUD_PENALTY));

        if (rep.score <= BAN_THRESHOLD) {
            rep.isBanned = true;
            rep.banReason = reason;
            emit UserBanned(user, reason, msg.sender);
        }

        emit ReputationUpdated(user, oldScore, rep.score, reason);
    }

    // ============ Admin Functions ============

    /**
     * @notice Ban a user
     * @param user Address to ban
     * @param reason Reason for ban
     */
    function banUser(
        address user,
        string calldata reason
    ) external onlyRole(MODERATOR_ROLE) {
        UserReputation storage rep = _getOrCreateReputation(user);
        rep.isBanned = true;
        rep.banReason = reason;
        emit UserBanned(user, reason, msg.sender);
    }

    /**
     * @notice Unban a user
     * @param user Address to unban
     */
    function unbanUser(address user) external onlyRole(MODERATOR_ROLE) {
        UserReputation storage rep = userReputations[user];
        require(rep.isBanned, "User not banned");
        rep.isBanned = false;
        rep.banReason = "";
        // Reset to minimum viable reputation
        if (rep.score < BASE_REPUTATION / 2) {
            rep.score = BASE_REPUTATION / 2;
        }
        emit UserUnbanned(user, msg.sender);
    }

    /**
     * @notice Create a new reputation tier
     */
    function createTier(
        string calldata name,
        uint256 minScore,
        uint256 maxFeeDiscount,
        uint256 maxDisputeAmount,
        bool canAppeal,
        bool prioritySupport
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        reputationTiers[tierCount] = ReputationTier({
            name: name,
            minScore: minScore,
            maxFeeDiscount: maxFeeDiscount,
            maxDisputeAmount: maxDisputeAmount,
            canAppeal: canAppeal,
            prioritySupport: prioritySupport
        });
        
        emit TierCreated(tierCount, name, minScore);
        tierCount++;
    }

    /**
     * @notice Set dispute contract role
     */
    function setDisputeContract(address disputeContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(DISPUTE_CONTRACT_ROLE, disputeContract);
    }

    // ============ View Functions ============

    function getReputation(address user) external view returns (UserReputation memory) {
        UserReputation memory rep = userReputations[user];
        if (rep.createdAt == 0) {
            rep.score = BASE_REPUTATION;
        }
        return rep;
    }

    function getReputationScore(address user) external view returns (uint256) {
        UserReputation memory rep = userReputations[user];
        return rep.createdAt == 0 ? BASE_REPUTATION : rep.score;
    }

    function getUserTier(address user) external view returns (uint256 tierId, ReputationTier memory tier) {
        uint256 score = userReputations[user].createdAt == 0 ? BASE_REPUTATION : userReputations[user].score;
        
        for (uint256 i = tierCount; i > 0; i--) {
            if (score >= reputationTiers[i - 1].minScore) {
                return (i - 1, reputationTiers[i - 1]);
            }
        }
        return (0, reputationTiers[0]);
    }

    function getFeeDiscount(address user) external view returns (uint256) {
        uint256 score = userReputations[user].createdAt == 0 ? BASE_REPUTATION : userReputations[user].score;
        
        for (uint256 i = tierCount; i > 0; i--) {
            if (score >= reputationTiers[i - 1].minScore) {
                return reputationTiers[i - 1].maxFeeDiscount;
            }
        }
        return 0;
    }

    function canUserAppeal(address user) external view returns (bool) {
        if (userReputations[user].isBanned) return false;
        
        uint256 score = userReputations[user].createdAt == 0 ? BASE_REPUTATION : userReputations[user].score;
        
        for (uint256 i = tierCount; i > 0; i--) {
            if (score >= reputationTiers[i - 1].minScore) {
                return reputationTiers[i - 1].canAppeal;
            }
        }
        return false;
    }

    function isUserBanned(address user) external view returns (bool) {
        return userReputations[user].isBanned;
    }

    function getMaxDisputeAmount(address user) external view returns (uint256) {
        if (userReputations[user].isBanned) return 0;
        
        uint256 score = userReputations[user].createdAt == 0 ? BASE_REPUTATION : userReputations[user].score;
        
        for (uint256 i = tierCount; i > 0; i--) {
            if (score >= reputationTiers[i - 1].minScore) {
                return reputationTiers[i - 1].maxDisputeAmount;
            }
        }
        return reputationTiers[0].maxDisputeAmount;
    }

    function getTier(uint256 tierId) external view returns (ReputationTier memory) {
        require(tierId < tierCount, "Invalid tier");
        return reputationTiers[tierId];
    }
}
