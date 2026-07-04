// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPaymentVerifier {
    // Legacy tx-hash verification (simplified x402 v0)
    function verifyPayment(
        bytes32 paymentTxHash,
        address payer,
        address payee,
        uint256 amount,
        bytes32 intentId
    ) external returns (bool valid);

    // EIP-3009 authorization verification (x402-style)
    function verifyAuthorization(
        address token,
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bytes32 intentId
    ) external returns (bool valid);

    function registerFacilitator(address facilitator) external;
    function revokeFacilitator(address facilitator) external;

    event PaymentVerified(bytes32 indexed intentId, address payer, uint256 amount);
    event AuthorizationVerified(bytes32 indexed intentId, address indexed payer, uint256 amount, bytes32 nonce);
    event FacilitatorRegistered(address indexed facilitator);
    event FacilitatorRevoked(address indexed facilitator);
}
