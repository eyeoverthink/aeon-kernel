/**
 * A deterministic binary vector-symbolic utility. It is software-only: the
 * layout comparison describes storage sizes, not processor performance.
 */

export const BITS_PER_WORD = 64;
export const DEFAULT_VECTOR_DIMENSIONS = 16_384;
export const MAX_VECTOR_DIMENSIONS = 1_048_576;
export const VECTOR_LAYOUT_DIMENSIONS = [10_000, DEFAULT_VECTOR_DIMENSIONS] as const;

const UINT32_MAX = 0xffff_ffff;
const UINT64_MASK = 0xffff_ffff_ffff_ffffn;

export type VectorWordStorage = BigUint64Array | bigint[];

export type VectorLayoutMetadata = {
  dimensions: number;
  bitsPerWord: typeof BITS_PER_WORD;
  wordCount: number;
  bytes: number;
  tailBits: number;
  unusedTailBits: number;
};

export type SemanticReceipt = {
  algorithm: 'fnv1a-32-over-little-endian-words-v1';
  dimensions: number;
  wordCount: number;
  population: number;
  hash: string;
};

export type VectorContradiction = {
  code: string;
  detected: boolean;
  detail: string;
};

export type VectorLabTrial = {
  model: 'deterministic-binary-vector-lab-v1';
  dimensions: number;
  seeds: { a: number; b: number; c: number };
  a: SemanticReceipt;
  b: SemanticReceipt;
  c: SemanticReceipt;
  bound: SemanticReceipt;
  analogy: SemanticReceipt;
  permuted: SemanticReceipt;
  bindDistanceFromA: number;
  analogyEqualsExpected: boolean;
  permutationRoundTripEqualsA: boolean;
  contradictions: VectorContradiction[];
};

export class VectorLabError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorLabError';
  }
}

function assertDimensions(dimensions: number): void {
  if (!Number.isSafeInteger(dimensions) || dimensions <= 0 || dimensions > MAX_VECTOR_DIMENSIONS) {
    throw new VectorLabError(`dimensions must be a positive safe integer no greater than ${MAX_VECTOR_DIMENSIONS}.`);
  }
}

function assertSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > UINT32_MAX) {
    throw new VectorLabError('seed must be an unsigned 32-bit integer.');
  }
}

function wordCountFor(dimensions: number): number {
  return Math.ceil(dimensions / BITS_PER_WORD);
}

function tailMask(dimensions: number): bigint {
  const tailBits = dimensions % BITS_PER_WORD;
  return tailBits === 0 ? UINT64_MASK : (1n << BigInt(tailBits)) - 1n;
}

function createWords(length: number): VectorWordStorage {
  // typeof is intentional: it permits older browser engines to use bigint[]
  // while modern targets keep packed BigUint64Array storage.
  return typeof BigUint64Array === 'function' ? new BigUint64Array(length) : Array<bigint>(length).fill(0n);
}

function copyWords(source: VectorWordStorage): VectorWordStorage {
  return typeof BigUint64Array === 'function' && source instanceof BigUint64Array
    ? new BigUint64Array(source)
    : source.slice();
}

function getWord(words: VectorWordStorage, index: number): bigint {
  return words[index]!;
}

function setWord(words: VectorWordStorage, index: number, value: bigint): void {
  words[index] = value & UINT64_MASK;
}

function assertVector(vector: BinaryVector, label: string): void {
  if (!(vector instanceof BinaryVector)) throw new VectorLabError(`${label} must be a BinaryVector.`);
}

function assertSameDimensions(left: BinaryVector, right: BinaryVector): void {
  assertVector(left, 'left');
  assertVector(right, 'right');
  if (left.dimensions !== right.dimensions) throw new VectorLabError('vector dimensions must match.');
}

function normalizedOffset(offset: number, dimensions: number): number {
  if (!Number.isSafeInteger(offset)) throw new VectorLabError('offset must be a safe integer.');
  const result = offset % dimensions;
  return result < 0 ? result + dimensions : result;
}

