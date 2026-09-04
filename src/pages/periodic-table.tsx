import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Atom, Layers, Wrench, FlaskConical, Beaker, X } from 'lucide-react';

// FNV-1a hash, copied from kernel.ts to derive deterministic copyright hashes.
function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function copyrightHash(names: string[]): string {
  const joined = names.join('+');
  // Chain FNV over several salted segments to make a longer sha256-like hex.
  const parts = [
    hashText(joined),
    hashText(`${joined}:license`),
    hashText(`${joined}:coverage`),
    hashText(`${joined}:receipt`),
    hashText(`aeon:${joined}`),
    hashText(`${joined}:seal`),
    hashText(`${joined}:v15.4`),
    hashText(`fraymus:${joined}`),
  ];
  return parts.join('');
}

type Permit = 'L0' | 'L1' | 'L2';

type Element = {
  id: string;
  symbol: string;
  name: string;
  signature: string;
  description: string;
  permit: Permit;
  critical?: string;
  note?: string;
};

const ATOMS: Element[] = [
  { id: 'XOR_GATE', symbol: 'XOR', name: 'XOR Gate', signature: 'Bit,Bit→Bit', description: 'Exclusive OR gate. 5(101) XOR 3(011)=6(110)', permit: 'L0', note: '5(101) XOR 3(011)=6(110)' },
  { id: 'AND_GATE', symbol: 'AND', name: 'AND Gate', signature: 'Long,Long→Float', description: '_long() conversion, bitwise AND', permit: 'L0', note: 'Java compat' },
  { id: 'OR_GATE', symbol: 'OR', name: 'OR Gate', signature: 'Long,Long→Float', description: '_long() conversion, bitwise OR', permit: 'L0' },
  { id: 'NOT_GATE', symbol: 'NOT', name: 'NOT Gate', signature: 'Bit→Bit', description: 'Logical inversion', permit: 'L0' },
  { id: 'NAND_GATE', symbol: 'NAND', name: 'NAND Gate', signature: 'Bit,Bit→Bit', description: 'NOT AND composite', permit: 'L0' },
  { id: 'NOR_GATE', symbol: 'NOR', name: 'NOR Gate', signature: 'Bit,Bit→Bit', description: 'NOT OR composite', permit: 'L0' },
  { id: 'FLIP_FLOP', symbol: 'FF', name: 'Flip Flop', signature: 'Bit→Bit', description: '1-bit state holder', permit: 'L0' },
  { id: 'POW_GATE', symbol: 'POW', name: 'Power Gate', signature: 'Float,Float→Float', description: 'Power with NaN/inf safety', permit: 'L0', critical: 'a<0 && b!=int(b) → NaN (Java-compat, NOT complex)' },
];

const STRUCTURES: Element[] = [
  { id: 'SINGLETON', symbol: '1×', name: 'Singleton', signature: 'ensures one instance', description: 'Anti-duplicate guard', permit: 'L1' },
  { id: 'LINKED_LIST', symbol: '→→', name: 'Linked List', signature: 'ordered chain', description: 'Sequential node chain', permit: 'L1' },
  { id: 'TREE', symbol: '⑂', name: 'Tree', signature: 'hierarchical', description: 'AST / knowledge graph', permit: 'L1' },
  { id: 'HASH_MAP', symbol: '{k:v}', name: 'Hash Map', signature: 'O(1) lookup', description: 'Key-value store', permit: 'L1' },
  { id: 'STACK', symbol: '↑↓', name: 'Stack', signature: 'LIFO', description: 'Call stack / undo', permit: 'L1' },
  { id: 'QUEUE', symbol: '→[]', name: 'Queue', signature: 'FIFO', description: 'Task scheduler', permit: 'L1' },
  { id: 'GRAPH', symbol: '◈', name: 'Graph', signature: 'edges+nodes', description: 'Knowledge graph edges', permit: 'L1' },
  { id: 'TRIE', symbol: '◻◻◻', name: 'Trie', signature: 'prefix tree', description: 'Token prefix search', permit: 'L1' },
];

