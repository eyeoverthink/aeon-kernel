import { compileAndRun, type Program, type Token, type VmTrace, CompilerError } from './compiler';

export type RegisterSnapshot = { register: string; value: string | number; meaning: string; agentId: string };
export type AgentReceipt = {
  id: string; name: string; role: string; status: 'success' | 'detected' | 'blocked' | 'unsupported';
  durationMs: number; summary: string;
};
export type Finding = {
  id: string; category: string; severity: 'low' | 'medium' | 'high' | 'critical';
  message: string; locator: string; evidence: string;
};
export type RenderedTarget = { id: string; label: string; language: string; code: string; status: 'rendered' };
export type KernelRun = {
  id: string; versionFrom: string; versionTo: string; createdAt: string; inputHash: string;
  status: 'verified-by-deterministic-rule' | 'blocked' | 'unsupported'; source: string;
  agents: AgentReceipt[]; registers: RegisterSnapshot[]; findings: Finding[];
  telemetry: { step: string; value: number; unit: 'tokens' | 'instructions' | 'steps' }[]; outputs: RenderedTarget[]; bytecode: string[];
  tokens: Token[]; ast: Program | null; canonicalInstructions: string[]; trace: VmTrace[];
  result: number | null; output: string[]; variables: Record<string, number>;
  promotion: 'promoted' | 'blocked'; promotionReason: string;
};

const LEDGER_KEY = 'aeon-kernel-ledger-v1';

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
function locate(source: string, index: number): string {
  const before = source.slice(0, Math.max(0, index));
  return `line:${before.split('\n').length} col:${index - before.lastIndexOf('\n')}`;
}
function redactCredentialValues(source: string): string {
  return source.replace(/(\b(?:api[_-]?key|[a-z0-9_]*(?:token|secret|password))\b\s*[:=]\s*)([^\n;,]+)/gi, '$1[REDACTED]');
}
function exactFinding(source: string, match: RegExpExecArray, category: string, severity: Finding['severity'], message: string, redact = false): Finding {
  return {
    id: `finding-${hashText(`${match.index}:${category}:${message}`)}`, category, severity, message,
    locator: locate(source, match.index), evidence: redact ? '[credential-shaped assignment redacted]' : match[0],
  };
}

/** These gates intentionally run before the lexer or VM sees user source. */
function analyzeSource(source: string): Finding[] {
  const findings: Finding[] = [];
  const checks: Array<[RegExp, string, Finding['severity'], string, boolean?]> = [
    [/\$\{\s*jndi\s*:[^}]*\}/i, 'JNDI lookup signature', 'critical', 'Lookup-shaped payload blocked before parsing.'],
    [/\b(?:api[_-]?key|[a-z0-9_]*(?:token|secret|password))\b\s*[:=]/i, 'Credential exposure', 'critical', 'Credential-shaped assignment blocked. The value is not retained.', true],
    [/\b(?:eval|Function|exec|spawn|fork|system)\s*\(/i, 'Unsupported execution capability', 'critical', 'Dynamic or process execution requires an isolated capability runner.'],
    [/\bpow\s*\(\s*-\d+(?:\.\d+)?\s*,\s*0?\.5\s*\)/i, 'Numeric domain edge', 'high', 'Negative base with a fractional exponent yields NaN in real arithmetic.'],
    [/\bfor\s*\([^)]*;[^)]*;[^)]*\)/, 'Bounded control flow', 'low', 'Loop syntax is outside the bounded Aeon grammar.'],
  ];
  for (const [pattern, category, severity, message, redact] of checks) {
    const match = pattern.exec(source);
    if (match) findings.push(exactFinding(source, match, category, severity, message, redact));
  }
  if (source.length > 12_000) findings.push({
    id: `finding-${hashText('input-boundary')}`, category: 'Input boundary', severity: 'critical',
    message: 'Input exceeds the 12,000-character analysis boundary.', locator: locate(source, 12_000), evidence: `length=${source.length}`,
  });
  return findings;
}

