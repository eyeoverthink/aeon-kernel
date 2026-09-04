import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ShieldAlert, Zap, Clock, Activity, Code2, Layers, FlaskConical, Swords, Cpu, Waves, Braces, Microscope } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useKernelStore } from '@/hooks/use-kernel';

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const activeRun = useKernelStore((state) => state.activeRun);

  const navItems = [
    { href: '/', label: 'Workbench', icon: Zap },
    { href: '/matter-lab', label: 'Matter Lab', icon: Microscope },
    { href: '/transmuter', label: 'Transmuter', icon: Code2 },
    { href: '/fighter-cards', label: 'Fighters', icon: Swords },
    { href: '/periodic-table', label: 'Atoms', icon: Layers },
    { href: '/fusion-lab', label: 'Fusion', icon: FlaskConical },
    { href: '/cve-feed', label: 'CVE Feed', icon: Waves },
    { href: '/x86-map', label: 'x86', icon: Cpu },
    { href: '/kinematics', label: 'Kinetics', icon: Activity },
    { href: '/hdc', label: 'HDC', icon: Braces },
    { href: '/receipts', label: 'Ledger', icon: Clock },
    { href: '/about', label: 'Bounds', icon: ShieldAlert },
  ];

  return (
    <div className="min-h-screen w-full flex flex-col bg-background text-foreground font-mono text-sm">
      <header className="flex-none border-b border-border bg-card">
        <div className="flex items-center h-14 px-4 md:px-6 max-w-screen-2xl mx-auto w-full justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-none bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg shadow-[0_0_15px_rgba(255,176,0,0.4)]">
              <Activity className="w-5 h-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold tracking-widest text-primary text-base">AEON KERNEL</span>
              <span className="text-[10px] text-muted-foreground uppercase">
                Philosopher's Stone {activeRun?.versionTo ?? 'v15.3'}
              </span>
            </div>
          </div>
          <nav className="flex items-center gap-1 md:gap-4">
            {navItems.map((item) => (
              <Link 
                data-testid={`link-${item.label.toLowerCase()}`}
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider font-semibold transition-colors border-b-2",
                  location === item.href 
                    ? "text-primary border-primary bg-primary/5" 
                    : "text-muted-foreground border-transparent hover:text-foreground hover:bg-white/5"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden md:inline-block">{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full p-4 md:p-6 overflow-hidden flex flex-col">
        {children}
      </main>
      
      <footer className="flex-none border-t border-border py-2 px-4 text-xs text-muted-foreground flex justify-between bg-background">
        <span>AEON_KERNEL_ACTIVE</span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(255,176,0,0.8)]"></span>
          SYS_ONLINE
        </span>
      </footer>
    </div>
  );
}
