# Ferro Language Manual

Ferro is a strongly-typed, immutable-by-default language that compiles to TypeScript. It borrows heavily from Rust's syntax and semantics to provide a safer scripting environment.

## 1. Variables

Variables are immutable by default. Use `mut` to make them mutable.

```rust
let x = 5;       // Immutable
let mut y = 10;  // Mutable
y = 15;          // OK
```

### Type Annotations
You can explicitly type variables. Ferro passes these types through to TypeScript.

```rust
let id: int = 123;
let name: string = "Ferro";
```

## 2. Functions

Functions are declared with `fn`. The last expression in a block is the return value (implicit return).

```rust
fn add(a: int, b: int) -> int {
    a + b
}
```

## 3. Control Flow

### If Expressions
`if` is an expression, meaning it returns a value. Both branches must return compatible types.

```rust
let status = if (score > 50) { "Pass" } else { "Fail" };
```

### Match Expressions
`match` allows pattern matching on values. It compiles to an exhaustive `switch` statement.

```rust
let desc = match value {
    0 => "Zero",
    1 => "One",
    _ => "Many",
}
```

## 4. Error Handling

Ferro replaces `try/catch` with `Result<T, E>`.

### The `?` Operator
The `?` operator unwrap values or returns errors early.

```rust
fn risky_op() {
    // If divide returns Err, risky_op returns that Err immediately.
    // If it returns Ok(val), `result` gets `val`.
    let result = divide(10, 0)?; 
    Ok(result + 1)
}
```

## 5. Runtime

Ferro includes a minimal runtime that handles:
- `Ok(v)` / `Err(e)` constructors.
- `_try()` helper for the `?` operator.

This runtime is automatically injected into the output file.

## 6. Traits

Traits define shared behavior.

```rust
trait Summary {
    fn summarize(self: Self) -> string;
}

impl Summary for string {
    fn summarize(self: string) -> string {
        self
    }
}

let msg = Summary::summarize("Hello");
```

Traits use a global registry for dispatch, allowing you to implement traits for existing types (like `string` or `number`).

## 7. JavaScript Interop

Ferro allows seamless calling of JavaScript functions and methods.

```rust
fn main() {
    // Calling global functions
    console.log("Hello from Ferro!");

    // Using methods and arrays
    let mut data: any = [1, 2, 3];
    data.push(4);
}
```

### Member Access
Use the `.` operator to access properties or call methods on objects.

```rust
let len = name.length;
let upper = name.toUpperCase();
```
