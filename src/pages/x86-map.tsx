import { useKernelStore } from '@/hooks/use-kernel';
import { Cpu, Binary, Clock, ListTree } from 'lucide-react';

const DEFAULT_BYTECODE = ['0x58', '0x03', '0x59', '0x01', '0xFF'];

const REGISTER_ORDER = [
  'RAX', 'RBX', 'RCX', 'RDX',
  'RSI', 'RDI', 'RSP', 'RBP',
  'R8', 'R9', 'R10', 'R11',
  'R12', 'R13', 'R14', 'R15',
  'XMM0',
];

const OPCODES: { code: string; name: string; note: string }[] = [
  { code: '0x10', name: 'ENTITY', note: 'Declare knowledge entity' },
  { code: '0x50', name: 'FORMULA', note: 'Load formula into register' },
  { code: '0x58', name: 'FORMULA_EXECUTE', note: 'Execute loaded formula' },
  { code: '0x5A', name: 'SIMULATE', note: 'Run simulation pass' },
  { code: '0x59', name: 'UNIT_CONVERT', note: 'Convert measurement units' },
  { code: '0x01', name: 'CONVERT_PARAM', note: 'Bind conversion parameter' },
  { code: '0xFF', name: 'HALT', note: 'Terminate instruction stream' },
  { code: '0x03', name: 'KE_CALC', note: 'Kinetic energy computation' },
  { code: '0x1B', name: 'TARGET_TYPE', note: 'Select code-gen target' },
];

export default function X86Map() {
  const activeRun = useKernelStore((state) => state.activeRun);

  // Map kernel registers (by name) into a lookup. Kernel uses R8–R15 as one bucket.
  const runRegisters = new Map<string, { value: string | number; meaning: string }>();
  activeRun?.registers.forEach((r) => {
    runRegisters.set(r.register, { value: r.value, meaning: r.meaning });
  });
  const bulkGpr = runRegisters.get('R8–R15');

  const bytecode = activeRun?.bytecode ?? DEFAULT_BYTECODE;

  const resolveRegister = (name: string) => {
    if (runRegisters.has(name)) return runRegisters.get(name)!;
    if (/^R(8|9|1[0-5])$/.test(name) && bulkGpr) return bulkGpr;
    return null;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <Cpu className="w-5 h-5 text-secondary" />
          x86-64 Binary Map
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {activeRun ? `run ${activeRun.inputHash}` : 'no active run'}
        </span>
      </div>

      {!activeRun && (
        <div className="flex-none border border-primary/30 bg-primary/5 text-primary/90 text-xs px-4 py-2 uppercase tracking-wider">
          Run a trial in the Workbench to populate registers.
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-y-auto">
        {/* Register File */}
        <section className="lg:col-span-7 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Binary className="w-4 h-4 text-secondary" /> Register File
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 bg-[#050508]">
            {REGISTER_ORDER.map((name) => {
              const reg = resolveRegister(name);
              const active = !!reg;
              return (
                <div
                  key={name}
                  className={`border p-2 flex flex-col transition-colors ${
                    active
                      ? 'border-primary/60 bg-primary/5 shadow-[0_0_10px_rgba(255,176,0,0.15)]'
                      : 'border-border/40 bg-black'
                  }`}
                >
                  <span
                    className={`text-xs font-bold ${active ? 'text-primary' : 'text-secondary/70'}`}
                  >
                    {name}
                  </span>
                  <span className="text-sm font-mono mt-1 break-all truncate">
                    {active ? String(reg!.value) : '0x0000...0000'}
                  </span>
                  <span
                    className="text-[10px] text-muted-foreground truncate mt-1"
                    title={active ? reg!.meaning : 'unmapped'}
                  >
                    {active ? reg!.meaning : 'unmapped'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bytecode + Opcode Decoder */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <section className="border border-border bg-card flex flex-col">
            <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider">
              Bytecode Stream
            </div>
            <div className="p-4 flex flex-wrap gap-2 bg-[#050508]">
              {bytecode.map((byte, i) => (
                <div
                  key={`${byte}-${i}`}
                  className="border border-secondary/50 bg-black px-3 py-2 text-sm font-mono text-secondary shadow-[0_0_10px_rgba(0,204,204,0.25)]"
                >
                  {byte}
                </div>
              ))}
            </div>
          </section>

          <section className="border border-border bg-card flex flex-col">
            <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <ListTree className="w-4 h-4 text-primary" /> Opcode Decoder
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-muted-foreground uppercase tracking-wider border-b border-border/50">
                    <th className="text-left px-3 py-2">Opcode</th>
                    <th className="text-left px-3 py-2">Mnemonic</th>
                    <th className="text-left px-3 py-2">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {OPCODES.map((op) => {
                    const inStream = bytecode.some(
                      (b) => b.toUpperCase() === op.code.toUpperCase(),
                    );
                    return (
                      <tr
                        key={op.code}
                        className={`border-b border-border/30 ${
                          inStream ? 'bg-primary/5' : ''
                        }`}
                      >
                        <td className={`px-3 py-1.5 ${inStream ? 'text-primary' : 'text-secondary'}`}>
                          {op.code}
                        </td>
                        <td className="px-3 py-1.5 text-foreground">{op.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{op.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Instruction Timeline */}
        <section className="lg:col-span-12 border border-border bg-card flex flex-col">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-secondary" /> Instruction Timeline
          </div>
          <div className="p-4 bg-[#050508]">
            {activeRun ? (
              <div className="flex flex-wrap items-stretch gap-2">
                {activeRun.telemetry.map((t, i) => (
                  <div key={`${t.step}-${i}`} className="flex items-center gap-2">
                    <div className="border border-secondary/40 bg-black px-3 py-2 flex flex-col min-w-24">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        #{i}
                      </span>
                      <span className="text-xs font-mono text-secondary break-all">{t.step}</span>
                      <span className="text-[10px] text-primary mt-1">{t.ms} ms</span>
                    </div>
                    {i < activeRun.telemetry.length - 1 && (
                      <span className="text-muted-foreground">→</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground text-xs text-center py-4">
                No telemetry — awaiting a Workbench run.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
