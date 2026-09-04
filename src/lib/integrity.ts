/**
 * FRAY is a length-prefixed binary frame. Its 28-byte header is, in order:
 * magic (FRAY), schema u32, index position u32, timestamp u64, block count
 * u32, and payload size u32. All multi-byte values are big-endian.
 *
 * The "rigidbody", "suit", armor, mass, and velocity names below are display
 * metaphors only. Their values are deterministic numeric annotations; they do
 * not represent physical measurements or a claim about physical simulation.
 */

export const FRAY_MAGIC = 'FRAY';
export const FRAY_SCHEMA_VERSION = 1;
export const FRAY_HEADER_BYTES = 28;
export const MAX_FRAY_PAYLOAD_BYTES = 65_536;
export const MAX_INTEGRITY_TRACKS = 15;

const UINT32_MAX = 0xffff_ffff;
const UINT64_MAX = 0xffff_ffff_ffff_ffffn;

export type BitValue = 0 | 1;
export type ParityState = 'even' | 'odd';
export type ArmorState = 'standard' | 'reinforced';

/** Derived display values only, deliberately not physical quantities. */
export type MetaphorMetadata = {
  frequency: number;
  tolerance: number;
  threshold: number;
  mass: number;
  velocity: number;
};

export type BitSuit = MetaphorMetadata & {
  bitIndex: number;
  byteIndex: number;
  bitOffset: number;
  value: BitValue;
  suitLabel: string;
  armorState: ArmorState;
  parity: ParityState;
};

export type DataRigidbody = MetaphorMetadata & {
  byteIndex: number;
  value: number;
  suitLabel: string;
  armorState: ArmorState;
  parity: ParityState;
  bits: BitSuit[];
};

export type FrayHeader = {
  schema: number;
  indexPosition: number;
  timestamp: bigint;
  blockCount: number;
  payloadSize: number;
};

export type FrayFrame = {
  header: FrayHeader;
  payload: Uint8Array;
};

export type FrayFrameInput = {
  payload: Uint8Array;
  schema?: number;
  indexPosition?: number;
  timestamp?: bigint;
  blockCount?: number;
};

export type DecodeFrayOptions = {
  /** Defaults to the currently supported FRAY schema version. */
  expectedSchema?: number | readonly number[];
};

export type IntegrityTrialOptions = FrayFrameInput & {
  /** Odd number of independently corrupted observations. Defaults to 5. */
  trackCount?: number;
  /** Per-bit corruption probability in the inclusive interval [0, 1]. */
  noiseRatio?: number;
};

export type TrackMetrics = {
  track: number;
  flippedBits: number;
  changedBytes: number;
  matchingBits: number;
  observedBitErrorRate: number;
  observedByteErrorRate: number;
};

export type RecoveryMetrics = {
  totalBits: number;
  totalBytes: number;
  majorityThreshold: number;
  noisyBitFlipsTotal: number;
  noisyChangedBytesTotal: number;
  observedTrackBitErrorRate: number;
  observedTrackByteErrorRate: number;
  recoveredMatchingBits: number;
  recoveredMismatchedBits: number;
  recoveredMatchingBytes: number;
  recoveredMismatchedBytes: number;
  recoveredBitRate: number;
  recoveredByteRate: number;
  exactRecovery: boolean;
};

/** Receipt values describe the frame externally and are never appended to it. */
export type IntegrityReceipt = {
  checksum: number;
  checksumHex: string;
  receiptHash: string;
  prngSeed: number;
};

export type IntegrityTrial = {
  frame: FrayFrame;
  encodedFrame: Uint8Array;
  receipt: IntegrityReceipt;
  tracks: Uint8Array[];
  recoveredPayload: Uint8Array;
  trackMetrics: TrackMetrics[];
  recovery: RecoveryMetrics;
  dataRigidbodies: DataRigidbody[];
};

export class FrayFrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrayFrameError';
  }
}

