/**
 * A deliberately small arithmetic trial surface.  This module is independent
 * of the Aeon compiler: it evaluates only supplied numeric operands and never
 * parses or executes source text.
 */

export const MAX_L0_TRIAL_CASES = 64;
export const L0_MODEL = 'aeon-l0-arithmetic-bitwise-v1' as const;

export type L0Operation = 'POW' | 'AND' | 'OR' | 'XOR';
export type L0PowClassification =
  | 'signed-finite'
  | 'nan-domain'
  | 'positive-infinity-overflow'
  | 'negative-infinity-overflow'
  | 'zero-to-negative-boundary';
export type L0BitwiseClassification = 'signed-64-bit';
export type L0Classification = L0PowClassification | L0BitwiseClassification;

export type L0TrialCase = {
  /** Stable caller-selected label; it is included in the receipt. */
  id: string;
  operation: L0Operation;
  left: number;
  right: number;
};

export type L0Policy = {
  operation: L0Operation;
  inputRule: 'both operands are explicit finite JavaScript numbers';
  evaluationRule: string;
  outputRule: string;
};

export type L0Evidence = {
  left: number;
  right: number;
  leftInteger: boolean;
  rightInteger: boolean;
  leftNegativeZero: boolean;
  rightNegativeZero: boolean;
  rawNumberResult: number | null;
  signed64Left: string | null;
  signed64Right: string | null;
  signed64Result: string | null;
};

export type L0Contradiction = {
  code: string;
  detected: boolean;
  detail: string;
};

export type L0TrialReceipt = {
  model: typeof L0_MODEL;
  id: string;
  operation: L0Operation;
  classification: L0Classification;
  /** A decimal string is used for all results, avoiding unsafe 64-bit Number output. */
  result: string;
  policy: L0Policy;
  evidence: L0Evidence;
  contradictions: L0Contradiction[];
  accepted: boolean;
  receiptHash: string;
};

export type L0TrialSuite = {
  model: typeof L0_MODEL;
  caseLimit: number;
  cases: L0TrialReceipt[];
  accepted: boolean;
  contradictions: L0Contradiction[];
  receiptHash: string;
};

const MIN_SIGNED_64 = -(1n << 63n);
const MAX_SIGNED_64 = (1n << 63n) - 1n;

/**
 * Default edge cases are data, not an implicit test runner.  Consumers choose
 * when to call runL0TrialSuite.
 */
export const DEFAULT_L0_TRIAL_CASES: readonly L0TrialCase[] = Object.freeze([
  { id: 'negative-fractional-power', operation: 'POW', left: -8, right: 0.5 },
  { id: 'zero-to-zero', operation: 'POW', left: 0, right: 0 },
  { id: 'positive-overflow', operation: 'POW', left: 1e308, right: 2 },
  { id: 'zero-negative-boundary', operation: 'POW', left: 0, right: -1 },
  { id: 'five-xor-three', operation: 'XOR', left: 5, right: 3 },
]);

