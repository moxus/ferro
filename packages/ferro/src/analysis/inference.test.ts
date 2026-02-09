import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Analyzer } from "./analyzer";
import * as AST from "../ast/ast";

function parseAndAnalyze(input: string) {
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();
    expect(parser.getErrors().length).toBe(0);
    const analyzer = new Analyzer();
    analyzer.analyze(program);
    return { program, analyzer };
}

function findClosure(program: AST.Program): AST.ClosureExpression | null {
    for (const stmt of program.statements) {
        if (stmt instanceof AST.ExpressionStatement && stmt.expression) {
            const expr = stmt.expression;
            if (expr instanceof AST.MethodCallExpression && expr.arguments.length > 0) {
                const arg = expr.arguments[0];
                if (arg instanceof AST.ClosureExpression) return arg;
            }
            if (expr instanceof AST.CallExpression && expr.arguments.length > 0) {
                for (const arg of expr.arguments) {
                    if (arg instanceof AST.ClosureExpression) return arg;
                }
            }
        }
        if (stmt instanceof AST.LetStatement && stmt.value) {
            if (stmt.value instanceof AST.MethodCallExpression && stmt.value.arguments.length > 0) {
                const arg = stmt.value.arguments[0];
                if (arg instanceof AST.ClosureExpression) return arg;
            }
        }
    }
    return null;
}

describe("Bidirectional Type Inference", () => {
    describe("Vec.map trailing lambda", () => {
        it("should infer param type from Vec<int> element type", () => {
            const input = `
                let mut v = Vec<int>::new();
                v.push(1);
                let r = v.map { x -> x * 2 };
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.parameters[0].type).not.toBeNull();
            expect(closure!.parameters[0].type!.toString()).toBe("int");
        });

        it("should infer param type with implicit it", () => {
            const input = `
                let mut v = Vec<int>::new();
                v.push(1);
                let r = v.map { it * 2 };
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.hasImplicitIt).toBe(true);
            expect(closure!.parameters[0].type).not.toBeNull();
            expect(closure!.parameters[0].type!.toString()).toBe("int");
        });

        it("should infer return type from body expression", () => {
            const input = `
                let mut v = Vec<int>::new();
                v.push(1);
                let r = v.map { x -> x * 2 };
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.returnType).not.toBeNull();
        });

        it("should preserve explicit type annotations", () => {
            const input = `
                let mut v = Vec<int>::new();
                v.push(1);
                let r = v.map((x: int) -> int { x * 2 });
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.parameters[0].type).not.toBeNull();
            expect(closure!.parameters[0].type!.toString()).toBe("int");
        });

        it("should infer param type from Vec<string> element type", () => {
            const input = `
                let mut v = Vec<string>::new();
                v.push("hello");
                let r = v.map { s -> s };
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.parameters[0].type!.toString()).toBe("string");
        });
    });

    describe("Vec.filter trailing lambda", () => {
        it("should infer param type and bool return type", () => {
            const input = `
                let mut v = Vec<int>::new();
                v.push(1);
                let r = v.filter { x -> x > 1 };
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.parameters[0].type).not.toBeNull();
            expect(closure!.parameters[0].type!.toString()).toBe("int");
            expect(closure!.returnType).not.toBeNull();
            expect(closure!.returnType!.toString()).toBe("bool");
        });

        it("should infer filter with implicit it", () => {
            const input = `
                let mut v = Vec<int>::new();
                v.push(1);
                let r = v.filter { it > 1 };
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.hasImplicitIt).toBe(true);
            expect(closure!.parameters[0].type!.toString()).toBe("int");
            expect(closure!.returnType!.toString()).toBe("bool");
        });
    });

    describe("Function call inference", () => {
        it("should infer closure param types from function signature (trailing lambda)", () => {
            const input = `
                fn apply(x: int, f: (int) -> int) -> int {
                    f(x)
                }
                apply(5) { x -> x + 1 };
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.parameters[0].type).not.toBeNull();
            expect(closure!.parameters[0].type!.toString()).toBe("int");
            expect(closure!.returnType).not.toBeNull();
            expect(closure!.returnType!.toString()).toBe("int");
        });

        it("should infer multi-param trailing lambda from function signature", () => {
            const input = `
                fn combine(a: int, b: int, f: (int, int) -> int) -> int {
                    f(a, b)
                }
                combine(3, 4) { a, b -> a + b };
            `;
            const { program, analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);

            const closure = findClosure(program);
            expect(closure).not.toBeNull();
            expect(closure!.parameters.length).toBe(2);
            expect(closure!.parameters[0].type!.toString()).toBe("int");
            expect(closure!.parameters[1].type!.toString()).toBe("int");
        });
    });

    describe("No diagnostics for inferred closures", () => {
        it("should not produce diagnostics for fully inferred closures", () => {
            const input = `
                let mut v = Vec<int>::new();
                v.push(1);
                v.push(2);
                v.push(3);
                let doubled = v.map { x -> x * 2 };
                let big = v.filter { it > 1 };
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("f64 floating-point types", () => {
        it("should type-check f64 literals and arithmetic", () => {
            const input = `
                let pi: f64 = 3.14;
                let e: f64 = 2.718;
                let sum: f64 = pi + e;
                let diff: f64 = pi - e;
                let prod: f64 = pi * e;
                let quot: f64 = pi / e;
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check f64 comparisons", () => {
            const input = `
                let a: f64 = 1.5;
                let b: f64 = 2.5;
                let gt: bool = a > b;
                let eq: bool = a == a;
                let lt: bool = a < b;
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check f64 function parameters and return", () => {
            const input = `
                fn add(a: f64, b: f64) -> f64 {
                    a + b
                }
                let result: f64 = add(1.5, 2.5);
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should allow f64 in f-string interpolation", () => {
            const input = `
                let x: f64 = 3.14;
                let msg: string = f"value is {x}";
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should reject mixed int/f64 arithmetic", () => {
            const input = `
                let a: f64 = 3.14;
                let b: int = 2;
                let c: f64 = a + b;
            `;
            const { analyzer } = parseAndAnalyze(input);
            expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        });
    });
});
