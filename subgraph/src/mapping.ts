// subgraph/src/mapping.ts
import { BigInt, Bytes, Address } from "@graphprotocol/graph-ts";
import {
  DisputeCreated,
  EvidenceSubmitted,
  AIVerdictRequested,
  AIVerdictReceived,
  DisputeAppealed,
  DisputeResolved,
  DisputeCancelled
} from "../generated/DisputeResolution/DisputeResolution";
import {
  Protocol,
  User,
  Dispute,
  Evidence,
  AIVerdict,
  Appeal,
  DisputeEvent,
  DailyStats,
  HourlyStats,
  CategoryStat
} from "../generated/schema";

// Constants
const PROTOCOL_ID = "dispute-resolution-protocol";
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_HOUR = 3600;

// Helper functions
function getOrCreateProtocol(): Protocol {
  let protocol = Protocol.load(PROTOCOL_ID);
  if (!protocol) {
    protocol = new Protocol(PROTOCOL_ID);
    protocol.totalDisputes = BigInt.fromI32(0);
    protocol.activeDisputes = BigInt.fromI32(0);
    protocol.resolvedDisputes = BigInt.fromI32(0);
    protocol.cancelledDisputes = BigInt.fromI32(0);
    protocol.totalValueLocked = BigInt.fromI32(0);
    protocol.totalVolumeProcessed = BigInt.fromI32(0);
    protocol.totalPlatformFees = BigInt.fromI32(0);
    protocol.averageResolutionTime = BigInt.fromI32(0);
    protocol.averageConfidenceScore = BigInt.fromI32(0);
    protocol.createdAt = BigInt.fromI32(0);
    protocol.updatedAt = BigInt.fromI32(0);
  }
  return protocol;
}

function getOrCreateUser(address: Address): User {
  let user = User.load(address.toHexString());
  if (!user) {
    user = new User(address.toHexString());
    user.totalDisputes = BigInt.fromI32(0);
    user.disputesWon = BigInt.fromI32(0);
    user.disputesLost = BigInt.fromI32(0);
    user.totalValueDisputed = BigInt.fromI32(0);
    user.totalValueWon = BigInt.fromI32(0);
    user.totalValueLost = BigInt.fromI32(0);
    user.reputation = BigInt.fromI32(100); // Start with base reputation
    user.createdAt = BigInt.fromI32(0);
    user.updatedAt = BigInt.fromI32(0);
  }
  return user;
}

function getOrCreateDailyStats(timestamp: BigInt): DailyStats {
  let dayId = timestamp.div(BigInt.fromI32(SECONDS_PER_DAY));
  let id = dayId.toString();
  let stats = DailyStats.load(id);
  if (!stats) {
    stats = new DailyStats(id);
    stats.date = dayId.times(BigInt.fromI32(SECONDS_PER_DAY));
    stats.disputesCreated = BigInt.fromI32(0);
    stats.disputesResolved = BigInt.fromI32(0);
    stats.disputesCancelled = BigInt.fromI32(0);
    stats.evidenceSubmitted = BigInt.fromI32(0);
    stats.verdictsDelivered = BigInt.fromI32(0);
    stats.appeals = BigInt.fromI32(0);
    stats.volumeCreated = BigInt.fromI32(0);
    stats.volumeResolved = BigInt.fromI32(0);
    stats.platformFees = BigInt.fromI32(0);
    stats.uniqueUsers = BigInt.fromI32(0);
  }
  return stats;
}

function getOrCreateHourlyStats(timestamp: BigInt): HourlyStats {
  let hourId = timestamp.div(BigInt.fromI32(SECONDS_PER_HOUR));
  let id = hourId.toString();
  let stats = HourlyStats.load(id);
  if (!stats) {
    stats = new HourlyStats(id);
    stats.hour = hourId.times(BigInt.fromI32(SECONDS_PER_HOUR));
    stats.disputesCreated = BigInt.fromI32(0);
    stats.disputesResolved = BigInt.fromI32(0);
    stats.evidenceSubmitted = BigInt.fromI32(0);
    stats.volumeCreated = BigInt.fromI32(0);
  }
  return stats;
}