/** Returns the number of set bits in the low 64 bits of a bigint. */
export function popcount64(value: bigint): number {
  if (typeof value !== 'bigint') throw new VectorLabError('popcount64 value must be a bigint.');
  let candidate = value & UINT64_MASK;
  let count = 0;
  while (candidate !== 0n) {
    candidate &= candidate - 1n;
    count += 1;
  }
  return count;
}

/**
 * A fixed-dimension vector. Bit index zero is the least-significant bit of
 * word zero. The constructor copies and masks supplied storage.
 */
export class BinaryVector {
  readonly dimensions: number;
  readonly words: VectorWordStorage;

  constructor(dimensions = DEFAULT_VECTOR_DIMENSIONS, words?: VectorWordStorage) {
    assertDimensions(dimensions);
    const count = wordCountFor(dimensions);
    if (words !== undefined) {
      if (!(typeof BigUint64Array === 'function' && words instanceof BigUint64Array) && !Array.isArray(words)) {
        throw new VectorLabError('words must be a BigUint64Array or bigint array.');
      }
      if (words.length !== count) throw new VectorLabError(`words must contain exactly ${count} entries.`);
      for (let index = 0; index < words.length; index += 1) {
        if (typeof words[index] !== 'bigint') throw new VectorLabError('every word must be a bigint.');
      }
    }
    this.dimensions = dimensions;
    this.words = words === undefined ? createWords(count) : copyWords(words);
    for (let index = 0; index < this.words.length; index += 1) {
      setWord(this.words, index, getWord(this.words, index));
    }
    this.maskUnusedTailBits();
  }

  get wordCount(): number {
    return this.words.length;
  }

  /** Returns a copy, retaining this vector's exact dimensions. */
  clone(): BinaryVector {
    return new BinaryVector(this.dimensions, this.words);
  }

  /** Reads one in-range bit. */
  bitAt(index: number): 0 | 1 {
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.dimensions) {
      throw new VectorLabError(`bit index must be in [0, ${this.dimensions}).`);
    }
    const word = getWord(this.words, Math.floor(index / BITS_PER_WORD));
    return Number((word >> BigInt(index % BITS_PER_WORD)) & 1n) as 0 | 1;
  }

  /** Returns a new vector with one in-range bit assigned. */
  withBit(index: number, value: 0 | 1): BinaryVector {
    if (value !== 0 && value !== 1) throw new VectorLabError('bit value must be 0 or 1.');
    if (!Number.isSafeInteger(index) || index < 0 || index >= this.dimensions) {
      throw new VectorLabError(`bit index must be in [0, ${this.dimensions}).`);
    }
    const result = this.clone();
    const wordIndex = Math.floor(index / BITS_PER_WORD);
    const mask = 1n << BigInt(index % BITS_PER_WORD);
    const word = getWord(result.words, wordIndex);
    setWord(result.words, wordIndex, value ? word | mask : word & ~mask);
    return result;
  }

  /** Clears padding bits in the final partial word. */
  maskUnusedTailBits(): this {
    setWord(this.words, this.words.length - 1, getWord(this.words, this.words.length - 1) & tailMask(this.dimensions));
    return this;
  }
}

/** Creates a zero-filled vector with strict dimensions. */
export function zeroVector(dimensions = DEFAULT_VECTOR_DIMENSIONS): BinaryVector {
  return new BinaryVector(dimensions);
}

/** Creates an independent copy. */
export function cloneVector(vector: BinaryVector): BinaryVector {
  assertVector(vector, 'vector');
  return vector.clone();
}

/**
 * Creates a reproducible random-looking vector from an explicit uint32
 * xorshift state. A zero seed is valid and deliberately produces zero words,
 * preserving the direct xorshift state transition definition.
 */
