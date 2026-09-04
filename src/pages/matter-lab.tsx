import { useState, useEffect, useMemo } from 'react';
import { useKernelStore } from '@/hooks/use-kernel';
import { cn } from '@/lib/utils';
import { 
  runIntegrityTrial, 
  type IntegrityTrial,
  type DataRigidbody
} from '@/lib/integrity';
import { 
  CVE_EVIDENCE_FIXTURES, 
  scanCveEvidenceRecords,
  ANTIBODY_PLAYBACK_METADATA
} from '@/lib/antibody';
import { 
  analyzeBicameralRun
} from '@/lib/bicameral';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Microscope, Database, BrainCircuit, Binary, Bug, PlayCircle, PauseCircle, SkipForward, HelpCircle, Play, Info } from 'lucide-react';

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

function IntegritySection() {
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

function CveAntibodySection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const results = useMemo(() => scanCveEvidenceRecords(CVE_EVIDENCE_FIXTURES), []);

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % CVE_EVIDENCE_FIXTURES.length);
    }, ANTIBODY_PLAYBACK_METADATA.intervalMs);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const currentFixture = CVE_EVIDENCE_FIXTURES[currentIndex]!;
  const currentResult = results[currentIndex]!;

  return (
    <div className="border border-border bg-card flex flex-col" data-testid="antibody-feed">
      <div className="bg-muted px-3 py-2 border-b border-border flex justify-between items-center">
        <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
          <Bug className="w-4 h-4 text-orange-500" />
          Inert Evidence Feed
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] bg-orange-500/10 text-orange-500 rounded-none border-orange-500/30">
            SUPPLIED FIXTURES ONLY
          </Badge>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border/50 pb-4 gap-4">
          <div className="flex flex-col gap-1">
            <h4 className="text-lg font-bold text-foreground">{currentFixture.name} ({currentFixture.id})</h4>
            <div className="text-xs text-muted-foreground font-mono flex flex-wrap items-center gap-2">
              <span>CVSS: {currentFixture.cvss}</span> 
              <span className="hidden sm:inline">|</span> 
              <span>Technique: {currentFixture.technique}</span> 
              <span className="hidden sm:inline">|</span>
              <span className="text-orange-400">Not a live network feed</span>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-auto">
            <Button 
              data-testid="antibody-advance"
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentIndex((prev) => (prev + 1) % CVE_EVIDENCE_FIXTURES.length)}
              className="rounded-none tracking-widest text-[10px] font-bold"
            >
              <SkipForward className="w-3 h-3 mr-2" /> ADVANCE
            </Button>
            <Button 
              data-testid="antibody-auto"
              variant={isAutoPlaying ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setIsAutoPlaying(!isAutoPlaying)}
              className={`rounded-none tracking-widest text-[10px] font-bold ${isAutoPlaying ? 'bg-orange-500 text-black hover:bg-orange-600' : ''}`}
            >
              {isAutoPlaying ? <PauseCircle className="w-3 h-3 mr-2" /> : <PlayCircle className="w-3 h-3 mr-2" />} 
              AUTO PLAY
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Inert Indicator Evidence</div>
            <div className="bg-black/50 border border-border p-4 font-mono text-xs text-foreground/80 break-all min-h-[120px] flex items-center">
              {currentFixture.inertIndicatorText}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Antibody Classification Result</div>
            <div className={`border p-4 flex flex-col gap-3 min-h-[120px] justify-center ${
              currentResult.status === 'quarantined' ? 'bg-destructive/10 border-destructive/50' : 'bg-green-500/10 border-green-500/50'
            }`}>
              <div className="flex justify-between items-start">
                <span className={`text-xl font-bold uppercase tracking-widest ${
                  currentResult.status === 'quarantined' ? 'text-destructive' : 'text-green-500'
                }`}>
                  {currentResult.status}
                </span>
                <span className="text-sm font-mono text-muted-foreground">Score: {currentResult.riskScore}</span>
              </div>

              {currentResult.matchedAntibody ? (
                <div className="flex flex-col gap-1 text-xs">
                  <div><strong className="text-muted-foreground">Antibody:</strong> {currentResult.matchedAntibody.id} ({currentResult.matchedAntibody.category})</div>
                  <div><strong className="text-muted-foreground">Threshold/Tolerance:</strong> {currentResult.matchedAntibody.toleranceThreshold}</div>
                  <div><strong className="text-muted-foreground">Response:</strong> {currentResult.matchedAntibody.quarantineResponse}</div>
                  {currentResult.locator && (
                    <div><strong className="text-muted-foreground">Locator:</strong> line:{currentResult.locator.line} col:{currentResult.locator.column} offset:{currentResult.locator.offset}</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">No definitive signature matched. Evidence classified as safe.</div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-orange-500/5 border border-orange-500/20 p-3 flex items-start gap-3">
          <Info className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-orange-500/80 leading-relaxed">
            <strong>SECURITY NOTE:</strong> The evidence shown above is composed of static text fixtures. It is never fetched from a network, never parsed as executable code, and never interpolated into system commands. The classifiers operate strictly via deterministic regular expressions over plain text.
          </div>
        </div>
      </div>
    </div>
  );
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
      name: "timer-based fixture playback as measured UI behavior but not live data",
      kind: "Measured telemetry",
      desc: "React tick intervals automating local inert string progression (with supplied fixtures)."
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
            <Binary className="w-5 h-5 text-secondary" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-secondary">FRAY Binary Integrity</h3>
          </div>
          <IntegritySection />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-border/50 pb-2">
            <Bug className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-orange-500">Inert CVE Antibody Classification</h3>
          </div>
          <CveAntibodySection />
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
            <HelpCircle className="w-5 h-5 text-muted-foreground" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-muted-foreground">Legend of Mechanisms</h3>
          </div>
          <LegendSection />
        </section>
      </div>
    </div>
  );
}