function getOrCreateCategoryStat(category: i32): CategoryStat {
  let id = "category-" + category.toString();
  let stat = CategoryStat.load(id);
  if (!stat) {
    stat = new CategoryStat(id);
    stat.protocol = PROTOCOL_ID;
    stat.category = getCategoryEnum(category);
    stat.count = BigInt.fromI32(0);
    stat.totalValue = BigInt.fromI32(0);
    stat.resolvedCount = BigInt.fromI32(0);
    stat.claimantWins = BigInt.fromI32(0);
    stat.respondentWins = BigInt.fromI32(0);
    stat.splits = BigInt.fromI32(0);
    stat.dismissed = BigInt.fromI32(0);
  }
  return stat;
}

function getCategoryEnum(category: i32): string {
  if (category == 0) return "ContractBreach";
  if (category == 1) return "ServiceQuality";
  if (category == 2) return "PaymentDispute";
  if (category == 3) return "IntellectualProperty";
  if (category == 4) return "FraudClaim";
  return "Other";
}

function getStatusEnum(status: i32): string {
  if (status == 0) return "Created";
  if (status == 1) return "EvidenceSubmission";
  if (status == 2) return "AwaitingAIVerdict";
  if (status == 3) return "VerdictDelivered";
  if (status == 4) return "AppealPeriod";
  if (status == 5) return "Resolved";
  return "Cancelled";
}

function getResolutionEnum(resolution: i32): string {
  if (resolution == 1) return "FavorClaimant";
  if (resolution == 2) return "FavorRespondent";
  if (resolution == 3) return "Split";
  if (resolution == 4) return "Dismissed";
  return "None";
}

function getEvidenceTypeEnum(evidenceType: i32): string {
  if (evidenceType == 0) return "Document";
  if (evidenceType == 1) return "Image";
  if (evidenceType == 2) return "Video";
  if (evidenceType == 3) return "Contract";
  if (evidenceType == 4) return "Communication";
  if (evidenceType == 5) return "Transaction";
  return "Other";
}

function createDisputeEvent(
  dispute: Dispute,
  eventType: string,
  timestamp: BigInt,
  txHash: Bytes,
  blockNumber: BigInt,
  logIndex: BigInt,
  data: string
): void {
  let id = txHash.toHexString() + "-" + logIndex.toString();
  let event = new DisputeEvent(id);
  event.dispute = dispute.id;
  event.eventType = eventType;
  event.timestamp = timestamp;
  event.data = data;
  event.transactionHash = txHash;
  event.blockNumber = blockNumber;
  event.logIndex = logIndex;
  event.save();
}

// Event Handlers

export function handleDisputeCreated(event: DisputeCreated): void {
  let disputeId = event.params.disputeId.toString();
  let timestamp = event.block.timestamp;
  
  // Get or create entities
  let protocol = getOrCreateProtocol();
  let claimant = getOrCreateUser(event.params.claimant);
  let respondent = getOrCreateUser(event.params.respondent);
  let dailyStats = getOrCreateDailyStats(timestamp);
  let hourlyStats = getOrCreateHourlyStats(timestamp);
  let categoryStat = getOrCreateCategoryStat(event.params.category);

  // Create dispute
  let dispute = new Dispute(disputeId);
  dispute.disputeId = event.params.disputeId;
  dispute.claimant = claimant.id;
  dispute.respondent = respondent.id;
  dispute.amount = event.params.amount;
  dispute.totalPool = event.params.amount; // Will be doubled when accepted
  dispute.category = getCategoryEnum(event.params.category);
  dispute.status = "Created";
  dispute.resolution = "None";
  dispute.descriptionHash = "";
  dispute.aiConfidenceScore = 0;
  dispute.appealed = false;
  dispute.createdAt = timestamp;
  dispute.evidenceDeadline = timestamp.plus(BigInt.fromI32(259200)); // 3 days
  dispute.transactionHash = event.transaction.hash;
  dispute.blockNumber = event.block.number;
  dispute.save();

  // Update protocol stats
  protocol.totalDisputes = protocol.totalDisputes.plus(BigInt.fromI32(1));
  protocol.activeDisputes = protocol.activeDisputes.plus(BigInt.fromI32(1));
  protocol.totalValueLocked = protocol.totalValueLocked.plus(event.params.amount);
  protocol.updatedAt = timestamp;
  if (protocol.createdAt.equals(BigInt.fromI32(0))) {
    protocol.createdAt = timestamp;
  }
  protocol.save();

  // Update user stats
  claimant.totalDisputes = claimant.totalDisputes.plus(BigInt.fromI32(1));
  claimant.totalValueDisputed = claimant.totalValueDisputed.plus(event.params.amount);
  claimant.updatedAt = timestamp;
  if (claimant.createdAt.equals(BigInt.fromI32(0))) {
    claimant.createdAt = timestamp;
  }
  claimant.save();

  respondent.totalDisputes = respondent.totalDisputes.plus(BigInt.fromI32(1));
  respondent.totalValueDisputed = respondent.totalValueDisputed.plus(event.params.amount);
  respondent.updatedAt = timestamp;
  if (respondent.createdAt.equals(BigInt.fromI32(0))) {
    respondent.createdAt = timestamp;
  }
  respondent.save();

  // Update daily stats
  dailyStats.disputesCreated = dailyStats.disputesCreated.plus(BigInt.fromI32(1));
  dailyStats.volumeCreated = dailyStats.volumeCreated.plus(event.params.amount);
  dailyStats.save();

  // Update hourly stats
  hourlyStats.disputesCreated = hourlyStats.disputesCreated.plus(BigInt.fromI32(1));
  hourlyStats.volumeCreated = hourlyStats.volumeCreated.plus(event.params.amount);
  hourlyStats.save();

  // Update category stats
  categoryStat.count = categoryStat.count.plus(BigInt.fromI32(1));
  categoryStat.totalValue = categoryStat.totalValue.plus(event.params.amount);
  categoryStat.save();

  // Create event record
  createDisputeEvent(
    dispute,
    "Created",
    timestamp,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
    '{"amount":"' + event.params.amount.toString() + '","category":' + event.params.category.toString() + '}'
  );
}

