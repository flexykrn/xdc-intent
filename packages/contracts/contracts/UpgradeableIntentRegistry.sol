// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title IntentProxyAdmin
 * @notice Proxy admin for upgradeable intent contracts
 * @dev Uses OpenZeppelin's TransparentUpgradeableProxy pattern
 */
contract IntentProxyAdmin is ProxyAdmin {
    constructor(address initialOwner) ProxyAdmin() {
        transferOwnership(initialOwner);
    }
}

/**
 * @title UpgradeableIntentRegistry
 * @notice Upgradeable version of IntentRegistry using proxy pattern
 * @dev All state changes must be backward compatible
 */
contract UpgradeableIntentRegistry {
    // Implementation address
    address public implementation;
    
    // Admin address
    address public admin;
    
    // ============ Storage Layout (MUST NOT CHANGE) ============
    
    // Slot 0-2: intent data
    mapping(bytes32 => address) public intentCreators;
    mapping(bytes32 => uint256) public intentAmounts;
    mapping(bytes32 => uint8) public intentStatuses;
    
    // Slot 3-5: user data
    mapping(address => bytes32[]) public userIntents;
    uint256 public totalIntents;
    uint256 public totalIntentsFulfilled;
    
    // Slot 6-8: protocol settings
    uint256 public protocolFeeBasisPoints;
    address public treasury;
    address public owner;
    
    // ============ Events ============
    
    event Upgraded(address indexed newImplementation);
    event AdminChanged(address indexed newAdmin);
    
    // ============ Modifiers ============
    
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    // ============ Initialization ============
    
    function initialize(
        address _owner,
        address _treasury,
        uint256 _feeBasisPoints
    ) external {
        require(owner == address(0), "Already initialized");
        owner = _owner;
        treasury = _treasury;
        protocolFeeBasisPoints = _feeBasisPoints;
        admin = msg.sender;
    }
    
    // ============ Upgrade Functions ============
    
    /**
     * @notice Upgrade to new implementation
     * @param newImplementation New implementation address
     */
    function upgradeTo(address newImplementation) external onlyAdmin {
        require(newImplementation != address(0), "Invalid implementation");
        require(newImplementation != implementation, "Same implementation");
        
        implementation = newImplementation;
        emit Upgraded(newImplementation);
    }
    
    /**
     * @notice Change admin address
     */
    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid admin");
        admin = newAdmin;
        emit AdminChanged(newAdmin);
    }
    
    // ============ Proxy Fallback ============
    
    fallback() external payable {
        address impl = implementation;
        require(impl != address(0), "Implementation not set");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    
    receive() external payable {}
}

/**
 * @title IntentRegistryV2
 * @notice Example V2 implementation with new features
 * @dev MUST maintain same storage layout as V1
 */
contract IntentRegistryV2 {
    // ============ V1 Storage (MUST NOT CHANGE) ============
    
    mapping(bytes32 => address) public intentCreators;
    mapping(bytes32 => uint256) public intentAmounts;
    mapping(bytes32 => uint8) public intentStatuses;
    mapping(address => bytes32[]) public userIntents;
    uint256 public totalIntents;
    uint256 public totalIntentsFulfilled;
    uint256 public protocolFeeBasisPoints;
    address public treasury;
    address public owner;
    
    // ============ V2 New Storage (Appended) ============
    
    mapping(bytes32 => uint256) public intentPriority;  // New in V2
    uint256 public maxIntentDuration;                      // New in V2
    mapping(address => bool) public whitelistedSolvers;  // New in V2
    
    // ============ Events ============
    
    event IntentCreated(bytes32 indexed intentId, address indexed creator, uint256 amount);
    event IntentFulfilled(bytes32 indexed intentId, address indexed solver);
    event SolverWhitelisted(address indexed solver);
    event SolverRemoved(address indexed solver);
    
    // ============ Modifiers ============
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }
    
    modifier onlyWhitelisted() {
        require(whitelistedSolvers[msg.sender], "Not whitelisted");
        _;
    }
    
    // ============ V2 Functions ============
    
    /**
     * @notice Set intent priority (new in V2)
     */
    function setIntentPriority(bytes32 intentId, uint256 priority) external {
        require(intentCreators[intentId] == msg.sender, "Not creator");
        intentPriority[intentId] = priority;
    }
    
    /**
     * @notice Whitelist a solver (new in V2)
     */
    function whitelistSolver(address solver) external onlyOwner {
        whitelistedSolvers[solver] = true;
        emit SolverWhitelisted(solver);
    }
    
    /**
     * @notice Remove solver from whitelist (new in V2)
     */
    function removeSolver(address solver) external onlyOwner {
        whitelistedSolvers[solver] = false;
        emit SolverRemoved(solver);
    }
    
    /**
     * @notice Set max intent duration (new in V2)
     */
    function setMaxIntentDuration(uint256 duration) external onlyOwner {
        maxIntentDuration = duration;
    }
    
    /**
     * @notice Create intent with priority (V2 enhanced)
     */
    function createIntentWithPriority(
        address token,
        uint256 amount,
        uint256 minOutput,
        uint256 expiry,
        uint256 priority
    ) external returns (bytes32) {
        require(expiry <= block.timestamp + maxIntentDuration, "Expiry too far");
        
        bytes32 intentId = keccak256(abi.encodePacked(msg.sender, block.timestamp, amount));
        
        intentCreators[intentId] = msg.sender;
        intentAmounts[intentId] = amount;
        intentStatuses[intentId] = 0;
        intentPriority[intentId] = priority;
        
        userIntents[msg.sender].push(intentId);
        totalIntents++;
        
        emit IntentCreated(intentId, msg.sender, amount);
        return intentId;
    }
    
    // V1 functions remain compatible...
}