const TOOLS: Element[] = [
  { id: 'EXTRACTOR', symbol: '⊗', name: 'Extractor', signature: 'pulls exact excerpt+locator', description: 'Source evidence extractor', permit: 'L2' },
  { id: 'LOOP', symbol: '↺', name: 'Loop', signature: 'bounded iteration', description: 'Idempotent loop', permit: 'L2' },
  { id: 'PARSER', symbol: '{ }', name: 'Parser', signature: 'AST builder', description: 'Syntax tree parser', permit: 'L2' },
  { id: 'EMITTER', symbol: '→', name: 'Emitter', signature: 'code generator', description: 'Target emitter', permit: 'L2' },
  { id: 'COMPILER', symbol: '⚙', name: 'Compiler', signature: 'Lexer+Parser+Emitter', description: 'Full compile pipeline', permit: 'L2' },
  { id: 'DECOMPILER', symbol: '⚙̲', name: 'Decompiler', signature: 'reverse AST', description: 'Binary→source', permit: 'L2' },
  { id: 'TRANSMUTER', symbol: '⟳', name: 'Transmuter', signature: 'Decompiler+Parser+Optimizer', description: 'Legacy code optimizer', permit: 'L2' },
  { id: 'OPTIMIZER', symbol: '▲', name: 'Optimizer', signature: 'reduces compute', description: '40% faster output', permit: 'L2' },
];

