
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
let nums = [];
nums.push(1);
nums.push(2);
nums.push(3);
const doubled = nums.map((x: number): number => x * 2);
let dsum: int = 0;
for (const d of doubled) {
dsum = dsum + d;
}
print(dsum);
const tripled = nums.map((it: number): number => it * 3);
let tsum: int = 0;
for (const t of tripled) {
tsum = tsum + t;
}
print(tsum);
const big = nums.filter((x: number): boolean => x > 1);
print(big.len());
const small = nums.filter((it: number): boolean => it <= 1);
print(small.len());
const explicit = nums.map((x: number): number => x + 10);
let esum: int = 0;
for (const e of explicit) {
esum = esum + e;
}
print(esum);
function apply(x: number, f: any) {
return f(x);
};
const result = apply(7, (x: number): number => x * 3);
print(result);