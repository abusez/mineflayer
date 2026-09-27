const { Physics: PhysicsNew, PlayerState: PlayerStateNew } = require('prismarine-physics/index')
const { Physics: PhysicsOld, PlayerState: PlayerStateOld } = require('prismarine-physics/indexold')
const { Vec3 } = require('vec3')
const { f32, f32add } = require('../lib/math')
const { JavaFloat } = require('../lib/javamath')
const mcData = require('minecraft-data')('1.8.9')
const Block = require('prismarine-block')('1.8.9')

const stoneBlock = new Block(mcData.blocksByName.obsidian.id, 0, 0)
const airBlock = new Block(mcData.blocksByName.air.id, 0, 0)

const fakeWorld = {
  getBlock: (pos) => {
    const b = (pos.y < 60) ? stoneBlock : airBlock
    b.position = pos
    return b
  }
}

function getPlayerState (pos) {
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
      yawDegrees: 0,
      pitchDegrees: 0,
      effects: {}
    },
    jumpTicks: 0,
    jumpQueued: false,
    version: '1.8.9',
    inventory: {
      slots: []
    }
  }
}

const physOld = PhysicsOld(mcData, fakeWorld)
const physNew = PhysicsNew(mcData, fakeWorld)

const controls = {
  forward: true,
  back: false,
  left: false,
  right: false,
  jump: true,
  sprint: true,
  sneak: false
}

const controlChoices = Object.keys(controls)

const ticks = 500_000

const playerStateOld = new PlayerStateOld(getPlayerState(new Vec3(0, 65, 0)), controls)
const playerStateNew = new PlayerStateNew(getPlayerState(new Vec3(0, 65, 0)), controls)

for (let i = 0; i < ticks; i++) {
  if (Math.random() > 0.01) {
    const randomControlChange = controlChoices[Math.floor(Math.random() * controlChoices.length)]
    playerStateOld.control[randomControlChange] = !playerStateOld.control[randomControlChange]
    playerStateNew.control[randomControlChange] = !playerStateNew.control[randomControlChange]
  }
  if (Math.random() > 0.95) {
    const randomDYaw = (Math.random() * 0.4 - 0.2) * 360 / 2
    playerStateOld.yawDegrees = playerStateOld.yawDegrees.add(new JavaFloat(randomDYaw))
    playerStateNew.yawDegrees = f32add(playerStateNew.yawDegrees, f32(randomDYaw))
  }
  if (Math.random() > 0.95) {
    const randomDPitch = (Math.random() * 0.4 - 0.2) * 360 / 2
    playerStateOld.pitchDegrees = playerStateOld.pitchDegrees.add(new JavaFloat(randomDPitch))
    playerStateNew.pitchDegrees = f32add(playerStateNew.pitchDegrees, f32(randomDPitch))
  }
  // console.log(playerStateOld.yawDegrees.valueOf(), playerStateNew.yawDegrees.valueOf())
  let previousState = JSON.stringify(playerStateNew)
  physOld.simulatePlayer(playerStateOld, fakeWorld)
  physNew.simulatePlayer(playerStateNew, fakeWorld)
  const posOld = playerStateOld.pos
  const posNew = playerStateNew.pos

  const failed = posOld.x.valueOf() !== posNew.x.valueOf() ||
                 posOld.y.valueOf() !== posNew.y.valueOf() ||
                 posOld.z.valueOf() !== posNew.z.valueOf()

  if (failed) {
    console.error(`Position mismatch at tick ${i + 1}`)
    console.error(`Old Position: X=${posOld.x.valueOf()} Y=${posOld.y.valueOf()} Z=${posOld.z.valueOf()}`)
    console.error(`New Position: X=${posNew.x.valueOf()} Y=${posNew.y.valueOf()} Z=${posNew.z.valueOf()}`)
    const offset = new Vec3(posNew.x.valueOf() - posOld.x.valueOf(), posNew.y.valueOf() - posOld.y.valueOf(), posNew.z.valueOf() - posOld.z.valueOf())
    console.log(`Offset: X=${offset.x} Y=${offset.y} Z=${offset.z} (magnitude=${offset.norm().toFixed(15)})`)
    console.log(`Old State`, playerStateOld)
    console.log(`New State`, playerStateNew)
    console.log(`Previous State`, previousState)
    process.exit(1)
  }
}

console.log(`Positions matched for ${ticks} ticks`)
console.log(`Final Position: X=${playerStateNew.pos.x.valueOf()} Y=${playerStateNew.pos.y.valueOf()} Z=${playerStateNew.pos.z.valueOf()}`)