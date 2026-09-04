/**
 * Circuit Lab is a deterministic Boolean-netlist interpreter.  It models
 * logical values only: it makes no assertion about hardware timing, voltage,
 * propagation delay, or physical implementation.
 */

export const CIRCUIT_LAB_MODEL = 'circuit-lab-v1';
export const MAX_CIRCUIT_GATES = 256;
export const MAX_CIRCUIT_INPUTS = 64;
export const MAX_CIRCUIT_CYCLES = 256;
export const SILC_MAGIC = 'SILC';
export const SILC_SCHEMA_VERSION = 1;
export const SILC_FRAME_BYTES = 512;
export const SILC_HEADER_BYTES = 32;
export const SILC_PAYLOAD_BYTES = SILC_FRAME_BYTES - SILC_HEADER_BYTES;

export type Bit = 0 | 1;
export type GateKind = 'AND' | 'OR' | 'XOR' | 'NAND' | 'NOT' | 'REG';
export type CircuitGate = { id: string; kind: GateKind; inputs: readonly string[] };
export type CircuitNetlist = {
  inputs: readonly string[];
  gates: readonly CircuitGate[];
  outputs: Readonly<Record<string, string>>;
};
export type CircuitCycle = {
  cycle: number;
  inputs: Record<string, Bit>;
  signals: Record<string, Bit>;
  outputs: Record<string, Bit>;
  registersBefore: Record<string, Bit>;
  registersAfter: Record<string, Bit>;
};
export type CircuitRun = {
  model: typeof CIRCUIT_LAB_MODEL;
  disclaimer: string;
  netlist: CircuitNetlist;
  cycles: CircuitCycle[];
  finalRegisters: Record<string, Bit>;
  receipt: string;
  contradictions: CircuitContradiction[];
};
export type CircuitContradiction = { code: string; detected: boolean; detail: string };
export type TruthTableRow = { inputs: Record<string, Bit>; expected: Record<string, Bit> };
export type TruthTableScore = { total: number; matched: number; score: number; failures: number[] };
export type CandidateEvidence = {
  seed: number;
  accepted: boolean;
  reason: string | null;
  before: TruthTableScore;
  after: TruthTableScore | null;
  beforeReceipt: string;
  afterReceipt: string | null;
  candidate: CircuitNetlist | null;
};
export type AnalyzeCircuitOptions = {
  cycles?: readonly Readonly<Record<string, Bit | boolean | number>>[];
  initialRegisters?: Readonly<Record<string, Bit | boolean | number>>;
  truthTable?: readonly TruthTableRow[];
  mutationSeed?: number;
  candidates?: number;
};
export type CircuitAnalysis = { run: CircuitRun; truthTable: TruthTableScore | null; candidates: CandidateEvidence[] };

export class CircuitLabError extends Error {
  constructor(message: string) { super(message); this.name = 'CircuitLabError'; }
}

const GATE_ARITY: Record<GateKind, number> = { AND: 2, OR: 2, XOR: 2, NAND: 2, NOT: 1, REG: 1 };
const LOGIC_DISCLAIMER = 'This is a deterministic software Boolean model, not a claim about hardware timing, physical voltage, or a physical circuit.';

function isGateKind(value: unknown): value is GateKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(GATE_ARITY, value);
}
function bit(value: Bit | boolean | number, label: string): Bit {
  if (value === 0 || value === false) return 0;
  if (value === 1 || value === true) return 1;
  throw new CircuitLabError(`${label} must be exactly 0 or 1.`);
}
function uint32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) throw new CircuitLabError(`${label} must be an unsigned 32-bit integer.`);
}
function uint16(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new CircuitLabError(`${label} must be an unsigned 16-bit integer.`);
}
function cloneNetlist(netlist: CircuitNetlist): CircuitNetlist {
  return { inputs: [...netlist.inputs], gates: netlist.gates.map((gate) => ({ id: gate.id, kind: gate.kind, inputs: [...gate.inputs] })), outputs: { ...netlist.outputs } };
}

