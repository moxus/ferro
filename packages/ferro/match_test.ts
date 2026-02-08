
// FerroScript Runtime
class _ResultError extends Error {
  constructor(public error: any) { super(); }
}
function _try(res) {
  if (res && res.ok === true) return res.value;
  if (res && res.ok === false) throw new _ResultError(res.error);
  return res;
}
function Ok(value) { return { ok: true, value }; }
function Err(error) { return { ok: false, error }; }
function classify(x: int) {
return (() => { switch(x) {
case 0: return "zero";
case 1: return "one";
default: return "other";
} })();
};
const res = classify(1);
const type_check: int = 10;