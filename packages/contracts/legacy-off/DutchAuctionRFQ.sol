// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
// import "./IntentRegistry.sol";

/**
 * @title DutchAuctionRFQ
 * @notice Implements Dutch auction and RFQ (Request for Quote) mechanisms
 * @dev Price starts high and decays over time until a solver accepts
 */
contract DutchAuctionRFQ is Ownable, ReentrancyGuard {
    
    // ============ Structs ============
    
    struct DutchAuction {
        bytes32 intentId;
        uint256 startPrice;         // Starting price in wei
        uint256 endPrice;           // Minimum acceptable price
        uint256 startTime;
        uint256 duration;           // Auction duration in seconds
        uint256 decayRate;          // Price decay per second
        address solver;             // Winning solver
        bool isActive;
        bool isSettled;
    }
    
    struct RFQ {
        bytes32 intentId;
        uint256 targetAmount;
        uint256 deadline;
        address bestSolver;
        uint256 bestQuote;
        bool isActive;
        bool isSettled;
    }
    
    struct Quote {
        address solver;
        uint256 price;
        uint256 timestamp;
        bool isValid;
    }
    
    // ============ State Variables ============
    
    IntentRegistry public intentRegistry;
    
    mapping(bytes32 => DutchAuction) public dutchAuctions;
    mapping(bytes32 => RFQ) public rfqs;
    mapping(bytes32 => Quote[]) public quotes;
    
    uint256 public constant MIN_DURATION = 60;      // 1 minute
    uint256 public constant MAX_DURATION = 86400;   // 24 hours
    uint256 public constant MIN_DECAY_RATE = 1;     // 1 wei per second
    
    // ============ Events ============
    
    event DutchAuctionCreated(
        bytes32 indexed intentId,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    );
    event DutchAuctionSettled(
        bytes32 indexed intentId,
        address indexed solver,
        uint256 finalPrice
    );
    event RFQCreated(
        bytes32 indexed intentId,
        uint256 targetAmount,
        uint256 deadline
    );
    event QuoteSubmitted(
        bytes32 indexed intentId,
        address indexed solver,
        uint256 price
    );
    event RFQSettled(
        bytes32 indexed intentId,
        address indexed solver,
        uint256 finalPrice
    );
    
    // ============ Modifiers ============
    
    modifier validIntent(bytes32 intentId) {
        require(
            intentRegistry.isIntentPending(intentId),
            "Intent not pending"
        );
        _;
    }
    
    modifier onlyIntentCreator(bytes32 intentId) {
        address creator = intentRegistry.getIntentCreator(intentId);
        require(msg.sender == creator, "Only intent creator");
        _;
    }
    
    // ============ Constructor ============
    
    constructor(address _intentRegistry) Ownable() {
        intentRegistry = IntentRegistry(_intentRegistry);
    }
    
    // ============ Dutch Auction Functions ============
    
    /**
     * @notice Create a Dutch auction for an intent
     * @param intentId The intent ID
     * @param startPrice Starting price (highest)
     * @param endPrice Ending price (lowest acceptable)
     * @param duration Auction duration in seconds
     */
    function createDutchAuction(
        bytes32 intentId,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    ) external onlyIntentCreator(intentId) validIntent(intentId) {
        require(duration >= MIN_DURATION, "Duration too short");
        require(duration <= MAX_DURATION, "Duration too long");
        require(startPrice > endPrice, "Start price must be > end price");
        require(endPrice > 0, "End price must be > 0");
        
        uint256 decayRate = (startPrice - endPrice) / duration;
        require(decayRate >= MIN_DECAY_RATE, "Decay rate too small");
        
        dutchAuctions[intentId] = DutchAuction({
            intentId: intentId,
            startPrice: startPrice,
            endPrice: endPrice,
            startTime: block.timestamp,
            duration: duration,
            decayRate: decayRate,
            solver: address(0),
            isActive: true,
            isSettled: false
        });
        
        emit DutchAuctionCreated(intentId, startPrice, endPrice, duration);
    }
    
    /**
     * @notice Get current Dutch auction price
     */
    function getCurrentPrice(bytes32 intentId) external view returns (uint256) {
        DutchAuction storage auction = dutchAuctions[intentId];
        require(auction.isActive, "Auction not active");
        
        uint256 elapsed = block.timestamp - auction.startTime;
        
        if (elapsed >= auction.duration) {
            return auction.endPrice;
        }
        
        uint256 decay = elapsed * auction.decayRate;
        return auction.startPrice - decay;
    }
    
    /**
     * @notice Accept Dutch auction at current price
     */
    function acceptDutchAuction(bytes32 intentId) external nonReentrant {
        DutchAuction storage auction = dutchAuctions[intentId];
        require(auction.isActive, "Auction not active");
        require(!auction.isSettled, "Auction already settled");
        
        uint256 currentPrice = this.getCurrentPrice(intentId);
        
        // Mark as settled
        auction.isActive = false;
        auction.isSettled = true;
        auction.solver = msg.sender;
        
        emit DutchAuctionSettled(intentId, msg.sender, currentPrice);
        
        // In production, would trigger fulfillment at currentPrice
    }
    
    /**
     * @notice Cancel Dutch auction
     */
    function cancelDutchAuction(bytes32 intentId) external onlyIntentCreator(intentId) {
        DutchAuction storage auction = dutchAuctions[intentId];
        require(auction.isActive, "Auction not active");
        require(!auction.isSettled, "Already settled");
        
        auction.isActive = false;
    }
    
    // ============ RFQ Functions ============
    
    /**
     * @notice Create an RFQ for an intent
     * @param intentId The intent ID
     * @param targetAmount Target amount to receive
     * @param deadline Quote deadline
     */
    function createRFQ(
        bytes32 intentId,
        uint256 targetAmount,
        uint256 deadline
    ) external onlyIntentCreator(intentId) validIntent(intentId) {
        require(deadline > block.timestamp, "Deadline must be future");
        require(targetAmount > 0, "Target amount must be > 0");
        
        rfqs[intentId] = RFQ({
            intentId: intentId,
            targetAmount: targetAmount,
            deadline: deadline,
            bestSolver: address(0),
            bestQuote: type(uint256).max,
            isActive: true,
            isSettled: false
        });
        
        emit RFQCreated(intentId, targetAmount, deadline);
    }
    
    /**
     * @notice Submit a quote for an RFQ
     */
    function submitQuote(
        bytes32 intentId,
        uint256 price
    ) external {
        RFQ storage rfq = rfqs[intentId];
        require(rfq.isActive, "RFQ not active");
        require(!rfq.isSettled, "RFQ already settled");
        require(block.timestamp < rfq.deadline, "RFQ deadline passed");
        require(price < rfq.bestQuote, "Quote not better than current best");
        
        quotes[intentId].push(Quote({
            solver: msg.sender,
            price: price,
            timestamp: block.timestamp,
            isValid: true
        }));
        
        rfq.bestSolver = msg.sender;
        rfq.bestQuote = price;
        
        emit QuoteSubmitted(intentId, msg.sender, price);
    }
    
    /**
     * @notice Settle RFQ with best quote
     */
    function settleRFQ(bytes32 intentId) external onlyIntentCreator(intentId) {
        RFQ storage rfq = rfqs[intentId];
        require(rfq.isActive, "RFQ not active");
        require(!rfq.isSettled, "Already settled");
        require(rfq.bestSolver != address(0), "No quotes submitted");
        
        rfq.isActive = false;
        rfq.isSettled = true;
        
        emit RFQSettled(intentId, rfq.bestSolver, rfq.bestQuote);
        
        // In production, would trigger fulfillment with bestSolver at bestQuote
    }
    
    /**
     * @notice Get all quotes for an RFQ
     */
    function getQuotes(bytes32 intentId) external view returns (Quote[] memory) {
        return quotes[intentId];
    }
    
    /**
     * @notice Get best quote for an RFQ
     */
    function getBestQuote(bytes32 intentId) external view returns (address, uint256) {
        RFQ storage rfq = rfqs[intentId];
        return (rfq.bestSolver, rfq.bestQuote);
    }
    
    /**
     * @notice Check if RFQ has expired
     */
    function isRFQExpired(bytes32 intentId) external view returns (bool) {
        return block.timestamp > rfqs[intentId].deadline;
    }
    
    /**
     * @notice Check if Dutch auction has expired
     */
    function isAuctionExpired(bytes32 intentId) external view returns (bool) {
        DutchAuction storage auction = dutchAuctions[intentId];
        return block.timestamp > auction.startTime + auction.duration;
    }
}
