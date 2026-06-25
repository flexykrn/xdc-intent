// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IntentRegistry.sol";
import "./Escrow.sol";

/**
 * @title CrossChainBridgeAdapter
 * @notice Adapter for cross-chain intent fulfillment using XDC's bridge
 * @dev Enables intents to be fulfilled across different chains
 */
contract CrossChainBridgeAdapter is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    
    struct CrossChainIntent {
        bytes32 intentId;
        uint256 sourceChainId;
        uint256 targetChainId;
        address sourceToken;
        address targetToken;
        uint256 amount;
        address creator;
        address targetSolver;
        bool isBridged;
        bool isFulfilled;
    }
    
    struct BridgeConfig {
        address bridgeContract;
        bool isSupported;
        uint256 minAmount;
        uint256 maxAmount;
        uint256 feeBasisPoints;
    }
    
    // ============ State Variables ============
    
    IntentRegistry public intentRegistry;
    Escrow public escrow;
    
    mapping(uint256 => BridgeConfig) public bridgeConfigs;  // chainId => config
    mapping(bytes32 => CrossChainIntent) public crossChainIntents;
    mapping(bytes32 => bool) public processedBridgeEvents;
    
    uint256 public constant XDC_MAINNET_CHAIN_ID = 50;
    uint256 public constant XDC_TESTNET_CHAIN_ID = 51;
    uint256 public constant ETHEREUM_CHAIN_ID = 1;
    uint256 public constant BSC_CHAIN_ID = 56;
    uint256 public constant POLYGON_CHAIN_ID = 137;
    
    // ============ Events ============
    
    event CrossChainIntentCreated(
        bytes32 indexed intentId,
        uint256 sourceChainId,
        uint256 targetChainId,
        uint256 amount
    );
    event BridgeInitiated(
        bytes32 indexed intentId,
        address indexed bridge,
        uint256 amount,
        uint256 fee
    );
    event BridgeCompleted(
        bytes32 indexed intentId,
        uint256 targetChainId,
        address solver
    );
    event BridgeConfigUpdated(
        uint256 indexed chainId,
        address bridgeContract,
        bool isSupported
    );
    
    // ============ Modifiers ============
    
    modifier onlySupportedChain(uint256 chainId) {
        require(bridgeConfigs[chainId].isSupported, "Chain not supported");
        _;
    }
    
    modifier validIntent(bytes32 intentId) {
        require(
            intentRegistry.getIntentStatus(intentId) == 0,
            "Intent not pending"
        );
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _intentRegistry, address _escrow) Ownable(msg.sender) {
        intentRegistry = IntentRegistry(_intentRegistry);
        escrow = Escrow(_escrow);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Configure bridge for a target chain
     */
    function configureBridge(
        uint256 chainId,
        address bridgeContract,
        bool isSupported,
        uint256 minAmount,
        uint256 maxAmount,
        uint256 feeBasisPoints
    ) external onlyOwner {
        bridgeConfigs[chainId] = BridgeConfig({
            bridgeContract: bridgeContract,
            isSupported: isSupported,
            minAmount: minAmount,
            maxAmount: maxAmount,
            feeBasisPoints: feeBasisPoints
        });
        
        emit BridgeConfigUpdated(chainId, bridgeContract, isSupported);
    }
    
    // ============ Cross-Chain Functions ============
    
    /**
     * @notice Create a cross-chain intent
     * @param intentId The intent ID
     * @param targetChainId Target chain ID
     * @param targetToken Token address on target chain
     * @param targetSolver Preferred solver on target chain (optional)
     */
    function createCrossChainIntent(
        bytes32 intentId,
        uint256 targetChainId,
        address targetToken,
        address targetSolver
    ) external onlySupportedChain(targetChainId) validIntent(intentId) {
        (address creator, address sourceToken,, uint256 amount,,,) = intentRegistry.getIntent(intentId);
        require(msg.sender == creator, "Only intent creator");
        
        BridgeConfig storage config = bridgeConfigs[targetChainId];
        require(amount >= config.minAmount, "Amount below minimum");
        require(amount <= config.maxAmount, "Amount above maximum");
        
        uint256 fee = (amount * config.feeBasisPoints) / 10000;
        
        crossChainIntents[intentId] = CrossChainIntent({
            intentId: intentId,
            sourceChainId: block.chainid,
            targetChainId: targetChainId,
            sourceToken: sourceToken,
            targetToken: targetToken,
            amount: amount,
            creator: creator,
            targetSolver: targetSolver,
            isBridged: false,
            isFulfilled: false
        });
        
        emit CrossChainIntentCreated(
            intentId,
            block.chainid,
            targetChainId,
            amount
        );
    }
    
    /**
     * @notice Initiate bridge transfer for an intent
     * @param intentId The intent ID
     */
    function initiateBridge(
        bytes32 intentId
    ) external onlySupportedChain(crossChainIntents[intentId].targetChainId) {
        CrossChainIntent storage ccIntent = crossChainIntents[intentId];
        require(!ccIntent.isBridged, "Already bridged");
        require(msg.sender == ccIntent.creator, "Only creator");
        
        BridgeConfig storage config = bridgeConfigs[ccIntent.targetChainId];
        uint256 fee = (ccIntent.amount * config.feeBasisPoints) / 10000;
        
        // In production, would interact with actual bridge contract
        // For now, mark as bridged and emit event
        ccIntent.isBridged = true;
        
        emit BridgeInitiated(
            intentId,
            config.bridgeContract,
            ccIntent.amount,
            fee
        );
    }
    
    /**
     * @notice Complete cross-chain fulfillment (called by bridge on target chain)
     * @param intentId The intent ID
     * @param solver The solver who fulfilled on target chain
     */
    function completeCrossChainFulfillment(
        bytes32 intentId,
        address solver
    ) external nonReentrant {
        CrossChainIntent storage ccIntent = crossChainIntents[intentId];
        require(ccIntent.isBridged, "Not bridged yet");
        require(!ccIntent.isFulfilled, "Already fulfilled");
        
        // In production, would verify this is called by the bridge contract
        // require(msg.sender == bridgeConfigs[ccIntent.targetChainId].bridgeContract, "Only bridge");
        
        ccIntent.isFulfilled = true;
        ccIntent.targetSolver = solver;
        
        emit BridgeCompleted(
            intentId,
            ccIntent.targetChainId,
            solver
        );
    }
    
    /**
     * @notice Get cross-chain intent details
     */
    function getCrossChainIntent(bytes32 intentId) external view returns (CrossChainIntent memory) {
        return crossChainIntents[intentId];
    }
    
    /**
     * @notice Check if chain is supported
     */
    function isChainSupported(uint256 chainId) external view returns (bool) {
        return bridgeConfigs[chainId].isSupported;
    }
    
    /**
     * @notice Get bridge fee for an amount
     */
    function getBridgeFee(
        uint256 chainId,
        uint256 amount
    ) external view returns (uint256) {
        BridgeConfig storage config = bridgeConfigs[chainId];
        return (amount * config.feeBasisPoints) / 10000;
    }
    
    /**
     * @notice Get supported chains
     */
    function getSupportedChains() external view returns (uint256[] memory) {
        uint256[] memory chains = new uint256[](5);
        chains[0] = XDC_MAINNET_CHAIN_ID;
        chains[1] = XDC_TESTNET_CHAIN_ID;
        chains[2] = ETHEREUM_CHAIN_ID;
        chains[3] = BSC_CHAIN_ID;
        chains[4] = POLYGON_CHAIN_ID;
        return chains;
    }
}