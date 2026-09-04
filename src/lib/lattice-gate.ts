import {
  analyzeBicameralRun,
  BICAMERAL_CHANNEL_NAMES,
  MAX_BICAMERAL_CYCLES,
  type BicameralChannelName,
  type BicameralCycle,
  type BicameralRunAnalysis,
} from './bicameral';
import type { IntegrityTrial } from './integrity';
import type { KernelRun } from './kernel';

/** A selected mathematical constant used by this deterministic software transform. */
export const LATTICE_GATE_PHI = 1.618033988749895;
export const DEFAULT_LATTICE_GATE_THRESHOLD = 1 / LATTICE_GATE_PHI;
export const MAX_LATTICE_GATE_CYCLES = MAX_BICAMERAL_CYCLES;

export type LatticeGateState = 'open' | 'closed';

export type LatticeGateEvidence = {
  leftStructuralActivity: number;
  rightNoveltyActivity: number;
  coherence: number;
  recoverySupplied: boolean;
  recoveredBitRate: number | null;
  observedTrackBitErrorRate: number | null;
  observedTrackByteErrorRate: number | null;
  sourceFormula: string;
};

export type LatticeGateChannel = {
  name: BicameralChannelName;
  sourceScore: number;
  phaseProduct: number;
  nearestVertex: number;
  divergence: number;
  resonance: number;
  threshold: number;
  gateMargin: number;
  state: LatticeGateState;
  maskBit: 0 | 1;
  conductanceIndex: number;
  evidence: LatticeGateEvidence;
};

export type LatticeGateCycle = {
  index: number;
  traceStep: number | null;
  channels: LatticeGateChannel[];
  decisionMask: number;
  decisionMaskBinary: string;
  averageSourceScore: number;
  averageResonance: number;
  averageConductanceIndex: number;
};

export type LatticeGateContradiction = {
  code: string;
  detected: boolean;
  detail: string;
};

export type RenderedAvx512Pseudocode = {
  language: 'avx-512-pseudocode';
  code: string;
  status: 'source-derived/rendered-only/not-compiled/not-executed/no-equivalence-claimed';
};

export type LatticeGateResult = {
  model: 'deterministic-lattice-gate-v1';
  disclaimer: string;
  phi: number;
  threshold: number;
  channels: readonly BicameralChannelName[];
  gates: LatticeGateChannel[];
  decisionMask: number;
  decisionMaskBinary: string;
  averageSourceScore: number;
  averageResonance: number;
  averageConductanceIndex: number;
  cycles: LatticeGateCycle[];
  contradictions: LatticeGateContradiction[];
  receiptHash: string;
  renderedAvx512Pseudocode: RenderedAvx512Pseudocode;
};

export type LatticeGateOptions = {
  threshold?: number;
  integrityTrial?: IntegrityTrial;
};

const DISCLAIMER = 'Lattice/transistor language is a software gate metaphor. Phi is a chosen mathematical transform, not a physical law or discovered threshold. The rendered AVX-512-style text is source-derived only and makes no execution or equivalence claim.';
const SOURCE_FORMULA = 'without FRAY: 0.35*structural + 0.30*novelty + 0.35*coherence; with FRAY: 0.28*structural + 0.24*novelty + 0.28*coherence + 0.12*recoveredBitRate + 0.08*(1-meanObservedErrorRate)';

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0));
}

