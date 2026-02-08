
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
const x = (() => {
if (true) {
return 1;
} else {
return 0;
}
})();