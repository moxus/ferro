import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Analyzer } from "../analysis/analyzer";
import { Emitter } from "../codegen/emitter";
import * as AST from "../ast/ast";

function parse(input: string) {
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();
    return { program, errors: parser.getErrors() };
}

function parseAndAnalyze(input: string) {
    const { program, errors } = parse(input);
    expect(errors.length).toBe(0);
    const analyzer = new Analyzer();
    analyzer.analyze(program);
    return { program, analyzer };
}

function parseAndEmit(input: string): string {
    const { program, errors } = parse(input);
    expect(errors.length).toBe(0);
    const emitter = new Emitter();
    return emitter.emit(program);
}

function parseAnalyzeAndEmit(input: string): { ts: string; diagnostics: any[] } {
    const { program, errors } = parse(input);
    expect(errors.length).toBe(0);
    const analyzer = new Analyzer();
    analyzer.analyze(program);
    const emitter = new Emitter();
    const ts = emitter.emit(program);
    return { ts, diagnostics: analyzer.diagnostics };
}

// ============================================================
// 1. Tuple Types
// ============================================================

describe("Tuple Types", () => {
    describe("Parsing", () => {
        it("should parse tuple literal (a, b)", () => {
            const { program, errors } = parse(`let t = (1, 2);`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            expect(stmt.value).toBeInstanceOf(AST.TupleLiteral);
            const tuple = stmt.value as AST.TupleLiteral;
            expect(tuple.elements.length).toBe(2);
        });

        it("should parse 3-element tuple", () => {
            const { program, errors } = parse(`let t = (1, "hello", true);`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            const tuple = stmt.value as AST.TupleLiteral;
            expect(tuple.elements.length).toBe(3);
        });

        it("should parse tuple index .0 .1", () => {
            const { program, errors } = parse(`
                let t = (1, 2);
                let a = t.0;
                let b = t.1;
            `);
            expect(errors.length).toBe(0);
            const stmt1 = program.statements[1] as AST.LetStatement;
            expect(stmt1.value).toBeInstanceOf(AST.TupleIndexExpression);
            const idx = stmt1.value as AST.TupleIndexExpression;
            expect(idx.index).toBe(0);

            const stmt2 = program.statements[2] as AST.LetStatement;
            const idx2 = stmt2.value as AST.TupleIndexExpression;
            expect(idx2.index).toBe(1);
        });

        it("should parse tuple type annotation", () => {
            const { program, errors } = parse(`let t: (int, string) = (1, "hello");`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            expect(stmt.type).toBeInstanceOf(AST.TupleType);
            const tt = stmt.type as AST.TupleType;
            expect(tt.elements.length).toBe(2);
        });

        it("should not confuse grouped expression with tuple", () => {
            const { program, errors } = parse(`let x = (42);`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            // (42) is a grouped expression, not a tuple
            expect(stmt.value).not.toBeInstanceOf(AST.TupleLiteral);
            expect(stmt.value).toBeInstanceOf(AST.IntegerLiteral);
        });
    });

    describe("Type Analysis", () => {
        it("should infer tuple element types", () => {
            const { analyzer } = parseAndAnalyze(`
                let t = (42, "hello", true);
                let a = t.0;
                let b = t.1;
                let c = t.2;
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should error on out-of-bounds tuple index", () => {
            const { analyzer } = parseAndAnalyze(`
                let t = (1, 2);
                let a = t.5;
            `);
            expect(analyzer.diagnostics.length).toBeGreaterThan(0);
            expect(analyzer.diagnostics[0].message).toContain("out of bounds");
        });
    });

    describe("TypeScript Codegen", () => {
        it("should emit tuple as array literal", () => {
            const ts = parseAndEmit(`let t = (1, 2, 3);`);
            expect(ts).toContain("[1, 2, 3]");
        });

        it("should emit tuple index as array index", () => {
            const ts = parseAndEmit(`
                let t = (1, 2);
                let a = t.0;
            `);
            expect(ts).toContain("[1, 2]");
            expect(ts).toContain("t[0]");
        });

        it("should emit tuple type as TS tuple type", () => {
            const ts = parseAndEmit(`let t: (int, string) = (1, "hello");`);
            expect(ts).toContain("[number, string]");
        });
    });
});

// ============================================================
// 2. String Methods
// ============================================================

describe("String Methods", () => {
    describe("Type Analysis", () => {
        it("should type-check .len() as int", () => {
            const { analyzer } = parseAndAnalyze(`
                fn test(s: string) -> int {
                    s.len()
                }
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .contains() as bool", () => {
            const { analyzer } = parseAndAnalyze(`
                fn test(s: string) -> bool {
                    s.contains("x")
                }
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .starts_with() as bool", () => {
            const { analyzer } = parseAndAnalyze(`
                fn test(s: string) -> bool {
                    s.starts_with("h")
                }
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .trim() as string", () => {
            const { analyzer } = parseAndAnalyze(`
                fn test(s: string) -> string {
                    s.trim()
                }
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .to_uppercase() as string", () => {
            const { analyzer } = parseAndAnalyze(`
                fn test(s: string) -> string {
                    s.to_uppercase()
                }
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .split() as Vec<string>", () => {
            const { analyzer } = parseAndAnalyze(`
                fn test(s: string) {
                    let parts = s.split(",");
                }
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should type-check .is_empty() as bool", () => {
            const { analyzer } = parseAndAnalyze(`
                fn test(s: string) -> bool {
                    s.is_empty()
                }
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("TypeScript Codegen", () => {
        it("should emit .len() as .length", () => {
            const ts = parseAndEmit(`
                let s = "hello";
                let n = s.len();
            `);
            expect(ts).toContain("s.length");
        });

        it("should emit .contains() as .includes()", () => {
            const ts = parseAndEmit(`
                let s = "hello world";
                let b = s.contains("world");
            `);
            expect(ts).toContain(`s.includes("world")`);
        });

        it("should emit .starts_with() as .startsWith()", () => {
            const ts = parseAndEmit(`
                let s = "hello";
                let b = s.starts_with("h");
            `);
            expect(ts).toContain(`s.startsWith("h")`);
        });

        it("should emit .ends_with() as .endsWith()", () => {
            const ts = parseAndEmit(`
                let s = "hello";
                let b = s.ends_with("o");
            `);
            expect(ts).toContain(`s.endsWith("o")`);
        });

        it("should emit .trim() as .trim()", () => {
            const ts = parseAndEmit(`
                let s = "  hello  ";
                let t = s.trim();
            `);
            expect(ts).toContain("s.trim()");
        });

        it("should emit .to_uppercase() as .toUpperCase()", () => {
            const ts = parseAndEmit(`
                let s = "hello";
                let u = s.to_uppercase();
            `);
            expect(ts).toContain("s.toUpperCase()");
        });

        it("should emit .to_lowercase() as .toLowerCase()", () => {
            const ts = parseAndEmit(`
                let s = "HELLO";
                let l = s.to_lowercase();
            `);
            expect(ts).toContain("s.toLowerCase()");
        });

        it("should emit .replace() as .replace()", () => {
            const ts = parseAndEmit(`
                let s = "hello world";
                let r = s.replace("world", "Ferro");
            `);
            expect(ts).toContain(`s.replace("world", "Ferro")`);
        });

        it("should emit .split() as .split()", () => {
            const ts = parseAndEmit(`
                let s = "a,b,c";
                let parts = s.split(",");
            `);
            expect(ts).toContain(`s.split(",")`);
        });

        it("should emit .repeat() as .repeat()", () => {
            const ts = parseAndEmit(`
                let s = "ha";
                let r = s.repeat(3);
            `);
            expect(ts).toContain("s.repeat(3)");
        });

        it("should emit .is_empty() as length check", () => {
            const ts = parseAndEmit(`
                let s = "";
                let b = s.is_empty();
            `);
            expect(ts).toContain("(s.length === 0)");
        });

        it("should emit .index_of() as .indexOf()", () => {
            const ts = parseAndEmit(`
                let s = "hello";
                let i = s.index_of("ll");
            `);
            expect(ts).toContain(`s.indexOf("ll")`);
        });

        it("should emit .char_at() as .charAt()", () => {
            const ts = parseAndEmit(`
                let s = "hello";
                let c = s.char_at(0);
            `);
            expect(ts).toContain("s.charAt(0)");
        });

        it("should emit .slice() as .slice()", () => {
            const ts = parseAndEmit(`
                let s = "hello";
                let sub = s.slice(1, 3);
            `);
            expect(ts).toContain("s.slice(1, 3)");
        });
    });
});

// ============================================================
// 3. Pattern Match Exhaustiveness
// ============================================================

describe("Pattern Match Exhaustiveness", () => {
    it("should warn when enum match is missing variants", () => {
        const { analyzer } = parseAndAnalyze(`
            enum Color { Red, Green, Blue }
            fn test(c: Color) -> int {
                match c {
                    Color::Red => { 1 }
                    Color::Green => { 2 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("Non-exhaustive");
        expect(analyzer.diagnostics[0].message).toContain("Blue");
    });

    it("should not warn when all enum variants are covered", () => {
        const { analyzer } = parseAndAnalyze(`
            enum Color { Red, Green, Blue }
            fn test(c: Color) -> int {
                match c {
                    Color::Red => { 1 }
                    Color::Green => { 2 }
                    Color::Blue => { 3 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBe(0);
    });

    it("should not warn when wildcard is present", () => {
        const { analyzer } = parseAndAnalyze(`
            enum Color { Red, Green, Blue }
            fn test(c: Color) -> int {
                match c {
                    Color::Red => { 1 }
                    _ => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBe(0);
    });

    it("should warn when Option match is missing Some", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(opt: Option<int>) -> int {
                match opt {
                    Option::None => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("Non-exhaustive");
        expect(analyzer.diagnostics[0].message).toContain("Some");
    });

    it("should warn when Option match is missing None", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(opt: Option<int>) -> int {
                match opt {
                    Option::Some(v) => { v }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("Non-exhaustive");
        expect(analyzer.diagnostics[0].message).toContain("None");
    });

    it("should not warn when Option match covers both variants", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(opt: Option<int>) -> int {
                match opt {
                    Option::Some(v) => { v }
                    Option::None => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBe(0);
    });

    it("should warn when Result match is missing Ok", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(res: Result<int, string>) -> int {
                match res {
                    Result::Err(e) => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("Non-exhaustive");
        expect(analyzer.diagnostics[0].message).toContain("Ok");
    });

    it("should not warn when Result match covers both variants", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(res: Result<int, string>) -> int {
                match res {
                    Result::Ok(v) => { v }
                    Result::Err(e) => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBe(0);
    });

    it("should warn about multiple missing variants", () => {
        const { analyzer } = parseAndAnalyze(`
            enum Direction { North, South, East, West }
            fn test(d: Direction) -> int {
                match d {
                    Direction::North => { 1 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("South");
        expect(analyzer.diagnostics[0].message).toContain("East");
        expect(analyzer.diagnostics[0].message).toContain("West");
    });

    // --- Bool exhaustiveness ---

    it("should error when bool match is missing 'false'", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(b: bool) -> int {
                match b {
                    true => { 1 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("Non-exhaustive");
        expect(analyzer.diagnostics[0].message).toContain("false");
    });

    it("should error when bool match is missing 'true'", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(b: bool) -> int {
                match b {
                    false => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("Non-exhaustive");
        expect(analyzer.diagnostics[0].message).toContain("true");
    });

    it("should not error when bool match covers both true and false", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(b: bool) -> int {
                match b {
                    true => { 1 }
                    false => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBe(0);
    });

    it("should not error when bool match has wildcard", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(b: bool) -> int {
                match b {
                    true => { 1 }
                    _ => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBe(0);
    });

    // --- Non-enumerable type exhaustiveness (int, string, etc.) ---

    it("should error when int match has no wildcard", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(x: int) -> int {
                match x {
                    1 => { 10 }
                    2 => { 20 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("Non-exhaustive");
        expect(analyzer.diagnostics[0].message).toContain("wildcard");
    });

    it("should not error when int match has wildcard", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(x: int) -> int {
                match x {
                    1 => { 10 }
                    2 => { 20 }
                    _ => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBe(0);
    });

    it("should error when string match has no wildcard", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(s: string) -> int {
                match s {
                    "hello" => { 1 }
                    "world" => { 2 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        expect(analyzer.diagnostics[0].message).toContain("Non-exhaustive");
        expect(analyzer.diagnostics[0].message).toContain("wildcard");
    });

    it("should not error when string match has wildcard", () => {
        const { analyzer } = parseAndAnalyze(`
            fn test(s: string) -> int {
                match s {
                    "hello" => { 1 }
                    _ => { 0 }
                }
            }
        `);
        expect(analyzer.diagnostics.length).toBe(0);
    });
});

// ============================================================
// 4. const Declarations
// ============================================================

describe("const Declarations", () => {
    describe("Parsing", () => {
        it("should parse const with type annotation", () => {
            const { program, errors } = parse(`const PI: f64 = 3.14159;`);
            expect(errors.length).toBe(0);
            expect(program.statements.length).toBe(1);
            const stmt = program.statements[0] as AST.ConstStatement;
            expect(stmt).toBeInstanceOf(AST.ConstStatement);
            expect(stmt.name.value).toBe("PI");
            expect(stmt.type).toBeTruthy();
        });

        it("should parse const without type annotation", () => {
            const { program, errors } = parse(`const MAX = 100;`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.ConstStatement;
            expect(stmt).toBeInstanceOf(AST.ConstStatement);
            expect(stmt.name.value).toBe("MAX");
            expect(stmt.type).toBeNull();
        });

        it("should parse const with string value", () => {
            const { program, errors } = parse(`const GREETING: string = "hello";`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.ConstStatement;
            expect(stmt.name.value).toBe("GREETING");
        });

        it("should parse const with bool value", () => {
            const { program, errors } = parse(`const DEBUG: bool = false;`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.ConstStatement;
            expect(stmt.name.value).toBe("DEBUG");
        });
    });

    describe("Type Analysis", () => {
        it("should define const in scope", () => {
            const { analyzer } = parseAndAnalyze(`
                const PI: f64 = 3.14;
                fn area(r: f64) -> f64 {
                    PI
                }
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should error on non-literal const value", () => {
            const { analyzer } = parseAndAnalyze(`
                fn get_val() -> int { 42 }
                const X: int = get_val();
            `);
            expect(analyzer.diagnostics.length).toBeGreaterThan(0);
            expect(analyzer.diagnostics[0].message).toContain("compile-time constant");
        });

        it("should allow negative literal as const", () => {
            const { analyzer } = parseAndAnalyze(`
                const NEG: int = -1;
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("TypeScript Codegen", () => {
        it("should emit const as const", () => {
            const ts = parseAndEmit(`const PI: f64 = 3.14;`);
            expect(ts).toContain("const PI");
            expect(ts).toContain("3.14");
        });

        it("should emit const without type annotation", () => {
            const ts = parseAndEmit(`const MAX = 100;`);
            expect(ts).toContain("const MAX = 100");
        });

        it("should emit exported const", () => {
            const ts = parseAndEmit(`export const VERSION: string = "1.0";`);
            expect(ts).toContain("export const VERSION");
        });
    });
});

// ============================================================
// 11. Type Aliases
// ============================================================

describe("Type Aliases", () => {
    describe("Parsing", () => {
        it("should parse simple type alias", () => {
            const { program, errors } = parse(`type Num = int;`);
            expect(errors.length).toBe(0);
            expect(program.statements[0]).toBeInstanceOf(AST.TypeAliasStatement);
            const alias = program.statements[0] as AST.TypeAliasStatement;
            expect(alias.name.value).toBe("Num");
            expect(alias.typeValue).toBeInstanceOf(AST.TypeIdentifier);
        });

        it("should parse tuple type alias", () => {
            const { program, errors } = parse(`type Pair = (int, string);`);
            expect(errors.length).toBe(0);
            const alias = program.statements[0] as AST.TypeAliasStatement;
            expect(alias.name.value).toBe("Pair");
            expect(alias.typeValue).toBeInstanceOf(AST.TupleType);
        });

        it("should parse function type alias", () => {
            const { program, errors } = parse(`type Callback = (int) -> bool;`);
            expect(errors.length).toBe(0);
            const alias = program.statements[0] as AST.TypeAliasStatement;
            expect(alias.typeValue).toBeInstanceOf(AST.FunctionTypeNode);
        });

        it("should parse generic type alias", () => {
            const { program, errors } = parse(`type StringMap = HashMap<string, string>;`);
            expect(errors.length).toBe(0);
            const alias = program.statements[0] as AST.TypeAliasStatement;
            expect(alias.typeValue).toBeInstanceOf(AST.TypeIdentifier);
            const t = alias.typeValue as AST.TypeIdentifier;
            expect(t.value).toBe("HashMap");
            expect(t.typeParams.length).toBe(2);
        });
    });

    describe("Type Analysis", () => {
        it("should resolve type alias in variable declarations", () => {
            const { analyzer } = parseAndAnalyze(`
                type Num = int;
                let x: Num = 42;
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });

        it("should resolve aliased tuple type", () => {
            const { analyzer } = parseAndAnalyze(`
                type Pair = (int, int);
                let p: Pair = (1, 2);
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("TypeScript Codegen", () => {
        it("should emit type alias as TS type declaration", () => {
            const ts = parseAndEmit(`type Num = int;`);
            expect(ts).toContain("type Num = number;");
        });

        it("should emit tuple type alias", () => {
            const ts = parseAndEmit(`type Pair = (int, string);`);
            expect(ts).toContain("type Pair = [number, string];");
        });

        it("should emit function type alias", () => {
            const ts = parseAndEmit(`type Callback = (int) -> bool;`);
            expect(ts).toContain("type Callback =");
        });
    });
});

// ============================================================
// 12. Array Types (Fixed-Size)
// ============================================================

describe("Array Types", () => {
    describe("Parsing", () => {
        it("should parse array type annotation [int; 5]", () => {
            const { program, errors } = parse(`let arr: [int; 5] = [0; 5];`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            expect(stmt.type).toBeInstanceOf(AST.ArrayType);
            const arrType = stmt.type as AST.ArrayType;
            expect(arrType.size).toBe(5);
        });

        it("should parse array repeat expression [val; N]", () => {
            const { program, errors } = parse(`let arr = [0; 10];`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            expect(stmt.value).toBeInstanceOf(AST.ArrayRepeatExpression);
            const repeat = stmt.value as AST.ArrayRepeatExpression;
            expect(repeat.count).toBe(10);
        });

        it("should still parse regular array literals", () => {
            const { program, errors } = parse(`let arr = [1, 2, 3];`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            expect(stmt.value).toBeInstanceOf(AST.ArrayLiteral);
        });
    });

    describe("Type Analysis", () => {
        it("should infer array repeat type", () => {
            const { analyzer } = parseAndAnalyze(`
                let arr = [0; 5];
            `);
            expect(analyzer.diagnostics.length).toBe(0);
        });
    });

    describe("TypeScript Codegen", () => {
        it("should emit array repeat as Array(N).fill(val)", () => {
            const ts = parseAndEmit(`let arr = [0; 5];`);
            expect(ts).toContain("Array(5).fill(0)");
        });

        it("should emit array type annotation", () => {
            const ts = parseAndEmit(`let arr: [int; 5] = [0; 5];`);
            expect(ts).toContain("number[]");
        });
    });
});

// ============================================================
// 13. Async/Await
// ============================================================

describe("Async/Await", () => {
    describe("Parsing", () => {
        it("should parse async function declaration", () => {
            const { program, errors } = parse(`
                async fn fetch_data() -> string {
                    "hello"
                }
            `);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.ExpressionStatement;
            expect(stmt.expression).toBeInstanceOf(AST.FunctionLiteral);
            const fn = stmt.expression as AST.FunctionLiteral;
            expect((fn as any).isAsync).toBe(true);
        });

        it("should parse await expression (prefix)", () => {
            const { program, errors } = parse(`let x = await get_data();`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            expect(stmt.value).toBeInstanceOf(AST.AwaitExpression);
        });

        it("should parse .await syntax (postfix)", () => {
            const { program, errors } = parse(`let x = get_data().await;`);
            expect(errors.length).toBe(0);
            const stmt = program.statements[0] as AST.LetStatement;
            expect(stmt.value).toBeInstanceOf(AST.AwaitExpression);
        });
    });

    describe("Type Analysis", () => {
        it("should warn when await is used outside async function", () => {
            const { analyzer } = parseAndAnalyze(`
                fn sync_fn() -> int {
                    let x = await something();
                    x
                }
            `);
            expect(analyzer.diagnostics.length).toBeGreaterThan(0);
            expect(analyzer.diagnostics.some(d => d.message.includes("await"))).toBe(true);
        });
    });

    describe("TypeScript Codegen", () => {
        it("should emit async function", () => {
            const ts = parseAndEmit(`
                async fn fetch_data() -> string {
                    "hello"
                }
            `);
            expect(ts).toContain("async function fetch_data");
        });

        it("should emit await expression", () => {
            const ts = parseAndEmit(`let x = await get_data();`);
            expect(ts).toContain("await get_data()");
        });
    });
});

// ============================================================
// 14. Cycle Detection (Weak References)
// ============================================================

describe("Weak References", () => {
    describe("Parsing", () => {
        it("should parse Weak<T> type annotation", () => {
            const { program, errors } = parse(`let w: Weak<int> = Weak::new(42);`);
            expect(errors.length).toBe(0);
        });
    });

    describe("TypeScript Codegen", () => {
        it("should emit Weak::new as _weak_new", () => {
            const ts = parseAndEmit(`let w = Weak::new(obj);`);
            expect(ts).toContain("_weak_new(obj)");
        });

        it("should emit Weak::downgrade as _weak_new", () => {
            const ts = parseAndEmit(`let w = Weak::downgrade(obj);`);
            expect(ts).toContain("_weak_new(obj)");
        });
    });
});

// ============================================================
// 15. FFI Enhancements (Extern Blocks)
// ============================================================

describe("FFI Enhancements", () => {
    describe("Parsing", () => {
        it("should parse extern block with ABI", () => {
            const { program, errors } = parse(`
                extern "C" {
                    fn printf(fmt: *i8, ...) -> int;
                    fn malloc(size: int) -> *i8;
                }
            `);
            expect(errors.length).toBe(0);
            expect(program.statements[0]).toBeInstanceOf(AST.ExternBlockStatement);
            const block = program.statements[0] as AST.ExternBlockStatement;
            expect(block.abi).toBe("C");
            expect(block.statements.length).toBe(2);
        });

        it("should still parse single extern fn", () => {
            const { program, errors } = parse(`extern fn puts(s: *i8) -> int;`);
            expect(errors.length).toBe(0);
            expect(program.statements[0]).toBeInstanceOf(AST.ExternStatement);
        });
    });

    describe("TypeScript Codegen", () => {
        it("should emit nothing for extern blocks (declarations only)", () => {
            const ts = parseAndEmit(`
                extern "C" {
                    fn malloc(size: int) -> *i8;
                }
            `);
            // Extern blocks produce no TS output
            expect(ts).not.toContain("malloc");
        });
    });
});