function bounded(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be a finite number in the inclusive interval [0, 1].`);
  }
  return value;
}

function round(value: number): number {
  return Number(value.toFixed(12));
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function thresholdFrom(options: LatticeGateOptions): number {
  const threshold = options.threshold ?? DEFAULT_LATTICE_GATE_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new RangeError('threshold must be a finite number in the open interval (0, 1).');
  }
  return threshold;
}

type RecoveryEvidence = Pick<LatticeGateEvidence, 'recoverySupplied' | 'recoveredBitRate' | 'observedTrackBitErrorRate' | 'observedTrackByteErrorRate'>;

function recoveryEvidence(trial: IntegrityTrial | undefined): RecoveryEvidence {
  if (!trial) {
    return {
      recoverySupplied: false, recoveredBitRate: null,
      observedTrackBitErrorRate: null, observedTrackByteErrorRate: null,
    };
  }
  const recovery = trial.recovery;
  return {
    recoverySupplied: true,
    recoveredBitRate: bounded(recovery.recoveredBitRate, 'integrityTrial.recovery.recoveredBitRate'),
    observedTrackBitErrorRate: bounded(recovery.observedTrackBitErrorRate, 'integrityTrial.recovery.observedTrackBitErrorRate'),
    observedTrackByteErrorRate: bounded(recovery.observedTrackByteErrorRate, 'integrityTrial.recovery.observedTrackByteErrorRate'),
  };
}

function deriveChannel(
  snapshot: { name: BicameralChannelName; leftStructuralActivity: number; rightNoveltyActivity: number; coherence: number },
  threshold: number,
  recovery: RecoveryEvidence,
): LatticeGateChannel {
  const structural = bounded(snapshot.leftStructuralActivity, `${snapshot.name}.leftStructuralActivity`);
  const novelty = bounded(snapshot.rightNoveltyActivity, `${snapshot.name}.rightNoveltyActivity`);
  const coherence = bounded(snapshot.coherence, `${snapshot.name}.coherence`);
  const meanError = recovery.recoverySupplied
    ? ((recovery.observedTrackBitErrorRate! + recovery.observedTrackByteErrorRate!) / 2)
    : 0;
  const sourceScore = clamp(recovery.recoverySupplied
    ? structural * 0.28 + novelty * 0.24 + coherence * 0.28 + recovery.recoveredBitRate! * 0.12 + (1 - meanError) * 0.08
    : structural * 0.35 + novelty * 0.30 + coherence * 0.35);
  const phaseProduct = sourceScore * LATTICE_GATE_PHI;
  const nearestVertex = Math.round(phaseProduct);
  const divergence = Math.abs(phaseProduct - nearestVertex);
  const resonance = clamp(1 - 2 * divergence);
  const state: LatticeGateState = resonance >= threshold ? 'open' : 'closed';
  const maskBit: 0 | 1 = state === 'open' ? 1 : 0;
  return {
    name: snapshot.name, sourceScore: round(sourceScore), phaseProduct: round(phaseProduct), nearestVertex,
    divergence: round(divergence), resonance: round(resonance), threshold: round(threshold),
    gateMargin: round(resonance - threshold), state, maskBit,
    conductanceIndex: state === 'open' ? round(Math.max(0, (resonance - threshold) / (1 - threshold))) : 0,
    evidence: {
      leftStructuralActivity: structural, rightNoveltyActivity: novelty, coherence,
      ...recovery, sourceFormula: SOURCE_FORMULA,
    },
  };
}

function decisionMask(channels: readonly LatticeGateChannel[]): number {
  return channels.reduce((mask, channel, index) => mask | (channel.maskBit << index), 0) >>> 0;
}

function average(channels: readonly LatticeGateChannel[], key: 'sourceScore' | 'resonance' | 'conductanceIndex'): number {
  return round(channels.reduce((total, channel) => total + channel[key], 0) / BICAMERAL_CHANNEL_NAMES.length);
}

function cycleResult(cycle: BicameralCycle, threshold: number, recovery: RecoveryEvidence): LatticeGateCycle {
  const channels = cycle.channels.map((channel) => deriveChannel(channel, threshold, recovery));
  const mask = decisionMask(channels);
  return {
    index: cycle.index, traceStep: cycle.traceStep, channels, decisionMask: mask,
    decisionMaskBinary: mask.toString(2).padStart(8, '0'),
    averageSourceScore: average(channels, 'sourceScore'),
    averageResonance: average(channels, 'resonance'),
    averageConductanceIndex: average(channels, 'conductanceIndex'),
  };
}

function contradictions(gates: readonly LatticeGateChannel[], mask: number, threshold: number, trial?: IntegrityTrial): LatticeGateContradiction[] {
  const mismatchedGate = gates.some((gate) =>
    gate.maskBit !== (gate.resonance >= threshold ? 1 : 0) ||
    gate.state !== (gate.maskBit ? 'open' : 'closed') ||
    (gate.maskBit === 0 && gate.conductanceIndex !== 0),
  );
  const rebuiltMask = decisionMask(gates);
  const integrityMismatch = trial
    ? trial.recovery.exactRecovery !== (trial.recovery.recoveredMismatchedBits === 0)
    : false;
  return [
    { code: 'gate-state-mismatch', detected: mismatchedGate, detail: 'Each mask bit, state, threshold comparison, and closed conductance value must agree.' },
    { code: 'decision-mask-mismatch', detected: rebuiltMask !== mask || mask > 0xff, detail: 'The unsigned 8-bit decision mask must reconstruct from the eight ordered channel bits.' },
    { code: 'integrity-recovery-mismatch', detected: integrityMismatch, detail: 'When FRAY evidence is supplied, exactRecovery must agree with recovered mismatched-bit count.' },
  ];
}

function renderedPseudocode(threshold: number): RenderedAvx512Pseudocode {
  return {
    language: 'avx-512-pseudocode',
    status: 'source-derived/rendered-only/not-compiled/not-executed/no-equivalence-claimed',
    code: [
      '; Source-derived, rendered-only pseudocode; not compiled, not executed, no equivalence claimed.',
      '; Eight ordered software lanes: PHYSICAL through TACHYONIC.',
      `sourceLane = clamp(structuralNoveltyCoherenceEvidence); phi = ${LATTICE_GATE_PHI}; threshold = ${threshold};`,
      'phaseLane = sourceLane * phi; nearestLane = round(phaseLane);',
      'resonanceLane = clamp(1 - 2 * abs(phaseLane - nearestLane), 0, 1);',
      'vcmppd gateMask, resonanceLane, thresholdLane, greater-or-equal-ordered ; rendered mask comparison',
      'decisionMask = lowEightBits(gateMask);',
    ].join('\n'),
  };
}

function receipt(run: KernelRun, analysis: BicameralRunAnalysis, threshold: number, recovery: RecoveryEvidence, gates: readonly LatticeGateChannel[], cycles: readonly LatticeGateCycle[]): string {
  // Deliberately selects semantic values only: no run creation time, clock, timer, or mutable identity.
  const semantic = {
    model: 'deterministic-lattice-gate-v1', inputHash: run.inputHash, status: run.status, promotion: run.promotion,
    threshold, phi: LATTICE_GATE_PHI, bicameral: {
      left: analysis.leftStructuralActivity, right: analysis.rightNoveltyActivity, coherence: analysis.averageCoherence,
      cycles: cycles.map((cycle) => ({ index: cycle.index, traceStep: cycle.traceStep, mask: cycle.decisionMask })),
    },
    recovery,
    gates: gates.map((gate) => ({ name: gate.name, sourceScore: gate.sourceScore, resonance: gate.resonance, maskBit: gate.maskBit })),
  };
  return hashText(JSON.stringify(semantic));
}

/**
 * Browser-safe, pure, synchronous simulator. It reads completed analysis data
 * and never evaluates source or invokes platform capabilities.
 */
export class LatticeGateSimulator {
  readonly threshold: number;

  constructor(options: Pick<LatticeGateOptions, 'threshold'> = {}) {
    this.threshold = thresholdFrom(options);
  }

  analyze(run: KernelRun, integrityTrial?: IntegrityTrial): LatticeGateResult {
    if (!run || typeof run !== 'object') throw new TypeError('run must be a completed KernelRun object.');
    const analysis = analyzeBicameralRun(run);
    const recovery = recoveryEvidence(integrityTrial);
    const baseChannels = BICAMERAL_CHANNEL_NAMES.map((name, index) => ({
      name,
      leftStructuralActivity: clamp(analysis.leftStructuralActivity * (0.82 + index * 0.025)),
      rightNoveltyActivity: clamp(analysis.rightNoveltyActivity * (1 - index * 0.02)),
      coherence: 0,
    })).map((channel) => ({
      ...channel,
      coherence: clamp(1 - Math.abs(channel.leftStructuralActivity - channel.rightNoveltyActivity) / 2),
    }));
    const gates = baseChannels.map((channel) => deriveChannel(channel, this.threshold, recovery));
    const cycles = analysis.cycles.slice(0, MAX_LATTICE_GATE_CYCLES).map((cycle) => cycleResult(cycle, this.threshold, recovery));
    const mask = decisionMask(gates);
    return {
      model: 'deterministic-lattice-gate-v1', disclaimer: DISCLAIMER, phi: LATTICE_GATE_PHI, threshold: this.threshold,
      channels: BICAMERAL_CHANNEL_NAMES, gates, decisionMask: mask, decisionMaskBinary: mask.toString(2).padStart(8, '0'),
      averageSourceScore: average(gates, 'sourceScore'), averageResonance: average(gates, 'resonance'),
      averageConductanceIndex: average(gates, 'conductanceIndex'), cycles,
      contradictions: contradictions(gates, mask, this.threshold, integrityTrial),
      receiptHash: receipt(run, analysis, this.threshold, recovery, gates, cycles),
      renderedAvx512Pseudocode: renderedPseudocode(this.threshold),
    };
  }
}

/** Convenience wrapper for one deterministic analysis operation. */
export function analyzeLatticeGate(run: KernelRun, options: LatticeGateOptions = {}): LatticeGateResult {
  return new LatticeGateSimulator(options).analyze(run, options.integrityTrial);
}