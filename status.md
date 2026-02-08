# Ferro Status Log

**Date:** February 8, 2026
**Project Name:** Ferro (Rusty addon for JS/TS with Native LLVM support)

---

## ✅ Completed Features

### 1. Core Language & Architecture
- **Monorepo Setup**: npm workspaces with `ferro` (compiler/LSP) and `ferro-vscode` (extension).
- **Lexer & Parser**: Robust recursive descent parser handling Rust-like syntax.
- **AST**: Comprehensive tree representation for statements and expressions.
- **Analyzers**: Semantic analyzer enforcing strict types, variable resolution, and immutability.

### 2. Metaprogramming (Macros)
- **Quasi-Quoting**: `macro`, `quote!`, and `$unquote` implementation.
- **Compile-time Execution**: Macros are transpiled to JS and executed during the compilation pass to generate code.

### 3. Syntax Features
- **Immutability**: `let` (immutable) and `let mut` (mutable) distinction.
- **Result Types**: First-class `Result<T, E>` support with the `?` operator.
- **Expressions**: `if`, `match`, and blocks `{}` as expressions (returning values).
- **Looping**: `while` loops implemented in both backends.
- **Data Structures (Structs)**: `struct` definitions, initialization, and field access implemented in both TS and LLVM backends.
- **Traits & Impls**: Nominal behavioral typing with a global trait registry.
- **JS Interop**: Member access (`.`) and array literals (`[]`) for calling native JS functions.

### 4. Backends
- **TypeScript Target**: Transpiles to clean TS with an automatically injected runtime.
- **Native Target (LLVM)**: Generates LLVM IR, compiles with `clang` to native binaries. Supports integers, control flow (if/while), structs, enums, match expressions, and printing.
- **String Concatenation (LLVM)**: `String + String` emits `fs_string_concat` calls instead of integer `add`.

### 5. Developer Experience (LSP & VSCode)
- **LSP Server**: Provides real-time diagnostics (syntax and type errors), completions, and hover info.
- **VSCode Extension**: Custom TextMate grammar for syntax highlighting and seamless LSP integration.

### 6. Modules
- [x] Syntax (import/export keywords) - **Completed**
- [x] AST Nodes (ImportStatement, ExportStatement) - **Completed**
- [x] Parser Support - **Completed**
- [x] Module Resolution (finding files, basic path logic) - **Completed**
- [x] Semantic Analysis (symbol tables per module, exports) - **Completed**
- [x] LLVM Backend Support (Monolithic compilation with name mangling) - **Completed**

---

### 7. Self-Hosted Runtime
- [x] **Core Logic**: Ported `runtime.c` allocation and string printing to `runtime.fe`.
- [x] **Bootstrap Milestone**: Successfully compiled and ran a test using the native Ferro runtime.
- [x] **Emitter Refactor**: Fixed function signature registration, struct resolution, and cross-module dependencies.
  - Pointer null comparisons now use correct types (`icmp ne i8*` instead of `icmp ne i32`).
  - Pointer arithmetic emits `getelementptr` instead of integer `add`.
  - Functions without explicit return types default to `void` instead of `i32`.
  - Argument type casting (`trunc`/`sext`) when call argument types don't match parameter types.
  - Runtime exports (`fs_string_alloc`, etc.) use canonical unmangled names.
  - CLI auto-detects self-hosted runtime and skips linking `runtime.c`.

### 8. Bootstrap Completion
- [x] **Self-Hosted Runtime Default**: The CLI auto-injects `runtime.fe` for all `--native` builds. No explicit `import` required.
- [x] **Integer Printing (`fs_print_int`)**: Pure `putchar`-based integer printing in `runtime.fe`, eliminating the `printf` dependency entirely.
- [x] **Null String Handling**: `fs_print_string` now prints `(null)` for null pointers, matching the C runtime behavior.
- [x] **C Runtime Removed**: The CLI no longer falls back to linking `runtime.c`. All native compilation uses the Ferro self-hosted runtime.
- [x] **LLVM Emitter Fixes**: Fixed struct return semantics (`localIsPtr` tracking), pointer-type parameter handling (no double `*`), `i32`→`i8` store truncation, unary negation (`-n`), and `%String` type resolution to runtime struct name.

