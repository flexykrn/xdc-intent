// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IEscrow.sol";

contract Escrow is IEscrow, ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;

    address public registry;
    mapping(address => bool) public isTokenAllowed;
    mapping(bytes32 => address) public intentToken;
    mapping(bytes32 => uint256) public intentAmount;
    mapping(bytes32 => address) public intentUser;

    modifier onlyRegistry() {
        require(msg.sender == registry, "Escrow: caller is not registry");
        _;
    }

    modifier allowedToken(address token) {
        require(isTokenAllowed[token], "Escrow: token not allowed");
        _;
    }

    constructor() Ownable() {}

    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "Escrow: zero address");
        registry = _registry;
    }

    function addAllowedToken(address token) external onlyOwner {
        require(token != address(0), "Escrow: zero token");
        isTokenAllowed[token] = true;
    }

    function removeAllowedToken(address token) external onlyOwner {
        isTokenAllowed[token] = false;
    }

    function lockTokens(
        address token,
        uint256 amount,
        bytes32 intentId,
        address user
    ) external onlyRegistry nonReentrant whenNotPaused allowedToken(token) {
        require(amount > 0, "Escrow: zero amount");
        require(intentId != bytes32(0), "Escrow: zero intentId");
        require(user != address(0), "Escrow: zero user");
        require(intentAmount[intentId] == 0, "Escrow: intent already locked");

        IERC20(token).safeTransferFrom(user, address(this), amount);

        intentToken[intentId] = token;
        intentAmount[intentId] = amount;
        intentUser[intentId] = user;

        emit TokensLocked(intentId, token, amount, user);
    }

    function releaseTokens(
        address token,
        uint256 amount,
        address recipient,
        bytes32 intentId
    ) external onlyRegistry nonReentrant whenNotPaused {
        require(recipient != address(0), "Escrow: zero recipient");
        require(amount > 0, "Escrow: zero amount");
        require(intentAmount[intentId] >= amount, "Escrow: insufficient balance");
        require(intentToken[intentId] == token, "Escrow: token mismatch");

        intentAmount[intentId] -= amount;

        IERC20(token).safeTransfer(recipient, amount);

        emit TokensReleased(intentId, token, amount, recipient);
    }

    function refundTokens(bytes32 intentId) external onlyRegistry nonReentrant whenNotPaused {
        uint256 amount = intentAmount[intentId];
        require(amount > 0, "Escrow: no balance");

        address token = intentToken[intentId];
        address user = intentUser[intentId];

        delete intentToken[intentId];
        delete intentAmount[intentId];
        delete intentUser[intentId];

        IERC20(token).safeTransfer(user, amount);

        emit TokensRefunded(intentId, token, amount, user);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
