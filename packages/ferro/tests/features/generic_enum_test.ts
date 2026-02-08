
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
const Option = {
  Some: (_0) => ({ tag: "Some", _0 }),
  None: { tag: "None" },
};
const x = Option.Some(42);
const y = Option.None;
(() => { const __match_val = x; switch(__match_val.tag) {
case "Some": { const v = __match_val._0;
return print(v); }
case "None": { 
return print(0); }
} })();
(() => { const __match_val = y; switch(__match_val.tag) {
case "Some": { const v = __match_val._0;
return print(v); }
case "None": { 
return print(99); }
} })();