/** Validates source names, arities, and rejects any cycle made solely of combinational gates. */
export function validateCircuitNetlist(netlist: CircuitNetlist): void {
  if (!netlist || typeof netlist !== 'object' || !Array.isArray(netlist.inputs) || !Array.isArray(netlist.gates) || !netlist.outputs) {
    throw new CircuitLabError('netlist must contain inputs, gates, and outputs.');
  }
  if (netlist.inputs.length > MAX_CIRCUIT_INPUTS || netlist.gates.length > MAX_CIRCUIT_GATES) throw new CircuitLabError('netlist exceeds configured input or gate limits.');
  const names = new Set<string>();
  for (const input of netlist.inputs) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input) || names.has(input)) throw new CircuitLabError(`invalid or duplicate input "${input}".`);
    names.add(input);
  }
  const gates = new Map<string, CircuitGate>();
  for (const gate of netlist.gates) {
    const kind: unknown = gate?.kind;
    if (!gate || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(gate.id) || names.has(gate.id) || !isGateKind(kind)) {
      throw new CircuitLabError(`invalid or duplicate gate "${gate?.id}".`);
    }
    if (!Array.isArray(gate.inputs) || gate.inputs.length !== GATE_ARITY[kind]) throw new CircuitLabError(`${gate.id} has invalid ${gate.kind} arity.`);
    names.add(gate.id); gates.set(gate.id, gate);
  }
  for (const gate of netlist.gates) for (const source of gate.inputs) if (!names.has(source)) throw new CircuitLabError(`${gate.id} references unknown source "${source}".`);
  for (const [output, source] of Object.entries(netlist.outputs)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(output) || !names.has(source)) throw new CircuitLabError(`output "${output}" references an invalid source.`);
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new CircuitLabError(`combinational cycle detected at gate "${id}".`);
    const gate = gates.get(id);
    if (!gate || gate.kind === 'REG') { visited.add(id); return; }
    visiting.add(id);
    for (const source of gate.inputs) { const dependency = gates.get(source); if (dependency && dependency.kind !== 'REG') visit(source); }
    visiting.delete(id); visited.add(id);
  };
  for (const gate of netlist.gates) if (gate.kind !== 'REG') visit(gate.id);
}

function orderedCombinational(netlist: CircuitNetlist): CircuitGate[] {
  const byId = new Map(netlist.gates.map((gate) => [gate.id, gate])); const seen = new Set<string>(); const result: CircuitGate[] = [];
  const add = (id: string): void => {
    const gate = byId.get(id);
    if (!gate || gate.kind === 'REG' || seen.has(id)) return;
    seen.add(id); for (const source of gate.inputs) add(source); result.push(gate);
  };
  for (const gate of netlist.gates) add(gate.id);
  return result;
}
function evaluate(kind: GateKind, input: readonly Bit[]): Bit {
  switch (kind) {
    case 'AND': return (input[0]! & input[1]!) as Bit;
    case 'OR': return (input[0]! | input[1]!) as Bit;
    case 'XOR': return (input[0]! ^ input[1]!) as Bit;
    case 'NAND': return (input[0]! & input[1]!) ? 0 : 1;
    case 'NOT': return input[0] ? 0 : 1;
    default: throw new CircuitLabError('REG gates are latched, not combinationally evaluated.');
  }
}
function normalInputs(netlist: CircuitNetlist, supplied: Readonly<Record<string, Bit | boolean | number>>): Record<string, Bit> {
  const result: Record<string, Bit> = {};
  for (const key of Object.keys(supplied)) if (!netlist.inputs.includes(key)) throw new CircuitLabError(`unknown input "${key}".`);
  for (const name of netlist.inputs) result[name] = bit(supplied[name] ?? 0, `input ${name}`);
  return result;
}

