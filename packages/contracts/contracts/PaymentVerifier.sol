// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPaymentVerifier.sol";

contract PaymentVerifier is IPaymentVerifier, Ownable, Pausable {
    mapping(address => bool) public facilitators;
    mapping(bytes32 => bool) public verifiedPayments;

    constructor() Ownable() {}

    function registerFacilitator(address facilitator) external override {
        require(facilitator != address(0), "PaymentVerifier: zero address");
        facilitators[facilitator] = true;
        emit FacilitatorRegistered(facilitator);
    }

    function revokeFacilitator(address facilitator) external override {
        facilitators[facilitator] = false;
        emit FacilitatorRevoked(facilitator);
    }

    function verifyPayment(
        bytes32 paymentTxHash,
        address payer,
        address payee,
        uint256 amount,
        bytes32 intentId
    ) external whenNotPaused override returns (bool valid) {
        require(
            facilitators[msg.sender] || msg.sender == owner(),
            "PaymentVerifier: not facilitator"
        );
        require(paymentTxHash != bytes32(0), "PaymentVerifier: zero tx hash");
        require(payer != address(0), "PaymentVerifier: zero payer");
        require(payee != address(0), "PaymentVerifier: zero payee");
        require(amount > 0, "PaymentVerifier: zero amount");
        require(!verifiedPayments[paymentTxHash], "PaymentVerifier: already verified");

        // In a production environment this would inspect the on-chain transfer logs
        // for the tx matching payer, payee, amount, and intent context. For V1 we
        // trust registered facilitators to only call verifyPayment after confirming
        // the transfer on-chain, and we record the paymentTxHash to prevent replay.
        verifiedPayments[paymentTxHash] = true;

        emit PaymentVerified(intentId, payer, amount);
        return true;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
