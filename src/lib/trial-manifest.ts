import { DEFAULT_L0_TRIAL_CASES, L0_MODEL, runL0TrialSuite, type L0TrialCase } from './l0-safety';
import { CIRCUIT_LAB_MODEL, buildFullAdderDemo, runCircuit, scoreTruthTable, type Bit, type TruthTableRow } from './circuit-lab';
import { WASM_INSPECTOR_MODE, buildWasmInspectorFixture, inspectWasmBinary } from './wasm-inspector';
import { DEFAULT_VECTOR_DIMENSIONS, DEFAULT_VECTOR_TRIAL_SEEDS, runDefaultVectorTrial } from './vector-lab';
import { FRAY_SCHEMA_VERSION, runIntegrityTrial } from './integrity';

/** FNV-1a is deterministic only; it is not cryptographic authentication. */
export const TRIAL_MANIFEST_CHECKSUM_ALGORITHM = 'fnv1a-32-non-cryptographic-checksum' as const;
export const TRIAL_MANIFEST_SCHEMA_VERSION = 1 as const;
export const TRIAL_MANIFEST_LIMITS = Object.freeze({
  maxEntries: 8, maxDepth: 20, maxJsonBytes: 131_072, maxEntryBytes: 48_000,
  maxStringLength: 8_192, maxWasmBytes: 65_536, maxIntegrityBytes: 1_024,
} as const);

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type TrialEngineId = 'l0-safety' | 'circuit-lab' | 'wasm-inspector' | 'vector-lab' | 'integrity';
export type TrialStatus = 'expected' | 'reproduced' | 'contradicted';
export type TrialEntry = Readonly<{
  trialId: string; engineId: TrialEngineId; engineVersion: string;
  input: JsonValue; config: JsonValue; policy: JsonValue; expectedResult: JsonValue;
  sourceReceipt: string | null; inputChecksum: string; resultChecksum: string; status: 'expected';
}>;
export type TrialManifest = Readonly<{
  schemaVersion: typeof TRIAL_MANIFEST_SCHEMA_VERSION; manifestId: string; model: string;
  policy: JsonValue; entries: readonly TrialEntry[]; checksumAlgorithm: typeof TRIAL_MANIFEST_CHECKSUM_ALGORITHM;
  checksum: string;
}>;
export type ReplayEntry = Readonly<{
  trialId: string; engineId: TrialEngineId; status: Exclude<TrialStatus, 'expected'>;
  mismatchFields: readonly string[]; actualResult: JsonValue; actualSourceReceipt: string | null;
  inputChecksum: string; resultChecksum: string;
}>;
export type ReplayManifest = Readonly<{
  manifestId: string; checksum: string; entries: readonly ReplayEntry[];
  reproduced: boolean; receipt: string;
}>;

function fail(message: string): never { throw new RangeError(`Trial manifest: ${message}`); }
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function checkedJson(value: unknown, depth = 0, seen = new Set<object>()): JsonValue {
  if (depth > TRIAL_MANIFEST_LIMITS.maxDepth) fail('value exceeds maximum nesting depth.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > TRIAL_MANIFEST_LIMITS.maxStringLength) fail('string exceeds maximum length.');
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('non-finite numbers must be normalized to explicit strings.');
    return Object.is(value, -0) ? '-0' : value;
  }
  if (typeof value === 'bigint') fail('bigint must be normalized to a decimal string.');
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') fail('value is not JSON-safe.');
  if (!value || typeof value !== 'object' || seen.has(value)) fail('value must be acyclic plain JSON data.');
  seen.add(value);
  let result: JsonValue;
  if (Array.isArray(value)) result = value.map((item) => checkedJson(item, depth + 1, seen));
  else {
    if (!isPlainObject(value)) fail('value must be a plain object.');
    const record: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value)) {
      if (key.length > TRIAL_MANIFEST_LIMITS.maxStringLength) fail('object key exceeds maximum length.');
      record[key] = checkedJson(value[key], depth + 1, seen);
    }
    result = record;
  }
  seen.delete(value);
  return result;
}

/** Stable, bounded JSON serialization with sorted object keys. */
export function canonicalJson(value: unknown): string {
  const normalized = checkedJson(value);
  const render = (item: JsonValue): string => Array.isArray(item) ? `[${item.map(render).join(',')}]`
    : isPlainObject(item) ? `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${render(item[key]!)}`).join(',')}}`
      : JSON.stringify(item);
  const text = render(normalized);
  if (text.length > TRIAL_MANIFEST_LIMITS.maxJsonBytes) fail('canonical JSON exceeds maximum size.');
  return text;
}

export function fnv1aChecksum(value: unknown): string {
  const text = canonicalJson(value); let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return `${TRIAL_MANIFEST_CHECKSUM_ALGORITHM}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Converts engine receipts to manifest JSON, spelling bigint and non-finite values explicitly. */
