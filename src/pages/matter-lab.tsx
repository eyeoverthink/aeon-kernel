import { useState, useMemo } from 'react';
import { useKernelStore } from '@/hooks/use-kernel';
import { cn } from '@/lib/utils';
import {
  runIntegrityTrial, 
  type IntegrityTrial,
  type DataRigidbody
} from '@/lib/integrity';
import { buildCveFeed, createCveFeedPlayback, advanceCveFeedPlayback } from '@/lib/cve-feed';
import { analyzeCircuit, buildFullAdderDemo, decodeSilcFrame, encodeSilcFrame, SILC_FRAME_BYTES } from '@/lib/circuit-lab';
import { DEFAULT_L0_TRIAL_CASES, runL0TrialSuite, type L0TrialSuite } from '@/lib/l0-safety';
import {
  analyzeBicameralRun
} from '@/lib/bicameral';
import {
  analyzeLatticeGate,
  LATTICE_GATE_PHI,
  DEFAULT_LATTICE_GATE_THRESHOLD,
  type LatticeGateResult
} from '@/lib/lattice-gate';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Microscope, Database, BrainCircuit, Binary, Bug, SkipForward, HelpCircle, Play, Info } from 'lucide-react';

function Metric({ label, value, color = "text-foreground" }: { label: string, value: string | number, color?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-mono font-bold ${color}`}>{value}</span>
    </div>
  );
}

function RigidbodyCell({ body, isSelected, onClick }: { body: DataRigidbody, isSelected: boolean, onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "aspect-square flex items-center justify-center text-[10px] font-mono relative group transition-colors outline-none",
        isSelected 
          ? "bg-secondary text-secondary-foreground border border-secondary" 
          : "bg-black border border-border/50 text-foreground hover:bg-secondary/10 hover:border-secondary focus:bg-secondary/10 focus:border-secondary"
      )}
      title={`Byte Index: ${body.byteIndex}\nValue: ${body.value}`}
    >
      0x{body.value.toString(16).padStart(2, '0').toUpperCase()}
    </button>
  );
}

function IntegritySection({ onTrialChange }: { onTrialChange?: (trial: IntegrityTrial) => void }) {
  const activeRun = useKernelStore((state) => state.activeRun);
  const [trackCount, setTrackCount] = useState(5);
  const [noiseRatio, setNoiseRatio] = useState(0.35);
  const [trial, setTrial] = useState<IntegrityTrial | null>(null);
  const [trialDuration, setTrialDuration] = useState(0);
  const [selectedBodyIndex, setSelectedBodyIndex] = useState<number | null>(null);

  const isValidRun = activeRun?.promotion === 'promoted' && activeRun.bytecode.length > 0;

  const handleRunTrial = () => {
    if (!isValidRun) return;
    const payload = new Uint8Array(activeRun.bytecode.map(hex => parseInt(hex, 16)));
    const timestamp = BigInt(Date.parse(activeRun.createdAt));
    const indexPosition = parseInt(activeRun.inputHash, 16) >>> 0;
    
    const start = performance.now();
    const result = runIntegrityTrial({ 
      payload, 
      trackCount, 
      noiseRatio,
      timestamp,
      indexPosition,
      schema: 1,
      blockCount: 1
    });
    const end = performance.now();
    setTrialDuration(end - start);
    setTrial(result);
    setSelectedBodyIndex(0);
    onTrialChange?.(result);
  };

  if (!isValidRun) {
    return (
      <div className="border border-border bg-card p-6 flex flex-col items-center justify-center text-center gap-4">
        <Database className="w-12 h-12 text-muted-foreground opacity-50" />
        <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          No Promoted Workbench Run Available
        </div>
        <div className="text-xs text-muted-foreground max-w-md">
          Integrity testing requires successfully compiled binary output. Please execute a valid source file in the Workbench to generate bytecode payload.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4 bg-black/40 p-4 border border-border">
        <div className="flex flex-col gap-1 w-48">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Track Count: {trackCount} (Odd)</label>
          <input 
            type="range" min="1" max="15" step="2" 
            value={trackCount} onChange={(e) => setTrackCount(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <div className="flex flex-col gap-1 w-48">
          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Noise Ratio: {(noiseRatio * 100).toFixed(0)}%</label>
          <input 
            type="range" min="0" max="1" step="0.01" 
            value={noiseRatio} onChange={(e) => setNoiseRatio(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>
        <Button 
          data-testid="integrity-run" 
          onClick={handleRunTrial}
          className="ml-auto rounded-none tracking-widest font-bold bg-secondary text-secondary-foreground hover:bg-secondary/80 gap-2"
        >
          <Play className="w-4 h-4" /> RUN INTEGRITY TRIAL
        </Button>
      </div>

      {trial && (
        <div className="border border-border bg-card flex flex-col" data-testid="integrity-result">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex justify-between items-center">
            <span>Trial Results</span>
            <span className="text-[10px] text-muted-foreground font-mono">Completed in {trialDuration.toFixed(2)}ms</span>
          </div>
          <div className="p-4 flex flex-col gap-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <Metric label="Header: Magic" value="FRAY" />
              <Metric label="Header: Schema" value={trial.frame.header.schema} />
              <Metric label="Header: Index" value={trial.frame.header.indexPosition} />
              <Metric label="Header: Timestamp" value={trial.frame.header.timestamp.toString()} />
              <Metric label="Header: Block Count" value={trial.frame.header.blockCount} />
              <Metric label="Header: Payload" value={`${trial.frame.header.payloadSize} B`} />
              
              <Metric label="Frame Length" value={`${trial.encodedFrame.byteLength} B`} color="text-secondary" />
              <Metric label="Checksum" value={`0x${trial.receipt.checksumHex}`} color="text-secondary" />
              <Metric label="Receipt Hash" value={trial.receipt.receiptHash} color="text-secondary" />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Raw Frame Preview (Bounded Hex)</span>
              <div className="bg-black/50 border border-border p-2 text-xs font-mono text-foreground/80 break-all overflow-hidden max-h-24">
                {Array.from(trial.encodedFrame).slice(0, 128).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}
                {trial.encodedFrame.length > 128 ? ' ...' : ''}
              </div>
            </div>

            <div className="border border-border/50 bg-black/50 p-3 flex flex-col gap-2">
              <div className="flex justify-between items-center border-b border-border/30 pb-2 mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Recovery Metrics (Threshold: {trial.recovery.majorityThreshold})</span>
                <span className="text-[10px] text-primary uppercase font-mono bg-primary/10 px-2 py-0.5 border border-primary/20">
                  Throughput: {((trial.recovery.totalBits * trackCount) / trialDuration).toFixed(2)} bits/ms (browser measurement)
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                <Metric label="Bit Flips" value={trial.recovery.noisyBitFlipsTotal} />
                <Metric label="Changed Bytes" value={trial.recovery.noisyChangedBytesTotal} />
                <Metric label="Recovered Bits" value={`${trial.recovery.recoveredMatchingBits} / ${trial.recovery.totalBits} (${(trial.recovery.recoveredBitRate * 100).toFixed(2)}%)`} />
                <Metric label="Exact Recovery" value={trial.recovery.exactRecovery ? 'YES' : 'NO'} color={trial.recovery.exactRecovery ? 'text-green-500' : 'text-orange-500'} />
              </div>
            </div>
            
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 mb-3">
                Per-Track Corruption
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {trial.trackMetrics.map(tm => (
                  <div key={tm.track} className="bg-black/30 border border-border/30 p-2 text-[10px] font-mono flex flex-col gap-1">
                    <div className="text-secondary font-bold">Track {tm.track}</div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Flipped Bits:</span>
                      <span>{tm.flippedBits} ({(tm.observedBitErrorRate * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Changed Bytes:</span>
                      <span>{tm.changedBytes} ({(tm.observedByteErrorRate * 100).toFixed(1)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 mb-3">
                Data Rigidbody Inspection
              </div>
              <div className="grid grid-cols-8 md:grid-cols-16 gap-1 mb-4" data-testid="rigidbody-grid">
                {trial.dataRigidbodies.map((body, i) => (
                  <RigidbodyCell 
                    key={i} 
                    body={body} 
                    isSelected={selectedBodyIndex === i}
                    onClick={() => setSelectedBodyIndex(i)}
                  />
                ))}
              </div>

              {selectedBodyIndex !== null && trial.dataRigidbodies[selectedBodyIndex] && (
                <div className="border border-secondary/30 bg-secondary/5 p-4 flex flex-col gap-4" data-testid="selected-rigidbody">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-secondary" />
                    <span className="text-[10px] text-secondary/80 uppercase tracking-widest font-bold">
                      These are deterministic annotations, not physical measurements.
                    </span>
                  </div>

                  {(() => {
                    const body = trial.dataRigidbodies[selectedBodyIndex];
                    return (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 pb-4 border-b border-secondary/20">
                          <Metric label="Byte Suit" value={body.suitLabel} color="text-secondary" />
                          <Metric label="Armor" value={body.armorState} color="text-secondary" />
                          <Metric label="Parity" value={body.parity} color="text-secondary" />
                          <Metric label="Frequency" value={body.frequency.toFixed(4)} color="text-secondary" />
                          <Metric label="Tolerance" value={body.tolerance.toFixed(4)} color="text-secondary" />
                          <Metric label="Threshold" value={body.threshold.toFixed(4)} color="text-secondary" />
                          <Metric label="Mass" value={body.mass.toFixed(4)} color="text-secondary" />
                          <Metric label="Velocity" value={body.velocity.toFixed(4)} color="text-secondary" />
                        </div>

                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">BitSuit Objects</span>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2" data-testid="bit-suit-grid">
                            {body.bits.map((bit, idx) => (
                              <div key={idx} className="bg-black/40 border border-border/40 p-2 grid grid-cols-3 sm:grid-cols-9 gap-2 text-[10px] font-mono">
                                <div className="flex flex-col"><span className="text-muted-foreground">Val</span><span className="text-foreground">{bit.value}</span></div>
                                <div className="flex flex-col"><span className="text-muted-foreground">Label</span><span className="text-foreground truncate" title={bit.suitLabel}>{bit.suitLabel}</span></div>
                                <div className="flex flex-col"><span className="text-muted-foreground">Armor</span><span className="text-foreground truncate">{bit.armorState}</span></div>
                                <div className="flex flex-col"><span className="text-muted-foreground">Parity</span><span className="text-foreground">{bit.parity}</span></div>
                                <div className="flex flex-col"><span className="text-muted-foreground">Freq</span><span className="text-foreground">{bit.frequency.toFixed(2)}</span></div>
                                <div className="flex flex-col"><span className="text-muted-foreground">Tol</span><span className="text-foreground">{bit.tolerance.toFixed(2)}</span></div>
                                <div className="flex flex-col"><span className="text-muted-foreground">Thr</span><span className="text-foreground">{bit.threshold.toFixed(2)}</span></div>
                                <div className="flex flex-col"><span className="text-muted-foreground">Mass</span><span className="text-foreground">{bit.mass.toFixed(2)}</span></div>
                                <div className="flex flex-col"><span className="text-muted-foreground">Vel</span><span className="text-foreground">{bit.velocity.toFixed(2)}</span></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceAttributedCveFeedSection() {
  const feed = useMemo(() => buildCveFeed('2026-09-04'), []);
  const [playback, setPlayback] = useState(() => createCveFeedPlayback(feed));
  const entry = playback.cursor >= 0 ? feed.records[playback.cursor] : null;
  return <div className="border border-border bg-card flex flex-col" data-testid="cve-source-feed">
    <div className="bg-muted px-3 py-2 border-b border-border flex flex-wrap justify-between gap-2 items-center"><div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Bug className="w-4 h-4 text-orange-500" />Source-attributed CVE feed</div><Badge variant="outline" className="rounded-none text-[10px]">BUNDLED SNAPSHOT · NOT LIVE</Badge></div>
    <div className="p-4 flex flex-col gap-4">
      <div className="flex flex-wrap justify-between gap-3"><div className="text-xs font-mono text-muted-foreground">As-of {feed.asOfDate} · {feed.retrievalMode} · receipt {feed.receipt}</div><Button type="button" data-testid="cve-feed-advance" variant="outline" size="sm" onClick={() => setPlayback(value => advanceCveFeedPlayback(feed, value))} className="rounded-none tracking-widest text-[10px] font-bold"><SkipForward className="w-3 h-3 mr-2" />ADVANCE</Button></div>
      <div className="text-[10px] text-muted-foreground uppercase">Playback: {playback.schedule}; timers created: {String(playback.timerCreated)}; explicit advances: {playback.advances}</div>
      {entry ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="cve-feed-record">
        <div className="flex flex-col gap-2"><h4 className="font-bold">{entry.record.name} ({entry.record.id})</h4><div className="grid grid-cols-2 gap-3"><Metric label="CVSS" value={entry.record.cvss} /><Metric label="Technique" value={entry.record.technique} /><Metric label="Source organization" value={entry.record.sourceOrganization} /><Metric label="Freshness" value={`${entry.freshnessAgeDays} days (${entry.freshnessStatus})`} /><Metric label="Published / modified" value={`${entry.record.publishedDate} / ${entry.record.modifiedDate}`} /><Metric label="Record receipt" value={entry.receipt} /></div><a data-testid="cve-source-link" href={entry.record.advisoryUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-secondary underline break-all">Allowlisted advisory: {entry.record.advisoryUrl}</a></div>
        <div className="border border-orange-500/30 bg-orange-500/5 p-3 text-xs flex flex-col gap-2"><div><strong>Inert summary:</strong> {entry.record.inertSummary}</div><div><strong>Quarantine classification:</strong> {entry.scan.status} · score {entry.scan.riskScore}</div><div><strong>Classifier metadata:</strong> {entry.scan.matchedAntibody ? `${entry.scan.matchedAntibody.id} (${entry.scan.matchedAntibody.category}), threshold ${entry.scan.matchedAntibody.toleranceThreshold}` : 'no matched antibody'}</div><div><strong>Locator:</strong> {entry.scan.locator ? `line ${entry.scan.locator.line}, column ${entry.scan.locator.column}, offset ${entry.scan.locator.offset}` : 'none'}</div><div><strong>Scan receipt:</strong> {entry.scan.receiptHash}</div></div>
      </div> : <div className="text-xs text-muted-foreground border border-border/50 p-4">No record selected. Advance the local snapshot explicitly; no timer or autoplay is used.</div>}
      <div className="text-xs text-muted-foreground">Contradictions: {feed.contradictions.length ? feed.contradictions.map(item => `${item.recordId}: ${item.message}`).join(' | ') : 'none detected'}</div>
    </div>
  </div>;
}

function BicameralSection() {
  const activeRun = useKernelStore((state) => state.activeRun);
  const isValidRun = activeRun?.promotion === 'promoted' && activeRun.bytecode.length > 0;
  
  const analysis = useMemo(() => {
    if (!isValidRun) return null;
    return analyzeBicameralRun(activeRun);
  }, [activeRun, isValidRun]);

  if (!isValidRun || !analysis) {
    return (
      <div className="border border-border bg-card p-6 flex flex-col items-center justify-center text-center gap-4">
        <BrainCircuit className="w-12 h-12 text-muted-foreground opacity-50" />
        <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          No Promoted Workbench Run Available
        </div>
        <div className="text-xs text-muted-foreground max-w-md">
          Bicameral monitoring requires a completed execution trace. Please execute a valid source file in the Workbench first.
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card flex flex-col" data-testid="bicameral-monitor">
      <div className="bg-muted px-3 py-2 border-b border-border flex justify-between items-center">
        <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-violet-400" />
          Heuristic Monitors
        </div>
        <div className="text-[10px] font-mono text-muted-foreground hidden sm:block">Model: {analysis.model}</div>
      </div>

      <div className="p-4 flex flex-col gap-6">
        <div className="bg-violet-500/5 border border-violet-500/20 p-3 flex items-start gap-3">
          <Info className="w-5 h-5 text-violet-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-violet-400/80 leading-relaxed uppercase tracking-wider font-bold">
            WARNING: {analysis.disclaimer}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Overall Coherence" value={analysis.averageCoherence.toFixed(4)} color="text-violet-400" />
          <Metric label="Left Structural" value={analysis.leftStructuralActivity.toFixed(4)} />
          <Metric label="Right Novelty" value={analysis.rightNoveltyActivity.toFixed(4)} />
          <Metric label="Recorded Cycles" value={analysis.cycles.length} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">
            Lane Snapshots (Latest Cycle)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
            {analysis.cycles[analysis.cycles.length - 1]?.channels.map(ch => (
              <div key={ch.name} className="bg-black/40 border border-border/40 p-3 flex flex-col gap-2">
                <div className="font-bold text-xs uppercase tracking-widest text-violet-300">{ch.name}</div>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted-foreground">
                  <div className="flex flex-col">
                    <span>Left (Struct)</span>
                    <span className="text-foreground">{ch.leftStructuralActivity.toFixed(3)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span>Right (Novel)</span>
                    <span className="text-foreground">{ch.rightNoveltyActivity.toFixed(3)}</span>
                  </div>
                  <div className="col-span-2 flex justify-between border-t border-border/30 pt-1 mt-1">
                    <span>Coherence:</span>
                    <span className="text-violet-400">{ch.coherence.toFixed(3)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {analysis.eurekaCandidates.length > 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <div className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 flex items-center justify-between md:justify-start gap-2">
              <span>Eureka Candidates</span>
              <Badge variant="outline" className="text-[9px] rounded-none bg-yellow-500/10 text-yellow-500 border-yellow-500/30">HEURISTIC THRESHOLD EVENTS ONLY</Badge>
            </div>
            <div className="flex flex-col gap-2">
              {analysis.eurekaCandidates.map((ec, idx) => (
                <div key={idx} className="bg-yellow-500/5 border border-yellow-500/20 p-2 text-[11px] font-mono flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="text-yellow-500 font-bold">CYCLE {ec.cycle}</span>
                  <span className="text-muted-foreground hidden sm:inline">|</span>
                  <span className="text-foreground">{ec.channel}</span>
                  <span className="text-muted-foreground hidden sm:inline">|</span>
                  <span>Left: {ec.leftStructuralActivity.toFixed(3)}</span>
                  <span>Right: {ec.rightNoveltyActivity.toFixed(3)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function LatticeGateSection({ integrityTrial }: { integrityTrial: IntegrityTrial | null }) {
  const activeRun = useKernelStore((state) => state.activeRun);
  const [threshold, setThreshold] = useState(DEFAULT_LATTICE_GATE_THRESHOLD);

  const isValidRun = activeRun?.promotion === 'promoted' && activeRun.bytecode.length > 0;

  const result = useMemo(() => {
    if (!isValidRun || !activeRun) return null;
    return analyzeLatticeGate(activeRun, { threshold, integrityTrial: integrityTrial || undefined });
  }, [activeRun, isValidRun, threshold, integrityTrial]);

  if (!isValidRun) {
    return (
      <div className="border border-border bg-card p-6 flex flex-col items-center justify-center text-center gap-4">
        <Binary className="w-12 h-12 text-muted-foreground opacity-50" />
        <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          No Promoted Workbench Run Available
        </div>
        <div className="text-xs text-muted-foreground max-w-md">
          Lattice gate derivation requires completed bicameral monitoring from a compiled binary.
        </div>
      </div>
    );
  }

  return (
    <div className="border border-border bg-card flex flex-col" data-testid="lattice-gate">
      <div className="bg-muted px-3 py-2 border-b border-border flex justify-between items-center flex-wrap gap-2">
        <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
          <Binary className="w-4 h-4 text-emerald-400" />
          Deterministic Lattice Gate
        </div>
      </div>

      <div className="p-4 flex flex-col gap-6">
        <div className="bg-emerald-500/5 border border-emerald-500/20 p-3 flex flex-col gap-2">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-400/80 leading-relaxed font-bold uppercase tracking-wider">
              CONSTRAINT REMINDER: Lattice/transistor language is a software gate metaphor; phi and 0.618 are chosen math/policy constants, not physical laws; no amperes, voltage, electrons, physical semiconductor, hardware registers, quantum behavior, consciousness, fitness, or native execution are measured. {result?.disclaimer}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4 bg-black/40 p-4 border border-border">
          <div className="flex flex-col gap-1 w-full max-w-xs" data-testid="lattice-threshold">
            <div className="flex justify-between items-center text-[10px] text-muted-foreground uppercase tracking-wider">
              <span>Gate Threshold (0.01 - 0.99)</span>
              <span className="font-mono text-emerald-400">{threshold.toFixed(4)}</span>
            </div>
            <input
              type="range" min="0.01" max="0.99" step="0.01"
              value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>
          <div className="text-[10px] font-mono text-muted-foreground flex flex-col gap-1">
            <span className="uppercase tracking-wider">Transform Constant (Phi)</span>
            <span className="text-emerald-400">{LATTICE_GATE_PHI}</span>
          </div>
        </div>

        {!integrityTrial && (
          <div className="bg-orange-500/10 border border-orange-500/30 p-2 text-xs text-orange-400 uppercase tracking-widest text-center font-bold">
            FRAY evidence not supplied. Using VM/bicameral evidence only. Run the integrity trial to supply FRAY data.
          </div>
        )}

        {result && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4" data-testid="lattice-mask">
              <Metric label="Decision Mask (Bin)" value={result.decisionMaskBinary} color="text-emerald-400" />
              <Metric label="Decision Mask (Hex)" value={`0x${result.decisionMask.toString(16).padStart(2, '0').toUpperCase()}`} color="text-emerald-400" />
              <Metric label="Receipt Hash" value={result.receiptHash} color="text-emerald-400" />
              <Metric label="Avg Source Score" value={result.averageSourceScore.toFixed(4)} />
              <Metric label="Avg Resonance" value={result.averageResonance.toFixed(4)} />
              <Metric label="Avg Conductance" value={result.averageConductanceIndex.toFixed(4)} />
              <Metric label="Contradictions" value={result.contradictions.filter(c => c.detected).length} color={result.contradictions.some(c => c.detected) ? "text-destructive" : "text-emerald-400"} />
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 flex justify-between">
                <span>Gate Channels</span>
                <span>FRAY Recovery: {result.gates[0]?.evidence.recoverySupplied ? "SUPPLIED" : "NOT SUPPLIED"}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-2" data-testid="lattice-channels">
                {result.gates.map(gate => (
                  <div key={gate.name} className="bg-black/40 border border-border/40 p-3 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs uppercase tracking-widest text-emerald-300">{gate.name}</span>
                      <Badge variant="outline" className={`text-[9px] rounded-none ${gate.state === 'open' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50' : 'bg-muted text-muted-foreground border-border'}`}>
                        {gate.state.toUpperCase()} [{gate.maskBit}]
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-muted-foreground border-b border-border/30 pb-2">
                      <div className="flex flex-col"><span>Source Score</span><span className="text-foreground">{gate.sourceScore.toFixed(4)}</span></div>
                      <div className="flex flex-col"><span>Phase Product</span><span className="text-foreground">{gate.phaseProduct.toFixed(4)}</span></div>
                      <div className="flex flex-col"><span>Nearest Vertex</span><span className="text-foreground">{gate.nearestVertex}</span></div>
                      <div className="flex flex-col"><span>Divergence</span><span className="text-foreground">{gate.divergence.toFixed(4)}</span></div>
                      <div className="flex flex-col"><span>Resonance</span><span className="text-foreground">{gate.resonance.toFixed(4)}</span></div>
                      <div className="flex flex-col"><span>Threshold Margin</span><span className="text-foreground">{gate.gateMargin.toFixed(4)}</span></div>
                      <div className="flex flex-col"><span>Conductance Idx</span><span className="text-foreground">{gate.conductanceIndex.toFixed(4)}</span></div>
                    </div>

                    <div className="flex flex-col gap-1 text-[9px] font-mono text-muted-foreground/70">
                      <div className="uppercase text-muted-foreground mb-1">Evidence State</div>
                      <div className="flex justify-between"><span>Struct:</span> <span>{gate.evidence.leftStructuralActivity.toFixed(4)}</span></div>
                      <div className="flex justify-between"><span>Novelty:</span> <span>{gate.evidence.rightNoveltyActivity.toFixed(4)}</span></div>
                      <div className="flex justify-between"><span>Coherence:</span> <span>{gate.evidence.coherence.toFixed(4)}</span></div>
                      {gate.evidence.recoverySupplied && (
                        <>
                          <div className="flex justify-between"><span>Rec Bit Rate:</span> <span>{gate.evidence.recoveredBitRate?.toFixed(4)}</span></div>
                          <div className="flex justify-between"><span>Obs Bit Error:</span> <span>{gate.evidence.observedTrackBitErrorRate?.toFixed(4)}</span></div>
                          <div className="flex justify-between"><span>Obs Byte Error:</span> <span>{gate.evidence.observedTrackByteErrorRate?.toFixed(4)}</span></div>
                        </>
                      )}
                      <div className="mt-1 pt-1 border-t border-border/20 truncate" title={gate.evidence.sourceFormula}>
                        Eq: {gate.evidence.sourceFormula}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">
                Contradiction Invariants
              </div>
              <div className="flex flex-col gap-2 mt-2" data-testid="lattice-contradictions">
                {result.contradictions.map(c => (
                  <div key={c.code} className={`border p-2 text-xs font-mono flex flex-col md:flex-row md:items-center justify-between gap-2 ${
                    c.detected ? 'bg-destructive/10 border-destructive/50 text-destructive' : 'bg-black/30 border-border/30 text-muted-foreground'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{c.code}</span>
                      <span className="hidden md:inline text-foreground/50">-</span>
                      <span className="text-[10px] text-foreground/70">{c.detail}</span>
                    </div>
                    <Badge variant="outline" className={`text-[9px] rounded-none shrink-0 ${c.detected ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-transparent text-muted-foreground border-muted'}`}>
                      {c.detected ? 'DETECTED' : 'PASSED'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <div className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">
                  Timeline (Latest Cycles)
                </div>
                <div className="bg-black/50 border border-border/50 p-2 font-mono text-[10px] max-h-48 overflow-y-auto" data-testid="lattice-cycles">
                  <table className="w-full text-left">
                    <thead className="text-muted-foreground sticky top-0 bg-black/90">
                      <tr>
                        <th className="pb-1 font-normal">Idx</th>
                        <th className="pb-1 font-normal">Step</th>
                        <th className="pb-1 font-normal">Mask (Bin)</th>
                        <th className="pb-1 font-normal text-right">Avg Res</th>
                      </tr>
                    </thead>
                    <tbody className="text-foreground/80">
                      {result.cycles.map(cycle => (
                        <tr key={cycle.index} className="border-t border-border/20">
                          <td className="py-1 opacity-70">{cycle.index}</td>
                          <td className="py-1 opacity-70">{cycle.traceStep ?? '-'}</td>
                          <td className="py-1 text-emerald-400">{cycle.decisionMaskBinary}</td>
                          <td className="py-1 text-right">{cycle.averageResonance.toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {result.cycles.length === 0 && <div className="p-2 text-muted-foreground italic">No cycles recorded</div>}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">
                  Pseudocode
                </div>
                <div className="bg-black/50 border border-border/50 p-3 font-mono text-[10px] text-emerald-400/70 overflow-x-auto whitespace-pre" data-testid="lattice-pseudocode">
                  <div className="text-emerald-500 font-bold mb-2 pb-2 border-b border-emerald-900/30">
                    STATUS: {result.renderedAvx512Pseudocode.status}
                  </div>
                  {result.renderedAvx512Pseudocode.code}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const FULL_ADDER_TRUTH_TABLE = [
  [0, 0, 0, 0, 0], [0, 0, 1, 1, 0], [0, 1, 0, 1, 0], [0, 1, 1, 0, 1],
  [1, 0, 0, 1, 0], [1, 0, 1, 0, 1], [1, 1, 0, 0, 1], [1, 1, 1, 1, 1],
] as const;

function CircuitLabSection() {
  const [bits, setBits] = useState({ a: 0 as 0 | 1, b: 0 as 0 | 1, cin: 0 as 0 | 1 });
  const [analysis, setAnalysis] = useState<ReturnType<typeof analyzeCircuit> | null>(null);
  const [frame, setFrame] = useState<ReturnType<typeof decodeSilcFrame> | null>(null);
  const run = () => {
    const netlist = buildFullAdderDemo();
    const truthTable = FULL_ADDER_TRUTH_TABLE.map(([a, b, cin, sum, carry]) => ({ inputs: { a, b, cin }, expected: { sum, carry } }));
    const output = analyzeCircuit(netlist, { cycles: [bits], truthTable, mutationSeed: 0x51ac, candidates: 4 });
    const netlistPayload = new TextEncoder().encode('FA:a,b,cin;X,X,A,A,O,R');
    const tracePayload = new TextEncoder().encode(`${bits.a}${bits.b}${bits.cin}>${output.run.cycles[0]!.outputs.sum}${output.run.cycles[0]!.outputs.carry}`);
    const encoded = encodeSilcFrame({ generation: 1, gateCount: netlist.gates.length, traceCount: output.run.cycles.length, netlistPayload, tracePayload });
    setAnalysis(output); setFrame(decodeSilcFrame(encoded));
  };
  return <div className="border border-border bg-card flex flex-col" data-testid="circuit-lab">
    <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider">Deterministic Circuit Lab</div>
    <div className="p-4 flex flex-col gap-4">
      <div className="text-xs text-muted-foreground">Boolean bits only. This model makes no claim of hardware timing, physical equivalence, voltage, propagation delay, or physical registers.</div>
      <div className="flex flex-wrap items-end gap-4 bg-black/40 p-3 border border-border">{(['a', 'b', 'cin'] as const).map(name => <label key={name} className="flex flex-col gap-1 text-[10px] uppercase text-muted-foreground">{name.toUpperCase()} bit<select data-testid={`circuit-${name}`} value={bits[name]} onChange={event => setBits(current => ({ ...current, [name]: Number(event.target.value) as 0 | 1 }))} className="bg-background border border-border p-2 font-mono text-foreground"><option value={0}>0</option><option value={1}>1</option></select></label>)}<Button type="button" data-testid="circuit-run" onClick={run} className="rounded-none tracking-widest font-bold"><Play className="w-4 h-4 mr-2" />RUN CIRCUIT</Button></div>
      {analysis && frame && <div className="flex flex-col gap-4" data-testid="circuit-result">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3"><Metric label="Current sum bit" value={analysis.run.cycles[0]!.outputs.sum} /><Metric label="Current carry bit" value={analysis.run.cycles[0]!.outputs.carry} /><Metric label="Prior-cycle registeredSum bit" value={analysis.run.cycles[0]!.outputs.registeredSum} /><Metric label="Truth score" value={`${analysis.truthTable!.matched}/${analysis.truthTable!.total} (${(analysis.truthTable!.score * 100).toFixed(0)}%)`} /><Metric label="Circuit receipt" value={analysis.run.receipt} /><Metric label="SILC bytes" value={`${SILC_FRAME_BYTES} bytes`} /><Metric label="Checksum" value={`0x${frame.checksum.toString(16).padStart(8, '0')}`} /></div>
        <div className="text-xs border border-border/50 p-3">SILC strict decode round trip: successful · magic SILC · schema {frame.schema} · generation {frame.generation} · gates {frame.gateCount} · traces {frame.traceCount} · exactly {SILC_FRAME_BYTES} bytes.</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{analysis.candidates.map((candidate, index) => <div key={index} className="border border-border/50 p-3 text-xs font-mono"><strong>Seeded candidate {index + 1} ({candidate.seed}): {candidate.accepted ? 'accepted' : 'rejected'}</strong><div>Before score: {candidate.before.matched}/{candidate.before.total} · {candidate.beforeReceipt}</div><div>After score: {candidate.after ? `${candidate.after.matched}/${candidate.after.total} · ${candidate.afterReceipt}` : 'not scored'}</div><div>Evidence: {candidate.reason ?? 'legal mutation validated and scored'}</div></div>)}</div>
        <div className="text-xs text-muted-foreground">Contradictions: {analysis.run.contradictions.map(item => `${item.code}: ${item.detected ? 'detected' : 'clear'}`).join(' · ')}</div>
      </div>}
    </div>
  </div>;
}

function L0SafetySection() {
  const [suite, setSuite] = useState<L0TrialSuite | null>(null);
  return <div className="border border-border bg-card flex flex-col" data-testid="l0-safety"><div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider">L0 Arithmetic and Bitwise Safety</div><div className="p-4 flex flex-col gap-4"><div className="text-xs text-muted-foreground">Evaluates explicit numeric operands only; it does not parse or execute source text.</div><Button type="button" data-testid="l0-run" onClick={() => setSuite(runL0TrialSuite(DEFAULT_L0_TRIAL_CASES))} className="w-fit rounded-none tracking-widest font-bold"><Play className="w-4 h-4 mr-2" />RUN DEFAULT SUITE</Button>{suite && <><div className="text-xs">Suite receipt {suite.receiptHash} · accepted: {String(suite.accepted)}</div><div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{suite.cases.map(item => <div key={item.id} className="border border-border/50 p-3 text-xs flex flex-col gap-1"><strong>{item.id}: {item.operation}({item.evidence.left}, {item.evidence.right}) = {item.result}</strong><div>Classification: {item.classification} · receipt {item.receiptHash} · accepted {String(item.accepted)}</div><div>Policy: {item.policy.evaluationRule}</div>{item.evidence.signed64Result && <div>Signed-64 evidence: left {item.evidence.signed64Left}, right {item.evidence.signed64Right}, result {item.evidence.signed64Result}</div>}<div>Contradictions: {item.contradictions.map(c => `${c.code}: ${c.detected ? 'detected' : 'clear'}`).join(' · ')}</div></div>)}</div></>}</div></div>;
}

function LegendSection() {
  const legends = [
    {
      name: "big-endian DataView framing",
      kind: "Implemented computation",
      desc: "Binary header construction mapped explicitly into an 8-bit memory span."
    },
    {
      name: "strict decode bounds",
      kind: "Implemented computation",
      desc: "Absolute boundary assertions for incoming FRAY payloads preventing buffer over-reads."
    },
    {
      name: "one's-complement checksum",
      kind: "Implemented computation",
      desc: "Summation wrapped continuously within a 32-bit register for integrity."
    },
    {
      name: "seeded PRNG",
      kind: "Implemented computation",
      desc: "Deterministic random bit generation anchored to an initial frame payload hash."
    },
    {
      name: "nested byte/bit corruption loops",
      kind: "Implemented computation",
      desc: "Explicit track mutations systematically flipping discrete bit observations."
    },
    {
      name: "majority-vote equation and threshold",
      kind: "Implemented computation",
      desc: "Signal recovery determining boolean values from track aggregates via Math.floor(tracks/2)+1."
    },
    {
      name: "Uint8Array/DataView/arrays/maps or records used",
      kind: "Implemented computation",
      desc: "Concrete JS memory structures applied to track states and dictionaries."
    },
    {
      name: "FrayFrameError/class concept",
      kind: "Implemented computation",
      desc: "Standard object-oriented error inheritance for parsing failures."
    },
    {
      name: "DataRigidbody and BitSuit object composition",
      kind: "Metaphor-only",
      desc: "Metadata wrappers styling bytes as physics bodies without underlying mechanics."
    },
    {
      name: "regex antibody classifier",
      kind: "Deterministic heuristic",
      desc: "Static pattern matching bounding known indicators."
    },
    {
      name: "quarantine threshold",
      kind: "Deterministic heuristic",
      desc: "Integer scale assigning danger scores to matched signatures."
    },
    {
      name: "explicit-call bundled CVE playback",
      kind: "Implemented computation",
      desc: "Attributed local snapshot records advance only when the user explicitly calls playback; no timer or live retrieval exists."
    },
    {
      name: "SILC codec and checksum",
      kind: "Implemented computation",
      desc: "A fixed 512-byte SILC frame uses strict decode validation and FNV-1a checksum verification."
    },
    {
      name: "synchronous logic cycles and truth-table scoring",
      kind: "Implemented computation",
      desc: "Boolean bits are evaluated per bounded cycle, registers latch together, and all eight full-adder rows are scored."
    },
    {
      name: "seeded candidate mutation",
      kind: "Implemented computation",
      desc: "A deterministic seed produces bounded legal netlist candidates with before/after truth-score evidence."
    },
    {
      name: "attributed bundled CVE metadata",
      kind: "Implemented computation",
      desc: "Allowlisted advisory attribution, dates, freshness, and inert classifier metadata are local snapshot data, not remote evidence."
    },
    {
      name: "Java-compatible power edge classification",
      kind: "Implemented computation",
      desc: "Explicit numeric power operands classify NaN domains, overflow, and zero-to-negative boundaries."
    },
    {
      name: "signed-64 BigInt narrowing",
      kind: "Implemented computation",
      desc: "Bitwise operands are truncated and narrowed with BigInt.asIntN(64), with exact decimal-string results."
    },
    {
      name: "Shannon byte entropy",
      kind: "Implemented computation",
      desc: "A mathematical sum of probability logarithms over execution bytecode."
    },
    {
      name: "coherence equation clamp(1-|L-R|/2)",
      kind: "Deterministic heuristic",
      desc: "Arbitrary metric bounding left and right lane divergence."
    },
    {
      name: "VM-trace sampling loop",
      kind: "Implemented computation",
      desc: "Proportional reduction mapped into maximum 64 discrete visual events."
    },
    {
      name: "Eureka threshold",
      kind: "Deterministic heuristic",
      desc: "Fixed boolean flag activated when both lanes exceed 0.70."
    },
    {
      name: "performance.now timing",
      kind: "Measured telemetry",
      desc: "High-resolution millisecond clocks captured per-action in the browser."
    },
    {
      name: "phi lattice-distance transform",
      kind: "Deterministic heuristic",
      desc: "Mathematical multiplication by 1.618... mapped to nearest integer boundaries, not a physical wave."
    },
    {
      name: "eight-bit decision mask",
      kind: "Implemented computation",
      desc: "Deterministic bitwise OR operation aggregating eight independent threshold checks."
    },
    {
      name: "dimensionless conductance equation",
      kind: "Deterministic heuristic",
      desc: "Arbitrary ratio bounding margin-above-threshold to [0, 1]. No electrical properties."
    },
    {
      name: "semantic receipt hashing",
      kind: "Implemented computation",
      desc: "FNV-1a checksum of the explicit JSON object state without mutable time or identity."
    },
    {
      name: "contradiction invariants",
      kind: "Implemented computation",
      desc: "Strict boolean checks verifying that derived metrics match across dependent properties."
    },
    {
      name: "rendered AVX-512 pseudocode",
      kind: "Metaphor-only",
      desc: "Static string literal template. Not compiled, not executed, and asserts no functional equivalence."
    }
  ];


  return (
    <div className="border border-border bg-card flex flex-col" data-testid="mechanism-legend">
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {legends.map((l, i) => (
          <div key={i} className="bg-black/30 border border-border/30 p-3 flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2 sm:gap-4">
              <span className="font-bold text-sm text-foreground capitalize">{l.name}</span>
              <Badge variant="outline" className="text-[9px] rounded-none bg-muted text-muted-foreground whitespace-nowrap text-right">
                {l.kind.toUpperCase()}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {l.desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MatterLab() {
  const [latestIntegrityTrial, setLatestIntegrityTrial] = useState<IntegrityTrial | null>(null);

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto pb-10" data-testid="matter-lab">
      <div className="flex-none flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-border pb-4 gap-2">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <Microscope className="w-5 h-5 text-primary" />
          Data Matter Lab
        </h2>
        <div className="text-xs text-muted-foreground uppercase tracking-widest">
          Evidence-First Executable-Intelligence Workbench
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <Binary className="w-5 h-5 text-sky-400" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-sky-400">Deterministic Circuit Lab</h3>
          </div>
          <CircuitLabSection />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <Bug className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-orange-500">Source-attributed CVE Feed</h3>
          </div>
          <SourceAttributedCveFeedSection />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <Binary className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-amber-400">L0 Arithmetic and Bitwise Safety</h3>
          </div>
          <L0SafetySection />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <Binary className="w-5 h-5 text-secondary" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-secondary">FRAY Binary Integrity</h3>
          </div>
          <IntegritySection onTrialChange={setLatestIntegrityTrial} />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <BrainCircuit className="w-5 h-5 text-violet-400" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-violet-400">Deterministic Bicameral Monitoring</h3>
          </div>
          <BicameralSection />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <Binary className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-emerald-400">Deterministic Lattice Gate</h3>
          </div>
          <LatticeGateSection integrityTrial={latestIntegrityTrial} />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <HelpCircle className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-muted-foreground">Legend of Mechanisms</h3>
          </div>
          <LegendSection />
        </section>
      </div>
    </div>
  );
}
