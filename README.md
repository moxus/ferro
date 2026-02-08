# Ferro

Ferro is a Rust-inspired scripting language for the JavaScript/TypeScript ecosystem. It compiles `.fe` files to either clean TypeScript or native binaries via LLVM IR.

Ferro brings Rust's type safety, pattern matching, and ownership semantics to a lightweight scripting language that slots directly into your JS/TS toolchain — or compiles to standalone native executables when you need raw performance.

## Quick Start

### Installation

```bash
git clone <repo-url>
cd ferro
npm install
npm run build
```

### Hello World

Create a file called `hello.fe`:

```ferro
print("Hello, Ferro!");
```

**Transpile to TypeScript:**

```bash
node packages/ferro/dist/cli.js hello.fe
```

**Compile to native binary (requires `clang`):**

```bash
node packages/ferro/dist/cli.js hello.fe --native
./hello
```

## Language Guide

### Variables

Variables are immutable by default. Use `let mut` for mutable bindings.

```ferro
let x: int = 42;          // immutable, type-annotated
let name = "Ferro";        // immutable, type inferred
let mut count: int = 0;    // mutable
count = count + 1;         // OK — count is mutable
```

Attempting to reassign an immutable variable is a compile-time error.

### Types

#### Primitives

| Type     | Description                   |
|----------|-------------------------------|
| `int`    | 32-bit signed integer         |
| `i8`     | 8-bit signed byte             |
| `bool`   | Boolean (`true` / `false`)    |
| `string` | Reference-counted UTF-8 string|
| `void`   | No value                      |

#### Pointers

```ferro
let ptr: *int = &x;     // pointer to int
let raw: *i8 = &byte;   // pointer to byte
```

