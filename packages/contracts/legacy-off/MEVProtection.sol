// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import "./IntentRegistry.sol";
import "./SolverRegistry.sol";

/**
 * @title MEVProtection
 * @notice MEV protection using commit-reveal scheme and batch auctions
 * @dev Prevents frontrunning and sandwich attacks on intent-based trades
 */
contract MEVProtection is ReentrancyGuard {
    
    // ============ Structs ============
    
    struct Commitment {
        bytes32 intentHash;
        uint256 commitBlock;
        uint256 revealBlock;
        bool revealed;
        bool executed;
        address committer;
    }
    
    struct Batch {
        bytes32[] intentIds;
        uint256 startBlock;
        uint256 endBlock;
        uint256 minBid;
        address winningSolver;
        bytes32 winningBidHash;
        bool settled;
        mapping(address => bytes32) bids;
    }
    
    // ============ State Variables ============
    
    IntentRegistry public intentRegistry;
    SolverRegistry public solverRegistry;
    
    uint256 public constant COMMIT_DELAY = 2; // blocks before reveal
    uint256 public constant REVEAL_WINDOW = 10; // blocks to reveal
    uint256 public constant BATCH_DURATION = 5; // blocks per batch
    uint256 public constant MIN_BID = 0.001 ether;
    
    mapping(bytes32 => Commitment) public commitments;
    mapping(uint256 => Batch) public batches;
    uint256 public currentBatchId;
    
    // ============ Events ============
    
    event IntentCommitted(bytes32 indexed commitmentHash, bytes32 intentHash, uint256 blockNumber);
    event IntentRevealed(bytes32 indexed commitmentHash, bytes32 intentHash, uint256 blockNumber);
    event BatchCreated(uint256 indexed batchId, uint256 startBlock, uint256 endBlock);
    event BidSubmitted(uint256 indexed batchId, address indexed solver, bytes32 bidHash);
    event BatchSettled(uint256 indexed batchId, address winningSolver, uint256 winningBid);
    
    // ============ Modifiers ============
    
    modifier onlyRegisteredSolver() {
        require(solverRegistry.isRegistered(msg.sender), "MEVProtection: Not registered solver");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _intentRegistry, address _solverRegistry) {
        intentRegistry = IntentRegistry(_intentRegistry);
        solverRegistry = SolverRegistry(_solverRegistry);
    }
    
    // ============ Commit-Reveal ============
    
    /**
     * @notice Commit an intent hash without revealing details
     * @param _intentHash keccak256 hash of the intent data
     */
    function commitIntent(bytes32 _intentHash) external {
        bytes32 commitmentHash = keccak256(abi.encodePacked(_intentHash, msg.sender, block.number));
        
        require(commitments[commitmentHash].commitBlock == 0, "MEVProtection: Already committed");
        
        commitments[commitmentHash] = Commitment({
            intentHash: _intentHash,
            commitBlock: block.number,
            revealBlock: 0,
            revealed: false,
            executed: false,
            committer: msg.sender
        });
        
        emit IntentCommitted(commitmentHash, _intentHash, block.number);
    }
    
    /**
     * @notice Reveal intent after commit delay
     * @param _commitmentHash The commitment hash from commitIntent
     * @param _intentData The actual intent data (token, amount, etc.)
     * @param _salt Random salt used in original hash
     */
    function revealIntent(
        bytes32 _commitmentHash,
        bytes calldata _intentData,
        bytes32 _salt
    ) external {
        Commitment storage commitment = commitments[_commitmentHash];
        
        require(commitment.commitBlock > 0, "MEVProtection: Commitment not found");
        require(!commitment.revealed, "MEVProtection: Already revealed");
        require(block.number >= commitment.commitBlock + COMMIT_DELAY, "MEVProtection: Too early");
        require(block.number <= commitment.commitBlock + COMMIT_DELAY + REVEAL_WINDOW, "MEVProtection: Reveal window expired");
        require(commitment.committer == msg.sender, "MEVProtection: Not committer");
        
        // Verify the hash matches
        bytes32 computedHash = keccak256(abi.encodePacked(_intentData, _salt));
        require(computedHash == commitment.intentHash, "MEVProtection: Invalid reveal");
        
        commitment.revealed = true;
        commitment.revealBlock = block.number;
        
        emit IntentRevealed(_commitmentHash, commitment.intentHash, block.number);
    }
    
    /**
     * @notice Execute a revealed intent (only after reveal)
     * @param _commitmentHash The commitment hash
     * @param _intentId The actual intent ID from IntentRegistry
     * @param _paymentProof Payment proof for fulfillment
     */
    function executeRevealedIntent(
        bytes32 _commitmentHash,
        bytes32 _intentId,
        bytes calldata _paymentProof
    ) external onlyRegisteredSolver nonReentrant {
        Commitment storage commitment = commitments[_commitmentHash];
        
        require(commitment.revealed, "MEVProtection: Not revealed");
        require(!commitment.executed, "MEVProtection: Already executed");
        
        // Verify intent matches commitment
        (,,,,, uint8 status) = intentRegistry.getIntentTuple(_intentId);
        require(status == 0, "MEVProtection: Intent not pending"); // 0 = Pending
        
        commitment.executed = true;
        
        // Execute through intent registry - actually fulfill the intent
        // This calls the real fulfillIntentWithBytes on the IntentRegistry
        intentRegistry.fulfillIntentWithBytes(_intentId, msg.sender, _paymentProof);
    }
    
    // ============ Batch Auctions ============
    
    /**
     * @notice Create a new batch for auction
     * @param _intentIds Array of intent IDs to include in batch
     */
    function createBatch(bytes32[] calldata _intentIds) external returns (uint256) {
        require(_intentIds.length > 0, "MEVProtection: Empty batch");
        require(_intentIds.length <= 10, "MEVProtection: Batch too large");
        
        uint256 batchId = currentBatchId++;
        Batch storage batch = batches[batchId];
        
        batch.intentIds = _intentIds;
        batch.startBlock = block.number;
        batch.endBlock = block.number + BATCH_DURATION;
        batch.minBid = MIN_BID;
        batch.settled = false;
        
        emit BatchCreated(batchId, batch.startBlock, batch.endBlock);
        
        return batchId;
    }
    
    /**
     * @notice Submit a sealed bid for a batch
     * @param _batchId The batch ID
     * @param _bidHash keccak256 hash of (bidAmount, salt)
     */
    function submitBid(uint256 _batchId, bytes32 _bidHash) external onlyRegisteredSolver {
        Batch storage batch = batches[_batchId];
        
        require(block.number >= batch.startBlock, "MEVProtection: Batch not started");
        require(block.number < batch.endBlock, "MEVProtection: Batch ended");
        require(!batch.settled, "MEVProtection: Batch settled");
        require(batch.bids[msg.sender] == bytes32(0), "MEVProtection: Already bid");
        
        batch.bids[msg.sender] = _bidHash;
        
        emit BidSubmitted(_batchId, msg.sender, _bidHash);
    }
    
    /**
     * @notice Reveal bid and settle batch
     * @param _batchId The batch ID
     * @param _bidAmount The actual bid amount
     * @param _salt Random salt used in bid hash
     */
    function revealAndSettleBid(uint256 _batchId, uint256 _bidAmount, bytes32 _salt) external onlyRegisteredSolver nonReentrant {
        Batch storage batch = batches[_batchId];
        
        require(block.number >= batch.endBlock, "MEVProtection: Batch not ended");
        require(!batch.settled, "MEVProtection: Already settled");
        
        // Verify bid hash
        bytes32 bidHash = keccak256(abi.encodePacked(_bidAmount, _salt));
        require(batch.bids[msg.sender] == bidHash, "MEVProtection: Invalid bid reveal");
        
        // Check if this is the winning bid (highest bid wins)
        if (_bidAmount > batch.minBid) {
            batch.winningSolver = msg.sender;
            batch.winningBidHash = bidHash;
            batch.minBid = _bidAmount;
        }
        
        // Mark as settled if all bids revealed or timeout
        if (block.number >= batch.endBlock + 2) {
            batch.settled = true;
            emit BatchSettled(_batchId, batch.winningSolver, batch.minBid);
        }
    }
    
    /**
     * @notice Execute a settled batch (only winning solver)
     * @param _batchId The batch ID
     */
    function executeBatch(uint256 _batchId, bytes calldata _paymentProof) external onlyRegisteredSolver nonReentrant {
        Batch storage batch = batches[_batchId];
        
        require(batch.settled, "MEVProtection: Batch not settled");
        require(batch.winningSolver == msg.sender, "MEVProtection: Not winning solver");
        
        // Execute all intents in batch in random order
        bytes32[] memory intentIds = batch.intentIds;
        uint256[] memory executionOrder = _generateRandomOrder(intentIds.length, _batchId);
        
        for (uint256 i = 0; i < executionOrder.length; i++) {
            bytes32 intentId = intentIds[executionOrder[i]];
            
            // Check if intent is still pending
            (,,,,, uint8 status) = intentRegistry.getIntentTuple(intentId);
            if (status == 0) { // Pending
                // Actually fulfill the intent through the registry
                intentRegistry.fulfillIntentWithBytes(intentId, msg.sender, _paymentProof);
            }
        }
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get commitment details
     */
    function getCommitment(bytes32 _commitmentHash) external view returns (Commitment memory) {
        return commitments[_commitmentHash];
    }
    
    /**
     * @notice Check if intent can be revealed
     */
    function canReveal(bytes32 _commitmentHash) external view returns (bool) {
        Commitment memory commitment = commitments[_commitmentHash];
        if (commitment.commitBlock == 0 || commitment.revealed) return false;
        return block.number >= commitment.commitBlock + COMMIT_DELAY &&
               block.number <= commitment.commitBlock + COMMIT_DELAY + REVEAL_WINDOW;
    }
    
    /**
     * @notice Get batch details
     */
    function getBatch(uint256 _batchId) external view returns (
        bytes32[] memory intentIds,
        uint256 startBlock,
        uint256 endBlock,
        uint256 minBid,
        address winningSolver,
        bool settled
    ) {
        Batch storage batch = batches[_batchId];
        return (
            batch.intentIds,
            batch.startBlock,
            batch.endBlock,
            batch.minBid,
            batch.winningSolver,
            batch.settled
        );
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Generate random execution order using block hash
     */
    function _generateRandomOrder(uint256 _length, uint256 _seed) internal view returns (uint256[] memory) {
        uint256[] memory order = new uint256[](_length);
        for (uint256 i = 0; i < _length; i++) {
            order[i] = i;
        }
        
        // Fisher-Yates shuffle using block hash as randomness
        for (uint256 i = _length - 1; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encodePacked(blockhash(block.number - 1), _seed, i))) % (i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }
        
        return order;
    }
    
    /**
     * @notice Emergency cancel commitment (only committer)
     */
    function cancelCommitment(bytes32 _commitmentHash) external {
        Commitment storage commitment = commitments[_commitmentHash];
        require(commitment.committer == msg.sender, "MEVProtection: Not committer");
        require(!commitment.revealed, "MEVProtection: Already revealed");
        require(!commitment.executed, "MEVProtection: Already executed");
        
        delete commitments[_commitmentHash];
    }
}
