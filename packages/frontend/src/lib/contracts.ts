import { ethers } from "ethers";

export const CONTRACTS = {
  intentRegistry: "0xC3C09573e4E4D6da363cf32f7923760ec80ec904",
  escrow: "0x8cD60D4235ee2966B89eCa41B7Fe31392512b3a6",
  paymentVerifier: "0x46CD0bb7Ba59275b58A865439df1D5F11aA1E288",
};

export const TOKENS = {
  mockUSDC: "0x38bBd638AbCB44BDa788eBe382ee224b4f1F2f52",
  mockXDC: "0xBdff490ba4a9F14D9FCD07e56930A6fAC928d535",
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
  "function isIntentPending(bytes32 intentId) external view returns (bool)",
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
