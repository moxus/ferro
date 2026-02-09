
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
print(Math.abs(5));
print(Math.abs(-3));
print(Math.abs(0));
print(Math.min(3, 7));
print(Math.max(3, 7));
print(Math.min(-1, 1));
print(Math.max(-1, 1));
print(Math.pow(2, 10));
print(Math.pow(3, 3));
print(Math.pow(5, 0));
print(Math.floor(Math.sqrt(100)));
print(Math.floor(Math.sqrt(81)));
print(Math.floor(Math.sqrt(2)));
print(Math.min(Math.max(5, 0), 10));
print(Math.min(Math.max(-3, 0), 10));
print(Math.min(Math.max(15, 0), 10));