export function handleEvidenceSubmitted(event: EvidenceSubmitted): void {
  let disputeId = event.params.disputeId.toString();
  let timestamp = event.block.timestamp;
  
  let dispute = Dispute.load(disputeId);
  if (!dispute) return;

  let submitter = getOrCreateUser(event.params.submitter);
  let dailyStats = getOrCreateDailyStats(timestamp);
  let hourlyStats = getOrCreateHourlyStats(timestamp);

  // Count existing evidence to create unique ID
  let evidenceIndex = 0;
  let evidenceId = disputeId + "-" + evidenceIndex.toString();
  while (Evidence.load(evidenceId)) {
    evidenceIndex++;
    evidenceId = disputeId + "-" + evidenceIndex.toString();
  }

  // Create evidence record
  let evidence = new Evidence(evidenceId);
  evidence.dispute = disputeId;
  evidence.submitter = submitter.id;
  evidence.contentHash = event.params.contentHash;
  evidence.evidenceType = getEvidenceTypeEnum(event.params.evidenceType);
  evidence.timestamp = timestamp;
  evidence.transactionHash = event.transaction.hash;
  evidence.blockNumber = event.block.number;
  evidence.save();

  // Update dispute status if still in Created
  if (dispute.status == "Created") {
    dispute.status = "EvidenceSubmission";
    dispute.save();
  }

  // Update daily stats
  dailyStats.evidenceSubmitted = dailyStats.evidenceSubmitted.plus(BigInt.fromI32(1));
  dailyStats.save();

  // Update hourly stats
  hourlyStats.evidenceSubmitted = hourlyStats.evidenceSubmitted.plus(BigInt.fromI32(1));
  hourlyStats.save();

  // Create event record
  createDisputeEvent(
    dispute,
    "EvidenceSubmitted",
    timestamp,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
    '{"submitter":"' + event.params.submitter.toHexString() + '","type":' + event.params.evidenceType.toString() + '}'
  );
}

export function handleAIVerdictRequested(event: AIVerdictRequested): void {
  let disputeId = event.params.disputeId.toString();
  let timestamp = event.block.timestamp;
  
  let dispute = Dispute.load(disputeId);
  if (!dispute) return;

  dispute.status = "AwaitingAIVerdict";
  dispute.verdictRequestedAt = timestamp;
  dispute.save();

  createDisputeEvent(
    dispute,
    "VerdictRequested",
    timestamp,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
    '{"requestId":"' + event.params.genLayerRequestId.toHexString() + '"}'
  );
}

