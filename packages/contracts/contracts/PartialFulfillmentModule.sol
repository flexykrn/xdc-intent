// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IntentRegistry.sol";
import "./Escrow.sol";

/**
 * @title PartialFulfillmentModule
 * @notice Enables partial fulfillment of intents with proportional rewards
 * @dev Allows solvers to fill a portion of an intent and claim partial payment
 */
contract PartialFulfillmentModule is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    
    struct PartialFulfillment {
        uint256 filledAmount;
        uint256 remainingAmount;
        address solver;
        uint256 timestamp;
        bool isComplete;
    }
    
    struct IntentPartition {
        uint256 minFillAmount;      // Minimum amount for a single fill
        uint256 maxFillAmount;      // Maximum amount for a single fill
        uint256 totalPartitions;    // How many partitions exist
        uint256 filledPartitions;   // How many are filled
    }
    
    // ============ State Variables ============
    
    IntentRegistry public intentRegistry;
    Escrow public escrow;
    
    mapping(bytes32 => PartialFulfillment[]) public fulfillments;
    mapping(bytes32 => IntentPartition) public intentPartitions;
    mapping(bytes32 => uint256) public totalFilledAmount;
    
    uint256 public constant MIN_PARTITION_SIZE = 0.1 ether;
    uint256 public constant MAX_PARTITIONS = 10;
    
    // ============ Events ============
    
    event PartialFulfillmentRecorded(
        bytes32 indexed intentId,
        address indexed solver,
        uint256 filledAmount,
        uint256 remainingAmount
    );
    event IntentFullyFilled(
        bytes32 indexed intentId,
        uint256 totalFilledAmount,
        uint256 totalSolvers
    );
    event PartitionConfigSet(
        bytes32 indexed intentId,
        uint256 minFillAmount,
        uint256 maxFillAmount
    );
    
    // ============ Modifiers ============
    
    modifier onlyRegisteredSolver() {
        // Would check SolverRegistry in production
        _;
    }
    
    modifier validIntent(bytes32 intentId) {
        require(
            intentRegistry.isIntentPending(intentId),
            "Intent not pending"
        );
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _intentRegistry, address _escrow) Ownable() {
        intentRegistry = IntentRegistry(_intentRegistry);
        escrow = Escrow(_escrow);
    }
    
    // ============ External Functions ============
    
    /**
     * @notice Configure partition settings for an intent
     * @param intentId The intent ID
     * @param minFillAmount Minimum amount per fill
     * @param maxFillAmount Maximum amount per fill
     */
    function configurePartitions(
        bytes32 intentId,
        uint256 minFillAmount,
        uint256 maxFillAmount
    ) external validIntent(intentId) {
        // Only intent creator can configure
        address creator = intentRegistry.getIntentCreator(intentId);
        require(msg.sender == creator, "Only intent creator");
        
        require(minFillAmount >= MIN_PARTITION_SIZE, "Min fill too small");
        require(maxFillAmount > minFillAmount, "Max must be greater than min");
        
        intentPartitions[intentId] = IntentPartition({
            minFillAmount: minFillAmount,
            maxFillAmount: maxFillAmount,
            totalPartitions: 0, // Calculated dynamically
            filledPartitions: 0
        });
        
        emit PartitionConfigSet(intentId, minFillAmount, maxFillAmount);
    }
    
    /**
     * @notice Fulfill a portion of an intent
     * @param intentId The intent ID
     * @param fillAmount Amount to fill
     */
    function fulfillPartial(
        bytes32 intentId,
        uint256 fillAmount
    ) external onlyRegisteredSolver validIntent(intentId) nonReentrant {
        IntentPartition storage partition = intentPartitions[intentId];
        
        // If not configured, use defaults
        if (partition.maxFillAmount == 0) {
            // Get intent details and set defaults
            uint256 amount = intentRegistry.getIntentAmount(intentId);
            partition.minFillAmount = MIN_PARTITION_SIZE;
            partition.maxFillAmount = amount / 2; // Max 50% per fill
        }
        
        require(
            fillAmount >= partition.minFillAmount,
            "Fill amount below minimum"
        );
        require(
            fillAmount <= partition.maxFillAmount,
            "Fill amount above maximum"
        );
        
        // Check remaining amount
        uint256 totalAmount = intentRegistry.getIntentAmount(intentId);
        uint256 alreadyFilled = totalFilledAmount[intentId];
        uint256 remaining = totalAmount - alreadyFilled;
        
        require(fillAmount <= remaining, "Fill amount exceeds remaining");
        
        // Record fulfillment
        PartialFulfillment memory fulfillment = PartialFulfillment({
            filledAmount: fillAmount,
            remainingAmount: remaining - fillAmount,
            solver: msg.sender,
            timestamp: block.timestamp,
            isComplete: (fillAmount == remaining)
        });
        
        fulfillments[intentId].push(fulfillment);
        totalFilledAmount[intentId] += fillAmount;
        partition.filledPartitions++;
        
        // Calculate proportional payment
        uint256 proportionalPayment = (fillAmount * totalAmount) / totalAmount;
        
        // Release proportional payment to solver
        _releaseProportionalPayment(intentId, msg.sender, proportionalPayment);
        
        emit PartialFulfillmentRecorded(
            intentId,
            msg.sender,
            fillAmount,
            remaining - fillAmount
        );
        
        // If fully filled, mark complete
        if (fillAmount == remaining) {
            _markIntentComplete(intentId);
        }
    }
    
    /**
     * @notice Get all partial fulfillments for an intent
     */
    function getFulfillments(bytes32 intentId) external view returns (PartialFulfillment[] memory) {
        return fulfillments[intentId];
    }
    
    /**
     * @notice Get fill progress for an intent
     */
    function getFillProgress(bytes32 intentId) external view returns (
        uint256 filled,
        uint256 total,
        uint256 percentage
    ) {
        filled = totalFilledAmount[intentId];
        uint256 total = intentRegistry.getIntentAmount(intentId);
        percentage = total > 0 ? (filled * 100) / total : 0;
    }
    
    /**
     * @notice Check if intent is partially fillable
     */
    function isPartiallyFillable(bytes32 intentId) external view returns (bool) {
        return intentRegistry.isIntentPending(intentId) &&
               totalFilledAmount[intentId] > 0;
    }
    
    // ============ Internal Functions ============
    
    function _releaseProportionalPayment(
        bytes32 intentId,
        address solver,
        uint256 amount
    ) internal {
        // In production, this would interact with Escrow
        // For now, emit event for tracking
        emit PartialFulfillmentRecorded(intentId, solver, amount, 0);
    }
    
    function _markIntentComplete(bytes32 intentId) internal {
        // Update intent status to fulfilled
        // This would call IntentRegistry in production
        
        emit IntentFullyFilled(
            intentId,
            totalFilledAmount[intentId],
            fulfillments[intentId].length
        );
    }
}