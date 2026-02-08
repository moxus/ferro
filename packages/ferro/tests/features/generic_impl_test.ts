
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
interface Point {
  x: number;
  y: number;
}
const Mag = {
  magnitude: new Map()
};
Mag.magnitude.set("Point", function(self: any) {
return self.x + self.y;
});
const p: Point = { x: 10, y: 20 };
const m: int = Mag.magnitude.get(_getType(p))(p);
print(m);