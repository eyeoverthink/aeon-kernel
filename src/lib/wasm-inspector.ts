/**
 * Rendered-only WebAssembly v1 container inspector.  This module deliberately
 * never hands input to a WebAssembly API and never evaluates its bytes.
 */
export const WASM_INSPECTOR_MAX_BYTES = 65_536;
export const WASM_INSPECTOR_MAX_MEMORY_PAGES = 16;
export const WASM_INSPECTOR_MODE = 'rendered-only' as const;
export const WASM_V1_VERSION = 1;

export type WasmFindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';
export type WasmInspectionStatus = 'structurally-accepted-rendered-only' | 'rejected';
export type WasmFinding = {
  severity: WasmFindingSeverity;
  code: string;
  message: string;
  offset: number;
};
export type WasmSection = {
  id: number;
  name: string;
  headerOffset: number;
  payloadOffset: number;
  payloadLength: number;
  hex: string;
};
export type WasmMemory = { minimumPages: number; maximumPages: number | null; offset: number };
export type WasmExport = { name: string; kind: 'function' | 'table' | 'memory' | 'global'; index: number; offset: number };
export type WasmInspection = {
  mode: typeof WASM_INSPECTOR_MODE;
  status: WasmInspectionStatus;
  executable: false;
  semanticEquivalenceClaimed: false;
  byteLength: number;
  version: number | null;
  sections: readonly WasmSection[];
  metadata: {
    typeCount: number; functionCount: number; codeBodyCount: number; importCount: number;
    memories: readonly WasmMemory[]; exports: readonly WasmExport[]; dataSegmentCount: number;
  };
  findings: readonly WasmFinding[];
  contradictions: readonly WasmFinding[];
  annotatedHex: string;
  semanticReceipt: string;
};

export class WasmInspectorError extends Error {
  constructor(message: string, public readonly offset: number) { super(message); this.name = 'WasmInspectorError'; }
}

type Cursor = { bytes: Uint8Array; pos: number; end: number };
const SECTION_NAMES = ['custom', 'type', 'import', 'function', 'table', 'memory', 'global', 'export', 'start', 'element', 'code', 'data', 'dataCount'];
const VALUE_TYPES = new Set([0x7f, 0x7e, 0x7d, 0x7c, 0x7b, 0x70, 0x6f]);

function fail(cursor: Cursor, message: string, offset = cursor.pos): never { throw new WasmInspectorError(message, offset); }
function byte(cursor: Cursor): number { if (cursor.pos >= cursor.end) fail(cursor, 'Truncated binary field.'); return cursor.bytes[cursor.pos++]!; }
function numberValue(value: bigint, cursor: Cursor, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail(cursor, `${label} exceeds safe inspection range.`);
  return Number(value);
}

/** Decode a canonical unsigned LEB128 integer without coercing it to number. */
export function decodeUnsignedLEB128(bytes: Uint8Array, offset = 0, maxBytes = 10): { value: bigint; nextOffset: number; length: number } {
  if (!Number.isInteger(offset) || offset < 0 || offset > bytes.length) throw new WasmInspectorError('Invalid LEB128 offset.', offset);
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 10) throw new WasmInspectorError('Invalid LEB128 byte limit.', offset);
  let value = 0n, shift = 0n;
  for (let count = 0; count < maxBytes; count += 1) {
    const at = offset + count;
    if (at >= bytes.length) throw new WasmInspectorError('Truncated unsigned LEB128.', at);
    const part = bytes[at]!;
    value |= BigInt(part & 0x7f) << shift;
    if ((part & 0x80) === 0) {
      const length = count + 1;
      if (length > 1 && value < (1n << BigInt(7 * (length - 1)))) throw new WasmInspectorError('Non-minimal unsigned LEB128.', offset);
      // At ten bytes, unsigned 64-bit has only one usable bit in byte ten.
      if (length === 10 && part > 1) throw new WasmInspectorError('Unsigned LEB128 overflows 64 bits.', at);
      return { value, nextOffset: at + 1, length };
    }
    shift += 7n;
  }
  throw new WasmInspectorError('Unsigned LEB128 exceeds byte limit.', offset);
}

