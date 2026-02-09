
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
let m = new Map();
m.insert(1, 10);
m.insert(2, 20);
m.insert(3, 30);
const vals = [...m.values()];
let s1: int = 0;
for (const v of vals) {
s1 = s1 + v;
}
print(s1);
const doubled = [...m.values()].map((x: number): number => x * 2);
let s2: int = 0;
for (const v of doubled) {
s2 = s2 + v;
}
print(s2);
const big = [...m.values()].filter((x: number): boolean => x > 15);
print(big.len());
const result = [...m.values()].map((x: number): number => x * 3).filter((x: number): boolean => x > 50);
let s3: int = 0;
for (const v of result) {
s3 = s3 + v;
}
print(s3);
const c = [...m.values()].length;
print(c);
const c2 = [...m.values()].filter((x: number): boolean => x > 15).length;
print(c2);
const total = [...m.values()].reduce((a: number, b: number) => a + b, 0);
print(total);
const doubled_sum = [...m.values()].map((x: number): number => x * 10).reduce((a: number, b: number) => a + b, 0);
print(doubled_sum);
let s4: int = 0;
for (const v of [...m.values()].filter((x: number): boolean => x > 15)) {
s4 = s4 + v;
}
print(s4);
const vals2 = [...m.values()].map((x: number): number => x + 1);
let s5: int = 0;
for (const v of vals2) {
s5 = s5 + v;
}
print(s5);