/** Runs bounded synchronous cycles. Combinational logic sees only cycle-start register values; all REG gates latch together afterward. */
export function runCircuit(netlist: CircuitNetlist, cycles: readonly Readonly<Record<string, Bit | boolean | number>>[] = [{}], initialRegisters: Readonly<Record<string, Bit | boolean | number>> = {}): CircuitRun {
  validateCircuitNetlist(netlist);
  if (!Array.isArray(cycles) || cycles.length > MAX_CIRCUIT_CYCLES) throw new CircuitLabError(`cycles must contain at most ${MAX_CIRCUIT_CYCLES} entries.`);
  const registers: Record<string, Bit> = {};
  const registerIds = netlist.gates.filter((gate) => gate.kind === 'REG').map((gate) => gate.id);
  for (const key of Object.keys(initialRegisters)) if (!registerIds.includes(key)) throw new CircuitLabError(`unknown register "${key}".`);
  for (const id of registerIds) registers[id] = bit(initialRegisters[id] ?? 0, `register ${id}`);
  const ordered = orderedCombinational(netlist); const trace: CircuitCycle[] = [];
  for (let index = 0; index < cycles.length; index += 1) {
    const inputValues = normalInputs(netlist, cycles[index]!); const before = { ...registers }; const signals: Record<string, Bit> = { ...inputValues, ...before };
    for (const gate of ordered) signals[gate.id] = evaluate(gate.kind, gate.inputs.map((source) => signals[source]!));
    const outputs = Object.fromEntries(Object.entries(netlist.outputs).map(([name, source]) => [name, signals[source]!])) as Record<string, Bit>;
    const next: Record<string, Bit> = {};
    for (const id of registerIds) { const gate = netlist.gates.find((item) => item.id === id)!; next[id] = signals[gate.inputs[0]!]!; }
    Object.assign(registers, next);
    trace.push({ cycle: index, inputs: inputValues, signals, outputs, registersBefore: before, registersAfter: { ...registers } });
  }
  const contradictions = circuitContradictions(netlist, trace, registers);
  const receipt = semanticReceipt({ netlist, trace: trace.map((row) => ({ inputs: row.inputs, outputs: row.outputs, registersAfter: row.registersAfter })), finalRegisters: registers });
  return { model: CIRCUIT_LAB_MODEL, disclaimer: LOGIC_DISCLAIMER, netlist: cloneNetlist(netlist), cycles: trace, finalRegisters: { ...registers }, receipt, contradictions };
}

function circuitContradictions(netlist: CircuitNetlist, cycles: readonly CircuitCycle[], registers: Record<string, Bit>): CircuitContradiction[] {
  const invalidBit = cycles.some((cycle) => [...Object.values(cycle.signals), ...Object.values(cycle.outputs), ...Object.values(cycle.registersAfter)].some((value) => value !== 0 && value !== 1));
  const registerMismatch = cycles.some((cycle) => netlist.gates.filter((g) => g.kind === 'REG').some((gate) => cycle.registersAfter[gate.id] !== cycle.signals[gate.inputs[0]!]));
  const finalMismatch = cycles.length ? Object.keys(registers).some((id) => registers[id] !== cycles[cycles.length - 1]!.registersAfter[id]) : false;
  return [
    { code: 'non-bit-signal', detected: invalidBit, detail: 'Every signal and output must be a Boolean bit.' },
    { code: 'register-latch-mismatch', detected: registerMismatch, detail: 'Each register must latch its cycle-start combinational input on the rising edge.' },
    { code: 'final-register-mismatch', detected: finalMismatch, detail: 'Reported final registers must equal the final trace state.' },
  ];
}

export function scoreTruthTable(netlist: CircuitNetlist, rows: readonly TruthTableRow[]): TruthTableScore {
  validateCircuitNetlist(netlist); if (!Array.isArray(rows)) throw new CircuitLabError('truthTable must be an array.');
  const failures: number[] = [];
  rows.forEach((row, index) => {
    const output = runCircuit(netlist, [row.inputs]).cycles[0]!.outputs;
    for (const name of Object.keys(row.expected)) {
      const expected: Bit = row.expected[name]!;
      if (!(name in netlist.outputs)) throw new CircuitLabError(`truth row references unknown output "${name}".`);
      if (output[name] !== bit(expected, `truthTable[${index}].expected.${name}`)) { failures.push(index); break; }
    }
  });
  return { total: rows.length, matched: rows.length - failures.length, score: rows.length ? (rows.length - failures.length) / rows.length : 1, failures };
}

