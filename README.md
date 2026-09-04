# Aeon Kernel

Aeon Kernel is a standalone deterministic executable-intelligence workbench. It exposes bounded safety agents, register snapshots, exact findings, six rendered target representations, collision telemetry, and a local receipt ledger.

## Truth boundary

Aeon Kernel does **not** execute arbitrary source, spawn processes, compile generated targets, run WebAssembly, or claim native/sandbox verification. Target outputs are rendered text. Promotion is evidence-gated by deterministic local rules.

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

## Verify

```bash
pnpm typecheck
pnpm build
```

## Main flows

- **Workbench:** analyze safe or unsafe source through five visible bounded agents.
- **Transmuter:** inspect and copy six rendered target representations.
- **Ledger:** review locally persisted receipts across reloads.
- **Boundaries:** inspect supported, blocked, and unsupported capabilities.

## License

No license has been granted yet. Open an issue before reusing substantial portions of this project.
