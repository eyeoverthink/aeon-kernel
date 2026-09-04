import { useKernelStore } from '@/hooks/use-kernel';
import { useEffect } from 'react';
import { Clock, Hash, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function Ledger() {
  const { history, loadHistory } = useKernelStore();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Receipts Ledger
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Local persisted log of all transmutation trials across sessions.
        </p>
      </div>

      <div className="flex-1 border border-border bg-card overflow-y-auto">
        <div className="grid grid-cols-[auto_1fr_1fr_100px_120px] gap-4 p-3 border-b border-border bg-muted text-xs font-bold uppercase tracking-wider text-muted-foreground sticky top-0 z-10">
          <div className="w-8 text-center">#</div>
          <div>Run ID / Hash</div>
          <div>Status</div>
          <div className="text-right">Findings</div>
          <div className="text-right">Timestamp</div>
        </div>
        
        {history.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No ledger entries found. Run a trial in the Workbench first.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {history.map((run, i) => (
              <div key={run.id} className="grid grid-cols-[auto_1fr_1fr_100px_120px] gap-4 p-4 hover:bg-white/5 transition-colors items-center">
                <div className="w-8 text-center text-xs text-muted-foreground font-mono">{history.length - i}</div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-mono text-foreground/80 truncate pr-4">{run.id}</span>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Hash className="w-3 h-3" /> {run.inputHash}
                  </div>
                </div>
                <div>
                  <Badge 
                    variant="outline" 
                    className={`rounded-none text-[10px] uppercase tracking-wider ${
                      run.promotion === 'promoted' 
                        ? 'border-green-500 text-green-500' 
                        : 'border-destructive text-destructive'
                    }`}
                  >
                    {run.promotion === 'promoted' ? <ShieldCheck className="w-3 h-3 mr-1 inline" /> : <ShieldAlert className="w-3 h-3 mr-1 inline" />}
                    {run.status}
                  </Badge>
                </div>
                <div className="text-right text-sm font-mono">
                  {run.findings.length > 0 ? (
                    <span className="text-destructive">{run.findings.length} Hits</span>
                  ) : (
                    <span className="text-green-500">0</span>
                  )}
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  {new Date(run.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
