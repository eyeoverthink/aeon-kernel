export type TokenKind =
  | 'var'
  | 'print'
  | 'identifier'
  | 'number'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'percent'
  | 'caret'
  | 'equals'
  | 'lparen'
  | 'rparen'
  | 'semicolon'
  | 'eof';

export type Token = { kind: TokenKind; lexeme: string; offset: number; line: number; column: number };
export type Expr =
  | { type: 'number'; value: number }
  | { type: 'identifier'; name: string }
  | { type: 'unary'; operator: '-'; operand: Expr }
  | { type: 'binary'; operator: '+' | '-' | '*' | '/' | '%' | '^'; left: Expr; right: Expr };
export type Statement =
  | { type: 'var'; name: string; initializer: Expr }
  | { type: 'assign'; name: string; value: Expr }
  | { type: 'print'; value: Expr };
export type Program = { type: 'program'; statements: Statement[] };
export type Instruction =
  | { opcode: 'PUSH'; value: number }
  | { opcode: 'LOAD' | 'STORE'; slot: number }
  | { opcode: 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MOD' | 'POW' | 'NEG' | 'PRINT' | 'HALT' };
export type VmTrace = { step: number; ip: number; instruction: string; stack: number[]; output: string[] };
export type CompilationResult = {
  tokens: Token[];
  ast: Program;
  instructions: Instruction[];
  bytecode: number[];
  canonicalInstructions: string[];
  trace: VmTrace[];
  output: string[];
  result: number | null;
  variables: Record<string, number>;
  steps: number;
};

const MAX_SOURCE = 12_000;
const MAX_STATEMENTS = 512;
const MAX_INSTRUCTIONS = 8_192;
const MAX_STACK = 512;
const MAX_STEPS = 8_192;

export class CompilerError extends Error {
  constructor(message: string, public readonly offset = 0, public readonly line = 1, public readonly column = 1) {
    super(message);
    this.name = 'CompilerError';
  }
}

function fail(message: string, token: Token): never {
  throw new CompilerError(message, token.offset, token.line, token.column);
}

export function lex(source: string): Token[] {
  if (source.length > MAX_SOURCE) throw new CompilerError(`Input exceeds the ${MAX_SOURCE}-character source boundary.`, MAX_SOURCE);
  const tokens: Token[] = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  const push = (kind: TokenKind, lexeme: string, start: number, startLine: number, startColumn: number) =>
    tokens.push({ kind, lexeme, offset: start, line: startLine, column: startColumn });
  const advance = () => {
    const char = source[offset++]!;
    if (char === '\n') { line += 1; column = 1; } else column += 1;
    return char;
  };
  while (offset < source.length) {
    const char = source[offset]!;
    if (/\s/.test(char)) { advance(); continue; }
    const start = offset, startLine = line, startColumn = column;
    const punctuation: Record<string, TokenKind> = {
      '+': 'plus', '-': 'minus', '*': 'star', '/': 'slash', '%': 'percent', '^': 'caret',
      '=': 'equals', '(': 'lparen', ')': 'rparen', ';': 'semicolon',
    };
    if (punctuation[char]) { advance(); push(punctuation[char]!, char, start, startLine, startColumn); continue; }
    if (/[A-Za-z_]/.test(char)) {
      let word = '';
      while (offset < source.length && /[A-Za-z0-9_]/.test(source[offset]!)) word += advance();
      push(word === 'var' || word === 'print' ? word : 'identifier', word, start, startLine, startColumn);
      continue;
    }
    if (/\d|\.(?=\d)/.test(char)) {
      let text = '';
      while (offset < source.length && /\d/.test(source[offset]!)) text += advance();
      if (source[offset] === '.') {
        text += advance();
        while (offset < source.length && /\d/.test(source[offset]!)) text += advance();
      }
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) throw new CompilerError('Numeric literal must be finite.', start, startLine, startColumn);
      push('number', text, start, startLine, startColumn);
      continue;
    }
    throw new CompilerError(`Unknown syntax character "${char}".`, start, startLine, startColumn);
  }
  tokens.push({ kind: 'eof', lexeme: '', offset, line, column });
  return tokens;
}

