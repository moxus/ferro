
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

interface Point {
  x: i32;
  y: i32;
}
function print_ptr(val: any) {
return ;
};
export function main() {
let x: i32 = 42;
const ptr: *i32 = ;
print_ptr(ptr);
print_ptr();
const p = { x: 10, y: 20 };
return print_ptr();
};
main();