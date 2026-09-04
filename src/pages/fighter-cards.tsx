import { useRef, useState } from 'react';
import { useKernelStore } from '@/hooks/use-kernel';
import type { AgentReceipt, KernelRun, RegisterSnapshot } from '@/lib/kernel';
import { cn } from '@/lib/utils';
import { Swords, Zap, Shield, Gauge, Crosshair, Heart, Lock } from 'lucide-react';

type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary';

type Stat = { key: string; label: string; value: number; color: string; icon: typeof Zap };

type FighterSpec = {
  agentId: string;
  agentName: string;
  nickname: string;
  role: string;
  rarity: Rarity;
};

const FIGHTERS: FighterSpec[] = [
  { agentId: 'loop-scan', agentName: 'LOOP_SCAN', nickname: 'The Scanner', role: 'Bounded structure filter', rarity: 'Rare' },
  { agentId: 'copy-try', agentName: 'COPY_TRY', nickname: 'The Sandboxer', role: 'Static copy & rule comparison', rarity: 'Epic' },
  { agentId: 'method-probe', agentName: 'METHOD_PROBE', nickname: 'The Classifier', role: 'Numeric edge classifier', rarity: 'Rare' },
  { agentId: 'threat-gate', agentName: 'THREAT_GATE', nickname: 'The Gatekeeper', role: 'L0 payload & capability guard', rarity: 'Legendary' },
  { agentId: 'mutation', agentName: 'MUTATION', nickname: 'The Promoter', role: 'Evidence-gated promotion', rarity: 'Epic' },
];

