
// FerroScript Runtime
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
function main() {
const a: int = 5;
const b: int = 10;
const r1: bool = a <= b;
const r2: bool = a <= a;
const r3: bool = b <= a;
const r4: bool = b >= a;
const r5: bool = a >= a;
const r6: bool = a >= b;
if (a <= 10) {
const x: int = 1;
}
return (() => {
if (b >= 5) {
const y: int = 2;
}
})();
};