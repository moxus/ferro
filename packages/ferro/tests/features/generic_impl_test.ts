
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
interface Wrapper {
  value: number;
}
const Extract = {
  get_value: new Map(),
  doubled: new Map()
};
Extract.get_value.set("Wrapper", function(self: any) {
return self.value;
});
Extract.doubled.set("Wrapper", function(self: any) {
return self.value + self.value;
});
const w: Wrapper = { value: 21 };
const v: int = Extract.get_value.get(_getType(w))(w);
const d: int = Extract.doubled.get(_getType(w))(w);
print(v);
print(d);