# Aeon Kernel

Aeon Kernel is a standalone, deterministic executable-intelligence workbench. It turns a constrained numeric language into inspectable tokens, an AST, canonical stack instructions, encoded bytecode, a bounded VM trace, derived virtual-machine state, and persisted receipts.

## Truth boundary

Aeon Kernel executes only its own bounded numeric bytecode in a browser-based TypeScript virtual machine. It does **not** evaluate arbitrary pasted source, spawn processes, compile or execute rendered target languages, run WebAssembly, access the filesystem, or claim native/sandbox verification.

The six target views are source-derived renderings of canonical Aeon bytecode. They are not compiled or executed, and semantic equivalence is not claimed.

## Supported Aeon language

- Variable declarations: var mass = 15;
- Assignment: mass = mass + 1;
- Output: print 0.5 * mass * velocity ^ 2;
- Numeric literals, identifiers, parentheses, unary minus
- Operators: +, -, *, /, %, ^

Every statement ends with a semicolon. Source, statements, instructions, stack depth, and VM steps are bounded. Undefined variables, duplicate declarations, division by zero, non-finite results, malformed syntax, unsafe signatures, and unsupported execution capabilities are rejected before promotion.

## Pipeline

source -> safety gates -> lexer -> recursive-descent parser -> AST -> stack bytecode compiler -> decoder -> bounded VM -> trace and receipt

## Run locally

~~~bash
pnpm install
pnpm dev
~~~

Open http://localhost:5173.

## Verify

~~~bash
pnpm typecheck
pnpm build
~~~

## Main flows

- **Workbench:** compile and run bounded Aeon programs through five visible stages.
- **Transmuter:** inspect and copy six source-derived, render-only target views.
- **Ledger:** review localStorage-backed receipts that persist across reloads.
- **Boundaries:** inspect supported, blocked, and unsupported capabilities.

## License

No license has been granted yet. Open an issue before reusing substantial portions of this project.
