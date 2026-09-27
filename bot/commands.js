'use strict'

const readline = require('readline')
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { configureMovements, installMovementGuards } = require('./movement')
const { ParkourMovements, attachFollower } = require('./parkour')

const MOVE_CONTROLS = {
  forward: 'forward',
  back: 'back',
  backward: 'back',
  left: 'left',
  right: 'right'
}

const MAX_BLOCKS = 1000
const STUCK_TICKS = 6
// Player box from MCP Entity (width 0.6, height 1.8). The extra step reaches
// a face the collision resolver is already touching.
const PLAYER_HALF = 0.3
const PLAYER_HEIGHT = 1.8
const STALL_PROBE = 0.08
// A climb makes no horizontal progress. Allow a short pause at the top to
// step off, but don't wait this long against an ordinary wall.
const CLIMB_STUCK_TICKS = 25
const MAX_COORD = 30000000

function attachCommands (bot) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> '
  })

  let generation = 0
  let queue = Promise.resolve()
  let ready = false

  function print (line) {
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
    console.log(line)
    if (ready) rl.prompt(true)
  }

  function stopMovement () {
    generation++
    if (bot.pathfinder) bot.pathfinder.setGoal(null)
    if (bot.entity) bot.clearControlStates()
    queue = Promise.resolve()
  }

  function enqueue (task) {
    const gen = generation
    queue = queue.then(async () => {
      if (gen !== generation || !bot.entity) return
      await task(gen)
    }).catch(err => {
      print(err.message || String(err))
    })
    return queue
  }

  rl.on('line', (line) => {
    const text = line.trim()
    if (!text) {
      rl.prompt()
      return
    }
    if (!ready || !bot.entity) {
      print('Still joining. Wait until the prompt says the bot is ready.')
      return
    }
    handle(text)
    rl.prompt()
  })

  let closed = false

  rl.on('close', () => {
    stopMovement()
    if (!closed && bot.entity) bot.quit()
  })

  function handle (text) {
    const parts = text.split(/\s+/)
    const name = parts[0].toLowerCase()

    if (name === 'help') {
      print(helpText())
      return
    }

    if (name === 'stop') {
      stopMovement()
      print('Stopped.')
      return
    }

    if (name === 'quit' || name === 'exit') {
      stopMovement()
      bot.quit()
      return
    }

    if (name === 'jump') {
      enqueue(() => pulseControl('jump'))
      return
    }

    if (name === 'sneak' || name === 'sprint') {
      const state = parseToggle(parts[1], bot.getControlState(name))
      if (state == null) {
        print(`Usage: ${name} on|off`)
        return
      }
      bot.setControlState(name, state)
      print(`${name} ${state ? 'on' : 'off'}`)
      return
    }

    if (name === 'say' || name === 'chat') {
      const message = text.slice(parts[0].length).trim()
      if (!message) {
        print('Usage: say <message>')
        return
      }
      bot.chat(message)
      return
    }

    if (name === 'move') {
      const direction = MOVE_CONTROLS[(parts[1] || '').toLowerCase()]
      const blocks = Number(parts[2])
      if (!direction || !Number.isFinite(blocks) || blocks <= 0 || blocks > MAX_BLOCKS) {
        print('Usage: move <forward|back|left|right> <blocks>')
        return
      }
      enqueue((gen) => move(direction, blocks, gen))
      return
    }

    if (name === 'goto') {
      const coords = parts.slice(1, 4).map(Number)
      if (coords.length !== 3 || coords.some(coord => !isCoord(coord))) {
        print('Usage: goto <x> <y> <z>')
        return
      }
      const [x, y, z] = coords.map(Math.floor)
      enqueue((gen) => goTo(x, y, z, gen))
      return
    }

    print(`Unknown command "${name}". Type help.`)
  }

  function goTo (x, y, z, gen) {
    print(`Pathfinding to ${x} ${y} ${z}...`)
    return bot.pathfinder.goto(new goals.GoalBlock(x, y, z)).then(() => {
      if (gen === generation) print(`Arrived at ${x} ${y} ${z}.`)
    }).catch(err => {
      if (gen !== generation || err.name === 'PathStopped' || err.name === 'GoalChanged') return
      if (err.name === 'NoPath') throw new Error(`No path to ${x} ${y} ${z}`)
      if (err.name === 'Timeout') throw new Error(`Took too long to find a path to ${x} ${y} ${z}`)
      throw err
    })
  }

  async function pulseControl (control) {
    bot.setControlState(control, true)
    await onceTick()
    bot.setControlState(control, false)
  }

  function move (direction, blocks, gen) {
    const { control, x: dirX, z: dirZ } = movementAxes(direction)
    const start = bot.entity.position.clone()
    bot.setControlState(control, true)
    print(`Moving ${direction} ${blocks} block${blocks === 1 ? '' : 's'}...`)

    return new Promise((resolve) => {
      let stuck = 0
      let previous = 0
      let bestY = start.y
      let forcedMoves = 0
      const onForcedMove = () => { forcedMoves++ }

      const finish = (message) => {
        bot.removeListener('physicsTick', onTick)
        bot.removeListener('forcedMove', onForcedMove)
        if (bot.entity) bot.setControlState(control, false)
        if (message) print(message)
        resolve()
      }

      const onTick = () => {
        if (gen !== generation || !bot.entity) {
          finish()
          return
        }
        const pos = bot.entity.position
        const traveled = (pos.x - start.x) * dirX + (pos.z - start.z) * dirZ
        if (traveled >= blocks) {
          finish(`Moved ${direction} ${traveled.toFixed(2)} blocks.`)
          return
        }
        // Climbing a ladder barely moves x/z, so the horizontal stall used to
        // release forward after a few ticks and the bot slid back down.
        const climbing = onClimbable()
        const rose = pos.y > bestY + 0.01
        if (rose) bestY = pos.y
        if (traveled > previous + 0.001 || rose) stuck = 0
        else stuck++
        previous = traveled
        if (stuck >= (climbing ? CLIMB_STUCK_TICKS : STUCK_TICKS)) {
          finish(`Stopped ${direction} after ${traveled.toFixed(2)} blocks. ${stallReason(dirX, dirZ, forcedMoves)}`)
        }
      }

      bot.on('forcedMove', onForcedMove)
      bot.on('physicsTick', onTick)
    })
  }

  // The block whose shape meets the player box, nudged along the move.
  function stallReason (dirX, dirZ, forcedMoves) {
    const hit = blockInFront(dirX, dirZ)
    if (hit) {
      const { block, shape } = hit
      const half = slabHalf(block.name, shape)
      return `Hit ${block.name}${half} at ${block.position.x} ${block.position.y} ${block.position.z}.`
    }
    if (forcedMoves > 0) return 'Server moved you back.'
    return 'No block in front.'
  }

  function blockInFront (dirX, dirZ) {
    const pos = bot.entity.position
    const minX = pos.x - PLAYER_HALF + Math.min(0, dirX * STALL_PROBE)
    const maxX = pos.x + PLAYER_HALF + Math.max(0, dirX * STALL_PROBE)
    const minY = pos.y
    const maxY = pos.y + PLAYER_HEIGHT
    const minZ = pos.z - PLAYER_HALF + Math.min(0, dirZ * STALL_PROBE)
    const maxZ = pos.z + PLAYER_HALF + Math.max(0, dirZ * STALL_PROBE)

    let best = null
    let bestDist = Infinity
    for (let y = Math.floor(minY); y <= Math.floor(maxY); y++) {
      for (let z = Math.floor(minZ); z <= Math.floor(maxZ); z++) {
        for (let x = Math.floor(minX); x <= Math.floor(maxX); x++) {
          let block = null
          try {
            block = bot.blockAt(new Vec3(x, y, z))
          } catch {
            block = null
          }
          const shape = block && hitShape(block, x, y, z, minX, minY, minZ, maxX, maxY, maxZ)
          if (!shape) continue
          const dist = (x + 0.5 - pos.x) * dirX + (z + 0.5 - pos.z) * dirZ
          if (dist <= 0 || dist >= bestDist) continue
          bestDist = dist
          best = { block, shape }
        }
      }
    }
    return best
  }

  function movementAxes (direction) {
    const yaw = Number(bot.entity.yawDegrees) * Math.PI / 180
    if (!Number.isFinite(yaw)) {
      throw new Error('Bot has no facing direction yet')
    }
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    const forward = { x: -sin, z: cos }
    const left = { x: cos, z: sin }
    const desired = direction === 'forward'
      ? forward
      : direction === 'back'
        ? { x: -forward.x, z: -forward.z }
        : direction === 'left'
          ? left
          : { x: -left.x, z: -left.z }

    let control = 'forward'
    let best = -Infinity
    for (const candidate of ['forward', 'back', 'left', 'right']) {
      const physics = physicsDirection(candidate, sin, cos)
      const dot = physics.x * desired.x + physics.z * desired.z
      if (dot > best) {
        best = dot
        control = candidate
      }
    }

    return { control, x: desired.x, z: desired.z }
  }

  // Same strafe/forward mix as prismarine-physics moveFlying.
  function physicsDirection (control, sin, cos) {
    const strafe = control === 'right' ? 1 : control === 'left' ? -1 : 0
    const forward = control === 'forward' ? 1 : control === 'back' ? -1 : 0
    return {
      x: strafe * cos - forward * sin,
      z: forward * cos + strafe * sin
    }
  }

  function onClimbable () {
    const pos = bot.entity.position
    for (const dy of [0, 0.5, 1]) {
      let block = null
      try {
        block = bot.blockAt(pos.offset(0, dy, 0))
      } catch {
        block = null
      }
      if (block && (block.name === 'ladder' || block.name === 'vine')) return true
    }
    return false
  }

  function onceTick () {
    return new Promise((resolve) => bot.once('physicsTick', resolve))
  }

  function markReady () {
    const movements = new ParkourMovements(bot)
    configureMovements(movements, bot)
    installMovementGuards(bot, print)
    bot.pathfinder.thinkTimeout = 10000
    bot.pathfinder.enablePathShortcut = false
    bot.pathfinder.setMovements(movements)
    attachFollower(bot, movements)

    ready = true
    print('Ready. Examples: move left 5, goto 0 64 0')
    print(helpText())
    rl.prompt()
  }

  function close () {
    if (closed) return
    closed = true
    ready = false
    stopMovement()
    rl.close()
  }

  return { print, markReady, close }
}

