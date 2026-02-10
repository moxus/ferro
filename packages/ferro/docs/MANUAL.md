# Ferro Language Manual

Ferro is a strongly-typed, immutable-by-default language that compiles to TypeScript or native binaries via LLVM. It borrows heavily from Rust's syntax and semantics to provide a safer scripting environment.

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

## 8. Type Aliases

Type aliases create a new name for an existing type. They are transparent — the alias and the original type are fully interchangeable.

```rust
type IntPair = (int, int);
type Callback = (int) -> string;
type StringResult = Result<string, string>;
type Matrix = Vec<Vec<int>>;
```

### Usage

```rust
type Score = int;

fn display(s: Score) -> string {
    f"Score: {s}"
}

let my_score: Score = 100;
print(display(my_score));
```

### Generic Type Aliases

Aliases can reference generic types:

```rust
type StringMap = HashMap<string, string>;
type Pair = (int, int);
```

### Compilation

Type aliases emit `type Name = MappedType;` in the TypeScript backend. In the LLVM backend, they are resolved at compile time and produce no runtime code.

## 9. Arrays

Arrays are fixed-size, stack-allocated collections with a compile-time known length.

### Array Type Syntax

```rust
let nums: [int; 3] = [1, 2, 3];
let flags: [bool; 4] = [true, false, true, false];
```

The type `[T; N]` denotes an array of `N` elements of type `T`.

### Repeat Expressions

Create an array by repeating a value:

```rust
let zeros = [0; 5];       // [0, 0, 0, 0, 0]
let blank = [""; 10];     // 10 empty strings
```

The syntax `[value; count]` creates an array of `count` elements, each initialized to `value`.

### Regular Array Literals

Standard array literals still work as before:

```rust
let items = [1, 2, 3];
```

### Compilation

- **TypeScript backend**: `[value; N]` compiles to `Array(N).fill(value)`. Array types map to `T[]`.
- **LLVM backend**: Arrays are stack-allocated as `[N x T]`. Repeat expressions emit an alloca followed by a store loop.

## 10. Async / Await

Ferro supports asynchronous programming with `async` functions and `await` expressions.

### Async Functions

Prefix a function with `async` to make it asynchronous. Async functions return `Promise<T>`:

```rust
async fn fetch_data(url: string) -> string {
    let response = await http_get(url);
    response
}
```

### Await Expressions

Use `await` to suspend execution until a promise resolves. Two syntax forms are supported:

**Prefix form:**
```rust
let data = await fetch_data("https://example.com");
```

**Postfix form:**
```rust
let data = fetch_data("https://example.com").await;
```

Both forms are equivalent.

### Compile-Time Validation

The analyzer enforces that `await` is only used inside `async` functions. Using `await` in a non-async context produces a compile error:

```rust
fn bad() {
    let x = await something();  // ERROR: await outside async function
}
```

### Compilation

- **TypeScript backend**: `async fn` emits `async function`, and `await expr` emits `await expr`.
- **LLVM backend**: `await` is a passthrough (native async is not yet supported at the IR level).

## 11. Weak References

`Weak<T>` provides non-owning references that do not prevent deallocation. They are used to break reference cycles in data structures like trees and graphs.

### Creating Weak References

```rust
// Create an empty weak reference
let empty: Weak<Node> = Weak::new();

// Create a weak reference from a strong reference
let strong_ref = get_node();
let weak_ref = Weak::downgrade(strong_ref);
```

### Upgrading

Convert a weak reference back to a strong reference with `.upgrade()`. This may return null if the referenced value has been deallocated:

```rust
let maybe_node = weak_ref.upgrade();
```

### Use Case: Parent Pointers

```rust
struct TreeNode {
    value: int,
    parent: Weak<TreeNode>,
    children: Vec<TreeNode>
}
```

Using `Weak<TreeNode>` for parent pointers prevents a reference cycle between parent and children.

### Compilation

- **TypeScript backend**: `Weak<T>` compiles to `WeakRef<T>`. `Weak::new()` compiles to `null`. `Weak::downgrade(v)` compiles to `new WeakRef(v)`. `.upgrade()` compiles to `.deref()`.
- **LLVM backend**: `Weak<T>` is represented as a raw pointer (`T*`). Weak references do not participate in reference counting.

## 12. FFI and Extern Blocks

Foreign function declarations can be grouped in extern blocks with an ABI string.

### Single Extern (existing syntax)

```rust
extern fn malloc(size: i32) -> *i8;
```

### Extern Blocks

Group related declarations together:

```rust
extern "C" {
    fn malloc(size: i32) -> *i8;
    fn free(ptr: *i8);
    fn realloc(ptr: *i8, size: i32) -> *i8;
    fn memcpy(dest: *i8, src: *i8, n: i32) -> *i8;
}
```

The ABI string (e.g., `"C"`) is stored on each declaration for future cross-language calling convention support.

### Calling Extern Functions

All extern function calls require an `unsafe` block:

```rust
unsafe {
    let ptr = malloc(64);
    free(ptr);
}
```

### Variadic Externs

Extern functions can be variadic:

```rust
extern fn printf(fmt: *i8, ...) -> i32;

unsafe {
    printf("value: %d\n", 42);
}
```

### Compilation

- **TypeScript backend**: Extern blocks emit no code (declarations only).
- **LLVM backend**: Each function in an extern block emits a `declare` directive in the IR.