export function handleAIVerdictReceived(event: AIVerdictReceived): void {
  let disputeId = event.params.disputeId.toString();
  let timestamp = event.block.timestamp;
  
  let dispute = Dispute.load(disputeId);
  if (!dispute) return;

  let dailyStats = getOrCreateDailyStats(timestamp);

  // Create AI verdict record
  let verdict = new AIVerdict(disputeId);
  verdict.dispute = disputeId;
  verdict.decision = getResolutionEnum(event.params.resolution);
  verdict.confidenceScore = event.params.confidenceScore;
  verdict.reasoningHash = "";
  verdict.genLayerRequestId = new Bytes(0);
  verdict.timestamp = timestamp;
  verdict.transactionHash = event.transaction.hash;
  verdict.blockNumber = event.block.number;
  verdict.save();

  // Update dispute
  dispute.status = "VerdictDelivered";
  dispute.resolution = getResolutionEnum(event.params.resolution);
  dispute.aiConfidenceScore = event.params.confidenceScore;
  dispute.verdictDeliveredAt = timestamp;
  dispute.appealDeadline = timestamp.plus(BigInt.fromI32(172800)); // 2 days
  dispute.save();

  // Update daily stats
  dailyStats.verdictsDelivered = dailyStats.verdictsDelivered.plus(BigInt.fromI32(1));
  dailyStats.save();

  createDisputeEvent(
    dispute,
    "VerdictReceived",
    timestamp,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
    '{"resolution":' + event.params.resolution.toString() + ',"confidence":' + event.params.confidenceScore.toString() + '}'
  );
}

export function handleDisputeAppealed(event: DisputeAppealed): void {
  let disputeId = event.params.disputeId.toString();
  let timestamp = event.block.timestamp;
  
  let dispute = Dispute.load(disputeId);
  if (!dispute) return;

  let appealer = getOrCreateUser(event.params.appealer);
  let dailyStats = getOrCreateDailyStats(timestamp);

  // Create appeal record
  let appeal = new Appeal(disputeId);
  appeal.dispute = disputeId;
  appeal.appealer = appealer.id;
  appeal.stakeAmount = event.params.stakeAmount;
  appeal.timestamp = timestamp;
  appeal.transactionHash = event.transaction.hash;
  appeal.blockNumber = event.block.number;
  appeal.save();

  // Update dispute
  dispute.status = "AppealPeriod";
  dispute.appealed = true;
  dispute.appealedAt = timestamp;
  dispute.save();

  // Update daily stats
  dailyStats.appeals = dailyStats.appeals.plus(BigInt.fromI32(1));
  dailyStats.save();

  createDisputeEvent(
    dispute,
    "Appealed",
    timestamp,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
    '{"appealer":"' + event.params.appealer.toHexString() + '","stake":"' + event.params.stakeAmount.toString() + '"}'
  );
}

