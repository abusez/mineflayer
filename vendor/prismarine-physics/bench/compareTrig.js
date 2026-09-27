const { sin32, JavaFloat } = require('../lib/javamath')
const { f32sin, f32 } = require('../lib/math')
const assert = require('node:assert')
for (let i = 0; i < 65536; i++) {
  const angle = i * Math.PI * 2.0 / 65536.0
  const oldSin = sin32(new JavaFloat(angle)).valueOf()
  const newSin = f32sin(f32(angle))
  assert(oldSin === newSin, `Sine mismatch at index ${i}: old=${oldSin} new=${newSin}`)
  const oldCos = sin32(new JavaFloat(angle + Math.PI / 2)).valueOf()
  const newCos = f32sin(f32(angle + Math.PI / 2))
  assert(oldCos === newCos, `Cosine mismatch at index ${i}: old=${oldCos} new=${newCos}`)
}

console.log('All sine and cosine values match between implementations.')