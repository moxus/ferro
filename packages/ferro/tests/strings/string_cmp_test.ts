
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
const a: string = "apple";
const b: string = "banana";
const c: string = "apple";
const d: string = "app";
if (a < b) {
print(1);
} else {
print(0);
}
if (b < a) {
print(0);
} else {
print(1);
}
if (a > b) {
print(0);
} else {
print(1);
}
if (b > a) {
print(1);
} else {
print(0);
}
if (a <= c) {
print(1);
} else {
print(0);
}
if (a >= c) {
print(1);
} else {
print(0);
}
if (a <= b) {
print(1);
} else {
print(0);
}
if (b >= a) {
print(1);
} else {
print(0);
}
if (d < a) {
print(1);
} else {
print(0);
}
if (a > d) {
print(1);
} else {
print(0);
}
const e: string = "";
if (e < a) {
print(1);
} else {
print(0);
}
if (a >= e) {
print(1);
} else {
print(0);
}