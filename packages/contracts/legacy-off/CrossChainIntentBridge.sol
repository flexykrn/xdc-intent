// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "./IntentRegistry.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CrossChainIntentBridge
 * @notice Enables cross-chain intent execution via Wanchain bridge
 * @dev Locks tokens on source chain, releases on destination
 */
contract CrossChainIntentBridge is ReentrancyGuard, Ownable {
    
    IntentRegistry public intentRegistry;
    
    // Chain ID => Bridge Contract
    mapping(uint256 => address) public bridgeContracts;
    
    // Intent ID => CrossChainStatus
    mapping(bytes32 => CrossChainStatus) public crossChainIntents;
    
    // Supported chains
    mapping(uint256 => bool) public supportedChains;
    
    struct CrossChainStatus {
        bytes32 intentId;
        address creator;
        address token;
        uint256 amount;
        uint256 targetChain;
        address targetToken;
        uint256 targetAmount;
        bool locked;
        bool released;
        bool completed;
    }
    
    event CrossChainIntentCreated(
        bytes32 indexed intentId,
        address indexed creator,
        uint256 sourceChain,
        uint256 targetChain,
        uint256 amount
    );
    
    event TokensLocked(
        bytes32 indexed intentId,
        address indexed token,
        uint256 amount
    );
    
    event TokensReleased(
        bytes32 indexed intentId,
        address indexed token,
        uint256 amount
    );
    
    event CrossChainCompleted(
        bytes32 indexed intentId,
        bool success
    );
    
    modifier onlyBridge(uint256 _chainId) {
        require(msg.sender == bridgeContracts[_chainId], "Not bridge");
        _;
    }
    
    constructor(address _intentRegistry) {
        intentRegistry = IntentRegistry(_intentRegistry);
    }
    
    /**
     * @notice Add a supported chain - only owner can add chains
     */
    function addSupportedChain(uint256 _chainId, address _bridgeContract) external onlyOwner {
        supportedChains[_chainId] = true;
        bridgeContracts[_chainId] = _bridgeContract;
    }
    
    /**
     * @notice Remove a supported chain - only owner can remove chains
     */
    function removeSupportedChain(uint256 _chainId) external onlyOwner {
        supportedChains[_chainId] = false;
        bridgeContracts[_chainId] = address(0);
    }
    
    /**
     * @notice Create a cross-chain intent
     * @param _token Source token
     * @param _amount Amount to trade
     * @param _targetChain Destination chain ID
     * @param _targetToken Token on destination chain
     * @param _targetAmount Minimum amount on destination
     * @param _expiry Expiry timestamp
     */
    function createCrossChainIntent(
        address _token,
        uint256 _amount,
        uint256 _targetChain,
        address _targetToken,
        uint256 _targetAmount,
        uint256 _expiry
    ) external nonReentrant returns (bytes32) {
        require(supportedChains[_targetChain], "Chain not supported");
        require(_amount > 0, "Invalid amount");
        
        bytes32 intentId = keccak256(abi.encodePacked(
            msg.sender,
            _token,
            _amount,
            _targetChain,
            block.timestamp
        ));
        
        // Lock tokens in this contract
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        
        // Store cross-chain status
        crossChainIntents[intentId] = CrossChainStatus({
            intentId: intentId,
            creator: msg.sender,
            token: _token,
            amount: _amount,
            targetChain: _targetChain,
            targetToken: _targetToken,
            targetAmount: _targetAmount,
            locked: true,
            released: false,
            completed: false
        });
        
        // Create intent in registry
        intentRegistry.createIntent(intentId, _token, _amount, _expiry);
        
        emit CrossChainIntentCreated(
            intentId,
            msg.sender,
            block.chainid,
            _targetChain,
            _amount
        );
        
        emit TokensLocked(intentId, _token, _amount);
        
        return intentId;
    }
    
    /**
     * @notice Release tokens on destination chain (called by bridge)
     */
    function releaseTokens(
        bytes32 _intentId,
        address _recipient,
        uint256 _amount
    ) external onlyBridge(crossChainIntents[_intentId].targetChain) nonReentrant {
        CrossChainStatus storage status = crossChainIntents[_intentId];
        require(status.locked, "Not locked");
        require(!status.released, "Already released");
        
        status.released = true;
        
        // Transfer tokens to recipient
        IERC20(status.token).transfer(_recipient, _amount);
        
        emit TokensReleased(_intentId, status.token, _amount);
    }
    
    /**
     * @notice Complete cross-chain intent (called by bridge)
     */
    function completeCrossChain(
        bytes32 _intentId,
        bool _success
    ) external onlyBridge(crossChainIntents[_intentId].targetChain) nonReentrant {
        CrossChainStatus storage status = crossChainIntents[_intentId];
        require(status.locked, "Not locked");
        require(!status.completed, "Already completed");
        
        status.completed = true;
        
        if (!_success) {
            // Refund tokens to creator
            IERC20(status.token).transfer(status.creator, status.amount);
        }
        
        emit CrossChainCompleted(_intentId, _success);
    }
    
    /**
     * @notice Get cross-chain status
     */
    function getCrossChainStatus(bytes32 _intentId) external view returns (CrossChainStatus memory) {
        return crossChainIntents[_intentId];
    }
    
    /**
     * @notice Check if chain is supported
     */
    function isChainSupported(uint256 _chainId) external view returns (bool) {
        return supportedChains[_chainId];
    }
}
