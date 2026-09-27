class IntSet {
  constructor (values) {
    const lookup = new Uint8Array(4096)
    for (const v of values) {
      lookup[v] = 1
    }
    this.lookup = lookup
  }
  has (value) {
    return this.lookup[value] === 1
  }
}

module.exports = { IntSet }