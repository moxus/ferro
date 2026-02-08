# Ferro

Ferro is a rusty script for the JavaScript ecosystem. It brings Rust's safety guarantees and expressive syntax to TypeScript.

## Features
- **Immutability by Default**: Variables are immutable unless marked `mut`.
- **Result Types**: First-class support for `Result<T, E>` and `?` operator.
- **Expressions**: `if`, `block`, and `match` (planned) are expressions.
- **Transpilation**: Compiles to clean, readable TypeScript.

## Usage

```bash
# Compile a file
./dist/cli.js source.fe
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