### 9. Enums & ADTs
- [x] **Enum Definitions**: Rust-style `enum` declarations with simple variants and variants with associated data (ADTs).
- [x] **Enum Construction**: `EnumName::Variant` for unit variants and `EnumName::Variant(args)` for data variants via static call syntax.
- [x] **Pattern Matching**: Destructuring enum patterns in `match` expressions — binds payload fields to local variables.
- [x] **TypeScript Backend**: Emits discriminated union constructors (`{ tag: "Variant", _0, _1 }`) and `switch`-on-tag match logic.
- [x] **LLVM Backend**: Emits tagged unions (`{ i32, [N x i8] }`), bitcast payload extraction, LLVM `switch` + PHI nodes for match results.
- [x] **Implicit Expression Return**: Functions returning their last expression (Rust-style) now work in LLVM backend.

---

### 10. Byte Casting
- [x] **`as` Cast Syntax**: Rust-style `expr as Type` expressions for explicit type casting.
- [x] **AST Node**: `CastExpression` with source expression and target type.
- [x] **Parser**: `as` registered as infix operator with precedence above arithmetic (like Rust).
- [x] **Analyzer**: Type-checks cast expressions and returns the target type.
- [x] **LLVM Backend**: Emits `trunc` (i32→i8), `sext` (i8→i32), `zext` (i1→i32/i8), and `icmp ne` (i32/i8→i1).
- [x] **TypeScript Backend**: Emits `(expr | 0)` for numeric casts and `(!!(expr))` for bool casts.

### 11. String Utilities
- [x] **`fs_string_eq`**: Byte-by-byte string equality comparison in `runtime.fe`. `==` and `!=` operators on strings are special-cased in the LLVM emitter to call this function.
- [x] **`fs_string_len`**: Returns the `len` field of a string via pointer dereference.
- [x] **`fs_string_index`**: Returns the byte (`i8`) at a given index with bounds checking (returns 0 for out-of-bounds or negative indices).
- [x] **`fs_string_slice`**: Creates a new heap-allocated string from a start..end range with bounds clamping.
- [x] **`fs_string_free`**: Frees backing memory and nulls out the struct fields.
- [x] **Comparison Type Checking**: Analyzer now rejects mismatched types in `==`/`!=`/`<`/`>` operators.
- [x] **LLVM Comparison Fix**: `icmp` instructions now use the actual operand type instead of defaulting to `i32`, fixing `i8` comparisons.

### 12. Comparison Operators (`>=` / `<=`)
- [x] **Token Types**: Added `LtEq` (`<=`) and `GtEq` (`>=`) to the lexer with peek-based two-character recognition.
- [x] **Parser**: Registered at `LESSGREATER` precedence, same as `<` and `>`.
- [x] **Analyzer**: Extended comparison type-checking to include `<=` and `>=` (both operands must match, returns `bool`).
- [x] **TypeScript Backend**: Works automatically via generic `InfixExpression` pass-through.
- [x] **LLVM Backend**: Maps `<=` to `icmp sle` and `>=` to `icmp sge`.
- [x] **VSCode Syntax Highlighting**: Added `<=`, `>=`, `<`, `>` to operator regex.

### 13. Reference Counting (Automatic Memory Management)
- [x] **Heap-Prepended Refcount**: Refcount stored as the first 4 bytes of the malloc'd buffer (`ptr[-4]`), shared across all struct copies. `fs_string_alloc` allocates `size + 5` bytes (4 for rc header + 1 for null terminator).
- [x] **`fs_rc_retain` / `fs_rc_release`**: Runtime functions in `runtime.fe` that access `(ptr - 4) as *i32` to increment/decrement the shared refcount. `fs_rc_release` calls `fs_string_free` when rc reaches zero.
- [x] **Automatic Scope-Based Release**: LLVM emitter tracks RC-typed locals per scope and emits `fs_rc_release` calls at scope exit (end of blocks, functions, and main).
- [x] **Retain on Copy**: When an RC variable is assigned to another variable (`let b = a`), the emitter inserts a `fs_rc_retain` call so both variables share ownership.
- [x] **Release on Reassignment**: When a mutable RC variable is reassigned (`x = "new"`), the old value is released before storing the new one.
- [x] **Fresh Value Optimization**: Skip retain for freshly allocated values (string literals, concat results, function return values) since they already have rc=1.
- [x] **`drop()` Built-in**: Manual eager release for breaking reference cycles or reclaiming memory early. Calls `fs_rc_release` and marks the variable as dropped to prevent double-release at scope exit.
- [x] **Runtime Function Isolation**: RC insertion is skipped inside runtime functions (which manage memory manually) via `insideRuntimeFn` flag.
- [x] **Pointer-to-Pointer Bitcast**: Added `bitcast` support in LLVM emitter for `*i8 as *i32` casts needed by the RC runtime.
- [x] **Runtime Regenerated**: Updated `runtime.ll` from the modified `runtime.fe`.

