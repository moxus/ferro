
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
m.insert(1, 100);
m.insert(2, 200);
m.insert(3, 300);
print(m.len());
print(m.get(1));
print(m.get(2));
print(m.get(3));
print(m.contains_key(2));
print(m.contains_key(99));
m.remove(2);
print(m.len());
print(m.contains_key(2));