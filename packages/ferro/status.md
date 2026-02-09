# Ferro Status Log

**Date:** February 9, 2026
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
- **Floating-Point Type (`f64`)**: Full-stack `f64` support — float literals (`3.14`), `double` in LLVM with `fadd`/`fsub`/`fmul`/`fdiv`/`fcmp`, `number` in TS backend. Casts (`as f64`, `as int`) using `sitofp`/`fptosi`. Runtime: `fs_print_float`, `fs_float_to_string`. F-string interpolation with floats. Math utilities return `f64` when given `f64` arguments.

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

### 22. Iterator Protocol (`for x in collection`)
- [x] **Parser**: `parseForStatement()` now accepts any expression as the iterable, not just `RangeExpression`. If `DotDot` follows the expression, it's a range; otherwise it's a collection iteration.
- [x] **Analyzer**: `visitForStatement()` infers the loop variable's element type from the collection type (`Vec<T>` → `T`). Range for-loops still define the variable as `int`.
- [x] **TypeScript Backend**: Non-range for-loops emit `for (const x of collection)`, leveraging native JS iteration.
- [x] **LLVM Backend**: `emitVecForLoop()` desugars `for (x in vec)` to an index-based loop using `fs_vec_len` and `fs_vec_get`, with RC scope management.
- [x] **Backward Compatibility**: Existing `for (x in 0..10)` range syntax continues to work unchanged.

### 23. Iterator Protocol Enhancements
- [x] **HashMap Key Iteration**: `for (k in map)` iterates over HashMap keys. Cursor-based `fs_hashmap_iter_next` runtime function scans slots, skipping empty/tombstone entries.
- [x] **Analyzer**: `visitForStatement()` infers key type from `HashMap<K,V>` for loop variable. `visitMethodCallExpression()` returns proper types for collection methods (`map`→`Vec<U>`, `filter`→`Vec<T>`, `keys`→`Vec<K>`, `values`→`Vec<V>`, `len`→`int`, etc.).
- [x] **Vec.map()**: Eager combinator — `vec.map((x: int) -> int { x * 2 })` creates new Vec with transformed elements. LLVM backend emits inline loop with closure fat-pointer calls.
- [x] **Vec.filter()**: Eager combinator — `vec.filter((x: int) -> bool { x > 1 })` creates new Vec with elements passing the predicate. Conditional push via `br i1`.
- [x] **Vec.collect()**: Identity operation — since `map`/`filter` are eager and already return Vecs.
- [x] **HashMap.keys()**: Returns `Vec<K>` of all keys via cursor-based iteration + `fs_vec_push`.
- [x] **HashMap.values()**: Returns `Vec<V>` of all values via cursor-based iteration with pointer offset by `key_size`.
- [x] **TypeScript Backend**: HashMap iteration emits `for (const k of m.keys())`. `keys()`/`values()` emit `[...m.keys()]`/`[...m.values()]` (spread into arrays). `collect()` is identity. `map`/`filter` pass through natively.
- [x] **Type Propagation**: LLVM emitter tracks Vec element types through `map`/`filter`/`keys`/`values` result chains via `vecElemTypes` map and `lastMapOutputElemType`.

### 24. Logical Operators (`&&` / `||`)
- [x] **Token Types**: Added `AmpAmp` (`&&`) and `PipePipe` (`||`) to the lexer with peek-based two-character recognition.
- [x] **Parser**: Registered at `LOGICAL_AND` and `LOGICAL_OR` precedences (between `ASSIGN` and `EQUALS`), matching C/Rust operator precedence.
- [x] **Analyzer**: Type-checks both operands as `bool`, returns `bool`.
- [x] **TypeScript Backend**: Works automatically via generic `InfixExpression` pass-through.
- [x] **LLVM Backend**: `&&` emits `and i1`, `||` emits `or i1`.
- [x] **Runtime Fix**: Fixed trailing semicolons after `while` blocks and `if-else` chains in `runtime.fe` File I/O section that caused parse errors blocking `--native` builds.