---

### 14. String Comparison (`fs_string_cmp`)
- [x] **`fs_string_cmp` Runtime Function**: Lexicographic byte-by-byte comparison in `runtime.fe`. Returns `-1` (less), `0` (equal), or `1` (greater).
- [x] **LLVM Emitter Special-Casing**: `<`, `>`, `<=`, `>=` on strings call `@fs_string_cmp` and compare the result against `0` with the appropriate `icmp` condition (`slt`/`sgt`/`sle`/`sge`).
- [x] **Runtime Function Registry**: Added `fs_string_cmp` to `runtimeFnNames` for canonical name exemption.
- [x] **TypeScript Backend**: No changes needed — JavaScript native string comparison is already lexicographic.
- [x] **Test Coverage**: `string_cmp_test.fe` covering `<`, `>`, `<=`, `>=` with same strings, different strings, prefix relationships, and empty strings.

### 15. Generics
- [x] **Generic Structs**: `struct Box<T> { value: T }` — type parameter parsing, monomorphization in LLVM backend, native TS generics in TS backend.
- [x] **Generic Functions**: `fn identity<T>(x: T) -> T` — turbofish syntax (`identity::<int>(42)`), LLVM monomorphization with deferred output buffer, TS native generics.
- [x] **Generic Enums**: `enum Option<T> { Some(T), None }` — type parameter parsing, generic enum variant construction (`Option::<int>::Some(42)`), LLVM monomorphization.
- [x] **Analyzer Generic Context**: `genericContext: string[]` tracking, `generic_param` type kind, permissive type checking for generic parameters.
- [x] **Trait/Impl LLVM Backend**: Complete trait and impl block support in LLVM backend — trait method registration, impl method emission as standalone functions, static trait dispatch via `TraitName::method(self, args)`.
- [x] **Generic Impl Blocks**: `impl<T> Trait for Type<T>` syntax — AST `typeParams`/`targetTypeArgs` on `ImplBlock`, parser support, on-demand monomorphization of generic impl methods.
- [x] **TS Backend Trait Fix**: `mapJSTypeName` maps Ferro types (`int`→`number`, `bool`→`boolean`) for correct runtime trait dispatch.
- [x] **Trait Bounds**: `fn foo<T: Summary>(x: T)` syntax — `typeConstraints: Map<string, string[]>` on AST nodes (`FunctionLiteral`, `StructDefinition`, `EnumDefinition`, `ImplBlock`). Shared `parseTypeParamsWithBounds()` parser helper supports `<T: Trait1 + Trait2>`. Analyzer tracks trait definitions and impl registrations, validates at call sites that concrete type args implement required traits.

### 16. Variadic Externs
- [x] **`...` Token**: Added `DotDotDot` token type to the lexer with three-character peek-ahead recognition.
- [x] **AST**: `ExternStatement` gained a `variadic: boolean` field.
- [x] **Parser**: `parseExternStatement()` recognizes trailing `...` after named parameters (e.g., `extern fn printf(fmt: *i8, ...) -> i32;`).
- [x] **LLVM Backend — Declarations**: Variadic externs emit `declare i32 @printf(i8*, ...)` with the `...` suffix. Tracked via `variadicExterns: Set<string>`.
- [x] **LLVM Backend — Calls**: Variadic calls emit the full function type signature (`call i32 (i8*, ...) @printf(...)`) as required by LLVM IR. Extra arguments beyond fixed params use their inferred types.
- [x] **Raw String Pointers**: `emitRawStringPtr()` emits null-terminated `i8*` string constants for C interop (separate from managed Ferro strings). String literals passed to `i8*` parameters automatically use raw pointers.

