// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./SolverRegistry.sol";

/**
 * @title SolverIncentivePool
 * @notice Incentivizes professional solvers with rewards and competitions
 * @dev Rewards based on volume, efficiency, and user satisfaction
 */
contract SolverIncentivePool is ReentrancyGuard {
    
    SolverRegistry public solverRegistry;
    IERC20 public rewardToken;
    
    // Reward parameters
    uint256 public baseRewardPerIntent = 0.001 ether; // 0.1% base
    uint256 public volumeMultiplier = 2; // 2x for high volume
    uint256 public efficiencyBonus = 1.5e18; // 50% bonus for fast execution
    
    // Epoch tracking (weekly)
    uint256 public currentEpoch;
    uint256 public epochStartTime;
    uint256 public constant EPOCH_DURATION = 7 days;
    
    // Solver => Epoch => Stats
    mapping(address => mapping(uint256 => SolverEpochStats)) public solverStats;
    
    // Epoch => Top solvers
    mapping(uint256 => address[]) public topSolvers;
    
    struct SolverEpochStats {
        uint256 intentsSolved;
        uint256 volume;
        uint256 averageExecutionTime;
        uint256 userRating;
        uint256 rewardsEarned;
    }
    
    event EpochStarted(uint256 indexed epoch, uint256 startTime);
    event SolverRewarded(
        address indexed solver,
        uint256 indexed epoch,
        uint256 amount
    );
    event TopSolverAwarded(
        address indexed solver,
        uint256 indexed epoch,
        uint256 rank
    );
    
    constructor(address _solverRegistry, address _rewardToken) {
        solverRegistry = SolverRegistry(_solverRegistry);
        rewardToken = IERC20(_rewardToken);
        currentEpoch = 1;
        epochStartTime = block.timestamp;
    }
    
    /**
     * @notice Record solver performance for an intent
     */
    function recordIntentSolved(
        address _solver,
        uint256 _intentValue,
        uint256 _executionTime,
        uint256 _userRating
    ) external {
        require(solverRegistry.isRegistered(_solver), "Not registered");
        
        SolverEpochStats storage stats = solverStats[_solver][currentEpoch];
        stats.intentsSolved++;
        stats.volume += _intentValue;
        
        // Update average execution time
        if (stats.averageExecutionTime == 0) {
            stats.averageExecutionTime = _executionTime;
        } else {
            stats.averageExecutionTime = 
                (stats.averageExecutionTime * (stats.intentsSolved - 1) + _executionTime) / 
                stats.intentsSolved;
        }
        
        // Update user rating (1-5 scale)
        if (_userRating > 0) {
            stats.userRating = 
                (stats.userRating * (stats.intentsSolved - 1) + _userRating * 1e18) / 
                stats.intentsSolved;
        }
    }
    
    /**
     * @notice Calculate reward for a solver in current epoch
     */
    function calculateReward(address _solver) public view returns (uint256) {
        SolverEpochStats memory stats = solverStats[_solver][currentEpoch];
        
        if (stats.intentsSolved == 0) return 0;
        
        // Base reward
        uint256 reward = stats.intentsSolved * baseRewardPerIntent;
        
        // Volume bonus (2x if volume > 100k)
        if (stats.volume > 100000 * 1e18) {
            reward = reward * volumeMultiplier;
        }
        
        // Efficiency bonus (if avg execution < 30s)
        if (stats.averageExecutionTime < 30) {
            reward = reward * efficiencyBonus / 1e18;
        }
        
        // User rating bonus (1.2x if rating > 4.5)
        if (stats.userRating > 4.5 * 1e18) {
            reward = reward * 12 / 10;
        }
        
        return reward;
    }
    
    /**
     * @notice Claim rewards for current epoch
     */
    function claimReward() external nonReentrant {
        uint256 reward = calculateReward(msg.sender);
        require(reward > 0, "No reward to claim");
        
        SolverEpochStats storage stats = solverStats[msg.sender][currentEpoch];
        require(stats.rewardsEarned == 0, "Already claimed");
        
        stats.rewardsEarned = reward;
        
        // Transfer reward
        rewardToken.transfer(msg.sender, reward);
        
        emit SolverRewarded(msg.sender, currentEpoch, reward);
    }
    
    /**
     * @notice Start new epoch and distribute top solver bonuses
     */
    function startNewEpoch() external {
        require(block.timestamp >= epochStartTime + EPOCH_DURATION, "Epoch not ended");
        
        // Award top 3 solvers
        _awardTopSolvers();
        
        currentEpoch++;
        epochStartTime = block.timestamp;
        
        emit EpochStarted(currentEpoch, epochStartTime);
    }
    
    /**
     * @notice Award top solvers from previous epoch
     */
    function _awardTopSolvers() internal {
        uint256 prevEpoch = currentEpoch - 1;
        
        // Find top 3 solvers by volume
        address[] memory allSolvers = solverRegistry.getAllSolvers();
        
        // Sort by volume (bubble sort for simplicity)
        for (uint256 i = 0; i < allSolvers.length; i++) {
            for (uint256 j = i + 1; j < allSolvers.length; j++) {
                if (solverStats[allSolvers[j]][prevEpoch].volume > 
                    solverStats[allSolvers[i]][prevEpoch].volume) {
                    address temp = allSolvers[i];
                    allSolvers[i] = allSolvers[j];
                    allSolvers[j] = temp;
                }
            }
        }
        
        // Award top 3
        uint256[] memory topRewards = new uint256[](3);
        topRewards[0] = 1000 * 1e18; // 1st place
        topRewards[1] = 500 * 1e18;  // 2nd place
        topRewards[2] = 250 * 1e18;  // 3rd place
        
        for (uint256 i = 0; i < 3 && i < allSolvers.length; i++) {
            if (solverStats[allSolvers[i]][prevEpoch].volume > 0) {
                rewardToken.transfer(allSolvers[i], topRewards[i]);
                emit TopSolverAwarded(allSolvers[i], prevEpoch, i + 1);
            }
        }
    }
    
    /**
     * @notice Get solver stats for current epoch
     */
    function getSolverStats(address _solver) external view returns (SolverEpochStats memory) {
        return solverStats[_solver][currentEpoch];
    }
    
    /**
     * @notice Get current epoch info
     */
    function getCurrentEpoch() external view returns (uint256, uint256, uint256) {
        return (currentEpoch, epochStartTime, EPOCH_DURATION);
    }
    
    /**
     * @notice Deposit reward tokens
     */
    function depositRewards(uint256 _amount) external {
        rewardToken.transferFrom(msg.sender, address(this), _amount);
    }
}

