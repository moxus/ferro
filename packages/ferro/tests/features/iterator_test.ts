
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
v.push(10);
v.push(20);
v.push(30);
let total: int = 0;
for (const x of v) {
total = total + x;
}
print(total);
let sum: int = 0;
for (let i = 0; i < 5; i++) {
sum = sum + i;
}
print(sum);
let m = new Map();
m.insert(1, 10);
m.insert(2, 20);
m.insert(3, 30);
let key_sum: int = 0;
for (const k of m.keys()) {
key_sum = key_sum + k;
}
print(key_sum);
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
const big = nums.filter((x: number): boolean => x > 1);
print(big.len());
const ks = [...m.keys()];
print(ks.len());
const vs = [...m.values()];
let vsum: int = 0;
for (const val of vs) {
vsum = vsum + val;
}
print(vsum);