const PERMIT_STYLE: Record<Permit, { text: string; border: string; bg: string; badge: string; hover: string }> = {
  L0: { text: 'text-emerald-300', border: 'border-emerald-500/50', bg: 'bg-emerald-500/5', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/60', hover: 'hover:border-emerald-400 hover:shadow-[0_0_18px_-4px_rgba(52,211,153,0.6)]' },
  L1: { text: 'text-cyan-300', border: 'border-cyan-500/50', bg: 'bg-cyan-500/5', badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/60', hover: 'hover:border-cyan-400 hover:shadow-[0_0_18px_-4px_rgba(34,211,238,0.6)]' },
  L2: { text: 'text-fuchsia-300', border: 'border-fuchsia-500/50', bg: 'bg-fuchsia-500/5', badge: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/60', hover: 'hover:border-fuchsia-400 hover:shadow-[0_0_18px_-4px_rgba(217,70,239,0.6)]' },
};

type FusionOutput = { name: string; size: string; coverage: string; price: string; lang: string; code: string };

const RECIPES: Record<string, FusionOutput> = {
  'LEXER+PARSER+EMITTER': { name: 'fraymus_compiler_v1.wasm', size: '12kb', coverage: '99%', price: '$500/mo', lang: 'asm', code: '; COMPILER — rendered only\n; receipt: {hash}\nsection .data\n  bytecode db 0x58,0x03,0x59,0x01,0xFF\n' },
  'EXTRACTOR+LOOP+SINGLETON': { name: 'registrar_bot.jar', size: '8kb', coverage: '97%', price: '$99/mo + $5k tuition', lang: 'java', code: 'public final class RegistrarBot { /* Extractor+Loop+Singleton fusion */ }' },
  'DECOMPILER+PARSER+OPTIMIZER': { name: 'transmuter_engine.wasm', size: '15kb', coverage: '98%', price: '$5k + $2k/mo', lang: 'rust', code: 'fn transmute(jar: Jar) -> FraymusJar { /* Decompile → Map → Optimize */ }' },
  'AND_GATE+OR_GATE+NOT_GATE': { name: 'policy_engine.wasm', size: '3kb', coverage: '100%', price: '$200/mo', lang: 'c', code: '// L0 Policy Engine — pure logic gates\n// AND/OR/NOT with _long() conversion' },
  'POW_GATE+XOR_GATE+AND_GATE': { name: 'numeric_safety_cell.wasm', size: '2kb', coverage: '100%', price: '$150/mo', lang: 'python', code: '# POW: a<0 and b!=int(b) → NaN (Java-compat)\n# XOR: _long(a) ^ _long(b)\n# AND: _long(a) & _long(b)' },
  'SINGLETON+LINKED_LIST+HASH_MAP': { name: 'episode_ledger.wasm', size: '6kb', coverage: '99%', price: '$300/mo', lang: 'go', code: 'package ledger\n// Singleton+LinkedList+HashMap fusion\n// Immutable causal chain' },
  'LOOP+QUEUE+STACK': { name: 'scheduler.wasm', size: '4kb', coverage: '98%', price: '$250/mo', lang: 'go', code: 'package scheduler\n// Loop+Queue+Stack\n// Dispatcher permit queue' },
  'EXTRACTOR+TREE+HASH_MAP': { name: 'knowledge_graph.jar', size: '10kb', coverage: '97%', price: '$400/mo', lang: 'java', code: 'public class KnowledgeGraph { /* Extractor+Tree+HashMap */ }' },
};

const ALL: Record<string, Element> = Object.fromEntries(
  [...ATOMS, ...STRUCTURES, ...TOOLS].map((e) => [e.id, e]),
);

function resolveRecipe(ids: string[]): FusionOutput {
  // Try exact ordered key, then any permutation.
  const keyDirect = ids.join('+');
  if (RECIPES[keyDirect]) return RECIPES[keyDirect];
  const permutations = permute(ids);
  for (const p of permutations) {
    const k = p.join('+');
    if (RECIPES[k]) return RECIPES[k];
  }
  // Fallback: generate novel output deterministically.
  const h = hashText(ids.join('+'));
  const size = `${(parseInt(h.slice(0, 3), 16) % 20) + 2}kb`;
  const cov = `${90 + (parseInt(h.slice(3, 5), 16) % 10)}%`;
  const price = `$${((parseInt(h.slice(5, 7), 16) % 9) + 1) * 100}/mo`;
  return {
    name: `fusion_${h}.wasm`,
    size,
    coverage: cov,
    price,
    lang: 'wat',
    code: `;; novel fusion — ${ids.join(' + ')}\n;; deterministic receipt: ${h}\n(module (func (export "run")))`,
  };
}

function permute(arr: string[]): string[][] {
  if (arr.length <= 1) return [arr];
  const out: string[][] = [];
  arr.forEach((v, i) => {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permute(rest)) out.push([v, ...p]);
  });
  return out;
}

function ElementCard({ el }: { el: Element }) {
  const [hover, setHover] = useState(false);
  const style = PERMIT_STYLE[el.permit];
  return (
    <div
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', el.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
        data-testid={`element-${el.id}`}
        className={cn(
          'flex h-24 w-full cursor-grab flex-col justify-between border bg-[#08080c] p-2 transition active:cursor-grabbing',
          style.border, style.bg, style.hover,
        )}
      >
        <div className="flex items-start justify-between">
          <span className={cn('text-lg font-bold leading-none', style.text)}>{el.symbol}</span>
          <span className={cn('border px-1 text-[8px] font-bold', style.badge)}>{el.permit}</span>
        </div>
        <div>
          <div className="truncate text-[10px] font-semibold text-foreground">{el.name}</div>
          <div className="truncate text-[8px] font-mono text-muted-foreground">{el.signature}</div>
        </div>
      </div>

      {hover && (
        <div className="absolute left-1/2 top-full z-40 mt-1 w-56 -translate-x-1/2 border border-border bg-[#050508] p-2 text-[10px] shadow-xl">
          <div className={cn('font-bold', style.text)}>{el.name}</div>
          <div className="mt-0.5 text-muted-foreground">{el.description}</div>
          {el.note && <div className="mt-1 text-cyan-300">note: {el.note}</div>}
          {el.critical && (
            <div className="mt-1 border border-red-500/60 bg-red-500/10 px-1 py-0.5 text-red-300">
              ⚠ CRITICAL: {el.critical}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Slot({ id, el, onDrop, onClear, index }: { id: string; el: Element | null; onDrop: (id: string) => void; onClear: () => void; index: number }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const data = e.dataTransfer.getData('text/plain');
        if (data) onDrop(data);
      }}
      data-testid={`fusion-slot-${id}`}
      className={cn(
        'relative flex h-28 flex-1 flex-col items-center justify-center border-2 border-dashed transition',
        over ? 'border-primary bg-primary/10' : el ? 'border-border bg-[#08080c]' : 'border-border/60 bg-black/30',
      )}
    >
      {el ? (
        <>
          <button onClick={onClear} className="absolute right-1 top-1 text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
          <span className={cn('text-2xl font-bold', PERMIT_STYLE[el.permit].text)}>{el.symbol}</span>
          <span className="mt-1 text-[10px] font-semibold text-foreground">{el.name}</span>
          <span className={cn('mt-0.5 border px-1 text-[8px] font-bold', PERMIT_STYLE[el.permit].badge)}>{el.permit}</span>
        </>
      ) : (
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Drop Card {index + 1}</span>
      )}
    </div>
  );
}

export default function PeriodicTable() {
  const [slots, setSlots] = useState<(string | null)[]>([null, null, null]);
  const [output, setOutput] = useState<(FusionOutput & { hash: string; ids: string[] }) | null>(null);

  const setSlot = (index: number, id: string) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = id;
      return next;
    });
    setOutput(null);
  };

  const clearSlot = (index: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setOutput(null);
  };

  const allFilled = slots.every((s) => s !== null);

  const fuse = () => {
    const ids = slots.filter((s): s is string => !!s);
    const recipe = resolveRecipe(ids);
    const hash = copyrightHash(ids);
    setOutput({ ...recipe, hash, ids, code: recipe.code.replace('{hash}', hash.slice(0, 16)) });
  };

  const blockDef = (title: string, icon: typeof Atom, list: Element[], accent: string) => (
    <div className="flex flex-col">
      <div className={cn('mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider', accent)}>
        {(() => { const I = icon; return <I className="h-4 w-4" />; })()}
        {title}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {list.map((el) => <ElementCard key={el.id} el={el} />)}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold uppercase tracking-tight">
          <FlaskConical className="h-5 w-5 text-primary" />
          Periodic Table <span className="text-muted-foreground">/ Atoms · Structures · Tools</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Drag any element into the fusion chamber below. Fill all three slots and fuse to synthesize a licensed artifact.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">{blockDef('L0 Atoms', Atom, ATOMS, 'text-emerald-300')}</div>
        <div className="xl:col-span-4">{blockDef('L1 Structures', Layers, STRUCTURES, 'text-cyan-300')}</div>
        <div className="xl:col-span-3">{blockDef('L2 Tools', Wrench, TOOLS, 'text-fuchsia-300')}</div>
      </div>

      {/* Fusion Chamber */}
      <div className="border border-border bg-card/40 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-primary">
          <Beaker className="h-4 w-4" /> Fusion Chamber
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {slots.map((s, i) => (
            <Slot
              key={i}
              id={String(i)}
              index={i}
              el={s ? ALL[s] : null}
              onDrop={(id) => setSlot(i, id)}
              onClear={() => clearSlot(i)}
            />
          ))}
        </div>

        <div className="mt-3 flex justify-center">
          <button
            disabled={!allFilled}
            onClick={fuse}
            data-testid="button-fuse"
            className={cn(
              'border px-8 py-2 text-sm font-bold uppercase tracking-widest transition',
              allFilled
                ? 'border-primary bg-primary/15 text-primary hover:bg-primary/25 shadow-[0_0_20px_-4px_rgba(251,191,36,0.6)]'
                : 'cursor-not-allowed border-border text-muted-foreground opacity-50',
            )}
          >
            ⚛ Fuse
          </button>
        </div>

        {output && (
          <div className="mt-4 border border-primary/40 bg-[#08080c] p-4" data-testid="fusion-output">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-base font-bold text-primary">{output.name}</div>
              <div className="text-xs font-mono text-cyan-300">{output.ids.join(' + ')}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <div className="border border-border bg-black/40 p-2">
                <div className="text-muted-foreground">file size</div>
                <div className="font-mono text-foreground">{output.size}</div>
              </div>
              <div className="border border-border bg-black/40 p-2">
                <div className="text-muted-foreground">receipt coverage</div>
                <div className="font-mono text-emerald-300">{output.coverage}</div>
              </div>
              <div className="border border-border bg-black/40 p-2">
                <div className="text-muted-foreground">license price</div>
                <div className="font-mono text-amber-300">{output.price}</div>
              </div>
              <div className="border border-border bg-black/40 p-2">
                <div className="text-muted-foreground">lang</div>
                <div className="font-mono text-fuchsia-300">{output.lang}</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">copyright hash (FNV-1a chained)</div>
              <div className="mt-0.5 break-all font-mono text-[10px] text-amber-300">{output.hash}</div>
            </div>
            <div className="mt-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">code preview</div>
              <pre className="mt-1 overflow-auto border border-border bg-black/50 p-3 font-mono text-[10px] leading-relaxed text-foreground/90">
                {output.code}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
