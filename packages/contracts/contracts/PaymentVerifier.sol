// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./interfaces/IPaymentVerifier.sol";

interface IEIP3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

contract PaymentVerifier is IPaymentVerifier, Ownable, Pausable {
    using ECDSA for bytes32;

    mapping(address => bool) public facilitators;
    mapping(bytes32 => bool) public verifiedPayments;
    mapping(bytes32 => bool) public verifiedAuthorizations;

    constructor(address initialFacilitator) Ownable() {
        if (initialFacilitator != address(0)) {
            facilitators[initialFacilitator] = true;
            emit FacilitatorRegistered(initialFacilitator);
        }
    }

    function registerFacilitator(address facilitator) external onlyOwner override {
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

        verifiedPayments[paymentTxHash] = true;
        emit PaymentVerified(intentId, payer, amount);
        return true;
    }

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
    ) external whenNotPaused override returns (bool valid) {
        require(
            facilitators[msg.sender] || msg.sender == owner(),
            "PaymentVerifier: not facilitator"
        );
        require(token != address(0), "PaymentVerifier: zero token");
        require(from != address(0), "PaymentVerifier: zero payer");
        require(to != address(0), "PaymentVerifier: zero payee");
        require(value > 0, "PaymentVerifier: zero amount");
        require(!verifiedAuthorizations[nonce], "PaymentVerifier: nonce already verified");
        require(block.timestamp > validAfter, "PaymentVerifier: authorization not yet valid");
        require(block.timestamp < validBefore, "PaymentVerifier: authorization expired");

        bytes32 authHash = keccak256(abi.encode(
            from,
            to,
            value,
            validAfter,
            validBefore,
            nonce
        ));
        require(!verifiedAuthorizations[authHash], "PaymentVerifier: auth already verified");

        IEIP3009(token).transferWithAuthorization(from, to, value, validAfter, validBefore, nonce, v, r, s);

        verifiedAuthorizations[authHash] = true;
        verifiedAuthorizations[nonce] = true;

        emit AuthorizationVerified(intentId, from, value, nonce);
        return true;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