---

### 25. Rust-Style Error Messages
- [x] **`errors.ts` Module**: New `ParseError` class (structured parse errors with file path and source text) and `formatError()` function producing Rust-style output with ANSI colors.
- [x] **Diagnostic `file` Field**: Added optional `file?: string` to the `Diagnostic` interface. Analyzer `error()` method now tags each diagnostic with `this.currentModulePath`.
- [x] **Multi-Module Diagnostics Fix**: Removed `this.diagnostics = []` reset in `analyze()` that was wiping diagnostics from previously analyzed modules.
- [x] **Source Text on `CompiledModule`**: Added `source: string` field so raw source text is available for error display without re-reading files.
- [x] **Structured Parse Errors**: Module loader throws `ParseError` instead of a generic `Error`, preserving line/col/file info.
- [x] **CLI Formatting**: Errors display with file path, line number, column, source line context, and a caret pointing to the error position. ANSI colors (red for errors, blue for gutter) with TTY detection.
- [x] **LSP Unaffected**: All `Diagnostic` changes are additive (optional fields), LSP continues to work unchanged.

---

### 26. Bidirectional Type Inference for Closures
- [x] **Analyzer `typeToASTType()`**: Converts analyzer `Type` back to AST `Type` node for patching untyped closure parameters.
- [x] **`visitClosureExpression()` Context Params**: Accepts optional `expectedParamTypes` and `expectedReturnType`. When a closure param has `type === null`, the expected type from call context is used and the AST node is patched in-place.
- [x] **Return Type Inference from Body**: When `returnType` is null and no expected return type is provided, the analyzer infers the return type from the last expression in the closure body and patches `expr.returnType`.
- [x] **Vec.map / Vec.filter Inference**: `vec.map { x -> x * 2 }` infers `x: T` from `Vec<T>`. `vec.filter { it > 1 }` infers param type `T` and return type `bool`.
- [x] **Function Call Inference**: When calling a function with a `(T) -> U` parameter, trailing lambda params are inferred from the function signature. E.g., `apply(5) { x -> x + 1 }` infers `x: int` from `fn apply(x: int, f: (int) -> int)`.
- [x] **Vec/HashMap Static Call Type Tracking**: `Vec::<T>::new()` and `HashMap::<K,V>::new()` now return `generic_inst` types in the analyzer, enabling downstream method call inference.
- [x] **LLVM Backend Softened**: Removed hard error for untyped closure params (analyzer patches types before codegen reaches them). Simplified return type inference to rely on analyzer-patched `returnType`.
- [x] **Implicit `it` Support**: `vec.map { it * 2 }` works in both TS and LLVM backends with full type inference.
- [x] **TypeScript Backend**: No changes needed — TypeScript's own inference handles untyped params. Patched return types produce cleaner output with explicit return type annotations.
- [x] **Test Coverage**: 10 new analyzer unit tests and native integration test (`closure_infer_test.fe`) covering Vec.map/filter with trailing lambdas, implicit `it`, function call inference, and mixed explicit/inferred params.

---

### 27. Heap-Allocated Environments & Mutable Capture
- [x] **Heap-Allocated Environments**: Closure environment structs are now allocated on the heap with `malloc` instead of `alloca`. This makes closures safe to return from functions, store in variables, and pass to data structures that outlive the creation scope.
- [x] **Escaping Closures**: Functions can return closures that capture outer variables. E.g., `fn make_adder(n: int) -> (int) -> int { (x: int) -> int { x + n } }` — the returned closure safely holds `n` on the heap.
- [x] **Mutable Capture by Reference**: Variables declared `let mut` are captured by reference (pointer stored in env). Mutations inside the closure are visible in the outer scope and vice versa. E.g., `let mut count = 0; let inc = { count = count + 1 }; inc(); print(count); // 1`.
- [x] **Mutability Tracking in LLVM Emitter**: Added `localMutable` set to track which variables are mutable. Properly saved/restored across closure lifting to avoid state leakage.
- [x] **Environment Struct Layout**: Immutable captures store values (`T`), mutable captures store pointers (`T*`). The lifted closure function unpacks mutable captures by loading the pointer and using it directly as an alias to the outer variable.
- [x] **RC Compatibility**: String captures are properly retained/released. Mutable captures alias the outer scope (no extra retain needed).
- [x] **malloc/free Declarations**: Added `malloc` and `free` declarations to the LLVM preamble for both standalone and runtime-hosted compilation modes.
- [x] **Test Coverage**: Native integration test (`closure_escape_test.fe`) covering escaping closures, multiple captures, mutable capture, and stored closures called multiple times.

