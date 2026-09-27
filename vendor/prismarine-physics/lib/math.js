const assert = require('node:assert')

function clamp (min, x, max) {
  return Math.max(min, Math.min(x, max))
}

const f32 = Math.fround

// f32 binary statement ops: assume a, b are f32
function f32add (a, b) {
  return Math.fround(a + b)
}

function f32mul (a, b) {
  return Math.fround(a * b)
}

function f32sub (a, b) {
  return Math.fround(a - b)
}

function f32div (a, b) {
  return Math.fround(a / b)
}

const trigConstantOne = f32(10430.378)
const trigConstantTwo = f32(16384.0)

const SIN_TABLE = new Array(65536)

for (let i = 0; i < 65536; i++) {
  SIN_TABLE[i] = f32(Math.sin(
    i * Math.PI * 2.0 / 65536.0
  ))
}

// apparently math.floor is not the same as converting these flaots to int32!
function f32sin (x) {
  return SIN_TABLE[f32mul(x, trigConstantOne) & 65535]
}

function f32cos (x) {
  return SIN_TABLE[
  f32add(f32mul(x, trigConstantOne), trigConstantTwo) & 65535]
}

module.exports = {
  clamp,
  f32,
  f32add,
  f32mul,
  f32sub,
  f32div,
  f32sin,
  f32cos
}