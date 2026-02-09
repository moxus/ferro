
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
print(v.len());
print(v.get(0));
print(v.get(1));
print(v.get(2));
v.set(1, 99);
print(v.get(1));
const p: int = v.pop();
print(p);
print(v.len());