export function seededVector(seed: number, dimensions = DEFAULT_VECTOR_DIMENSIONS): BinaryVector {
  assertSeed(seed);
  assertDimensions(dimensions);
  let state = seed >>> 0;
  const nextUint32 = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
  const words = createWords(wordCountFor(dimensions));
  for (let index = 0; index < words.length; index += 1) {
    const low = BigInt(nextUint32());
    const high = BigInt(nextUint32());
    setWord(words, index, (high << 32n) | low);
  }
  return new BinaryVector(dimensions, words);
}

export const createSeededVector = seededVector;

/** XOR binding is commutative and self-inverse for matching dimensions. */
export function xorBind(left: BinaryVector, right: BinaryVector): BinaryVector {
  assertSameDimensions(left, right);
  const words = createWords(left.wordCount);
  for (let index = 0; index < words.length; index += 1) setWord(words, index, getWord(left.words, index) ^ getWord(right.words, index));
  return new BinaryVector(left.dimensions, words);
}

/**
 * Cyclically permutes bit positions. A positive offset moves source bit i to
 * (i + offset) modulo dimensions, including offsets that cross word boundaries.
 */
export function cyclicPermute(vector: BinaryVector, offset: number): BinaryVector {
  assertVector(vector, 'vector');
  const shift = normalizedOffset(offset, vector.dimensions);
  if (shift === 0) return vector.clone();
  const result = zeroVector(vector.dimensions);
  for (let source = 0; source < vector.dimensions; source += 1) {
    if (vector.bitAt(source)) {
      const target = (source + shift) % vector.dimensions;
      const wordIndex = Math.floor(target / BITS_PER_WORD);
      setWord(result.words, wordIndex, getWord(result.words, wordIndex) | (1n << BigInt(target % BITS_PER_WORD)));
    }
  }
  return result.maskUnusedTailBits();
}

export const permuteVector = cyclicPermute;

export function hammingDistance(left: BinaryVector, right: BinaryVector): number {
  assertSameDimensions(left, right);
  let distance = 0;
  for (let index = 0; index < left.wordCount; index += 1) distance += popcount64(getWord(left.words, index) ^ getWord(right.words, index));
  return distance;
}

export function similarity(left: BinaryVector, right: BinaryVector): number {
  assertSameDimensions(left, right);
  return 1 - hammingDistance(left, right) / left.dimensions;
}

/** Solves the XOR analogy A:B :: C:? as B XOR A XOR C. */
export function analogy(a: BinaryVector, b: BinaryVector, c: BinaryVector): BinaryVector {
  assertSameDimensions(a, b);
  assertSameDimensions(a, c);
  return xorBind(xorBind(b, a), c);
}

export function vectorsEqual(left: BinaryVector, right: BinaryVector): boolean {
  assertSameDimensions(left, right);
  for (let index = 0; index < left.wordCount; index += 1) {
    if (getWord(left.words, index) !== getWord(right.words, index)) return false;
  }
  return true;
}

export const equalVectors = vectorsEqual;

export function semanticReceipt(vector: BinaryVector): SemanticReceipt {
  assertVector(vector, 'vector');
  let hash = 0x811c9dc5;
  let population = 0;
  for (let index = 0; index < vector.wordCount; index += 1) {
    const word = getWord(vector.words, index);
    population += popcount64(word);
    for (let byte = 0; byte < 8; byte += 1) {
      hash = Math.imul(hash ^ Number((word >> BigInt(byte * 8)) & 0xffn), 0x01000193);
    }
  }
  return {
    algorithm: 'fnv1a-32-over-little-endian-words-v1',
    dimensions: vector.dimensions,
    wordCount: vector.wordCount,
    population,
    hash: (hash >>> 0).toString(16).padStart(8, '0'),
  };
}

/** Storage metadata only; it contains no timing or hardware-speed inference. */
export function vectorLayoutMetadata(dimensions: number): VectorLayoutMetadata {
  assertDimensions(dimensions);
  const tailBits = dimensions % BITS_PER_WORD;
  return {
    dimensions, bitsPerWord: BITS_PER_WORD, wordCount: wordCountFor(dimensions),
    bytes: wordCountFor(dimensions) * 8, tailBits, unusedTailBits: tailBits === 0 ? 0 : BITS_PER_WORD - tailBits,
  };
}

