import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Zap, X, Copy, FlaskConical, Check } from 'lucide-react';

// FNV-1a hash (copied from kernel.ts) — extended to 16-char hex over doubled pass.
function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const first = (hash >>> 0).toString(16).padStart(8, '0');
  // second pass over reversed input for the low 8 bytes → 16-char hex
  let hash2 = 0x811c9dc5;
  const reversed = value.split('').reverse().join('');
  for (let index = 0; index < reversed.length; index += 1) {
    hash2 ^= reversed.charCodeAt(index);
    hash2 = Math.imul(hash2, 0x01000193);
  }
  const second = (hash2 >>> 0).toString(16).padStart(8, '0');
  return `${first}${second}`;
}

type Layer = 'L0' | 'L1' | 'L2';

type Card = {
  symbol: string;
  name: string;
  layer: Layer;
};

type LayerGroup = {
  title: string;
  layer: Layer;
  cards: Card[];
};

const LIBRARY: LayerGroup[] = [
  {
    title: 'ATOMS',
    layer: 'L0',
    cards: [
      { symbol: '⊕', name: 'XOR_GATE', layer: 'L0' },
      { symbol: '∧', name: 'AND_GATE', layer: 'L0' },
      { symbol: '∨', name: 'OR_GATE', layer: 'L0' },
      { symbol: '¬', name: 'NOT_GATE', layer: 'L0' },
      { symbol: '⊼', name: 'NAND_GATE', layer: 'L0' },
      { symbol: '⊽', name: 'NOR_GATE', layer: 'L0' },
      { symbol: '⇄', name: 'FLIP_FLOP', layer: 'L0' },
      { symbol: '^', name: 'POW_GATE', layer: 'L0' },
    ],
  },
  {
    title: 'STRUCTURES',
    layer: 'L1',
    cards: [
      { symbol: '①', name: 'SINGLETON', layer: 'L1' },
      { symbol: '→', name: 'LINKED_LIST', layer: 'L1' },
      { symbol: '⋔', name: 'TREE', layer: 'L1' },
      { symbol: '#', name: 'HASH_MAP', layer: 'L1' },
      { symbol: '≡', name: 'STACK', layer: 'L1' },
      { symbol: '⊐', name: 'QUEUE', layer: 'L1' },
      { symbol: '◈', name: 'GRAPH', layer: 'L1' },
      { symbol: '⋏', name: 'TRIE', layer: 'L1' },
    ],
  },
  {
    title: 'TOOLS',
    layer: 'L2',
    cards: [
      { symbol: '⇲', name: 'EXTRACTOR', layer: 'L2' },
      { symbol: '↻', name: 'LOOP', layer: 'L2' },
      { symbol: '⊢', name: 'PARSER', layer: 'L2' },
      { symbol: '⊨', name: 'EMITTER', layer: 'L2' },
      { symbol: '⚙', name: 'COMPILER', layer: 'L2' },
      { symbol: '⚒', name: 'DECOMPILER', layer: 'L2' },
      { symbol: '⇌', name: 'TRANSMUTER', layer: 'L2' },
      { symbol: '✦', name: 'OPTIMIZER', layer: 'L2' },
    ],
  },
];

type Recipe = {
  name: string;
  size: string;
  coverage: string;
  price: string;
  lang: string;
  code: string;
};

