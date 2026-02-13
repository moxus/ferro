import { Lexer } from '@ferro/lexer/lexer';
import { Parser } from '@ferro/parser/parser';
import { Expander } from '@ferro/macros/expander';
import { Analyzer } from '@ferro/analysis/analyzer';
import { Emitter } from '@ferro/codegen/emitter';
import { transform } from 'sucrase';

export interface DiagnosticInfo {
  message: string;
  line: number;
  col: number;
  severity: 'error' | 'warning';
}

export interface CompileResult {
  code: string | null;
  diagnostics: DiagnosticInfo[];
}

export function compile(source: string): CompileResult {
  const diagnostics: DiagnosticInfo[] = [];

  try {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    const parsedProgram = parser.ParseProgram();

    const errors = parser.getErrors();
    if (errors.length > 0) {
      errors.forEach(err => {
        diagnostics.push({
          message: err.msg,
          line: err.line,
          col: err.col,
          severity: 'error'
        });
      });
      return { code: null, diagnostics };
    }

    const expander = new Expander();
    const program = expander.expand(parsedProgram);

    const analyzer = new Analyzer();
    analyzer.analyze(program);

    if (analyzer.diagnostics.length > 0) {
      analyzer.diagnostics.forEach(d => {
        diagnostics.push({
          message: d.message,
          line: d.line,
          col: d.col,
          severity: 'error'
        });
      });
      return { code: null, diagnostics };
    }

    const emitter = new Emitter();
    const tsOutput = emitter.emit(program);

    // Strip TypeScript type annotations to get executable JavaScript
    const { code: jsCode } = transform(tsOutput, {
      transforms: ['typescript'],
      disableESTransforms: true,
    });

    // Remove Node.js-specific code from the runtime preamble
    let code = jsCode;
    // Remove ESM import (not valid inside Function())
    code = code.replace(/import \* as fs from ["']fs["'];?\s*/g, '');
    // Remove _File class using brace-depth matching (regex is unreliable for nested braces)
    code = removeClassByName(code, '_File');

    return { code, diagnostics };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    diagnostics.push({ message, line: 1, col: 0, severity: 'error' });
    return { code: null, diagnostics };
  }
}

function removeClassByName(code: string, name: string): string {
  const marker = `class ${name}`;
  const start = code.indexOf(marker);
  if (start === -1) return code;

  let i = code.indexOf('{', start);
  if (i === -1) return code;

  let depth = 1;
  i++;
  while (i < code.length && depth > 0) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') depth--;
    i++;
  }

  return code.substring(0, start) + code.substring(i);
}

export function getDiagnostics(source: string): DiagnosticInfo[] {
  if (!source.trim()) return [];

  try {
    const lexer = new Lexer(source);
    const parser = new Parser(lexer);
    const parsedProgram = parser.ParseProgram();

    const errors = parser.getErrors();
    if (errors.length > 0) {
      return errors.map(err => ({
        message: err.msg,
        line: err.line,
        col: err.col,
        severity: 'error' as const
      }));
    }

    const expander = new Expander();
    const program = expander.expand(parsedProgram);

    const analyzer = new Analyzer();
    analyzer.analyze(program);

    return analyzer.diagnostics.map(d => ({
      message: d.message,
      line: d.line,
      col: d.col,
      severity: 'error' as const
    }));
  } catch {
    return [];
  }
}
