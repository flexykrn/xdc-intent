// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./SolverRegistry.sol";

/**
 * @title SolverIncentiveManager
 * @notice Manages solver reputation, rewards, and penalties
 * @dev Tracks solver performance metrics and distributes rewards
 */
contract SolverIncentiveManager is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    
    struct SolverStats {
        uint256 totalIntentsFulfilled;
        uint256 totalIntentsFailed;
        uint256 totalValueFulfilled;    // In wei
        uint256 averageFulfillmentTime;   // In seconds
        uint256 reputationScore;          // 0-10000 (100.00%)
        uint256 lastActivityTimestamp;
        bool isActive;
    }
    
    struct RewardPool {
        uint256 totalRewards;
        uint256 distributedRewards;
        uint256 rewardPerIntent;          // Base reward per fulfilled intent
        uint256 bonusThreshold;           // Reputation score for bonus
        uint256 bonusMultiplier;          // Bonus multiplier (100 = 1x)
    }
    
    // ============ State Variables ============
    
    SolverRegistry public solverRegistry;
    
    mapping(address => SolverStats) public solverStats;
    mapping(address => uint256) public pendingRewards;
    mapping(address => uint256) public totalRewardsClaimed;
    
    RewardPool public rewardPool;
    
    uint256 public constant REPUTATION_PRECISION = 10000;
    uint256 public constant MAX_REPUTATION = 10000;
    uint256 public constant DECAY_RATE = 50; // 0.5% per period
    uint256 public constant DECAY_PERIOD = 7 days;
    
    // ============ Events ============
    
    event SolverStatsUpdated(
        address indexed solver,
        uint256 totalFulfilled,
        uint256 reputationScore
    );
    event RewardDistributed(
        address indexed solver,
        uint256 amount,
        uint256 bonusAmount
    );
    event RewardClaimed(
        address indexed solver,
        uint256 amount
    );
    event ReputationUpdated(
        address indexed solver,
        uint256 oldScore,
        uint256 newScore
    );
    event RewardPoolFunded(
        uint256 amount,
        uint256 rewardPerIntent
    );
    
    // ============ Modifiers ============
    
    modifier onlyRegisteredSolver() {
        require(
            solverRegistry.isRegistered(msg.sender),
            "Not registered solver"
        );
        _;
    }
    
    modifier onlyRegistry() {
        require(
            msg.sender == address(solverRegistry),
            "Only registry"
        );
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _solverRegistry) Ownable(msg.sender) {
        solverRegistry = SolverRegistry(_solverRegistry);
        
        rewardPool = RewardPool({
            totalRewards: 0,
            distributedRewards: 0,
            rewardPerIntent: 0.001 ether,  // Base reward
            bonusThreshold: 8000,            // 80% reputation for bonus
            bonusMultiplier: 150             // 1.5x bonus
        });
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Record a successful intent fulfillment
     * @param solver Address of the solver
     * @param intentValue Value of the fulfilled intent
     * @param fulfillmentTime Time taken to fulfill (in seconds)
     */
    function recordFulfillment(
        address solver,
        uint256 intentValue,
        uint256 fulfillmentTime
    ) external onlyRegistry {
        SolverStats storage stats = solverStats[solver];
        
        if (!stats.isActive) {
            stats.isActive = true;
        }
        
        stats.totalIntentsFulfilled++;
        stats.totalValueFulfilled += intentValue;
        
        // Update average fulfillment time using moving average
        if (stats.totalIntentsFulfilled == 1) {
            stats.averageFulfillmentTime = fulfillmentTime;
        } else {
            stats.averageFulfillmentTime = 
                (stats.averageFulfillmentTime * (stats.totalIntentsFulfilled - 1) + fulfillmentTime) /
                stats.totalIntentsFulfilled;
        }
        
        stats.lastActivityTimestamp = block.timestamp;
        
        // Calculate and distribute reward
        _calculateAndDistributeReward(solver);
        
        // Update reputation
        _updateReputation(solver);
        
        emit SolverStatsUpdated(
            solver,
            stats.totalIntentsFulfilled,
            stats.reputationScore
        );
    }
    
    /**
     * @notice Record a failed intent fulfillment
     * @param solver Address of the solver
     */
    function recordFailure(address solver) external onlyRegistry {
        SolverStats storage stats = solverStats[solver];
        stats.totalIntentsFailed++;
        stats.lastActivityTimestamp = block.timestamp;
        
        // Penalize reputation
        _penalizeReputation(solver);
        
        emit SolverStatsUpdated(
            solver,
            stats.totalIntentsFulfilled,
            stats.reputationScore
        );
    }
    
    /**
     * @notice Claim pending rewards
     */
    function claimRewards() external onlyRegisteredSolver nonReentrant {
        uint256 amount = pendingRewards[msg.sender];
        require(amount > 0, "No pending rewards");
        
        pendingRewards[msg.sender] = 0;
        totalRewardsClaimed[msg.sender] += amount;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        
        emit RewardClaimed(msg.sender, amount);
    }
    
    /**
     * @notice Fund the reward pool
     */
    function fundRewardPool() external payable onlyOwner {
        rewardPool.totalRewards += msg.value;
        emit RewardPoolFunded(msg.value, rewardPool.rewardPerIntent);
    }
    
    /**
     * @notice Set reward parameters
     */
    function setRewardParams(
        uint256 _rewardPerIntent,
        uint256 _bonusThreshold,
        uint256 _bonusMultiplier
    ) external onlyOwner {
        rewardPool.rewardPerIntent = _rewardPerIntent;
        rewardPool.bonusThreshold = _bonusThreshold;
        rewardPool.bonusMultiplier = _bonusMultiplier;
    }
    
    /**
     * @notice Get solver reputation score
     */
    function getReputation(address solver) external view returns (uint256) {
        return solverStats[solver].reputationScore;
    }
    
    /**
     * @notice Get solver ranking metrics
     */
    function getSolverMetrics(address solver) external view returns (
        uint256 fulfilled,
        uint256 failed,
        uint256 reputation,
        uint256 avgFulfillmentTime,
        uint256 pendingReward
    ) {
        SolverStats storage stats = solverStats[solver];
        return (
            stats.totalIntentsFulfilled,
            stats.totalIntentsFailed,
            stats.reputationScore,
            stats.averageFulfillmentTime,
            pendingRewards[solver]
        );
    }
    
    /**
     * @notice Apply reputation decay for inactive solvers
     */
    function applyReputationDecay(address solver) external {
        SolverStats storage stats = solverStats[solver];
        require(stats.isActive, "Solver not active");
        
        uint256 timeSinceLastActivity = block.timestamp - stats.lastActivityTimestamp;
        uint256 decayPeriods = timeSinceLastActivity / DECAY_PERIOD;
        
        if (decayPeriods > 0) {
            uint256 decayAmount = decayPeriods * DECAY_RATE;
            if (decayAmount > stats.reputationScore) {
                stats.reputationScore = 0;
            } else {
                stats.reputationScore -= decayAmount;
            }
            
            emit ReputationUpdated(
                solver,
                stats.reputationScore + decayAmount,
                stats.reputationScore
            );
        }
    }
    
    // ============ Internal Functions ============
    
    function _calculateAndDistributeReward(address solver) internal {
        SolverStats storage stats = solverStats[solver];
        
        uint256 baseReward = rewardPool.rewardPerIntent;
        uint256 totalReward = baseReward;
        
        // Apply bonus if reputation is above threshold
        if (stats.reputationScore >= rewardPool.bonusThreshold) {
            uint256 bonus = (baseReward * rewardPool.bonusMultiplier) / 100 - baseReward;
            totalReward += bonus;
        }
        
        // Check if pool has enough funds
        require(
            rewardPool.totalRewards - rewardPool.distributedRewards >= totalReward,
            "Insufficient reward pool"
        );
        
        pendingRewards[solver] += totalReward;
        rewardPool.distributedRewards += totalReward;
        
        emit RewardDistributed(solver, baseReward, totalReward - baseReward);
    }
    
    function _updateReputation(address solver) internal {
        SolverStats storage stats = solverStats[solver];
        
        uint256 totalAttempts = stats.totalIntentsFulfilled + stats.totalIntentsFailed;
        if (totalAttempts == 0) return;
        
        uint256 successRate = (stats.totalIntentsFulfilled * REPUTATION_PRECISION) / totalAttempts;
        uint256 speedScore = _calculateSpeedScore(stats.averageFulfillmentTime);
        uint256 volumeScore = _calculateVolumeScore(stats.totalValueFulfilled);
        
        // Weighted average: 50% success rate, 30% speed, 20% volume
        uint256 newScore = (successRate * 50 + speedScore * 30 + volumeScore * 20) / 100;
        
        uint256 oldScore = stats.reputationScore;
        stats.reputationScore = newScore;
        
        emit ReputationUpdated(solver, oldScore, newScore);
    }
    
    function _penalizeReputation(address solver) internal {
        SolverStats storage stats = solverStats[solver];
        
        uint256 penalty = 500; // 5% penalty
        if (stats.reputationScore > penalty) {
            stats.reputationScore -= penalty;
        } else {
            stats.reputationScore = 0;
        }
    }
    
    function _calculateSpeedScore(uint256 avgTime) internal pure returns (uint256) {
        // Faster = higher score
        if (avgTime <= 60) return 10000;      // Under 1 min: perfect
        if (avgTime <= 300) return 8000;      // Under 5 min: excellent
        if (avgTime <= 900) return 6000;      // Under 15 min: good
        if (avgTime <= 1800) return 4000;     // Under 30 min: average
        return 2000;                          // Over 30 min: poor
    }
    
    function _calculateVolumeScore(uint256 totalValue) internal pure returns (uint256) {
        // More volume = higher score
        if (totalValue >= 1000 ether) return 10000;
        if (totalValue >= 100 ether) return 8000;
        if (totalValue >= 10 ether) return 6000;
        if (totalValue >= 1 ether) return 4000;
        return 2000;
    }
    
    receive() external payable {
        fundRewardPool();
    }
}