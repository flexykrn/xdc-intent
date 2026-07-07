import {
  IntentSubmitted as IntentSubmittedEvent,
  IntentFulfilled as IntentFulfilledEvent,
  IntentCancelled as IntentCancelledEvent,
} from "../generated/IntentRegistry/IntentRegistry";
import {
  TokensLocked as TokensLockedEvent,
  TokensReleased as TokensReleasedEvent,
  TokensRefunded as TokensRefundedEvent,
} from "../generated/Escrow/Escrow";
import {
  SolverRegistered as SolverRegisteredEvent,
  SolverDeactivated as SolverDeactivatedEvent,
  SolverReactivated as SolverReactivatedEvent,
  SupportedChainsUpdated as SupportedChainsUpdatedEvent,
} from "../generated/SolverRegistry/SolverRegistry";
import {
  Intent,
  User,
  Solver,
  Token,
  EscrowLock,
  EscrowRelease,
  DailyStats,
  UserDay,
  SolverDay,
} from "../generated/schema";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";

// ============ Helpers ============

function getOrCreateUser(address: Address): User {
  let id = address.toHex();
  let user = User.load(id);
  if (!user) {
    user = new User(id);
    user.totalIntents = BigInt.fromI32(0);
    user.totalFulfilled = BigInt.fromI32(0);
    user.totalCancelled = BigInt.fromI32(0);
    user.totalVolume = BigInt.fromI32(0);
    user.save();
  }
  return user;
}

function getOrCreateSolver(address: Address): Solver {
  let id = address.toHex();
  let solver = Solver.load(id);
  if (!solver) {
    solver = new Solver(id);
    solver.solverId = BigInt.fromI32(0);
    solver.name = "";
    solver.feeBps = BigInt.fromI32(0);
    solver.supportedChains = new Array<BigInt>();
    solver.active = false;
    solver.totalFulfilled = BigInt.fromI32(0);
    solver.totalVolume = BigInt.fromI32(0);
    solver.save();
  }
  return solver;
}

function getOrCreateToken(address: Address): Token {
  let id = address.toHex();
  let token = Token.load(id);
  if (!token) {
    token = new Token(id);
    token.symbol = "UNKNOWN";
    token.name = "Unknown Token";
    token.decimals = 18;
    token.totalIntents = BigInt.fromI32(0);
    token.totalVolume = BigInt.fromI32(0);
    token.save();
  }
  return token;
}

function getOrCreateDailyStats(timestamp: BigInt): DailyStats {
  let date = timestampToDateString(timestamp);
  let stats = DailyStats.load(date);
  if (!stats) {
    stats = new DailyStats(date);
    stats.date = date;
    stats.totalIntents = BigInt.fromI32(0);
    stats.totalFulfilled = BigInt.fromI32(0);
    stats.totalCancelled = BigInt.fromI32(0);
    stats.totalVolume = BigInt.fromI32(0);
    stats.totalFulfilledAmount = BigInt.fromI32(0);
    stats.uniqueUsers = BigInt.fromI32(0);
    stats.uniqueSolvers = BigInt.fromI32(0);
    stats.save();
  }
  return stats;
}

function trackUniqueUser(date: string, userAddress: Address): void {
  let id = date + "-" + userAddress.toHex();
  let userDay = UserDay.load(id);
  if (!userDay) {
    userDay = new UserDay(id);
    userDay.save();
    let stats = DailyStats.load(date);
    if (stats) {
      stats.uniqueUsers = stats.uniqueUsers.plus(BigInt.fromI32(1));
      stats.save();
    }
  }
}

function trackUniqueSolver(date: string, solverAddress: Address): void {
  let id = date + "-" + solverAddress.toHex();
  let solverDay = SolverDay.load(id);
  if (!solverDay) {
    solverDay = new SolverDay(id);
    solverDay.save();
    let stats = DailyStats.load(date);
    if (stats) {
      stats.uniqueSolvers = stats.uniqueSolvers.plus(BigInt.fromI32(1));
      stats.save();
    }
  }
}

function timestampToDateString(timestamp: BigInt): string {
  let seconds = timestamp.toI32();
  let days = seconds / 86400;
  let year = 1970 + days / 365;
  let month = (days % 365) / 30 + 1;
  let day = (days % 365) % 30 + 1;
  return year.toString() + "-" + month.toString() + "-" + day.toString();
}

// ============ IntentRegistry Handlers ============

