# Ferro

Ferro is a Rust-inspired programming language for the JavaScript/TypeScript ecosystem. It compiles `.fe` source files to either clean TypeScript or native binaries via LLVM, giving you Rust's expressive syntax and safety guarantees with the flexibility of dual compilation targets.

## Feature Highlights

- **Rust-like syntax** with strong static typing, immutability by default, and pattern matching
- **Dual compilation targets** &mdash; transpile to TypeScript for Node.js/browser or compile to native binaries via LLVM IR
- **Algebraic data types** with enums, structs, generics, and full pattern matching
- **Error handling** via `Result<T, E>` and `Option<T>` with the `?` operator
- **Closures** with trailing lambda syntax, bidirectional type inference, and mutable capture
- **Lazy iterators** with compile-time chain fusion (zero runtime overhead)
- **Collections** &mdash; `Vec<T>` and `HashMap<K, V>` with method chaining
- **Traits and generics** with trait bounds and monomorphization
- **Reference counting** for automatic memory management in native builds
- **Self-hosted runtime** written entirely in Ferro
- **LSP and VSCode extension** for editor support

---

## Getting Started

### Prerequisites

- **Node.js** (v18+) and npm
- **LLVM/Clang** (only required for native compilation with `--native`)

### Installation

```bash
git clone <repo-url>
cd rustscript
npm install
npm run build
```

### Your First Program

Create a file called `hello.fe`:

```rust
fn main() {
    print("Hello, Ferro!");
}
```

Run it:

```bash
# Transpile to TypeScript
node packages/ferro/dist/cli.js hello.fe

# Or compile to a native binary
node packages/ferro/dist/cli.js hello.fe --native
./hello
```

---

## Language Guide

### Variables

Variables are **immutable by default**. Use `mut` to opt into mutability.

```rust
let x = 42;           // immutable
let mut count = 0;     // mutable
count = count + 1;     // OK

let name: string = "Ferro";   // explicit type annotation
let pi: f64 = 3.14159;
```

### Primitive Types

| Type     | Description                     |
|----------|---------------------------------|
| `int`    | 32-bit signed integer           |
| `i8`     | 8-bit signed integer (byte)     |
| `f64`    | 64-bit floating-point           |
| `string` | UTF-8 string                    |
| `bool`   | Boolean (`true` / `false`)      |
| `void`   | Unit type (no return value)     |

### Functions

Functions use the `fn` keyword. The last expression in a block is the implicit return value.

```rust
fn add(a: int, b: int) -> int {
    a + b
}

fn greet(name: string) {
    print(f"Hello, {name}!");
}
```

#### Generic Functions

```rust
fn identity<T>(x: T) -> T {
    x
}

let val = identity<int>(42);   // explicit type argument
```

### Control Flow

#### If Expressions

`if` is an expression and returns a value:

```rust
let label = if (score > 90) { "A" } else { "B" };
```

#### Match Expressions

Pattern matching on values and enum variants:

```rust
fn describe(code: int) -> string {
    match code {
        200 => "OK",
        404 => "Not Found",
        _   => "Unknown",
    }
}
```

#### Loops

```rust
// Range-based for loop (exclusive upper bound)
for (i in 0..10) {
    print(i);
}

// While loop
let mut n = 0;
while (n < 5) {
    print(n);
    n = n + 1;
}

// Iterate over a collection
for (item in my_vec) {
    print(item);
}
```

`break` and `continue` work in all loop types:

```rust
for (i in 0..100) {
    if (i > 50) { break; }
    if (i % 2 == 0) { continue; }
    print(i);
}
```

### String Interpolation

Use f-strings with `{expr}` for interpolation:

```rust
let name = "world";
let n = 42;
print(f"Hello {name}, the answer is {n}");
```

### Type Casting

Rust-style `as` casts:

```rust
let x: int = 10;
let y: f64 = x as f64;
let byte: i8 = 255 as i8;
```

---

## Structs

Define record types with named fields:

```rust
struct Point {
    x: int,
    y: int
}

let p = Point { x: 10, y: 20 };
print(p.x + p.y);
```

### Impl Blocks

Attach methods to structs:

```rust
impl Point {
    fn new(x: int, y: int) -> Point {
        Point { x: x, y: y }
    }

    fn magnitude(self: Point) -> int {
        Math::sqrt(self.x * self.x + self.y * self.y)
    }
}

let p = Point::new(3, 4);   // static method
print(p.magnitude());       // instance method
```

### Generic Structs

