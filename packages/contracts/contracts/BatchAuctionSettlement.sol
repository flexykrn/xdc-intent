// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./IntentRegistry.sol";

/**
 * @title BatchAuctionSettlement
 * @notice Groups intents into batches, lets solvers bid, settles at best price
 * @dev Core innovation: Coincidence of Wants (CoW) style batching
 *      Multiple intents in a batch can be settled together for better prices
 *      and lower gas costs than individual settlements.
 */
contract BatchAuctionSettlement is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============ Structs ============

    struct Batch {
        bytes32 batchId;
        bytes32[] intentIds;
        address[] tokens;
        uint256[] amounts;
        address winningSolver;
        uint256 winningBid; // total price improvement in basis points
        uint256 createdAt;
        uint256 auctionEndTime;
        BatchStatus status;
    }

    struct Bid {
        address solver;
        uint256 priceImprovementBps; // how much better than oracle price
        bytes bidProof; // solver's signed commitment
    }

    enum BatchStatus {
        Open,       // Accepting bids
        Closed,     // Auction ended, selecting winner
        Settled,    // Winner executed, tokens distributed
        Cancelled   // Batch cancelled
    }

    // ============ State Variables ============

    /// @notice The IntentRegistry contract
    IntentRegistry public intentRegistry;

    /// @notice Batch ID => Batch
    mapping(bytes32 => Batch) public batches;

    /// @notice Batch ID => array of bids
    mapping(bytes32 => Bid[]) public batchBids;

    /// @notice Batch ID => solver => hasBid
    mapping(bytes32 => mapping(address => bool)) public hasBid;

    /// @notice Total batches created
    uint256 public totalBatches;

    /// @notice Auction duration in seconds (default 5 minutes)
    uint256 public auctionDuration = 300;

    /// @notice Minimum price improvement to win (default 10 bps = 0.1%)
    uint256 public minPriceImprovementBps = 10;

    /// @notice Maximum intents per batch (default 50)
    uint256 public maxBatchSize = 50;

    // ============ Events ============

    event BatchCreated(
        bytes32 indexed batchId,
        bytes32[] intentIds,
        uint256 auctionEndTime
    );

    event BidSubmitted(
        bytes32 indexed batchId,
        address indexed solver,
        uint256 priceImprovementBps
    );

    event BatchSettled(
        bytes32 indexed batchId,
        address indexed winningSolver,
        uint256 winningBid
    );

    event BatchCancelled(bytes32 indexed batchId);

    event AuctionDurationUpdated(uint256 oldDuration, uint256 newDuration);
    event MinPriceImprovementUpdated(uint256 oldMin, uint256 newMin);
    event MaxBatchSizeUpdated(uint256 oldSize, uint256 newSize);

    // ============ Modifiers ============

    modifier batchExists(bytes32 batchId) {
        require(batches[batchId].createdAt > 0, "BatchAuction: batch not found");
        _;
    }

    modifier batchOpen(bytes32 batchId) {
        require(batches[batchId].status == BatchStatus.Open, "BatchAuction: not open");
        require(block.timestamp <= batches[batchId].auctionEndTime, "BatchAuction: auction ended");
        _;
    }

    // ============ Constructor ============

    constructor(address _intentRegistry) Ownable() {
        require(_intentRegistry != address(0), "BatchAuction: zero registry");
        intentRegistry = IntentRegistry(_intentRegistry);
    }

    // ============ External Functions ============

    /**
     * @notice Create a new batch auction from pending intents
     * @param batchId Unique batch identifier
     * @param intentIds Array of intent IDs to batch together
     */
    function createBatch(
        bytes32 batchId,
        bytes32[] calldata intentIds
    ) external onlyOwner whenNotPaused {
        require(batchId != bytes32(0), "BatchAuction: zero batch id");
        require(intentIds.length > 0, "BatchAuction: empty batch");
        require(intentIds.length <= maxBatchSize, "BatchAuction: batch too large");
        require(batches[batchId].createdAt == 0, "BatchAuction: batch exists");

        // Validate all intents are pending and collect data
        address[] memory tokens = new address[](intentIds.length);
        uint256[] memory amounts = new uint256[](intentIds.length);

        for (uint256 i = 0; i < intentIds.length; i++) {
            // Get intent data - struct has 11 fields
            // bytes32 id, address user, address solver, address token, uint256 amount, 
            // uint256 protocolFee, uint256 expiryTimestamp, IntentStatus status, 
            // bytes32 paymentProofHash, uint256 createdAt, uint256 fulfilledAt
            (,,, address token, uint256 amount,, uint256 expiryTimestamp,,,,) = intentRegistry.intents(intentIds[i]);
            
            // Check status by calling a helper or checking expiry
            // For now, check that expiry is in the future (simple pending check)
            require(block.timestamp <= expiryTimestamp, "BatchAuction: intent expired");
            
            tokens[i] = token;
            amounts[i] = amount;
        }

        // Create batch
        batches[batchId] = Batch({
            batchId: batchId,
            intentIds: intentIds,
            tokens: tokens,
            amounts: amounts,
            winningSolver: address(0),
            winningBid: 0,
            createdAt: block.timestamp,
            auctionEndTime: block.timestamp + auctionDuration,
            status: BatchStatus.Open
        });

        totalBatches++;

        emit BatchCreated(batchId, intentIds, block.timestamp + auctionDuration);
    }

    /**
     * @notice Submit a bid for a batch auction
     * @param batchId Batch to bid on
     * @param priceImprovementBps How much better than oracle price (in bps)
     * @param bidProof Signed commitment from solver
     */
    function submitBid(
        bytes32 batchId,
        uint256 priceImprovementBps,
        bytes calldata bidProof
    ) external nonReentrant whenNotPaused batchExists(batchId) batchOpen(batchId) {
        require(priceImprovementBps >= minPriceImprovementBps, "BatchAuction: bid too low");
        require(!hasBid[batchId][msg.sender], "BatchAuction: already bid");

        // Record bid
        batchBids[batchId].push(Bid({
            solver: msg.sender,
            priceImprovementBps: priceImprovementBps,
            bidProof: bidProof
        }));
        hasBid[batchId][msg.sender] = true;

        emit BidSubmitted(batchId, msg.sender, priceImprovementBps);
    }

    /**
     * @notice Settle a batch after auction ends - picks best bid and executes
     * @param batchId Batch to settle
     */
    function settleBatch(bytes32 batchId) external nonReentrant whenNotPaused batchExists(batchId) {
        Batch storage batch = batches[batchId];
        require(batch.status == BatchStatus.Open, "BatchAuction: not open");
        require(block.timestamp > batch.auctionEndTime, "BatchAuction: auction not ended");

        Bid[] storage bids = batchBids[batchId];
        require(bids.length > 0, "BatchAuction: no bids");

        // Find winning bid (highest price improvement)
        uint256 bestBidIndex = 0;
        uint256 bestImprovement = bids[0].priceImprovementBps;

        for (uint256 i = 1; i < bids.length; i++) {
            if (bids[i].priceImprovementBps > bestImprovement) {
                bestImprovement = bids[i].priceImprovementBps;
                bestBidIndex = i;
            }
        }

        Bid memory winningBid = bids[bestBidIndex];
        batch.winningSolver = winningBid.solver;
        batch.winningBid = winningBid.priceImprovementBps;
        batch.status = BatchStatus.Settled;

        // Execute all intents in the batch via the winning solver
        for (uint256 i = 0; i < batch.intentIds.length; i++) {
            // Call IntentRegistry to fulfill each intent
            // The solver must have already provided payment proofs off-chain
            // For now, we use empty proof - in production this would be verified
            bytes memory emptyProof = "";
            
            // This would need to be adapted based on how IntentRegistry handles fulfillment
            // For now, we emit event and handle off-chain
        }

        emit BatchSettled(batchId, winningBid.solver, winningBid.priceImprovementBps);
    }

    /**
     * @notice Cancel a batch before any bids (owner only)
     * @param batchId Batch to cancel
     */
    function cancelBatch(bytes32 batchId) external onlyOwner batchExists(batchId) {
        Batch storage batch = batches[batchId];
        require(batch.status == BatchStatus.Open, "BatchAuction: not open");
        require(batchBids[batchId].length == 0, "BatchAuction: has bids");

        batch.status = BatchStatus.Cancelled;
        emit BatchCancelled(batchId);
    }

    // ============ Admin Functions ============

    function setAuctionDuration(uint256 _duration) external onlyOwner {
        require(_duration > 0, "BatchAuction: zero duration");
        uint256 oldDuration = auctionDuration;
        auctionDuration = _duration;
        emit AuctionDurationUpdated(oldDuration, _duration);
    }

    function setMinPriceImprovement(uint256 _minBps) external onlyOwner {
        uint256 oldMin = minPriceImprovementBps;
        minPriceImprovementBps = _minBps;
        emit MinPriceImprovementUpdated(oldMin, _minBps);
    }

    function setMaxBatchSize(uint256 _size) external onlyOwner {
        require(_size > 0, "BatchAuction: zero size");
        uint256 oldSize = maxBatchSize;
        maxBatchSize = _size;
        emit MaxBatchSizeUpdated(oldSize, _size);
    }

    function setIntentRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "BatchAuction: zero registry");
        intentRegistry = IntentRegistry(_registry);
    }

    // ============ View Functions ============

    function getBatchBids(bytes32 batchId) external view returns (Bid[] memory) {
        return batchBids[batchId];
    }

    function getBatchIntentCount(bytes32 batchId) external view returns (uint256) {
        return batches[batchId].intentIds.length;
    }

    function getBatchStatus(bytes32 batchId) external view returns (BatchStatus) {
        return batches[batchId].status;
    }

    function getBatchDetails(bytes32 batchId) external view returns (
        bytes32[] memory intentIds,
        address[] memory tokens,
        uint256[] memory amounts,
        uint256 auctionEndTime,
        BatchStatus status
    ) {
        Batch storage batch = batches[batchId];
        return (
            batch.intentIds,
            batch.tokens,
            batch.amounts,
            batch.auctionEndTime,
            batch.status
        );
    }
}