---

### 28. Math Utilities (Standard Library)
- [x] **Runtime Functions**: `fs_math_abs`, `fs_math_min`, `fs_math_max`, `fs_math_pow`, `fs_math_sqrt`, `fs_math_clamp` implemented in `runtime.fe` as pure Ferro functions.
- [x] **`Math::abs(x)`**: Absolute value of integer.
- [x] **`Math::min(a, b)` / `Math::max(a, b)`**: Minimum / maximum of two integers.
- [x] **`Math::pow(base, exp)`**: Integer exponentiation. Returns 0 for negative exponents.
- [x] **`Math::sqrt(x)`**: Integer square root (floor) via Newton's method.
- [x] **`Math::clamp(x, lo, hi)`**: Clamp value to [lo, hi] range.
- [x] **Analyzer**: `Math` recognized as a static receiver; all methods return `int`.
- [x] **LLVM Backend**: `Math::method(args)` dispatches to `@fs_math_method(args)` runtime calls.
- [x] **TypeScript Backend**: `Math::abs` → `Math.abs`, `Math::sqrt` → `Math.floor(Math.sqrt(...))`, `Math::clamp` → `Math.min(Math.max(...))`, etc.
- [x] **Runtime Function Registry**: All 6 math functions added to `runtimeFnNames` for canonical name exemption.

### 29. Lazy Iterator Chains (Compile-Time Fusion)
- [x] **`vec.iter()` / `map.iter()`**: Returns `Iterator<T>` type in the analyzer. Acts as the entry point for lazy chains.
- [x] **`iter.map(f)`**: Lazy map adapter — returns `Iterator<U>` where U is the closure return type.
- [x] **`iter.filter(f)`**: Lazy filter adapter — returns `Iterator<T>` with predicate closure.
- [x] **`iter.collect()`**: Terminal operation — materializes the lazy chain into a `Vec<T>`.
- [x] **`iter.count()`**: Terminal operation — returns the number of elements passing all filters.
- [x] **`iter.sum()`**: Terminal operation — returns the sum of all elements after map/filter.
- [x] **`iter.for_each(f)`**: Terminal operation — calls closure on each passing element.
- [x] **Compile-Time Chain Fusion**: The LLVM backend walks the AST chain backward (`collect` → `filter` → `map` → `iter` → source), collects all closures, and emits a single fused loop. Zero runtime overhead — no intermediate Iterator struct or allocation.
- [x] **`for (x in iter_chain)`**: Iterator chains work as for-loop iterables. `for (x in vec.iter().filter(f).map(g))` fuses into a single loop with inline predicate/transform calls.
- [x] **Vec + HashMap Sources**: Both Vec and HashMap sources are supported. HashMap chains iterate over keys via cursor-based `fs_hashmap_iter_next`.
- [x] **Type Propagation**: Element types are tracked through chain steps — `map` updates the element type based on closure return type, `filter` preserves it.
- [x] **Analyzer**: Full type inference for closure params in chain contexts. `vec.iter().map((x) { x * 2 })` infers `x: int` from `Vec<int>`.
- [x] **TypeScript Backend**: `iter()` → identity, `map(f)` → `.map(f)`, `filter(f)` → `.filter(f)`, `collect()` → identity, `count()` → `.length`, `sum()` → `.reduce(...)`, `for_each(f)` → `.forEach(f)`.