```rust
struct Box<T> {
    value: T
}

let b = Box<int> { value: 42 };
```

---

## Enums and Pattern Matching

Enums are algebraic data types that can carry associated data:

```rust
enum Shape {
    Circle(int),
    Rectangle(int, int),
    Point,
}

let s = Shape::Circle(5);

match s {
    Shape::Circle(r) => print(f"Circle with radius {r}"),
    Shape::Rectangle(w, h) => print(f"Rectangle {w}x{h}"),
    Shape::Point => print("Just a point"),
}
```

Generic enums work too:

```rust
enum Option<T> {
    Some(T),
    None,
}

let maybe = Option<int>::Some(42);
```

---

## Traits

Traits define shared behavior across types:

```rust
trait Summary {
    fn summarize(self: int) -> string;
}

impl Summary for int {
    fn summarize(self: int) -> string {
        f"The number {self}"
    }
}

let result = Summary::summarize(42);
```

### Trait Bounds

Constrain generic type parameters:

```rust
fn display<T: Summary>(item: T) -> string {
    Summary::summarize(item)
}
```

---

## Error Handling

Ferro uses `Result<T, E>` and `Option<T>` instead of exceptions.

### Result

```rust
fn divide(a: int, b: int) -> Result<int, string> {
    if (b == 0) {
        Err("division by zero")
    } else {
        Ok(a / b)
    }
}
```

#### The `?` Operator

Propagate errors concisely:

```rust
fn calculate() -> Result<int, string> {
    let x = divide(10, 2)?;    // unwraps Ok or returns Err early
    let y = divide(x, 3)?;
    Ok(x + y)
}
```

#### Pattern Matching on Results

```rust
match divide(10, 0) {
    Result::Ok(val) => print(f"Got {val}"),
    Result::Err(e) => print(f"Error: {e}"),
}
```

#### Result Methods

```rust
result.unwrap()              // extract value or panic
result.unwrap_or(0)          // extract value or use default
result.is_ok()               // returns bool
result.is_err()              // returns bool
result.map { v -> v * 2 }   // transform the Ok value
result.map_err { e -> f"Error: {e}" }
result.and_then { v -> divide(v, 2) }
result.or_else { e -> Ok(0) }
```

### Option

```rust
fn find(id: int) -> Option<string> {
    if (id == 1) {
        Some("found")
    } else {
        None
    }
}

let name = find(1)?;   // unwraps Some or returns None early

match find(2) {
    Option::Some(v) => print(v),
    Option::None => print("not found"),
}
```

Option has the same set of methods as Result: `unwrap`, `unwrap_or`, `is_some`, `is_none`, `map`, `and_then`, `or_else`.

---

## Collections

### Vec

Dynamic, heap-allocated arrays:

```rust
let mut v = Vec<int>::new();
v.push(10);
v.push(20);
v.push(30);

print(v.len());      // 3
print(v.get(0));      // 10
v.set(1, 99);
let last = v.pop();

for (x in v) {
    print(x);
}
```

### HashMap

Key-value store with open-addressing:

```rust
let mut m = HashMap<int, string>::new();
m.insert(1, "one");
m.insert(2, "two");

print(m.get(1));              // "one"
print(m.contains_key(2));     // true
m.remove(1);

for (key in m) {
    print(key);
}

let all_keys = m.keys();      // Vec<int>
let all_vals = m.values();    // Vec<string>
```

---

## Closures

Ferro supports closures with multiple syntax forms:

```rust
// Standalone typed closure
let double = (x: int) -> int { x * 2 };

// Trailing lambda (Kotlin-style)
vec.map { x -> x * 2 };

// Implicit `it` parameter
vec.filter { it > 5 };

// Capturing variables
let offset = 10;
let add_offset = (x: int) -> int { x + offset };

// Mutable capture
let mut count = 0;
let inc = { count = count + 1 };
inc();
print(count);   // 1

// Escaping closures
fn make_adder(n: int) -> (int) -> int {
    (x: int) -> int { x + n }
}
let add5 = make_adder(5);
print(add5(10));   // 15
```

---

## Iterators

Lazy iterator chains are fused at compile time into a single loop with zero allocation overhead:

```rust
let nums = Vec<int>::new();
// ... push some values ...

// Lazy chain: nothing happens until a terminal operation
let result = nums.iter()
    .filter { x -> x > 5 }
    .map { x -> x * 2 }
    .collect();       // materializes into Vec<int>

// Other terminals
let total = nums.iter().filter { it > 0 }.sum();
let count = nums.iter().filter { it > 10 }.count();
nums.iter().for_each { x -> print(x) };

// Use in for loops
for (x in nums.iter().filter { it > 5 }.map { it * 3 }) {
    print(x);
}
```

