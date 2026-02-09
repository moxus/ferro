
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
let v = [];
v.push(1);
v.push(2);
v.push(3);
const collected = v;
let s1: int = 0;
for (const x of collected) {
s1 = s1 + x;
}
print(s1);
const doubled = v.map((x: number): number => x * 2);
let s2: int = 0;
for (const x of doubled) {
s2 = s2 + x;
}
print(s2);
const big = v.filter((x: number): boolean => x > 1);
print(big.len());
const result = v.map((x: number): number => x * 3).filter((x: number): boolean => x > 5);
let s3: int = 0;
for (const x of result) {
s3 = s3 + x;
}
print(s3);
const c = v.length;
print(c);
const c2 = v.filter((x: number): boolean => x > 1).length;
print(c2);
const total = v.reduce((a: number, b: number) => a + b, 0);
print(total);
const doubled_sum = v.map((x: number): number => x * 10).reduce((a: number, b: number) => a + b, 0);
print(doubled_sum);
let s4: int = 0;
for (const x of v.filter((x: number): boolean => x > 1)) {
s4 = s4 + x;
}
print(s4);
let s5: int = 0;
for (const x of v.map((x: number): number => x + 100)) {
s5 = s5 + x;
}
print(s5);