const RECIPES: Record<string, Recipe> = {
  'AND_GATE+OR_GATE+NOT_GATE': {
    name: 'policy_engine.wasm',
    size: '3kb',
    coverage: '100%',
    price: '$200/mo',
    lang: 'c',
    code: '// L0 Policy Engine\n// Pure logic gates with _long() conversion\nbool evaluate(long a, long b) {\n  return (a & b) | (!a);\n}',
  },
  'EXTRACTOR+LOOP+SINGLETON': {
    name: 'registrar_bot.jar',
    size: '8kb',
    coverage: '97%',
    price: '$99/mo + $5k tuition',
    lang: 'java',
    code: 'public final class RegistrarBot {\n  // Extractor: pulls exact syllabus excerpt + page locator\n  // Loop: 3421 iterations, XOR dedup\n  // Singleton: one trusted node per course\n  private static RegistrarBot INSTANCE;\n}',
  },
  'EMITTER+EXTRACTOR+PARSER': {
    name: 'fraymus_compiler_v1.wasm',
    size: '12kb',
    coverage: '99%',
    price: '$500/mo',
    lang: 'asm',
    code: '; COMPILER — rendered only, not assembled\n; receipt: {hash}\nsection .data\n  bytecode db 0x58,0x03,0x59,0x01,0xFF\nsection .text\n  _start: mov rsi, bytecode\n         call compile_pipeline\n         mov rax, 60\n         syscall',
  },
  'DECOMPILER+OPTIMIZER+PARSER': {
    name: 'transmuter_engine.wasm',
    size: '15kb',
    coverage: '98%',
    price: '$5k + $2k/mo',
    lang: 'rust',
    code: 'pub fn transmute(jar: LegacyJar) -> FraymusJar {\n    let ast = decompile(jar);\n    let cards = map_to_cards(ast);  // for→Loop, singleton→Singleton\n    let optimized = optimize(cards); // -40% compute\n    FraymusJar::seal(optimized, Permit::L2)\n}',
  },
  'AND_GATE+POW_GATE+XOR_GATE': {
    name: 'numeric_safety_cell.wasm',
    size: '2kb',
    coverage: '100%',
    price: '$150/mo',
    lang: 'python',
    code: '# POW_GATE: a<0 and b!=int(b) → NaN (Java-compat, NOT complex)\n# XOR_GATE: b,a=_long(pop()),_long(pop()); float(a^b)\n# AND_GATE: b,a=_long(pop()),_long(pop()); float(a&b)\ndef pow_gate(a, b):\n    if a < 0 and b != int(b):\n        return float("nan")  # Java NaN, not Python complex\n    return float(a ** b)',
  },
  'HASH_MAP+LINKED_LIST+SINGLETON': {
    name: 'episode_ledger.wasm',
    size: '6kb',
    coverage: '99%',
    price: '$300/mo',
    lang: 'go',
    code: 'package ledger\n// Singleton: one ledger per agent\n// LinkedList: causal chain of receipts\n// HashMap: O(1) episode lookup by ID\ntype EpisodeLedger struct {\n    chain    *LinkedList[Receipt]\n    index    map[string]*Receipt\n}\nvar instance *EpisodeLedger  // Singleton',
  },
  'LOOP+QUEUE+STACK': {
    name: 'scheduler.wasm',
    size: '4kb',
    coverage: '98%',
    price: '$250/mo',
    lang: 'go',
    code: 'package scheduler\n// Loop: bounded iteration over permit queue\n// Queue: FIFO pending actions\n// Stack: call depth for nested permits\nfunc RunPermitScheduler(permits Queue[Action]) {\n    stack := &Stack[Frame]{}\n    for !permits.Empty() {\n        action := permits.Dequeue()\n        stack.Push(Frame{action, Permit: action.RequiredPermit})\n    }\n}',
  },
  'EXTRACTOR+HASH_MAP+TREE': {
    name: 'knowledge_graph.jar',
    size: '10kb',
    coverage: '97%',
    price: '$400/mo',
    lang: 'java',
    code: 'public class KnowledgeGraph {\n    // Extractor: pulls source evidence + page locator\n    // Tree: hierarchical node structure\n    // HashMap: O(1) node lookup by ID\n    private final Map<String, KNode> index = new HashMap<>();\n    private final KTree structure = new KTree();\n}',
  },
};

const LAYER_STYLES: Record<Layer, string> = {
  L0: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
  L1: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10',
  L2: 'text-fuchsia-400 border-fuchsia-500/40 bg-fuchsia-500/10',
};

type Slots = [Card | null, Card | null, Card | null];

type FusionResult = Recipe & {
  copyrightHash: string;
  genesis: {
    hash: string;
    timestamp: string;
    cards: [string, string, string];
    trained_on: string;
    episodes: number;
  };
};

const FUSE_STEPS = ['BINDING ATOMS...', 'COMPILING...', 'SEALING GENESIS BLOCK...'];