function assertUint32(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new FrayFrameError(`${name} must be an unsigned 32-bit integer.`);
  }
}

function assertTimestamp(value: bigint): void {
  if (value < 0n || value > UINT64_MAX) throw new FrayFrameError('timestamp must be an unsigned 64-bit integer.');
}

function assertPayload(payload: Uint8Array): void {
  if (!(payload instanceof Uint8Array)) throw new FrayFrameError('payload must be a Uint8Array.');
  if (payload.byteLength > MAX_FRAY_PAYLOAD_BYTES) {
    throw new FrayFrameError(`payload exceeds the ${MAX_FRAY_PAYLOAD_BYTES}-byte frame boundary.`);
  }
}

function schemasFrom(options: DecodeFrayOptions): readonly number[] {
  const expected = options.expectedSchema ?? FRAY_SCHEMA_VERSION;
  const schemas = typeof expected === 'number' ? [expected] : expected;
  if (!schemas.length) throw new FrayFrameError('At least one expected schema must be supplied.');
  for (const schema of schemas) assertUint32(schema, 'expected schema');
  return schemas;
}

export function encodeFrayFrame(input: FrayFrameInput): Uint8Array {
  assertPayload(input.payload);
  const schema = input.schema ?? FRAY_SCHEMA_VERSION;
  const indexPosition = input.indexPosition ?? 0;
  const timestamp = input.timestamp ?? 0n;
  const blockCount = input.blockCount ?? 1;
  assertUint32(schema, 'schema');
  assertUint32(indexPosition, 'indexPosition');
  assertTimestamp(timestamp);
  assertUint32(blockCount, 'blockCount');

  const frame = new Uint8Array(FRAY_HEADER_BYTES + input.payload.byteLength);
  frame.set([0x46, 0x52, 0x41, 0x59], 0);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(4, schema, false);
  view.setUint32(8, indexPosition, false);
  view.setBigUint64(12, timestamp, false);
  view.setUint32(20, blockCount, false);
  view.setUint32(24, input.payload.byteLength, false);
  frame.set(input.payload, FRAY_HEADER_BYTES);
  return frame;
}

/** Strictly decodes one complete frame; trailing and truncated bytes are rejected. */
export function decodeFrayFrame(frame: Uint8Array, options: DecodeFrayOptions = {}): FrayFrame {
  if (!(frame instanceof Uint8Array)) throw new FrayFrameError('FRAY frame must be a Uint8Array.');
  if (frame.byteLength < FRAY_HEADER_BYTES) throw new FrayFrameError('FRAY frame is shorter than its fixed header.');
  if (frame[0] !== 0x46 || frame[1] !== 0x52 || frame[2] !== 0x41 || frame[3] !== 0x59) {
    throw new FrayFrameError('FRAY magic validation failed.');
  }
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const header: FrayHeader = {
    schema: view.getUint32(4, false),
    indexPosition: view.getUint32(8, false),
    timestamp: view.getBigUint64(12, false),
    blockCount: view.getUint32(20, false),
    payloadSize: view.getUint32(24, false),
  };
  if (!schemasFrom(options).includes(header.schema)) throw new FrayFrameError(`Unsupported FRAY schema ${header.schema}.`);
  if (header.payloadSize > MAX_FRAY_PAYLOAD_BYTES) throw new FrayFrameError('FRAY payload size exceeds the configured boundary.');
  const expectedLength = FRAY_HEADER_BYTES + header.payloadSize;
  if (frame.byteLength !== expectedLength) {
    throw new FrayFrameError(`FRAY length boundary failed: header declares ${expectedLength} bytes, received ${frame.byteLength}.`);
  }
  return { header, payload: frame.slice(FRAY_HEADER_BYTES) };
}

/** A VPC-style one's-complement byte sum, retained only as external receipt metadata. */
export function onesComplementChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let index = 0; index < bytes.length; index += 1) sum = (sum + bytes[index]!) >>> 0;
  return (~sum) >>> 0;
}

function hashBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index += 1) hash = Math.imul(hash ^ bytes[index]!, 0x01000193);
  return hash >>> 0;
}

function makeReceipt(frame: Uint8Array): IntegrityReceipt {
  const checksum = onesComplementChecksum(frame);
  const checksumBytes = new Uint8Array([checksum >>> 24, checksum >>> 16, checksum >>> 8, checksum]);
  const receiptHash = hashBytes(new Uint8Array([...frame, ...checksumBytes])).toString(16).padStart(8, '0');
  const prngSeed = Number.parseInt(receiptHash, 16) >>> 0;
  return { checksum, checksumHex: checksum.toString(16).padStart(8, '0'), receiptHash, prngSeed };
}

/** Small deterministic PRNG; it is always seeded from the frame receipt hash. */
function receiptPrng(seed: number): () => number {
  let state = seed || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function bitAt(bytes: Uint8Array, byteIndex: number, bitOffset: number): BitValue {
  return ((bytes[byteIndex]! >>> (7 - bitOffset)) & 1) as BitValue;
}

function setBit(bytes: Uint8Array, byteIndex: number, bitOffset: number, value: BitValue): void {
  const mask = 1 << (7 - bitOffset);
  bytes[byteIndex] = value ? bytes[byteIndex]! | mask : bytes[byteIndex]! & ~mask;
}

function parityOf(value: number): ParityState {
  let parity = 0;
  for (let candidate = value; candidate; candidate >>>= 1) parity ^= candidate & 1;
  return parity ? 'odd' : 'even';
}

function bitSuit(byteIndex: number, bitOffset: number, value: BitValue): BitSuit {
  const bitIndex = byteIndex * 8 + bitOffset;
  const parity = ((byteIndex + bitOffset + value) & 1) ? 'odd' : 'even';
  const frequency = 1 + ((bitIndex * 17 + value * 11) % 97);
  const tolerance = ((bitIndex * 13 + bitOffset + 1) % 101) / 100;
  const threshold = 0.5;
  const mass = 1 + value + (bitOffset / 8);
  return {
    bitIndex, byteIndex, bitOffset, value, suitLabel: `bit-suit-${bitOffset}`,
    armorState: parity === 'even' ? 'reinforced' : 'standard', parity,
    frequency, tolerance, threshold, mass, velocity: frequency * (1 - tolerance),
  };
}

export function modelPayloadRigidbodies(payload: Uint8Array): DataRigidbody[] {
  assertPayload(payload);
  return Array.from(payload, (value, byteIndex) => {
    const bits = Array.from({ length: 8 }, (_, bitOffset) => bitSuit(byteIndex, bitOffset, bitAt(payload, byteIndex, bitOffset)));
    const parity = parityOf(value);
    const frequency = bits.reduce((total, bit) => total + bit.frequency, 0) / bits.length;
    const tolerance = bits.reduce((total, bit) => total + bit.tolerance, 0) / bits.length;
    const mass = bits.reduce((total, bit) => total + bit.mass, 0);
    return {
      byteIndex, value, suitLabel: `data-rigidbody-${byteIndex}`,
      armorState: parity === 'even' ? 'reinforced' : 'standard', parity, bits,
      frequency, tolerance, threshold: 0.5, mass, velocity: frequency * (1 - tolerance),
    };
  });
}

export function runIntegrityTrial(options: IntegrityTrialOptions): IntegrityTrial {
  assertPayload(options.payload);
  const trackCount = options.trackCount ?? 5;
  const noiseRatio = options.noiseRatio ?? 0;
  if (!Number.isInteger(trackCount) || trackCount < 1 || trackCount > MAX_INTEGRITY_TRACKS || trackCount % 2 === 0) {
    throw new FrayFrameError(`trackCount must be an odd integer from 1 through ${MAX_INTEGRITY_TRACKS}.`);
  }
  if (!Number.isFinite(noiseRatio) || noiseRatio < 0 || noiseRatio > 1) {
    throw new FrayFrameError('noiseRatio must be a finite number in the inclusive interval [0, 1].');
  }

  const encodedFrame = encodeFrayFrame(options);
  const frame = decodeFrayFrame(encodedFrame, { expectedSchema: options.schema ?? FRAY_SCHEMA_VERSION });
  const receipt = makeReceipt(encodedFrame);
  const totalBits = frame.payload.byteLength * 8;
  const tracks: Uint8Array[] = [];
  const trackMetrics: TrackMetrics[] = [];
  let noisyBitFlipsTotal = 0;
  let noisyChangedBytesTotal = 0;

  for (let track = 0; track < trackCount; track += 1) {
    const observed = frame.payload.slice();
    const random = receiptPrng((receipt.prngSeed ^ Math.imul(track + 1, 0x9e3779b9)) >>> 0);
    let flippedBits = 0;
    let changedBytes = 0;
    for (let byteIndex = 0; byteIndex < observed.length; byteIndex += 1) {
      let byteChanged = false;
      for (let bitOffset = 0; bitOffset < 8; bitOffset += 1) {
        if (random() < noiseRatio) {
          setBit(observed, byteIndex, bitOffset, bitAt(observed, byteIndex, bitOffset) ? 0 : 1);
          flippedBits += 1;
          byteChanged = true;
        }
      }
      if (byteChanged) changedBytes += 1;
    }
    tracks.push(observed);
    noisyBitFlipsTotal += flippedBits;
    noisyChangedBytesTotal += changedBytes;
    trackMetrics.push({
      track, flippedBits, changedBytes, matchingBits: totalBits - flippedBits,
      observedBitErrorRate: totalBits ? flippedBits / totalBits : 0,
      observedByteErrorRate: observed.length ? changedBytes / observed.length : 0,
    });
  }

  const recoveredPayload = new Uint8Array(frame.payload.length);
  const majorityThreshold = Math.floor(trackCount / 2) + 1;
  let recoveredMismatchedBits = 0;
  let recoveredMismatchedBytes = 0;
  for (let byteIndex = 0; byteIndex < recoveredPayload.length; byteIndex += 1) {
    let byteMismatch = false;
    for (let bitOffset = 0; bitOffset < 8; bitOffset += 1) {
      let ones = 0;
      for (const track of tracks) ones += bitAt(track, byteIndex, bitOffset);
      const value: BitValue = ones >= majorityThreshold ? 1 : 0;
      setBit(recoveredPayload, byteIndex, bitOffset, value);
      if (value !== bitAt(frame.payload, byteIndex, bitOffset)) { recoveredMismatchedBits += 1; byteMismatch = true; }
    }
    if (byteMismatch) recoveredMismatchedBytes += 1;
  }
  const totalBytes = frame.payload.length;
  const recovery: RecoveryMetrics = {
    totalBits, totalBytes, majorityThreshold, noisyBitFlipsTotal, noisyChangedBytesTotal,
    observedTrackBitErrorRate: totalBits && trackCount ? noisyBitFlipsTotal / (totalBits * trackCount) : 0,
    observedTrackByteErrorRate: totalBytes && trackCount ? noisyChangedBytesTotal / (totalBytes * trackCount) : 0,
    recoveredMatchingBits: totalBits - recoveredMismatchedBits, recoveredMismatchedBits,
    recoveredMatchingBytes: totalBytes - recoveredMismatchedBytes, recoveredMismatchedBytes,
    recoveredBitRate: totalBits ? (totalBits - recoveredMismatchedBits) / totalBits : 1,
    recoveredByteRate: totalBytes ? (totalBytes - recoveredMismatchedBytes) / totalBytes : 1,
    exactRecovery: recoveredMismatchedBits === 0,
  };
  return { frame, encodedFrame, receipt, tracks, recoveredPayload, trackMetrics, recovery, dataRigidbodies: modelPayloadRigidbodies(frame.payload) };
}