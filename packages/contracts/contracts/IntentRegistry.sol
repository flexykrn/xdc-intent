// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./interfaces/IIntentRegistry.sol";
import "./interfaces/IEscrow.sol";
import "./interfaces/IPaymentVerifier.sol";
import "./libraries/IntentLib.sol";

contract IntentRegistry is IIntentRegistry, Ownable, Pausable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    IEscrow public escrow;
    IPaymentVerifier public paymentVerifier;

    mapping(bytes32 => Intent) public intents;
    mapping(address => uint256) public userNonces;

    constructor(
        address _escrow,
        address _paymentVerifier
    ) Ownable() EIP712("XDCIntents", "1") {
        require(_escrow != address(0), "IntentRegistry: zero escrow");
        require(_paymentVerifier != address(0), "IntentRegistry: zero verifier");
        escrow = IEscrow(_escrow);
        paymentVerifier = IPaymentVerifier(_paymentVerifier);
        // Register the registry as a facilitator on the verifier so it can call verifyPayment directly.
        // In production with a real x402 facilitator this would be the facilitator address instead.
        IPaymentVerifier(_paymentVerifier).registerFacilitator(address(this));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function submitIntent(IntentParams calldata intent, bytes calldata signature)
        external
        nonReentrant
        whenNotPaused
        returns (bytes32 intentId)
    {
        require(intent.sourceToken != address(0), "IntentRegistry: zero source token");
        require(intent.destToken != address(0), "IntentRegistry: zero dest token");
        require(intent.sourceAmount > 0, "IntentRegistry: zero amount");
        require(intent.expiry > block.timestamp, "IntentRegistry: expiry in past");
        require(intent.expiry <= block.timestamp + 30 days, "IntentRegistry: expiry too far");
        require(
            intent.sourceChainId == block.chainid || intent.destChainId == block.chainid,
            "IntentRegistry: chain mismatch"
        );

        intentId = IntentLib.deriveIntentId(intent, msg.sender);
        require(intents[intentId].status == IntentStatus(0) && intents[intentId].user == address(0), "IntentRegistry: intent exists");

        bytes32 digest = _hashTypedDataV4(IntentLib.hashIntentParams(intent));
        address signer = ECDSA.recover(digest, signature);
        require(signer == msg.sender, "IntentRegistry: invalid signature");

        if (intent.allowedSolvers.length > 0) {
            bool allowed = false;
            for (uint256 i = 0; i < intent.allowedSolvers.length; i++) {
                if (intent.allowedSolvers[i] == address(0)) continue;
                allowed = true;
                break;
            }
            require(allowed, "IntentRegistry: no valid allowed solver");
        }

        require(userNonces[msg.sender] < intent.nonce, "IntentRegistry: nonce too low");
        userNonces[msg.sender] = intent.nonce;

        Intent storage newIntent = intents[intentId];
        newIntent.intentId = intentId;
        newIntent.user = msg.sender;
        newIntent.sourceChainId = intent.sourceChainId;
        newIntent.sourceToken = intent.sourceToken;
        newIntent.sourceAmount = intent.sourceAmount;
        newIntent.destChainId = intent.destChainId;
        newIntent.destToken = intent.destToken;
        newIntent.minDestAmount = intent.minDestAmount;
        newIntent.maxSolverFee = intent.maxSolverFee;
        newIntent.expiry = intent.expiry;
        newIntent.nonce = intent.nonce;
        newIntent.signature = signature;
        newIntent.allowedSolvers = intent.allowedSolvers;
        newIntent.status = IntentStatus.Open;

        escrow.lockTokens(intent.sourceToken, intent.sourceAmount, intentId, msg.sender);

        emit IntentSubmitted(
            intentId,
            msg.sender,
            intent.sourceToken,
            intent.sourceAmount,
            intent.destToken,
            intent.minDestAmount,
            intent.expiry
        );
    }

    function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash)
        external
        nonReentrant
        whenNotPaused
        returns (bool success)
    {
        Intent storage intent = intents[intentId];
        require(intent.status == IntentStatus.Open, "IntentRegistry: not open");
        require(block.timestamp <= intent.expiry, "IntentRegistry: expired");
        require(destAmount >= intent.minDestAmount, "IntentRegistry: min dest amount");
        require(
            intent.allowedSolvers.length == 0 || _isAllowedSolver(msg.sender, intent.allowedSolvers),
            "IntentRegistry: solver not allowed"
        );

        intent.status = IntentStatus.Fulfilled;
        intent.solver = msg.sender;
        intent.fulfilledAmount = destAmount;
        intent.paymentTxHash = paymentTxHash;

        // Verify x402 payment through trusted facilitator
        require(
            paymentVerifier.verifyPayment(
                paymentTxHash,
                msg.sender,
                intent.user,
                destAmount,
                intentId
            ),
            "IntentRegistry: payment verification failed"
        );

        // Release source tokens to solver
        escrow.releaseTokens(
            intent.sourceToken,
            intent.sourceAmount - intent.maxSolverFee,
            msg.sender,
            intentId
        );

        emit IntentFulfilled(intentId, msg.sender, destAmount, paymentTxHash);
        return true;
    }

    function cancelIntent(bytes32 intentId) external nonReentrant whenNotPaused {
        Intent storage intent = intents[intentId];
        require(intent.status == IntentStatus.Open, "IntentRegistry: not open");
        require(
            msg.sender == intent.user || block.timestamp > intent.expiry,
            "IntentRegistry: not owner or expired"
        );

        intent.status = IntentStatus.Cancelled;
        escrow.refundTokens(intentId);

        emit IntentCancelled(intentId, intent.user, intent.sourceAmount);
    }

    function cancelExpiredIntents(bytes32[] calldata intentIds) external nonReentrant whenNotPaused {
        for (uint256 i = 0; i < intentIds.length; i++) {
            Intent storage intent = intents[intentIds[i]];
            if (intent.status != IntentStatus.Open) continue;
            if (block.timestamp <= intent.expiry) continue;

            intent.status = IntentStatus.Cancelled;

            escrow.refundTokens(intentIds[i]);

            emit IntentCancelled(intentIds[i], intent.user, intent.sourceAmount);
        }
    }

    function getIntent(bytes32 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }

    function getUserNonce(address user) external view returns (uint256) {
        return userNonces[user];
    }

    function setPaymentVerifier(address verifier) external onlyOwner {
        require(verifier != address(0), "IntentRegistry: zero address");
        paymentVerifier = IPaymentVerifier(verifier);
    }

    function setEscrow(address escrow_) external onlyOwner {
        require(escrow_ != address(0), "IntentRegistry: zero address");
        escrow = IEscrow(escrow_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _isAllowedSolver(address solver, address[] memory allowed) internal pure returns (bool) {
        for (uint256 i = 0; i < allowed.length; i++) {
            if (allowed[i] == solver) return true;
        }
        return false;
    }
}
