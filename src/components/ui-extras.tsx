import { type ReactNode, useEffect, useState } from 'react';
import { useKernelStore } from '@/hooks/use-kernel';

export function MatrixRain() {
  const [lines, setLines] = useState<{ id: number, left: number, text: string, delay: number, speed: number }[]>([]);

  useEffect(() => {
    // Generate initial lines
    const genLines = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      text: Array.from({ length: 15 }).map(() => String.fromCharCode(0x30A0 + Math.random() * 96)).join(''),
      delay: Math.random() * 2,
      speed: 1 + Math.random() * 2
    }));
    setLines(genLines);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-5">
      {lines.map((l) => (
        <div 
          key={l.id}
          className="absolute top-[-100%] text-primary/50 text-xs font-mono break-all whitespace-pre-wrap w-4 leading-none"
          style={{
            left: `${l.left}%`,
            animation: `rain ${l.speed}s linear infinite`,
            animationDelay: `${l.delay}s`
          }}
        >
          {l.text}
        </div>
      ))}
      <style>{`
        @keyframes rain {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100vh); }
        }
      `}</style>
    </div>
  );
}

export function SystemLog({ items }: { items: { step: string, ms: number }[] }) {
  return (
    <div className="font-mono text-xs space-y-1">
      {items.map((item, i) => (
        <div key={i} className="flex justify-between items-center text-muted-foreground border-b border-border/50 pb-1 mb-1 last:border-0">
          <span className="text-secondary">{item.step}</span>
          <span>{item.ms}ms</span>
        </div>
      ))}
    </div>
  );
}
