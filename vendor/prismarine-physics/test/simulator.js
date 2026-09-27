const { Physics: PhysicsNew, PlayerState: PlayerStateNew } = require('prismarine-physics/index')
const { Physics: PhysicsOld, PlayerState: PlayerStateOld } = require('prismarine-physics/indexold')
const { JavaDouble, JavaFloat, Vec3Double } = require('../lib/javamath')
const { Vec3 } = require('vec3')
const Block = require('prismarine-block')('1.8.9')
const mcData = require('minecraft-data')('1.8.9')

const stateOld = {
  'pos': new Vec3Double(384.72436940229596, 60, -815.2536071976419),
  'motion': new Vec3Double(-0.006821141663837831, -0.0784000015258789, 0.11766149022099086),
  'onGround': true,
  'isInWater': false,
  'isInLava': false,
  'isInWeb': false,
  'isCollidedHorizontally': false,
  'isCollidedVertically': true,
  'jumpTicks': 0,
  'jumpQueued': false,
  'yaw': 3.3078090960783206,
  'pitch': 3.5215997434729602,
  'yawDegrees': new JavaFloat(3.318554162979126),
  'pitchDegrees': new JavaFloat(-201.77279663085938),
  'control': {
    'forward': true,
    'back': false,
    'left': false,
    'right': false,
    'jump': false,
    'sprint': false,
    'sneak': false
  },
  'jumpBoost': 0,
  'depthStrider': 0
}

const stateNew = {
  'pos': new Vec3(384.72436940229596, 60, -815.2536071976419),
  'motion': new Vec3(-0.006821141663837831, -0.0784000015258789, 0.11766149022099086),
  'onGround': true,
  'isInWater': false,
  'isInLava': false,
  'isInWeb': false,
  'isCollidedHorizontally': false,
  'isCollidedVertically': true,
  'jumpTicks': 0,
  'jumpQueued': false,
  'yaw': 3.3078090960783206,
  'pitch': 3.5215997434729602,
  'yawDegrees': 3.318554162979126,
  'pitchDegrees': -201.77279663085938,
  'control': {
    'forward': true,
    'back': false,
    'left': false,
    'right': false,
    'jump': false,
    'sprint': false,
    'sneak': false
  },
  'jumpBoost': 0,
  'depthStrider': 0
}

const stoneBlock = new Block(mcData.blocksByName.stone.id, 0, 0)
const airBlock = new Block(mcData.blocksByName.air.id, 0, 0)

const fakeWorld = {
  getBlock: (pos) => {
    const b = (pos.y < 60) ? stoneBlock : airBlock
    b.position = pos
    return b
  }
}
const physOld = new PhysicsOld(mcData, fakeWorld)
const physNew = new PhysicsNew(mcData, fakeWorld)

physOld.simulatePlayer(stateOld, fakeWorld)
physNew.simulatePlayer(stateNew, fakeWorld)
console.log('Old:', stateOld.pos)
console.log('New:', stateNew.pos)