### 30. User-Defined IntoIterator
- [x] **`IntoIterator` Trait**: Users can define `trait IntoIterator { fn into_iter(self: T) -> Vec<U>; }` and implement it for custom struct types.
- [x] **`for (x in struct_val)`**: When iterating over a struct that implements `IntoIterator`, the compiler calls `into_iter()` to get a Vec and iterates that.
- [x] **Analyzer**: `findIntoIteratorImpl()` looks up impl blocks to infer the element type from the `into_iter` return type (`Vec<T>` → `T`).
- [x] **LLVM Backend**: `tryEmitIntoIteratorForLoop()` searches impl blocks, calls the impl method, stores the resulting Vec, and emits a standard Vec iteration loop.
- [x] **TypeScript Backend**: Emits `IntoIterator.into_iter.get(_getType(obj))(obj)` trait dispatch for struct variables in for-loops.

### 31. Parser Generic Type Fix
- [x] **Generic Type Parsing**: Fixed infinite loop in `parseType()` when parsing generic types like `Vec<int>` in function return types. The parser now correctly advances past the last type parameter before checking for `>`.

---

### 32. String Interpolation (f-strings)
- [x] **`f"..."` Syntax**: Rust/Python-inspired f-string literals with `{expr}` interpolation. E.g., `f"Hello {name}, you are {age} years old!"`.
- [x] **Lexer**: `f"..."` recognized as `FString` token type. Content between quotes preserved with `{...}` delimiters intact, supporting nested braces in expressions.
- [x] **AST Node**: `InterpolatedStringExpression` with alternating `StringLiteral` / `Expression` parts array.
- [x] **Parser**: `parseFStringLiteral()` scans raw token content for `{`/`}` boundaries, sub-parses each interpolated expression via a fresh `Lexer`/`Parser` instance. Supports arbitrary expressions inside `{}` (identifiers, binary ops, function calls).
- [x] **Analyzer**: Type-checks each interpolated expression. Allows `int`, `string`, `bool` (and `i8`, `any`, `unknown`). Reports error for non-interpolatable types (e.g., structs). Returns `string` type.
- [x] **Runtime**: `fs_int_to_string(i32) -> fs_String` and `fs_bool_to_string(bool) -> fs_String` conversion functions added to `runtime.fe`.
- [x] **LLVM Backend**: `emitInterpolatedString()` converts each part to a string register (calling `fs_int_to_string`/`fs_bool_to_string` for non-string types), then chains `fs_string_concat` calls to build the result.
- [x] **TypeScript Backend**: `emitInterpolatedString()` emits native JavaScript template literals (`` `text ${expr} text` ``). Backticks and `$` in literal parts are escaped.
- [x] **Test Coverage**: Lexer tests (3), parser tests (4), integration test (`fstring_test.fe`).

---

### 33. Iterator Combinators on HashMap Values
- [x] **`map.values_iter()`**: Returns `Iterator<V>` — lazy iterator over HashMap values. Compile-time fused, zero-allocation.
- [x] **`map.keys_iter()`**: Returns `Iterator<K>` — explicit lazy key iterator (equivalent to `map.iter()`).
- [x] **`map.values().iter()` pattern**: Recognized as a lazy value iterator chain — the compiler detects the `values().iter()` pattern on HashMap and fuses it into a single cursor-based loop without materializing an intermediate Vec.
- [x] **Full chain support**: `values_iter().map(f).filter(g).collect()`, `.count()`, `.sum()`, `.for_each()`, and `for (v in map.values_iter().filter(f))` all work with compile-time fusion.
- [x] **LLVM Backend**: Value iteration uses `getelementptr` to offset from key pointer by `key_size` bytes within the cursor-based `fs_hashmap_iter_next` loop. All terminal operations (collect, count, sum, for_each, for-loop) support value iteration.
- [x] **TypeScript Backend**: `values_iter()` → `[...map.values()]`, `keys_iter()` → `[...map.keys()]`. Chain operations map to native JS array methods.
- [x] **Analyzer**: `values_iter()` returns `Iterator<V>`, `keys_iter()` returns `Iterator<K>`. Full bidirectional type inference for closure params in value iterator chains.
- [x] **Test Coverage**: `hashmap_values_iter_test.fe` with 10 tests covering collect, map, filter, chained map+filter, count, filter+count, sum, map+sum, for-loop with filter, and values().iter() pattern.

