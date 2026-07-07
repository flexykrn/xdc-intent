// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISolverRegistry.sol";

contract SolverRegistry is ISolverRegistry, Ownable {
    Solver[] public solvers;
    mapping(address => uint256) public solverIdByAddress;
    mapping(address => uint256) public stakes;
    mapping(address => uint256) public withdrawableAmount;
    mapping(address => uint256) public withdrawUnlockTime;

    uint256 public requiredBond;
    address public treasury;

    uint256 public constant WITHDRAW_COOLDOWN = 7 days;

    constructor() Ownable() {
        treasury = msg.sender;
    }

    function setRequiredBond(uint256 amount) external override onlyOwner {
        requiredBond = amount;
    }

    function setTreasury(address _treasury) external override onlyOwner {
        require(_treasury != address(0), "SolverRegistry: zero treasury");
        treasury = _treasury;
    }

    function registerSolver(string calldata name, uint256 feeBps, uint256[] calldata supportedChains) external payable override returns (uint256 solverId) {
        require(bytes(name).length > 0, "SolverRegistry: empty name");
        require(feeBps <= 10000, "SolverRegistry: fee exceeds 100%");
        require(supportedChains.length > 0, "SolverRegistry: no supported chains");
        require(solverIdByAddress[msg.sender] == 0, "SolverRegistry: already registered");
        require(msg.value >= requiredBond, "SolverRegistry: insufficient bond");

        solverId = solvers.length + 1;
        solvers.push(Solver({
            solverAddress: msg.sender,
            name: name,
            feeBps: feeBps,
            active: true,
            registeredAt: block.timestamp,
            supportedChains: supportedChains
        }));
        solverIdByAddress[msg.sender] = solverId;
        stakes[msg.sender] += msg.value;

        emit SolverRegistered(solverId, msg.sender, name, feeBps, supportedChains);
        emit SolverStaked(msg.sender, msg.value);
    }

    function unstake(uint256 amount) external override {
        require(amount > 0, "SolverRegistry: zero unstake");
        require(amount <= stakes[msg.sender], "SolverRegistry: insufficient stake");
        stakes[msg.sender] -= amount;
        withdrawableAmount[msg.sender] += amount;
        withdrawUnlockTime[msg.sender] = block.timestamp + WITHDRAW_COOLDOWN;
        emit SolverStaked(msg.sender, stakes[msg.sender]);
    }

    function withdrawStake() external override {
        uint256 amount = withdrawableAmount[msg.sender];
        require(amount > 0, "SolverRegistry: no withdrawable stake");
        require(block.timestamp >= withdrawUnlockTime[msg.sender], "SolverRegistry: stake locked");
        withdrawableAmount[msg.sender] = 0;
        (bool success, ) = msg.sender.call{value: amount}("");
        require(success, "SolverRegistry: withdraw failed");
        emit StakeWithdrawn(msg.sender, amount);
    }

    function slashSolver(address solver, uint256 amount) external override onlyOwner {
        uint256 id = solverIdByAddress[solver];
        require(id > 0, "SolverRegistry: not registered");
        uint256 totalStake = stakes[solver] + withdrawableAmount[solver];
        uint256 slashAmount = amount > totalStake ? totalStake : amount;
        require(slashAmount > 0, "SolverRegistry: nothing to slash");

        uint256 fromStake = slashAmount <= stakes[solver] ? slashAmount : stakes[solver];
        uint256 fromWithdrawable = slashAmount - fromStake;
        stakes[solver] -= fromStake;
        withdrawableAmount[solver] -= fromWithdrawable;

        Solver storage s = solvers[id - 1];
        if (s.active) {
            s.active = false;
            emit SolverDeactivated(id, solver);
        }

        (bool success, ) = treasury.call{value: slashAmount}("");
        require(success, "SolverRegistry: slash transfer failed");
        emit SolverSlashed(solver, slashAmount, treasury);
    }

    receive() external payable {
        stakes[msg.sender] += msg.value;
    }

    function updateSupportedChains(uint256[] calldata supportedChains) external override {
        require(supportedChains.length > 0, "SolverRegistry: no supported chains");
        uint256 id = solverIdByAddress[msg.sender];
        require(id > 0, "SolverRegistry: not registered");
        solvers[id - 1].supportedChains = supportedChains;
        emit SupportedChainsUpdated(msg.sender, supportedChains);
    }

    function supportsChain(address solver, uint256 chainId) external view override returns (bool) {
        uint256 id = solverIdByAddress[solver];
        if (id == 0) return false;
        Solver storage s = solvers[id - 1];
        if (!s.active) return false;
        for (uint256 i = 0; i < s.supportedChains.length; i++) {
            if (s.supportedChains[i] == chainId) return true;
        }
        return false;
    }

    function deactivateSolver(uint256 solverId) external override onlyOwner {
        require(solverId > 0 && solverId <= solvers.length, "SolverRegistry: invalid solverId");
        Solver storage solver = solvers[solverId - 1];
        require(solver.active, "SolverRegistry: already inactive");
        solver.active = false;
        emit SolverDeactivated(solverId, solver.solverAddress);
    }

    function reactivateSolver(uint256 solverId) external override onlyOwner {
        require(solverId > 0 && solverId <= solvers.length, "SolverRegistry: invalid solverId");
        Solver storage solver = solvers[solverId - 1];
        require(!solver.active, "SolverRegistry: already active");
        solver.active = true;
        emit SolverReactivated(solverId, solver.solverAddress);
    }

    function isRegistered(address solver) external view override returns (bool) {
        uint256 id = solverIdByAddress[solver];
        if (id == 0) return false;
        return solvers[id - 1].active;
    }

    function getSolver(uint256 solverId) external view override returns (Solver memory) {
        require(solverId > 0 && solverId <= solvers.length, "SolverRegistry: invalid solverId");
        return solvers[solverId - 1];
    }

    function getSolverCount() external view override returns (uint256) {
        return solvers.length;
    }

    function getSolverByAddress(address solver) external view override returns (Solver memory) {
        uint256 id = solverIdByAddress[solver];
        require(id > 0, "SolverRegistry: not registered");
        return solvers[id - 1];
    }

    function getStake(address solver) external view override returns (uint256) {
        return stakes[solver];
    }

    function getWithdrawableStake(address solver) external view override returns (uint256) {
        return withdrawableAmount[solver];
    }

    function getWithdrawUnlockTime(address solver) external view override returns (uint256) {
        return withdrawUnlockTime[solver];
    }
}
