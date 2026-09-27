const { Physics, PlayerState } = require('prismarine-physics')
const { Vec3 } = require('vec3')
const mcData = require('minecraft-data')('1.8.9')
const Block = require('prismarine-block')('1.8.9')
const { performance } = require('perf_hooks')

const stoneBlock = new Block(mcData.blocksByName.stone.id, 0, 0)
const airBlock = new Block(mcData.blocksByName.air.id, 0, 0)

function minimalBlock(block) {
  return {
    type: block.type,
    shapes: block.shapes,
    boundingBox: block.boundingBox,
    position: block.position
  }
}

// required block properties: type, shapes, boundingBox, position
const fakeWorld = {
  getBlock: (pos) => {
    const b = (pos.y < 60) ? minimalBlock(stoneBlock) : minimalBlock(airBlock)
    b.position = pos
    return b
  }
}

function fakePlayer (pos) {
  return {
    entity: {
      position: pos,
      velocity: new Vec3(0, 0, 0),
      onGround: false,
      isInWater: false,
      isInLava: false,
      isInWeb: false,
      isCollidedHorizontally: false,
      isCollidedVertically: false,
      elytraFlying: false,
      yaw: 0,
      pitch: 0,
      effects: {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    fireworkRocketDuration: 0,
    version: '1.8.9',
    inventory: {
      slots: []
    }
  }
}

const physics = Physics(mcData, fakeWorld)
const controls = {
  forward: true,
  back: false,
  left: false,
  right: false,
  jump: true,
  sprint: true,
  sneak: false
}

const runs = 25
let totalTime = 0
for (let i = 0; i < runs; i++) {
  const player = fakePlayer(new Vec3(0, 100_000, 0))
  const playerState = new PlayerState(player, controls)

  let ticks = 0
  const start = performance.now()
  while (!player.entity.onGround) {
    ticks++
    physics.simulatePlayer(playerState, fakeWorld).apply(player)
  }
  totalTime += (performance.now() - start)
  console.log(`Landed at Y=${player.entity.position.y} after ${ticks} ticks (${(performance.now() - start).toFixed(2)} ms)`)
}

console.log(`Average time (new): ${(totalTime / runs).toFixed(2)} ms over ${runs} runs`)