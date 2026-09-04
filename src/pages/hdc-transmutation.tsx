import { useMemo, useState } from 'react';
import { useKernelStore } from '@/hooks/use-kernel';
import { Boxes, Vote, GitBranch, Table2, RefreshCw } from 'lucide-react';

const DOMAINS = [
  { name: 'Registrar', color: 'text-secondary', border: 'border-secondary/60', glow: 'rgba(0,204,204,0.3)' },
  { name: 'Legal', color: 'text-fuchsia-400', border: 'border-fuchsia-500/60', glow: 'rgba(232,121,249,0.3)' },
  { name: 'Logistics', color: 'text-primary', border: 'border-primary/60', glow: 'rgba(255,176,0,0.3)' },
  { name: 'Pulse', color: 'text-emerald-400', border: 'border-emerald-500/60', glow: 'rgba(52,211,153,0.3)' },
  { name: 'Arena', color: 'text-destructive', border: 'border-destructive/60', glow: 'rgba(239,68,68,0.3)' },
];

const PIPELINE = [
  { stage: 'Raw CVE text', note: 'Unstructured advisory input' },
  { stage: 'BabelKnowledgeTransmuter', note: 'Schema parsing · O(1) entity map' },
  { stage: 'BinaryKnowledgeEncoder', note: 'Opcodes 0x10 / 0x50 / 0x58 / 0x5A / 0xFF' },
  { stage: 'MultiTargetCodeGenerator', note: '6 emission targets' },
  { stage: 'MachineNativeStorage', note: 'RAM · O(1) retrieval' },
];

const ENTITY_MAP = [
  { entity: 'CVE_ID', opcode: '0x10', mnem: 'ENTITY' },
  { entity: 'payload', opcode: '0x50', mnem: 'FORMULA' },
  { entity: 'technique', opcode: '0x50', mnem: 'FORMULA' },
  { entity: 'CVSS', opcode: 'formula', mnem: 'SCORE' },
  { entity: 'SIMULATE_infection', opcode: '0x5A', mnem: 'SIMULATE' },
];

const DIM = 20;
const NUM_VECTORS = 5;
const NOISE = 0.35;

type VoteResult = {
  original: number[];
  noisy: number[][];
  reconstructed: number[];
  accuracy: number;
};

function runMajorityVote(): VoteResult {
  // Original binary hypervector (0/1)
  const original = Array.from({ length: DIM }, () => (Math.random() < 0.5 ? 0 : 1));
  // Produce NUM_VECTORS noisy copies with NOISE bit-flip probability
  const noisy: number[][] = Array.from({ length: NUM_VECTORS }, () =>
    original.map((bit) => (Math.random() < NOISE ? 1 - bit : bit)),
  );
  // Majority vote: accumulate +1/-1, threshold at 0
  const reconstructed = original.map((_, i) => {
    const acc = noisy.reduce((sum, v) => sum + (v[i] === 1 ? 1 : -1), 0);
    return acc >= 0 ? 1 : 0;
  });
  const matches = reconstructed.filter((b, i) => b === original[i]).length;
  const accuracy = Number(((matches / DIM) * 100).toFixed(1));
  return { original, noisy, reconstructed, accuracy };
}

function Bits({ bits, highlight }: { bits: number[]; highlight?: number[] }) {
  return (
    <div className="flex flex-wrap gap-1 font-mono">
      {bits.map((b, i) => {
        const mismatch = highlight && highlight[i] !== b;
        return (
          <span
            key={i}
            className={`w-5 h-5 flex items-center justify-center text-[10px] border ${
              mismatch
                ? 'border-destructive/60 bg-destructive/20 text-destructive'
                : b === 1
                  ? 'border-secondary/50 bg-secondary/10 text-secondary'
                  : 'border-border/40 bg-black text-muted-foreground'
            }`}
          >
            {b}
          </span>
        );
      })}
    </div>
  );
}

