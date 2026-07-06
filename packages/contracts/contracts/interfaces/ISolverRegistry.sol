// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISolverRegistry {
    struct Solver {
        address solverAddress;
        string name;
        uint256 feeBps;
        bool active;
        uint256 registeredAt;
        uint256[] supportedChains;
    }

    function registerSolver(string calldata name, uint256 feeBps, uint256[] calldata supportedChains) external returns (uint256 solverId);
    function updateSupportedChains(uint256[] calldata supportedChains) external;
    function supportsChain(address solver, uint256 chainId) external view returns (bool);
    function deactivateSolver(uint256 solverId) external;
    function reactivateSolver(uint256 solverId) external;
    function isRegistered(address solver) external view returns (bool);
    function getSolver(uint256 solverId) external view returns (Solver memory);
    function getSolverCount() external view returns (uint256);
    function getSolverByAddress(address solver) external view returns (Solver memory);

    event SolverRegistered(uint256 indexed solverId, address indexed solverAddress, string name, uint256 feeBps, uint256[] supportedChains);
    event SolverDeactivated(uint256 indexed solverId, address indexed solverAddress);
    event SolverReactivated(uint256 indexed solverId, address indexed solverAddress);
    event SupportedChainsUpdated(address indexed solverAddress, uint256[] supportedChains);
}
