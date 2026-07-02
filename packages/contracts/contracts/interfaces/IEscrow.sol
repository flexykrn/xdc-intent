// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEscrow {
    function lockTokens(address token, uint256 amount, bytes32 intentId, address user) external;
    function releaseTokens(address token, uint256 amount, address recipient, bytes32 intentId) external;
    function refundTokens(bytes32 intentId) external;
    function setRegistry(address registry) external;
    function addAllowedToken(address token) external;
    function removeAllowedToken(address token) external;
    function isTokenAllowed(address token) external view returns (bool);

    event TokensLocked(bytes32 indexed intentId, address token, uint256 amount, address user);
    event TokensReleased(bytes32 indexed intentId, address token, uint256 amount, address recipient);
    event TokensRefunded(bytes32 indexed intentId, address token, uint256 amount, address user);
}
