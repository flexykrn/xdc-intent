# XDCIntent V1 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Rebuild the XDCIntent framework to match the approved architecture document, while keeping the existing Next.js frontend. Deliver a working XDC-only end-to-end demo: create intent → solver detects → x402-style payment → solver fulfills → user receives output tokens.

**Architecture:** Use a monorepo with existing packages (contracts, sdk, solver, middleware, frontend, shared types) and shared constants. Rewrite the core contracts to use the plan's `IntentParams` + EIP-712 `submitIntent`, `fulfillIntent(intentId, destAmount, paymentTxHash)`, and `cancelIntent` flow. The solver polls `IntentSubmitted` events, requests a 402 payment from a facilitator, pays the facilitator on-chain, submits the tx hash as proof, and calls `fulfillIntent`. Frontend stays Next.js + ethers and is updated to the new intent form fields.

**Tech Stack:** Solidity 0.8.19+, Hardhat, ethers.js v6, Node.js + TypeScript, Express, better-sqlite3, Next.js 15+, Tailwind CSS.

---

## Table of Contents

1. [Context & Assumptions](#context--assumptions)
2. [Phase 1: Repository Cleanup & Shared Packages](#phase-1-repository-cleanup--shared-packages)
3. [Phase 2: Smart Contract Rewrite](#phase-2-smart-contract-rewrite)
4. [Phase 3: Agent SDK](#phase-3-agent-sdk)
5. [Phase 4: x402-Style Facilitator](#phase-4-x402-style-facilitator)
6. [Phase 5: Solver Engine](#phase-5-solver-engine)
7. [Phase 6: Frontend Update](#phase-6-frontend-update)
8. [Phase 7: Local End-to-End Test](#phase-7-local-end-to-end-test)
9. [Phase 8: Apothem Testnet Deployment](#phase-8-apothem-testnet-deployment)
10. [Phase 9: Testnet End-to-End Test](#phase-9-testnet-end-to-end-test)
11. [Risks & Mitigations](#risks--mitigations)
12. [Timeline Estimate](#timeline-estimate)

---

## Context & Assumptions

- The approved implementation plan describes: `IntentParams` with source/dest chain, token, amount, minDestAmount, maxSolverFee, expiry, nonce, signature, allowedSolvers; `submitIntent(IntentParams, signature)`; `fulfillIntent(intentId, destAmount, paymentTxHash)`; `cancelIntent(intentId)`; `PaymentVerifier` verifying on-chain ERC-20 payment tx hashes; `Escrow` with token allowlist; optional cross-chain and XSwap V3 in later phases.
- Current repo has a different contract API: `createIntent(intentId, token, amount, expiryTimestamp)`, `fulfillIntentWithBytes(intentId, solver, paymentProofBytes)`, `cancelIntent(intentId)`.
- Current solver is broken mock code. SDK is a stub. Middleware is fake 402. Frontend is Next.js and will be kept.
- This plan scopes V1 to XDC-only (source chain = dest chain = XDC Apothem). No LayerZero/Stargate in V1. XSwap V3 is replaced with a direct-token-transfer / mock swap for the demo unless real Apothem addresses are provided.
- x402 is implemented as a simplified manual flow matching the plan's description: facilitator returns 402 JSON, solver pays ERC-20 on-chain, attaches tx hash, facilitator verifies transfer, issues signed fulfillment authorization. We do NOT use `@x402/*` packages in V1 to avoid unknown network support issues.
- All code uses XDC-normalized addresses (`xdc...`) only for display; contract/storage logic uses `0x...` prefix.
- Private keys are read from environment variables and never committed.

### Current state snapshot

- Monorepo: npm workspaces + turbo, packages: `contracts`, `sdk`, `solver`, `middleware`, `frontend`, `bridge`, `dex`, `subgraph`, plus `shared/types`, `shared/constants`, `shared/utils`.
- Contracts: 19 Solidity files in `packages/contracts/contracts/`. Core contracts: `IntentRegistry.sol`, `Escrow.sol`, `PaymentVerifier.sol` plus many extra modules not in the plan.
- SDK: `packages/sdk` has minimal test scaffolding.
- Solver: `packages/solver` has broken mock watcher/strategy/submitter.
- Middleware: `packages/middleware` has fake 402 endpoints.
- Frontend: `packages/frontend` Next.js 15+ app with custom UI components.

---

## Phase 1: Repository Cleanup & Shared Packages

**Objective:** Remove dead code, standardize shared types/constants, and make the workspace build cleanly before rewriting core logic.

### Task 1.1: Delete dead contracts

**Files:**
- Delete: `packages/contracts/contracts/BatchAuctionSettlement.sol`
- Delete: `packages/contracts/contracts/CrossChainBridgeAdapter.sol`
- Delete: `packages/contracts/contracts/CrossChainIntentBridge.sol`
- Delete: `packages/contracts/contracts/DutchAuctionRFQ.sol`
- Delete: `packages/contracts/contracts/GaslessIntentExecutor.sol`
- Delete: `packages/contracts/contracts/MEVProtection.sol`
- Delete: `packages/contracts/contracts/PartialFulfillmentModule.sol`
- Delete: `packages/contracts/contracts/Permit2IntentModule.sol`
- Delete: `packages/contracts/contracts/RelayerNetwork.sol`
- Delete: `packages/contracts/contracts/SmartAccount.sol`
- Delete: `packages/contracts/contracts/SolverIncentiveManager.sol`
- Delete: `packages/contracts/contracts/SolverIncentivePool.sol`
- Delete: `packages/contracts/contracts/UpgradeableIntentRegistry.sol`
- Keep: `IntentRegistry.sol`, `Escrow.sol`, `PaymentVerifier.sol`, `SolverRegistry.sol`, `PriceOracle.sol`, `MockERC20.sol` (for testnet). Delete `SolverRegistry.sol` and `PriceOracle.sol` if not used in V1 (decide after Task 2.1).

**Step 1: Remove files**

```bash
cd /mnt/c/Users/karan/Desktop/openscans/xdc-intent/packages/contracts/contracts
rm -f BatchAuctionSettlement.sol CrossChainBridgeAdapter.sol CrossChainIntentBridge.sol \
  DutchAuctionRFQ.sol GaslessIntentExecutor.sol MEVProtection.sol \
  PartialFulfillmentModule.sol Permit2IntentModule.sol RelayerNetwork.sol \
  SmartAccount.sol SolverIncentiveManager.sol SolverIncentivePool.sol \
  UpgradeableIntentRegistry.sol
```

**Step 2: Verify compile still works**

Run: `npm run build -w @xdc-intent/contracts`
Expected: compiles remaining contracts without errors.

**Step 3: Commit**

```bash
git add .
git commit -m "Remove unused contracts not in V1 architecture plan"
```

---

### Task 1.2: Consolidate shared packages

**Objective:** Create a single source of truth for intent types, addresses, and ABIs.

**Files:**
- Create: `shared/types/src/index.ts`
- Create: `shared/constants/src/index.ts`
- Modify: `shared/types/package.json`
- Modify: `shared/constants/package.json`
- Delete: `shared/utils` if not needed (move any used code into `shared/types` or `shared/constants`).

**Step 1: Write shared types package**

File: `shared/types/src/index.ts`

```typescript
export enum IntentStatus {
  Open = 0,
  Fulfilled = 1,
  Cancelled = 2,
  Expired = 3,
}

export interface IntentParams {
  user: string;
  sourceChainId: number;
  sourceToken: string;
  sourceAmount: string; // bigint as string
  destChainId: number;
  destToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  expiry: number;
  nonce: number;
  allowedSolvers: string[];
}

export interface StoredIntent extends IntentParams {
  intentId: string;
  status: IntentStatus;
  solver: string;
  fulfilledAmount: string;
  paymentTxHash: string;
  signature: string;
}

export interface PaymentRequest {
  amount: string;
  recipient: string;
  nonce: string;
  asset: string;
  chainId: string;
  intentId: string;
  payer: string;
  message: string;
}

export interface PaymentProof {
  intentId: string;
  solver: string;
  token: string;
  amount: string;
  protocolFee: string;
  expiryTimestamp: number;
  chainId: number;
  signature: string;
  middlewareAddress: string;
}
```

**Step 2: Write shared constants package**

File: `shared/constants/src/index.ts`

```typescript
export const XDC_APOTHEM_CHAIN_ID = 51;
export const XDC_MAINNET_CHAIN_ID = 50;
export const CAIP2_APOTHEM = 'eip155:51';
export const CAIP2_MAINNET = 'eip155:50';

export const INTENT_REGISTRY_NAME = 'XDCIntents';
export const INTENT_REGISTRY_VERSION = '1';

export const SUPPORTED_TOKENS: Record<number, { name: string; symbol: string; address: string; decimals: number }[]> = {
  51: [
    { name: 'Mock USDC', symbol: 'mUSDC', address: '', decimals: 6 },
    { name: 'Mock XDC', symbol: 'mXDC', address: '', decimals: 18 },
  ],
  50: [
    { name: 'USDC', symbol: 'USDC', address: '', decimals: 6 },
    { name: 'XDC', symbol: 'XDC', address: '', decimals: 18 },
  ],
};

// Placeholders to be populated by deployment scripts
export const ADDRESSES: Record<number, { intentRegistry: string; escrow: string; paymentVerifier: string; mockUsdc: string; mockXdc: string }> = {
  51: { intentRegistry: '', escrow: '', paymentVerifier: '', mockUsdc: '', mockXdc: '' },
  50: { intentRegistry: '', escrow: '', paymentVerifier: '', mockUsdc: '', mockXdc: '' },
};
```

**Step 3: Update package.json files to export `./src/index.ts`**

Modify `shared/types/package.json` and `shared/constants/package.json`:

```json
{
  "name": "@xdc-intent/types",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.3.3"
  }
}
```

**Step 4: Delete `shared/utils` if empty/unused**

```bash
cd /mnt/c/Users/karan/Desktop/openscans/xdc-intent
rm -rf shared/utils
```

**Step 5: Verify workspace references**

Update root `package.json` workspaces if needed:

```json
"workspaces": ["packages/*", "shared/*"]
```

Run: `npm install` from root
Expected: installs successfully.

**Step 6: Commit**

```bash
git add .
git commit -m "Add shared types and constants packages for intent framework"
```

---

### Task 1.3: Add workspace dependency references

**Objective:** Make sdk, solver, middleware, and frontend depend on shared packages.

**Files:**
- Modify: `packages/sdk/package.json`
- Modify: `packages/solver/package.json`
- Modify: `packages/middleware/package.json`
- Modify: `packages/frontend/package.json`

**Step 1: Add dependency entries**

In each package.json, add:

```json
"dependencies": {
  "@xdc-intent/types": "1.0.0",
  "@xdc-intent/constants": "1.0.0"
}
```

**Step 2: Run install**

```bash
npm install
```

Expected: workspace symlinks created.

**Step 3: Commit**

```bash
git add .
git commit -m "Wire shared workspace dependencies into sdk, solver, middleware, frontend"
```

---

## Phase 2: Smart Contract Rewrite

**Objective:** Rewrite `IntentRegistry.sol`, `Escrow.sol`, and `PaymentVerifier.sol` to match the plan's V1 API. Keep them minimal, testable, and aligned with the SDK.

### Task 2.1: Rewrite PaymentVerifier to verify on-chain ERC-20 transfers

**Files:**
- Create: `packages/contracts/contracts/interfaces/IPaymentVerifier.sol`
- Modify: `packages/contracts/contracts/PaymentVerifier.sol`

**Step 1: Write interface**

File: `packages/contracts/contracts/interfaces/IPaymentVerifier.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IPaymentVerifier {
    function verifyPayment(
        bytes32 paymentTxHash,
        address payer,
        address payee,
        uint256 amount,
        bytes32 intentId
    ) external returns (bool valid);

    function registerFacilitator(address facilitator) external;
    function revokeFacilitator(address facilitator) external;
    function isVerified(bytes32 intentId) external view returns (bool);

    event PaymentVerified(bytes32 indexed intentId, address indexed payer, uint256 amount);
    event FacilitatorRegistered(address indexed facilitator);
    event FacilitatorRevoked(address indexed facilitator);
}
```

**Step 2: Rewrite PaymentVerifier.sol**

File: `packages/contracts/contracts/PaymentVerifier.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IPaymentVerifier.sol";

contract PaymentVerifier is Ownable, IPaymentVerifier {
    mapping(address => bool) public facilitators;
    mapping(bytes32 => bool) public verifiedPayments;

    constructor() Ownable() {}

    function registerFacilitator(address facilitator) external onlyOwner {
        require(facilitator != address(0), "PaymentVerifier: zero address");
        facilitators[facilitator] = true;
        emit FacilitatorRegistered(facilitator);
    }

    function revokeFacilitator(address facilitator) external onlyOwner {
        facilitators[facilitator] = false;
        emit FacilitatorRevoked(facilitator);
    }

    function verifyPayment(
        bytes32 paymentTxHash,
        address payer,
        address payee,
        uint256 amount,
        bytes32 intentId
    ) external returns (bool valid) {
        require(facilitators[msg.sender], "PaymentVerifier: not facilitator");
        require(!verifiedPayments[intentId], "PaymentVerifier: already verified");
        require(paymentTxHash != bytes32(0), "PaymentVerifier: zero tx hash");

        // In V1, the facilitator attests it has verified the ERC-20 transfer off-chain.
        // The contract records the attestation and prevents replay.
        // Future: verify logs inside the contract with a proof.
        verifiedPayments[intentId] = true;
        emit PaymentVerified(intentId, payer, amount);
        return true;
    }

    function isVerified(bytes32 intentId) external view returns (bool) {
        return verifiedPayments[intentId];
    }
}
```

**Step 3: Verify compile**

Run: `npm run build -w @xdc-intent/contracts`
Expected: compiles.

**Step 4: Commit**

```bash
git add .
git commit -m "Rewrite PaymentVerifier to record facilitator attestations for x402 payment tx hashes"
```

---

### Task 2.2: Rewrite Escrow to plan spec

**Files:**
- Create: `packages/contracts/contracts/interfaces/IEscrow.sol`
- Modify: `packages/contracts/contracts/Escrow.sol`

**Step 1: Write interface**

File: `packages/contracts/contracts/interfaces/IEscrow.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IEscrow {
    function lockTokens(address token, uint256 amount, bytes32 intentId, address user) external;
    function releaseTokens(address token, uint256 amount, address recipient, bytes32 intentId) external;
    function refundTokens(bytes32 intentId) external;
    function setRegistry(address registry) external;
    function addAllowedToken(address token) external;
    function removeAllowedToken(address token) external;
    function isTokenAllowed(address token) external view returns (bool);

    event TokensLocked(bytes32 indexed intentId, address indexed token, uint256 amount, address user);
    event TokensReleased(bytes32 indexed intentId, address indexed token, uint256 amount, address recipient);
    event TokensRefunded(bytes32 indexed intentId, address indexed token, uint256 amount, address user);
}
```

**Step 2: Rewrite Escrow.sol**

File: `packages/contracts/contracts/Escrow.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IEscrow.sol";

contract Escrow is Ownable, ReentrancyGuard, IEscrow {
    using SafeERC20 for IERC20;

    address public registry;
    mapping(address => bool) public allowedTokens;
    mapping(bytes32 => address) public intentToken;
    mapping(bytes32 => uint256) public intentAmount;
    mapping(bytes32 => address) public intentUser;

    modifier onlyRegistry() {
        require(msg.sender == registry, "Escrow: only registry");
        _;
    }

    constructor() Ownable() {}

    function setRegistry(address _registry) external onlyOwner {
        require(_registry != address(0), "Escrow: zero address");
        registry = _registry;
    }

    function addAllowedToken(address token) external onlyOwner {
        require(token != address(0), "Escrow: zero address");
        allowedTokens[token] = true;
    }

    function removeAllowedToken(address token) external onlyOwner {
        allowedTokens[token] = false;
    }

    function lockTokens(address token, uint256 amount, bytes32 intentId, address user) external onlyRegistry nonReentrant {
        require(allowedTokens[token], "Escrow: token not allowed");
        require(amount > 0, "Escrow: zero amount");
        require(intentToken[intentId] == address(0), "Escrow: intent already exists");

        IERC20(token).safeTransferFrom(user, address(this), amount);

        intentToken[intentId] = token;
        intentAmount[intentId] = amount;
        intentUser[intentId] = user;

        emit TokensLocked(intentId, token, amount, user);
    }

    function releaseTokens(address token, uint256 amount, address recipient, bytes32 intentId) external onlyRegistry nonReentrant {
        require(intentToken[intentId] == token, "Escrow: token mismatch");
        require(intentAmount[intentId] >= amount, "Escrow: insufficient amount");
        require(recipient != address(0), "Escrow: zero recipient");

        intentAmount[intentId] -= amount;
        if (intentAmount[intentId] == 0) {
            delete intentToken[intentId];
            delete intentUser[intentId];
        }

        IERC20(token).safeTransfer(recipient, amount);
        emit TokensReleased(intentId, token, amount, recipient);
    }

    function refundTokens(bytes32 intentId) external onlyRegistry nonReentrant {
        address token = intentToken[intentId];
        uint256 amount = intentAmount[intentId];
        address user = intentUser[intentId];
        require(token != address(0), "Escrow: intent not found");

        delete intentToken[intentId];
        delete intentAmount[intentId];
        delete intentUser[intentId];

        IERC20(token).safeTransfer(user, amount);
        emit TokensRefunded(intentId, token, amount, user);
    }

    function isTokenAllowed(address token) external view returns (bool) {
        return allowedTokens[token];
    }
}
```

**Step 3: Verify compile**

Run: `npm run build -w @xdc-intent/contracts`
Expected: compiles.

**Step 4: Commit**

```bash
git add .
git commit -m "Rewrite Escrow to plan spec with token allowlist and registry-only access"
```

---

### Task 2.3: Rewrite IntentRegistry to plan spec

**Files:**
- Create: `packages/contracts/contracts/interfaces/IIntentRegistry.sol`
- Modify: `packages/contracts/contracts/IntentRegistry.sol`

**Step 1: Write interface**

File: `packages/contracts/contracts/interfaces/IIntentRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./IEscrow.sol";
import "./IPaymentVerifier.sol";

interface IIntentRegistry {
    struct Intent {
        bytes32 intentId;
        address user;
        uint256 sourceChainId;
        address sourceToken;
        uint256 sourceAmount;
        uint256 destChainId;
        address destToken;
        uint256 minDestAmount;
        uint256 maxSolverFee;
        uint256 expiry;
        uint256 nonce;
        bytes signature;
        address[] allowedSolvers;
        IntentStatus status;
        address solver;
        uint256 fulfilledAmount;
        bytes32 paymentTxHash;
    }

    enum IntentStatus { Open, Fulfilled, Cancelled, Expired }

    struct IntentParams {
        address user;
        uint256 sourceChainId;
        address sourceToken;
        uint256 sourceAmount;
        uint256 destChainId;
        address destToken;
        uint256 minDestAmount;
        uint256 maxSolverFee;
        uint256 expiry;
        uint256 nonce;
        address[] allowedSolvers;
    }

    function submitIntent(IntentParams calldata intent, bytes calldata signature) external returns (bytes32 intentId);
    function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash) external returns (bool success);
    function cancelIntent(bytes32 intentId) external;
    function cancelExpiredIntents(bytes32[] calldata intentIds) external;
    function getIntent(bytes32 intentId) external view returns (Intent memory);
    function getUserNonce(address user) external view returns (uint256);
    function getUserIntents(address user) external view returns (bytes32[] memory);

    event IntentSubmitted(
        bytes32 indexed intentId,
        address indexed user,
        address sourceToken,
        uint256 sourceAmount,
        address destToken,
        uint256 minDestAmount,
        uint256 expiry
    );
    event IntentFulfilled(bytes32 indexed intentId, address indexed solver, uint256 destAmount, bytes32 paymentTxHash);
    event IntentCancelled(bytes32 indexed intentId, address indexed user, uint256 refundAmount);
    event IntentExpired(bytes32 indexed intentId, address indexed user, uint256 refundAmount);
}
```

**Step 2: Rewrite IntentRegistry.sol**

File: `packages/contracts/contracts/IntentRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./interfaces/IIntentRegistry.sol";
import "./interfaces/IEscrow.sol";
import "./interfaces/IPaymentVerifier.sol";

contract IntentRegistry is IIntentRegistry, Ownable, Pausable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    IEscrow public escrow;
    IPaymentVerifier public paymentVerifier;

    bytes32 private constant INTENT_PARAMS_TYPEHASH = keccak256(
        "IntentParams(address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destChainId,address destToken,uint256 minDestAmount,uint256 maxSolverFee,uint256 expiry,uint256 nonce,address[] allowedSolvers)"
    );

    mapping(bytes32 => Intent) public intents;
    mapping(address => uint256) public userNonce;
    mapping(address => bytes32[]) public userIntents;
    uint256 public totalIntents;
    uint256 public totalIntentsFulfilled;

    modifier onlyIntentUser(bytes32 intentId) {
        require(intents[intentId].user == msg.sender, "IntentRegistry: not intent owner");
        _;
    }

    modifier onlyOpen(bytes32 intentId) {
        require(intents[intentId].status == IntentStatus.Open, "IntentRegistry: not open");
        _;
    }

    constructor(address _escrow, address _paymentVerifier)
        Ownable()
        EIP712("XDCIntents", "1")
    {
        require(_escrow != address(0), "IntentRegistry: zero escrow");
        require(_paymentVerifier != address(0), "IntentRegistry: zero verifier");
        escrow = IEscrow(_escrow);
        paymentVerifier = IPaymentVerifier(_paymentVerifier);
    }

    function deriveIntentId(IntentParams calldata intent) public pure returns (bytes32) {
        return keccak256(abi.encode(
            intent.user,
            intent.sourceChainId,
            intent.sourceToken,
            intent.sourceAmount,
            intent.destChainId,
            intent.destToken,
            intent.minDestAmount,
            intent.maxSolverFee,
            intent.expiry,
            intent.nonce
        ));
    }

    function submitIntent(IntentParams calldata intent, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (bytes32 intentId)
    {
        require(intent.user != address(0), "IntentRegistry: zero user");
        require(intent.sourceToken != address(0), "IntentRegistry: zero source token");
        require(intent.destToken != address(0), "IntentRegistry: zero dest token");
        require(intent.sourceAmount > 0, "IntentRegistry: zero amount");
        require(intent.expiry > block.timestamp, "IntentRegistry: expiry in past");
        require(intent.destAmount >= intent.minDestAmount, "IntentRegistry: dest amount below min"); // V1: sourceAmount == destAmount for direct transfer
        require(intent.sourceChainId == block.chainid, "IntentRegistry: wrong source chain");

        intentId = deriveIntentId(intent);
        require(intents[intentId].user == address(0), "IntentRegistry: intent exists");

        bytes32 structHash = keccak256(abi.encode(
            INTENT_PARAMS_TYPEHASH,
            intent.user,
            intent.sourceChainId,
            intent.sourceToken,
            intent.sourceAmount,
            intent.destChainId,
            intent.destToken,
            intent.minDestAmount,
            intent.maxSolverFee,
            intent.expiry,
            intent.nonce,
            keccak256(abi.encodePacked(intent.allowedSolvers))
        ));

        address signer = _hashTypedDataV4(structHash).recover(signature);
        require(signer == intent.user, "IntentRegistry: invalid signature");
        require(userNonce[intent.user] == intent.nonce, "IntentRegistry: invalid nonce");

        // Store intent
        Intent storage newIntent = intents[intentId];
        newIntent.intentId = intentId;
        newIntent.user = intent.user;
        newIntent.sourceChainId = intent.sourceChainId;
        newIntent.sourceToken = intent.sourceToken;
        newIntent.sourceAmount = intent.sourceAmount;
        newIntent.destChainId = intent.destChainId;
        newIntent.destToken = intent.destToken;
        newIntent.minDestAmount = intent.minDestAmount;
        newIntent.maxSolverFee = intent.maxSolverFee;
        newIntent.expiry = intent.expiry;
        newIntent.nonce = intent.nonce;
        newIntent.allowedSolvers = intent.allowedSolvers;
        newIntent.signature = signature;
        newIntent.status = IntentStatus.Open;

        userNonce[intent.user]++;
        userIntents[intent.user].push(intentId);
        totalIntents++;

        escrow.lockTokens(intent.sourceToken, intent.sourceAmount, intentId, intent.user);

        emit IntentSubmitted(
            intentId,
            intent.user,
            intent.sourceToken,
            intent.sourceAmount,
            intent.destToken,
            intent.minDestAmount,
            intent.expiry
        );
    }

    function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash)
        external
        whenNotPaused
        nonReentrant
        onlyOpen(intentId)
        returns (bool)
    {
        Intent storage intent = intents[intentId];
        require(block.timestamp <= intent.expiry, "IntentRegistry: intent expired");
        require(destAmount >= intent.minDestAmount, "IntentRegistry: dest amount below min");
        require(msg.sender != address(0), "IntentRegistry: zero solver");
        if (intent.allowedSolvers.length > 0) {
            bool allowed = false;
            for (uint256 i = 0; i < intent.allowedSolvers.length; i++) {
                if (intent.allowedSolvers[i] == msg.sender) {
                    allowed = true;
                    break;
                }
            }
            require(allowed, "IntentRegistry: solver not allowed");
        }

        // V1: solver must deliver destToken to the user BEFORE calling fulfillIntent.
        // The contract verifies the x402 payment proof via PaymentVerifier.
        paymentVerifier.verifyPayment(paymentTxHash, msg.sender, intent.user, destAmount, intentId);

        // Release source tokens from escrow to solver
        escrow.releaseTokens(intent.sourceToken, intent.sourceAmount, msg.sender, intentId);

        intent.solver = msg.sender;
        intent.fulfilledAmount = destAmount;
        intent.paymentTxHash = paymentTxHash;
        intent.status = IntentStatus.Fulfilled;
        totalIntentsFulfilled++;

        emit IntentFulfilled(intentId, msg.sender, destAmount, paymentTxHash);
        return true;
    }

    function cancelIntent(bytes32 intentId) external whenNotPaused nonReentrant onlyIntentUser(intentId) onlyOpen(intentId) {
        Intent storage intent = intents[intentId];
        require(block.timestamp > intent.expiry, "IntentRegistry: not expired");
        intent.status = IntentStatus.Cancelled;
        escrow.refundTokens(intentId);
        emit IntentCancelled(intentId, msg.sender, intent.sourceAmount);
    }

    function cancelExpiredIntents(bytes32[] calldata intentIds) external whenNotPaused nonReentrant {
        for (uint256 i = 0; i < intentIds.length; i++) {
            bytes32 intentId = intentIds[i];
            Intent storage intent = intents[intentId];
            if (intent.status == IntentStatus.Open && block.timestamp > intent.expiry) {
                intent.status = IntentStatus.Expired;
                escrow.refundTokens(intentId);
                emit IntentExpired(intentId, intent.user, intent.sourceAmount);
            }
        }
    }

    function getIntent(bytes32 intentId) external view returns (Intent memory) {
        return intents[intentId];
    }

    function getUserNonce(address user) external view returns (uint256) {
        return userNonce[user];
    }

    function getUserIntents(address user) external view returns (bytes32[] memory) {
        return userIntents[user];
    }

    function setPaymentVerifier(address _paymentVerifier) external onlyOwner {
        require(_paymentVerifier != address(0), "IntentRegistry: zero address");
        paymentVerifier = IPaymentVerifier(_paymentVerifier);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
```

**Note on V1 simplification:** In V1, source and destination are the same chain and token (`sourceToken == destToken`), so `sourceAmount` is the same as the destination amount. The solver pays the facilitator an x402 fee (0.01% or fixed) and receives the escrowed source tokens as compensation. This is intentionally simple; XSwap V3 integration is V2.

**Step 3: Verify compile**

Run: `npm run build -w @xdc-intent/contracts`
Expected: compiles.

**Step 4: Commit**

```bash
git add .
git commit -m "Rewrite IntentRegistry to plan spec with IntentParams, EIP-712 submit, and x402 fulfillment"
```

---

### Task 2.4: Write Foundry/Hardhat unit tests for contracts

**Files:**
- Create: `packages/contracts/test/IntentRegistry.test.ts`
- Create: `packages/contracts/test/PaymentVerifier.test.ts`
- Create: `packages/contracts/test/Escrow.test.ts`

**Step 1: Write IntentRegistry test**

File: `packages/contracts/test/IntentRegistry.test.ts`

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { IntentRegistry, Escrow, PaymentVerifier, MockERC20 } from '../typechain-types';

describe('IntentRegistry', () => {
  let registry: IntentRegistry;
  let escrow: Escrow;
  let verifier: PaymentVerifier;
  let token: MockERC20;
  let owner: HardhatEthersSigner, user: HardhatEthersSigner, solver: HardhatEthersSigner, facilitator: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, user, solver, facilitator] = await ethers.getSigners();
    const Escrow = await ethers.getContractFactory('Escrow');
    escrow = await Escrow.deploy();
    const PaymentVerifier = await ethers.getContractFactory('PaymentVerifier');
    verifier = await PaymentVerifier.deploy();
    const IntentRegistry = await ethers.getContractFactory('IntentRegistry');
    registry = await IntentRegistry.deploy(await escrow.getAddress(), await verifier.getAddress());
    await escrow.setRegistry(await registry.getAddress());
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    token = await MockERC20.deploy('Mock USDC', 'mUSDC', 6);
    await escrow.addAllowedToken(await token.getAddress());
    await token.mint(user.address, ethers.parseUnits('1000', 6));
    await verifier.registerFacilitator(facilitator.address);
  });

  async function signIntent(signer: HardhatEthersSigner, chainId: number, nonce: number) {
    const domain = {
      name: 'XDCIntents',
      version: '1',
      chainId,
      verifyingContract: await registry.getAddress(),
    };
    const types = {
      IntentParams: [
        { name: 'user', type: 'address' },
        { name: 'sourceChainId', type: 'uint256' },
        { name: 'sourceToken', type: 'address' },
        { name: 'sourceAmount', type: 'uint256' },
        { name: 'destChainId', type: 'uint256' },
        { name: 'destToken', type: 'address' },
        { name: 'minDestAmount', type: 'uint256' },
        { name: 'maxSolverFee', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'allowedSolvers', type: 'address[]' },
      ],
    };
    const tokenAddr = await token.getAddress();
    const value = {
      user: signer.address,
      sourceChainId: chainId,
      sourceToken: tokenAddr,
      sourceAmount: ethers.parseUnits('100', 6),
      destChainId: chainId,
      destToken: tokenAddr,
      minDestAmount: ethers.parseUnits('100', 6),
      maxSolverFee: ethers.parseUnits('1', 6),
      expiry: Math.floor(Date.now() / 1000) + 3600,
      nonce,
      allowedSolvers: [],
    };
    const signature = await signer.signTypedData(domain, types, value);
    return { value, signature };
  }

  it('submits and fulfills an intent', async () => {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const { value, signature } = await signIntent(user, Number(chainId), 0);
    await token.connect(user).approve(await escrow.getAddress(), value.sourceAmount);
    await registry.connect(user).submitIntent(value, signature);
    const intentId = await registry.deriveIntentId(value);

    // Facilitator verifies payment
    const paymentTxHash = ethers.keccak256(ethers.toUtf8Bytes('payment'));
    await verifier.connect(facilitator).verifyPayment(paymentTxHash, solver.address, user.address, value.minDestAmount, intentId);

    await registry.connect(solver).fulfillIntent(intentId, value.minDestAmount, paymentTxHash);
    const intent = await registry.getIntent(intentId);
    expect(intent.status).to.equal(1); // Fulfilled
  });

  it('cancels expired intent', async () => {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const { value, signature } = await signIntent(user, Number(chainId), 0);
    value.expiry = Math.floor(Date.now() / 1000) + 2;
    await token.connect(user).approve(await escrow.getAddress(), value.sourceAmount);
    await registry.connect(user).submitIntent(value, signature);
    const intentId = await registry.deriveIntentId(value);
    await new Promise((r) => setTimeout(r, 3000));
    await registry.connect(user).cancelIntent(intentId);
    const intent = await registry.getIntent(intentId);
    expect(intent.status).to.equal(2); // Cancelled
  });
});
```

**Step 2: Run tests**

Run: `npm run test -w @xdc-intent/contracts`
Expected: tests pass (will fail until `MockERC20` is verified to have `mint`).

**Step 3: Commit**

```bash
git add .
git commit -m "Add unit tests for IntentRegistry, Escrow, and PaymentVerifier"
```

---

## Phase 3: Agent SDK

**Objective:** Build a TypeScript SDK that creates, signs, submits, and watches intents using the new contract API.

### Task 3.1: Create SDK package structure

**Files:**
- Create: `packages/sdk/src/index.ts`
- Create: `packages/sdk/src/intent.ts`
- Create: `packages/sdk/src/registry.ts`
- Create: `packages/sdk/src/events.ts`
- Create: `packages/sdk/src/signing.ts`
- Modify: `packages/sdk/package.json`

**Step 1: Write signing utilities**

File: `packages/sdk/src/signing.ts`

```typescript
import { ethers } from 'ethers';
import { IntentParams, StoredIntent } from '@xdc-intent/types';
import { INTENT_REGISTRY_NAME, INTENT_REGISTRY_VERSION, XDC_APOTHEM_CHAIN_ID } from '@xdc-intent/constants';

export const INTENT_PARAMS_TYPES = {
  IntentParams: [
    { name: 'user', type: 'address' },
    { name: 'sourceChainId', type: 'uint256' },
    { name: 'sourceToken', type: 'address' },
    { name: 'sourceAmount', type: 'uint256' },
    { name: 'destChainId', type: 'uint256' },
    { name: 'destToken', type: 'address' },
    { name: 'minDestAmount', type: 'uint256' },
    { name: 'maxSolverFee', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'allowedSolvers', type: 'address[]' },
  ],
};

export function getEIP712Domain(registryAddress: string, chainId: number) {
  return {
    name: INTENT_REGISTRY_NAME,
    version: INTENT_REGISTRY_VERSION,
    chainId,
    verifyingContract: registryAddress,
  };
}

export function deriveIntentId(intent: IntentParams): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'uint256', 'address', 'uint256', 'uint256', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
      [
        intent.user,
        intent.sourceChainId,
        intent.sourceToken,
        intent.sourceAmount,
        intent.destChainId,
        intent.destToken,
        intent.minDestAmount,
        intent.maxSolverFee,
        intent.expiry,
        intent.nonce,
      ]
    )
  );
}

export async function signIntent(params: {
  intent: IntentParams;
  signer: ethers.Signer;
  registryAddress: string;
  chainId: number;
}): Promise<string> {
  const domain = getEIP712Domain(params.registryAddress, params.chainId);
  return params.signer.signTypedData(domain, INTENT_PARAMS_TYPES, params.intent);
}
```

**Step 2: Write registry wrapper**

File: `packages/sdk/src/registry.ts`

```typescript
import { ethers } from 'ethers';
import { IntentParams, StoredIntent, IntentStatus } from '@xdc-intent/types';
import { signIntent, deriveIntentId } from './signing';

const INTENT_REGISTRY_ABI = [
  'function submitIntent(tuple(address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destChainId,address destToken,uint256 minDestAmount,uint256 maxSolverFee,uint256 expiry,uint256 nonce,address[] allowedSolvers) intent, bytes signature) external returns (bytes32 intentId)',
  'function fulfillIntent(bytes32 intentId, uint256 destAmount, bytes32 paymentTxHash) external returns (bool)',
  'function cancelIntent(bytes32 intentId) external',
  'function getIntent(bytes32 intentId) external view returns (tuple(bytes32 intentId,address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destChainId,address destToken,uint256 minDestAmount,uint256 maxSolverFee,uint256 expiry,uint256 nonce,bytes signature,address[] allowedSolvers,uint8 status,address solver,uint256 fulfilledAmount,bytes32 paymentTxHash))',
  'function getUserNonce(address user) external view returns (uint256)',
  'function getUserIntents(address user) external view returns (bytes32[] memory)',
  'function totalIntents() external view returns (uint256)',
  'function totalIntentsFulfilled() external view returns (uint256)',
  'event IntentSubmitted(bytes32 indexed intentId, address indexed user, address sourceToken, uint256 sourceAmount, address destToken, uint256 minDestAmount, uint256 expiry)',
  'event IntentFulfilled(bytes32 indexed intentId, address indexed solver, uint256 destAmount, bytes32 paymentTxHash)',
  'event IntentCancelled(bytes32 indexed intentId, address indexed user, uint256 refundAmount)',
];

export class IntentRegistryClient {
  private contract: ethers.Contract;

  constructor(address: string, providerOrSigner: ethers.Provider | ethers.Signer) {
    this.contract = new ethers.Contract(address, INTENT_REGISTRY_ABI, providerOrSigner);
  }

  async submitIntent(intent: IntentParams, signature: string): Promise<{ intentId: string; txHash: string }> {
    const tx = await this.contract.submitIntent(intent, signature);
    const receipt = await tx.wait();
    return { intentId: deriveIntentId(intent), txHash: receipt.hash };
  }

  async fulfillIntent(intentId: string, destAmount: string, paymentTxHash: string): Promise<string> {
    const tx = await this.contract.fulfillIntent(intentId, destAmount, paymentTxHash);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async cancelIntent(intentId: string): Promise<string> {
    const tx = await this.contract.cancelIntent(intentId);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  async getIntent(intentId: string): Promise<StoredIntent> {
    const raw = await this.contract.getIntent(intentId);
    return {
      intentId: raw.intentId,
      user: raw.user,
      sourceChainId: Number(raw.sourceChainId),
      sourceToken: raw.sourceToken,
      sourceAmount: raw.sourceAmount.toString(),
      destChainId: Number(raw.destChainId),
      destToken: raw.destToken,
      minDestAmount: raw.minDestAmount.toString(),
      maxSolverFee: raw.maxSolverFee.toString(),
      expiry: Number(raw.expiry),
      nonce: Number(raw.nonce),
      allowedSolvers: raw.allowedSolvers,
      status: Number(raw.status) as IntentStatus,
      solver: raw.solver,
      fulfilledAmount: raw.fulfilledAmount.toString(),
      paymentTxHash: raw.paymentTxHash,
      signature: raw.signature,
    };
  }

  async getUserNonce(user: string): Promise<number> {
    return Number(await this.contract.getUserNonce(user));
  }

  async getUserIntents(user: string): Promise<string[]> {
    return await this.contract.getUserIntents(user);
  }

  async totalIntents(): Promise<number> {
    return Number(await this.contract.totalIntents());
  }

  async totalIntentsFulfilled(): Promise<number> {
    return Number(await this.contract.totalIntentsFulfilled());
  }

  onIntentSubmitted(callback: (intentId: string, user: string, sourceToken: string, sourceAmount: string, destToken: string, minDestAmount: string, expiry: number) => void) {
    this.contract.on('IntentSubmitted', callback);
  }

  onIntentFulfilled(callback: (intentId: string, solver: string, destAmount: string, paymentTxHash: string) => void) {
    this.contract.on('IntentFulfilled', callback);
  }

  removeAllListeners() {
    this.contract.removeAllListeners();
  }
}

export { signIntent, deriveIntentId };
```

**Step 3: Write high-level SDK**

File: `packages/sdk/src/index.ts`

```typescript
import { ethers } from 'ethers';
import { IntentParams, StoredIntent } from '@xdc-intent/types';
import { IntentRegistryClient } from './registry';
import { signIntent, deriveIntentId } from './signing';

export interface SDKConfig {
  registryAddress: string;
  chainId: number;
  rpcUrl: string;
}

export class XDCIntentSDK {
  public registry: IntentRegistryClient;
  private config: SDKConfig;

  constructor(config: SDKConfig) {
    this.config = config;
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.registry = new IntentRegistryClient(config.registryAddress, provider);
  }

  async createAndSubmitIntent(params: {
    intent: Omit<IntentParams, 'user' | 'nonce'>;
    signer: ethers.Signer;
  }): Promise<{ intentId: string; txHash: string }> {
    const user = await params.signer.getAddress();
    const nonce = await this.registry.getUserNonce(user);
    const intent: IntentParams = { ...params.intent, user, nonce };
    const signature = await signIntent({ intent, signer: params.signer, registryAddress: this.config.registryAddress, chainId: this.config.chainId });
    return this.registry.submitIntent(intent, signature);
  }

  async getIntent(intentId: string): Promise<StoredIntent> {
    return this.registry.getIntent(intentId);
  }

  async cancelIntent(intentId: string, signer: ethers.Signer): Promise<string> {
    const connected = new IntentRegistryClient(this.config.registryAddress, signer);
    return connected.cancelIntent(intentId);
  }

  connect(signer: ethers.Signer): IntentRegistryClient {
    return new IntentRegistryClient(this.config.registryAddress, signer);
  }
}

export * from '@xdc-intent/types';
export { IntentRegistryClient, signIntent, deriveIntentId };
```

**Step 4: Update package.json**

```json
{
  "name": "@xdc-intent/sdk",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "ethers": "^6.17.0",
    "@xdc-intent/types": "1.0.0",
    "@xdc-intent/constants": "1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^1.0.0"
  }
}
```

**Step 5: Verify SDK builds**

Run: `npm run build -w @xdc-intent/sdk`
Expected: TypeScript compiles.

**Step 6: Commit**

```bash
git add .
git commit -m "Implement Agent SDK with EIP-712 intent signing and registry client"
```

---

## Phase 4: x402-Style Facilitator

**Objective:** Build a lightweight facilitator that returns 402 payment requests and verifies on-chain ERC-20 transfers before authorizing fulfillment.

### Task 4.1: Rewrite middleware as facilitator

**Files:**
- Create: `packages/middleware/src/facilitator.ts`
- Modify: `packages/middleware/src/index.ts`
- Modify: `packages/middleware/package.json`

**Step 1: Write facilitator core**

File: `packages/middleware/src/facilitator.ts`

```typescript
import { ethers } from 'ethers';
import { PaymentRequest } from '@xdc-intent/types';

export interface FacilitatorConfig {
  rpcUrl: string;
  chainId: string;
  recipient: string; // solver fee recipient
  signerKey: string;
  supportedAssets: string[];
}

export class Facilitator {
  private provider: ethers.JsonRpcProvider;
  private signer: ethers.Wallet;
  private config: FacilitatorConfig;

  constructor(config: FacilitatorConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.signer = new ethers.Wallet(config.signerKey, this.provider);
    this.config = config;
  }

  getAddress(): string {
    return this.signer.address;
  }

  createPaymentRequest(intentId: string, payer: string, amount: string, asset: string): PaymentRequest {
    const nonce = Date.now().toString();
    return {
      amount,
      recipient: this.config.recipient,
      nonce,
      asset,
      chainId: this.config.chainId,
      intentId,
      payer,
      message: `Payment for intent ${intentId}`,
    };
  }

  async verifyPayment(paymentRequest: PaymentRequest, paymentTxHash: string): Promise<{ valid: boolean; signature: string }> {
    // Verify the ERC-20 transfer on-chain
    const receipt = await this.provider.getTransactionReceipt(paymentTxHash);
    if (!receipt || receipt.status !== 1) {
      throw new Error('Payment transaction not found or failed');
    }

    const token = new ethers.Contract(
      paymentRequest.asset,
      ['event Transfer(address indexed from, address indexed to, uint256 value)'],
      this.provider
    );

    const logs = receipt.logs.filter((log) => log.address.toLowerCase() === paymentRequest.asset.toLowerCase());
    let found = false;
    for (const log of logs) {
      try {
        const parsed = token.interface.parseLog(log);
        if (!parsed) continue;
        if (
          parsed.name === 'Transfer' &&
          parsed.args.from.toLowerCase() === paymentRequest.payer.toLowerCase() &&
          parsed.args.to.toLowerCase() === paymentRequest.recipient.toLowerCase() &&
          parsed.args.value.toString() === paymentRequest.amount
        ) {
          found = true;
          break;
        }
      } catch {}
    }
    if (!found) {
      throw new Error('Payment transfer not found in transaction');
    }

    // Sign authorization message for the solver to submit to PaymentVerifier
    const authMessage = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'address', 'address', 'uint256', 'bytes32'],
        [paymentRequest.intentId, paymentRequest.payer, paymentRequest.recipient, paymentRequest.amount, paymentTxHash]
      )
    );
    const signature = await this.signer.signMessage(ethers.getBytes(authMessage));
    return { valid: true, signature };
  }
}
```

**Step 2: Rewrite middleware index**

File: `packages/middleware/src/index.ts` (minimal version)

```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Facilitator } from './facilitator';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const facilitator = new Facilitator({
  rpcUrl: process.env.XDC_TESTNET_RPC || 'https://erpc.apothem.network',
  chainId: process.env.CAIP2_CHAIN || 'eip155:51',
  recipient: process.env.FACILITATOR_RECIPIENT || '',
  signerKey: process.env.FACILITATOR_PRIVATE_KEY || '',
  supportedAssets: (process.env.SUPPORTED_ASSETS || '').split(',').filter(Boolean),
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/v1/payment-request', (req, res) => {
  const { intentId, payer, amount, asset } = req.query as Record<string, string>;
  if (!intentId || !payer || !amount || !asset) {
    return res.status(400).json({ error: 'Missing parameters' });
  }
  const request = facilitator.createPaymentRequest(intentId, payer, amount, asset);
  res.status(402).json({ ...request, paywall: 'x402' });
});

app.post('/v1/verify-payment', async (req, res) => {
  try {
    const { paymentRequest, paymentTxHash } = req.body;
    const result = await facilitator.verifyPayment(paymentRequest, paymentTxHash);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Facilitator listening on port ${PORT}`);
});
```

**Step 3: Update package.json**

```json
{
  "name": "@xdc-intent/middleware",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "scripts": {
    "start": "ts-node src/index.ts",
    "dev": "ts-node-dev src/index.ts"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "ethers": "^6.17.0",
    "@xdc-intent/types": "1.0.0",
    "@xdc-intent/constants": "1.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

**Step 4: Verify build**

Run: `npm install -w @xdc-intent/middleware && npm run build -w @xdc-intent/middleware`
Expected: compiles.

**Step 5: Commit**

```bash
git add .
git commit -m "Implement simplified x402 facilitator with on-chain payment verification"
```

---

## Phase 5: Solver Engine

**Objective:** Rewrite solver to watch `IntentSubmitted`, request/verify payment, and call `fulfillIntent`.

### Task 5.1: Rewrite solver engine

**Files:**
- Create: `packages/solver/src/config.ts`
- Create: `packages/solver/src/watcher.ts`
- Create: `packages/solver/src/executor.ts`
- Create: `packages/solver/src/facilitator-client.ts`
- Modify: `packages/solver/src/index.ts`
- Modify: `packages/solver/package.json`

**Step 1: Write config**

File: `packages/solver/src/config.ts`

```typescript
import dotenv from 'dotenv';
dotenv.config();

export interface SolverConfig {
  rpcUrl: string;
  registryAddress: string;
  paymentAsset: string;
  facilitatorUrl: string;
  privateKey: string;
  minProfit: string; // in source token wei
  pollIntervalMs: number;
}

export function loadConfig(): SolverConfig {
  return {
    rpcUrl: process.env.SOLVER_RPC_URL || 'https://erpc.apothem.network',
    registryAddress: process.env.INTENT_REGISTRY_ADDRESS || '',
    paymentAsset: process.env.PAYMENT_ASSET || '',
    facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:3002',
    privateKey: process.env.SOLVER_PRIVATE_KEY || '',
    minProfit: process.env.SOLVER_MIN_PROFIT || '0',
    pollIntervalMs: parseInt(process.env.SOLVER_POLL_INTERVAL_MS || '5000'),
  };
}
```

**Step 2: Write watcher**

File: `packages/solver/src/watcher.ts`

```typescript
import { ethers } from 'ethers';
import { IntentRegistryClient } from '@xdc-intent/sdk';

export interface IntentEvent {
  intentId: string;
  user: string;
  sourceToken: string;
  sourceAmount: string;
  destToken: string;
  minDestAmount: string;
  expiry: number;
}

export class IntentWatcher {
  private client: IntentRegistryClient;
  private handler: (event: IntentEvent) => void;

  constructor(registryAddress: string, provider: ethers.Provider, handler: (event: IntentEvent) => void) {
    this.client = new IntentRegistryClient(registryAddress, provider);
    this.handler = handler;
  }

  start() {
    this.client.onIntentSubmitted((intentId, user, sourceToken, sourceAmount, destToken, minDestAmount, expiry) => {
      this.handler({ intentId, user, sourceToken, sourceAmount: sourceAmount.toString(), destToken, minDestAmount: minDestAmount.toString(), expiry });
    });
  }

  stop() {
    this.client.removeAllListeners();
  }
}
```

**Step 3: Write facilitator client**

File: `packages/solver/src/facilitator-client.ts`

```typescript
import { PaymentRequest } from '@xdc-intent/types';

export class FacilitatorClient {
  constructor(private baseUrl: string) {}

  async requestPayment(intentId: string, payer: string, amount: string, asset: string): Promise<PaymentRequest> {
    const res = await fetch(`${this.baseUrl}/v1/payment-request?intentId=${intentId}&payer=${payer}&amount=${amount}&asset=${asset}`);
    return await res.json();
  }

  async verifyPayment(paymentRequest: PaymentRequest, paymentTxHash: string): Promise<{ valid: boolean; signature: string }> {
    const res = await fetch(`${this.baseUrl}/v1/verify-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentRequest, paymentTxHash }),
    });
    return await res.json();
  }
}
```

**Step 4: Write executor**

File: `packages/solver/src/executor.ts`

```typescript
import { ethers } from 'ethers';
import { IntentRegistryClient } from '@xdc-intent/sdk';
import { FacilitatorClient } from './facilitator-client';
import { PaymentRequest } from '@xdc-intent/types';

export class FulfillmentExecutor {
  private signer: ethers.Wallet;
  private registry: IntentRegistryClient;
  private facilitator: FacilitatorClient;

  constructor(registryAddress: string, facilitatorUrl: string, privateKey: string, provider: ethers.Provider) {
    this.signer = new ethers.Wallet(privateKey, provider);
    this.registry = new IntentRegistryClient(registryAddress, this.signer);
    this.facilitator = new FacilitatorClient(facilitatorUrl);
  }

  async evaluate(intent: { sourceAmount: string }): Promise<boolean> {
    // V1: always profitable enough for demo if minProfit is 0
    return true;
  }

  async execute(intent: { intentId: string; sourceAmount: string; minDestAmount: string; user: string }): Promise<void> {
    const solverAddress = this.signer.address;
    const paymentAmount = ethers.parseUnits('0.01', 6).toString(); // fixed 0.01 USDC fee

    const paymentRequest = await this.facilitator.requestPayment(intent.intentId, solverAddress, paymentAmount, process.env.PAYMENT_ASSET || '');

    // Send ERC-20 payment to facilitator
    const token = new ethers.Contract(
      paymentRequest.asset,
      ['function transfer(address to, uint256 amount) returns (bool)', 'function approve(address spender, uint256 amount) returns (bool)'],
      this.signer
    );
    const tx = await token.transfer(paymentRequest.recipient, paymentRequest.amount);
    const receipt = await tx.wait();

    const verification = await this.facilitator.verifyPayment(paymentRequest, receipt.hash);
    if (!verification.valid) {
      throw new Error('Payment verification failed');
    }

    // Fulfill intent (V1: destAmount == sourceAmount)
    await this.registry.fulfillIntent(intent.intentId, intent.sourceAmount, receipt.hash);
  }
}
```

**Step 5: Write main solver**

File: `packages/solver/src/index.ts`

```typescript
import { ethers } from 'ethers';
import { loadConfig } from './config';
import { IntentWatcher, IntentEvent } from './watcher';
import { FulfillmentExecutor } from './executor';

async function main() {
  const config = loadConfig();
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const executor = new FulfillmentExecutor(config.registryAddress, config.facilitatorUrl, config.privateKey, provider);

  const watcher = new IntentWatcher(config.registryAddress, provider, async (intent: IntentEvent) => {
    console.log('New intent:', intent.intentId);
    try {
      const profitable = await executor.evaluate(intent);
      if (!profitable) {
        console.log('Intent not profitable:', intent.intentId);
        return;
      }
      await executor.execute(intent);
      console.log('Fulfilled:', intent.intentId);
    } catch (error: any) {
      console.error('Fulfillment failed:', intent.intentId, error.message);
    }
  });

  watcher.start();
  console.log('Solver watching for intents...');

  process.on('SIGTERM', () => watcher.stop());
  process.on('SIGINT', () => watcher.stop());
}

main().catch(console.error);
```

**Step 6: Update package.json**

```json
{
  "name": "@xdc-intent/solver",
  "version": "1.0.0",
  "main": "./src/index.ts",
  "scripts": {
    "start": "ts-node src/index.ts",
    "dev": "ts-node-dev src/index.ts"
  },
  "dependencies": {
    "ethers": "^6.17.0",
    "dotenv": "^16.3.1",
    "@xdc-intent/sdk": "1.0.0",
    "@xdc-intent/types": "1.0.0",
    "@xdc-intent/constants": "1.0.0"
  },
  "devDependencies": {
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

**Step 7: Verify build**

Run: `npm install -w @xdc-intent/solver && npm run build -w @xdc-intent/solver`
Expected: compiles.

**Step 8: Commit**

```bash
git add .
git commit -m "Rewrite solver engine to watch intents and fulfill via x402 facilitator"
```

---

## Phase 6: Frontend Update

**Objective:** Update the existing Next.js frontend to use the new `IntentParams` form and SDK.

### Task 6.1: Update frontend contract library

**Files:**
- Modify: `packages/frontend/src/lib/contracts.ts`

**Step 1: Replace with SDK-based code**

File: `packages/frontend/src/lib/contracts.ts`

```typescript
import { ethers } from 'ethers';
import { XDCIntentSDK } from '@xdc-intent/sdk';
import { IntentParams } from '@xdc-intent/types';
import { XDC_APOTHEM_CHAIN_ID } from '@xdc-intent/constants';

const RPC_URL = 'https://erpc.apothem.network';
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_INTENT_REGISTRY_ADDRESS || '';

export function getSDK() {
  return new XDCIntentSDK({ registryAddress: REGISTRY_ADDRESS, chainId: XDC_APOTHEM_CHAIN_ID, rpcUrl: RPC_URL });
}

export async function submitIntent(params: {
  signer: ethers.Signer;
  sourceToken: string;
  sourceAmount: string;
  destToken: string;
  minDestAmount: string;
  maxSolverFee: string;
  expiry: number;
  allowedSolvers: string[];
}) {
  const sdk = getSDK();
  const chainId = XDC_APOTHEM_CHAIN_ID;
  const intent: Omit<IntentParams, 'user' | 'nonce'> = {
    sourceChainId: chainId,
    sourceToken: params.sourceToken,
    sourceAmount: params.sourceAmount,
    destChainId: chainId,
    destToken: params.destToken,
    minDestAmount: params.minDestAmount,
    maxSolverFee: params.maxSolverFee,
    expiry: params.expiry,
    allowedSolvers: params.allowedSolvers,
  };
  return sdk.createAndSubmitIntent({ intent, signer: params.signer });
}

export async function getIntent(intentId: string) {
  return getSDK().getIntent(intentId);
}

export async function cancelIntent(intentId: string, signer: ethers.Signer) {
  return getSDK().cancelIntent(intentId, signer);
}

export async function getUserIntents(user: string) {
  return getSDK().registry.getUserIntents(user);
}

export async function getTotalIntents() {
  return getSDK().registry.totalIntents();
}

export async function getTotalIntentsFulfilled() {
  return getSDK().registry.totalIntentsFulfilled();
}
```

**Step 2: Commit**

```bash
git add .
git commit -m "Update frontend contract library to use new SDK and IntentParams"
```

---

### Task 6.2: Update create intent page

**Files:**
- Modify: `packages/frontend/src/app/create/page.tsx` (or wherever the create page lives)

**Step 1: Add form fields**

The form must collect:
- Source token address (dropdown)
- Source amount
- Destination token address (dropdown)
- Minimum destination amount
- Max solver fee
- Expiry (datetime → timestamp)
- Allowed solvers (optional comma-separated addresses)

On submit:
1. Get signer from wallet provider.
2. Approve escrow to spend source token.
3. Call `submitIntent` from `lib/contracts.ts`.
4. Show intent ID and explorer link.

**Step 2: Commit**

```bash
git add .
git commit -m "Update create intent page with IntentParams form and SDK submission"
```

---

### Task 6.3: Update my-intents page

**Files:**
- Modify: `packages/frontend/src/app/my-intents/page.tsx`

**Step 1: Use SDK to fetch user intents**

```typescript
import { getUserIntents, getIntent, cancelIntent } from '@/lib/contracts';

export default async function MyIntentsPage({ user }: { user: string }) {
  const intentIds = await getUserIntents(user);
  const intents = await Promise.all(intentIds.map((id) => getIntent(id)));
  return (
    <div>
      {intents.map((intent) => (
        <IntentCard key={intent.intentId} intent={intent} />
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add .
git commit -m "Update my-intents page to read from new IntentRegistry"
```

---

### Task 6.4: Build and verify frontend

Run:

```bash
cd /mnt/c/Users/karan/Desktop/openscans/xdc-intent/packages/frontend
npm run build
```

Expected: production build succeeds.

Commit:

```bash
git add .
git commit -m "Build and verify updated Next.js frontend"
```

---

## Phase 7: Local End-to-End Test

**Objective:** Run the full flow against a local Hardhat node.

### Task 7.1: Write local E2E script

**Files:**
- Create: `packages/contracts/scripts/e2e-local.ts`

**Step 1: Script deploys contracts, mocks tokens, starts solver, creates and fulfills intent**

File: `packages/contracts/scripts/e2e-local.ts`

```typescript
import { ethers } from 'hardhat';

async function main() {
  const [deployer, user, solver, facilitator] = await ethers.getSigners();
  const Escrow = await ethers.getContractFactory('Escrow');
  const escrow = await Escrow.deploy();
  const PaymentVerifier = await ethers.getContractFactory('PaymentVerifier');
  const verifier = await PaymentVerifier.deploy();
  const IntentRegistry = await ethers.getContractFactory('IntentRegistry');
  const registry = await IntentRegistry.deploy(await escrow.getAddress(), await verifier.getAddress());
  await escrow.setRegistry(await registry.getAddress());
  await verifier.registerFacilitator(facilitator.address);

  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const token = await MockERC20.deploy('Mock USDC', 'mUSDC', 6);
  await escrow.addAllowedToken(await token.getAddress());
  await token.mint(user.address, ethers.parseUnits('1000', 6));
  await token.mint(solver.address, ethers.parseUnits('10', 6));

  console.log('Contracts deployed:', {
    registry: await registry.getAddress(),
    escrow: await escrow.getAddress(),
    verifier: await verifier.getAddress(),
    token: await token.getAddress(),
  });

  // Create intent via SDK-like signing
  const chainId = (await ethers.provider.getNetwork()).chainId;
  // ... sign and submit intent ...
  // ... solver pays facilitator, verifies, fulfills ...
}

main().catch(console.error);
```

**Step 2: Run script**

```bash
npx hardhat node
npx hardhat run scripts/e2e-local.ts --network localhost
```

Expected: intent created, then fulfilled, then status is Fulfilled.

**Step 3: Commit**

```bash
git add .
git commit -m "Add local Hardhat E2E script for full intent lifecycle"
```

---

## Phase 8: Apothem Testnet Deployment

**Objective:** Deploy new contracts to XDC Apothem and configure addresses everywhere.

### Task 8.1: Write deployment script

**Files:**
- Create: `packages/contracts/scripts/deploy-apothem.ts`

**Step 1: Deploy and configure contracts**

File: `packages/contracts/scripts/deploy-apothem.ts`

```typescript
import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  const Escrow = await ethers.getContractFactory('Escrow');
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const PaymentVerifier = await ethers.getContractFactory('PaymentVerifier');
  const verifier = await PaymentVerifier.deploy();
  await verifier.waitForDeployment();
  const IntentRegistry = await ethers.getContractFactory('IntentRegistry');
  const registry = await IntentRegistry.deploy(await escrow.getAddress(), await verifier.getAddress());
  await registry.waitForDeployment();
  await escrow.setRegistry(await registry.getAddress());

  const MockERC20 = await ethers.getContractFactory('MockERC20');
  const usdc = await MockERC20.deploy('Mock USDC', 'mUSDC', 6);
  await usdc.waitForDeployment();
  await escrow.addAllowedToken(await usdc.getAddress());

  console.log('Apothem deployment:', {
    registry: await registry.getAddress(),
    escrow: await escrow.getAddress(),
    verifier: await verifier.getAddress(),
    mockUsdc: await usdc.getAddress(),
  });
}

main().catch(console.error);
```

**Step 2: Run deployment**

```bash
npx hardhat run scripts/deploy-apothem.ts --network apothem
```

Requires `DEPLOYER_PRIVATE_KEY` and `XDC_TESTNET_RPC` in `.env`.

**Step 3: Update addresses**

Update `shared/constants/src/index.ts` with deployed addresses.
Update `.env` files for `frontend`, `solver`, `middleware` with new addresses.

**Step 4: Commit**

```bash
git add .
git commit -m "Deploy V1 contracts to XDC Apothem testnet"
```

---

## Phase 9: Testnet End-to-End Test

**Objective:** Run the full flow on Apothem with real wallet and solver.

### Task 9.1: Fund wallets and mint tokens

- Get Apothem XDC from faucet for user and solver.
- Mint MockUSDC to user and solver (if public mint is enabled).

### Task 9.2: Run facilitator

```bash
cd /mnt/c/Users/karan/Desktop/openscans/xdc-intent/packages/middleware
npm run start
```

### Task 9.3: Run solver

```bash
cd /mnt/c/Users/karan/Desktop/openscans/xdc-intent/packages/solver
npm run start
```

### Task 9.4: Submit intent via frontend

1. Open `http://localhost:3000`.
2. Connect wallet.
3. Create intent: 10 mUSDC → mUSDC, 1-hour expiry.
4. Observe solver fulfills within seconds.
5. Check My Intents page shows Fulfilled.

### Task 9.5: Test cancellation

1. Create intent with 10-second expiry.
2. Wait for expiry.
3. Click Cancel in My Intents.
4. Verify tokens refunded.

### Task 9.6: Commit test results

Document results in `.hermes/testnet-e2e-2026-07-02.md` and commit.

```bash
git add .hermes/testnet-e2e-2026-07-02.md
git commit -m "Record Apothem testnet E2E results for V1 intent lifecycle"
```

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `MockERC20` does not have `mint` or current contract lacks it | Medium | High | Add public `mint` function to `MockERC20.sol` |
| Hardhat Ethers v6 ABI tuple encoding mismatch | Medium | High | Test `submitIntent` with exact struct order; use TypeChain or manual ABI |
| Frontend build fails after SDK change | Medium | Medium | Run `npm run build` in frontend after each SDK update |
| x402 facilitator cannot verify transfer due to XDC receipt format | Low | High | Use standard ERC-20 `Transfer` event parsing; fallback to facilitator attestation |
| Solver misses events due to RPC polling | Medium | Medium | Add polling fallback in watcher; use `provider.getLogs` periodically |
| Apothem faucet dry | Medium | High | Use multiple wallets; request ahead of time |

---

## Timeline Estimate

| Phase | Estimated Duration |
|-------|-------------------|
| Phase 1: Cleanup & shared packages | 1 day |
| Phase 2: Smart contract rewrite | 3-4 days |
| Phase 3: Agent SDK | 2 days |
| Phase 4: Facilitator | 1-2 days |
| Phase 5: Solver engine | 2-3 days |
| Phase 6: Frontend update | 2-3 days |
| Phase 7: Local E2E test | 1-2 days |
| Phase 8: Apothem deployment | 1 day |
| Phase 9: Testnet E2E test | 1-2 days |
| **Total** | **14-20 days** |

This is a realistic estimate for a single developer working full-time. Parallel work (contracts + frontend) could reduce it to 10-14 days.

---

## Open Questions

1. Should the solver be allowed to fulfill the same token in V1 (no actual DEX swap)?
2. Should we deploy mock ERC-20 tokens on Apothem, or do you have existing token addresses?
3. Do you want real `@x402/express` integration in V2, or is the simplified 402 flow sufficient for the demo?
4. Should we keep `SolverRegistry.sol` and `PriceOracle.sol` for V2, or delete them now?
5. Do you have XDC Apothem testnet XDC available for deployment?

---

## Next Action

Implement Phase 1 Task 1.1: delete dead contracts.
