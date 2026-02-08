import { describe, it, expect } from "vitest";
import { ParseError, formatError } from "./errors";
import { Lexer } from "./lexer/lexer";
import { Parser } from "./parser/parser";
import { Analyzer } from "./analysis/analyzer";

// Strip ANSI escape codes for assertion readability
function strip(s: string): string {
    return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("formatError", () => {
    it("should format a single-digit line error with caret", () => {
        const source = "let x = 10;\nlet y = unknown;";
        const output = strip(formatError("Variable 'unknown' not found", "/tmp/test.fe", 2, 9, source));

        expect(output).toContain("error: Variable 'unknown' not found");
        expect(output).toContain("--> ");
        expect(output).toContain("test.fe:2:9");
        expect(output).toContain("2 | let y = unknown;");
        expect(output).toContain("^");
    });

    it("should align the caret to the correct column", () => {
        const source = "    let x = bad_var;";
        const output = strip(formatError("not found", "/tmp/t.fe", 1, 13, source));
        const lines = output.split("\n");

        // The source line
        const srcLine = lines.find(l => l.includes("let x = bad_var;"))!;
        expect(srcLine).toBeDefined();

        // The caret line — caret should be at column 13 (1-indexed), so 12 spaces after the "| "
        const caretLine = lines[lines.length - 1];
        expect(caretLine).toContain("| " + " ".repeat(12) + "^");
    });

    it("should handle multi-digit line numbers with correct gutter width", () => {
        const lines = Array(100).fill("noop;");
        lines[99] = "let z = oops;";
        const source = lines.join("\n");

        const output = strip(formatError("error here", "/tmp/t.fe", 100, 9, source));
        expect(output).toContain("100 | let z = oops;");
        // Empty gutter should be 3 chars wide (width of "100")
        expect(output).toContain("    |");
    });

    it("should handle line 1 col 1", () => {
        const source = "bad;";
        const output = strip(formatError("unexpected", "/tmp/t.fe", 1, 1, source));
        expect(output).toContain("1 | bad;");
        expect(output).toContain("| ^");
    });

    it("should degrade gracefully when line is out of range", () => {
        const source = "only one line";
        const output = strip(formatError("phantom error", "/tmp/t.fe", 99, 1, source));
        expect(output).toContain("error: phantom error");
        expect(output).toContain("t.fe:99:1");
        // Should not contain a source line or caret
        expect(output).not.toContain("| only one line");
    });

    it("should format a warning severity", () => {
        const source = "let x = 1;";
        const output = strip(formatError("unused variable", "/tmp/t.fe", 1, 5, source, "warning"));
        expect(output).toContain("warning: unused variable");
    });

    it("should handle empty source string", () => {
        const output = strip(formatError("empty file", "/tmp/t.fe", 1, 1, ""));
        expect(output).toContain("error: empty file");
        // Empty string splits to [""], line 1 (index 0) is an empty string — should still show gutter
        expect(output).toContain("1 | ");
    });
});

describe("ParseError", () => {
    it("should carry structured error data", () => {
        const errors = [
            { msg: "unexpected token", line: 1, col: 5 },
            { msg: "missing semicolon", line: 2, col: 10 },
        ];
        const pe = new ParseError(errors, "/tmp/test.fe", "let x =\nfoo bar");

        expect(pe).toBeInstanceOf(Error);
        expect(pe.errors).toHaveLength(2);
        expect(pe.file).toBe("/tmp/test.fe");
        expect(pe.source).toBe("let x =\nfoo bar");
        expect(pe.message).toContain("Parse errors in /tmp/test.fe");
    });
});

describe("integration: parser errors produce ParseError-compatible data", () => {
    it("should produce errors with line and col for a syntax error", () => {
        const source = "let x = ;";
        const lexer = new Lexer(source);
        const parser = new Parser(lexer);
        parser.ParseProgram();
        const errors = parser.getErrors();

        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toHaveProperty("msg");
        expect(errors[0]).toHaveProperty("line");
        expect(errors[0]).toHaveProperty("col");
        expect(errors[0].line).toBe(1);

        // Verify formatError works with parser error data
        const output = strip(formatError(errors[0].msg, "/tmp/test.fe", errors[0].line, errors[0].col, source));
        expect(output).toContain("error:");
        expect(output).toContain("let x = ;");
        expect(output).toContain("^");
    });
});

describe("integration: analyzer diagnostics include file path", () => {
    it("should tag diagnostics with the module path", () => {
        const source = "let x: int = 10;\nlet y = unknown_var;";
        const lexer = new Lexer(source);
        const parser = new Parser(lexer);
        const program = parser.ParseProgram();
        expect(parser.getErrors()).toHaveLength(0);

        const analyzer = new Analyzer();
        analyzer.analyze(program, undefined, "/tmp/test.fe");

        expect(analyzer.diagnostics.length).toBeGreaterThan(0);
        const d = analyzer.diagnostics.find(d => d.message.includes("unknown_var"));
        expect(d).toBeDefined();
        expect(d!.file).toBe("/tmp/test.fe");
        expect(d!.line).toBe(2);

        // Verify formatError works with diagnostic data
        const output = strip(formatError(d!.message, d!.file!, d!.line, d!.col, source));
        expect(output).toContain("error:");
        expect(output).toContain("test.fe:2:");
        expect(output).toContain("let y = unknown_var;");
    });

    it("should accumulate diagnostics across multiple analyze() calls", () => {
        const analyzer = new Analyzer();

        const src1 = "let a = bad1;";
        const lexer1 = new Lexer(src1);
        const parser1 = new Parser(lexer1);
        analyzer.analyze(parser1.ParseProgram(), undefined, "/tmp/a.fe");

        const src2 = "let b = bad2;";
        const lexer2 = new Lexer(src2);
        const parser2 = new Parser(lexer2);
        analyzer.analyze(parser2.ParseProgram(), undefined, "/tmp/b.fe");

        // Both modules' diagnostics should be present
        const files = analyzer.diagnostics.map(d => d.file);
        expect(files).toContain("/tmp/a.fe");
        expect(files).toContain("/tmp/b.fe");
    });
});
