
// Ferro Runtime
class _ResultError extends Error {
  public error: any;
  constructor(error: any) { super(); this.error = error; }
}
function _try(res: any) {
  if (res && res.ok === true) return res.value;
  if (res && res.ok === false) throw new _ResultError(res.error);
  return res;
}
function Ok(value: any) { return { ok: true, value }; }
function Err(error: any) { return { ok: false, error }; }
function _getType(obj: any) {
  if (obj === null || obj === undefined) return "null";
  const type = typeof obj;
  if (type === "object") return obj.constructor.name;
  return type; // "string", "number", etc
}
function make_adder(n: number) {
return (x: number): number => x + n;
};
const add5 = make_adder(5);
const add10 = make_adder(10);
print(add5(3));
print(add10(3));
function make_linear(a: number, b: number) {
return (x: number): number => a * x + b;
};
const f = make_linear(2, 3);
print(f(5));
print(f(10));
let count: int = 0;
const inc = (x: number): number => {
count = count + x;
return count;
};
inc(1);
inc(2);
print(count);
let total: int = 0;
const accumulate = (x: number): number => {
total = total + x;
return total;
};
print(accumulate(10));
print(accumulate(20));
print(total);
const multiplier: int = 7;
const mul = (x: number): number => x * multiplier;
print(mul(3));
print(mul(6));