export function handleDisputeResolved(event: DisputeResolved): void {
  let disputeId = event.params.disputeId.toString();
  let timestamp = event.block.timestamp;
  
  let dispute = Dispute.load(disputeId);
  if (!dispute) return;

  let protocol = getOrCreateProtocol();
  let claimant = User.load(dispute.claimant);
  let respondent = User.load(dispute.respondent);
  let dailyStats = getOrCreateDailyStats(timestamp);
  let hourlyStats = getOrCreateHourlyStats(timestamp);
  let categoryStat = CategoryStat.load("category-" + dispute.category);

  let platformFee = dispute.totalPool.times(BigInt.fromI32(250)).div(BigInt.fromI32(10000));

  // Update dispute
  dispute.status = "Resolved";
  dispute.resolution = getResolutionEnum(event.params.resolution);
  dispute.resolvedAt = timestamp;
  dispute.claimantPayout = event.params.claimantPayout;
  dispute.respondentPayout = event.params.respondentPayout;
  dispute.platformFee = platformFee;
  dispute.save();

  // Update protocol stats
  protocol.activeDisputes = protocol.activeDisputes.minus(BigInt.fromI32(1));
  protocol.resolvedDisputes = protocol.resolvedDisputes.plus(BigInt.fromI32(1));
  protocol.totalValueLocked = protocol.totalValueLocked.minus(dispute.totalPool);
  protocol.totalVolumeProcessed = protocol.totalVolumeProcessed.plus(dispute.totalPool);
  protocol.totalPlatformFees = protocol.totalPlatformFees.plus(platformFee);
  protocol.updatedAt = timestamp;
  protocol.save();

  // Update user stats based on resolution
  if (claimant && respondent) {
    if (event.params.resolution == 1) { // FavorClaimant
      claimant.disputesWon = claimant.disputesWon.plus(BigInt.fromI32(1));
      claimant.totalValueWon = claimant.totalValueWon.plus(event.params.claimantPayout);
      respondent.disputesLost = respondent.disputesLost.plus(BigInt.fromI32(1));
      respondent.totalValueLost = respondent.totalValueLost.plus(dispute.amount);
      claimant.reputation = claimant.reputation.plus(BigInt.fromI32(5));
      respondent.reputation = respondent.reputation.minus(BigInt.fromI32(3));
    } else if (event.params.resolution == 2) { // FavorRespondent
      respondent.disputesWon = respondent.disputesWon.plus(BigInt.fromI32(1));
      respondent.totalValueWon = respondent.totalValueWon.plus(event.params.respondentPayout);
      claimant.disputesLost = claimant.disputesLost.plus(BigInt.fromI32(1));
      claimant.totalValueLost = claimant.totalValueLost.plus(dispute.amount);
      respondent.reputation = respondent.reputation.plus(BigInt.fromI32(5));
      claimant.reputation = claimant.reputation.minus(BigInt.fromI32(3));
    }
    claimant.updatedAt = timestamp;
    respondent.updatedAt = timestamp;
    claimant.save();
    respondent.save();
  }

  // Update daily stats
  dailyStats.disputesResolved = dailyStats.disputesResolved.plus(BigInt.fromI32(1));
  dailyStats.volumeResolved = dailyStats.volumeResolved.plus(dispute.totalPool);
  dailyStats.platformFees = dailyStats.platformFees.plus(platformFee);
  dailyStats.save();

  // Update hourly stats
  hourlyStats.disputesResolved = hourlyStats.disputesResolved.plus(BigInt.fromI32(1));
  hourlyStats.save();

  // Update category stats
  if (categoryStat) {
    categoryStat.resolvedCount = categoryStat.resolvedCount.plus(BigInt.fromI32(1));
    if (event.params.resolution == 1) categoryStat.claimantWins = categoryStat.claimantWins.plus(BigInt.fromI32(1));
    if (event.params.resolution == 2) categoryStat.respondentWins = categoryStat.respondentWins.plus(BigInt.fromI32(1));
    if (event.params.resolution == 3) categoryStat.splits = categoryStat.splits.plus(BigInt.fromI32(1));
    if (event.params.resolution == 4) categoryStat.dismissed = categoryStat.dismissed.plus(BigInt.fromI32(1));
    categoryStat.save();
  }

  createDisputeEvent(
    dispute,
    "Resolved",
    timestamp,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
    '{"resolution":' + event.params.resolution.toString() + ',"claimantPayout":"' + event.params.claimantPayout.toString() + '","respondentPayout":"' + event.params.respondentPayout.toString() + '"}'
  );
}

export function handleDisputeCancelled(event: DisputeCancelled): void {
  let disputeId = event.params.disputeId.toString();
  let timestamp = event.block.timestamp;
  
  let dispute = Dispute.load(disputeId);
  if (!dispute) return;

  let protocol = getOrCreateProtocol();
  let dailyStats = getOrCreateDailyStats(timestamp);

  // Update dispute
  dispute.status = "Cancelled";
  dispute.cancelledAt = timestamp;
  dispute.save();

  // Update protocol stats
  protocol.activeDisputes = protocol.activeDisputes.minus(BigInt.fromI32(1));
  protocol.cancelledDisputes = protocol.cancelledDisputes.plus(BigInt.fromI32(1));
  protocol.totalValueLocked = protocol.totalValueLocked.minus(dispute.amount);
  protocol.updatedAt = timestamp;
  protocol.save();

  // Update daily stats
  dailyStats.disputesCancelled = dailyStats.disputesCancelled.plus(BigInt.fromI32(1));
  dailyStats.save();

  createDisputeEvent(
    dispute,
    "Cancelled",
    timestamp,
    event.transaction.hash,
    event.block.number,
    event.logIndex,
    '{}'
  );
}
