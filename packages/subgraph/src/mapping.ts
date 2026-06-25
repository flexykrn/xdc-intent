import {
  IntentCreated as IntentCreatedEvent,
  IntentFulfilled as IntentFulfilledEvent,
  IntentCancelled as IntentCancelledEvent,
  IntentExpired as IntentExpiredEvent,
} from "../generated/IntentRegistry/IntentRegistry";
import {
  TokensLocked as TokensLockedEvent,
  TokensReleased as TokensReleasedEvent,
  TokensRefunded as TokensRefundedEvent,
} from "../generated/Escrow/Escrow";
import {
  SolverRegistered as SolverRegisteredEvent,
  SolverDeregistered as SolverDeregisteredEvent,
  SolverSlashed as SolverSlashedEvent,
} from "../generated/SolverRegistry/SolverRegistry";
import {
  BatchCreated as BatchCreatedEvent,
  BidSubmitted as BidSubmittedEvent,
  BatchSettled as BatchSettledEvent,
  BatchCancelled as BatchCancelledEvent,
} from "../generated/BatchAuctionSettlement/BatchAuctionSettlement";
import {
  Intent,
  User,
  Solver,
  Token,
  Batch,
  Bid,
  EscrowLock,
  EscrowRelease,
  DailyStats,
} from "../generated/schema";
import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";

// ============ Helpers ============

function getOrCreateUser(address: Address): User {
  let user = User.load(address.toHex());
  if (!user) {
    user = new User(address.toHex());
    user.totalIntents = BigInt.fromI32(0);
    user.totalFulfilled = BigInt.fromI32(0);
    user.totalCancelled = BigInt.fromI32(0);
    user.totalExpired = BigInt.fromI32(0);
    user.totalVolume = BigInt.fromI32(0);
    user.save();
  }
  return user;
}

function getOrCreateSolver(address: Address): Solver {
  let solver = Solver.load(address.toHex());
  if (!solver) {
    solver = new Solver(address.toHex());
    solver.isRegistered = false;
    solver.reputationScore = BigInt.fromI32(0);
    solver.totalFulfilled = BigInt.fromI32(0);
    solver.totalVolume = BigInt.fromI32(0);
    solver.averageFillTime = BigInt.fromI32(0);
    solver.slashedAmount = BigInt.fromI32(0);
    solver.save();
  }
  return solver;
}