function slabHalf (name, shape) {
  if (!name || !name.includes('slab') || name.startsWith('double_')) return ''
  return shape[1] >= 0.5 ? ' upper' : ' bottom'
}

function hitShape (block, x, y, z, minX, minY, minZ, maxX, maxY, maxZ) {
  if (!block.shapes) return null
  for (const shape of block.shapes) {
    const sx0 = x + shape[0]
    const sy0 = y + shape[1]
    const sz0 = z + shape[2]
    const sx1 = x + shape[3]
    const sy1 = y + shape[4]
    const sz1 = z + shape[5]
    if (sx1 > minX && sx0 < maxX && sy1 > minY && sy0 < maxY && sz1 > minZ && sz0 < maxZ) return shape
  }
  return null
}

function isCoord (value) {
  return Number.isFinite(value) && Math.abs(value) <= MAX_COORD
}

function parseToggle (word, current) {
  if (!word) return !current
  const value = word.toLowerCase()
  if (value === 'on' || value === 'true') return true
  if (value === 'off' || value === 'false') return false
  return null
}

function helpText () {
  return [
    'Commands:',
    '  move <forward|back|left|right> <blocks>',
    '  goto <x> <y> <z>',
    '  jump',
    '  stop',
    '  sneak [on|off]',
    '  sprint [on|off]',
    '  say <message>',
    '  quit'
  ].join('\n')
}

module.exports = { attachCommands }
