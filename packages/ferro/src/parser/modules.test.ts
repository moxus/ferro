
import { describe, it, expect } from "vitest";
import { Lexer } from "../lexer/lexer";
import { Parser } from "./parser";
import * as AST from "../ast/ast";

describe("Module Parsing", () => {
    it("should parse import statements", () => {
        const input = `
      import { foo, bar as baz } from "module_name";
    `;
        const lexer = new Lexer(input);
        const parser = new Parser(lexer);
        const program = parser.ParseProgram();

        expect(parser.getErrors().length).toBe(0);
        expect(program.statements.length).toBe(1);

        const stmt = program.statements[0] as AST.ImportStatement;
        expect(stmt).toBeInstanceOf(AST.ImportStatement);
        expect(stmt.source.value).toBe("module_name");

        expect(stmt.specifiers.length).toBe(2);
        expect(stmt.specifiers[0].name.value).toBe("foo");
        expect(stmt.specifiers[0].alias).toBeNull();

        expect(stmt.specifiers[1].name.value).toBe("bar");
        expect(stmt.specifiers[1].alias?.value).toBe("baz");
    });

    it("should parse export statements", () => {
        const input = `
      export fn my_func() {}
    `;
        const lexer = new Lexer(input);
        const parser = new Parser(lexer);
        const program = parser.ParseProgram();

        expect(parser.getErrors().length).toBe(0);
        expect(program.statements.length).toBe(1);

        const stmt = program.statements[0] as AST.ExportStatement;
        expect(stmt).toBeInstanceOf(AST.ExportStatement);

        const func = stmt.statement as unknown as AST.FunctionLiteral; // Actually it's an ExpressionStatement wrapping FunctionLiteral if not declared correctly? 
        // Wait, fn my_func() {} is an ExpressionStatement in my parser? No, parseFunctionLiteral returns Expression.
        // parseStatement calls parseFunctionLiteral if token is Fn.
        // Wait, parseStatement: case Fn: return parseFunctionLiteral().
        // parseFunctionLiteral returns Expression.
        // parseStatement expects Statement.
        // AST.FunctionLiteral implements Expression.
        // Does it implement Statement? No.
        // Let's check Parser.parseStatement again.

        // Line 66: registerPrefix(Fn, parseFunctionLiteral).
        // Line 128: default: return parseExpressionStatement().
        // So `fn ...` starts with `fn` keyword.
        // If I used `export fn ...`, `export` triggers `parseExportStatement`.
        // `parseExportStatement` consumes `export`, calls `parseStatement`.
        // The next token is `fn`.
        // `parseStatement` sees `Fn`.
        // My parser dispatch (switch case) does NOT have `case Fn`.
        // So it goes to `default: parseExpressionStatement`.
        // `parseExpressionStatement` calls `parseExpression`.
        // `parseExpression` sees `Fn` prefix -> calls `parseFunctionLiteral`.
        // returns `FunctionLiteral`.
        // `parseExpressionStatement` wraps it in `ExpressionStatement`.
        // So `stmt.statement` is `ExpressionStatement`.

        expect(stmt.statement).toBeInstanceOf(AST.ExpressionStatement);
    });
});
