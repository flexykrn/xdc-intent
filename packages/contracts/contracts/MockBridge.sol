// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IMockBridge.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function mint(address to, uint256 amount) external;
}

contract MockBridge is IMockBridge, Ownable {
    mapping(bytes32 => bool) public bridgeOutProcessed;
    mapping(bytes32 => bool) public mintProcessed;
    mapping(address => uint256) public lockedBalances;

    constructor() Ownable() {}

    function processed(bytes32 intentId) external view override returns (bool) {
        return bridgeOutProcessed[intentId] || mintProcessed[intentId];
    }

    function bridgeOut(
        bytes32 intentId,
        address token,
        uint256 amount,
        uint256 destChainId
    ) external override {
        require(amount > 0, "MockBridge: zero amount");
        require(destChainId != block.chainid, "MockBridge: same chain");
        require(!bridgeOutProcessed[intentId], "MockBridge: already processed");

        bridgeOutProcessed[intentId] = true;
        lockedBalances[token] += amount;

        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "MockBridge: transfer failed"
        );

        emit BridgeOut(intentId, token, amount, destChainId, msg.sender);
    }

    function mintOnDest(
        bytes32 intentId,
        address token,
        uint256 amount,
        address recipient
    ) external override onlyOwner {
        require(!mintProcessed[intentId], "MockBridge: already processed");
        mintProcessed[intentId] = true;

        IERC20(token).mint(recipient, amount);

        emit BridgeIn(intentId, token, amount, block.chainid, recipient);
    }

    function withdrawLocked(address token, uint256 amount, address recipient) external onlyOwner {
        require(lockedBalances[token] >= amount, "MockBridge: insufficient locked");
        lockedBalances[token] -= amount;
        require(IERC20(token).transfer(recipient, amount), "MockBridge: transfer failed");
    }
}
