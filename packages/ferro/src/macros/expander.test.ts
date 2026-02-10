import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer/lexer";
import { Parser } from "../parser/parser";
import { Emitter } from "../codegen/emitter";
import { Expander } from "./expander";

function expandAndEmit(input: string): string {
    const lexer = new Lexer(input);
    const parser = new Parser(lexer);
    const program = parser.ParseProgram();
    expect(parser.getErrors()).toHaveLength(0);

    const expander = new Expander();
    const expanded = expander.expand(program);

    const emitter = new Emitter();
    return emitter.emit(expanded);
}

describe("Macro Expander", () => {
    it("should expand a return macro with a literal argument", () => {
        const input = `
            macro r(n) {
                quote! {
                    return $n;
                }
            }

            fn main() {
                r!(10);
            }
        `;
        const ts = expandAndEmit(input);
        expect(ts).toContain("return 10");
    });

    it("should expand a return macro with an expression argument", () => {
        const input = `
            macro r(n) {
                quote! {
                    return $n;
                }
            }

            fn add(a: int, b: int) -> int {
                r!(a + b);
            }
        `;
        const ts = expandAndEmit(input);
        // The emitter may or may not wrap in parens; just verify return + operands
        expect(ts).toContain("return");
        expect(ts).toMatch(/return\s.*a\s*\+\s*b/);
    });

    it("should expand a return macro with a string argument", () => {
        const input = `
            macro r(n) {
                quote! {
                    return $n;
                }
            }

            fn greet() -> string {
                r!("hello");
            }
        `;
        const ts = expandAndEmit(input);
        expect(ts).toContain('return "hello"');
    });

    it("should expand a return macro in multiple functions", () => {
        const input = `
            macro r(n) {
                quote! {
                    return $n;
                }
            }

            fn foo() -> int {
                r!(1);
            }

            fn bar() -> int {
                r!(2);
            }
        `;
        const ts = expandAndEmit(input);
        expect(ts).toContain("return 1");
        expect(ts).toContain("return 2");
    });
});
