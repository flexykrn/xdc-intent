import { ethers } from "ethers";

export const CONTRACTS = {
  intentRegistry: "0x443Ba13baE4D122430737B72eA90E821F3C015Dc",
  escrow: "0x972E97d4898AfDF642627C3E05b105fCAc3F84D4",
  paymentVerifier: "0xf15AE12caF60fFA09CAcd6f823187aDC2fe4AeC6",
};

export const TOKENS = {
  mockUSDC: "0xa3f37BBd132C6DA9088B4A63622CacbCBee394A4",
  mockXDC: "0x6DC37E3ca98E49e923E953c5A7229726513eaf6E",
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

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
];

export const provider = new ethers.JsonRpcProvider(RPC_URL);
