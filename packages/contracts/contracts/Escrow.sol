// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title Escrow
 * @notice Production-grade token vault for intent-based trading
 * @dev Holds user funds per-intent. Only IntentRegistry can release or refund.
 *      Includes emergency controls, token allowlist, and comprehensive events.
 */
contract Escrow is ReentrancyGuard, Ownable, Pausable {
    using SafeERC20 for IERC20;
    using Address for address;

    // ============ State Variables ============
    
    /// @notice The IntentRegistry contract address
    address public registry;
    
    /// @notice Treasury address for protocol fees
    address public treasury;
    
    /// @notice Protocol fee in basis points (100 = 1%)
    uint256 public protocolFeeBps;
    
    /// @notice Per-intent balance tracking: token => user => intentId => amount
    mapping(address => mapping(address => mapping(bytes32 => uint256))) public balances;
    
    /// @notice Mapping from intentId to original user who locked
    mapping(bytes32 => address) public intentToUser;
    
    /// @notice Supported token allowlist
    mapping(address => bool) public supportedTokens;
    
    /// @notice Total balance per token for emergency tracking
    mapping(address => uint256) public totalTokenBalance;
    
    /// @notice Emergency withdrawal destination (multisig)
    address public emergencyRecipient;
    
    /// @notice Emergency withdrawal timelock
    uint256 public constant EMERGENCY_TIMELOCK = 48 hours;
    
    /// @notice Pending emergency withdrawal
    struct PendingEmergencyWithdrawal {
        address token;
        uint256 amount;
        address recipient;
        uint256 timestamp;
        bool executed;
    }
    
    PendingEmergencyWithdrawal public pendingEmergencyWithdrawal;

    // ============ Events ============
    
    event TokensLocked(
        address indexed token,
        address indexed user,
        bytes32 indexed intentId,
        uint256 amount
    );
    
    event TokensReleased(
        address indexed token,
        address indexed recipient,
        bytes32 indexed intentId,
        uint256 amount,
        uint256 protocolFee
    );
    
    event TokensRefunded(
        address indexed token,
        address indexed user,
        bytes32 indexed intentId,
        uint256 amount
    );
    
    event SupportedTokenAdded(address indexed token);
    event SupportedTokenRemoved(address indexed token);
    event RegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event EmergencyWithdrawalProposed(
        address indexed token,
        uint256 amount,
        address recipient,
        uint256 executeAfter
    );
    event EmergencyWithdrawalExecuted(
        address indexed token,
        uint256 amount,
        address recipient
    );
    event EmergencyWithdrawalCancelled();

    // ============ Modifiers ============
    
    modifier onlyRegistry() {
        require(msg.sender == registry, "Escrow: caller is not registry");
        _;
    }
    
    modifier validToken(address token) {
        require(supportedTokens[token], "Escrow: token not supported");
        _;
    }
    
    modifier nonZeroAddress(address addr) {
        require(addr != address(0), "Escrow: zero address");
        _;
    }

    // ============ Constructor ============
    
    constructor(
        address _treasury,
        uint256 _protocolFeeBps,
        address _emergencyRecipient
    ) Ownable() nonZeroAddress(_treasury) nonZeroAddress(_emergencyRecipient) {
        require(_protocolFeeBps <= 1000, "Escrow: fee too high"); // Max 10%
        treasury = _treasury;
        protocolFeeBps = _protocolFeeBps;
        emergencyRecipient = _emergencyRecipient;
    }

    // ============ External Functions ============
    
    /**
     * @notice Lock tokens for a specific intent
     * @param token The ERC20 token address
     * @param user The user whose tokens are being locked
     * @param amount The amount to lock
     * @param intentId The unique intent identifier
     */
    function lockTokens(
        address token,
        address user,
        uint256 amount,
        bytes32 intentId
    ) external onlyRegistry nonReentrant whenNotPaused validToken(token) nonZeroAddress(user) {
        require(amount > 0, "Escrow: zero amount");
        require(intentId != bytes32(0), "Escrow: zero intentId");
        require(balances[token][user][intentId] == 0, "Escrow: intent already exists");
        
        // Transfer tokens from user to escrow
        IERC20(token).safeTransferFrom(user, address(this), amount);
        
        // Update balances
        balances[token][user][intentId] = amount;
        totalTokenBalance[token] += amount;
        
        // Track intent owner
        intentToUser[intentId] = user;
        
        emit TokensLocked(token, user, intentId, amount);
    }
    
    /**
     * @notice Release tokens to solver after fulfillment
     * @param token The ERC20 token address
     * @param recipient The solver receiving the tokens
     * @param amount The amount to release
     * @param intentId The intent being fulfilled
     */
    function releaseTokens(
        address token,
        address recipient,
        uint256 amount,
        bytes32 intentId
    ) external onlyRegistry nonReentrant whenNotPaused validToken(token) nonZeroAddress(recipient) {
        require(amount > 0, "Escrow: zero amount");
        
        require(intentToUser[intentId] != address(0), "Escrow: intent not found");
        address originalUser = intentToUser[intentId];
        
        require(balances[token][originalUser][intentId] >= amount, "Escrow: insufficient balance");
        
        uint256 protocolFee = (amount * protocolFeeBps) / 10000;
        uint256 solverAmount = amount - protocolFee;
        
        // Update balances before external calls (checks-effects-interactions)
        balances[token][originalUser][intentId] -= amount;
        totalTokenBalance[token] -= amount;
        
        // Clear intent tracking
        delete intentToUser[intentId];
        
        // Transfer protocol fee to treasury
        if (protocolFee > 0) {
            IERC20(token).safeTransfer(treasury, protocolFee);
        }
        
        // Transfer remaining to solver
        IERC20(token).safeTransfer(recipient, solverAmount);
        
        emit TokensReleased(token, recipient, intentId, solverAmount, protocolFee);
    }
    
    /**
     * @notice Refund tokens to user after expiry or cancellation
     * @param token The ERC20 token address
     * @param user The user to refund
     * @param amount The amount to refund
     * @param intentId The intent being refunded
     */
    function refundTokens(
        address token,
        address user,
        uint256 amount,
        bytes32 intentId
    ) external onlyRegistry nonReentrant whenNotPaused validToken(token) nonZeroAddress(user) {
        require(amount > 0, "Escrow: zero amount");
        require(balances[token][user][intentId] >= amount, "Escrow: insufficient balance");
        
        // Update balances before external calls
        balances[token][user][intentId] -= amount;
        totalTokenBalance[token] -= amount;
        
        // Clear intent tracking
        delete intentToUser[intentId];
        
        // Transfer tokens back to user
        IERC20(token).safeTransfer(user, amount);
        
        emit TokensRefunded(token, user, intentId, amount);
    }
    
    /**
     * @notice Add a token to the supported list
     * @param token The ERC20 token address to add
     */
    function addSupportedToken(address token) external onlyOwner nonZeroAddress(token) {
        require(!supportedTokens[token], "Escrow: token already supported");
        supportedTokens[token] = true;
        emit SupportedTokenAdded(token);
    }
    
    /**
     * @notice Remove a token from the supported list
     * @param token The ERC20 token address to remove
     */
    function removeSupportedToken(address token) external onlyOwner {
        require(supportedTokens[token], "Escrow: token not supported");
        supportedTokens[token] = false;
        emit SupportedTokenRemoved(token);
    }
    
    /**
     * @notice Set the registry address
     * @param _registry The new registry address
     */
    function setRegistry(address _registry) external onlyOwner nonZeroAddress(_registry) {
        address oldRegistry = registry;
        registry = _registry;
        emit RegistryUpdated(oldRegistry, _registry);
    }
    
    /**
     * @notice Set the treasury address
     * @param _treasury The new treasury address
     */
    function setTreasury(address _treasury) external onlyOwner nonZeroAddress(_treasury) {
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }
    
    /**
     * @notice Set the protocol fee
     * @param _protocolFeeBps The new fee in basis points
     */
    function setProtocolFee(uint256 _protocolFeeBps) external onlyOwner {
        require(_protocolFeeBps <= 1000, "Escrow: fee too high");
        uint256 oldFee = protocolFeeBps;
        protocolFeeBps = _protocolFeeBps;
        emit ProtocolFeeUpdated(oldFee, _protocolFeeBps);
    }
    
    /**
     * @notice Propose an emergency withdrawal (requires timelock)
     * @param token The token to withdraw
     * @param amount The amount to withdraw
     */
    function proposeEmergencyWithdrawal(
        address token,
        uint256 amount
    ) external onlyOwner {
        require(pendingEmergencyWithdrawal.token == address(0), "Escrow: pending withdrawal exists");
        require(amount <= totalTokenBalance[token], "Escrow: insufficient balance");
        
        pendingEmergencyWithdrawal = PendingEmergencyWithdrawal({
            token: token,
            amount: amount,
            recipient: emergencyRecipient,
            timestamp: block.timestamp + EMERGENCY_TIMELOCK,
            executed: false
        });
        
        emit EmergencyWithdrawalProposed(token, amount, emergencyRecipient, block.timestamp + EMERGENCY_TIMELOCK);
    }
    
    /**
     * @notice Execute a pending emergency withdrawal after timelock
     */
    function executeEmergencyWithdrawal() external onlyOwner {
        PendingEmergencyWithdrawal storage withdrawal = pendingEmergencyWithdrawal;
        require(!withdrawal.executed, "Escrow: already executed");
        require(block.timestamp >= withdrawal.timestamp, "Escrow: timelock not expired");
        require(withdrawal.amount <= totalTokenBalance[withdrawal.token], "Escrow: insufficient balance");
        
        withdrawal.executed = true;
        totalTokenBalance[withdrawal.token] -= withdrawal.amount;
        
        IERC20(withdrawal.token).safeTransfer(withdrawal.recipient, withdrawal.amount);
        
        emit EmergencyWithdrawalExecuted(withdrawal.token, withdrawal.amount, withdrawal.recipient);
    }
    
    /**
     * @notice Cancel a pending emergency withdrawal
     */
    function cancelEmergencyWithdrawal() external onlyOwner {
        require(!pendingEmergencyWithdrawal.executed, "Escrow: already executed");
        delete pendingEmergencyWithdrawal;
        emit EmergencyWithdrawalCancelled();
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

    // ============ View Functions ============
    
    /**
     * @notice Get the locked balance for a specific intent
     */
    function getBalance(
        address token,
        address user,
        bytes32 intentId
    ) external view returns (uint256) {
        return balances[token][user][intentId];
    }
    
    /**
     * @notice Get the total balance for a token
     */
    function getTotalBalance(address token) external view returns (uint256) {
        return totalTokenBalance[token];
    }
    
    /**
     * @notice Check if a token is supported
     */
    function isTokenSupported(address token) external view returns (bool) {
        return supportedTokens[token];
    }
    
    /**
     * @notice Calculate the protocol fee for an amount
     */
    function calculateProtocolFee(uint256 amount) external view returns (uint256) {
        return (amount * protocolFeeBps) / 10000;
    }
}
