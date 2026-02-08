let x = 10;
const y = 20;
function add(a, b) {
return a + b;
};
const result = add(x, y);
(() => {
if (result > 25) {
x = x + 1;
} else {
x = x - 1;
}
})();
function complex() {
const a = 1;
const b = 2;
return a + b;
};