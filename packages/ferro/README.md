# Ferro

Ferro is a rusty script for the JavaScript ecosystem. It brings Rust's safety guarantees and expressive syntax to TypeScript.

## Features
- **Immutability by Default**: Variables are immutable unless marked `mut`.
- **Result Types**: First-class support for `Result<T, E>` and `?` operator.
- **Expressions**: `if`, `block`, and `match` are expressions.
- **Dual Compilation**: Transpiles to TypeScript or compiles to native binaries via LLVM.
- **Algebraic Data Types**: Enums with associated data, structs, generics, and pattern matching.
- **Traits and Generics**: Trait bounds, monomorphization, and trait-based dispatch.
- **Closures**: Trailing lambda syntax, mutable capture, and escaping closures.
- **Lazy Iterators**: Compile-time chain fusion with zero runtime overhead.
- **Collections**: `Vec<T>` and `HashMap<K, V>` with method chaining.
- **Type Aliases**: Named aliases for complex types (`type Name = Type;`).
- **Fixed-Size Arrays**: `[T; N]` types and `[val; N]` repeat expressions.
- **Async/Await**: `async` functions with `Promise<T>` and prefix/postfix `await`.
- **Weak References**: `Weak<T>` for breaking reference cycles.
- **FFI Extern Blocks**: `extern "C" { ... }` for grouping foreign declarations.
- **Modules**: `import`/`export` with cross-module compilation.
- **Macros**: Compile-time code generation with quasi-quoting.
- **Unsafe Blocks**: Controlled access to pointer dereference and extern calls.

## Install

```bash
npm install
npm run build

# Make the `ferro` command available globally
npm link
```

After linking, `ferro` is available as a CLI command. To uninstall: `npm unlink -g ferro`.

## Usage

```bash
ferro build source.fe              # transpile to TypeScript
ferro build source.fe --native     # compile to native binary via LLVM
ferro help                         # show help
ferro version                      # print version
```

## Example

```rust
fn may_fail(x) {
    if (x < 0) {
        return Err("negative");
    }
    Ok(x)
}

fn process(v) {
    let x = may_fail(v)?;
    let y = may_fail(v + 1)?;
    Ok(x + y)
}

let res = process(10);
```

## Development

```bash
npm install
npm run build
npx vitest run src/
```
