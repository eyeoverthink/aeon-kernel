/**
 * Inert, local CVE evidence classifier.
 *
 * This module deliberately treats all input as text. It neither fetches,
 * executes, decodes, nor constructs a payload from that text.
 */

export type AntibodySeverity = 'low' | 'medium' | 'high' | 'critical';
export type AntibodyScanStatus = 'safe' | 'quarantined' | 'unsupported';

export type CveEvidenceFixture = {
  id: string;
  name: string;
  cvss: number;
  technique: string;
  inertIndicatorText: string;
  sourceLabel: 'supplied fixture (not live network)';
};

export type DefensiveAntibody = {
  id: string;
  category: string;
  /** An escaped, declarative regular-expression signature; it is not code. */
  escapedRegexSignature: string;
  severity: AntibodySeverity;
  toleranceThreshold: number;
  quarantineResponse: string;
};

export type EvidenceLocator = {
  line: number;
  column: number;
  offset: number;
};

export type AntibodyScanResult = {
  status: AntibodyScanStatus;
  locator: EvidenceLocator | null;
  evidence: string | null;
  matchedAntibody: DefensiveAntibody | null;
  riskScore: number;
  quarantineStatus: 'not-required' | 'quarantined' | 'unsupported';
  receiptHash: string;
};

export type AntibodyPlaybackMetadata = {
  intervalMs: 3000;
  schedule: 'metadata-only';
  timerCreated: false;
  source: 'supplied fixtures only';
};

export const MAX_EVIDENCE_CHARS = 12_000;
export const MAX_EVIDENCE_RECORDS = 5;

export const ANTIBODY_PLAYBACK_METADATA: AntibodyPlaybackMetadata = Object.freeze({
  intervalMs: 3000,
  schedule: 'metadata-only',
  timerCreated: false,
  source: 'supplied fixtures only',
});

export const CVE_EVIDENCE_FIXTURES: readonly CveEvidenceFixture[] = Object.freeze([
  {
    id: 'CVE-2021-44228',
    name: 'Log4Shell',
    cvss: 10.0,
    technique: 'JNDI Injection',
    inertIndicatorText: '${jndi:ldap://attacker}',
    sourceLabel: 'supplied fixture (not live network)',
  },
  {
    id: 'CVE-2022-22965',
    name: 'Spring4Shell',
    cvss: 9.8,
    technique: 'Class loader traversal',
    inertIndicatorText: 'class.module.classLoader.resources.context.parent.pipeline.first.pattern',
    sourceLabel: 'supplied fixture (not live network)',
  },
  {
    id: 'CVE-2023-44487',
    name: 'Rapid Reset',
    cvss: 7.5,
    technique: 'HTTP/2 stream reset flood',
    inertIndicatorText: 'Stream Reset Flood',
    sourceLabel: 'supplied fixture (not live network)',
  },
  {
    id: 'CVE-2024-3400',
    name: 'Palo Alto GlobalProtect',
    cvss: 10.0,
    technique: 'Command Injection',
    inertIndicatorText: 'global-protect cookie',
    sourceLabel: 'supplied fixture (not live network)',
  },
  {
    id: 'CVE-2024-6387',
    name: 'regreSSHion',
    cvss: 8.1,
    technique: 'Signal handler race',
    inertIndicatorText: 'Signal Handler Race',
    sourceLabel: 'supplied fixture (not live network)',
  },
]);

export const DEFENSIVE_ANTIBODIES: readonly DefensiveAntibody[] = Object.freeze([
  {
    id: 'ab-jndi-lookup',
    category: 'Lookup injection indicator',
    escapedRegexSignature: '\\$\\{\\s*jndi\\s*:[^}]{0,256}\\}',
    severity: 'critical',
    toleranceThreshold: 80,
    quarantineResponse: 'Quarantine the text record; do not resolve or evaluate the lookup-shaped indicator.',
  },
  {
    id: 'ab-classloader-traversal',
    category: 'Class loader traversal indicator',
    escapedRegexSignature: 'class\\.module\\.classLoader\\.resources\\.context\\.parent\\.pipeline\\.first\\.pattern',
    severity: 'critical',
    toleranceThreshold: 80,
    quarantineResponse: 'Quarantine the text record and require isolated, manual remediation review.',
  },
  {
    id: 'ab-http2-reset-flood',
    category: 'HTTP/2 reset flood indicator',
    escapedRegexSignature: 'stream\\s+reset\\s+flood',
    severity: 'high',
    toleranceThreshold: 60,
    quarantineResponse: 'Quarantine the evidence record and route it to rate-limit and protocol-hardening review.',
  },
  {
    id: 'ab-globalprotect-command-injection',
    category: 'Gateway command injection indicator',
    escapedRegexSignature: 'global-protect\\s+cookie',
    severity: 'critical',
    toleranceThreshold: 80,
    quarantineResponse: 'Quarantine the evidence record and require a patched gateway verification.',
  },
  {
    id: 'ab-signal-handler-race',
    category: 'Signal handler race indicator',
    escapedRegexSignature: 'signal\\s+handler\\s+race',
    severity: 'high',
    toleranceThreshold: 60,
    quarantineResponse: 'Quarantine the evidence record and require supported-version remediation review.',
  },
]);

