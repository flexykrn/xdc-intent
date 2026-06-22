// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./GaslessIntentExecutor.sol";

/**
 * @title RelayerNetwork
 * @notice Decentralized relayer network for gasless transactions
 * @dev Relayers compete to execute transactions, earn fees
 */
contract RelayerNetwork is ReentrancyGuard {
    
    GaslessIntentExecutor public executor;
    
    // Relayer => stake
    struct Relayer {
        uint256 stake;
        uint256 totalExecuted;
        uint256 totalFeesEarned;
        uint256 reputation;
        bool isActive;
        uint256 lastActive;
    }
    
    mapping(address => Relayer) public relayers;
    address[] public activeRelayerList;
    
    // Minimum stake to become relayer
    uint256 public minStake = 1000 * 1e18; // 1000 tokens
    
    // Fee settings
    uint256 public baseFee = 0.001 ether; // 0.1%
    uint256 public maxFee = 0.01 ether;   // 1%
    
    // Relayer rotation
    uint256 public currentRelayerIndex;
    uint256 public constant ROTATION_INTERVAL = 100; // blocks
    
    event RelayerRegistered(address indexed relayer, uint256 stake);
    event RelayerUnregistered(address indexed relayer, uint256 stakeReturned);
    event TransactionRelayed(
        address indexed relayer,
        bytes32 indexed intentHash,
        uint256 fee
    );
    event FeeUpdated(uint256 newFee);
    
    constructor(address _executor) {
        executor = GaslessIntentExecutor(_executor);
    }
    
    /**
     * @notice Register as a relayer with stake
     */
    function registerRelayer(uint256 _stake) external nonReentrant {
        require(_stake >= minStake, "Insufficient stake");
        require(!relayers[msg.sender].isActive, "Already registered");
        
        // Transfer stake
        // In production, use specific staking token
        
        relayers[msg.sender] = Relayer({
            stake: _stake,
            totalExecuted: 0,
            totalFeesEarned: 0,
            reputation: 100, // Base reputation
            isActive: true,
            lastActive: block.number
        });
        
        activeRelayerList.push(msg.sender);
        
        // Authorize in executor
        executor.addRelayer(msg.sender);
        
        emit RelayerRegistered(msg.sender, _stake);
    }
    
    /**
     * @notice Unregister and withdraw stake
     */
    function unregisterRelayer() external nonReentrant {
        Relayer storage relayer = relayers[msg.sender];
        require(relayer.isActive, "Not registered");
        require(
            block.number >= relayer.lastActive + ROTATION_INTERVAL,
            "Too recent"
        );
        
        relayer.isActive = false;
        
        // Remove from active list
        for (uint256 i = 0; i < activeRelayerList.length; i++) {
            if (activeRelayerList[i] == msg.sender) {
                activeRelayerList[i] = activeRelayerList[activeRelayerList.length - 1];
                activeRelayerList.pop();
                break;
            }
        }
        
        // Return stake (simplified)
        // In production, handle stake return properly
        
        executor.removeRelayer(msg.sender);
        
        emit RelayerUnregistered(msg.sender, relayer.stake);
    }
    
    /**
     * @notice Get next relayer in rotation
     */
    function getNextRelayer() public view returns (address) {
        if (activeRelayerList.length == 0) return address(0);
        
        return activeRelayerList[currentRelayerIndex % activeRelayerList.length];
    }
    
    /**
     * @notice Rotate to next relayer
     */
    function rotateRelayer() external {
        if (activeRelayerList.length > 0) {
            currentRelayerIndex = (currentRelayerIndex + 1) % activeRelayerList.length;
        }
    }
    
    /**
     * @notice Execute transaction as relayer
     */
    function relayTransaction(
        address _creator,
        address _token,
        uint256 _amount,
        uint256 _minOutput,
        uint256 _expiry,
        uint256 _nonce,
        bytes calldata _signature
    ) external nonReentrant {
        require(relayers[msg.sender].isActive, "Not active relayer");
        
        // Calculate fee
        uint256 fee = _calculateFee(_amount);
        
        // Execute via gasless executor
        executor.executeGaslessIntent(
            _creator,
            _token,
            _amount,
            _minOutput,
            _expiry,
            _nonce,
            _signature,
            fee
        );
        
        // Update relayer stats
        Relayer storage relayer = relayers[msg.sender];
        relayer.totalExecuted++;
        relayer.totalFeesEarned += fee;
        relayer.lastActive = block.number;
        
        // Increase reputation for good execution
        if (relayer.reputation < 1000) {
            relayer.reputation += 1;
        }
        
        emit TransactionRelayed(msg.sender, keccak256(_signature), fee);
    }
    
    /**
     * @notice Calculate fee for amount
     */
    function _calculateFee(uint256 _amount) internal view returns (uint256) {
        uint256 fee = _amount * baseFee / 1e18;
        if (fee > maxFee) fee = maxFee;
        return fee;
    }
    
    /**
     * @notice Get relayer info
     */
    function getRelayerInfo(address _relayer) external view returns (Relayer memory) {
        return relayers[_relayer];
    }
    
    /**
     * @notice Get active relayer count
     */
    function getActiveRelayerCount() external view returns (uint256) {
        return activeRelayerList.length;
    }
    
    /**
     * @notice Get all active relayers
     */
    function getActiveRelayers() external view returns (address[] memory) {
        return activeRelayerList;
    }
    
    /**
     * @notice Update fee settings
     */
    function updateFees(uint256 _baseFee, uint256 _maxFee) external {
        baseFee = _baseFee;
        maxFee = _maxFee;
        emit FeeUpdated(_baseFee);
    }
}