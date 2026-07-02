// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPaymentVerifier {
    function verifyPayment(
        bytes32 paymentTxHash,
        address payer,
        address payee,
        uint256 amount,
        bytes32 intentId
    ) external returns (bool valid);

    function registerFacilitator(address facilitator) external;
    function revokeFacilitator(address facilitator) external;

    event PaymentVerified(bytes32 indexed intentId, address payer, uint256 amount);
    event FacilitatorRegistered(address indexed facilitator);
    event FacilitatorRevoked(address indexed facilitator);
}
