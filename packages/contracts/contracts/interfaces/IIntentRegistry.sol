// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IIntentRegistry {
    enum IntentStatus {
        Open,
        Fulfilled,
        Cancelled
    }

    struct Intent {
        bytes32 intentId;
        address user;
        uint256 sourceChainId;
        address sourceToken;
        uint256 sourceAmount;
        uint256 destChainId;
        address destToken;
        uint256 minDestAmount;
        uint256 maxSolverFee;
        uint256 expiry;
        uint256 nonce;
        bytes signature;
        address[] allowedSolvers;
        IntentStatus status;
        address solver;
        uint256 fulfilledAmount;
        bytes32 paymentTxHash;
    }

    struct IntentParams {
        uint256 sourceChainId;
        address sourceToken;
        uint256 sourceAmount;
        uint256 destChainId;
        address destToken;
        uint256 minDestAmount;
        uint256 maxSolverFee;
        uint256 expiry;
        uint256 nonce;
        address[] allowedSolvers;
    }

    function submitIntent(IntentParams calldata intent, bytes calldata signature) external returns (bytes32 intentId);
    function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash, address solver) external returns (bool success);
    function cancelIntent(bytes32 intentId) external;
    function cancelExpiredIntents(bytes32[] calldata intentIds) external;
    function getIntent(bytes32 intentId) external view returns (Intent memory);
    function getUserNonce(address user) external view returns (uint256);
    function getUserIntents(address user) external view returns (bytes32[] memory);
    function totalIntents() external view returns (uint256);
    function totalIntentsFulfilled() external view returns (uint256);
    function getTotalIntents() external view returns (uint256);
    function setPaymentVerifier(address verifier) external;
    function setSolverRegistry(address registry) external;
    function pause() external;
    function unpause() external;

    event IntentSubmitted(
        bytes32 indexed intentId,
        address indexed user,
        address sourceToken,
        uint256 sourceAmount,
        address destToken,
        uint256 minDestAmount,
        uint256 expiry
    );

    event IntentFulfilled(
        bytes32 indexed intentId,
        address indexed solver,
        uint256 destAmount,
        bytes32 paymentTxHash
    );

    event IntentCancelled(
        bytes32 indexed intentId,
        address indexed user,
        uint256 refundAmount
    );
}
