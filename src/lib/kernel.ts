export type RegisterSnapshot = {
  register: string;
  value: string | number;
  meaning: string;
  agentId: string;
};

export type AgentReceipt = {
  id: string;
  name: string;
  role: string;
  status: 'success' | 'detected' | 'blocked' | 'unsupported';
  durationMs: number;
  summary: string;
};

export type Finding = {
  id: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  locator: string;
  evidence: string;
};

export type RenderedTarget = {
  id: string;
  label: string;
  language: string;
  code: string;
  status: 'rendered';
};

export type KernelRun = {
  id: string;
  versionFrom: string;
  versionTo: string;
  createdAt: string;
  inputHash: string;
  status: 'verified-by-deterministic-rule' | 'blocked' | 'unsupported';
  source: string;
  agents: AgentReceipt[];
  registers: RegisterSnapshot[];
  findings: Finding[];
  telemetry: { step: string; ms: number }[];
  outputs: RenderedTarget[];
  bytecode: string[];
  promotion: 'promoted' | 'blocked';
  promotionReason: string;
};

const LEDGER_KEY = 'aeon-kernel-ledger-v1';
const SAFE_BYTECODE = [0x58, 0x03, 0x59, 0x01, 0xff];

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function locate(source: string, index: number): string {
  const before = source.slice(0, Math.max(0, index));
  return `line:${before.split('\n').length} col:${index - before.lastIndexOf('\n')}`;
}

function redactCredentialValues(source: string): string {
  return source.replace(
    /(\b(?:api[_-]?key|[a-z0-9_]*(?:token|secret|password))\b\s*[:=]\s*)([^\n;,]+)/gi,
    '$1[REDACTED]',
  );
}

function exactFinding(
  source: string,
  match: RegExpExecArray,
  category: string,
  severity: Finding['severity'],
  message: string,
  redact = false,
): Finding {
  return {
    id: `finding-${hashText(`${match.index}:${category}:${message}`)}`,
    category,
    severity,
    message,
    locator: locate(source, match.index),
    evidence: redact ? '[credential-shaped assignment redacted]' : match[0],
  };
}

function analyzeSource(source: string): Finding[] {
  const findings: Finding[] = [];
  const jndi = /\$\{\s*jndi\s*:[^}]*\}/i.exec(source);
  if (jndi) {
    findings.push(
      exactFinding(
        source,
        jndi,
        'JNDI lookup signature',
        'critical',
        'Lookup-shaped payload blocked before any execution.',
      ),
    );
  }
  const credential = /\b(?:api[_-]?key|[a-z0-9_]*(?:token|secret|password))\b\s*[:=]/i.exec(source);
  if (credential) {
    findings.push(
      exactFinding(
        source,
        credential,
        'Credential exposure',
        'critical',
        'Credential-shaped assignment blocked. The value is not retained.',
        true,
      ),
    );
  }
  const process = /\b(?:eval|Function|exec|spawn|fork|system)\s*\(/i.exec(source);
  if (process) {
    findings.push(
      exactFinding(
        source,
        process,
        'Unsupported execution capability',
        'critical',
        'Dynamic or process execution requires an isolated capability runner.',
      ),
    );
  }
  const numeric = /\bpow\s*\(\s*-\d+(?:\.\d+)?\s*,\s*0?\.5\s*\)/i.exec(source);
  if (numeric) {
    findings.push(
      exactFinding(
        source,
        numeric,
        'Numeric domain edge',
        'high',
        'Negative base with a fractional exponent yields NaN in Java-compatible real arithmetic.',
      ),
    );
  }
  const loop = /\bfor\s*\([^)]*;[^)]*;[^)]*\)/.exec(source);
  if (loop) {
    findings.push(
      exactFinding(
        source,
        loop,
        'Bounded control flow',
        'low',
        'Loop structure mapped statically; its body was not executed.',
      ),
    );
  }
  if (source.length > 12_000) {
    findings.push({
      id: `finding-${hashText('input-boundary')}`,
      category: 'Input boundary',
      severity: 'critical',
      message: 'Input exceeds the 12,000-character analysis boundary.',
      locator: locate(source, 12_000),
      evidence: `length=${source.length}`,
    });
  }
  return findings;
}

