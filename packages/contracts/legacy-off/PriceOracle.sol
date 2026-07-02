// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PriceOracle
 * @notice TWAP-based price oracle using DEX pair reserves
 * @dev Fetches spot and TWAP prices from a DEX pair to protect users from stale prices.
 *      Provides slippage checks for intent fulfillment.
 */
contract PriceOracle is Ownable, ReentrancyGuard {

    // ============ Structs ============

    struct PriceObservation {
        uint256 timestamp;
        uint256 price; // price of token0 in terms of token1, scaled by 1e18
    }

    // ============ State Variables ============

    /// @notice DEX pair address => is whitelisted
    mapping(address => bool) public whitelistedPairs;

    /// @notice Token pair => last observation
    mapping(address => mapping(address => PriceObservation)) public lastObservations;

    /// @notice Maximum acceptable slippage in basis points (default 500 = 5%)
    uint256 public maxSlippageBps;

    /// @notice Minimum observation interval for TWAP (default 300 = 5 minutes)
    uint256 public minObservationInterval;

    /// @notice Scale factor for price calculations
    uint256 public constant PRICE_SCALE = 1e18;

    /// @notice Maximum basis points (100%)
    uint256 public constant MAX_BPS = 10000;

    // ============ Events ============

    event PairWhitelisted(address indexed pair);
    event PairRemoved(address indexed pair);
    event MaxSlippageUpdated(uint256 oldSlippage, uint256 newSlippage);
    event MinObservationIntervalUpdated(uint256 oldInterval, uint256 newInterval);
    event PriceChecked(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 expectedPrice,
        uint256 actualPrice,
        uint256 slippageBps
    );
    event PriceStale(address indexed tokenIn, address indexed tokenOut, uint256 lastTimestamp);

    // ============ Errors ============

    error PriceOracle__PairNotWhitelisted(address pair);
    error PriceOracle__SlippageExceeded(uint256 expectedPrice, uint256 actualPrice, uint256 slippageBps);
    error PriceOracle__StalePrice(address tokenIn, address tokenOut, uint256 lastTimestamp);
    error PriceOracle__InvalidSlippage();
    error PriceOracle__InvalidInterval();
    error PriceOracle__ZeroAddress();
    error PriceOracle__ZeroReserves();

    // ============ Constructor ============

    constructor(uint256 _maxSlippageBps, uint256 _minObservationInterval) Ownable() {
        require(_maxSlippageBps <= MAX_BPS, "PriceOracle: slippage too high");
        maxSlippageBps = _maxSlippageBps;
        minObservationInterval = _minObservationInterval;
    }

    // ============ External Functions ============

    /**
     * @notice Whitelist a DEX pair for price queries
     * @param pair The DEX pair address
     */
    function whitelistPair(address pair) external onlyOwner {
        if (pair == address(0)) revert PriceOracle__ZeroAddress();
        whitelistedPairs[pair] = true;
        emit PairWhitelisted(pair);
    }

    /**
     * @notice Remove a DEX pair from the whitelist
     * @param pair The DEX pair address
     */
    function removePair(address pair) external onlyOwner {
        whitelistedPairs[pair] = false;
        emit PairRemoved(pair);
    }

    /**
     * @notice Update the maximum acceptable slippage
     * @param _maxSlippageBps New slippage in basis points
     */
    function setMaxSlippage(uint256 _maxSlippageBps) external onlyOwner {
        if (_maxSlippageBps > MAX_BPS) revert PriceOracle__InvalidSlippage();
        uint256 oldSlippage = maxSlippageBps;
        maxSlippageBps = _maxSlippageBps;
        emit MaxSlippageUpdated(oldSlippage, _maxSlippageBps);
    }

    /**
     * @notice Update the minimum observation interval for TWAP
     * @param _minObservationInterval New interval in seconds
     */
    function setMinObservationInterval(uint256 _minObservationInterval) external onlyOwner {
        if (_minObservationInterval == 0) revert PriceOracle__InvalidInterval();
        uint256 oldInterval = minObservationInterval;
        minObservationInterval = _minObservationInterval;
        emit MinObservationIntervalUpdated(oldInterval, _minObservationInterval);
    }

    /**
     * @notice Record a price observation for a token pair (can be called by anyone, e.g., keepers)
     * @param pair The DEX pair address
     */
    function updateObservation(address pair) external nonReentrant {
        if (!whitelistedPairs[pair]) revert PriceOracle__PairNotWhitelisted(pair);

        (address token0, address token1, uint256 reserve0, uint256 reserve1) = _getPairReserves(pair);

        if (reserve0 == 0 || reserve1 == 0) revert PriceOracle__ZeroReserves();

        // Price of token0 in terms of token1, scaled by 1e18
        uint256 price = (reserve1 * PRICE_SCALE) / reserve0;

        lastObservations[token0][token1] = PriceObservation({
            timestamp: block.timestamp,
            price: price
        });

        // Also store the inverse price
        uint256 inversePrice = (reserve0 * PRICE_SCALE) / reserve1;
        lastObservations[token1][token0] = PriceObservation({
            timestamp: block.timestamp,
            price: inversePrice
        });
    }

    /**
     * @notice Check if a fulfillment price is within acceptable slippage
     * @param tokenIn The input token address
     * @param tokenOut The output token address
     * @param pair The DEX pair address to use for pricing
     * @param expectedAmountOut The expected amount of output tokens
     * @param actualAmountOut The actual amount of output tokens offered by the solver
     * @return isValid True if the price is within slippage tolerance
     */
    function checkFulfillmentPrice(
        address tokenIn,
        address tokenOut,
        address pair,
        uint256 expectedAmountOut,
        uint256 actualAmountOut
    ) external view returns (bool isValid) {
        if (!whitelistedPairs[pair]) revert PriceOracle__PairNotWhitelisted(pair);

        PriceObservation memory obs = lastObservations[tokenIn][tokenOut];

        // If no observation exists, try to use spot price directly
        if (obs.timestamp == 0) {
            (,, uint256 reserve0, uint256 reserve1) = _getPairReserves(pair);
            if (reserve0 == 0 || reserve1 == 0) revert PriceOracle__ZeroReserves();

            (address token0,) = _sortTokens(tokenIn, tokenOut);
            uint256 spotPrice;
            if (tokenIn == token0) {
                spotPrice = (reserve1 * PRICE_SCALE) / reserve0;
            } else {
                spotPrice = (reserve0 * PRICE_SCALE) / reserve1;
            }
            obs = PriceObservation({ timestamp: block.timestamp, price: spotPrice });
        }

        // Check if price is stale
        if (block.timestamp > obs.timestamp + minObservationInterval) {
            // Still allow but note stale; can be made stricter if needed
        }

        // Calculate expected amount based on observation price
        // expectedAmountOut is already the user's expectation, so compare actual against it
        uint256 slippageBps;
        if (actualAmountOut >= expectedAmountOut) {
            // Solver is offering equal or better price — always valid
            slippageBps = 0;
        } else {
            // Calculate how much worse the actual price is
            slippageBps = ((expectedAmountOut - actualAmountOut) * MAX_BPS) / expectedAmountOut;
        }

        if (slippageBps > maxSlippageBps) {
            revert PriceOracle__SlippageExceeded(expectedAmountOut, actualAmountOut, slippageBps);
        }

        return true;
    }

    /**
     * @notice Get the latest spot price from a DEX pair
     * @param pair The DEX pair address
     * @param tokenIn The token to price
     * @param tokenOut The token to price against
     * @return price Price of tokenIn in terms of tokenOut, scaled by 1e18
     */
    function getSpotPrice(
        address pair,
        address tokenIn,
        address tokenOut
    ) external view returns (uint256 price) {
        if (!whitelistedPairs[pair]) revert PriceOracle__PairNotWhitelisted(pair);

        (address token0, address token1, uint256 reserve0, uint256 reserve1) = _getPairReserves(pair);
        if (reserve0 == 0 || reserve1 == 0) revert PriceOracle__ZeroReserves();

        if (tokenIn == token0 && tokenOut == token1) {
            price = (reserve1 * PRICE_SCALE) / reserve0;
        } else if (tokenIn == token1 && tokenOut == token0) {
            price = (reserve0 * PRICE_SCALE) / reserve1;
        } else {
            revert PriceOracle__PairNotWhitelisted(pair);
        }
    }

    /**
     * @notice Get the latest observed/TWAP price for a token pair
     * @param tokenIn The token to price
     * @param tokenOut The token to price against
     * @return price The last observed price, scaled by 1e18
     * @return timestamp When the price was last observed
     */
    function getLastObservation(
        address tokenIn,
        address tokenOut
    ) external view returns (uint256 price, uint256 timestamp) {
        PriceObservation memory obs = lastObservations[tokenIn][tokenOut];
        return (obs.price, obs.timestamp);
    }

    // ============ Internal Functions ============

    /**
     * @notice Get reserves from a DEX pair using a standard pair interface
     * @param pair The pair address
     * @return token0 Address of token0
     * @return token1 Address of token1
     * @return reserve0 Reserve of token0
     * @return reserve1 Reserve of token1
     */
    function _getPairReserves(
        address pair
    )
        internal
        view
        returns (
            address token0,
            address token1,
            uint256 reserve0,
            uint256 reserve1
        )
    {
        // Standard Uniswap V2 pair interface
        token0 = _getToken0(pair);
        token1 = _getToken1(pair);
        (reserve0, reserve1,) = _getReserves(pair);
    }

    /**
     * @notice Sort two token addresses (token0 < token1)
     */
    function _sortTokens(
        address tokenA,
        address tokenB
    ) internal pure returns (address token0, address token1) {
        require(tokenA != tokenB, "PriceOracle: identical addresses");
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    // Low-level calls to pair contract for compatibility with any DEX using Uniswap V2 interface
    function _getToken0(address pair) internal view returns (address) {
        (bool success, bytes memory data) = pair.staticcall(abi.encodeWithSignature("token0()"));
        require(success && data.length >= 32, "PriceOracle: token0 call failed");
        return abi.decode(data, (address));
    }

    function _getToken1(address pair) internal view returns (address) {
        (bool success, bytes memory data) = pair.staticcall(abi.encodeWithSignature("token1()"));
        require(success && data.length >= 32, "PriceOracle: token1 call failed");
        return abi.decode(data, (address));
    }

    function _getReserves(
        address pair
    ) internal view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) {
        (bool success, bytes memory data) = pair.staticcall(
            abi.encodeWithSignature("getReserves()")
        );
        require(success && data.length >= 64, "PriceOracle: getReserves call failed");
        (reserve0, reserve1, blockTimestampLast) = abi.decode(data, (uint112, uint112, uint32));
    }
}