export function compareVectorLayouts(): readonly VectorLayoutMetadata[] {
  return VECTOR_LAYOUT_DIMENSIONS.map(vectorLayoutMetadata);
}

export const compareLayouts = compareVectorLayouts;

export function checkVectorContradictions(a: BinaryVector, b: BinaryVector, c: BinaryVector): VectorContradiction[] {
  assertSameDimensions(a, b);
  assertSameDimensions(a, c);
  const bound = xorBind(a, b);
  const solved = analogy(a, b, c);
  const tailIsMasked = (vector: BinaryVector): boolean =>
    (getWord(vector.words, vector.wordCount - 1) & ~tailMask(vector.dimensions)) === 0n;
  return [
    { code: 'tail-mask-violation', detected: ![a, b, c, bound, solved].every(tailIsMasked), detail: 'Unused bits in every final partial word must be zero.' },
    { code: 'self-distance-mismatch', detected: hammingDistance(a, a) !== 0, detail: 'A vector must have zero Hamming distance from itself.' },
    { code: 'similarity-range-violation', detected: similarity(a, b) < 0 || similarity(a, b) > 1, detail: 'Similarity must remain in the inclusive interval [0, 1].' },
    { code: 'bind-involution-mismatch', detected: !vectorsEqual(xorBind(bound, b), a), detail: 'Binding a bound vector with the same right operand must recover the left operand.' },
    { code: 'analogy-equation-mismatch', detected: !vectorsEqual(solved, xorBind(xorBind(b, a), c)), detail: 'The analogy result must equal B XOR A XOR C.' },
  ];
}

export const DEFAULT_VECTOR_TRIAL_SEEDS = Object.freeze({ a: 0x1357_9bdf, b: 0x2468_ace1, c: 0x0f1e_2d3c });

/** A fixed-seed, reproducible demonstration with a non-word permutation offset. */
export function runDefaultVectorTrial(): VectorLabTrial {
  const dimensions = DEFAULT_VECTOR_DIMENSIONS;
  const seeds = DEFAULT_VECTOR_TRIAL_SEEDS;
  const a = seededVector(seeds.a, dimensions);
  const b = seededVector(seeds.b, dimensions);
  const c = seededVector(seeds.c, dimensions);
  const bound = xorBind(a, b);
  const solved = analogy(a, b, c);
  const expected = xorBind(bound, c);
  const permuted = cyclicPermute(a, 73);
  return {
    model: 'deterministic-binary-vector-lab-v1', dimensions, seeds: { ...seeds },
    a: semanticReceipt(a), b: semanticReceipt(b), c: semanticReceipt(c),
    bound: semanticReceipt(bound), analogy: semanticReceipt(solved), permuted: semanticReceipt(permuted),
    bindDistanceFromA: hammingDistance(bound, a),
    analogyEqualsExpected: vectorsEqual(solved, expected),
    permutationRoundTripEqualsA: vectorsEqual(cyclicPermute(permuted, -73), a),
    contradictions: checkVectorContradictions(a, b, c),
  };
}

export const defaultVectorTrial = runDefaultVectorTrial;

/** Convenience namespace for consumers that prefer an instance-oriented API. */
export class VectorLab {
  readonly dimensions: number;

  constructor(dimensions = DEFAULT_VECTOR_DIMENSIONS) {
    assertDimensions(dimensions);
    this.dimensions = dimensions;
  }

  zero(): BinaryVector { return zeroVector(this.dimensions); }
  seeded(seed: number): BinaryVector { return seededVector(seed, this.dimensions); }
  bind(left: BinaryVector, right: BinaryVector): BinaryVector { return xorBind(left, right); }
  permute(vector: BinaryVector, offset: number): BinaryVector { return cyclicPermute(vector, offset); }
  analogy(a: BinaryVector, b: BinaryVector, c: BinaryVector): BinaryVector { return analogy(a, b, c); }
}