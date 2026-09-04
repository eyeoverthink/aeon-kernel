import { useKernelStore } from '@/hooks/use-kernel';
import { Copy, CheckCheck, Binary, Terminal, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function Transmuter() {
  const { activeRun } = useKernelStore();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
            <Binary className="w-5 h-5 text-secondary" />
            Transmuter (Multi-Target Output)
          </h2>
        </div>
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            <strong>NOTICE:</strong> Every target displayed here is source-derived and <em>rendered only</em>. These representations are NOT compiled or executed by this system, and absolutely <strong>no semantic equivalence</strong> is claimed between the bounded VM bytecode and these structural approximations.
          </p>
        </div>
      </div>

      <div className="flex-1 border border-border bg-card flex flex-col min-h-0" data-testid="outputs">
        <div className="bg-muted px-4 py-3 border-b border-border flex justify-between items-center">
          <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            Source-Derived Render Views ({activeRun?.outputs.length ?? 0})
          </div>
          {activeRun && (
            <div className="text-xs font-mono text-muted-foreground">
              Hash: <span className="text-primary">{activeRun.inputHash}</span> | Version: {activeRun.versionTo}
            </div>
          )}
        </div>

        <div className="flex-1 p-4 overflow-y-auto bg-[#050508]">
          {!activeRun ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <Terminal className="w-12 h-12 mb-4 opacity-20" />
              <p>No active trial to transmute.</p>
              <p className="text-xs mt-2">Return to the Workbench and ingest a concept.</p>
            </div>
          ) : activeRun.outputs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-destructive">
              <div className="border border-destructive bg-destructive/10 p-6 max-w-lg text-center shadow-[0_0_20px_rgba(255,0,0,0.2)]">
                <p className="font-bold text-lg mb-2 uppercase tracking-widest">No Renderings Produced</p>
                <p className="text-sm">The source was blocked or unsupported before the target renderers could run.</p>
                <div className="mt-4 font-mono text-xs bg-black p-2 text-left text-destructive/80">
                  {activeRun.promotionReason}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeRun.outputs.map((out) => (
                <div key={out.id} className="border border-border/50 bg-black flex flex-col relative group">
                  <div className="flex justify-between items-center p-2 border-b border-border/50 bg-card/50">
                    <span className="text-xs font-bold text-secondary uppercase tracking-widest">{out.label}</span>
                    <button 
                      data-testid={`button-copy-target-${out.id}`}
                      onClick={() => handleCopy(out.id, out.code)}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1"
                      title="Copy to clipboard"
                    >
                      {copiedId === out.id ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <pre className="p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap flex-1 bg-[#020203]">
                    {out.code}
                  </pre>
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[8px] uppercase tracking-widest text-primary/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    Status: {out.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Bytecode visualizer at bottom */}
      {activeRun && activeRun.status !== 'blocked' && (
        <div className="flex-none border border-border bg-card p-4 mt-4" data-testid="bytecode">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Raw Bytecode Stream</div>
          <div className="flex flex-wrap gap-2">
            {activeRun.bytecode.map((b, i) => (
              <div key={i} className="px-2 py-1 bg-black border border-primary/20 text-primary font-mono text-xs shadow-[0_0_5px_rgba(255,176,0,0.1)]">
                {b}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
