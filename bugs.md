# Ferro — Known Bugs

*All previously tracked bugs have been resolved.*

## Resolved

### B001: Vec indexing returns unknown type in f-string interpolation
**Status:** Fixed
**Component:** Analyzer (type inference)
**Fix:** `IndexExpression` handler now extracts the element type from `Vec<T>` generic instances and array types instead of always returning `UnknownType`.

---

### B002: Emitter drops parentheses in nested arithmetic passed to function calls
**Status:** Fixed
**Component:** Parser + AST + Codegen (emitter.ts)
**Fix:** Added `GroupedExpression` AST node. The parser now wraps `(expr)` in a `GroupedExpression` instead of discarding the parentheses. All backends (TS, LLVM) and the analyzer handle the new node.

---

### B003: HashMap methods broken in TS backend
**Status:** Fixed
**Component:** Codegen (emitter.ts)
**Fix:** Added HashMap method translations: `.insert()` → `.set()`, `.contains_key()` → `.has()`, `.get()` → `.get()`, `.remove()` → `.delete()`, `.len()` → `.size`. Moved HashMap-specific dispatch before generic string/array method handlers to prevent `.len()` being caught by the generic `.length` mapping.

---

### B004: No modulo operator
**Status:** Fixed
**Component:** Lexer, Parser, Analyzer, Codegen
**Fix:** Added `Percent` token type, lexer case for `%`, parser precedence at PRODUCT level, infix parser registration, analyzer arithmetic type checking for `%`, TS backend pass-through, and LLVM backend support (`srem` for integers, `frem` for floats).

---

### B005: Integer division produces float
**Status:** Fixed
**Component:** AST + Analyzer + Codegen (emitter.ts)
**Fix:** Added `integerDivision` annotation to `InfixExpression`. The analyzer sets this flag when both operands are `int` and the operator is `/`. The TS emitter wraps such expressions with `Math.floor()` to match Rust truncating division semantics. The LLVM backend already used `sdiv` (truncating) so no change was needed there.