---

### 34. Higher-Level Error Handling (`Result<T, E>`)
- [x] **Built-in `Result<T, E>` Type**: `Result<T, E>` is resolved as a first-class `result` kind in the type system, separate from generic enums. `typesEqual` and `typeToString` fully support it.
- [x] **`Ok(value)` / `Err(error)` Constructors**: Registered as built-in functions in the analyzer. Type inference from enclosing function return type — `Ok(42)` inside `fn foo() -> Result<int, string>` infers `Result<int, string>`.
- [x] **`?` Operator Type Checking**: The `?` operator is validated by the analyzer — it extracts the `Ok` type from `Result<T, E>` and reports an error if used outside a function returning `Result`.
- [x] **Result Methods**: `.unwrap()` (returns T, panics on Err), `.unwrap_or(default)` (returns T or default), `.is_ok()` / `.is_err()` (returns bool), `.map(f)` (transforms Ok value, returns `Result<U, E>`), `.map_err(f)` (transforms Err value, returns `Result<T, F>`), `.and_then(f)` (flat-maps Ok, returns new Result), `.or_else(f)` (flat-maps Err, returns new Result).
- [x] **Result Pattern Matching**: `match result { Result::Ok(v) => ..., Result::Err(e) => ... }` with type-checked bindings. Analyzer binds `v: T` and `e: E` from `Result<T, E>`.
- [x] **TypeScript Backend**: Runtime helpers (`_result_unwrap`, `_result_unwrap_or`, `_result_is_ok`, `_result_is_err`, `_result_map`, `_result_map_err`, `_result_and_then`, `_result_or_else`). Result match emits `switch(__match_val.ok)` with `__match_val.value` / `__match_val.error` bindings.
- [x] **Type Comparison**: `typesEqual` compares `Result<T, E>` structurally (ok and err types must match). `Function` type comparison also implemented.
- [x] **Test Coverage**: 18 new tests in `result.test.ts` covering Ok/Err constructors, `?` operator validation, all 8 Result methods, pattern matching, type annotations, and TS code generation.

---

### 35. `break` / `continue` Loop Control
- [x] **Token Types**: Added `Break` and `Continue` keywords to the lexer.
- [x] **AST Nodes**: `BreakStatement` and `ContinueStatement` with token tracking.
- [x] **Parser**: `parseBreakStatement()` and `parseContinueStatement()` with optional trailing semicolons.
- [x] **Analyzer**: Loop depth tracking (`loopDepth`) — `break`/`continue` outside a loop produce an error. While loops are now visited for body analysis. For loops increment/decrement loop depth around body.
- [x] **TypeScript Backend**: Direct pass-through — `break;` and `continue;`.
- [x] **LLVM Backend**: Loop label stack (`loopLabelStack`) threaded through all loop types (while, range-for, Vec-for, HashMap-for, iterator-for, IntoIterator-for). `break` branches to the loop's end label; `continue` branches to the increment/condition label. Dead blocks emitted after branch to satisfy LLVM's basic block requirements.

