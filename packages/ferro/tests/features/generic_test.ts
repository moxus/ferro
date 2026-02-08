
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
interface Box<T> {
  val: T;
}
export function main() {
const b1 = { val: 10 };
const b2 = { val: true };
print(b1.val);
return (() => {
if (b2.val) {
return print(100);
}
})();
};
main();