export function normalizeTrialValue(value: unknown, depth = 0, seen = new Set<object>()): JsonValue {
  if (typeof value === 'bigint') return value.toString(10);
  if (typeof value === 'number' && !Number.isFinite(value)) return Number.isNaN(value) ? 'NaN' : value < 0 ? '-Infinity' : 'Infinity';
  if (depth > TRIAL_MANIFEST_LIMITS.maxDepth) fail('engine result exceeds maximum nesting depth.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') return checkedJson(value);
  if (!value || typeof value !== 'object' || seen.has(value)) fail('engine result is cyclic or unsupported.');
  seen.add(value);
  const result: JsonValue = value instanceof Uint8Array ? Array.from(value, (byte) => byte)
    : Array.isArray(value) ? value.map((item) => normalizeTrialValue(item, depth + 1, seen))
      : isPlainObject(value) ? Object.fromEntries(Object.keys(value).map((key) => [key, normalizeTrialValue(value[key], depth + 1, seen)])) as JsonValue
        : fail('engine result has an unsupported prototype.');
  seen.delete(value);
  return checkedJson(result);
}

function receiptFor(engine: TrialEngineId, result: JsonValue): string | null {
  const source = result as Record<string, JsonValue>;
  if (engine === 'l0-safety') return typeof source.receiptHash === 'string' ? source.receiptHash : null;
  if (engine === 'circuit-lab') return isPlainObject(source.run) && typeof source.run.receipt === 'string' ? source.run.receipt : null;
  if (engine === 'wasm-inspector') return typeof source.semanticReceipt === 'string' ? source.semanticReceipt : null;
  if (engine === 'integrity') return isPlainObject(source.receipt) && typeof source.receipt.receiptHash === 'string' ? source.receipt.receiptHash : null;
  return null;
}

