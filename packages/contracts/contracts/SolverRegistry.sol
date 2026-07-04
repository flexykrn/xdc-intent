// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ISolverRegistry.sol";

contract SolverRegistry is ISolverRegistry, Ownable {
    Solver[] public solvers;
    mapping(address => uint256) public solverIdByAddress;

    constructor() Ownable() {}

    function registerSolver(string calldata name, uint256 feeBps) external override returns (uint256 solverId) {
        require(bytes(name).length > 0, "SolverRegistry: empty name");
        require(feeBps <= 10000, "SolverRegistry: fee exceeds 100%");
        require(solverIdByAddress[msg.sender] == 0, "SolverRegistry: already registered");

        solverId = solvers.length + 1;
        solvers.push(Solver({
            solverAddress: msg.sender,
            name: name,
            feeBps: feeBps,
            active: true,
            registeredAt: block.timestamp
        }));
        solverIdByAddress[msg.sender] = solverId;

        emit SolverRegistered(solverId, msg.sender, name, feeBps);
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
}
