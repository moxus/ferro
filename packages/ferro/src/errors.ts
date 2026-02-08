import * as path from "path";

// ANSI color codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const BLUE = "\x1b[34m";

const useColor = process.stderr.isTTY !== false;

function c(code: string, text: string): string {
    return useColor ? `${code}${text}${RESET}` : text;
}

/**
 * Structured parse error thrown by the module loader.
 * Carries all the data needed for Rust-style error formatting.
 */
export class ParseError extends Error {
    public errors: Array<{ msg: string; line: number; col: number }>;
    public file: string;
    public source: string;

    constructor(
        errors: Array<{ msg: string; line: number; col: number }>,
        file: string,
        source: string,
    ) {
        super(`Parse errors in ${file}`);
        this.errors = errors;
        this.file = file;
        this.source = source;
    }
}

/**
 * Format a compiler error in Rust-style with source context.
 *
 * Example output:
 *   error: variable `x` not found in scope
 *    --> src/main.fe:12:5
 *      |
 *   12 |     let y = x + 1;
 *      |             ^
 */
export function formatError(
    message: string,
    file: string,
    line: number,
    col: number,
    source: string,
    severity: "error" | "warning" = "error",
): string {
    const lines = source.split("\n");
    const lineIdx = line - 1;
    const sourceLine = lineIdx >= 0 && lineIdx < lines.length ? lines[lineIdx] : null;

    const gutterWidth = String(line).length;
    const emptyGutter = " ".repeat(gutterWidth);

    // Show relative path for cleaner output
    const relFile = path.relative(process.cwd(), file) || file;

    const sevLabel =
        severity === "error"
            ? c(BOLD + RED, "error")
            : c(BOLD + "\x1b[33m", "warning");

    const parts: string[] = [
        `${sevLabel}${c(BOLD, ": " + message)}`,
        ` ${c(BLUE, "-->")} ${relFile}:${line}:${col}`,
    ];

    if (sourceLine !== null) {
        // col is 1-indexed from the lexer, so caret offset is col - 1 spaces
        const caretOffset = Math.max(0, col - 1);
        parts.push(
            ` ${emptyGutter} ${c(BLUE, "|")}`,
            ` ${c(BLUE, String(line).padStart(gutterWidth))} ${c(BLUE, "|")} ${sourceLine}`,
            ` ${emptyGutter} ${c(BLUE, "|")} ${" ".repeat(caretOffset)}${c(RED, "^")}`,
        );
    }

    return parts.join("\n");
}