function renderTargets(sourceHash: string, bytes: number[], canonical: string[]): RenderedTarget[] {
  const hex = bytes.map((byte) => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`);
  const byteList = bytes.join(', ');
  const listing = canonical.join('\n');
  const renderedOnly = 'Rendered only — not compiled or executed; semantic equivalence is not claimed.';
  return [
    { id: 'binary', label: 'Binary', language: 'hex', status: 'rendered', code: `# ${renderedOnly}\n# receipt ${sourceHash}\n${hex.join(' ')}` },
    { id: 'assembly', label: 'Assembly view', language: 'asm', status: 'rendered', code: `; ${renderedOnly}\n; receipt ${sourceHash}\nbytecode: db ${hex.join(', ')}\n; VM listing\n${listing}` },
    { id: 'go', label: 'Go view', language: 'go', status: 'rendered', code: `// ${renderedOnly}\npackage aeon\nvar bytecode = []byte{${byteList}}` },
    { id: 'java', label: 'Java view', language: 'java', status: 'rendered', code: `// ${renderedOnly}\nfinal class AeonView { static final byte[] BYTECODE = {${bytes.map((byte) => `(byte)${byte}`).join(', ')}}; }` },
    { id: 'cpp', label: 'C++ view', language: 'cpp', status: 'rendered', code: `// ${renderedOnly}\nconst unsigned char bytecode[] = {${byteList}};` },
    { id: 'python', label: 'Python view', language: 'python', status: 'rendered', code: `# ${renderedOnly}\nbytecode = [${byteList}]` },
  ];
}

function compilerFinding(source: string, error: CompilerError): Finding {
  return {
    id: `finding-${hashText(`compiler:${error.message}:${error.offset}`)}`, category: 'Aeon compiler',
    severity: 'high', message: error.message, locator: locate(source, error.offset),
    evidence: `parser/vm boundary at ${error.line}:${error.column}`,
  };
}

