import { ethers } from "ethers";

export const CONTRACTS = {
  intentRegistry: "0x441f5e07E6FC807E73454B4318ba487e05e65625",
  escrow: "0x5c6fb5D7E81e11C303e5cE00fBE7AE748a47690d",
  paymentVerifier: "0x6Ce223bD961217917aa16654E77A6A440f35A70A",
  solverRegistry: "0x4F87a92E3950ec53AFC1776F14Af33c6E9aab360",
  mockBridge: "0xB494122Fb840D928d0f0F98E69985a85E9EBC139",
};

export const TOKENS = {
  mockUSDC: "0x86530A99784D188e8343e119140114d9e5fD0546",
  mockXDC: "0xfe4E746cA450C46Fe6Ede5EAc184A7F2082B2312",
};

export const RPC_URL = "https://erpc.apothem.network";

export const INTENT_REGISTRY_ABI = [
  "function submitIntent(tuple(uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, address[] allowedSolvers) calldata intent, bytes calldata signature) external returns (bool)",
  "function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash) external returns (bool)",
  "function cancelIntent(bytes32 intentId) external",
  "function cancelExpiredIntents(bytes32[] calldata intentIds) external",
  "function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId, address user, uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, bytes signature, address[] allowedSolvers, uint8 status, address solver, uint256 fulfilledAmount, bytes32 paymentTxHash))",
  "function getUserIntents(address user) external view returns (bytes32[])",
  "function getUserNonce(address user) external view returns (uint256)",
  "function getTotalIntents() external view returns (uint256)",
  "function totalIntents() external view returns (uint256)",
  "function totalIntentsFulfilled() external view returns (uint256)",
  "event IntentSubmitted(bytes32 indexed intentId, address indexed user, address sourceToken, uint256 sourceAmount, address destToken, uint256 minDestAmount, uint256 expiry)",
  "event IntentFulfilled(bytes32 indexed intentId, address indexed solver, uint256 destAmount, bytes32 paymentTxHash)",
  "event IntentCancelled(bytes32 indexed intentId)",
];

export const SOLVER_REGISTRY_ABI = [
  "function registerSolver(string memory name, uint256 feeBps, uint256[] memory supportedChains) external returns (uint256)",
  "function updateSupportedChains(uint256[] calldata supportedChains) external",
  "function supportsChain(address solver, uint256 chainId) external view returns (bool)",
  "function deactivateSolver(uint256 solverId) external",
  "function reactivateSolver(uint256 solverId) external",
  "function isRegistered(address solver) external view returns (bool)",
  "function getSolver(uint256 solverId) external view returns (tuple(address solverAddress, string name, uint256 feeBps, bool active, uint256 registeredAt, uint256[] supportedChains))",
  "function getSolverCount() external view returns (uint256)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
];

export const provider = new ethers.JsonRpcProvider(RPC_URL);