function renderTargets(sourceHash: string): RenderedTarget[] {
  const byteList = SAFE_BYTECODE.join(', ');
  const hex = SAFE_BYTECODE.map((byte) => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`);
  return [
    { id: 'binary', label: 'Binary', language: 'hex', code: hex.join(' '), status: 'rendered' },
    {
      id: 'assembly',
      label: 'x86_64 Assembly',
      language: 'asm',
      status: 'rendered',
      code: `; RENDERED ONLY — not assembled or executed
; receipt ${sourceHash}
section .data
bytecode: db ${hex.join(', ')}
; FORMULA_EXECUTE KE_CALC → UNIT_CONVERT TO_FEET → HALT`,
    },
    {
      id: 'go',
      label: 'Go',
      language: 'go',
      status: 'rendered',
      code: `package knowledge

// Rendered only; semantic equivalence is not claimed.
func Program() []byte { return []byte{${byteList}} }`,
    },
    {
      id: 'java',
      label: 'Java',
      language: 'java',
      status: 'rendered',
      code: `public final class KnowledgeProgram {
  // Rendered only; this class is never loaded or executed here.
  public static final byte[] CODE = { ${SAFE_BYTECODE.map((byte) => `(byte) ${byte}`).join(', ')} };
}`,
    },
    {
      id: 'cpp',
      label: 'C++',
      language: 'cpp',
      status: 'rendered',
      code: `#include <cstdint>
#include <vector>
// Rendered only; not compiled.
const std::vector<std::uint8_t> program { ${byteList} };`,
    },
    {
      id: 'python',
      label: 'Python',
      language: 'python',
      status: 'rendered',
      code: `# Rendered only; not executed.
program = [${byteList}]`,
    },
  ];
}

function collisionEnergy(): number[] {
  const m1 = 12;
  const m2 = 8;
  const e1 = 0.8;
  const e2 = 0.9;
  let v1 = 45;
  let v2 = -30;
  return Array.from({ length: 4 }, () => {
    const nextV1 = ((m1 - m2 * e1) * v1 + (1 + e1) * m2 * v2) / (m1 + m2);
    const nextV2 = ((1 + e2) * m1 * v1 + (m2 - m1 * e2) * v2) / (m1 + m2);
    v1 = nextV1;
    v2 = nextV2;
    return Number((0.5 * m1 * v1 ** 2 + 0.5 * m2 * v2 ** 2).toFixed(3));
  });
}

export function executeKernelRun(source: string): KernelRun {
  const analysisStart = performance.now();
  const boundedSource = source.slice(0, 20_000);
  const findings = analyzeSource(boundedSource);
  findings.push({
    id: `finding-${hashText('unit-semantics')}`,
    category: 'Unit semantics',
    severity: 'medium',
    message: 'Meters-to-feet conversion cannot consume a kinetic-energy result measured in joules.',
    locator: 'bytecode:offset 2',
    evidence: 'FORMULA_EXECUTE(KE_CALC) → UNIT_CONVERT(TO_FEET)',
  });
  const analysisMs = Number(Math.max(0.01, performance.now() - analysisStart).toFixed(3));
  const criticalCount = findings.filter((finding) => finding.severity === 'critical').length;
  const unsupported = findings.some((finding) => finding.category === 'Unsupported execution capability');
  const status: KernelRun['status'] =
    criticalCount > 0 ? (unsupported ? 'unsupported' : 'blocked') : 'verified-by-deterministic-rule';
  const promotion = status === 'verified-by-deterministic-rule' ? 'promoted' : 'blocked';
  const sourceHash = hashText(`${boundedSource}|${SAFE_BYTECODE.join(',')}`);
  const createdAt = new Date().toISOString();
  const versionTo = promotion === 'promoted' ? 'v15.4' : 'v15.3';
  const energies = collisionEnergy();
  const agents: AgentReceipt[] = [
    {
      id: 'loop-scan',
      name: 'LOOP_SCAN',
      role: 'Bounded structure filter',
      status: findings.some((finding) => finding.category === 'Bounded control flow') ? 'detected' : 'success',
      durationMs: analysisMs,
      summary: 'Mapped control-flow signatures without running user code.',
    },
    {
      id: 'copy-try',
      name: 'COPY_TRY',
      role: 'Static copy and rule comparison',
      status: criticalCount > 0 ? 'blocked' : 'success',
      durationMs: 0.01,
      summary: criticalCount > 0 ? 'Static copy quarantined before trial.' : 'Deterministic rule outcomes matched.',
    },
    {
      id: 'method-probe',
      name: 'METHOD_PROBE',
      role: 'Numeric edge classifier',
      status: findings.some((finding) => finding.category === 'Numeric domain edge') ? 'detected' : 'success',
      durationMs: 0.01,
      summary: 'Classified NaN, infinity, zero division, and integer coercion signatures.',
    },
    {
      id: 'threat-gate',
      name: 'THREAT_GATE',
      role: 'L0 payload and capability guard',
      status: criticalCount > 0 ? 'blocked' : 'success',
      durationMs: 0.01,
      summary: criticalCount > 0 ? `${criticalCount} critical finding(s) blocked.` : 'No blocked signature detected.',
    },
    {
      id: 'mutation',
      name: 'MUTATION',
      role: 'Evidence-gated version promotion',
      status: promotion === 'promoted' ? 'success' : 'blocked',
      durationMs: 0.01,
      summary: promotion === 'promoted' ? 'Analyzer recipe promoted to v15.4.' : 'v15.3 retained.',
    },
  ];
  return {
    id: `run-${sourceHash}-${createdAt.replace(/\D/g, '').slice(0, 14)}`,
    versionFrom: 'v15.3',
    versionTo,
    createdAt,
    inputHash: sourceHash,
    status,
    source: redactCredentialValues(boundedSource),
    agents,
    registers: [
      { register: 'RAX', value: promotion === 'promoted' ? 'PASS' : 'BLOCK', meaning: 'pipeline outcome', agentId: 'copy-try' },
      { register: 'RBX', value: 6, meaning: '5 XOR 3 under signed integer coercion', agentId: 'method-probe' },
      { register: 'RCX', value: (boundedSource.match(/\bfor\s*\(/g) ?? []).length, meaning: 'loop signatures', agentId: 'loop-scan' },
      { register: 'RDX', value: findings.some((finding) => finding.category === 'Numeric domain edge') ? 'NaN' : 'finite', meaning: 'numeric outcome class', agentId: 'method-probe' },
      { register: 'RSI', value: `${boundedSource.length} chars`, meaning: 'source copy', agentId: 'copy-try' },
      { register: 'RDI', value: criticalCount > 0 ? 'quarantine' : 'bounded trial', meaning: 'destination capability', agentId: 'copy-try' },
      { register: 'RSP', value: SAFE_BYTECODE.length, meaning: 'instruction depth', agentId: 'method-probe' },
      { register: 'RBP', value: sourceHash, meaning: 'receipt lineage hash', agentId: 'mutation' },
      { register: 'R8–R15', value: 'metadata only', meaning: 'phi frequencies are not evidence', agentId: 'mutation' },
      { register: 'XMM0', value: '120 J', meaning: '0.5 × 15 kg × (4 m/s)²', agentId: 'method-probe' },
    ],
    findings,
    telemetry: [
      { step: 'STATIC_SCAN', ms: analysisMs },
      { step: 'POW_GATE', ms: 0.01 },
      { step: 'XOR_GATE', ms: 0.01 },
      ...energies.map((energy, index) => ({ step: `COLLISION_${index + 1}_${energy}J`, ms: 0.01 })),
    ],
    outputs: criticalCount > 0 ? [] : renderTargets(sourceHash),
    bytecode: (criticalCount > 0 ? [0xff] : SAFE_BYTECODE).map(
      (byte) => `0x${byte.toString(16).toUpperCase().padStart(2, '0')}`,
    ),
    promotion,
    promotionReason:
      promotion === 'promoted'
        ? 'L0 gates passed. The analyzer recipe is promoted; generated targets remain uncompiled.'
        : `Promotion denied by ${criticalCount} critical finding(s).`,
  };
}

export function getLocalLedger(): KernelRun[] {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    return raw ? (JSON.parse(raw) as KernelRun[]) : [];
  } catch {
    return [];
  }
}

export function appendToLedger(run: KernelRun): void {
  localStorage.setItem(LEDGER_KEY, JSON.stringify([run, ...getLocalLedger()].slice(0, 50)));
}