const RARITY_STYLE: Record<Rarity, { text: string; border: string; glow: string; badge: string }> = {
  Common: { text: 'text-zinc-300', border: 'border-zinc-600', glow: '', badge: 'bg-zinc-700/40 text-zinc-200 border-zinc-500' },
  Rare: { text: 'text-cyan-300', border: 'border-cyan-500/60', glow: 'shadow-[0_0_25px_-5px_rgba(34,211,238,0.5)]', badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/60' },
  Epic: { text: 'text-fuchsia-300', border: 'border-fuchsia-500/60', glow: 'shadow-[0_0_28px_-4px_rgba(217,70,239,0.55)]', badge: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/60' },
  Legendary: { text: 'text-amber-300', border: 'border-amber-400/70', glow: 'shadow-[0_0_36px_-2px_rgba(251,191,36,0.7)]', badge: 'bg-amber-400/15 text-amber-300 border-amber-400/70' },
};

const STATUS_STYLE: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/50',
  blocked: 'bg-red-500/15 text-red-300 border-red-500/50',
  detected: 'bg-amber-500/15 text-amber-300 border-amber-500/50',
  unsupported: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/50',
};

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function computeStats(spec: FighterSpec, run: KernelRun): Stat[] {
  const receipt = run.agents.find((a) => a.id === spec.agentId);
  const criticalCount = run.findings.filter((f) => f.severity === 'critical').length;
  const rcx = run.registers.find((r) => r.register === 'RCX');
  const loopCount = typeof rcx?.value === 'number' ? rcx.value : Number(rcx?.value ?? 0);
  const rdx = run.registers.find((r) => r.register === 'RDX');
  const durationMs = receipt?.durationMs ?? 0;
  const findingsForAgent = run.findings.length;

  const mk = (key: string, label: string, value: number, color: string, icon: typeof Zap): Stat => ({
    key, label, value: clamp(value), color, icon,
  });

  switch (spec.agentId) {
    case 'loop-scan':
      return [
        mk('power', 'Power', loopCount * 10, 'bg-red-400', Zap),
        mk('speed', 'Speed', 100 - durationMs, 'bg-cyan-400', Gauge),
        mk('defense', 'Defense', findingsForAgent * 20, 'bg-emerald-400', Shield),
        mk('technique', 'Technique', run.findings.filter((f) => f.locator && f.locator.includes('line:')).length * 25, 'bg-fuchsia-400', Crosshair),
        mk('stamina', 'Stamina', 100, 'bg-amber-400', Heart),
      ];
    case 'copy-try':
      return [
        mk('power', 'Power', criticalCount * 25, 'bg-red-400', Zap),
        mk('speed', 'Speed', 95, 'bg-cyan-400', Gauge),
        mk('defense', 'Defense', receipt?.status === 'success' ? 100 : 0, 'bg-emerald-400', Shield),
        mk('technique', 'Technique', 85, 'bg-fuchsia-400', Crosshair),
        mk('stamina', 'Stamina', 90, 'bg-amber-400', Heart),
      ];
    case 'method-probe':
      return [
        mk('power', 'Power', rdx?.value === 'NaN' ? 99 : 60, 'bg-red-400', Zap),
        mk('speed', 'Speed', 98, 'bg-cyan-400', Gauge),
        mk('defense', 'Defense', 92, 'bg-emerald-400', Shield),
        mk('technique', 'Technique', 99, 'bg-fuchsia-400', Crosshair),
        mk('stamina', 'Stamina', 88, 'bg-amber-400', Heart),
      ];
    case 'threat-gate':
      return [
        mk('power', 'Power', 99, 'bg-red-400', Zap),
        mk('speed', 'Speed', 99, 'bg-cyan-400', Gauge),
        mk('defense', 'Defense', criticalCount > 0 ? 100 : 50, 'bg-emerald-400', Shield),
        mk('technique', 'Technique', 95, 'bg-fuchsia-400', Crosshair),
        mk('stamina', 'Stamina', 99, 'bg-amber-400', Heart),
      ];
    case 'mutation': {
      const delta = run.promotion === 'promoted' ? 100 : 40;
      return [
        mk('power', 'Power', run.promotion === 'promoted' ? 100 : 0, 'bg-red-400', Zap),
        mk('speed', 'Speed', 85, 'bg-cyan-400', Gauge),
        mk('defense', 'Defense', 88, 'bg-emerald-400', Shield),
        mk('technique', 'Technique', delta, 'bg-fuchsia-400', Crosshair),
        mk('stamina', 'Stamina', 92, 'bg-amber-400', Heart),
      ];
    }
    default:
      return [];
  }
}

function FighterCard({ spec, run }: { spec: FighterSpec; run: KernelRun | null }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [shimmer, setShimmer] = useState({ x: 50, y: 50 });
  const [flipped, setFlipped] = useState(false);

  const rarityStyle = RARITY_STYLE[spec.rarity];
  const receipt: AgentReceipt | undefined = run?.agents.find((a) => a.id === spec.agentId);
  const stats = run ? computeStats(spec, run) : [];
  const registers: RegisterSnapshot[] = run?.registers.filter((r) => r.agentId === spec.agentId) ?? [];
  const standby = !run;

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setTilt({ ry: (px - 0.5) * 18, rx: -(py - 0.5) * 18 });
    setShimmer({ x: px * 100, y: py * 100 });
  };

  const handleLeave = () => {
    setTilt({ rx: 0, ry: 0 });
    setShimmer({ x: 50, y: 50 });
  };

  return (
    <div
      className="[perspective:1200px]"
      data-testid={`fighter-card-${spec.agentId}`}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={() => !standby && setFlipped((f) => !f)}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transformStyle: 'preserve-3d',
          transition: tilt.rx === 0 && tilt.ry === 0 ? 'transform 0.4s ease' : 'transform 0.05s linear',
        }}
        className={cn(
          'relative h-[420px] w-full cursor-pointer border bg-[#08080c]',
          rarityStyle.border,
          !standby && rarityStyle.glow,
          standby && 'opacity-60',
        )}
      >
        {/* Holographic foil shimmer */}
        {!standby && (
          <div
            className="pointer-events-none absolute inset-0 z-20 mix-blend-color-dodge opacity-40"
            style={{
              background: `radial-gradient(circle at ${shimmer.x}% ${shimmer.y}%, rgba(255,255,255,0.35), transparent 45%), linear-gradient(115deg, rgba(0,255,255,0.12), rgba(255,0,200,0.12), rgba(255,220,0,0.12))`,
            }}
          />
        )}

        {/* FRONT */}
        <div className={cn('absolute inset-0 flex flex-col p-4', flipped && 'hidden')} style={{ transform: 'translateZ(1px)' }}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{spec.agentName}</div>
              <div className={cn('text-lg font-bold uppercase tracking-tight', rarityStyle.text)}>{spec.nickname}</div>
            </div>
            <span className={cn('border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', rarityStyle.badge)}>
              {spec.rarity}
            </span>
          </div>

          <div className="mt-1 text-[11px] text-muted-foreground">{spec.role}</div>

          <div className="mt-3 flex items-center gap-2">
            {receipt ? (
              <span className={cn('border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', STATUS_STYLE[receipt.status])}>
                {receipt.status}
              </span>
            ) : (
              <span className="border border-zinc-600 bg-zinc-700/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
                standby
              </span>
            )}
          </div>

          {/* Sigil */}
          <div className="my-4 flex flex-1 items-center justify-center">
            <Swords className={cn('h-20 w-20', standby ? 'text-zinc-700' : rarityStyle.text)} strokeWidth={1.2} />
          </div>

          {/* Stat bars */}
          <div className="space-y-1.5">
            {(standby
              ? [{ key: 'p', label: 'Power', value: 0, color: 'bg-zinc-600', icon: Zap }, { key: 's', label: 'Speed', value: 0, color: 'bg-zinc-600', icon: Gauge }, { key: 'd', label: 'Defense', value: 0, color: 'bg-zinc-600', icon: Shield }, { key: 't', label: 'Technique', value: 0, color: 'bg-zinc-600', icon: Crosshair }, { key: 'st', label: 'Stamina', value: 0, color: 'bg-zinc-600', icon: Heart }]
              : stats
            ).map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  <span className="w-16 text-[9px] font-mono uppercase text-muted-foreground">{s.label}</span>
                  <div className="h-2 flex-1 bg-black/50">
                    <div className={cn('h-full', s.color)} style={{ width: `${s.value}%` }} />
                  </div>
                  <span className="w-6 text-right text-[9px] font-mono text-muted-foreground">{s.value}</span>
                </div>
              );
            })}
          </div>

          {standby && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#050508]/70">
              <Lock className="mb-2 h-6 w-6 text-zinc-500" />
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">Run a trial first</span>
            </div>
          )}
        </div>

        {/* BACK */}
        {receipt && run && (
          <div className={cn('absolute inset-0 flex flex-col p-4', !flipped && 'hidden')} style={{ transform: 'translateZ(1px)' }}>
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Register Snapshot</div>
            <div className="mt-2 flex-1 space-y-1 overflow-auto">
              {registers.length === 0 && <div className="text-[11px] text-muted-foreground">No dedicated registers.</div>}
              {registers.map((r) => (
                <div key={r.register} className="border border-border/60 bg-black/40 px-2 py-1">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className={rarityStyle.text}>{r.register}</span>
                    <span className="text-foreground">{String(r.value)}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground">{r.meaning}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-1 border-t border-border pt-2 text-[10px] font-mono text-muted-foreground">
              <div>duration: <span className="text-cyan-300">{receipt.durationMs}ms</span></div>
              <div className="text-[10px] leading-tight text-foreground/80">{receipt.summary}</div>
              <div className="truncate">receipt: <span className="text-amber-300">{run.inputHash}</span></div>
            </div>
            <div className="mt-1 text-center text-[9px] uppercase tracking-widest text-muted-foreground">click to flip</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FighterCards() {
  const { activeRun } = useKernelStore();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex-none">
        <h2 className="flex items-center gap-2 text-xl font-bold uppercase tracking-tight">
          <Swords className="h-5 w-5 text-primary" />
          Fighter Cards <span className="text-muted-foreground">/ Agent Roster</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Five bounded agents rendered as holographic trading cards. Move your mouse to tilt; click to flip.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {FIGHTERS.map((spec) => (
          <FighterCard key={spec.agentId} spec={spec} run={activeRun} />
        ))}
      </div>

      <div className="border border-border bg-card/50 p-3 text-center text-xs text-muted-foreground">
        Run a trial in the Workbench to see live stats update in real time.
      </div>
    </div>
  );
}
