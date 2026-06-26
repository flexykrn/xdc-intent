// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

/**
 * @title PaymentVerifier
 * @notice Verifies solver payment proofs using EIP-712 signatures
 * @dev Only authorized signers can generate valid proofs. Owner manages signers.
 *      Integrates with protocol fee collection via fee tracking.
 */
contract PaymentVerifier is Ownable, Pausable, EIP712 {
    using ECDSA for bytes32;

    // ============ State Variables ============
    
    /// @notice Authorized signers (middleware wallets)
    mapping(address => bool) public authorizedSigners;
    
    /// @notice Total fees verified (for analytics)
    uint256 public totalFeesVerified;
    
    /// @notice Total intents verified
    uint256 public totalIntentsVerified;
    
    /// @notice Intent ID => verified (prevents replay)
    mapping(bytes32 => bool) public verifiedIntents;
    
    /// @notice Signer rotation nonce (for replay protection on add/remove)
    uint256 public signerNonce;

    // ============ Structs ============
    
    /// @notice EIP-712 payment proof structure
    struct PaymentProof {
        bytes32 intentId;
        address solver;
        address token;
        uint256 amount;
        uint256 protocolFee;
        uint256 expiryTimestamp;
        uint256 chainId;
    }
    
    /// @notice EIP-712 type hash for PaymentProof
    bytes32 private constant PAYMENT_PROOF_TYPEHASH = keccak256(
        "PaymentProof(bytes32 intentId,address solver,address token,uint256 amount,uint256 protocolFee,uint256 expiryTimestamp,uint256 chainId)"
    );

    // ============ Events ============
    
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event PaymentVerified(
        bytes32 indexed intentId,
        address indexed solver,
        address indexed token,
        uint256 amount,
        uint256 protocolFee,
        uint256 expiryTimestamp
    );
    event IntentAlreadyVerified(bytes32 indexed intentId);
    event TotalFeesUpdated(uint256 newTotal);
    event TotalIntentsUpdated(uint256 newTotal);

    // ============ Modifiers ============
    
    modifier onlyAuthorizedSigner() {
        require(authorizedSigners[msg.sender], "PaymentVerifier: not authorized signer");
        _;
    }
    
    modifier notExpired(uint256 expiryTimestamp) {
        require(block.timestamp <= expiryTimestamp, "PaymentVerifier: proof expired");
        _;
    }
    
    modifier notVerified(bytes32 intentId) {
        require(!verifiedIntents[intentId], "PaymentVerifier: intent already verified");
        _;
    }

    // ============ Constructor ============
    
    constructor() Ownable() EIP712("XDCIntentPayment", "1") {
        // No initial signers - owner adds them after deployment
    }

    // ============ External Functions ============
    
    /**
     * @notice Add an authorized signer
     * @param signer The address to authorize
     */
    function addSigner(address signer) external onlyOwner {
        require(signer != address(0), "PaymentVerifier: zero address");
        require(!authorizedSigners[signer], "PaymentVerifier: already authorized");
        authorizedSigners[signer] = true;
        signerNonce++;
        emit SignerAdded(signer);
    }
    
    /**
     * @notice Remove an authorized signer
     * @param signer The address to remove
     */
    function removeSigner(address signer) external onlyOwner {
        require(authorizedSigners[signer], "PaymentVerifier: not authorized");
        authorizedSigners[signer] = false;
        signerNonce++;
        emit SignerRemoved(signer);
    }
    
    /**
     * @notice Verify a payment proof and mark intent as verified
     * @param proof The payment proof struct
     * @param signature The EIP-712 signature
     * @return bool True if verification succeeded
     */
    function verifyPayment(
        PaymentProof calldata proof,
        bytes calldata signature
    ) external whenNotPaused notExpired(proof.expiryTimestamp) notVerified(proof.intentId) returns (bool) {
        require(proof.solver != address(0), "PaymentVerifier: zero solver");
        require(proof.token != address(0), "PaymentVerifier: zero token");
        require(proof.amount > 0, "PaymentVerifier: zero amount");
        require(proof.chainId == block.chainid, "PaymentVerifier: wrong chain");
        
        // Recover signer from EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            PAYMENT_PROOF_TYPEHASH,
            proof.intentId,
            proof.solver,
            proof.token,
            proof.amount,
            proof.protocolFee,
            proof.expiryTimestamp,
            proof.chainId
        ));
        
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        
        require(authorizedSigners[signer], "PaymentVerifier: invalid signer");
        
        // Mark as verified
        verifiedIntents[proof.intentId] = true;
        totalIntentsVerified++;
        totalFeesVerified += proof.protocolFee;
        
        emit PaymentVerified(
            proof.intentId,
            proof.solver,
            proof.token,
            proof.amount,
            proof.protocolFee,
            proof.expiryTimestamp
        );
        
        emit TotalFeesUpdated(totalFeesVerified);
        emit TotalIntentsUpdated(totalIntentsVerified);
        
        return true;
    }
    
    /**
     * @notice Batch verify multiple payment proofs
     * @param proofs Array of payment proofs
     * @param signatures Array of signatures
     * @return results Array of bool results
     */
    function verifyPaymentBatch(
        PaymentProof[] calldata proofs,
        bytes[] calldata signatures
    ) external whenNotPaused returns (bool[] memory results) {
        require(proofs.length == signatures.length, "PaymentVerifier: length mismatch");
        require(proofs.length > 0, "PaymentVerifier: empty batch");
        require(proofs.length <= 50, "PaymentVerifier: batch too large"); // Gas limit protection
        
        results = new bool[](proofs.length);
        
        for (uint256 i = 0; i < proofs.length; i++) {
            // Skip if expired, already verified, or invalid
            if (block.timestamp > proofs[i].expiryTimestamp) {
                results[i] = false;
                continue;
            }
            if (verifiedIntents[proofs[i].intentId]) {
                results[i] = false;
                emit IntentAlreadyVerified(proofs[i].intentId);
                continue;
            }
            if (proofs[i].solver == address(0) || proofs[i].token == address(0) || proofs[i].amount == 0) {
                results[i] = false;
                continue;
            }
            if (proofs[i].chainId != block.chainid) {
                results[i] = false;
                continue;
            }
            
            // Verify signature
            bytes32 structHash = keccak256(abi.encode(
                PAYMENT_PROOF_TYPEHASH,
                proofs[i].intentId,
                proofs[i].solver,
                proofs[i].token,
                proofs[i].amount,
                proofs[i].protocolFee,
                proofs[i].expiryTimestamp,
                proofs[i].chainId
            ));
            
            bytes32 hash = _hashTypedDataV4(structHash);
            address signer = hash.recover(signatures[i]);
            
            if (!authorizedSigners[signer]) {
                results[i] = false;
                continue;
            }
            
            // Mark as verified
            verifiedIntents[proofs[i].intentId] = true;
            totalIntentsVerified++;
            totalFeesVerified += proofs[i].protocolFee;
            
            emit PaymentVerified(
                proofs[i].intentId,
                proofs[i].solver,
                proofs[i].token,
                proofs[i].amount,
                proofs[i].protocolFee,
                proofs[i].expiryTimestamp
            );
            
            results[i] = true;
        }
        
        emit TotalFeesUpdated(totalFeesVerified);
        emit TotalIntentsUpdated(totalIntentsVerified);
        
        return results;
    }
    
    /**
     * @notice Pause all operations
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause all operations
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    // ============ View Functions ============
    
    /**
     * @notice Check if an intent has been verified
     */
    function isIntentVerified(bytes32 intentId) external view returns (bool) {
        return verifiedIntents[intentId];
    }
    
    /**
     * @notice Check if an address is an authorized signer
     */
    function isAuthorizedSigner(address signer) external view returns (bool) {
        return authorizedSigners[signer];
    }
    
    /**
     * @notice Get the EIP-712 domain separator
     */
    function getDomainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
    
    /**
     * @notice Get the total fees verified
     */
    function getTotalFeesVerified() external view returns (uint256) {
        return totalFeesVerified;
    }
    
    /**
     * @notice Get the total intents verified
     */
    function getTotalIntentsVerified() external view returns (uint256) {
        return totalIntentsVerified;
    }
}