function requireBytes(value: unknown, label: string, maximum: number): Uint8Array {
  if (!Array.isArray(value) || value.length > maximum) fail(`${label} must be a bounded integer byte array.`);
  return new Uint8Array(value.map((byte) => {
    if (!Number.isInteger(byte) || byte < 0 || byte > 255) fail(`${label} contains an invalid byte.`);
    return byte;
  }));
}
function record(value: JsonValue, label: string): Record<string, JsonValue> {
  if (!isPlainObject(value)) fail(`${label} must be an object.`); return value as Record<string, JsonValue>;
}
function only(value: Record<string, JsonValue>, keys: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} contains unsupported field "${key}".`);
}

function execute(engineId: TrialEngineId, input: JsonValue, config: JsonValue): JsonValue {
  const source = record(input, 'input'); const options = record(config, 'config');
  switch (engineId) {
    case 'l0-safety': {
      only(source, ['cases'], 'L0 input'); only(options, [], 'L0 config');
      if (!Array.isArray(source.cases) || source.cases.length === 0 || source.cases.length > 64) fail('L0 cases are invalid.');
      return normalizeTrialValue(runL0TrialSuite(source.cases as unknown as readonly L0TrialCase[]));
    }
    case 'circuit-lab': {
      only(source, ['netlist', 'cycles', 'truthTable'], 'circuit input'); only(options, ['initialRegisters'], 'circuit config');
      if (!isPlainObject(source.netlist) || !Array.isArray(source.cycles) || !Array.isArray(source.truthTable)) fail('circuit input is invalid.');
      const run = runCircuit(source.netlist as unknown as ReturnType<typeof buildFullAdderDemo>, source.cycles as unknown as readonly Record<string, Bit>[], (options.initialRegisters ?? {}) as Record<string, Bit>);
      const truthTable = scoreTruthTable(source.netlist as unknown as ReturnType<typeof buildFullAdderDemo>, source.truthTable as unknown as readonly TruthTableRow[]);
      return normalizeTrialValue({ run, truthTable });
    }
    case 'wasm-inspector':
      only(source, ['bytes'], 'wasm input'); only(options, [], 'wasm config');
      return normalizeTrialValue(inspectWasmBinary(requireBytes(source.bytes, 'wasm bytes', TRIAL_MANIFEST_LIMITS.maxWasmBytes)));
    case 'vector-lab':
      only(source, ['dimensions', 'seeds'], 'vector input'); only(options, [], 'vector config');
      if (source.dimensions !== DEFAULT_VECTOR_DIMENSIONS || canonicalJson(source.seeds) !== canonicalJson(DEFAULT_VECTOR_TRIAL_SEEDS)) fail('vector configuration is not the fixed bounded trial.');
      return normalizeTrialValue(runDefaultVectorTrial());
    case 'integrity': {
      only(source, ['payload', 'schema', 'indexPosition', 'timestamp', 'blockCount'], 'integrity input'); only(options, ['trackCount', 'noiseRatio'], 'integrity config');
      const timestamp = source.timestamp;
      if (typeof timestamp !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(timestamp)) fail('integrity timestamp must be a decimal string.');
      for (const name of ['schema', 'indexPosition', 'blockCount']) if (!Number.isInteger(source[name]) || (source[name] as number) < 0) fail(`integrity ${name} is invalid.`);
      if (!Number.isInteger(options.trackCount) || !Number.isFinite(options.noiseRatio)) fail('integrity config is invalid.');
      return normalizeTrialValue(runIntegrityTrial({
        payload: requireBytes(source.payload, 'integrity payload', TRIAL_MANIFEST_LIMITS.maxIntegrityBytes),
        schema: source.schema as number, indexPosition: source.indexPosition as number, blockCount: source.blockCount as number,
        timestamp: BigInt(timestamp), trackCount: options.trackCount as number, noiseRatio: options.noiseRatio as number,
      }));
    }
  }
}

function entry(engineId: TrialEngineId, engineVersion: string, trialId: string, input: JsonValue, config: JsonValue, policy: JsonValue): TrialEntry {
  const expectedResult = execute(engineId, input, config);
  return Object.freeze({ trialId, engineId, engineVersion, input, config, policy, expectedResult,
    sourceReceipt: receiptFor(engineId, expectedResult), inputChecksum: fnv1aChecksum({ input, config }),
    resultChecksum: fnv1aChecksum(expectedResult), status: 'expected' });
}

const fullAdderRows: readonly TruthTableRow[] = Object.freeze(
  Array.from({ length: 8 }, (_, n) => {
    const a = ((n >>> 2) & 1) as Bit, b = ((n >>> 1) & 1) as Bit, cin = (n & 1) as Bit;
    return { inputs: { a, b, cin }, expected: { sum: (a ^ b ^ cin) as Bit, carry: ((a & b) | (a & cin) | (b & cin)) as Bit } };
  }),
);

/** Produces the fixed v1 five-engine bundle without a timestamp in its identity. */
export function buildDefaultTrialManifest(): TrialManifest {
  const entries = [
    entry('l0-safety', L0_MODEL, 'l0-default-suite', { cases: DEFAULT_L0_TRIAL_CASES as unknown as JsonValue }, {}, { maxCases: 64, finiteOperands: true }),
    entry('circuit-lab', CIRCUIT_LAB_MODEL, 'circuit-full-adder', { netlist: buildFullAdderDemo() as unknown as JsonValue, truthTable: fullAdderRows as unknown as JsonValue, cycles: [{ a: 1, b: 1, cin: 1 }] }, { initialRegisters: { sum_register: 0 } }, { truthRows: 8, fixedInput: [1, 1, 1], registerSemantics: 'prior-cycle' }),
    entry('wasm-inspector', WASM_INSPECTOR_MODE, 'wasm-inert-structure', { bytes: Array.from(buildWasmInspectorFixture()) }, {}, { renderedOnly: true, executable: false, semanticEquivalence: false }),
    entry('vector-lab', 'deterministic-binary-vector-lab-v1', 'vector-default-16384', { dimensions: DEFAULT_VECTOR_DIMENSIONS, seeds: { ...DEFAULT_VECTOR_TRIAL_SEEDS } }, {}, { maxDimensions: DEFAULT_VECTOR_DIMENSIONS, fixedTrial: true }),
    entry('integrity', 'fray-integrity-v1', 'integrity-fray-fixed', { payload: [70, 82, 65, 89, 1, 2, 3, 4], schema: FRAY_SCHEMA_VERSION, indexPosition: 7, timestamp: '0', blockCount: 1 }, { trackCount: 5, noiseRatio: 0 }, { payloadBytes: 8, exactRecoveryRequired: true, recoveryRateRequired: 1 }),
  ] as const;
  const semantic = { schemaVersion: TRIAL_MANIFEST_SCHEMA_VERSION, manifestId: 'aeon-default-trial-manifest-v1', model: 'aeon-bounded-trial-manifest-v1', policy: { deterministic: true, executableManifestContent: false }, entries, checksumAlgorithm: TRIAL_MANIFEST_CHECKSUM_ALGORITHM };
  return Object.freeze({ ...semantic, checksum: fnv1aChecksum(semantic) });
}

function assertKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${label} contains unsupported field "${key}".`);
}