class Parser {
  private current = 0;
  constructor(private readonly tokens: Token[]) {}
  parse(): Program {
    const statements: Statement[] = [];
    while (!this.check('eof')) {
      if (statements.length >= MAX_STATEMENTS) fail(`Statement limit (${MAX_STATEMENTS}) exceeded.`, this.peek());
      statements.push(this.statement());
    }
    return { type: 'program', statements };
  }
  private statement(): Statement {
    if (this.match('var')) {
      const name = this.consume('identifier', 'Expected an identifier after "var".');
      this.consume('equals', 'Expected "=" after variable name.');
      const initializer = this.expression();
      this.consume('semicolon', 'Every statement must end with ";".');
      return { type: 'var', name: name.lexeme, initializer };
    }
    if (this.match('print')) {
      const value = this.expression();
      this.consume('semicolon', 'Every statement must end with ";".');
      return { type: 'print', value };
    }
    if (this.check('identifier') && this.tokens[this.current + 1]?.kind === 'equals') {
      const name = this.advance();
      this.advance();
      const value = this.expression();
      this.consume('semicolon', 'Every statement must end with ";".');
      return { type: 'assign', name: name.lexeme, value };
    }
    fail('Expected "var", assignment, or "print" statement.', this.peek());
  }
  private expression(): Expr { return this.additive(); }
  private additive(): Expr {
    let expr = this.multiplicative();
    while (this.match('plus', 'minus')) { const op = this.previous(); expr = { type: 'binary', operator: op.lexeme as '+' | '-', left: expr, right: this.multiplicative() }; }
    return expr;
  }
  private multiplicative(): Expr {
    let expr = this.unary();
    while (this.match('star', 'slash', 'percent')) { const op = this.previous(); expr = { type: 'binary', operator: op.lexeme as '*' | '/' | '%', left: expr, right: this.unary() }; }
    return expr;
  }
  private unary(): Expr {
    if (this.match('minus')) return { type: 'unary', operator: '-', operand: this.unary() };
    return this.power();
  }
  private power(): Expr {
    let expr = this.primary();
    if (this.match('caret')) expr = { type: 'binary', operator: '^', left: expr, right: this.unary() };
    return expr;
  }
  private primary(): Expr {
    if (this.match('number')) return { type: 'number', value: Number(this.previous().lexeme) };
    if (this.match('identifier')) return { type: 'identifier', name: this.previous().lexeme };
    if (this.match('lparen')) { const expr = this.expression(); this.consume('rparen', 'Expected ")" after expression.'); return expr; }
    fail('Expected a number, identifier, or parenthesized expression.', this.peek());
  }
  private match(...kinds: TokenKind[]): boolean { if (!kinds.some((kind) => this.check(kind))) return false; this.advance(); return true; }
  private consume(kind: TokenKind, message: string): Token { if (this.check(kind)) return this.advance(); fail(message, this.peek()); }
  private check(kind: TokenKind): boolean { return this.peek().kind === kind; }
  private advance(): Token { if (!this.check('eof')) this.current += 1; return this.previous(); }
  private peek(): Token { return this.tokens[this.current]!; }
  private previous(): Token { return this.tokens[this.current - 1]!; }
}

const opcodes: Record<Instruction['opcode'], number> = { PUSH: 1, LOAD: 2, STORE: 3, ADD: 4, SUB: 5, MUL: 6, DIV: 7, MOD: 8, POW: 9, NEG: 10, PRINT: 11, HALT: 255 };

function compile(ast: Program): { instructions: Instruction[]; slots: Map<string, number> } {
  const code: Instruction[] = [], slots = new Map<string, number>();
  const emit = (instruction: Instruction) => { if (code.length >= MAX_INSTRUCTIONS) throw new CompilerError(`Instruction limit (${MAX_INSTRUCTIONS}) exceeded.`); code.push(instruction); };
  const expression = (expr: Expr): void => {
    if (expr.type === 'number') emit({ opcode: 'PUSH', value: expr.value });
    else if (expr.type === 'identifier') {
      const slot = slots.get(expr.name);
      if (slot === undefined) throw new CompilerError(`Undefined variable "${expr.name}".`);
      emit({ opcode: 'LOAD', slot });
    } else if (expr.type === 'unary') { expression(expr.operand); emit({ opcode: 'NEG' }); }
    else { expression(expr.left); expression(expr.right); emit({ opcode: ({ '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD', '^': 'POW' } as const)[expr.operator] }); }
  };
  for (const statement of ast.statements) {
    if (statement.type === 'var') {
      if (slots.has(statement.name)) throw new CompilerError(`Duplicate variable "${statement.name}".`);
      if (slots.size >= 256) throw new CompilerError('Variable slot limit (256) exceeded.');
      expression(statement.initializer); const slot = slots.size; slots.set(statement.name, slot); emit({ opcode: 'STORE', slot });
    } else if (statement.type === 'assign') {
      const slot = slots.get(statement.name);
      if (slot === undefined) throw new CompilerError(`Undefined variable "${statement.name}".`);
      expression(statement.value); emit({ opcode: 'STORE', slot });
    } else { expression(statement.value); emit({ opcode: 'PRINT' }); }
  }
  emit({ opcode: 'HALT' });
  return { instructions: code, slots };
}

function encode(code: Instruction[]): number[] {
  const bytes: number[] = [];
  for (const instruction of code) {
    bytes.push(opcodes[instruction.opcode]);
    if (instruction.opcode === 'PUSH') {
      const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, instruction.value, false);
      for (let index = 0; index < 8; index += 1) bytes.push(view.getUint8(index));
    } else if (instruction.opcode === 'LOAD' || instruction.opcode === 'STORE') bytes.push(instruction.slot);
  }
  return bytes;
}

