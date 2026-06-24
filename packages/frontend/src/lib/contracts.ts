import { ethers } from "ethers";

export const CONTRACTS = {
  intentRegistry: "0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf",
  escrow: "0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09",
  paymentVerifier: "0x14699d436E3c5d870A7C6aC3825C500C8f86d270",
  solverRegistry: "0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb",
  mevProtection: "0xC1C3eE61Cdde366Bc48D81e367D9D62D91Fb6b42",
  gaslessExecutor: "0x2C6024bDA3b1dc6662a84210536894eFC702f0b0",
  smartAccountFactory: "0x9c64167F39A14FBd6A25608703F1A3a795A4aFa9",
  crossChainBridge: "0x84ebBc1CD02E083A368C3E775a69c50138c65426",
  solverIncentivePool: "0xFA2db0D89d06869fbe29771705a2C4A5428cCdF7",
  relayerNetwork: "0x7c6201Afa63A37336d8B8FF7CF57498AB3D4E8dd",
  rewardToken: "0x148D54159656D8D8c36240c7cD73ce80e239e137",
  dexRouter: "0x118c8D5aF4dd9E2139b653d3c4c37995aC4B1B5c",
  dexFactory: "0xa18a6A4F0B469aA4F2c7C5eE5C8B2a0b2D6E5F0",
  dexPair: "0x69a11B8F6bD5e1b2b2F3E5c4d5e6f7a8b9c0d1e2",
};

export const RPC_URL = "https://apothem.xdcrpc.com";

export const INTENT_REGISTRY_ABI = [
  "function createIntent(bytes32 intentId, address token, uint256 amount, uint256 expiryTimestamp) external",
  "function getTotalIntents() view returns (uint256)",
  "function getTotalIntentsFulfilled() view returns (uint256)",
  "function getUserIntents(address user) view returns (bytes32[])",
  "function getIntent(bytes32 intentId) view returns (tuple(bytes32,address,address,address,uint256,uint256,uint256,uint8,bytes32,uint256,uint256))",
  "function cancelIntent(bytes32 intentId) external",
  "event IntentCreated(bytes32 indexed intentId, address indexed user, address token, uint256 amount, uint256 protocolFee, uint256 expiryTimestamp)",
  "event IntentFulfilled(bytes32 indexed intentId, address indexed solver, uint256 amountOut)",
  "event IntentCancelled(bytes32 indexed intentId)",
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
];

export const SOLVER_REGISTRY_ABI = [
  "function registerSolver(string calldata name, string calldata endpoint) external payable",
  "function solverList(uint256) view returns (address)",
  "function isSolver(address) view returns (bool)",
];

export const provider = new ethers.JsonRpcProvider(RPC_URL);
