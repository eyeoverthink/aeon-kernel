import type { KernelRun } from './kernel';

/**
 * These are fixed names for eight heuristic lanes. They are labels only:
 * this monitor makes no biological, quantum, emotional, spiritual, or
 * consciousness claims or measurements.
 */
export const BICAMERAL_CHANNEL_NAMES = [
  'PHYSICAL',
  'QUANTUM',
  'FRACTAL',
  'CREATIVE',
  'LOGICAL',
  'EMOTIONAL',
  'SPIRITUAL',
  'TACHYONIC',
] as const;

export type BicameralChannelName = (typeof BICAMERAL_CHANNEL_NAMES)[number];

/** Fixed bounds keep analysis output small even for a maximal KernelRun. */
export const MAX_BICAMERAL_CYCLES = 64;
export const MAX_BICAMERAL_CHANNELS = BICAMERAL_CHANNEL_NAMES.length;

export type BicameralChannelSnapshot = {
  name: BicameralChannelName;
  leftStructuralActivity: number;
  rightNoveltyActivity: number;
  coherence: number;
};

export type EurekaCandidateEvent = {
  cycle: number;
  channel: BicameralChannelName;
  leftStructuralActivity: number;
  rightNoveltyActivity: number;
  label: 'heuristic threshold event';
};

export type BicameralCycle = {
  index: number;
  traceStep: number | null;
  channels: BicameralChannelSnapshot[];
  averageCoherence: number;
  eurekaCandidates: EurekaCandidateEvent[];
};

export type BicameralRunAnalysis = {
  model: 'deterministic-bicameral-heuristic-v1';
  disclaimer: string;
  channels: readonly BicameralChannelName[];
  leftStructuralActivity: number;
  rightNoveltyActivity: number;
  averageCoherence: number;
  cycles: BicameralCycle[];
  eurekaCandidates: EurekaCandidateEvent[];
};

type ActivityMeasures = {
  tokenDiversity: number;
  structuralTokens: number;
  instructionDiversity: number;
  transitionDiversity: number;
  traceCoverage: number;
  stackMovement: number;
  findingDiversity: number;
  outputDiversity: number;
  byteEntropy: number;
  variableCoverage: number;
};

const DISCLAIMER = 'Named heuristic lanes only; not biological, quantum, emotional, spiritual, or consciousness evidence. Eureka labels are heuristic threshold events, never intelligence evidence.';
const STRUCTURAL_TOKEN_KINDS = new Set(['var', 'identifier', 'equals', 'lparen', 'rparen', 'semicolon']);
const RARE_TOKEN_KINDS = new Set(['caret', 'percent', 'star', 'slash', 'minus']);

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function ratio(value: number, maximum: number): number {
  return maximum <= 0 ? 0 : clamp(value / maximum);
}

function round(value: number): number {
  return Number(clamp(value).toFixed(6));
}

/** The specified cross-lane alignment formula, with its boundary clamp. */
function coherence(left: number, right: number): number {
  return clamp(1 - Math.abs(left - right) / 2, 0, 1);
}

function byteEntropy(bytecode: string[]): number {
  const bytes = bytecode
    .map((value) => /^0x([0-9a-f]{1,2})$/i.exec(value.trim()))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number.parseInt(match[1]!, 16));
  if (bytes.length === 0) return 0;
  const frequencies = new Map<number, number>();
  for (const byte of bytes) frequencies.set(byte, (frequencies.get(byte) ?? 0) + 1);
  let entropy = 0;
  for (const count of frequencies.values()) {
    const probability = count / bytes.length;
    entropy -= probability * Math.log2(probability);
  }
  return clamp(entropy / 8);
}

function measuresFor(run: KernelRun): ActivityMeasures {
  const nonEofTokens = run.tokens.filter((token) => token.kind !== 'eof');
  const tokenKinds = new Set(nonEofTokens.map((token) => token.kind));
  const instructions = run.canonicalInstructions.map((instruction) => instruction.trim().split(/\s+/)[1] ?? '');
  const instructionKinds = new Set(instructions.filter(Boolean));
  const transitions = new Set<string>();
  for (let index = 1; index < instructions.length; index += 1) transitions.add(`${instructions[index - 1]}>${instructions[index]}`);

  let stackMovement = 0;
  for (let index = 1; index < run.trace.length; index += 1) {
    stackMovement += Math.abs(run.trace[index]!.stack.length - run.trace[index - 1]!.stack.length);
  }
  const outputValues = new Set(run.output);
  const findingCategories = new Set(run.findings.map((finding) => finding.category));
  return {
    tokenDiversity: ratio(tokenKinds.size, 16),
    structuralTokens: nonEofTokens.length === 0 ? 0 : ratio(nonEofTokens.filter((token) => STRUCTURAL_TOKEN_KINDS.has(token.kind)).length, nonEofTokens.length),
    instructionDiversity: ratio(instructionKinds.size, 12),
    transitionDiversity: ratio(transitions.size, Math.max(1, instructions.length - 1)),
    traceCoverage: ratio(run.trace.length, Math.max(1, run.canonicalInstructions.length)),
    stackMovement: ratio(stackMovement, Math.max(1, run.trace.length * 2)),
    findingDiversity: ratio(findingCategories.size, 4),
    outputDiversity: ratio(outputValues.size, Math.max(1, run.output.length)),
    byteEntropy: byteEntropy(run.bytecode),
    variableCoverage: ratio(Object.keys(run.variables).length, Math.max(1, run.tokens.filter((token) => token.kind === 'identifier').length)),
  };
}

