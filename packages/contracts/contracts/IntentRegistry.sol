// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./Escrow.sol";
import "./SolverRegistry.sol";
import "./PaymentVerifier.sol";
import "./PriceOracle.sol";

/**
 * @title IntentRegistry
 * @notice Core orchestrator for the XDC Intent Framework
 * @dev Manages intent lifecycle: creation, locking, fulfillment, cancellation.
 *      Integrates with Escrow for token custody and PaymentVerifier for proof validation.
 */
contract IntentRegistry is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Enums ============
    
    enum IntentStatus {
        Pending,    // Intent created, tokens locked
        Fulfilled,  // Solver completed, tokens released
        Cancelled,  // User cancelled before fulfillment
        Expired     // Intent expired without fulfillment
    }

    // ============ Structs ============
    
    struct Intent {
        bytes32 id;
        address user;
        address solver;
        address token;
        uint256 amount;
        uint256 protocolFee;
        uint256 expiryTimestamp;
        IntentStatus status;
        bytes32 paymentProofHash;
        uint256 createdAt;
        uint256 fulfilledAt;
    }

    // ============ State Variables ============
    
    /// @notice Escrow contract for token custody
    Escrow public escrow;
    
    /// @notice Payment verifier for proof validation
    PaymentVerifier public paymentVerifier;

    /// @notice Solver registry for solver validation
    SolverRegistry public solverRegistry;

    /// @notice Price oracle for slippage protection
    PriceOracle public priceOracle;
    
    /// @notice Intent ID => Intent struct
    mapping(bytes32 => Intent) public intents;
    
    /// @notice User address => array of intent IDs
    mapping(address => bytes32[]) public userIntents;
    
    /// @notice Solver address => array of intent IDs
    mapping(address => bytes32[]) public solverIntents;
    
    /// @notice Total intents created
    uint256 public totalIntents;
    
    /// @notice Total intents fulfilled
    uint256 public totalIntentsFulfilled;
    
    /// @notice Total protocol fees collected
    uint256 public totalProtocolFees;
    
    /// @notice Maximum intent expiry (30 days)
    uint256 public constant MAX_EXPIRY = 30 days;
    
    /// @notice Minimum intent amount
    uint256 public constant MIN_AMOUNT = 1e6; // 0.000001 tokens (6 decimals)

    // ============ Events ============
    
    event IntentCreated(
        bytes32 indexed intentId,
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 protocolFee,
        uint256 expiryTimestamp
    );
    
    event IntentFulfilled(
        bytes32 indexed intentId,
        address indexed solver,
        uint256 amount,
        uint256 protocolFee,
        uint256 fulfilledAt
    );
    
    event IntentCancelled(
        bytes32 indexed intentId,
        address indexed user,
        uint256 refundedAmount,
        uint256 cancelledAt
    );
    
    event IntentExpired(
        bytes32 indexed intentId,
        address indexed user,
        uint256 refundedAmount,
        uint256 expiredAt
    );
    
    event SolverAssigned(
        bytes32 indexed intentId,
        address indexed solver
    );
    
    event EscrowUpdated(address indexed newEscrow);
    event PaymentVerifierUpdated(address indexed newPaymentVerifier);
    event SolverRegistryUpdated(address indexed newSolverRegistry);
    event PriceOracleUpdated(address indexed newPriceOracle);

    // ============ Modifiers ============
    
    modifier intentExists(bytes32 intentId) {
        require(intents[intentId].createdAt > 0, "IntentRegistry: intent not found");
        _;
    }
    
    modifier onlyIntentUser(bytes32 intentId) {
        require(intents[intentId].user == msg.sender, "IntentRegistry: not intent owner");
        _;
    }
    
    modifier onlyPending(bytes32 intentId) {
        require(intents[intentId].status == IntentStatus.Pending, "IntentRegistry: not pending");
        _;
    }

    // ============ Constructor ============
    
    constructor(
        address _escrow,
        address _paymentVerifier,
        address _priceOracle
    ) Ownable() {
        require(_escrow != address(0), "IntentRegistry: zero escrow");
        require(_paymentVerifier != address(0), "IntentRegistry: zero payment verifier");
        require(_priceOracle != address(0), "IntentRegistry: zero price oracle");
        escrow = Escrow(_escrow);
        paymentVerifier = PaymentVerifier(_paymentVerifier);
        priceOracle = PriceOracle(_priceOracle);
    }

    // ============ External Functions ============
    
    /**
     * @notice Create a new intent and lock tokens in escrow
     * @param intentId Unique intent identifier (provided by user)
     * @param token Token address to trade
     * @param amount Amount of tokens to lock
     * @param expiryTimestamp When the intent expires
     * @return bool True if intent created successfully
     */
    function createIntent(
        bytes32 intentId,
        address token,
        uint256 amount,
        uint256 expiryTimestamp
    ) external nonReentrant whenNotPaused returns (bool) {
        require(intentId != bytes32(0), "IntentRegistry: zero intent id");
        require(token != address(0), "IntentRegistry: zero token");
        require(amount >= MIN_AMOUNT, "IntentRegistry: amount too small");
        require(expiryTimestamp > block.timestamp, "IntentRegistry: expiry in past");
        require(expiryTimestamp <= block.timestamp + MAX_EXPIRY, "IntentRegistry: expiry too far");
        require(intents[intentId].createdAt == 0, "IntentRegistry: intent exists");
        
        // Calculate protocol fee
        uint256 protocolFee = escrow.calculateProtocolFee(amount);
        
        // Create intent
        Intent storage newIntent = intents[intentId];
        newIntent.id = intentId;
        newIntent.user = msg.sender;
        newIntent.token = token;
        newIntent.amount = amount;
        newIntent.protocolFee = protocolFee;
        newIntent.expiryTimestamp = expiryTimestamp;
        newIntent.status = IntentStatus.Pending;
        newIntent.createdAt = block.timestamp;
        
        // Track user intents
        userIntents[msg.sender].push(intentId);
        
        // Lock tokens in escrow
        IERC20(token).safeTransferFrom(msg.sender, address(escrow), amount);
        escrow.lockTokens(token, msg.sender, amount, intentId);
        
        totalIntents++;
        
        emit IntentCreated(
            intentId,
            msg.sender,
            token,
            amount,
            protocolFee,
            expiryTimestamp
        );
        
        return true;
    }
    
    /**
     * @notice Fulfill an intent with raw payment proof bytes (for MEVProtection integration)
     * @param intentId Intent to fulfill
     * @param solver Address of the solver who fulfilled the intent
     * @param paymentProofBytes Raw payment proof bytes
     */
    function fulfillIntentWithBytes(
        bytes32 intentId,
        address solver,
        bytes calldata paymentProofBytes
    ) external nonReentrant whenNotPaused intentExists(intentId) onlyPending(intentId) {
        require(solver != address(0), "IntentRegistry: zero solver");
        require(block.timestamp <= intents[intentId].expiryTimestamp, "IntentRegistry: intent expired");
        
        // Check if solver is registered (if solverRegistry is set)
        if (address(solverRegistry) != address(0)) {
            require(solverRegistry.isRegistered(solver), "IntentRegistry: solver not registered");
        }
        
        _fulfillIntent(intentId, solver, paymentProofBytes);
    }

    /**
     * @notice Fulfill an intent with price oracle slippage check
     * @param intentId Intent to fulfill
     * @param solver Address of the solver who fulfilled the intent
     * @param paymentProofBytes Raw payment proof bytes
     * @param pair DEX pair address for price checking
     * @param expectedAmountOut Expected amount of output tokens (user's expectation)
     * @param actualAmountOut Actual amount of output tokens offered by solver
     */
    function fulfillIntentWithPriceCheck(
        bytes32 intentId,
        address solver,
        bytes calldata paymentProofBytes,
        address pair,
        address tokenOut,
        uint256 expectedAmountOut,
        uint256 actualAmountOut
    ) external nonReentrant whenNotPaused intentExists(intentId) onlyPending(intentId) {
        require(solver != address(0), "IntentRegistry: zero solver");
        require(block.timestamp <= intents[intentId].expiryTimestamp, "IntentRegistry: intent expired");
        
        // Check if solver is registered (if solverRegistry is set)
        if (address(solverRegistry) != address(0)) {
            require(solverRegistry.isRegistered(solver), "IntentRegistry: solver not registered");
        }
        
        // Price oracle slippage check
        if (address(priceOracle) != address(0)) {
            address tokenIn = intents[intentId].token;
            priceOracle.checkFulfillmentPrice(
                tokenIn,
                tokenOut,
                pair,
                expectedAmountOut,
                actualAmountOut
            );
        }
        
        _fulfillIntent(intentId, solver, paymentProofBytes);
    }
    
    function _fulfillIntent(bytes32 intentId, address solver, bytes calldata paymentProofBytes) internal {
        Intent storage intent = intents[intentId];
        
        // Update intent
        intent.solver = solver;
        intent.status = IntentStatus.Fulfilled;
        intent.paymentProofHash = keccak256(paymentProofBytes);
        intent.fulfilledAt = block.timestamp;
        
        // Track solver intents
        solverIntents[solver].push(intentId);
        
        // Release tokens from escrow to solver
        escrow.releaseTokens(intent.token, solver, intent.amount, intentId);
        
        // Update analytics
        totalIntentsFulfilled++;
        totalProtocolFees += intent.protocolFee;
        
        emit IntentFulfilled(
            intentId,
            solver,
            intent.amount,
            intent.protocolFee,
            block.timestamp
        );
    }
    
    /**
     * @notice Cancel a pending intent and refund tokens
     * @param intentId Intent to cancel
     */
    function cancelIntent(
        bytes32 intentId
    ) external nonReentrant whenNotPaused intentExists(intentId) onlyPending(intentId) onlyIntentUser(intentId) {
        Intent storage intent = intents[intentId];
        
        // Update intent
        intent.status = IntentStatus.Cancelled;
        
        // Refund tokens from escrow
        escrow.refundTokens(intent.token, intent.user, intent.amount, intentId);
        
        emit IntentCancelled(
            intentId,
            msg.sender,
            intent.amount,
            block.timestamp
        );
    }
    
    /**
     * @notice Expire an intent that has passed its expiry timestamp
     * @param intentId Intent to expire
     */
    function expireIntent(
        bytes32 intentId
    ) external nonReentrant whenNotPaused intentExists(intentId) onlyPending(intentId) {
        Intent storage intent = intents[intentId];
        require(block.timestamp > intent.expiryTimestamp, "IntentRegistry: not expired yet");
        
        // Update intent
        intent.status = IntentStatus.Expired;
        
        // Refund tokens from escrow
        escrow.refundTokens(intent.token, intent.user, intent.amount, intentId);
        
        emit IntentExpired(
            intentId,
            intent.user,
            intent.amount,
            block.timestamp
        );
    }
    
    /**
     * @notice Update escrow contract address (emergency only)
     * @param newEscrow New escrow address
     */
    function setEscrow(address newEscrow) external onlyOwner {
        require(newEscrow != address(0), "IntentRegistry: zero address");
        escrow = Escrow(newEscrow);
        emit EscrowUpdated(newEscrow);
    }
    
    /**
     * @notice Update payment verifier address (emergency only)
     * @param newPaymentVerifier New payment verifier address
     */
    function setPaymentVerifier(address newPaymentVerifier) external onlyOwner {
        require(newPaymentVerifier != address(0), "IntentRegistry: zero address");
        paymentVerifier = PaymentVerifier(newPaymentVerifier);
        emit PaymentVerifierUpdated(newPaymentVerifier);
    }
    
    /**
     * @notice Pause all operations
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause all operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Update solver registry address (emergency only)
     * @param newSolverRegistry New solver registry address
     */
    function setSolverRegistry(address newSolverRegistry) external onlyOwner {
        require(newSolverRegistry != address(0), "IntentRegistry: zero address");
        solverRegistry = SolverRegistry(newSolverRegistry);
        emit SolverRegistryUpdated(newSolverRegistry);
    }

    /**
     * @notice Update price oracle address (emergency only)
     * @param newPriceOracle New price oracle address
     */
    function setPriceOracle(address newPriceOracle) external onlyOwner {
        require(newPriceOracle != address(0), "IntentRegistry: zero address");
        priceOracle = PriceOracle(newPriceOracle);
        emit PriceOracleUpdated(newPriceOracle);
    }

    // ============ View Functions ============
    
    /**
     * @notice Get intent details
     */
    function getIntent(bytes32 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }
    
    /**
     * @notice Get all intents for a user
     */
    function getUserIntents(address user) external view returns (bytes32[] memory) {
        return userIntents[user];
    }
    
    /**
     * @notice Get all intents for a solver
     */
    function getSolverIntents(address solver) external view returns (bytes32[] memory) {
        return solverIntents[solver];
    }
    
    /**
     * @notice Check if an intent is pending
     */
    function isIntentPending(bytes32 intentId) external view returns (bool) {
        return intents[intentId].status == IntentStatus.Pending;
    }
    
    /**
     * @notice Check if an intent is fulfilled
     */
    function isIntentFulfilled(bytes32 intentId) external view returns (bool) {
        return intents[intentId].status == IntentStatus.Fulfilled;
    }
    
    /**
     * @notice Get total intents count
     */
    function getTotalIntents() external view returns (uint256) {
        return totalIntents;
    }
    
    /**
     * @notice Get total fulfilled intents count
     */
    function getTotalIntentsFulfilled() external view returns (uint256) {
        return totalIntentsFulfilled;
    }
    
    /**
     * @notice Get total protocol fees collected
     */
    function getTotalProtocolFees() external view returns (uint256) {
        return totalProtocolFees;
    }
    
    /**
     * @notice Get intent details as tuple (for MEVProtection compatibility)
     */
    function getIntentTuple(bytes32 intentId) external view returns (
        address creator,
        address token,
        uint256 amount,
        uint256 minOutput,
        uint256 expiry,
        uint8 status
    ) {
        Intent storage intent = intents[intentId];
        return (
            intent.user,
            intent.token,
            intent.amount,
            intent.amount, // minOutput = amount for now
            intent.expiryTimestamp,
            uint8(intent.status)
        );
    }
    
    /**
     * @notice Get intent creator (for backward compatibility)
     */
    function getIntentCreator(bytes32 intentId) external view returns (address) {
        return intents[intentId].user;
    }
    
    /**
     * @notice Get intent amount (for backward compatibility)
     */
    function getIntentAmount(bytes32 intentId) external view returns (uint256) {
        return intents[intentId].amount;
    }
}