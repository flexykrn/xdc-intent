// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SolverRegistry
 * @notice Manages solver registration, staking, and reputation
 */
contract SolverRegistry is ReentrancyGuard {
    
    struct Solver {
        address solverAddress;
        uint256 stake;
        uint256 totalFulfilled;
        uint256 totalFailed;
        uint256 totalProfit;
        uint256 reputationScore; // 0-10000 (100 = 100%)
        bool isActive;
        uint256 registeredAt;
        uint256 lastActivity;
    }
    
    struct Bid {
        address solver;
        uint256 amount; // Amount they're willing to fulfill
        uint256 fee; // Fee they're charging
        uint256 timestamp;
        bool isWinner;
    }
    
    // Minimum stake required to register as solver
    uint256 public minStake;
    
    // Reputation parameters
    uint256 public constant MAX_REPUTATION = 10000;
    uint256 public constant REPUTATION_DECAY = 100; // 1% decay per period
    uint256 public constant SUCCESS_BONUS = 500; // 5% bonus for success
    uint256 public constant FAILURE_PENALTY = 1000; // 10% penalty for failure
    
    // Mapping of solver address to solver info
    mapping(address => Solver) public solvers;
    
    // List of registered solver addresses
    address[] public solverList;
    
    // Intent ID => bids
    mapping(bytes32 => Bid[]) public intentBids;
    
    // Intent ID => winning solver
    mapping(bytes32 => address) public intentWinner;
    
    // Events
    event SolverRegistered(address indexed solver, uint256 stake);
    event SolverUnregistered(address indexed solver, uint256 stakeReturned);
    event BidSubmitted(bytes32 indexed intentId, address indexed solver, uint256 amount, uint256 fee);
    event WinnerSelected(bytes32 indexed intentId, address indexed solver, uint256 amount, uint256 fee);
    event ReputationUpdated(address indexed solver, uint256 newScore);
    event SolverSlashed(address indexed solver, uint256 amount);
    
    constructor(uint256 _minStake) {
        minStake = _minStake;
    }
    
    /**
     * @notice Register as a solver with stake
     */
    function register() external payable nonReentrant {
        require(msg.value >= minStake, "Insufficient stake");
        require(!solvers[msg.sender].isActive, "Already registered");
        
        Solver storage solver = solvers[msg.sender];
        solver.solverAddress = msg.sender;
        solver.stake = msg.value;
        solver.reputationScore = 5000; // Start with 50% reputation
        solver.isActive = true;
        solver.registeredAt = block.timestamp;
        solver.lastActivity = block.timestamp;
        
        solverList.push(msg.sender);
        
        emit SolverRegistered(msg.sender, msg.value);
    }
    
    /**
     * @notice Unregister and withdraw stake
     */
    function unregister() external nonReentrant {
        Solver storage solver = solvers[msg.sender];
        require(solver.isActive, "Not registered");
        require(solver.stake > 0, "No stake to withdraw");
        
        uint256 stakeToReturn = solver.stake;
        solver.isActive = false;
        solver.stake = 0;
        
        // Remove from list
        for (uint i = 0; i < solverList.length; i++) {
            if (solverList[i] == msg.sender) {
                solverList[i] = solverList[solverList.length - 1];
                solverList.pop();
                break;
            }
        }
        
        (bool success, ) = payable(msg.sender).call{value: stakeToReturn}("");
        require(success, "Transfer failed");
        
        emit SolverUnregistered(msg.sender, stakeToReturn);
    }
    
    /**
     * @notice Submit a bid for an intent
     */
    function submitBid(
        bytes32 intentId,
        uint256 amount,
        uint256 fee
    ) external {
        Solver storage solver = solvers[msg.sender];
        require(solver.isActive, "Not registered solver");
        require(solver.stake >= minStake, "Insufficient stake");
        
        Bid memory bid = Bid({
            solver: msg.sender,
            amount: amount,
            fee: fee,
            timestamp: block.timestamp,
            isWinner: false
        });
        
        intentBids[intentId].push(bid);
        solver.lastActivity = block.timestamp;
        
        emit BidSubmitted(intentId, msg.sender, amount, fee);
    }
    
    /**
     * @notice Select winner for an intent (called by IntentRegistry)
     */
    function selectWinner(bytes32 intentId) external returns (address winner) {
        Bid[] storage bids = intentBids[intentId];
        require(bids.length > 0, "No bids");
        
        // Find best bid (highest amount, lowest fee, highest reputation)
        uint256 bestScore = 0;
        address bestSolver = address(0);
        
        for (uint i = 0; i < bids.length; i++) {
            Solver storage solver = solvers[bids[i].solver];
            
            // Score = (amount * reputation) / (fee + 1)
            uint256 score = (bids[i].amount * solver.reputationScore) / (bids[i].fee + 1);
            
            if (score > bestScore) {
                bestScore = score;
                bestSolver = bids[i].solver;
            }
        }
        
        require(bestSolver != address(0), "No valid winner");
        
        // Mark winner
        for (uint i = 0; i < bids.length; i++) {
            if (bids[i].solver == bestSolver) {
                bids[i].isWinner = true;
                break;
            }
        }
        
        intentWinner[intentId] = bestSolver;
        
        emit WinnerSelected(intentId, bestSolver, bids[0].amount, bids[0].fee);
        
        return bestSolver;
    }
    
    /**
     * @notice Update solver reputation after fulfillment
     */
    function updateReputation(
        address solver,
        bool success,
        uint256 profit
    ) external {
        Solver storage s = solvers[solver];
        require(s.isActive, "Not active solver");
        
        if (success) {
            s.totalFulfilled++;
            s.totalProfit += profit;
            s.reputationScore = min(s.reputationScore + SUCCESS_BONUS, MAX_REPUTATION);
        } else {
            s.totalFailed++;
            s.reputationScore = s.reputationScore > FAILURE_PENALTY ? 
                s.reputationScore - FAILURE_PENALTY : 0;
        }
        
        s.lastActivity = block.timestamp;
        
        emit ReputationUpdated(solver, s.reputationScore);
    }
    
    /**
     * @notice Slash solver for bad behavior
     */
    function slashSolver(address solver, uint256 amount) external {
        Solver storage s = solvers[solver];
        require(s.isActive, "Not active");
        require(s.stake >= amount, "Insufficient stake");
        
        s.stake -= amount;
        s.reputationScore = s.reputationScore > 2000 ? s.reputationScore - 2000 : 0;
        
        // Transfer slashed amount to treasury
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
        
        emit SolverSlashed(solver, amount);
    }
    
    /**
     * @notice Get active solvers count
     */
    function getActiveSolversCount() external view returns (uint256) {
        return solverList.length;
    }
    
    /**
     * @notice Get solver list
     */
    function getSolverList() external view returns (address[] memory) {
        return solverList;
    }
    
    /**
     * @notice Get bids for intent
     */
    function getBids(bytes32 intentId) external view returns (Bid[] memory) {
        return intentBids[intentId];
    }
    
    /**
     * @notice Get winner for intent
     */
    function getWinner(bytes32 intentId) external view returns (address) {
        return intentWinner[intentId];
    }
    
    /**
     * @notice Check if address is registered solver
     */
    function isSolver(address addr) external view returns (bool) {
        return solvers[addr].isActive;
    }
    
    /**
     * @notice Get solver info
     */
    function getSolverInfo(address solver) external view returns (Solver memory) {
        return solvers[solver];
    }
    
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}