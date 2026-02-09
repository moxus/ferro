
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
function apply(f: any, x: i32) {
return f(x);
};
const double = (x: i32): i32 => x * 2;
print(apply(double, 5));
const offset: int = 10;
const add_offset = (x: i32): i32 => x + offset;
print(apply(add_offset, 7));
const a: int = 1;
const b: int = 2;
const sum_all = (x: i32): i32 => x + a + b;
print(apply(sum_all, 100));