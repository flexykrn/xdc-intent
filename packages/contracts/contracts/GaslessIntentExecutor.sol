// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IntentRegistry.sol";
import "./Escrow.sol";

/**
 * @title GaslessIntentExecutor
 * @notice Enables gasless intent execution via EIP-712 signatures
 * @dev Users sign intents off-chain, relayers execute on-chain
 */
contract GaslessIntentExecutor is EIP712, ReentrancyGuard {
    using ECDSA for bytes32;

    IntentRegistry public intentRegistry;
    Escrow public escrow;
    
    // Relayer => isAuthorized
    mapping(address => bool) public authorizedRelayers;
    
    // Intent hash => isExecuted
    mapping(bytes32 => bool) public executedIntents;
    
    // Nonce tracking for replay protection
    mapping(address => uint256) public nonces;
    
    // EIP-712 TypeHash for Intent
    bytes32 private constant INTENT_TYPEHASH = keccak256(
        "Intent(address creator,address token,uint256 amount,uint256 minOutput,uint256 expiry,uint256 nonce)"
    );
    
    event IntentExecutedGasless(
        bytes32 indexed intentHash,
        address indexed creator,
        address indexed relayer,
        uint256 amount
    );
    
    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);
    
    modifier onlyRelayer() {
        require(authorizedRelayers[msg.sender], "Not authorized relayer");
        _;
    }
    
    constructor(address _intentRegistry, address _escrow) 
        EIP712("XDCIntent", "1") 
    {
        intentRegistry = IntentRegistry(_intentRegistry);
        escrow = Escrow(_escrow);
    }
    
    /**
     * @notice Add an authorized relayer
     */
    function addRelayer(address _relayer) external {
        // In production, use governance
        authorizedRelayers[_relayer] = true;
        emit RelayerAdded(_relayer);
    }
    
    /**
     * @notice Remove a relayer
     */
    function removeRelayer(address _relayer) external {
        authorizedRelayers[_relayer] = false;
        emit RelayerRemoved(_relayer);
    }
    
    /**
     * @notice Execute a gasless intent using EIP-712 signature
     * @param _creator Intent creator address
     * @param _token Token to trade
     * @param _amount Amount to trade
     * @param _minOutput Minimum output
     * @param _expiry Expiry timestamp
     * @param _nonce User nonce
     * @param _signature EIP-712 signature
     * @param _relayerFee Fee for relayer (paid from intent amount)
     */
    function executeGaslessIntent(
        address _creator,
        address _token,
        uint256 _amount,
        uint256 _minOutput,
        uint256 _expiry,
        uint256 _nonce,
        bytes calldata _signature,
        uint256 _relayerFee
    ) external onlyRelayer nonReentrant {
        // Verify nonce
        require(_nonce == nonces[_creator], "Invalid nonce");
        
        // Build intent hash
        bytes32 intentHash = keccak256(abi.encode(
            INTENT_TYPEHASH,
            _creator,
            _token,
            _amount,
            _minOutput,
            _expiry,
            _nonce
        ));
        
        // Verify not already executed
        require(!executedIntents[intentHash], "Intent already executed");
        
        // Verify signature
        bytes32 digest = _hashTypedDataV4(intentHash);
        address signer = ECDSA.recover(digest, _signature);
        require(signer == _creator, "Invalid signature");
        
        // Mark as executed
        executedIntents[intentHash] = true;
        nonces[_creator]++;
        
        // Generate intent ID
        bytes32 intentId = keccak256(abi.encodePacked(
            _creator, _token, _amount, block.timestamp
        ));
        
        // Approve tokens from creator (requires prior approval)
        require(
            IERC20(_token).allowance(_creator, address(this)) >= _amount,
            "Insufficient allowance"
        );
        
        // Transfer tokens from creator to escrow
        IERC20(_token).transferFrom(_creator, address(escrow), _amount);
        
        // Create intent in registry
        intentRegistry.createIntent(
            intentId,
            _token,
            _amount,
            _expiry
        );
        
        // Pay relayer fee
        if (_relayerFee > 0) {
            IERC20(_token).transfer(msg.sender, _relayerFee);
        }
        
        emit IntentExecutedGasless(intentHash, _creator, msg.sender, _amount);
    }
    
    /**
     * @notice Get the EIP-712 domain separator
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
    
    /**
     * @notice Get nonce for a user
     */
    function getNonce(address _user) external view returns (uint256) {
        return nonces[_user];
    }
    
    /**
     * @notice Check if intent was executed
     */
    function isExecuted(bytes32 _intentHash) external view returns (bool) {
        return executedIntents[_intentHash];
    }
}