/** Decode the emitted byte representation; the VM never evaluates source text. */
function decode(bytes: number[]): Instruction[] {
  const code: Instruction[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    const opcode = bytes[cursor++]!;
    if (opcode === opcodes.PUSH) {
      if (cursor + 8 > bytes.length) throw new CompilerError('Truncated PUSH bytecode operand.');
      const view = new DataView(new ArrayBuffer(8));
      for (let index = 0; index < 8; index += 1) view.setUint8(index, bytes[cursor + index]!);
      cursor += 8;
      const value = view.getFloat64(0, false);
      if (!Number.isFinite(value)) throw new CompilerError('Bytecode contains a non-finite constant.');
      code.push({ opcode: 'PUSH', value });
    } else if (opcode === opcodes.LOAD || opcode === opcodes.STORE) {
      if (cursor >= bytes.length) throw new CompilerError('Truncated variable-slot bytecode operand.');
      code.push({ opcode: opcode === opcodes.LOAD ? 'LOAD' : 'STORE', slot: bytes[cursor++]! });
    } else {
      const operation = ({
        [opcodes.ADD]: 'ADD', [opcodes.SUB]: 'SUB', [opcodes.MUL]: 'MUL', [opcodes.DIV]: 'DIV',
        [opcodes.MOD]: 'MOD', [opcodes.POW]: 'POW', [opcodes.NEG]: 'NEG', [opcodes.PRINT]: 'PRINT',
        [opcodes.HALT]: 'HALT',
      } as Record<number, Instruction['opcode'] | undefined>)[opcode];
      if (!operation) throw new CompilerError(`Unknown VM opcode 0x${opcode.toString(16)}.`);
      code.push({ opcode: operation } as Instruction);
    }
    if (code.length > MAX_INSTRUCTIONS) throw new CompilerError(`Instruction limit (${MAX_INSTRUCTIONS}) exceeded.`);
  }
  return code;
}

function disassemble(code: Instruction[]): string[] {
  return code.map((instruction, index) => `${index.toString().padStart(4, '0')}  ${instruction.opcode}${instruction.opcode === 'PUSH' ? ` ${instruction.value}` : instruction.opcode === 'LOAD' || instruction.opcode === 'STORE' ? ` v${instruction.slot}` : ''}`);
}

function execute(code: Instruction[], slots: Map<string, number>): Pick<CompilationResult, 'trace' | 'output' | 'result' | 'variables' | 'steps'> {
  if (code.at(-1)?.opcode !== 'HALT') throw new CompilerError('Missing HALT instruction.');
  const stack: number[] = [], memory: number[] = [], output: string[] = [], trace: VmTrace[] = [];
  let ip = 0, steps = 0, halted = false;
  const requireValue = () => { const value = stack.pop(); if (value === undefined) throw new CompilerError('VM stack underflow.'); return value; };
  const finite = (value: number) => { if (!Number.isFinite(value)) throw new CompilerError('VM rejected a non-finite numeric result.'); return value; };
  const push = (value: number) => { if (stack.length >= MAX_STACK) throw new CompilerError(`VM stack limit (${MAX_STACK}) exceeded.`); stack.push(finite(value)); };
  while (ip < code.length) {
    if (++steps > MAX_STEPS) throw new CompilerError(`VM step limit (${MAX_STEPS}) exceeded.`);
    const instruction = code[ip]!;
    switch (instruction.opcode) {
      case 'PUSH': push(instruction.value); break;
      case 'LOAD': { const value = memory[instruction.slot]; if (value === undefined) throw new CompilerError(`VM read of uninitialized slot ${instruction.slot}.`); push(value); break; }
      case 'STORE': memory[instruction.slot] = requireValue(); break;
      case 'NEG': push(-requireValue()); break;
      case 'PRINT': output.push(String(requireValue())); break;
      case 'ADD': { const b = requireValue(), a = requireValue(); push(a + b); break; }
      case 'SUB': { const b = requireValue(), a = requireValue(); push(a - b); break; }
      case 'MUL': { const b = requireValue(), a = requireValue(); push(a * b); break; }
      case 'DIV': { const b = requireValue(), a = requireValue(); if (b === 0) throw new CompilerError('Division by zero.'); push(a / b); break; }
      case 'MOD': { const b = requireValue(), a = requireValue(); if (b === 0) throw new CompilerError('Division by zero.'); push(a % b); break; }
      case 'POW': { const b = requireValue(), a = requireValue(); push(a ** b); break; }
      case 'HALT': halted = true; break;
      default: throw new CompilerError('Unknown VM opcode.');
    }
    trace.push({ step: steps, ip, instruction: disassemble([instruction])[0]!, stack: [...stack], output: [...output] });
    ip += 1;
    if (halted) break;
  }
  if (!halted) throw new CompilerError('Missing HALT instruction.');
  const variables = Object.fromEntries(
    [...slots.entries()].map(([name, slot]) => [name, memory[slot]!]),
  ) as Record<string, number>;
  return { trace, output, result: output.length ? Number(output.at(-1)) : null, variables, steps };
}

export function compileAndRun(source: string): CompilationResult {
  const tokens = lex(source);
  const ast = new Parser(tokens).parse();
  const { instructions, slots } = compile(ast);
  const bytecode = encode(instructions);
  const decoded = decode(bytecode);
  return { tokens, ast, instructions, bytecode, canonicalInstructions: disassemble(decoded), ...execute(decoded, slots) };
}