const severityBase: Record<AntibodySeverity, number> = { low: 15, medium: 35, high: 55, critical: 80 };
const credentialAssignment = /(\b(?:api[_-]?key|access[_-]?key|[a-z0-9_-]*(?:token|secret|password|credential))\b\s*[:=]\s*)([^\s,;]+)/gi;
const bearerCredential = /\b(bearer\s+)([a-z0-9._~+/-]{8,})/gi;

/** Redacts values only; the surrounding evidence wording and locator remain inspectable. */
export function redactCredentialShapedValues(value: string): string {
  return value
    .replace(credentialAssignment, '$1[REDACTED]')
    .replace(bearerCredential, '$1[REDACTED]');
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function locate(value: string, offset: number): EvidenceLocator {
  const prefix = value.slice(0, offset);
  const line = prefix.split('\n').length;
  return { line, column: offset - prefix.lastIndexOf('\n'), offset };
}

function unsupportedResult(reason: string): AntibodyScanResult {
  const evidence = redactCredentialShapedValues(reason);
  return {
    status: 'unsupported', locator: null, evidence, matchedAntibody: null, riskScore: 0,
    quarantineStatus: 'unsupported', receiptHash: hashText(`unsupported:${evidence}`),
  };
}

function score(antibody: DefensiveAntibody): number {
  return Math.min(100, severityBase[antibody.severity] + 15);
}

/**
 * Scans bounded, already-available text with fixed defensive signatures only.
 * The text is never fetched, executed, decoded, or interpolated into another string format.
 */
export function scanAntibodyEvidence(evidenceText: string): AntibodyScanResult {
  if (typeof evidenceText !== 'string') return unsupportedResult('Evidence must be plain text.');
  if (evidenceText.length > MAX_EVIDENCE_CHARS) {
    return unsupportedResult(`Evidence exceeds the ${MAX_EVIDENCE_CHARS}-character analysis boundary.`);
  }

  for (const antibody of DEFENSIVE_ANTIBODIES) {
    const match = new RegExp(antibody.escapedRegexSignature, 'i').exec(evidenceText);
    if (!match || match.index === undefined) continue;
    const riskScore = score(antibody);
    const quarantined = riskScore >= antibody.toleranceThreshold;
    const safeEvidence = redactCredentialShapedValues(match[0]);
    return {
      status: quarantined ? 'quarantined' : 'safe',
      locator: locate(evidenceText, match.index),
      evidence: safeEvidence,
      matchedAntibody: antibody,
      riskScore,
      quarantineStatus: quarantined ? 'quarantined' : 'not-required',
      receiptHash: hashText(JSON.stringify({ locator: match.index, evidence: safeEvidence, antibody: antibody.id, riskScore })),
    };
  }

  const redacted = redactCredentialShapedValues(evidenceText);
  return {
    status: 'safe', locator: null, evidence: null, matchedAntibody: null, riskScore: 0,
    quarantineStatus: 'not-required', receiptHash: hashText(`safe:${redacted}`),
  };
}

/** Scans at most five supplied-shaped records; no record is fetched or transformed into executable content. */
export function scanCveEvidenceRecords(records: readonly CveEvidenceFixture[]): AntibodyScanResult[] {
  if (!Array.isArray(records) || records.length > MAX_EVIDENCE_RECORDS) {
    return [unsupportedResult(`Record count must not exceed ${MAX_EVIDENCE_RECORDS}.`)];
  }
  const results: AntibodyScanResult[] = [];
  for (const record of records) {
    if (!record || typeof record.inertIndicatorText !== 'string' || record.inertIndicatorText.length > MAX_EVIDENCE_CHARS) {
      results.push(unsupportedResult('Record has unsupported inert evidence text.'));
      continue;
    }
    results.push(scanAntibodyEvidence(record.inertIndicatorText));
  }
  return results;
}
