import { runL0Trial, type L0Classification, type L0TrialCase, type L0TrialReceipt } from './l0-safety';

/**
 * This module intentionally uses FNV-1a only as a deterministic,
 * non-cryptographic checksum.  It is not a signature, authentication scheme,
 * or cryptographic proof.
 */
export const CHECKPOINT_LIMITS = Object.freeze({
  maxStringLength: 256,
  maxSourceReceiptLength: 512,
  maxL1Events: 64,
  maxCanonicalDepth: 16,
  maxCanonicalLength: 32_768,
  maxMerkleLeaves: 64,
  fnvAlgorithm: 'fnv1a-32-non-cryptographic-checksum',
} as const);

export type CheckpointLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type CheckpointPermit = Readonly<{
  level: CheckpointLevel;
  grantedBy: string;
}>;

export type CheckpointContradiction = Readonly<{
  code: string;
  detected: boolean;
  detail: string;
}>;

export type AtomicCheckpoint = Readonly<{
  level: 'L0';
  id: string;
  operation: L0TrialReceipt['operation'];
  classification: L0Classification;
  result: string;
  finiteNumericResult: number | null;
  accepted: boolean;
  contradictions: readonly CheckpointContradiction[];
  l0ReceiptChecksum: string;
  checksum: string;
}>;

export type AggregateCounts = Readonly<{
  operations: number;
  accepted: number;
  rejected: number;
}>;

export type AggregateBlock = Readonly<{
  level: 'L1';
  id: string;
  eventCount: number;
  counts: AggregateCounts;
  finiteResultRange: Readonly<{ min: number | null; max: number | null }>;
  edgeClassifications: readonly L0Classification[];
  contradictions: readonly CheckpointContradiction[];
  accepted: boolean;
  events: readonly AtomicCheckpoint[];
  treeRoot: string;
  checksum: string;
}>;

/** An external receipt is intentionally supplied by the caller, never fetched. */
export type SourceReceiptReference = Readonly<{
  sourceId: string;
  receiptChecksum: string;
}>;

export type BoundaryReceipt = Readonly<{
  level: 'L2' | 'L3';
  id: string;
  aggregateId: string;
  l1TreeRoot: string;
  sourceReceipt: SourceReceiptReference;
  accepted: boolean;
  contradictions: readonly CheckpointContradiction[];
  checksum: string;
}>;

export type MerkleTree = Readonly<{
  algorithm: typeof CHECKPOINT_LIMITS.fnvAlgorithm;
  leaves: readonly string[];
  levels: readonly (readonly string[])[];
  root: string;
}>;

type CanonicalValue = null | boolean | number | string | readonly CanonicalValue[] | { readonly [key: string]: CanonicalValue };

function fail(message: string): never {
  throw new RangeError(`Checkpoint ledger: ${message}`);
}

function requireText(value: unknown, name: string, maximum: number = CHECKPOINT_LIMITS.maxStringLength): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum) {
    fail(`${name} must be a non-empty string of at most ${maximum} characters.`);
  }
}

function requirePermit(permit: CheckpointPermit, level: CheckpointLevel): void {
  if (!permit || permit.level !== level) fail(`an explicit ${level} permit is required.`);
  requireText(permit.grantedBy, 'permit.grantedBy');
}

function canonicalize(value: unknown, depth: number, seen: Set<object>): CanonicalValue {
  if (depth > CHECKPOINT_LIMITS.maxCanonicalDepth) fail('canonical value exceeds the maximum nesting depth.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    if (typeof value === 'string' && value.length > CHECKPOINT_LIMITS.maxCanonicalLength) fail('canonical string is too long.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('canonical JSON does not permit non-finite numbers.');
    return value;
  }
  if (typeof value !== 'object' || seen.has(value)) fail('canonical JSON requires acyclic plain data.');
  seen.add(value);
  let output: CanonicalValue;
  if (Array.isArray(value)) {
    output = value.map((item) => canonicalize(item, depth + 1, seen));
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      fail('canonical JSON requires plain objects.');
    }
    const record: { [key: string]: CanonicalValue } = {};
    for (const key of Object.keys(value).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) fail('canonical JSON does not permit undefined values.');
      record[key] = canonicalize(item, depth + 1, seen);
    }
    output = record;
  }
  seen.delete(value);
  return output;
}

/** Stable JSON with lexicographically sorted object keys and no implicit coercions. */
export function canonicalJson(value: unknown): string {
  const json = JSON.stringify(canonicalize(value, 0, new Set<object>()));
  if (json.length > CHECKPOINT_LIMITS.maxCanonicalLength) fail('canonical JSON exceeds the maximum length.');
  return json;
}