function activities(measures: ActivityMeasures, rareTokenRatio: number): { left: number; right: number } {
  const left = (
    measures.structuralTokens * 0.22
    + measures.instructionDiversity * 0.2
    + measures.traceCoverage * 0.16
    + measures.tokenDiversity * 0.14
    + measures.variableCoverage * 0.12
    + measures.findingDiversity * 0.08
    + measures.byteEntropy * 0.08
  );
  const right = (
    measures.byteEntropy * 0.23
    + measures.transitionDiversity * 0.2
    + measures.stackMovement * 0.16
    + measures.tokenDiversity * 0.14
    + measures.outputDiversity * 0.1
    + rareTokenRatio * 0.1
    + measures.findingDiversity * 0.07
  );
  return { left: clamp(left), right: clamp(right) };
}

function laneSnapshot(name: BicameralChannelName, index: number, left: number, right: number): BicameralChannelSnapshot {
  // Fixed coefficients distinguish lanes without assigning real-world properties to their names.
  const structuralFactor = 0.82 + index * 0.025;
  const noveltyFactor = 1.0 - index * 0.02;
  const laneLeft = round(left * structuralFactor);
  const laneRight = round(right * noveltyFactor);
  return { name, leftStructuralActivity: laneLeft, rightNoveltyActivity: laneRight, coherence: round(coherence(laneLeft, laneRight)) };
}

function sampledTraceIndexes(length: number): Array<number | null> {
  if (length === 0) return [null];
  const count = Math.min(MAX_BICAMERAL_CYCLES, length);
  if (count === length) return Array.from({ length }, (_, index) => index);
  return Array.from({ length: count }, (_, index) => Math.floor(index * (length - 1) / (count - 1)));
}

/**
 * Pure, synchronous, deterministic analysis of a completed KernelRun.
 * It does not execute source, schedule work, or mutate the supplied run.
 */
export function analyzeBicameralRun(run: KernelRun): BicameralRunAnalysis {
  const measures = measuresFor(run);
  const nonEofTokens = run.tokens.filter((token) => token.kind !== 'eof');
  const rareTokenRatio = nonEofTokens.length === 0 ? 0 : ratio(nonEofTokens.filter((token) => RARE_TOKEN_KINDS.has(token.kind)).length, nonEofTokens.length);
  const base = activities(measures, rareTokenRatio);
  const cycles = sampledTraceIndexes(run.trace.length).map((traceIndex, index) => {
    const trace = traceIndex === null ? null : run.trace[traceIndex]!;
    const localStack = trace ? ratio(trace.stack.length, 8) : 0;
    const localOutput = trace ? ratio(trace.output.length, Math.max(1, run.output.length)) : 0;
    const cycleLeft = clamp(base.left * 0.82 + localStack * 0.18);
    const cycleRight = clamp(base.right * 0.82 + (localStack + localOutput) * 0.09);
    const channels = BICAMERAL_CHANNEL_NAMES.map((name, channelIndex) => laneSnapshot(name, channelIndex, cycleLeft, cycleRight));
    const averageCoherence = round(channels.reduce((sum, channel) => sum + channel.coherence, 0) / MAX_BICAMERAL_CHANNELS);
    const eurekaCandidates = channels
      .filter((channel) => channel.leftStructuralActivity > 0.7 && channel.rightNoveltyActivity > 0.7)
      .map((channel) => ({ cycle: index, channel: channel.name, leftStructuralActivity: channel.leftStructuralActivity, rightNoveltyActivity: channel.rightNoveltyActivity, label: 'heuristic threshold event' as const }));
    return { index, traceStep: trace?.step ?? null, channels, averageCoherence, eurekaCandidates };
  });
  const allChannels = BICAMERAL_CHANNEL_NAMES.map((name, index) => laneSnapshot(name, index, base.left, base.right));
  return {
    model: 'deterministic-bicameral-heuristic-v1',
    disclaimer: DISCLAIMER,
    channels: BICAMERAL_CHANNEL_NAMES,
    leftStructuralActivity: round(base.left),
    rightNoveltyActivity: round(base.right),
    averageCoherence: round(allChannels.reduce((sum, channel) => sum + channel.coherence, 0) / MAX_BICAMERAL_CHANNELS),
    cycles,
    eurekaCandidates: cycles.flatMap((cycle) => cycle.eurekaCandidates),
  };
}