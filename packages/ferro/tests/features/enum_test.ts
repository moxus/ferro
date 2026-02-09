
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
const Color = {
  Red: { tag: "Red" },
  Green: { tag: "Green" },
  Blue: { tag: "Blue" },
};
const Shape = {
  Circle: (_0) => ({ tag: "Circle", _0 }),
  Rectangle: (_0, _1) => ({ tag: "Rectangle", _0, _1 }),
  Point: { tag: "Point" },
};
function describe_shape(s: Shape) {
return (() => { const __match_val = s; switch(__match_val.tag) {
case "Circle": { const r = __match_val._0;
return r; }
case "Rectangle": { const w = __match_val._0;
const h = __match_val._1;
return w + h; }
case "Point": { 
return 0; }
} })();
};
const s1: Shape = Shape.Circle(5);
const s2: Shape = Shape.Rectangle(3, 4);
const s3: Shape = Shape.Point;
print(describe_shape(s1));
print(describe_shape(s2));
print(describe_shape(s3));