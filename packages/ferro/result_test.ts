
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
function may_fail(x) {
if (x < 0) {
return Err("negative");
}
return Ok(x);
};
function process(v) {
try {
const x = _try(may_fail(v));
const y = _try(may_fail(v + 1));
return Ok(x + y);
} catch (e) {
  if (e instanceof _ResultError) return { ok: false, error: e.error };
  throw e;
}
};
const res = process(10);
const fail = process(-5);