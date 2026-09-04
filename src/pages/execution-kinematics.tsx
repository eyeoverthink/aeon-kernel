import { useKernelStore } from '@/hooks/use-kernel';
import { Atom, Activity, AlertOctagon, Cpu } from 'lucide-react';

type Stage = {
  index: number;
  v1: number;
  v2: number;
  keTotal: number;
  canvasIndex: number;
};

// Deterministic multi-body collision physics, mirroring lib/kernel collisionEnergy().
function computeStages(): Stage[] {
  const m1 = 12;
  const m2 = 8;
  const e1 = 0.8;
  const e2 = 0.9;
  let v1 = 45;
  let v2 = -30;
  let x1 = 0; // tracked for canvas index derivation
  const stages: Stage[] = [];
  for (let i = 0; i < 4; i += 1) {
    const nextV1 = ((m1 - m2 * e1) * v1 + (1 + e1) * m2 * v2) / (m1 + m2);
    const nextV2 = ((1 + e2) * m1 * v1 + (m2 - m1 * e2) * v2) / (m1 + m2);
    v1 = nextV1;
    v2 = nextV2;
    x1 += v1;
    const keTotal = Number((0.5 * m1 * v1 ** 2 + 0.5 * m2 * v2 ** 2).toFixed(3));
    const canvasIndex = Math.abs(Math.round(x1 * v2 + keTotal)) % 10000;
    stages.push({
      index: i + 1,
      v1: Number(v1.toFixed(3)),
      v2: Number(v2.toFixed(3)),
      keTotal,
      canvasIndex,
    });
  }
  return stages;
}

// XMM view values from the kernel's finding set.
const KE_RESULT = 120; // 0.5 * 15 * 4^2  (J)
const SCALE_FT = 3.28084;
const CONST_HALF = 0.5;
const TO_FEET = Number((KE_RESULT * SCALE_FT).toFixed(2)); // mislabeled unit conversion

export default function ExecutionKinematics() {
  const activeRun = useKernelStore((state) => state.activeRun);
  const stages = computeStages();
  const maxKe = Math.max(...stages.map((s) => s.keTotal), 1);

  // Pull collision telemetry if present in the active run.
  const collisionTelemetry =
    activeRun?.telemetry.filter((t) => t.step.startsWith('COLLISION_')) ?? [];

  const unitFinding = activeRun?.findings.find((f) => f.category === 'Unit semantics');

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <Atom className="w-5 h-5 text-secondary" />
          Low-Level Execution Kinematics
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {activeRun ? `run ${activeRun.inputHash}` : 'simulated (no active run)'}
        </span>
      </div>

      {/* Unit semantics warning */}
      <div className="flex-none border border-destructive/50 bg-destructive/10 px-4 py-3 flex items-start gap-3">
        <AlertOctagon className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-destructive">
            Unit Semantics Violation
          </div>
          <p className="text-sm text-destructive/90 mt-1">
            {unitFinding?.message ??
              'Meters-to-feet conversion cannot consume a kinetic-energy result measured in joules.'}
          </p>
          <p className="text-[10px] font-mono text-destructive/70 mt-1">
            FORMULA_EXECUTE(KE_CALC) → UNIT_CONVERT(TO_FEET)
          </p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-y-auto">
        {/* Collision Engine */}
        <section className="lg:col-span-7 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" /> Collision Engine
          </div>
          <div className="p-4 bg-[#050508] space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-primary/40 bg-black p-3">
                <div className="text-xs font-bold text-primary uppercase tracking-wider">
                  Attacker
                </div>
                <div className="text-[11px] font-mono text-muted-foreground mt-1">
                  mass = 12 · v₀ = 45 · e = 0.8
                </div>
              </div>
              <div className="border border-secondary/40 bg-black p-3">
                <div className="text-xs font-bold text-secondary uppercase tracking-wider">
                  Victim
                </div>
                <div className="text-[11px] font-mono text-muted-foreground mt-1">
                  mass = 8 · v₀ = -30 · e = 0.9
                </div>
              </div>
            </div>

            {/* KE energy timeline bars */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                Kinetic Energy Timeline (KE = ½·m·v²)
              </div>
              <div className="flex items-end gap-3 h-40">
                {stages.map((s) => (
                  <div key={s.index} className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-[10px] font-mono text-primary mb-1">{s.keTotal}J</span>
                    <div
                      className="w-full bg-gradient-to-t from-secondary/30 to-secondary shadow-[0_0_12px_rgba(0,204,204,0.4)]"
                      style={{ height: `${(s.keTotal / maxKe) * 100}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground mt-1">S{s.index}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* XMM Register View */}
        <section className="lg:col-span-5 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Cpu className="w-4 h-4 text-secondary" /> XMM Register View
          </div>
          <div className="p-4 bg-[#050508] space-y-2 font-mono text-sm">
            <div className="flex justify-between border border-border/50 bg-black px-3 py-2">
              <span className="text-secondary">XMM0</span>
              <span>{KE_RESULT} J <span className="text-muted-foreground text-[10px]">KE_result</span></span>
            </div>
            <div className="flex justify-between border border-border/50 bg-black px-3 py-2">
              <span className="text-secondary">XMM1</span>
              <span>{SCALE_FT} <span className="text-muted-foreground text-[10px]">scale_ft</span></span>
            </div>
            <div className="flex justify-between border border-border/50 bg-black px-3 py-2">
              <span className="text-secondary">XMM2</span>
              <span>{CONST_HALF} <span className="text-muted-foreground text-[10px]">const_half</span></span>
            </div>
            <div className="flex justify-between border border-destructive/50 bg-destructive/10 px-3 py-2">
              <span className="text-destructive">TO_FEET</span>
              <span className="text-destructive">
                {TO_FEET} ft <span className="text-[10px]">⚠ unit mismatch</span>
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground pt-1 leading-relaxed">
              {KE_RESULT}J × {SCALE_FT} = {TO_FEET} — a joule result piped into a
              meters-to-feet scale. Numerically defined, semantically invalid.
            </p>
          </div>
        </section>

        {/* Stage Breakdown */}
        <section className="lg:col-span-12 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider">
            Stage Breakdown
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-muted-foreground uppercase tracking-wider border-b border-border/50">
                  <th className="text-left px-3 py-2">Stage</th>
                  <th className="text-left px-3 py-2">v1_next</th>
                  <th className="text-left px-3 py-2">v2_next</th>
                  <th className="text-left px-3 py-2">KE_total</th>
                  <th className="text-left px-3 py-2">Canvas Index</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => (
                  <tr key={s.index} className="border-b border-border/30">
                    <td className="px-3 py-1.5 text-primary">S{s.index}</td>
                    <td className="px-3 py-1.5">{s.v1}</td>
                    <td className="px-3 py-1.5">{s.v2}</td>
                    <td className="px-3 py-1.5 text-secondary">{s.keTotal} J</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{s.canvasIndex}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {collisionTelemetry.length > 0 && (
            <div className="px-3 py-2 border-t border-border/50 text-[10px] font-mono text-muted-foreground">
              Active-run telemetry:{' '}
              {collisionTelemetry.map((t) => t.step).join('  ·  ')}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