function nextRandom(state: number): [number, number] {
  let x = state >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return [x >>> 0, x >>> 0];
}
/** Produces deterministic, independently validated mutations and evidence. */
export function mutateCircuitCandidates(netlist: CircuitNetlist, truthTable: readonly TruthTableRow[], seed: number, count = 4): CandidateEvidence[] {
  validateCircuitNetlist(netlist); uint32(seed, 'seed'); if (!Number.isInteger(count) || count < 0 || count > 64) throw new CircuitLabError('count must be an integer from 0 through 64.');
  const before = scoreTruthTable(netlist, truthTable); const beforeReceipt = semanticReceipt({ netlist, score: before });
  const mutable = netlist.gates.filter((gate) => gate.kind !== 'REG');
  if (!mutable.length && count) throw new CircuitLabError('netlist has no combinational gate eligible for mutation.');
  let state = seed; const results: CandidateEvidence[] = [];
  for (let index = 0; index < count; index += 1) {
    [state] = nextRandom(state); const source = mutable[state % mutable.length]!; const options = (Object.keys(GATE_ARITY) as GateKind[]).filter((kind) => kind !== 'REG' && GATE_ARITY[kind] === source.inputs.length && kind !== source.kind);
    [state] = nextRandom(state); const candidate = cloneNetlist(netlist); const changed = candidate.gates.find((gate) => gate.id === source.id)!;
    if (options.length) {
      changed.kind = options[state % options.length]!;
    } else {
      const sources = [...netlist.inputs, ...netlist.gates.map((gate) => gate.id)].filter((id) => id !== changed.id && id !== changed.inputs[0]);
      if (!sources.length) {
        results.push({ seed: state, accepted: false, reason: 'no distinct legal mutation exists for the selected gate', before, after: null, beforeReceipt, afterReceipt: null, candidate: null });
        continue;
      }
      changed.inputs = [sources[state % sources.length]!];
    }
    try {
      validateCircuitNetlist(candidate); const after = scoreTruthTable(candidate, truthTable);
      results.push({ seed: state, accepted: true, reason: null, before, after, beforeReceipt, afterReceipt: semanticReceipt({ netlist: candidate, score: after }), candidate });
    } catch (error) {
      results.push({ seed: state, accepted: false, reason: error instanceof Error ? error.message : 'candidate validation failed', before, after: null, beforeReceipt, afterReceipt: null, candidate: null });
    }
  }
  return results;
}

export function analyzeCircuit(netlist: CircuitNetlist, options: AnalyzeCircuitOptions = {}): CircuitAnalysis {
  const run = runCircuit(netlist, options.cycles ?? [{}], options.initialRegisters ?? {});
  const truthTable = options.truthTable ? scoreTruthTable(netlist, options.truthTable) : null;
  const candidates = options.mutationSeed === undefined ? [] : mutateCircuitCandidates(netlist, options.truthTable ?? [], options.mutationSeed, options.candidates ?? 4);
  return { run, truthTable, candidates };
}

export function fnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5; for (const value of bytes) hash = Math.imul(hash ^ value, 0x01000193); return hash >>> 0;
}
/** A canonical semantic FNV receipt; callers should pass plain JSON-compatible values only. */
export function semanticReceipt(value: unknown): string {
  const text = canonicalJson(value); const bytes = new TextEncoder().encode(text); return fnv1a32(bytes).toString(16).padStart(8, '0');
}
function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') { const item = value as Record<string, unknown>; return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`; }
  throw new CircuitLabError('semantic receipt accepts only JSON-compatible values.');
}

