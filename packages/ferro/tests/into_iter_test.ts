
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
interface IntRange {
  start: number;
  end: number;
}
const IntoIterator = {
  into_iter: new Map()
};
IntoIterator.into_iter.set("IntRange", function(self: any) {
let v = [];
for (let i = self.start; i < self.end; i++) {
v.push(i);
}
return v;
});
const r: IntRange = { start: 0, end: 5 };
let sum: int = 0;
for (const x of IntoIterator.into_iter.get(_getType(r))(r)) {
sum = sum + x;
}
print(sum);