HashMap supports both key and value iteration:

```rust
for (v in map.values_iter().filter { it > 100 }) {
    print(v);
}
```

### Custom Iteration

Implement `IntoIterator` for your own types:

```rust
trait IntoIterator {
    fn into_iter(self: MyList) -> Vec<int>;
}

impl IntoIterator for MyList {
    fn into_iter(self: MyList) -> Vec<int> {
        // return elements as a Vec
    }
}

for (x in my_list) {
    print(x);
}
```

---

## Modules

Split code across files with `import` and `export`:

```rust
// math.fe
export fn add(a: int, b: int) -> int {
    a + b
}

export struct Vector {
    x: int,
    y: int
}
```

```rust
// main.fe
import { add, Vector } from "./math";

let v = Vector { x: 1, y: 2 };
print(add(v.x, v.y));
```

---

## File I/O

### Convenience Functions

```rust
File::write_to_string("output.txt", "Hello Ferro!");
let content = File::read_to_string("input.txt");
```

### File Handle API

```rust
let mut f = File::open("data.txt", "r");
let line = f.read_line();
f.close();

let mut out = File::open("log.txt", "w");
out.write_string("entry");
out.close();
```

---

## Math

Built-in math utilities available as static methods:

```rust
Math::abs(-5)            // 5
Math::min(3, 7)          // 3
Math::max(3, 7)          // 7
Math::pow(2, 10)         // 1024
Math::sqrt(144)          // 12
Math::clamp(15, 0, 10)   // 10
```

---

## Unsafe Code

Certain operations require an `unsafe` block: extern function calls, pointer dereference, and pointer arithmetic.

```rust
extern fn malloc(size: i32) -> *i8;
extern fn free(ptr: *i8);

fn example() {
    unsafe {
        let ptr = malloc(64);
        *ptr = 42 as i8;
        free(ptr);
    }
}
```

### Variadic Externs

```rust
extern fn printf(fmt: *i8, ...) -> i32;

unsafe {
    printf("value: %d\n", 42);
}
```

---

## Macros

Compile-time code generation with quasi-quoting:

```rust
macro log(msg) {
    quote! {
        let _msg = $msg;
        print(_msg);
    }
}

log!("debug message");
```

---

## Compilation Targets

### TypeScript (default)

```bash
node packages/ferro/dist/cli.js source.fe
```

Produces `source.ts` with a minimal runtime preamble. Run it with any TypeScript/Node.js toolchain.

### Native Binary (LLVM)

```bash
node packages/ferro/dist/cli.js source.fe --native
```

Produces `source.ll` (LLVM IR) and a native executable. Requires `clang` on your PATH. The self-hosted Ferro runtime is automatically linked &mdash; no C dependencies.

Memory management in native builds uses **reference counting** with automatic retain/release at scope boundaries. Use `drop(var)` for eager deallocation when needed.

---

## Editor Support

Ferro ships with a Language Server Protocol (LSP) server and a VSCode extension:

- **Real-time diagnostics** &mdash; syntax and type errors as you type
- **Completions and hover info**
- **Rust-style error messages** with colored output, source context, and caret indicators

Install the VSCode extension from `packages/ferro-vscode/`.

---

## Development

```bash
# Build the compiler
npm run build

# Run the test suite
cd packages/ferro && npx vitest run

# Transpile a file
node packages/ferro/dist/cli.js example.fe

# Compile to native
node packages/ferro/dist/cli.js example.fe --native
```

---

## Operator Reference

| Category    | Operators                          |
|-------------|------------------------------------|
| Arithmetic  | `+` `-` `*` `/`                   |
| Comparison  | `==` `!=` `<` `>` `<=` `>=`       |
| Logical     | `&&` `\|\|` `!`                   |
| Assignment  | `=`                                |
| Pointer     | `&` (address-of) `*` (deref)      |
| Cast        | `as`                               |
| Propagation | `?`                                |
| Range       | `..`                               |
| Access      | `.` `::`                           |
| Index       | `[]`                               |

---

## Keywords

```
let  mut  fn  return  if  else  match  while  for  in
break  continue  struct  enum  trait  impl  macro  quote
true  false  null  import  export  from  as  pub  extern  unsafe
```