function getOrCreateToken(address: Address): Token {
  let token = Token.load(address.toHex());
  if (!token) {
    token = new Token(address.toHex());
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
    stats.totalExpired = BigInt.fromI32(0);
    stats.totalVolume = BigInt.fromI32(0);
    stats.totalProtocolFees = BigInt.fromI32(0);
    stats.uniqueUsers = BigInt.fromI32(0);
    stats.uniqueSolvers = BigInt.fromI32(0);
    stats.save();
  }
  return stats;
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

export function handleIntentCreated(event: IntentCreatedEvent): void {
  let intentId = event.params.intentId.toHex();
  let userAddress = event.params.user;
  let tokenAddress = event.params.token;
  
  let user = getOrCreateUser(userAddress);
  let token = getOrCreateToken(tokenAddress);
  
  let intent = new Intent(intentId);
  intent.user = user.id;
  intent.token = token.id;
  intent.amount = event.params.amount;
  intent.protocolFee = event.params.protocolFee;
  intent.expiryTimestamp = event.params.expiryTimestamp;
  intent.status = "Pending";
  intent.createdAt = event.block.timestamp;
  intent.save();
  
  // Update user stats
  user.totalIntents = user.totalIntents.plus(BigInt.fromI32(1));
  user.totalVolume = user.totalVolume.plus(event.params.amount);
  user.save();
  
  // Update token stats
  token.totalIntents = token.totalIntents.plus(BigInt.fromI32(1));
  token.totalVolume = token.totalVolume.plus(event.params.amount);
  token.save();
  
  // Update daily stats
  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalIntents = stats.totalIntents.plus(BigInt.fromI32(1));
  stats.totalVolume = stats.totalVolume.plus(event.params.amount);
  stats.totalProtocolFees = stats.totalProtocolFees.plus(event.params.protocolFee);
  stats.save();
}

export function handleIntentFulfilled(event: IntentFulfilledEvent): void {
  let intentId = event.params.intentId.toHex();
  let intent = Intent.load(intentId);
  if (!intent) return;
  
  let solverAddress = event.params.solver;
  let solver = getOrCreateSolver(solverAddress);
  
  intent.solver = solver.id;
  intent.status = "Fulfilled";
  intent.fulfilledAt = event.block.timestamp;
  intent.save();
  
  // Update solver stats
  solver.totalFulfilled = solver.totalFulfilled.plus(BigInt.fromI32(1));
  solver.totalVolume = solver.totalVolume.plus(event.params.amount);
  
  // Calculate fill time
  let fillTime = event.block.timestamp.minus(intent.createdAt);
  if (solver.averageFillTime.equals(BigInt.fromI32(0))) {
    solver.averageFillTime = fillTime;
  } else {
    solver.averageFillTime = solver.averageFillTime.plus(fillTime).div(BigInt.fromI32(2));
  }
  solver.save();
  
  // Update user stats
  let user = User.load(intent.user);
  if (user) {
    user.totalFulfilled = user.totalFulfilled.plus(BigInt.fromI32(1));
    user.save();
  }
  
  // Update daily stats
  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalFulfilled = stats.totalFulfilled.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleIntentCancelled(event: IntentCancelledEvent): void {
  let intentId = event.params.intentId.toHex();
  let intent = Intent.load(intentId);
  if (!intent) return;
  
  intent.status = "Cancelled";
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

export function handleIntentExpired(event: IntentExpiredEvent): void {
  let intentId = event.params.intentId.toHex();
  let intent = Intent.load(intentId);
  if (!intent) return;
  
  intent.status = "Expired";
  intent.save();
  
  let user = User.load(intent.user);
  if (user) {
    user.totalExpired = user.totalExpired.plus(BigInt.fromI32(1));
    user.save();
  }
  
  let stats = getOrCreateDailyStats(event.block.timestamp);
  stats.totalExpired = stats.totalExpired.plus(BigInt.fromI32(1));
  stats.save();
}

// ============ Escrow Handlers ============

export function handleTokensLocked(event: TokensLockedEvent): void {
  let lockId = event.params.intentId.toHex();
  let lock = new EscrowLock(lockId);
  lock.intent = lockId;
  lock.token = event.params.token.toHex();
  lock.amount = event.params.amount;
  lock.user = event.params.user.toHex();
  lock.createdAt = event.block.timestamp;
  lock.save();
}

export function handleTokensReleased(event: TokensReleasedEvent): void {
  let releaseId = event.params.intentId.toHex() + "-release";
  let release = new EscrowRelease(releaseId);
  release.intent = event.params.intentId.toHex();
  release.token = event.params.token.toHex();
  release.amount = event.params.amount;
  release.solver = event.params.recipient.toHex();
  release.releasedAt = event.block.timestamp;
  release.save();
}

export function handleTokensRefunded(event: TokensRefundedEvent): void {
  let refundId = event.params.intentId.toHex() + "-refund";
  let refund = new EscrowRelease(refundId);
  refund.intent = event.params.intentId.toHex();
  refund.token = event.params.token.toHex();
  refund.amount = event.params.amount;
  refund.solver = event.params.recipient.toHex();
  refund.releasedAt = event.block.timestamp;
  refund.save();
}

// ============ SolverRegistry Handlers ============

export function handleSolverRegistered(event: SolverRegisteredEvent): void {
  let solver = getOrCreateSolver(event.params.solver);
  solver.isRegistered = true;
  solver.save();
}

export function handleSolverDeregistered(event: SolverDeregisteredEvent): void {
  let solver = Solver.load(event.params.solver.toHex());
  if (solver) {
    solver.isRegistered = false;
    solver.save();
  }
}

export function handleSolverSlashed(event: SolverSlashedEvent): void {
  let solver = Solver.load(event.params.solver.toHex());
  if (solver) {
    solver.slashedAmount = solver.slashedAmount.plus(event.params.amount);
    solver.save();
  }
}

// ============ BatchAuctionSettlement Handlers ============

export function handleBatchCreated(event: BatchCreatedEvent): void {
  let batchId = event.params.batchId.toHex();
  let batch = new Batch(batchId);
  batch.winningBid = BigInt.fromI32(0);
  batch.createdAt = event.block.timestamp;
  batch.auctionEndTime = event.params.auctionEndTime;
  batch.status = "Open";
  batch.save();
}

export function handleBidSubmitted(event: BidSubmittedEvent): void {
  let batchId = event.params.batchId.toHex();
  let solverAddress = event.params.solver;
  let bidId = batchId + "-" + solverAddress.toHex();
  
  let bid = new Bid(bidId);
  bid.batch = batchId;
  bid.solver = solverAddress.toHex();
  bid.priceImprovementBps = event.params.priceImprovementBps;
  bid.createdAt = event.block.timestamp;
  bid.save();
}

export function handleBatchSettled(event: BatchSettledEvent): void {
  let batchId = event.params.batchId.toHex();
  let batch = Batch.load(batchId);
  if (!batch) return;
  
  batch.winningSolver = event.params.winningSolver.toHex();
  batch.winningBid = event.params.winningBid;
  batch.status = "Settled";
  batch.save();
}

export function handleBatchCancelled(event: BatchCancelledEvent): void {
  let batchId = event.params.batchId.toHex();
  let batch = Batch.load(batchId);
  if (!batch) return;
  
  batch.status = "Cancelled";
  batch.save();
}