export type SilcFrameInput = { generation: number; gateCount: number; traceCount: number; netlistPayload: Uint8Array; tracePayload: Uint8Array; schema?: number };
export type SilcFrame = { schema: number; generation: number; gateCount: number; traceCount: number; netlistPayload: Uint8Array; tracePayload: Uint8Array; checksum: number };
function payload(value: Uint8Array, label: string): void { if (!(value instanceof Uint8Array)) throw new CircuitLabError(`${label} must be a Uint8Array.`); }
/** Encodes the exact 512-byte big-endian SILC frame. Checksum is FNV-1a with its four-byte field zeroed. */
export function encodeSilcFrame(input: SilcFrameInput): Uint8Array {
  payload(input.netlistPayload, 'netlistPayload'); payload(input.tracePayload, 'tracePayload');
  const schema = input.schema ?? SILC_SCHEMA_VERSION; uint16(schema, 'schema'); uint32(input.generation, 'generation'); uint16(input.gateCount, 'gateCount'); uint16(input.traceCount, 'traceCount');
  if (input.netlistPayload.length + input.tracePayload.length > SILC_PAYLOAD_BYTES) throw new CircuitLabError(`SILC payload exceeds ${SILC_PAYLOAD_BYTES} bytes.`);
  const frame = new Uint8Array(SILC_FRAME_BYTES); frame.set([0x53, 0x49, 0x4c, 0x43]); const view = new DataView(frame.buffer);
  view.setUint16(4, schema, false); view.setUint16(6, SILC_HEADER_BYTES, false); view.setUint32(8, input.generation, false); view.setUint16(12, input.gateCount, false); view.setUint16(14, input.traceCount, false);
  view.setUint16(16, input.netlistPayload.length, false); view.setUint16(18, input.tracePayload.length, false);
  frame.set(input.netlistPayload, SILC_HEADER_BYTES); frame.set(input.tracePayload, SILC_HEADER_BYTES + input.netlistPayload.length);
  view.setUint32(20, fnv1a32(frame), false); return frame;
}
/** Strictly decodes one SILC frame: magic, schema, reserved fields, lengths, padding, and checksum are all verified. */
export function decodeSilcFrame(frame: Uint8Array, expectedSchema: number | readonly number[] = SILC_SCHEMA_VERSION): SilcFrame {
  if (!(frame instanceof Uint8Array) || frame.length !== SILC_FRAME_BYTES) throw new CircuitLabError(`SILC frame must be exactly ${SILC_FRAME_BYTES} bytes.`);
  if (frame[0] !== 0x53 || frame[1] !== 0x49 || frame[2] !== 0x4c || frame[3] !== 0x43) throw new CircuitLabError('SILC magic validation failed.');
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength); const schema = view.getUint16(4, false);
  const schemas = typeof expectedSchema === 'number' ? [expectedSchema] : expectedSchema; if (!schemas.length || !schemas.includes(schema)) throw new CircuitLabError(`unsupported SILC schema ${schema}.`);
  if (view.getUint16(6, false) !== SILC_HEADER_BYTES) throw new CircuitLabError('SILC header length is invalid.');
  const netlistLength = view.getUint16(16, false); const traceLength = view.getUint16(18, false); if (netlistLength + traceLength > SILC_PAYLOAD_BYTES) throw new CircuitLabError('SILC payload lengths exceed frame bounds.');
  const checksum = view.getUint32(20, false); const copy = frame.slice(); new DataView(copy.buffer).setUint32(20, 0, false);
  if (fnv1a32(copy) !== checksum) throw new CircuitLabError('SILC checksum verification failed.');
  for (let index = 24; index < SILC_HEADER_BYTES; index += 1) if (frame[index] !== 0) throw new CircuitLabError('SILC reserved header bytes must be zero.');
  for (let index = SILC_HEADER_BYTES + netlistLength + traceLength; index < SILC_FRAME_BYTES; index += 1) if (frame[index] !== 0) throw new CircuitLabError('SILC unused payload bytes must be zero.');
  return { schema, generation: view.getUint32(8, false), gateCount: view.getUint16(12, false), traceCount: view.getUint16(14, false), netlistPayload: frame.slice(SILC_HEADER_BYTES, SILC_HEADER_BYTES + netlistLength), tracePayload: frame.slice(SILC_HEADER_BYTES + netlistLength, SILC_HEADER_BYTES + netlistLength + traceLength), checksum };
}

/** Full adder plus a rising-edge sum register, using XOR/AND/OR gates. */
export function buildFullAdderDemo(): CircuitNetlist {
  return {
    inputs: ['a', 'b', 'cin'],
    gates: [
      { id: 'xor_ab', kind: 'XOR', inputs: ['a', 'b'] }, { id: 'sum', kind: 'XOR', inputs: ['xor_ab', 'cin'] },
      { id: 'and_ab', kind: 'AND', inputs: ['a', 'b'] }, { id: 'and_cin', kind: 'AND', inputs: ['xor_ab', 'cin'] },
      { id: 'carry', kind: 'OR', inputs: ['and_ab', 'and_cin'] }, { id: 'sum_register', kind: 'REG', inputs: ['sum'] },
    ],
    outputs: { sum: 'sum', carry: 'carry', registeredSum: 'sum_register' },
  };
}