export const decodeULEB128 = decodeUnsignedLEB128;
function u32(cursor: Cursor, label: string): number {
  const decoded = decodeUnsignedLEB128(cursor.bytes.subarray(0, cursor.end), cursor.pos, 5);
  cursor.pos = decoded.nextOffset;
  if (decoded.value > 0xffffffffn) fail(cursor, `${label} exceeds u32.`);
  return Number(decoded.value);
}
function vector(cursor: Cursor, label: string): number { return u32(cursor, `${label} count`); }
function exact(cursor: Cursor, label: string): void { if (cursor.pos !== cursor.end) fail(cursor, `Trailing bytes in ${label}.`); }
function text(cursor: Cursor, label: string): string {
  const length = u32(cursor, `${label} length`);
  if (length > cursor.end - cursor.pos) fail(cursor, `Truncated ${label}.`);
  const bytes = cursor.bytes.slice(cursor.pos, cursor.pos + length); cursor.pos += length;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(cursor, `Invalid UTF-8 ${label}.`, cursor.pos - length); }
}
function skipBytes(cursor: Cursor, length: number, label: string): void {
  if (length > cursor.end - cursor.pos) fail(cursor, `Truncated ${label}.`);
  cursor.pos += length;
}
function limits(cursor: Cursor, memories: WasmMemory[] | null): void {
  const at = cursor.pos, flags = u32(cursor, 'limits flags');
  if (flags !== 0 && flags !== 1) fail(cursor, 'Unsupported limits flags.', at);
  const minimum = u32(cursor, 'minimum');
  const maximum = flags === 1 ? u32(cursor, 'maximum') : null;
  if (maximum !== null && minimum > maximum) fail(cursor, 'Memory minimum exceeds maximum.', at);
  if (memories) {
    if (maximum === null) fail(cursor, 'Memory requires an explicit maximum.', at);
    if (maximum > WASM_INSPECTOR_MAX_MEMORY_PAGES) fail(cursor, `Memory maximum exceeds ${WASM_INSPECTOR_MAX_MEMORY_PAGES} pages.`, at);
    memories.push({ minimumPages: minimum, maximumPages: maximum, offset: at });
  }
}
function valueType(cursor: Cursor): void { const type = byte(cursor); if (!VALUE_TYPES.has(type)) fail(cursor, 'Invalid value type.', cursor.pos - 1); }
function constExpression(cursor: Cursor): void {
  const opcode = byte(cursor);
  if (opcode === 0x41 || opcode === 0x42) { // Signed values are only skipped; this inspector does not interpret them.
    let done = false; for (let i = 0; i < (opcode === 0x41 ? 5 : 10); i += 1) { if ((byte(cursor) & 0x80) === 0) { done = true; break; } } if (!done) fail(cursor, 'Constant expression LEB exceeds bound.');
  } else if (opcode === 0x43) skipBytes(cursor, 4, 'f32 constant');
  else if (opcode === 0x44) skipBytes(cursor, 8, 'f64 constant');
  else if (opcode === 0x23) u32(cursor, 'global index');
  else fail(cursor, 'Unsupported constant expression opcode.', cursor.pos - 1);
  if (byte(cursor) !== 0x0b) fail(cursor, 'Constant expression lacks terminating end opcode.', cursor.pos - 1);
}
function hex(bytes: Uint8Array, base: number): string {
  const rows: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) rows.push(`${(base + i).toString(16).padStart(4, '0')}: ${[...bytes.slice(i, i + 16)].map((v) => v.toString(16).padStart(2, '0')).join(' ')}`);
  return rows.join('\n');
}
function receipt(value: string): string {
  let hash = 0x811c9dc5; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return `wasm-v1-rendered-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Inspects bounded metadata only; accepting a structure never makes it executable. */
export function inspectWasmBinary(input: Uint8Array): WasmInspection {
  const findings: WasmFinding[] = [], sections: WasmSection[] = [], memories: WasmMemory[] = [], exports: WasmExport[] = [];
  let types = 0, functions = 0, codes = 0, imports = 0, dataSegments = 0, version: number | null = null;
  const add = (severity: WasmFindingSeverity, code: string, message: string, offset: number) => findings.push({ severity, code, message, offset });
  try {
    if (!(input instanceof Uint8Array)) throw new WasmInspectorError('Input must be a Uint8Array.', 0);
    if (input.length > WASM_INSPECTOR_MAX_BYTES) throw new WasmInspectorError(`Input exceeds ${WASM_INSPECTOR_MAX_BYTES} bytes.`, WASM_INSPECTOR_MAX_BYTES);
    if (input.length < 8 || input[0] !== 0 || input[1] !== 0x61 || input[2] !== 0x73 || input[3] !== 0x6d) throw new WasmInspectorError('Invalid WebAssembly magic.', 0);
    if (input[4] !== 1 || input[5] !== 0 || input[6] !== 0 || input[7] !== 0) throw new WasmInspectorError('Unsupported WebAssembly version; expected v1.', 4);
    version = 1; let pos = 8, lastId = 0; const seen = new Set<number>(); let functionTypes: number[] = [];
    while (pos < input.length) {
      const headerOffset = pos, id = input[pos++]!; if (id > 12) throw new WasmInspectorError('Unknown section id.', headerOffset);
      const size = decodeUnsignedLEB128(input, pos, 5); pos = size.nextOffset;
      if (size.value > BigInt(input.length - pos)) throw new WasmInspectorError('Section payload exceeds input bounds.', pos);
      const payloadLength = numberValue(size.value, { bytes: input, pos, end: input.length }, 'Section length'), payloadOffset = pos, end = pos + payloadLength;
      if (id !== 0) { if (seen.has(id) || id <= lastId) throw new WasmInspectorError('Non-custom sections must be unique and ordered.', headerOffset); seen.add(id); lastId = id; }
      const section: WasmSection = { id, name: SECTION_NAMES[id]!, headerOffset, payloadOffset, payloadLength, hex: hex(input.slice(payloadOffset, end), payloadOffset) }; sections.push(section);
      const c: Cursor = { bytes: input, pos: payloadOffset, end };
      if (id === 1) { types = vector(c, 'type'); for (let i = 0; i < types; i += 1) { if (byte(c) !== 0x60) fail(c, 'Type entry is not a function type.'); const a = vector(c, 'parameter'); for (let j = 0; j < a; j += 1) valueType(c); const r = vector(c, 'result'); if (r > 1) fail(c, 'WebAssembly v1 function result count exceeds one.'); for (let j = 0; j < r; j += 1) valueType(c); } exact(c, 'type section'); }
      else if (id === 2) { imports = vector(c, 'import'); for (let i = 0; i < imports; i += 1) { text(c, 'import module'); text(c, 'import name'); const kind = byte(c); if (kind === 0) u32(c, 'import type'); else if (kind === 1) { valueType(c); limits(c, null); } else if (kind === 2) limits(c, null); else if (kind === 3) { valueType(c); byte(c); } else fail(c, 'Unknown import kind.'); } exact(c, 'import section'); if (imports) throw new WasmInspectorError('Imports are rejected: imported capability present.', payloadOffset); }
      else if (id === 3) { functions = vector(c, 'function'); functionTypes = []; for (let i = 0; i < functions; i += 1) { const index = u32(c, 'function type index'); if (index >= types) fail(c, 'Function references a missing type.'); functionTypes.push(index); } exact(c, 'function section'); }
      else if (id === 5) { const count = vector(c, 'memory'); if (count > 1) fail(c, 'WebAssembly v1 permits at most one memory.'); for (let i = 0; i < count; i += 1) limits(c, memories); exact(c, 'memory section'); }
      else if (id === 7) { const count = vector(c, 'export'), names = new Set<string>(); for (let i = 0; i < count; i += 1) { const at = c.pos, name = text(c, 'export name'), rawKind = byte(c), index = u32(c, 'export index'); const kinds = ['function', 'table', 'memory', 'global'] as const; if (rawKind > 3) fail(c, 'Unknown export kind.', at); if (names.has(name)) fail(c, 'Duplicate export name.', at); names.add(name); exports.push({ name, kind: kinds[rawKind]!, index, offset: at }); } exact(c, 'export section'); }
      else if (id === 10) { codes = vector(c, 'code'); for (let i = 0; i < codes; i += 1) { const bodySize = u32(c, 'code body size'), bodyEnd = c.pos + bodySize; if (bodyEnd > c.end) fail(c, 'Code body exceeds code section.'); const body: Cursor = { bytes: input, pos: c.pos, end: bodyEnd }; const localGroups = vector(body, 'local declaration'); for (let j = 0; j < localGroups; j += 1) { u32(body, 'local count'); valueType(body); } if (body.pos >= body.end || input[body.end - 1] !== 0x0b) fail(body, 'Code body lacks final end opcode.', body.end - 1); c.pos = bodyEnd; } exact(c, 'code section'); }
      else if (id === 11) { dataSegments = vector(c, 'data'); for (let i = 0; i < dataSegments; i += 1) { const flags = u32(c, 'data flags'); if (flags === 0) constExpression(c); else if (flags === 1) { /* passive */ } else if (flags === 2) { u32(c, 'data memory index'); constExpression(c); } else fail(c, 'Unsupported data segment flags.'); skipBytes(c, u32(c, 'data byte length'), 'data bytes'); } exact(c, 'data section'); }
      pos = end;
    }
    if (functions !== codes) throw new WasmInspectorError('Function-section count does not equal code-body count.', input.length);
    for (const entry of exports) {
      if (entry.kind === 'function' && entry.index >= functions) throw new WasmInspectorError('Export references a missing function.', entry.offset);
      if (entry.kind === 'memory' && entry.index >= memories.length) throw new WasmInspectorError('Export references a missing memory.', entry.offset);
    }
    add('info', 'STRUCTURE_ACCEPTED', 'Structurally accepted and rendered only; not semantically equivalent or executable.', 0);
  } catch (error) {
    const issue = error instanceof WasmInspectorError ? error : new WasmInspectorError('Unexpected inspection failure.', 0);
    add('critical', 'STRUCTURE_REJECTED', issue.message, issue.offset);
  }
  const renderedInput = input instanceof Uint8Array ? input : new Uint8Array();
  const contradictions = findings.filter((f) => f.code === 'STRUCTURE_REJECTED');
  const status: WasmInspectionStatus = contradictions.length ? 'rejected' : 'structurally-accepted-rendered-only';
  const canonical = JSON.stringify({ mode: WASM_INSPECTOR_MODE, status, input: [...renderedInput], bytes: renderedInput.length, version, sections: sections.map((s) => [s.id, s.headerOffset, s.payloadLength]), types, functions, codes, imports, memories, exports: exports.map((e) => [e.name, e.kind, e.index]), dataSegments });
  return { mode: WASM_INSPECTOR_MODE, status, executable: false, semanticEquivalenceClaimed: false, byteLength: renderedInput.length, version, sections, metadata: { typeCount: types, functionCount: functions, codeBodyCount: codes, importCount: imports, memories, exports, dataSegmentCount: dataSegments }, findings, contradictions, annotatedHex: hex(renderedInput, 0), semanticReceipt: receipt(canonical) };
}

export const inspectWasm = inspectWasmBinary;
/** A literal, inert v1 module with one empty function; it is never compiled or executed here. */
export function buildWasmInspectorFixture(): Uint8Array {
  return new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02, 0x01, 0x00, 0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b]);
}