### 17. For Loops (Range-Based)
- [x] **`for (var in start..end)` Syntax**: Rust-style for loop with exclusive range.
- [x] **Token Types**: Added `For`, `In` keywords and `DotDot` (`..`) symbol to the lexer.
- [x] **AST Nodes**: `ForStatement` and `RangeExpression`.
- [x] **Parser**: `parseForStatement()` with parenthesized `variable in start..end` syntax.
- [x] **Analyzer**: Loop variable defined as immutable `int` in child scope, range bounds type-checked.
- [x] **TypeScript Backend**: Emits standard JS `for` loop. Also added missing `WhileStatement` emission.
- [x] **LLVM Backend**: Desugars to alloca/load/store counter with condition-at-top loop pattern, RC scope for body.
- [x] **`impl ... for ...` Fix**: `parseImplBlock` updated to expect `For` keyword token instead of identifier literal check.

### 18. Index Expressions & Method Call Syntax
- [x] **`IndexExpression` AST Node**: `expr[index]` syntax for array/pointer indexing.
- [x] **Parser**: `LBracket` registered as infix at `CALL` precedence, `parseIndexExpression()` method.
- [x] **Analyzer**: Index must be `int`, returns element type.
- [x] **LLVM Backend**: Raw pointer indexing via `getelementptr` + `load`.
- [x] **TS Backend**: Emits `${left}[${index}]`.
- [x] **`MethodCallExpression` AST Node**: `object.method(args)` syntax for method calls.
- [x] **Parser**: `parseCallExpression()` detects `MemberAccessExpression` and converts to `MethodCallExpression`.
- [x] **Analyzer**: Looks up receiver type + method name for type checking.
- [x] **LLVM Backend**: `emitMethodCallExpression()` with trait dispatch, prepends `&self` as first arg.
- [x] **TS Backend**: Emits `${object}.${method}(${args})`.

### 19. Heap-Allocated Collections (`Vec<T>` & `HashMap<K,V>`)
- [x] **`Vec<T>` Runtime**: Type-erased `fs_Vec` struct (`*i8` data, `len`, `cap`, `elem_size`) with `fs_vec_new`, `fs_vec_push`, `fs_vec_get`, `fs_vec_set`, `fs_vec_pop`, `fs_vec_len`, `fs_vec_free` in `runtime.fe`.
- [x] **`Vec<T>` Compiler Support**: `Vec::<T>::new()` static call emits `fs_vec_new(elem_size)`, method calls (`push`, `get`, `set`, `pop`, `len`) dispatch to runtime functions with `i8*` bitcasts. Alloca-address passing for mutating methods.
- [x] **`HashMap<K,V>` Runtime**: Type-erased `fs_HashMap` struct with open-addressing linear probing. Hash functions (`fs_hash_int`, `fs_hash_string`), `fs_hashmap_new`, `fs_hashmap_insert`, `fs_hashmap_get`, `fs_hashmap_contains`, `fs_hashmap_remove`, `fs_hashmap_len`, `fs_hashmap_free`, `fs_hashmap_resize`, `fs_mem_eq` in `runtime.fe`.
- [x] **`HashMap<K,V>` Compiler Support**: `HashMap::<K,V>::new()` static call, method dispatch to runtime functions with key/value bitcasts and hash computation. `contains_key` returns `i32` (zext from `i1`).
- [x] **TS Backend**: `Vec::new()` → `[]`, `HashMap::new()` → `new Map()`.
- [x] **LLVM Emitter Fixes**: `bb_entry` label to avoid parameter name conflicts, terminator-aware branch emission in if-blocks, duplicate `ret` prevention for implicit expression returns containing explicit `return` statements.

---

