// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMockBridge {
    event BridgeOut(
        bytes32 indexed intentId,
        address indexed token,
        uint256 amount,
        uint256 indexed destChainId,
        address sender
    );

    event BridgeIn(
        bytes32 indexed intentId,
        address indexed token,
        uint256 amount,
        uint256 indexed sourceChainId,
        address recipient
    );

    function bridgeOut(bytes32 intentId, address token, uint256 amount, uint256 destChainId) external;
    function mintOnDest(bytes32 intentId, address token, uint256 amount, address recipient) external;
    function processed(bytes32 intentId) external view returns (bool);
    function lockedBalances(address token) external view returns (uint256);
}