/** Strictly validates schema, bounded plain data, checksums, engine allowlist, and replayable inputs. */
export function validateTrialManifest(value: unknown): asserts value is TrialManifest {
  if (!isPlainObject(value)) fail('manifest must be a plain object.');
  assertKeys(value, ['schemaVersion', 'manifestId', 'model', 'policy', 'entries', 'checksumAlgorithm', 'checksum'], 'manifest');
  if (value.schemaVersion !== 1 || value.checksumAlgorithm !== TRIAL_MANIFEST_CHECKSUM_ALGORITHM || typeof value.manifestId !== 'string' || typeof value.model !== 'string' || !Array.isArray(value.entries) || value.entries.length !== 5 || typeof value.checksum !== 'string') fail('manifest schema is invalid.');
  const ids = new Set<string>();
  for (const raw of value.entries) {
    if (!isPlainObject(raw)) fail('entry must be an object.');
    assertKeys(raw, ['trialId', 'engineId', 'engineVersion', 'input', 'config', 'policy', 'expectedResult', 'sourceReceipt', 'inputChecksum', 'resultChecksum', 'status'], 'entry');
    const item = raw as unknown as TrialEntry;
    if (!['l0-safety', 'circuit-lab', 'wasm-inspector', 'vector-lab', 'integrity'].includes(item.engineId) || typeof item.trialId !== 'string' || ids.has(item.trialId) || item.status !== 'expected') fail('entry ID, status, or engine is invalid.');
    ids.add(item.trialId); checkedJson(item.input); checkedJson(item.config); checkedJson(item.policy); checkedJson(item.expectedResult);
    if (canonicalJson(item).length > TRIAL_MANIFEST_LIMITS.maxEntryBytes || item.inputChecksum !== fnv1aChecksum({ input: item.input, config: item.config }) || item.resultChecksum !== fnv1aChecksum(item.expectedResult)) fail(`entry ${item.trialId} checksum or size is invalid.`);
    const actual = execute(item.engineId, item.input, item.config);
    if (canonicalJson(actual) !== canonicalJson(item.expectedResult) || receiptFor(item.engineId, actual) !== item.sourceReceipt) fail(`entry ${item.trialId} expected result or receipt is invalid.`);
  }
  const { checksum, ...semantic } = value as TrialManifest;
  if (checksum !== fnv1aChecksum(semantic)) fail('manifest checksum is invalid.');
}

export function replayTrialEntry(entryValue: TrialEntry): ReplayEntry {
  const entry = entryValue; const actualResult = execute(entry.engineId, entry.input, entry.config);
  const actualSourceReceipt = receiptFor(entry.engineId, actualResult);
  const mismatchFields = [
    ...(entry.inputChecksum === fnv1aChecksum({ input: entry.input, config: entry.config }) ? [] : ['inputChecksum']),
    ...(entry.resultChecksum === fnv1aChecksum(actualResult) ? [] : ['resultChecksum']),
    ...(canonicalJson(entry.expectedResult) === canonicalJson(actualResult) ? [] : ['expectedResult']),
    ...(entry.sourceReceipt === actualSourceReceipt ? [] : ['sourceReceipt']),
  ];
  return Object.freeze({ trialId: entry.trialId, engineId: entry.engineId, status: mismatchFields.length ? 'contradicted' : 'reproduced', mismatchFields, actualResult, actualSourceReceipt, inputChecksum: fnv1aChecksum({ input: entry.input, config: entry.config }), resultChecksum: fnv1aChecksum(actualResult) });
}

export function replayTrialManifest(value: TrialManifest): ReplayManifest {
  validateTrialManifest(value);
  const entries = value.entries.map(replayTrialEntry);
  const reproduced = entries.every((item) => item.status === 'reproduced');
  return Object.freeze({ manifestId: value.manifestId, checksum: value.checksum, entries, reproduced, receipt: fnv1aChecksum({ manifestId: value.manifestId, checksum: value.checksum, entries }) });
}

export function serializeTrialManifest(manifest: TrialManifest): string { validateTrialManifest(manifest); return canonicalJson(manifest); }
export const exportTrialManifestJson = serializeTrialManifest;
export function parseTrialManifestJson(text: string): TrialManifest {
  if (typeof text !== 'string' || text.length > TRIAL_MANIFEST_LIMITS.maxJsonBytes) fail('manifest JSON text is invalid or oversized.');
  let parsed: unknown; try { parsed = JSON.parse(text); } catch { fail('manifest JSON is invalid.'); }
  validateTrialManifest(parsed); return parsed;
}