export function executeKernelRun(source: string): KernelRun {
  const findings = analyzeSource(source);
  const gateUnsupported = findings.some((finding) => finding.category === 'Unsupported execution capability');
  const gateBlocked = findings.some((finding) => finding.severity === 'critical');
  let compiled: ReturnType<typeof compileAndRun> | null = null;
  if (!gateBlocked) {
    try { compiled = compileAndRun(source); }
    catch (error) {
      findings.push(compilerFinding(source, error instanceof CompilerError ? error : new CompilerError('Unknown compiler failure.')));
    }
  }
  const accepted = compiled !== null && !gateBlocked;
  const status: KernelRun['status'] = accepted ? 'verified-by-deterministic-rule' : gateUnsupported ? 'unsupported' : 'blocked';
  const promotion = accepted ? 'promoted' : 'blocked';
  const semanticReceipt = accepted
    ? JSON.stringify({ ast: compiled!.ast, instructions: compiled!.canonicalInstructions, bytecode: compiled!.bytecode, output: compiled!.output })
    : JSON.stringify({ source: redactCredentialValues(source), findings: findings.map(({ category, message }) => ({ category, message })) });
  const inputHash = hashText(semanticReceipt);
  const createdAt = new Date().toISOString();
  const bytecode = compiled?.bytecode ?? [];
  const canonicalInstructions = compiled?.canonicalInstructions ?? [];
  const trace = compiled?.trace ?? [];
  const output = compiled?.output ?? [];
  const result = compiled?.result ?? null;
  const agentStatus: AgentReceipt['status'] = accepted ? 'success' : gateUnsupported ? 'unsupported' : 'blocked';
  const agents: AgentReceipt[] = [
    { id: 'loop-scan', name: 'LOOP_SCAN', role: 'Syntax boundary filter', status: findings.some((f) => f.category === 'Bounded control flow') ? 'detected' : 'success', durationMs: 0, summary: 'Inspected source without executing it.' },
    { id: 'threat-gate', name: 'THREAT_GATE', role: 'Credential and capability guard', status: gateBlocked ? agentStatus : 'success', durationMs: 0, summary: gateBlocked ? 'Source was stopped before parsing.' : 'Pre-parse safety gates passed.' },
    { id: 'compiler', name: 'COMPILER', role: 'Aeon lexer, parser, and bytecode compiler', status: accepted ? 'success' : 'blocked', durationMs: 0, summary: accepted ? `Parsed and emitted ${compiled!.instructions.length} bounded instructions.` : gateBlocked ? 'Parsing was not reached because a safety gate blocked source.' : 'Parsing or bytecode compilation was rejected.' },
    { id: 'aeon-vm', name: 'AEON_VM', role: 'Bounded stack bytecode interpreter', status: accepted ? 'success' : 'blocked', durationMs: 0, summary: accepted ? `Halted after ${compiled!.steps} bounded VM steps.` : 'No VM target was produced.' },
    { id: 'mutation', name: 'MUTATION', role: 'Evidence-gated receipt promotion', status: promotion === 'promoted' ? 'success' : 'blocked', durationMs: 0, summary: promotion === 'promoted' ? 'Semantic receipt promoted.' : 'Promotion denied.' },
  ];
  const stackTop = trace.at(-1)?.stack.at(-1);
  return {
    id: `run-${inputHash}-${createdAt.replace(/\D/g, '').slice(0, 14)}`, versionFrom: 'v15.3',
    versionTo: promotion === 'promoted' ? 'v15.4' : 'v15.3', createdAt, inputHash, status,
    source: redactCredentialValues(source), agents,
    registers: [
      { register: 'VM_IP', value: accepted ? compiled!.instructions.length : 0, meaning: 'final instruction cursor', agentId: 'aeon-vm' },
      { register: 'VM_SP', value: trace.at(-1)?.stack.length ?? 0, meaning: 'final stack depth', agentId: 'aeon-vm' },
      { register: 'VM_TOP', value: stackTop ?? 'empty', meaning: 'final stack top', agentId: 'aeon-vm' },
      { register: 'VM_STEPS', value: compiled?.steps ?? 0, meaning: 'bounded interpreter steps', agentId: 'aeon-vm' },
      { register: 'VM_OUTPUTS', value: output.length, meaning: 'print values emitted', agentId: 'aeon-vm' },
      { register: 'VM_RECEIPT', value: inputHash, meaning: 'semantic receipt hash', agentId: 'mutation' },
    ],
    findings, telemetry: [
      { step: 'TOKENS', value: compiled?.tokens.length ?? 0, unit: 'tokens' },
      { step: 'INSTRUCTIONS', value: compiled?.instructions.length ?? 0, unit: 'instructions' },
      { step: 'VM_STEPS', value: compiled?.steps ?? 0, unit: 'steps' },
    ],
    outputs: accepted ? renderTargets(inputHash, bytecode, canonicalInstructions) : [],
    bytecode: bytecode.map((byte) => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`),
    tokens: compiled?.tokens ?? [], ast: compiled?.ast ?? null, canonicalInstructions, trace, result, output,
    variables: compiled?.variables ?? {},
    promotion,
    promotionReason: promotion === 'promoted'
      ? 'Pre-parse gates passed and the bounded Aeon VM reached HALT; targets are rendered only.'
      : `Promotion denied by ${findings.length} finding(s); no target output was produced.`,
  };
}

export function getLocalLedger(): KernelRun[] {
  try { const raw = localStorage.getItem(LEDGER_KEY); return raw ? (JSON.parse(raw) as KernelRun[]) : []; } catch { return []; }
}
export function appendToLedger(run: KernelRun): void {
  localStorage.setItem(LEDGER_KEY, JSON.stringify([run, ...getLocalLedger()].slice(0, 50)));
}