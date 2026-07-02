// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IIntentRegistry.sol";

library IntentLib {
    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "Intent(uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destChainId,address destToken,uint256 minDestAmount,uint256 maxSolverFee,uint256 expiry,uint256 nonce)"
    );

    function deriveIntentId(IIntentRegistry.IntentParams memory intent, address user)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                user,
                intent.sourceChainId,
                intent.sourceToken,
                intent.sourceAmount,
                intent.destChainId,
                intent.destToken,
                intent.minDestAmount,
                intent.maxSolverFee,
                intent.expiry,
                intent.nonce
            )
        );
    }

    function hashIntentParams(IIntentRegistry.IntentParams memory intent)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                intent.sourceChainId,
                intent.sourceToken,
                intent.sourceAmount,
                intent.destChainId,
                intent.destToken,
                intent.minDestAmount,
                intent.maxSolverFee,
                intent.expiry,
                intent.nonce
            )
        );
    }
}