/** Returns a clearly labelled FNV-1a non-cryptographic checksum. */
export function canonicalSemanticHash(value: unknown): string {
  const json = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) hash = Math.imul(hash ^ json.charCodeAt(index), 0x01000193);
  return `${CHECKPOINT_LIMITS.fnvAlgorithm}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function checksumText(value: string, name: string): void {
  requireText(value, name, CHECKPOINT_LIMITS.maxSourceReceiptLength);
}

/** Builds a binary Merkle-style checksum tree; odd layers duplicate their final node. */
export function buildMerkleTree(leaves: readonly string[]): MerkleTree {
  if (!Array.isArray(leaves) || leaves.length === 0 || leaves.length > CHECKPOINT_LIMITS.maxMerkleLeaves) {
    fail(`Merkle leaves must contain between 1 and ${CHECKPOINT_LIMITS.maxMerkleLeaves} entries.`);
  }
  const first = leaves.map((leaf, index) => {
    checksumText(leaf, `leaves[${index}]`);
    return canonicalSemanticHash({ domain: 'aeon-checkpoint-merkle-leaf-v1', value: leaf });
  });
  const levels: string[][] = [first];
  let current = first;
  while (current.length > 1) {
    const next: string[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const right = current[index + 1] ?? current[index];
      next.push(canonicalSemanticHash({ domain: 'aeon-checkpoint-merkle-node-v1', left: current[index], right }));
    }
    levels.push(next);
    current = next;
  }
  return Object.freeze({ algorithm: CHECKPOINT_LIMITS.fnvAlgorithm, leaves: Object.freeze([...leaves]), levels: Object.freeze(levels.map((level) => Object.freeze([...level]))), root: current[0] });
}

/** Convenience helper when only the deterministic tree root is needed. */
export function merkleRoot(leaves: readonly string[]): string {
  return buildMerkleTree(leaves).root;
}

function finiteResult(receipt: L0TrialReceipt): number | null {
  const parsed = Number(receipt.result);
  return Number.isFinite(parsed) ? parsed : null;
}

function l0Contradictions(receipt: L0TrialReceipt): CheckpointContradiction[] {
  const detected = receipt.contradictions.filter((item) => item.detected);
  return [
    ...detected.map((item) => ({ code: item.code, detected: true, detail: item.detail })),
    {
      code: 'L0_ACCEPTANCE_ALIGNMENT',
      detected: receipt.accepted === (detected.length > 0),
      detail: 'L0 accepted must be false exactly when its source receipt detects a contradiction.',
    },
  ];
}

/** Converts an already evaluated L0 safety receipt into a bounded atomic event. */
export function createAtomicCheckpoint(permit: CheckpointPermit, receipt: L0TrialReceipt): AtomicCheckpoint {
  requirePermit(permit, 'L0');
  if (!receipt || receipt.model !== 'aeon-l0-arithmetic-bitwise-v1') fail('receipt must be an L0 safety receipt.');
  requireText(receipt.id, 'receipt.id');
  checksumText(receipt.receiptHash, 'receipt.receiptHash');
  const contradictions = l0Contradictions(receipt);
  const accepted = !contradictions.some((item) => item.detected);
  const base = {
    level: 'L0' as const, id: receipt.id, operation: receipt.operation, classification: receipt.classification,
    result: receipt.result, finiteNumericResult: finiteResult(receipt), accepted, contradictions,
    l0ReceiptChecksum: receipt.receiptHash,
  };
  return Object.freeze({ ...base, checksum: canonicalSemanticHash(base) });
}

/** Aggregates explicitly supplied L0 events in input order into one bounded L1 block. */
export function aggregateCheckpoints(permit: CheckpointPermit, id: string, events: readonly AtomicCheckpoint[]): AggregateBlock {
  requirePermit(permit, 'L1');
  requireText(id, 'aggregate id');
  if (!Array.isArray(events) || events.length === 0 || events.length > CHECKPOINT_LIMITS.maxL1Events) {
    fail(`L1 blocks must contain between 1 and ${CHECKPOINT_LIMITS.maxL1Events} events.`);
  }
  for (const event of events) {
    if (!event || event.level !== 'L0') fail('L1 blocks only accept L0 atomic checkpoints.');
    checksumText(event.checksum, 'event.checksum');
    const { checksum, ...semanticFields } = event;
    if (checksum !== canonicalSemanticHash(semanticFields)) fail(`L0 event ${event.id} checksum does not match its semantic fields.`);
  }
  const acceptedCount = events.filter((event) => event.accepted).length;
  const values = events.map((event) => event.finiteNumericResult).filter((value): value is number => value !== null);
  const edgeClassifications = [...new Set(events.map((event) => event.classification))].sort() as L0Classification[];
  const contradictions: CheckpointContradiction[] = [
    { code: 'L1_COUNT_ALIGNMENT', detected: acceptedCount + (events.length - acceptedCount) !== events.length, detail: 'Accepted and rejected counts must partition all operations.' },
    { code: 'L1_EVENT_CONTRADICTION', detected: events.some((event) => event.contradictions.some((item: CheckpointContradiction) => item.detected) && event.accepted), detail: 'An event with a detected contradiction cannot be accepted.' },
  ];
  const treeRoot = merkleRoot(events.map((event) => event.checksum));
  const base = {
    level: 'L1' as const, id, eventCount: events.length,
    counts: { operations: events.length, accepted: acceptedCount, rejected: events.length - acceptedCount },
    finiteResultRange: { min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null },
    edgeClassifications, contradictions, accepted: !contradictions.some((item) => item.detected),
    events: [...events], treeRoot,
  };
  return Object.freeze({ ...base, checksum: canonicalSemanticHash(base) });
}

/** Creates a durable L2 or L3 receipt using only explicit caller-provided source evidence. */
export function buildBoundaryReceipt(
  permit: CheckpointPermit, id: string, aggregate: AggregateBlock, sourceReceipt: SourceReceiptReference,
): BoundaryReceipt {
  if (!permit || (permit.level !== 'L2' && permit.level !== 'L3')) fail('an explicit L2 or L3 permit is required.');
  requirePermit(permit, permit.level);
  requireText(id, 'boundary id');
  if (!aggregate || aggregate.level !== 'L1') fail('boundary receipts require an L1 aggregate block.');
  requireText(sourceReceipt?.sourceId, 'sourceReceipt.sourceId');
  checksumText(sourceReceipt?.receiptChecksum, 'sourceReceipt.receiptChecksum');
  const { checksum: aggregateChecksum, ...aggregateSemanticFields } = aggregate;
  const contradictions: CheckpointContradiction[] = [
    { code: 'BOUNDARY_AGGREGATE_CHECKSUM', detected: aggregateChecksum !== canonicalSemanticHash(aggregateSemanticFields), detail: 'The supplied L1 aggregate checksum must match its semantic fields.' },
    { code: 'BOUNDARY_TREE_REFERENCE', detected: aggregate.treeRoot !== merkleRoot(aggregate.events.map((event) => event.checksum)), detail: 'The L1 tree root must match its event checksums.' },
    { code: 'BOUNDARY_ACCEPTANCE_ALIGNMENT', detected: aggregate.accepted && aggregate.contradictions.some((item) => item.detected), detail: 'An accepted aggregate cannot contain a detected contradiction.' },
  ];
  const base = {
    level: permit.level, id, aggregateId: aggregate.id, l1TreeRoot: aggregate.treeRoot,
    sourceReceipt: { sourceId: sourceReceipt.sourceId, receiptChecksum: sourceReceipt.receiptChecksum },
    accepted: aggregate.accepted && !contradictions.some((item) => item.detected), contradictions,
  };
  return Object.freeze({ ...base, checksum: canonicalSemanticHash(base) });
}

export const DEFAULT_CHECKPOINT_L0_CASES: readonly L0TrialCase[] = Object.freeze([
  { id: 'checkpoint-negative-fractional-power', operation: 'POW', left: -8, right: 0.5 },
  { id: 'checkpoint-zero-negative-power', operation: 'POW', left: 0, right: -1 },
  { id: 'checkpoint-five-xor-three', operation: 'XOR', left: 5, right: 3 },
]);

/** A deterministic demo assembled only from explicit L0 POW/XOR input cases. */
export function buildCheckpointDemo(): Readonly<{ events: readonly AtomicCheckpoint[]; aggregate: AggregateBlock; boundary: BoundaryReceipt }> {
  const events = DEFAULT_CHECKPOINT_L0_CASES.map((trial) => createAtomicCheckpoint({ level: 'L0', grantedBy: 'checkpoint-demo' }, runL0Trial(trial)));
  const aggregate = aggregateCheckpoints({ level: 'L1', grantedBy: 'checkpoint-demo' }, 'checkpoint-demo-l1', events);
  const boundary = buildBoundaryReceipt(
    { level: 'L2', grantedBy: 'checkpoint-demo' }, 'checkpoint-demo-l2', aggregate,
    { sourceId: 'explicit-demo-source', receiptChecksum: 'demo-source-receipt-v1' },
  );
  return Object.freeze({ events: Object.freeze(events), aggregate, boundary });
}