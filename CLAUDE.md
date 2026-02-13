# Ferro Agent Instructions

## Project Overview

Ferro is a Rust-inspired scripting language for the JS/TS ecosystem, written in TypeScript. It compiles `.fe` files to either TypeScript or native binaries via LLVM IR.

## Project Structure

- `packages/ferro/` — Main compiler, LSP server, and CLI
  - `src/lexer/` — Tokenizer
  - `src/parser/` — Recursive descent parser
  - `src/ast/` — AST node definitions
  - `src/analysis/` — Semantic analyzer, module loader, symbol table, types
  - `src/codegen/emitter.ts` — TypeScript backend
  - `src/codegen/llvm_emitter.ts` — LLVM native backend
  - `src/macros/` — Macro expander
  - `src/lsp/` — Language server
  - `src/cli.ts` — CLI entry point
  - `src/runtime.fe` — Self-hosted runtime (Ferro)
  - `src/runtime.c` — Legacy C runtime (fallback)
  - `tests/` — Unit and integration tests
- `packages/ferro-vscode/` — VSCode language extension

## Status File

**Always keep `packages/ferro/status.md` up to date.** After completing any feature, bug fix, or significant change:
1. Move completed items from "In Progress" to "Completed" with a brief description of what was done.
2. Update the date at the top of the file.
3. Add new planned items if follow-up work is identified.

## Build & Test

- `npm run build` — Build all workspaces (runs `tsc`)
- `cd packages/ferro && npx vitest run` — Run unit tests
- `node packages/ferro/dist/cli.js <file.fe>` — Transpile to TypeScript
- `node packages/ferro/dist/cli.js <file.fe> --native` — Compile to native binary via LLVM

## Documentation

**Always update documentation when language features are added, changed, or removed.** The following files must be kept in sync with the implementation:
- `README.md` (root) — Feature highlights and language guide
- `packages/ferro/README.md` — Package-level feature summary
- `packages/ferro/docs/MANUAL.md` — Full language reference manual

When implementing a new language feature, updating documentation is part of completing the feature — not a separate task.

## Key Conventions

- The LLVM backend uses name mangling (`m{id}_{name}`) for cross-module symbols. Runtime exports (`fs_string_*`, `fs_print_*`) are exempted and use canonical names.
- The CLI auto-detects whether the self-hosted runtime is in the module graph and skips linking `runtime.c` when it is.
- The analyzer enforces `unsafe` blocks for pointer dereference and extern function calls.

## Bug Logging

When you discover a bug during development that is **not directly related to your current task**, do not stop to fix it. Instead:

1. Log it in `bugs.md` at the project root following the existing format:
   - Assign the next `B###` ID
   - Include: severity, component, discovery date, description with code example, and any known workaround
2. Continue with your current task, using a workaround if needed
3. Mention the new bug ID in your commit message if your code works around it

Severity levels:
- **High** — Produces incorrect output or crashes
- **Medium** — Feature gap or type system issue with workaround available
- **Low** — Cosmetic or minor behavioral difference