function requireFiniteOperand(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be an explicit finite JavaScript number.`);
  }
}

function requireCase(trial: L0TrialCase): void {
  if (!trial || typeof trial.id !== 'string' || trial.id.length === 0 || trial.id.length > 128) {
    throw new RangeError('trial id must be a non-empty string of at most 128 characters.');
  }
  if (!['POW', 'AND', 'OR', 'XOR'].includes(trial.operation)) throw new RangeError('Unsupported L0 operation.');
  requireFiniteOperand(trial.left, 'left');
  requireFiniteOperand(trial.right, 'right');
}

/** This is intentionally the Java long narrowing rule requested for L0. */
export function toJavaSigned64(value: number): bigint {
  requireFiniteOperand(value, 'value');
  return BigInt.asIntN(64, BigInt(Math.trunc(value)));
}

function decimalNumber(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  return Object.is(value, -0) ? '-0' : String(value);
}

function receiptHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function powPolicy(): L0Policy {
  return {
    operation: 'POW',
    inputRule: 'both operands are explicit finite JavaScript numbers',
    evaluationRule: 'Java Math.pow-compatible edge policy: 0^0 is 1; negative base with a non-integer exponent is NaN; zero to a negative exponent is classified as a division boundary.',
    outputRule: 'NaN and infinities are classified explicitly; finite values retain their sign, including negative zero.',
  };
}

function bitwisePolicy(operation: Exclude<L0Operation, 'POW'>): L0Policy {
  return {
    operation,
    inputRule: 'both operands are explicit finite JavaScript numbers',
    evaluationRule: 'Each operand is Math.trunc-ed, converted with BigInt, then narrowed using BigInt.asIntN(64, ...); the operation is performed on signed 64-bit values.',
    outputRule: 'The signed 64-bit result is exposed only as an exact base-10 string.',
  };
}

function makeHash(receipt: Omit<L0TrialReceipt, 'receiptHash'>): string {
  return receiptHash(JSON.stringify(receipt));
}

/** Evaluate one bounded L0 operation and return policy, evidence, and invariants. */
export function runL0Trial(trial: L0TrialCase): L0TrialReceipt {
  requireCase(trial);
  const { id, operation, left, right } = trial;
  const baseEvidence = {
    left, right, leftInteger: Number.isInteger(left), rightInteger: Number.isInteger(right),
    leftNegativeZero: Object.is(left, -0), rightNegativeZero: Object.is(right, -0),
  };

  if (operation !== 'POW') {
    const signed64Left = toJavaSigned64(left);
    const signed64Right = toJavaSigned64(right);
    const raw = operation === 'AND' ? signed64Left & signed64Right
      : operation === 'OR' ? signed64Left | signed64Right : signed64Left ^ signed64Right;
    const signed64Result = BigInt.asIntN(64, raw);
    const contradictions: L0Contradiction[] = [
      { code: 'L0_64_RANGE', detected: signed64Result < MIN_SIGNED_64 || signed64Result > MAX_SIGNED_64, detail: 'A signed 64-bit result must remain within the Java long interval.' },
      { code: 'L0_64_NARROWING', detected: raw !== signed64Result, detail: 'Bitwise output must already be narrowed to signed 64 bits.' },
    ];
    const receipt = {
      model: L0_MODEL, id, operation, classification: 'signed-64-bit' as const, result: signed64Result.toString(),
      policy: bitwisePolicy(operation),
      evidence: { ...baseEvidence, rawNumberResult: null, signed64Left: signed64Left.toString(), signed64Right: signed64Right.toString(), signed64Result: signed64Result.toString() },
      contradictions, accepted: !contradictions.some((item) => item.detected),
    };
    return { ...receipt, receiptHash: makeHash(receipt) };
  }

  const negativeFractionalDomain = left < 0 && !Number.isInteger(right);
  const zeroNegativeBoundary = left === 0 && right < 0;
  // Guards precede Math.pow so non-finite output is never silently coerced.
  const raw = negativeFractionalDomain ? Number.NaN : zeroNegativeBoundary ? Infinity : Math.pow(left, right);
  const classification: L0PowClassification = negativeFractionalDomain ? 'nan-domain'
    : zeroNegativeBoundary ? 'zero-to-negative-boundary'
      : raw === Infinity ? 'positive-infinity-overflow'
        : raw === -Infinity ? 'negative-infinity-overflow' : 'signed-finite';
  const contradictions: L0Contradiction[] = [
    { code: 'L0_POW_DOMAIN', detected: negativeFractionalDomain !== (classification === 'nan-domain'), detail: 'A negative base with a non-integer exponent must be NaN-domain.' },
    { code: 'L0_POW_ZERO_NEGATIVE', detected: zeroNegativeBoundary !== (classification === 'zero-to-negative-boundary'), detail: 'Zero raised to a negative exponent must be the positive-infinity division boundary.' },
    { code: 'L0_POW_NONFINITE_CLASSIFIED', detected: !Number.isFinite(raw) && !['nan-domain', 'zero-to-negative-boundary', 'positive-infinity-overflow', 'negative-infinity-overflow'].includes(classification), detail: 'Every non-finite power output must have an explicit classification.' },
    { code: 'L0_POW_ZERO_ZERO', detected: left === 0 && right === 0 && (classification !== 'signed-finite' || raw !== 1), detail: 'Java Math.pow(0, 0) is 1.' },
  ];
  const receipt = {
    model: L0_MODEL, id, operation, classification, result: decimalNumber(raw), policy: powPolicy(),
    evidence: { ...baseEvidence, rawNumberResult: raw, signed64Left: null, signed64Right: null, signed64Result: null },
    contradictions, accepted: !contradictions.some((item) => item.detected),
  };
  return { ...receipt, receiptHash: makeHash(receipt) };
}

/** Run at most MAX_L0_TRIAL_CASES explicitly supplied trials in input order. */
export function runL0TrialSuite(cases: readonly L0TrialCase[] = DEFAULT_L0_TRIAL_CASES): L0TrialSuite {
  if (!Array.isArray(cases) || cases.length > MAX_L0_TRIAL_CASES) {
    throw new RangeError(`L0 trial suites may contain at most ${MAX_L0_TRIAL_CASES} cases.`);
  }
  const receipts = cases.map(runL0Trial);
  const contradictions = receipts.flatMap((receipt) => receipt.contradictions.filter((item) => item.detected));
  const suite = { model: L0_MODEL, caseLimit: MAX_L0_TRIAL_CASES, cases: receipts, accepted: contradictions.length === 0, contradictions };
  return { ...suite, receiptHash: receiptHash(JSON.stringify(suite)) };
}

/** Short aliases for consumers that use engine-oriented naming. */
export const executeL0Trial = runL0Trial;
export const executeL0TrialSuite = runL0TrialSuite;