### 36. Inherent `impl` Blocks
- [x] **AST**: `ImplBlock.traitName` changed to `Identifier | null` — null indicates an inherent impl.
- [x] **Parser**: `parseImplBlock()` detects inherent vs trait impl by checking for `for` keyword after the first identifier. `impl Type { ... }` (no `for`) creates an inherent impl; `impl Trait for Type { ... }` creates a trait impl.
- [x] **Analyzer**: Inherent impls stored in `implBlockStore` without trait registration. `findInherentMethod()` looks up methods on a type across inherent impl blocks. Static calls (`Type::method()`) and instance method calls (`val.method()`) resolve inherent methods.
- [x] **TypeScript Backend**: Inherent impl emits a `const Type_impl = { method() { ... } }` namespace object. `Type::method(args)` → `Type_impl.method(args)`.
- [x] **LLVM Backend**: Inherent methods use `__inherent` as a pseudo-trait name for registration and dispatch. Null-safe access to `traitName` across all impl block handling.

### 37. `Option<T>` Built-in Type
- [x] **Type System**: Added `{ kind: "option", inner: Type }` type kind with `typesEqual` and `typeToString` support.
- [x] **Built-in Constructors**: `Some(value)` and `None` registered as built-in symbols in both the analyzer and module loader scopes. `Some(v)` infers `Option<inner>` from the argument type. `Option::Some(v)` and `Option::None` static call syntax also supported.
- [x] **`?` Operator**: Extracts `inner` type from `Option<T>`. Validates that the enclosing function returns `Option<T>`. Tracked via `currentFnReturnsOption` flag.
- [x] **Option Methods**: `.unwrap()` (returns T, panics on None), `.unwrap_or(default)` (returns T or default), `.is_some()` / `.is_none()` (returns bool), `.map(f)` (returns `Option<U>`), `.and_then(f)` (flat-map), `.or_else(f)` (fallback).
- [x] **Pattern Matching**: `match opt { Option::Some(v) => ..., Option::None => ... }` with type-checked bindings. Analyzer binds `v: T` from `Option<T>`.
- [x] **`resolveType`**: `Option<T>` in type annotations resolves to the `option` type kind.
- [x] **TypeScript Backend**: Runtime helpers (`_option_unwrap`, `_option_unwrap_or`, `_option_is_some`, `_option_is_none`, `_option_map`, `_option_and_then`, `_option_or_else`, `_try_option`). Option match emits `switch(__match_val.some)`. `_OptionNoneError` catch for `?` operator. Option-returning functions tracked for correct `?`/method dispatch.

---

## 🚧 In Progress Features

*(Nothing currently in progress)*

---

## 🛠 Planned Features

### Tier 1 — High Impact (Next Up)
- ~~**Floating-Point Type (`f64`)**~~: **Completed (see §3 Syntax Features)**
- ~~**`break` / `continue`**~~: **Completed (see §35)**
- ~~**Inherent `impl` Blocks**~~: **Completed (see §36)**
- ~~**`Option<T>` Built-in**~~: **Completed (see §37)**

### Tier 2 — Expressiveness
- **Tuple Types**: `(int, string)` with positional access (`.0`, `.1`), destructuring, struct-based LLVM representation.
- **String Methods**: `s.len()`, `s.contains("x")`, `s.starts_with("h")`, `s.trim()`, `s.to_uppercase()` — method syntax on strings via inherent impls.
- **Pattern Match Exhaustiveness**: Compiler warns when `match` is missing cases for enum variants.
- **`const` Declarations**: Compile-time constants (`const PI: f64 = 3.14159`).

### Tier 3 — Ecosystem & Polish
- ~~**Full `Result<T, E>` Support**~~: **Completed (see §34 Higher-Level Error Handling)**
- **Type Aliases**: `type Name = SomeType`.
- **Array Types**: Fixed-size `[int; 5]` for stack-allocated arrays.
- **Async/Await**: Important for JS ecosystem interop (large undertaking).

### Existing Planned Items
- **Standard Library**: ~~File I/O~~, ~~Math~~, ~~Error Handling~~ — completed. Remaining: higher-level abstractions.
- **Cycle Detection** (Low Priority): Optional weak references or cycle-collector.
- **FFI Enhancements**: More robust platform-specific ABI handling.

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
