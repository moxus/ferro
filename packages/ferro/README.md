# Ferro

Ferro is a rusty script for the JavaScript ecosystem. It brings Rust's safety guarantees and expressive syntax to TypeScript.

## Features
- **Immutability by Default**: Variables are immutable unless marked `mut`.
- **Result Types**: First-class support for `Result<T, E>` and `?` operator.
- **Expressions**: `if`, `block`, and `match` (planned) are expressions.
- **Transpilation**: Compiles to clean, readable TypeScript.

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
