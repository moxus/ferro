import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Analyzer } from "../analysis/analyzer";
import { Emitter } from "./emitter";

function parseAndEmit(input: string): string {
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();
    expect(parser.getErrors().length).toBe(0);
    const emitter = new Emitter();
    return emitter.emit(program);
}

function parseAnalyzeAndEmit(input: string): { ts: string; diagnostics: any[] } {
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();
    expect(parser.getErrors().length).toBe(0);
    const analyzer = new Analyzer();
    analyzer.analyze(program);
    const emitter = new Emitter();
    const ts = emitter.emit(program);
    return { ts, diagnostics: analyzer.diagnostics };
}

describe("TypeScript Codegen", () => {
    describe("Variable shadowing", () => {
        it("should handle shadowed variables in sequential let bindings", () => {
            const input = `
                let a: int = 10;
                let a: int = 20;
                print(a);
            `;
            const ts = parseAndEmit(input);
            // Both declarations should be emitted
            expect(ts).toContain("const a: int = 10");
            expect(ts).toContain("const a: int = 20");
        });

        it("should handle shadowed variables in if/else branches", () => {
            const input = `
                fn test(n: int) -> int {
                    if (n == 0) {
                        let x: int = 100;
                        return x;
                    };
                    let x: int = 200;
                    return x;
                }
            `;
            const ts = parseAndEmit(input);
            expect(ts).toContain("const x: int = 100");
            expect(ts).toContain("const x: int = 200");
        });
    });

    describe("File I/O codegen", () => {
        it("should emit File::open as new _File constructor", () => {
            const ts = parseAndEmit(`let f = File::open("test.txt", "r");`);
            expect(ts).toContain('new _File("test.txt", "r")');
        });

        it("should emit File::read_to_string as fs.readFileSync", () => {
            const ts = parseAndEmit(`let s = File::read_to_string("test.txt");`);
            expect(ts).toContain('fs.readFileSync("test.txt", "utf8")');
        });

        it("should emit File::write_to_string as fs.writeFileSync", () => {
            const ts = parseAndEmit(`File::write_to_string("out.txt", "hello");`);
            expect(ts).toContain('fs.writeFileSync');
            expect(ts).toContain('"out.txt"');
            expect(ts).toContain('"hello"');
        });

        it("should emit method calls on File objects", () => {
            const input = `
                let mut f = File::open("test.txt", "r");
                let line = f.read_line();
                f.close();
            `;
            const ts = parseAndEmit(input);
            expect(ts).toContain("f.read_line()");
            expect(ts).toContain("f.close()");
        });

        it("should include _File class in runtime preamble", () => {
            const ts = parseAndEmit(`let x: int = 1;`);
            expect(ts).toContain("class _File");
            expect(ts).toContain("read_line()");
            expect(ts).toContain("write_string(s: string)");
            expect(ts).toContain("close()");
        });
    });

    describe("print function", () => {
        it("should include print function in runtime preamble", () => {
            const ts = parseAndEmit(`print("hello");`);
            expect(ts).toContain("function print(");
            expect(ts).toContain("console.log");
        });

        it("should emit print calls correctly", () => {
            const ts = parseAndEmit(`print("hello");`);
            expect(ts).toContain('print("hello")');
        });
    });

    describe("Branch returns", () => {
        it("should emit if/else expression as value-returning code", () => {
            const input = `
                fn test(b: bool) -> string {
                    if (b) {
                        return "yes";
                    } else {
                        return "no";
                    }
                }
            `;
            const ts = parseAndEmit(input);
            expect(ts).toContain('return "yes"');
            expect(ts).toContain('return "no"');
        });

        it("should handle multiple early returns", () => {
            const input = `
                fn classify(n: int) -> string {
                    if (n < 0) {
                        return "negative";
                    };
                    if (n == 0) {
                        return "zero";
                    };
                    return "positive";
                }
            `;
            const ts = parseAndEmit(input);
            expect(ts).toContain('return "negative"');
            expect(ts).toContain('return "zero"');
            expect(ts).toContain('return "positive"');
        });
    });

    describe("Analyzer type checking for File I/O", () => {
        it("should accept File::open with correct types", () => {
            const { diagnostics } = parseAnalyzeAndEmit(
                `let f = File::open("test.txt", "r");`
            );
            expect(diagnostics.length).toBe(0);
        });

        it("should accept File::read_to_string returns string", () => {
            const { diagnostics } = parseAnalyzeAndEmit(
                `let s: string = File::read_to_string("test.txt");`
            );
            expect(diagnostics.length).toBe(0);
        });

        it("should accept File method calls", () => {
            const { diagnostics } = parseAnalyzeAndEmit(`
                let mut f = File::open("test.txt", "r");
                let line: string = f.read_line();
                f.close();
            `);
            expect(diagnostics.length).toBe(0);
        });
    });
});
