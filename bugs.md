# Ferro — Known Bugs

## B001: Vec indexing returns unknown type in f-string interpolation

**Severity:** Medium
**Component:** Analyzer (type inference)
**Discovered:** 2026-02-13 (playground puzzle testing)

Vec element access via indexing (e.g. `v[0]`) resolves to type `?` instead of the element type. This causes f-string interpolation to reject the expression:

```ferro
let v: Vec<int> = two_sum([2, 7, 11, 15], 9);
print(f"{v[0]} {v[1]}");
// error: Cannot interpolate type ? in f-string (expected int, f64, string, or bool)
```

**Workaround:** Use a `for` loop to iterate and print, or assign to a typed intermediate variable.

---

## B002: Emitter drops parentheses in nested arithmetic passed to function calls

**Severity:** High
**Component:** Codegen (emitter.ts)
**Discovered:** 2026-02-13 (playground puzzle testing)

When a parenthesized arithmetic expression is passed as a function argument, the emitter strips the parentheses, producing incorrect operator precedence in the output:

```ferro
let mid = Math::floor((low + high) / 2);
// Emits: const mid = Math.floor(low + high / 2);
// Should emit: const mid = Math.floor((low + high) / 2);
```

This causes `high / 2` to evaluate first instead of `(low + high) / 2`, leading to incorrect results and infinite loops in algorithms like binary search.

**Workaround:** Compute the sub-expression in a separate variable:
```ferro
let sum = low + high;
let mid = Math::floor(sum / 2);
```

---

## B003: HashMap methods broken in TS backend

**Severity:** High
**Component:** Codegen (emitter.ts)
**Discovered:** 2026-02-13 (playground capability testing)

HashMap `.insert()`, `.contains_key()`, and `.len()` do not work in the TypeScript backend. Only `.get()` works correctly.

```ferro
let mut map = HashMap::new();
map.insert("key", 42);   // broken
map.contains_key("key");  // broken
map.len();                 // broken
```

**Workaround:** None. Avoid HashMap mutations in TS-targeted code.

---

## B004: No modulo operator

**Severity:** Medium
**Component:** Lexer
**Discovered:** 2026-02-13 (playground puzzle testing)

The `%` character is lexed as `ILLEGAL`. There is no modulo/remainder operator.

```ferro
let r = 10 % 3;  // lexer error: ILLEGAL token
```

**Workaround:** Compute manually: `a - Math::floor(a / b) * b`

---

## B005: Integer division produces float

**Severity:** Low
**Component:** Codegen / Type system
**Discovered:** 2026-02-13 (playground capability testing)

Division of two integers produces a float result (follows JavaScript semantics), not a truncated integer:

```ferro
let x = 7 / 2;  // produces 3.5, not 3
```

**Workaround:** Wrap with `Math::floor()`: `Math::floor(7 / 2)` → `3`
