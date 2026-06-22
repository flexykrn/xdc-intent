// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

/**
 * @title SmartAccount
 * @notice ERC-4337 compatible smart account with intent support
 * @dev Users have smart wallets that can execute intents gaslessly
 */
contract SmartAccount is Initializable, UUPSUpgradeable {
    using ECDSA for bytes32;

    address public owner;
    uint256 public nonce;
    
    // Intent => isExecuted
    mapping(bytes32 => bool) public executedIntents;
    
    // Session keys => expiry
    mapping(address => uint256) public sessionKeys;
    
    event IntentExecuted(
        bytes32 indexed intentHash,
        address indexed executor,
        uint256 amount
    );
    
    event SessionKeyAdded(address indexed sessionKey, uint256 expiry);
    event SessionKeyRemoved(address indexed sessionKey);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyOwnerOrSession() {
        require(
            msg.sender == owner || sessionKeys[msg.sender] > block.timestamp,
            "Not authorized"
        );
        _;
    }
    
    function initialize(address _owner) public initializer {
        owner = _owner;
    }
    
    /**
     * @notice Execute an intent with signature
     * @param _intentHash Hash of the intent
     * @param _target Target contract
     * @param _data Call data
     * @param _signature Owner signature
     */
    function executeIntent(
        bytes32 _intentHash,
        address _target,
        bytes calldata _data,
        bytes calldata _signature
    ) external onlyOwnerOrSession {
        require(!executedIntents[_intentHash], "Already executed");
        
        // Verify signature
        bytes32 message = keccak256(abi.encodePacked(
            _intentHash,
            _target,
            _data,
            nonce
        ));
        bytes32 ethSignedMessage = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            message
        ));
        
        address signer = ECDSA.recover(ethSignedMessage, _signature);
        require(signer == owner, "Invalid signature");
        
        // Execute
        executedIntents[_intentHash] = true;
        nonce++;
        
        (bool success, ) = _target.call(_data);
        require(success, "Execution failed");
        
        emit IntentExecuted(_intentHash, msg.sender, 0);
    }
    
    /**
     * @notice Add a session key for gasless operations
     */
    function addSessionKey(address _sessionKey, uint256 _expiry) external onlyOwner {
        sessionKeys[_sessionKey] = _expiry;
        emit SessionKeyAdded(_sessionKey, _expiry);
    }
    
    /**
     * @notice Remove a session key
     */
    function removeSessionKey(address _sessionKey) external onlyOwner {
        delete sessionKeys[_sessionKey];
        emit SessionKeyRemoved(_sessionKey);
    }
    
    /**
     * @notice Receive XDC
     */
    receive() external payable {}
    
    /**
     * @notice Withdraw XDC
     */
    function withdraw(uint256 _amount) external onlyOwner {
        payable(owner).transfer(_amount);
    }
    
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}

/**
 * @title SmartAccountFactory
 * @notice Factory for creating smart accounts
 */
contract SmartAccountFactory {
    address public implementation;
    mapping(address => address) public userAccounts;
    
    event AccountCreated(address indexed user, address indexed account);
    
    constructor(address _implementation) {
        implementation = _implementation;
    }
    
    /**
     * @notice Create a smart account for a user
     */
    function createAccount(address _owner) external returns (address) {
        require(userAccounts[_owner] == address(0), "Account exists");
        
        // Create proxy (simplified - in production use ERC-1167 minimal proxy)
        SmartAccount account = new SmartAccount();
        account.initialize(_owner);
        
        userAccounts[_owner] = address(account);
        emit AccountCreated(_owner, address(account));
        
        return address(account);
    }
    
    /**
     * @notice Get or create account
     */
    function getOrCreateAccount(address _owner) external returns (address) {
        if (userAccounts[_owner] == address(0)) {
            return this.createAccount(_owner);
        }
        return userAccounts[_owner];
    }
    
    /**
     * @notice Get account for user
     */
    function getAccount(address _owner) external view returns (address) {
        return userAccounts[_owner];
    }
}