Pointer dereference and extern function calls require `unsafe` blocks (see [Unsafe](#unsafe) below).

#### Type Casting

Ferro supports explicit type casts with the `as` keyword:

```ferro
let x: int = 300;
let byte: i8 = x as i8;       // truncate to 8 bits
let back: int = byte as int;   // sign-extend to 32 bits
let flag: bool = 1 as bool;    // int to bool
```

### Functions

Functions are declared with `fn`. The last expression in a function body is implicitly returned (no `return` keyword needed).

```ferro
fn add(a: int, b: int) -> int {
    a + b
}

fn greet(name: string) {
    print("Hello " + name);
}

let result = add(3, 4);    // 7
greet("world");
```

#### Generic Functions

```ferro
fn identity<T>(x: T) -> T {
    x
}

let a = identity::<int>(42);       // turbofish syntax
let b = identity::<bool>(true);
```

#### Trait Bounds

Constrain generic type parameters to types that implement specific traits:

```ferro
fn process<T: Summary>(x: T) -> T {
    x
}
```

### Closures

Ferro supports closures with Rust-style typed parameters and Kotlin-style trailing lambda syntax.

#### Typed Closures

```ferro
let double = (x: i32) -> i32 { x * 2 };
let greet = () -> string { "hello" };
```

#### Closures with Capture

Closures capture variables from their enclosing scope by value:

```ferro
let offset: int = 10;
let add_offset = (x: i32) -> i32 { x + offset };
print(add_offset(7));   // 17
```

#### Trailing Lambda Syntax

When a function's last parameter is a closure, you can pass it outside the parentheses:

```ferro
fn apply(f: (i32) -> i32, x: i32) -> i32 { f(x) }

// Trailing lambda
apply(5) { x -> x * 2 }

// Implicit `it` parameter for single-argument closures
list.map { it * 2 }

// Multi-parameter trailing lambda
pairs.fold(0) { acc, x -> acc + x }
```

#### Passing Closures to Functions

```ferro
fn apply(f: (i32) -> i32, x: i32) -> i32 {
    f(x)
}

let double = (x: i32) -> i32 { x * 2 };
print(apply(double, 5));   // 10
```

### Control Flow

#### If Expressions

`if` is an expression — it returns a value:

```ferro
let x = if (n > 0) { "positive" } else { "non-positive" };

if (score >= 90) {
    print("A");
} else if (score >= 80) {
    print("B");
} else {
    print("C");
};
```

#### While Loops

```ferro
let mut i: int = 0;
while (i < 10) {
    print(i);
    i = i + 1;
}
```

#### For Loops (Range-Based)

```ferro
let mut sum: int = 0;
for (i in 0..10) {
    sum = sum + i;
}
// sum = 45 (0 + 1 + 2 + ... + 9)
// Range is exclusive of the upper bound
```

#### Match Expressions

Pattern matching with destructuring:

```ferro
match value {
    42 => print("the answer"),
    _ => print("something else"),
}
```

Match is especially powerful with enums (see [Enums](#enums) below).

### Structs

```ferro
struct Point {
    x: int,
    y: int
}

let p = Point { x: 10, y: 20 };
print(p.x);      // field access
p.x = 30;        // field mutation
```

#### Generic Structs

```ferro
struct Box<T> {
    val: T
}

let b = Box::<int> { val: 42 };
print(b.val);
```

### Enums

Ferro enums are algebraic data types (ADTs). Variants can be unit types or carry associated data.

```ferro
enum Color {
    Red,
    Green,
    Blue,
}

enum Shape {
    Circle(int),
    Rectangle(int, int),
    Point,
}

let s = Shape::Circle(5);
```

#### Generic Enums

```ferro
enum Option<T> {
    Some(T),
    None,
}

let x = Option::<int>::Some(42);
let y = Option::<int>::None;
```

#### Pattern Matching on Enums

```ferro
fn describe(s: Shape) -> int {
    match s {
        Shape::Circle(r) => r,
        Shape::Rectangle(w, h) => w + h,
        Shape::Point => 0,
    }
}

match x {
    Option::Some(v) => print(v),
    Option::None => print(0),
};
```

### Traits & Impl Blocks

Traits define shared behavior. Impl blocks provide the implementation.

```ferro
struct Wrapper {
    value: int,
}

trait Extract {
    fn get_value(self: Wrapper) -> int;
    fn doubled(self: Wrapper) -> int;
}

impl Extract for Wrapper {
    fn get_value(self: Wrapper) -> int {
        self.value
    }

    fn doubled(self: Wrapper) -> int {
        self.value + self.value
    }
}

let w = Wrapper { value: 21 };
```

#### Calling Trait Methods

Two equivalent calling styles:

```ferro
// Static dispatch
let v = Extract::get_value(w);

// Method call syntax
let v = w.get_value();
```

#### Generic Impl Blocks

```ferro
impl<T> Container for Box<T> {
    fn get(self: Box<T>) -> T {
        self.value
    }
}
```

### Collections

#### Vec\<T\> (Dynamic Array)

```ferro
let mut v = Vec::<int>::new();
v.push(10);
v.push(20);
v.push(30);
print(v.len());       // 3
print(v.get(0));       // 10
v.set(1, 99);
print(v.get(1));       // 99
let last: int = v.pop();
print(last);           // 30
print(v.len());        // 2
```

#### HashMap\<K, V\>

```ferro
let mut m = HashMap::<int, int>::new();
m.insert(1, 100);
m.insert(2, 200);
m.insert(3, 300);
print(m.len());              // 3
print(m.get(1));             // 100
print(m.contains_key(2));    // 1 (true)
m.remove(2);
print(m.contains_key(2));    // 0 (false)
```

### Modules

Split your code across files with `import` and `export`:

**math.fe:**
```ferro
export fn add(a: int, b: int) -> int {
    a + b
}
```

**main.fe:**
```ferro
import { add } from "./math"
let result = add(10, 20);
print(result);
```

### Strings

Strings are reference-counted and support concatenation, comparison, and utility operations.

```ferro
let s = "Hello";
let greeting = s + " World";    // concatenation
print(greeting);

// Comparison (lexicographic)
if (s == "Hello") { print("match"); };
if ("abc" < "abd") { print("less"); };
```

### Operators

| Category    | Operators                            |
|-------------|--------------------------------------|
| Arithmetic  | `+`, `-`, `*`, `/`                   |
| Comparison  | `==`, `!=`, `<`, `>`, `<=`, `>=`     |
| Logical     | `!`, `&&`, `\|\|`                    |
| Pointer     | `*` (deref), `&` (address-of)        |
| Cast        | `as`                                 |
| Error       | `?` (propagation)                    |
| Range       | `..` (exclusive range)               |

### Block Expressions

Blocks return the value of their last expression:

```ferro
let result = {
    let a = 5;
    let b = 10;
    a + b
};
// result == 15
```

### Unsafe

Pointer dereference and extern function calls must be wrapped in `unsafe` blocks:

```ferro
extern fn malloc(size: i32) -> *i8;
extern fn free(ptr: *i8);

unsafe {
    let ptr: *i8 = malloc(100);
    free(ptr);
}
```

### FFI (Foreign Function Interface)

Declare C functions with `extern` and call them from `unsafe` blocks:

```ferro
extern fn printf(fmt: *i8, ...) -> i32;
extern fn putchar(c: i8) -> i32;

unsafe {
    printf("val: %d", 42);
    putchar(10 as i8);
}
```

Variadic functions (like `printf`) are supported with the `...` syntax.

### Memory Management

Ferro uses automatic reference counting for strings and heap-allocated data. The compiler inserts retain/release calls at scope boundaries.

```ferro
let a = "hello";        // rc = 1
let b = a;               // rc = 2 (retained)
// both released at scope exit

let mut s = "first";
s = "second";            // "first" is released, "second" has rc = 1

// Early cleanup with drop()
let mut large = "large data";
drop(large);
```

### Macros

Compile-time metaprogramming with `macro` and `quote!`:

```ferro
macro log(msg) {
    quote! {
        let _msg = $msg;
    }
}

log!("debug message");
```

Macros are transpiled to JavaScript and executed during compilation. `$identifier` inside `quote!` blocks injects expressions into the generated AST.

### JS Interop (TypeScript Target)

When compiling to TypeScript, you can use JS-native APIs directly:

```ferro
let arr: any = [];
arr.push(1);
arr.push(2);
console.log(arr);
```

### Comments

```ferro
// Single-line comment
let x = 42;  // inline comment
```

## Compilation Targets

### TypeScript

```bash
node packages/ferro/dist/cli.js source.fe
```

Generates a `.ts` file alongside each `.fe` source file. The output is clean, readable TypeScript.

### Native (LLVM)

```bash
node packages/ferro/dist/cli.js source.fe --native
```

Generates LLVM IR (`.ll` file) and compiles it to a native binary via `clang`. Requires `clang` to be installed. The self-hosted Ferro runtime is automatically linked — no external C runtime dependencies.

## Editor Support

The `ferro-vscode` package provides a VSCode extension with:

- Syntax highlighting (TextMate grammar)
- Real-time diagnostics (syntax and type errors)
- Autocompletion
- Hover information

## Project Structure

```
packages/
  ferro/            Compiler, LSP, CLI
    src/
      lexer/        Tokenizer
      parser/       Recursive descent parser
      ast/          AST node definitions
      analysis/     Semantic analyzer, types, modules
      codegen/      TypeScript & LLVM backends
      macros/       Macro expander
      lsp/          Language server
      cli.ts        CLI entry point
      runtime.fe    Self-hosted runtime (Ferro)
    tests/          Unit and integration tests
  ferro-vscode/     VSCode extension
```

## License

See [LICENSE](./LICENSE) for details.
