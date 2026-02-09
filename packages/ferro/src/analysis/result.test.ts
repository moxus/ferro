import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Analyzer } from "./analyzer";
import { Emitter } from "../codegen/emitter";

function parseAndAnalyze(input: string) {
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();
    expect(parser.getErrors().length).toBe(0);
    const analyzer = new Analyzer();
    analyzer.analyze(program);
    return { program, analyzer };
}

function parseAndEmit(input: string): string {
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();
    expect(parser.getErrors().length).toBe(0);
    const emitter = new Emitter();
    return emitter.emit(program);
}

describe("Result<T, E> Error Handling", () => {
    describe("Ok and Err constructors", () => {
        it("should type-check Ok(value) calls", () => {
            const input = `
                fn try_parse(s: string) -> Result<int, string> {
                    Ok(42)
                }
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check Err(error) calls", () => {
            const input = `
                fn try_parse(s: string) -> Result<int, string> {
                    Err("parse error")
                }
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should infer Result type from Ok/Err in function context", () => {
            const input = `
                fn divide(a: int, b: int) -> Result<int, string> {
                    if (b == 0) {
                        return Err("division by zero");
                    }
                    Ok(a / b)
                }
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("? operator", () => {
        it("should type-check ? on Result values in Result-returning functions", () => {
            const input = `
                fn parse_int(s: string) -> Result<int, string> {
                    Ok(42)
                }
                fn process(s: string) -> Result<int, string> {
                    let val = parse_int(s)?;
                    Ok(val + 1)
                }
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should error when ? is used in non-Result function", () => {
            const input = `
                fn parse_int(s: string) -> Result<int, string> {
                    Ok(42)
                }
                fn process(s: string) -> int {
                    let val = parse_int(s)?;
                    val + 1
                }
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBeGreaterThan(0);
            expect(analyzer.diagnostics[0].message).toContain("?");
        });
    });

    describe("Result methods", () => {
        it("should type-check .unwrap()", () => {
            const input = `
                fn get_val() -> Result<int, string> {
                    Ok(42)
                }
                let r = get_val();
                let v: int = r.unwrap();
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .unwrap_or(default)", () => {
            const input = `
                fn get_val() -> Result<int, string> {
                    Err("no value")
                }
                let r = get_val();
                let v: int = r.unwrap_or(0);
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .is_ok() and .is_err()", () => {
            const input = `
                fn get_val() -> Result<int, string> {
                    Ok(42)
                }
                let r = get_val();
                let ok: bool = r.is_ok();
                let err: bool = r.is_err();
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .map(f)", () => {
            const input = `
                fn get_val() -> Result<int, string> {
                    Ok(42)
                }
                let r = get_val();
                let mapped = r.map((x: int) -> int { x * 2 });
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .map_err(f)", () => {
            const input = `
                fn get_val() -> Result<int, string> {
                    Err("fail")
                }
                let r = get_val();
                let mapped = r.map_err((e: string) -> string { f"Error: {e}" });
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .and_then(f)", () => {
            const input = `
                fn parse(s: string) -> Result<int, string> {
                    Ok(42)
                }
                fn validate(n: int) -> Result<int, string> {
                    if (n > 0) {
                        Ok(n)
                    } else {
                        Err("must be positive")
                    }
                }
                let r = parse("42");
                let chained = r.and_then((n: int) -> Result<int, string> { validate(n) });
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("Result pattern matching", () => {
        it("should type-check match on Result::Ok and Result::Err", () => {
            const input = `
                fn get_val() -> Result<int, string> {
                    Ok(42)
                }
                let r = get_val();
                let msg = match r {
                    Result::Ok(v) => f"got {v}",
                    Result::Err(e) => f"error: {e}",
                };
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("Result type in type annotations", () => {
        it("should parse and resolve Result<T, E> type annotations", () => {
            const input = `
                fn foo() -> Result<int, string> {
                    Ok(42)
                }
                let r: Result<int, string> = foo();
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("TS code generation", () => {
        it("should emit Ok() and Err() constructors", () => {
            const output = parseAndEmit(`
                let a = Ok(42);
                let b = Err("fail");
            `);
            expect(output).toContain("Ok(42)");
            expect(output).toContain('Err("fail")');
        });

        it("should emit _try for ? operator", () => {
            const output = parseAndEmit(`
                fn parse_int(s: string) -> Result<int, string> {
                    Ok(42)
                }
                fn process(s: string) -> Result<int, string> {
                    let val = parse_int(s)?;
                    Ok(val)
                }
            `);
            expect(output).toContain("_try(");
        });

        it("should emit Result method helpers", () => {
            const output = parseAndEmit(`
                let r = Ok(42);
                let v = r.unwrap();
                let d = r.unwrap_or(0);
                let ok = r.is_ok();
                let err = r.is_err();
            `);
            expect(output).toContain("_result_unwrap(");
            expect(output).toContain("_result_unwrap_or(");
            expect(output).toContain("_result_is_ok(");
            expect(output).toContain("_result_is_err(");
        });

        it("should emit Result match using .ok property", () => {
            const output = parseAndEmit(`
                let r = Ok(42);
                let msg = match r {
                    Result::Ok(v) => v,
                    Result::Err(e) => 0,
                };
            `);
            expect(output).toContain("__match_val.ok");
            expect(output).toContain("__match_val.value");
            expect(output).toContain("__match_val.error");
        });

        it("should emit map on Result vars as _result_map", () => {
            const output = parseAndEmit(`
                let r = Ok(42);
                let mapped = r.map((x: int) -> int { x * 2 });
            `);
            expect(output).toContain("_result_map(");
        });
    });
});
