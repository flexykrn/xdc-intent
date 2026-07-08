import { ethers } from "ethers";
import apothemDeployment from "../../../contracts/deployments/apothem.json";
import lzTestnetDeployment from "../../../contracts/deployments/lz-testnet.json";

export interface ContractAddresses {
  intentRegistry: string;
  escrow: string;
  paymentVerifier: string;
  solverRegistry: string;
  mockBridge?: string;
  intentLZBridge?: string;
}

export const CONTRACTS: ContractAddresses = {
  intentRegistry: "0xfe1887C1686cF54d83107DAf7Ad7F5A5Ea95419b",
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

export const SUPPORTED_CHAIN_IDS = [51, 11155111, 421614];
export const DEFAULT_CHAIN_ID = 51;

export const CHAIN_RPC_URLS: Record<number, string> = {
  51: process.env.NEXT_PUBLIC_APOTHEM_RPC_URL || "https://erpc.apothem.network",
  11155111: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
  421614: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
};

export const CHAIN_METADATA: Record<
  number,
  {
    chainId: string;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  }
> = {
  51: {
    chainId: "0x33",
    chainName: "XDC Apothem Testnet",
    nativeCurrency: { name: "XDC", symbol: "XDC", decimals: 18 },
    rpcUrls: [CHAIN_RPC_URLS[51]],
    blockExplorerUrls: ["https://testnet.xdcscan.com"],
  },
  11155111: {
    chainId: "0xaa36a7",
    chainName: "Sepolia Testnet",
    nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: [CHAIN_RPC_URLS[11155111]],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
  },
  421614: {
    chainId: "0x66eee",
    chainName: "Arbitrum Sepolia Testnet",
    nativeCurrency: { name: "Arbitrum Sepolia ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: [CHAIN_RPC_URLS[421614]],
    blockExplorerUrls: ["https://sepolia.arbiscan.io"],
  },
};

export function getContractAddresses(chainId: number): ContractAddresses {
  switch (chainId) {
    case 51: {
      const contracts = (apothemDeployment as { contracts: Record<string, string> }).contracts;
      return {
        intentRegistry: contracts.IntentRegistry,
        escrow: contracts.Escrow,
        paymentVerifier: contracts.PaymentVerifier,
        solverRegistry: contracts.SolverRegistry,
        mockBridge: contracts.MockBridge,
      };
    }
    case 11155111: {
      const contracts = (lzTestnetDeployment as { contracts: Record<string, string> }).contracts;
      return {
        intentRegistry: contracts.IntentRegistry,
        escrow: contracts.Escrow,
        paymentVerifier: contracts.PaymentVerifier,
        solverRegistry: contracts.SolverRegistry,
        intentLZBridge: contracts.IntentLZBridge,
      };
    }
    case 421614: {
      const arbitrum = (lzTestnetDeployment as { arbitrumSepolia: { contracts: Record<string, string> } }).arbitrumSepolia;
      return {
        intentRegistry: "",
        escrow: "",
        paymentVerifier: "",
        solverRegistry: "",
        intentLZBridge: arbitrum.contracts.IntentLZBridge,
      };
    }
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
}

export const INTENT_REGISTRY_ABI = [
  "function submitIntent(tuple(uint256 sourceChainId, address sourceToken, uint256 sourceAmount, uint256 destChainId, address destToken, uint256 minDestAmount, uint256 maxSolverFee, uint256 expiry, uint256 nonce, address[] allowedSolvers) calldata intent, bytes calldata signature) external returns (bool)",
  "function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash, address solver) external returns (bool)",
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
  "function requiredBond() external view returns (uint256)",
  "function treasury() external view returns (address)",
  "function registerSolver(string memory name, uint256 feeBps, uint256[] memory supportedChains) external payable returns (uint256)",
  "function updateSupportedChains(uint256[] calldata supportedChains) external",
  "function supportsChain(address solver, uint256 chainId) external view returns (bool)",
  "function deactivateSolver(uint256 solverId) external",
  "function reactivateSolver(uint256 solverId) external",
  "function slashSolver(address solver, uint256 amount) external",
  "function unstake(uint256 amount) external",
  "function withdrawStake() external",
  "function getStake(address solver) external view returns (uint256)",
  "function getWithdrawableStake(address solver) external view returns (uint256)",
  "function getWithdrawUnlockTime(address solver) external view returns (uint256)",
  "function isRegistered(address solver) external view returns (bool)",
  "function getSolver(uint256 solverId) external view returns (tuple(address solverAddress, string name, uint256 feeBps, bool active, uint256 registeredAt, uint256[] supportedChains))",
  "function getSolverCount() external view returns (uint256)",
  "event SolverRegistered(uint256 indexed solverId, address indexed solverAddress, string name, uint256 feeBps, uint256[] supportedChains)",
  "event SolverStaked(address indexed solver, uint256 amount)",
  "event SolverSlashed(address indexed solver, uint256 amount, address indexed treasury)",
  "event StakeWithdrawn(address indexed solver, uint256 amount)",
  "event SolverDeactivated(uint256 indexed solverId, address indexed solverAddress)",
  "event SolverReactivated(uint256 indexed solverId, address indexed solverAddress)",
  "event SupportedChainsUpdated(address indexed solverAddress, uint256[] supportedChains)",
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
