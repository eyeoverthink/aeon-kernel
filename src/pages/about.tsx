import { ShieldAlert, Cpu, Network, Info } from 'lucide-react';

export default function About() {
  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <Info className="w-5 h-5 text-secondary" />
          System Boundaries
        </h2>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 min-h-0 overflow-y-auto">
        <div className="space-y-6">
          <section className="border border-border bg-card p-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-primary flex items-center gap-2 mb-4 border-b border-border/50 pb-2">
              <ShieldAlert className="w-4 h-4" />
              L0 Safety Guard
            </h3>
            <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
              <p>
                The Aeon Kernel operates on an absolute <strong>L0 Safety Boundary</strong>. 
                Inputs matching JNDI lookup signatures, credential-shaped assignments, or dynamic execution calls are stopped before parsing.
              </p>
              <p>
                Execution occurs entirely within a <strong>lexer-parser-bytecode-bounded-VM pipeline</strong>. The source is tokenized and compiled to a specialized instruction set, ensuring no native evaluation can occur.
              </p>
              <div className="bg-black border border-destructive/20 p-3 mt-4 text-xs font-mono text-destructive/80">
                [BLOCKED] ${`{jndi:ldap://attacker}`}
                <br/>[REASON] Abstract signature match (CVSS 10.0 paradigm)
              </div>
            </div>
          </section>

          <section className="border border-border bg-card p-6">
            <h3 className="text-sm font-bold uppercase tracking-widest text-secondary flex items-center gap-2 mb-4 border-b border-border/50 pb-2">
              <Cpu className="w-4 h-4" />
              Deterministic Rule
            </h3>
            <div className="space-y-3 text-sm text-foreground/80 leading-relaxed">
              <p>
                No native `eval()`, `Function`, WebAssembly, or active network calls are executed by this interface. 
                Valid Aeon source is tokenized, parsed into an AST, compiled to stack bytecode, decoded, and interpreted with bounded steps and stack depth. The displayed VM state is derived from that run.
              </p>
              <p>
                Syntax outside the constrained numeric grammar is rejected. Dynamic or process-execution requests are marked <strong>UNSUPPORTED</strong>; malformed Aeon programs are <strong>BLOCKED</strong>.
              </p>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="border border-border bg-card p-6 h-full">
            <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-4 border-b border-border/50 pb-2">
              <Network className="w-4 h-4" />
              Agent Capabilities
            </h3>
            <ul className="space-y-4 text-sm">
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <strong className="block text-foreground mb-1 uppercase tracking-wider text-xs">THREAT_GATE</strong>
                  <span className="text-muted-foreground">Validates raw signatures against known exploits before execution reaches downstream agents. Blocks credential exposure.</span>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <strong className="block text-foreground mb-1 uppercase tracking-wider text-xs">LOOP_SCAN</strong>
                  <span className="text-muted-foreground">Inspects syntax boundaries. Catches unsupported loops and dynamic control flow before parsing.</span>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <strong className="block text-foreground mb-1 uppercase tracking-wider text-xs">COMPILER</strong>
                  <span className="text-muted-foreground">The Aeon lexer, parser, and bytecode compiler. Emits bounded instruction sets for the VM.</span>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <strong className="block text-foreground mb-1 uppercase tracking-wider text-xs">AEON_VM</strong>
                  <span className="text-muted-foreground">Executes bounded stack bytecode, halting deterministically on limits to prevent runaway resource usage.</span>
                </div>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                <div>
                  <strong className="block text-foreground mb-1 uppercase tracking-wider text-xs">MUTATION</strong>
                  <span className="text-muted-foreground">Writes successful and blocked receipts to a local persisted ledger and promotes only bounded VM runs that reach HALT.</span>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