### 20. Closures / First-Class Functions (Kotlin-style Trailing Lambdas)
- [x] **`ClosureExpression` AST Node**: Anonymous functions with optional typed parameters, optional return type, and block body. Includes `ClosureParam` (optionally-typed) and `FunctionTypeNode` (for type annotations).
- [x] **Standalone Closure Syntax**: `(x: i32, y: i32) -> i32 { x + y }` — parenthesized typed params with optional return type.
- [x] **Zero-Param Closures**: `() -> string { "hello" }` — empty param list with body.
- [x] **Trailing Lambda Syntax**: Kotlin-style `list.map { x -> x * 2 }` — lambda as last argument, outside parentheses.
- [x] **Trailing Lambda Without Parens**: `list.filter { x -> x > 5 }` — when lambda is the only argument, parens can be omitted entirely.
- [x] **Implicit `it` Parameter**: `list.map { it * 2 }` — single implicit parameter named `it` when no explicit params are specified.
- [x] **Multi-Param Trailing Lambda**: `pairs.map { a, b -> a + b }` — comma-separated untyped params with arrow.
- [x] **Mixed Args + Trailing Lambda**: `retry(3) { fetch_data() }` — regular arguments in parens, trailing lambda appended.
- [x] **Parser**: 3-token lookahead (`peekAheadToken`) for unambiguous closure vs grouped-expression detection. No backtracking required.
- [x] **TypeScript Backend**: Emits arrow functions — `(x) => expr` for single-expression bodies, `(x) => { ... }` for multi-statement bodies.
- [x] **Analyzer**: Closure params defined in child scope, returns `function` type with param/return types.
- [x] **Test Coverage**: 9 new parser tests covering all closure forms plus regression test for grouped expressions.

### 21. Closures LLVM Backend
- [x] **Capture Analysis**: Analyzer computes free variables for each `ClosureExpression` via `collectIdentifiers()`/`collectDefinitions()` and stores them in `capturedVariables: string[]`.
- [x] **Fat Pointer Representation**: Closures are represented as `{ i8*, i8* }` — environment pointer + function pointer. `mapType` maps `FunctionTypeNode` and `{ kind: "function" }` types to this representation.
- [x] **Closure Conversion (`emitClosureExpression`)**: Each closure is lifted to a top-level function (`@__closure_N`) with `i8* %__env` as first parameter. Captured variables are packed into an anonymous environment struct, bitcast to `i8*`, and stored in the fat pointer. Non-capturing closures pass `null` as env.
- [x] **Indirect Closure Calls (`emitClosureCall`)**: When calling a variable of type `{ i8*, i8* }`, the emitter extracts env and fn pointers via `extractvalue`, bitcasts the fn pointer to the correct type, and calls with env as first argument.
- [x] **Function Type Parsing**: Added `FunctionTypeNode` support in `parseType()` for `(paramTypes...) -> returnType` syntax in type position (e.g., function parameters).
- [x] **RC Management**: Captured strings are retained when stored into the environment struct and tracked for release in the closure function's scope.
- [x] **V1 Limitations**: Stack-allocated environments (closures must not outlive creating scope), capture by value only, typed closure params required for `--native`.

---

## 🚧 In Progress Features

*(Nothing currently in progress)*

---

## 🛠 Planned Features

### 1. Standard Library & Runtime
- **Standard Library Functions**: File I/O, math utilities, and other common built-ins.

### 2. Low Priority
- **Cycle Detection**: Optional weak references or cycle-collector for complex data structures with reference cycles.

### 3. Language Features & Backends
- **FFI Enhancements**: More robust handling of foreign function interfaces and platform-specific ABI considerations.
- **Closures / First-Class Functions**: ~~Anonymous functions~~ — **Completed (see §20)**. ~~Variable capture analysis for LLVM backend, closure conversion for native compilation~~ — **Completed (see §21)**. Remaining: heap-allocated environments for escaping closures, mutable capture by reference, bidirectional type inference for untyped trailing lambda params.
- **Iterator Protocol**: `for x in collection` support via `IntoIterator` trait, extending the existing range-based `for` loop to work with collections.
- **Error Messages with Source Locations**: Attach file, line, and column info to diagnostics so compiler errors point to exact source positions.

---

---

## 🚀 Usage

### Transpile to TypeScript
```bash
./packages/ferro/dist/cli.js source.fe
```

### Compile to Native Binary
```bash
./packages/ferro/dist/cli.js source.fe --native
```