export function handleIntentSubmitted(event: IntentSubmittedEvent): void {
  let intentId = event.params.intentId.toHex();
  let userAddress = event.params.user;
  let sourceTokenAddress = event.params.sourceToken;
  let destTokenAddress = event.params.destToken;

  let user = getOrCreateUser(userAddress);
  let sourceToken = getOrCreateToken(sourceTokenAddress);
  let destToken = getOrCreateToken(destTokenAddress);

  let intent = new Intent(intentId);
  intent.user = user.id;
  intent.sourceToken = sourceToken.id;
  intent.sourceAmount = event.params.sourceAmount;
  intent.destToken = destToken.id;
  intent.minDestAmount = event.params.minDestAmount;
  intent.expiry = event.params.expiry;
  intent.status = "Open";
  intent.allowedSolvers = new Array<string>();
  intent.createdAt = event.block.timestamp;
  intent.save();

  user.totalIntents = user.totalIntents.plus(BigInt.fromI32(1));
  user.totalVolume = user.totalVolume.plus(event.params.sourceAmount);
  user.save();

  sourceToken.totalIntents = sourceToken.totalIntents.plus(BigInt.fromI32(1));
  sourceToken.totalVolume = sourceToken.totalVolume.plus(event.params.sourceAmount);
  sourceToken.save();

  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalIntents = stats.totalIntents.plus(BigInt.fromI32(1));
  stats.totalVolume = stats.totalVolume.plus(event.params.sourceAmount);
  stats.save();

  trackUniqueUser(stats.id, userAddress);
}

export function handleIntentFulfilled(event: IntentFulfilledEvent): void {
  let intentId = event.params.intentId.toHex();
  let intent = Intent.load(intentId);
  if (!intent) return;

  let solverAddress = event.params.solver;
  let solver = getOrCreateSolver(solverAddress);

  intent.solver = solver.id;
  intent.status = "Fulfilled";
  intent.fulfilledAmount = event.params.destAmount;
  intent.paymentTxHash = event.params.paymentTxHash;
  intent.fulfilledAt = event.block.timestamp;
  intent.save();

  solver.totalFulfilled = solver.totalFulfilled.plus(BigInt.fromI32(1));
  solver.totalVolume = solver.totalVolume.plus(intent.sourceAmount);
  solver.save();

  let user = User.load(intent.user);
  if (user) {
    user.totalFulfilled = user.totalFulfilled.plus(BigInt.fromI32(1));
    user.save();
  }

  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalFulfilled = stats.totalFulfilled.plus(BigInt.fromI32(1));
  stats.totalFulfilledAmount = stats.totalFulfilledAmount.plus(event.params.destAmount);
  stats.save();

  trackUniqueSolver(stats.id, solverAddress);
}

export function handleIntentCancelled(event: IntentCancelledEvent): void {
  let intentId = event.params.intentId.toHex();
  let intent = Intent.load(intentId);
  if (!intent) return;

  intent.status = "Cancelled";
  intent.cancelledAt = event.block.timestamp;
  intent.save();

  let user = User.load(intent.user);
  if (user) {
    user.totalCancelled = user.totalCancelled.plus(BigInt.fromI32(1));
    user.save();
  }

  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalCancelled = stats.totalCancelled.plus(BigInt.fromI32(1));
  stats.save();
}

// ============ Escrow Handlers ============

export function handleTokensLocked(event: TokensLockedEvent): void {
  let intentId = event.params.intentId.toHex();
  let token = getOrCreateToken(event.params.token);
  let user = getOrCreateUser(event.params.user);

  let lock = new EscrowLock(intentId);
  lock.intent = intentId;
  lock.token = token.id;
  lock.amount = event.params.amount;
  lock.user = user.id;
  lock.createdAt = event.block.timestamp;
  lock.save();
}

export function handleTokensReleased(event: TokensReleasedEvent): void {
  let intentId = event.params.intentId.toHex();
  let token = getOrCreateToken(event.params.token);
  let recipient = getOrCreateUser(event.params.recipient);

  let releaseId = intentId + "-release";
  let release = new EscrowRelease(releaseId);
  release.intent = intentId;
  release.token = token.id;
  release.amount = event.params.amount;
  release.recipient = recipient.id;
  release.releasedAt = event.block.timestamp;
  release.kind = "release";
  release.save();
}

export function handleTokensRefunded(event: TokensRefundedEvent): void {
  let intentId = event.params.intentId.toHex();
  let token = getOrCreateToken(event.params.token);
  let user = getOrCreateUser(event.params.user);

  let refundId = intentId + "-refund";
  let refund = new EscrowRelease(refundId);
  refund.intent = intentId;
  refund.token = token.id;
  refund.amount = event.params.amount;
  refund.recipient = user.id;
  refund.releasedAt = event.block.timestamp;
  refund.kind = "refund";
  refund.save();
}

// ============ SolverRegistry Handlers ============

export function handleSolverRegistered(event: SolverRegisteredEvent): void {
  let solver = getOrCreateSolver(event.params.solverAddress);
  solver.solverId = event.params.solverId;
  solver.name = event.params.name;
  solver.feeBps = event.params.feeBps;
  solver.supportedChains = event.params.supportedChains;
  solver.active = true;
  solver.save();
}

export function handleSolverDeactivated(event: SolverDeactivatedEvent): void {
  let solver = Solver.load(event.params.solverAddress.toHex());
  if (solver) {
    solver.active = false;
    solver.save();
  }
}

export function handleSolverReactivated(event: SolverReactivatedEvent): void {
  let solver = Solver.load(event.params.solverAddress.toHex());
  if (solver) {
    solver.active = true;
    solver.save();
  }
}

export function handleSupportedChainsUpdated(event: SupportedChainsUpdatedEvent): void {
  let solver = getOrCreateSolver(event.params.solverAddress);
  solver.supportedChains = event.params.supportedChains;
  solver.save();
}