export default function FusionLab() {
  const [slots, setSlots] = useState<Slots>([null, null, null]);
  const [fusing, setFusing] = useState(false);
  const [fuseStep, setFuseStep] = useState(0);
  const [result, setResult] = useState<FusionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const filledCount = slots.filter(Boolean).length;
  const ready = filledCount === 3 && !fusing;

  const addCard = (card: Card) => {
    setSlots((prev) => {
      const next = [...prev] as Slots;
      const empty = next.findIndex((s) => s === null);
      if (empty === -1) return prev;
      next[empty] = card;
      return next;
    });
    setResult(null);
  };

  const removeSlot = (index: number) => {
    setSlots((prev) => {
      const next = [...prev] as Slots;
      next[index] = null;
      return next;
    });
    setResult(null);
  };

  const computeResult = (): FusionResult => {
    const names = slots.map((s) => s!.name) as [string, string, string];
    const sortedKey = [...names].sort().join('+');
    const copyrightHash = hashText(names.join('+'));
    const recipe = RECIPES[sortedKey];
    const episodes = Math.floor(Math.random() * (9999 - 1000 + 1)) + 1000;

    let base: Recipe;
    if (recipe) {
      base = { ...recipe, code: recipe.code.replace('{hash}', copyrightHash) };
    } else {
      base = {
        name: `fraymus_cell_${copyrightHash.slice(0, 8)}.wasm`,
        size: `${Math.floor(Math.random() * 10) + 1}kb`,
        coverage: `${Math.floor(Math.random() * 10) + 88}%`,
        price: `$${Math.floor(Math.random() * 400) + 100}/mo`,
        lang: 'hex',
        code: `; Novel fusion — no standard recipe\n; Hash: ${copyrightHash}\n; Cards: ${names[0]} + ${names[1]} + ${names[2]}\n0x58 0x03 0x59 0x01 0xFF`,
      };
    }

    return {
      ...base,
      copyrightHash,
      genesis: {
        hash: copyrightHash,
        timestamp: new Date().toISOString(),
        cards: names,
        trained_on: 'Oakland crucible',
        episodes,
      },
    };
  };

  const handleFuse = () => {
    if (!ready) return;
    setResult(null);
    setFusing(true);
    setFuseStep(0);
    const t1 = setTimeout(() => setFuseStep(1), 500);
    const t2 = setTimeout(() => setFuseStep(2), 1000);
    const t3 = setTimeout(() => {
      setResult(computeResult());
      setFusing(false);
    }, 1500);
    // best-effort cleanup handles are local; component-scoped timeouts are fine here
    void [t1, t2, t3];
  };

  const copyLicense = () => {
    if (!result) return;
    const json = JSON.stringify(result.genesis, null, 2);
    navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const progressPct = fusing ? ((fuseStep + 1) / FUSE_STEPS.length) * 100 : result ? 100 : 0;

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex-none flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight uppercase flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-amber-400" />
          Fusion Lab
        </h2>
        <span className="text-xs text-muted-foreground uppercase tracking-widest">
          3-Slot Card Fusion Chamber
        </span>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0">
        {/* LEFT: Card Library */}
        <div className="lg:col-span-3 border border-border bg-card flex flex-col min-h-0">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider">
            Card Library
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-4">
            {LIBRARY.map((group) => (
              <div key={group.layer} className="space-y-1">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {group.title}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 border rounded-none ${LAYER_STYLES[group.layer]}`}>
                    {group.layer}
                  </span>
                </div>
                {group.cards.map((card) => (
                  <button
                    key={card.name}
                    data-testid={`card-lib-${card.name}`}
                    onClick={() => addCard(card)}
                    disabled={filledCount === 3}
                    className="w-full flex items-center gap-2 p-2 border border-border/60 bg-black/30 hover:bg-primary/10 hover:border-primary/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-left"
                  >
                    <span className="text-lg w-6 text-center text-foreground/80">{card.symbol}</span>
                    <span className="flex-1 text-xs font-mono">{card.name}</span>
                    <span className={`text-[9px] px-1 py-0.5 border rounded-none ${LAYER_STYLES[card.layer]}`}>
                      {card.layer}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* CENTER: Fusion Chamber */}
        <div className="lg:col-span-5 border border-border bg-card flex flex-col min-h-0">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider">
            Fusion Chamber
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 bg-[#050508] relative overflow-y-auto">
            <div className="w-full space-y-4">
              {[0, 1, 2].map((i) => {
                const card = slots[i];
                return (
                  <div
                    key={i}
                    className={`relative h-24 flex items-center justify-center border-2 transition-all ${
                      card
                        ? `${LAYER_STYLES[card.layer]} border-solid`
                        : 'border-dashed border-border/50 bg-black/20 text-muted-foreground'
                    }`}
                  >
                    {card ? (
                      <>
                        <div className="flex flex-col items-center">
                          <span className="text-3xl mb-1">{card.symbol}</span>
                          <span className="text-sm font-mono font-bold">{card.name}</span>
                          <span className="text-[10px] uppercase tracking-widest">{card.layer}</span>
                        </div>
                        <button
                          data-testid={`slot-remove-${i}`}
                          onClick={() => removeSlot(i)}
                          className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center border border-border bg-black/60 hover:bg-destructive/30 hover:text-destructive"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <span className="text-xs uppercase tracking-widest">Drop Card</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            {(fusing || result) && (
              <div className="w-full space-y-2">
                <div className="h-3 w-full border border-amber-500/40 bg-black/40 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-500 ease-out"
                    style={{ width: `${progressPct}%`, boxShadow: '0 0 12px rgba(251,191,36,0.7)' }}
                  />
                </div>
                {fusing && (
                  <div className="text-center text-xs font-mono uppercase tracking-widest text-amber-400 animate-pulse">
                    {FUSE_STEPS[fuseStep]}
                  </div>
                )}
              </div>
            )}

            <Button
              data-testid="button-fuse"
              onClick={handleFuse}
              disabled={!ready}
              className={`w-full gap-2 font-bold tracking-widest rounded-none transition-all ${
                ready
                  ? 'bg-amber-500 text-black hover:bg-amber-400'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
              style={ready ? { boxShadow: '0 0 18px rgba(251,191,36,0.6)' } : undefined}
            >
              <Zap className="w-4 h-4" /> {fusing ? 'FUSING...' : 'FUSE'}
            </Button>
          </div>
        </div>

        {/* RIGHT: Output Panel */}
        <div className="lg:col-span-4 border border-border bg-card flex flex-col min-h-0">
          <div className="bg-muted px-3 py-2 border-b border-border text-xs font-bold uppercase tracking-wider flex justify-between">
            <span>Fusion Output</span>
            {result && <span className="text-amber-400">SEALED</span>}
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-sm">
            {!result ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-xs text-center">
                Fill all 3 slots and FUSE to seal a genesis block.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="text-amber-400 font-mono font-bold text-base break-all">{result.name}</div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] uppercase tracking-wider">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Size</span>
                      <span className="font-mono text-foreground">{result.size}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">Coverage</span>
                      <span className="font-mono text-emerald-400">{result.coverage}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">License</span>
                      <span className="font-mono text-cyan-400">{result.price}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-border bg-black/40 p-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                    Copyright Hash (FNV-1a)
                  </div>
                  <div className="font-mono text-xs text-fuchsia-400 break-all">{result.copyrightHash}</div>
                </div>

                <div className="border border-border bg-black/40 p-2">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Genesis Block</div>
                  <pre className="text-[10px] font-mono text-foreground/80 whitespace-pre-wrap break-all">
{JSON.stringify(result.genesis, null, 2)}
                  </pre>
                </div>

                <div className="border border-border bg-black/60">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 py-1 border-b border-border flex justify-between">
                    <span>Code Preview</span>
                    <span className="text-secondary">{result.lang}</span>
                  </div>
                  <pre className="text-[10px] font-mono text-emerald-300/90 p-2 overflow-x-auto whitespace-pre">
{result.code}
                  </pre>
                </div>

                <Button
                  data-testid="button-copy-license"
                  onClick={copyLicense}
                  variant="outline"
                  className="w-full gap-2 font-bold tracking-widest rounded-none"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'COPIED' : 'COPY LICENSE'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
