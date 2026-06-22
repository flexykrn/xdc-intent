import { ethers } from 'ethers';

// Contract ABIs (minimal for frontend)
export const INTENT_REGISTRY_ABI = [
  'function createIntent(bytes32 intentId, address token, uint256 amount, uint256 expiryTimestamp) external returns (bool)',
  'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 id, address user, address solver, address token, uint256 amount, uint256 protocolFee, uint256 expiryTimestamp, uint8 status, bytes32 paymentProofHash, uint256 createdAt, uint256 fulfilledAt))',
  'function getUserIntents(address user) external view returns (bytes32[])',
  'function getTotalIntents() external view returns (uint256)',
  'function getTotalIntentsFulfilled() external view returns (uint256)',
  'function isIntentPending(bytes32 intentId) external view returns (bool)',
  'event IntentCreated(bytes32 indexed intentId, address indexed user, address indexed token, uint256 amount, uint256 protocolFee, uint256 expiryTimestamp)',
  'event IntentFulfilled(bytes32 indexed intentId, address indexed solver, uint256 amount, uint256 protocolFee, uint256 fulfilledAt)',
];

export const MEV_PROTECTION_ABI = [
  'function commitIntent(bytes32 _intentHash) external',
  'function createBatch(bytes32[] calldata _intentIds) external returns (uint256)',
  'function getCommitment(bytes32 _commitmentHash) external view returns (tuple(bytes32 intentHash, uint256 commitBlock, uint256 revealBlock, bool revealed, bool executed, address committer))',
  'function getBatch(uint256 _batchId) external view returns (bytes32[] memory intentIds, uint256 startBlock, uint256 endBlock, uint256 minBid, address winningSolver, bool settled)',
  'function COMMIT_DELAY() view returns (uint256)',
  'function REVEAL_WINDOW() view returns (uint256)',
  'event IntentCommitted(bytes32 indexed commitmentHash, bytes32 intentHash, uint256 blockNumber)',
  'event BatchCreated(uint256 indexed batchId, uint256 startBlock, uint256 endBlock)',
];

export const SOLVER_REGISTRY_ABI = [
  'function isRegistered(address _solver) external view returns (bool)',
  'function getActiveSolversCount() external view returns (uint256)',
  'function getSolverList() external view returns (address[])',
];

// Contract addresses (Apothem testnet)
export const CONTRACTS = {
  intentRegistry: '0x20F97dF1A67D11E4edC863245b34ca9EC35e83Bf',
  mevProtection: '0xC1C3eE61Cdde366Bc48D81e367D9D62D91Fb6b42',
  solverRegistry: '0x9548A14e1fb168C71bDbfD9A2fd4449F0D2B2fbb',
  escrow: '0x32E7Fd003B5f337Ca61dbF6E22FA92EF28BFAB09',
  paymentVerifier: '0x14699d436E3c5d870A7C6aC3825C500C8f86d270',
};

// RPC endpoints
export const RPC_URLS = [
  'https://erpc.apothem.network',
  'https://rpc.apothem.network',
];

// XDC Network config
export const XDC_NETWORK = {
  chainId: '0x33', // 51 in decimal
  chainName: 'XDC Apothem Testnet',
  nativeCurrency: {
    name: 'TXDC',
    symbol: 'TXDC',
    decimals: 18,
  },
  rpcUrls: RPC_URLS,
  blockExplorerUrls: ['https://apothem.xinfinscan.com'],
};

// Create provider
export function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URLS[0]);
}

// Create contract instances
export function getIntentRegistry(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACTS.intentRegistry, INTENT_REGISTRY_ABI, signerOrProvider);
}

export function getMEVProtection(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACTS.mevProtection, MEV_PROTECTION_ABI, signerOrProvider);
}

export function getSolverRegistry(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACTS.solverRegistry, SOLVER_REGISTRY_ABI, signerOrProvider);
}