export default function HdcTransmutation() {
  const activeRun = useKernelStore((state) => state.activeRun);
  const [seed, setSeed] = useState(0);
  const vote = useMemo(() => runMajorityVote(), [seed]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <Boxes className="w-5 h-5 text-accent" />
          HDC Transmutation Map
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Hyperdimensional Computing {activeRun ? `· run ${activeRun.inputHash}` : ''}
        </span>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-y-auto">
        {/* Concept Map */}
        <section className="lg:col-span-5 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider">
            Concept Map — Hypervectors
          </div>
          <div className="p-4 grid grid-cols-2 gap-3 bg-[#050508]">
            {DOMAINS.map((d) => (
              <div
                key={d.name}
                className={`border ${d.border} bg-black p-3 flex flex-col`}
                style={{ boxShadow: `0 0 12px ${d.glow}` }}
              >
                <span className={`text-sm font-bold uppercase tracking-wider ${d.color}`}>
                  {d.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono mt-1">
                  dim={10000} · sparse
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Majority Vote */}
        <section className="lg:col-span-7 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Vote className="w-4 h-4 text-secondary" /> Majority-Vote Convergence (simulation)
            </span>
            <button
              onClick={() => setSeed((s) => s + 1)}
              className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 uppercase tracking-wider"
            >
              <RefreshCw className="w-3 h-3" /> Resample
            </button>
          </div>
          <div className="p-4 bg-[#050508] space-y-4 text-xs">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest">
              {NUM_VECTORS} vectors · {DIM} bits · {Math.round(NOISE * 100)}% injected noise —
              simulated, not measured
            </div>
            <div>
              <div className="text-secondary mb-1">Original</div>
              <Bits bits={vote.original} />
            </div>
            <div>
              <div className="text-muted-foreground mb-1">Noisy copies</div>
              <div className="space-y-1">
                {vote.noisy.map((v, i) => (
                  <Bits key={i} bits={v} highlight={vote.original} />
                ))}
              </div>
            </div>
            <div>
              <div className="text-primary mb-1">Reconstructed (majority)</div>
              <Bits bits={vote.reconstructed} highlight={vote.original} />
            </div>
            <div className="border-t border-border/50 pt-2 flex items-center justify-between">
              <span className="text-muted-foreground uppercase tracking-widest text-[10px]">
                Reconstruction accuracy
              </span>
              <span
                className={`text-lg font-bold ${
                  vote.accuracy >= 99 ? 'text-emerald-400' : 'text-primary'
                }`}
              >
                {vote.accuracy}%
              </span>
            </div>
          </div>
        </section>

        {/* Transmutation Pipeline */}
        <section className="lg:col-span-7 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-accent" /> Transmutation Pipeline
          </div>
          <div className="p-4 bg-[#050508] flex flex-col gap-2">
            {PIPELINE.map((p, i) => (
              <div key={p.stage} className="flex items-center gap-2">
                <div className="flex-1 border border-accent/40 bg-black px-3 py-2 relative overflow-hidden">
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-accent/10 to-transparent animate-pulse pointer-events-none"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                  <div className="relative">
                    <span className="text-sm font-bold text-accent">{p.stage}</span>
                    <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {p.note}
                    </div>
                  </div>
                </div>
                {i < PIPELINE.length - 1 && <span className="text-accent">↓</span>}
              </div>
            ))}
          </div>
        </section>

        {/* Entity Map */}
        <section className="lg:col-span-5 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Table2 className="w-4 h-4 text-primary" /> Entity Map
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-muted-foreground uppercase tracking-wider border-b border-border/50">
                  <th className="text-left px-3 py-2">Entity</th>
                  <th className="text-left px-3 py-2">Opcode</th>
                  <th className="text-left px-3 py-2">Mnemonic</th>
                </tr>
              </thead>
              <tbody>
                {ENTITY_MAP.map((e) => (
                  <tr key={e.entity} className="border-b border-border/30">
                    <td className="px-3 py-1.5 text-foreground">{e.entity}</td>
                    <td className="px-3 py-1.5 text-secondary">{e.opcode}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{e.mnem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
