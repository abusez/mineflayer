const Vec3 = require('vec3').Vec3
const AABB = require('./lib/aabb')
const features = require('./lib/features')
const attribute = require('./lib/attribute')
const nbt = require('prismarine-nbt')
const { JavaFloat, JavaDouble, sin32, cos32, JavaInt, Vec3Double } = require('./lib/javamath')
const { f32 } = require('./lib/math')

function makeSupportFeature (mcData) {
  return feature => features.some(({
    name,
    versions
  }) => name === feature && versions.includes(mcData.version.majorVersion))
}

// https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1578C42-L1578C53
const DEG_TO_RAD = new JavaFloat(Math.PI).divide(new JavaFloat(180.0))
const RAD_TO_DEG = 180.0 / Math.PI

function Physics (mcData, world) {
  const supportFeature = makeSupportFeature(mcData)
  const blocksByName = mcData.blocksByName

  const physics = {
    yawSpeed: 60.0,
    pitchSpeed: 30.0,
    // this.motionY -= 0.08D;, EntityLivingBase.java
    gravity: new JavaDouble(0.08),
    // this.motionY *= 0.9800000190734863D;, EntityLivingBase.java. 32 bit equivalent of 0.98
    airdrag: new JavaFloat(0.98),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/player/EntityPlayer.java#L163C5-L164C40
    playerSpeed: new JavaFloat(0.1),
    airborneAcceleration: new JavaFloat(0.02),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1610
    airborneInertia: new JavaFloat(0.91),
    sprintSpeed: new JavaFloat(0.3),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/util/MovementInputFromOptions.java#L42C1-L46C10
    sneakSpeed: new JavaDouble(0.3),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1974
    negligeableVelocity: new JavaDouble(0.005),
    negligeableFlyingSpeed: new JavaFloat(1.0E-4),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L208
    stepHeight: new JavaFloat(0.6), // how much height can the bot step on without jump
    ladderMaxSpeed: new JavaFloat(0.15),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1594
    liquidMotionY: new JavaDouble(0.03999999910593033),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1559
    jumpMotionY: new JavaFloat(0.42),
    ladderClimbSpeed: new JavaDouble(0.15),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L375
    playerHalfWidth: new JavaFloat(0.6).divide(new JavaFloat(2)),
    playerHeight: new JavaFloat(1.8),
    waterInertia: new JavaFloat(0.8),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1689
    lavaInertia: new JavaDouble(0.5),
    baseLiquidAcceleration: new JavaFloat(0.02),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/block/Block.java#L291
    defaultSlipperiness: new JavaFloat(0.6),
    outOfLiquidImpulse: new JavaFloat(0.3),
    autojumpCooldown: 10, // ticks (0.5s)
    movementSpeedAttribute: mcData.attributesByName.movementSpeed.resource,
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L56
    sprintingUUID: '662a6b8d-da3e-4c1c-8813-96ea6097278d',
    // default slipperiness * friction
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1719C30-L1719C39
    magicFriction: new JavaFloat(0.546),
    // seems like a different value is used for water??
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1719C28-L1719C38
    magicFrictionWater: new JavaFloat(0.54600006),
    magicFrictionCubed: new JavaFloat(0.16277136),
    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/block/BlockSoulSand.java#L30
    soulsandSpeed: new JavaDouble(0.4),
  }

  const waterIds = [blocksByName.water.id, blocksByName.flowing_water ? blocksByName.flowing_water.id : -1]
  const lavaIds = [blocksByName.lava.id, blocksByName.flowing_lava ? blocksByName.flowing_lava.id : -1]
  const liquidIds = waterIds.concat(lavaIds)
  const blockSlipperiness = {}
  const slimeBlockId = blocksByName.slime_block ? blocksByName.slime_block.id : blocksByName.slime.id
  blockSlipperiness[slimeBlockId] = new JavaFloat(0.8)
  blockSlipperiness[blocksByName.ice.id] = new JavaFloat(0.98)
  blockSlipperiness[blocksByName.packed_ice.id] = new JavaFloat(0.98)

  const soulsandId = blocksByName.soul_sand.id
  const webId = blocksByName.cobweb ? blocksByName.cobweb.id : blocksByName.web.id
  const ladderId = blocksByName.ladder.id
  const vineId = blocksByName.vine.id

  physics.waterGravity = new JavaDouble(0.02)
  physics.lavaGravity = new JavaDouble(0.02)

  function getPlayerBB (pos) {
    const w = physics.playerHalfWidth
    return new AABB(-w, 0, -w, w, physics.playerHeight, w).offset(pos.x, pos.y, pos.z)
  }

  function resetPositionToBB (bb, pos) {
    pos.x = new JavaDouble((bb.minX + bb.maxX) / 2.0)
    pos.y = new JavaDouble(bb.minY)
    pos.z = new JavaDouble((bb.minZ + bb.maxZ) / 2.0)
  }

  const wallIds = new Set([
    'cobblestone_wall'
  ])

  const fenceIds = new Set([
    'oak_fence',
    'spruce_fence',
    'birch_fence',
    'jungle_fence',
    'acacia_fence',
    'dark_oak_fence',
    'nether_brick_fence',
  ])

  const fenceGateIds = new Set([
    'oak_fence_gate',
    'spruce_fence_gate',
    'birch_fence_gate',
    'jungle_fence_gate',
    'acacia_fence_gate',
    'dark_oak_fence_gate',
  ])

  const stairIds = new Set([
    'oak_stairs',
    'stone_stairs',
    'brick_stairs',
    'stone_brick_stairs',
    'nether_brick_stairs',
    'sandstone_stairs',
    'spruce_stairs',
    'birch_stairs',
    'jungle_stairs',
    'quartz_stairs',
    'acacia_stairs',
    'dark_oak_stairs',
    'red_sandstone_stairs',
    'purpur_stairs',
  ])

  const glassPaneIds = new Set([
    'glass_pane',
    'stained_glass_pane',
  ])

  const CARDINAL_NOMENCLATURE = [
    'north',
    'east',
    'south',
    'west'
  ]

  const CARDINAL = [
    // north -z
    new Vec3(0, 0, -1),
    // east +x
    new Vec3(1, 0, 0),
    // south +z
    new Vec3(0, 0, 1),
    // west -x
    new Vec3(-1, 0, 0)
  ]

  function updateWallBB (connectDirection, boundingBox) {
    switch (connectDirection) {
      case 0: // north
        boundingBox[0][2] = 0.0
        break
      case 1: // east
        boundingBox[0][3] = 1.0
        break
      case 2: // south
        boundingBox[0][5] = 1.0
        break
      case 3: // west
        boundingBox[0][0] = 0.0
        break
    }
  }

  function updateFenceBB (connectDirection, boundingBox) {
    switch (connectDirection) {
      case 0: // north (-z)
              // extends from center to full north edge
        boundingBox.push([0.375, 0.0, 0.0, 0.625, 1.5, 0.375])
        break
      case 1: // east (+x)
              // extends from center to full east edge
        boundingBox.push([0.625, 0.0, 0.375, 1.0, 1.5, 0.625])
        break
      case 2: // south (+z)
              // extends from center to full south edge
        boundingBox.push([0.375, 0.0, 0.625, 0.625, 1.5, 1.0])
        break
      case 3: // west (-x)
              // extends from center to full west edge
        boundingBox.push([0.0, 0.0, 0.375, 0.375, 1.5, 0.625])
        break
    }
  }

  function computeWallBB (world, origin) {
    const baseBoundingBox = [[0.25, 0.0, 0.25, 0.75, 1.5, 0.75]]

    // check north, east, south, west for neighboring walls to connect to
    for (let i = 0; i < CARDINAL.length; i++) {
      // update the wall properties and the bounding box
      const neighborBlock = world.getBlock(origin.plus(CARDINAL[i]))
      if (!neighborBlock || !wallIds.has(neighborBlock.name)) continue
      updateWallBB(i, baseBoundingBox)
    }
    return baseBoundingBox
  }

  function computeFenceBB (world, origin) {
    const baseBoundingBox = [[0.375, 0.0, 0.375, 0.625, 1.5, 0.625]]
    for (let i = 0; i < CARDINAL.length; i++) {
      // update the fence properties and the bounding box
      const neighborBlock = world.getBlock(origin.plus(CARDINAL[i]))
      if (!neighborBlock || (!fenceIds.has(neighborBlock.name) && !fenceGateIds.has(neighborBlock.name))) continue
      updateFenceBB(i, baseBoundingBox)
    }
    return baseBoundingBox
  }

  function rotateY (facing, right = true) {
    // 0=north, 1=east, 2=south, 3=west
    return right ? (facing + 1) % 4 : (facing + 3) % 4
  }

  const FACING_MAP = {
    north: 0,
    east: 1,
    south: 2,
    west: 3
  }

  function getFacing (block) {
    const facing = block._properties.facing
    return FACING_MAP[facing]
  }

  function isTopHalf (block) {
    return block._properties.half === 'top'
  }

  /**
   * Compute stair shape: straight / inner_left / inner_right / outer_left / outer_right
   */
  function computeStairShape (world, pos, facing, halfTop) {
    const forwardPos = pos.plus(CARDINAL[facing])
    const backPos = pos.minus(CARDINAL[facing])
    const forward = world.getBlock(forwardPos)
    const back = world.getBlock(backPos)

    function sameHalf (block) {
      return block && stairIds.has(block.name) && isTopHalf(block) === halfTop
    }

    // ---- OUTER CORNERS ----
    if (forward && sameHalf(forward)) {
      const nfacing = getFacing(forward)
      if (nfacing === rotateY(facing, false)) return 'outer_left'
      if (nfacing === rotateY(facing, true)) return 'outer_right'
    }

    // ---- INNER CORNERS ----
    if (back && sameHalf(back)) {
      const nfacing = getFacing(back)
      if (nfacing === rotateY(facing, false)) return 'inner_left'
      if (nfacing === rotateY(facing, true)) return 'inner_right'
    }

    return 'straight'
  }

  /**
   * Compute AABBs for a stair block
   */
  function computeStairBB (world, pos, block) {
    const facing = getFacing(block)
    const halfTop = isTopHalf(block)
    const shape = computeStairShape(world, pos, facing, halfTop)

    const baseY = halfTop ? 0.5 : 0.0
    const topY = halfTop ? 1.0 : 0.5
    const stepYMin = halfTop ? 0.0 : 0.5
    const stepYMax = halfTop ? 0.5 : 1.0

    const boxes = []

    // --- STRAIGHT / BASE STEP ---
    if (shape === 'straight') {
      boxes.push(...straightBoxes(facing, baseY, topY, stepYMin, stepYMax))
    }

    // --- OUTER CORNERS (convex) ---
    else if (shape === 'outer_left' || shape === 'outer_right') {
      boxes.push(...outerCornerBoxes(shape, facing, baseY, topY, stepYMin, stepYMax))
    }

    // --- INNER CORNERS (concave) ---
    else if (shape === 'inner_left' || shape === 'inner_right') {
      boxes.push(...innerCornerBoxes(shape, facing, baseY, topY, stepYMin, stepYMax))
    }

    return boxes
  }

  // === Base geometry tables ===
  // Straight stairs (two parts)
  function straightBoxes (facing, baseY, topY, stepYMin, stepYMax) {
    switch (facing) {
      case 0: // north
        return [
          [0, baseY, 0.5, 1, topY, 1],
          [0, stepYMin, 0, 1, stepYMax, 0.5]
        ]
      case 1: // east
        return [
          [0, baseY, 0, 1, topY, 1],
          [0.5, stepYMin, 0, 1, stepYMax, 1]
        ]
      case 2: // south
        return [
          [0, baseY, 0, 1, topY, 1],
          [0, stepYMin, 0.5, 1, stepYMax, 1]
        ]
      case 3: // west
        return [
          [0.5, baseY, 0, 1, topY, 1],
          [0, stepYMin, 0, 0.5, stepYMax, 1]
        ]
    }
  }

  // Outer corners (smaller L-shape)
  function outerCornerBoxes (shape, facing, baseY, topY, stepYMin, stepYMax) {
    const right = shape === 'outer_right'
    switch (facing) {
      case 0: // north
        return right
          ? [
            [0, baseY, 0.5, 1, topY, 1],
            [0.5, stepYMin, 0, 1, stepYMax, 0.5]
          ]
          : [
            [0, baseY, 0.5, 1, topY, 1],
            [0, stepYMin, 0, 0.5, stepYMax, 0.5]
          ]
      case 1: // east
        return right
          ? [
            [0, baseY, 0, 1, topY, 1],
            [0.5, stepYMin, 0.5, 1, stepYMax, 1]
          ]
          : [
            [0, baseY, 0, 1, topY, 1],
            [0.5, stepYMin, 0, 1, stepYMax, 0.5]
          ]
      case 2: // south
        return right
          ? [
            [0, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0.5, 0.5, stepYMax, 1]
          ]
          : [
            [0, baseY, 0, 1, topY, 1],
            [0.5, stepYMin, 0.5, 1, stepYMax, 1]
          ]
      case 3: // west
        return right
          ? [
            [0.5, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0, 0.5, stepYMax, 0.5]
          ]
          : [
            [0.5, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0.5, 0.5, stepYMax, 1]
          ]
    }
  }

  // Inner corners (concave) — base + two step strips
  function innerCornerBoxes (shape, facing, baseY, topY, stepYMin, stepYMax) {
    const left = shape === 'inner_left'
    switch (facing) {
      case 0: // north (front = z[0..0.5], left = west x[0..0.5], right = east x[0.5..1])
        return left
          ? [
            // base slab (back half)
            [0, baseY, 0.5, 1, topY, 1],
            // facing strip (north/front)
            [0, stepYMin, 0, 1, stepYMax, 0.5],
            // side strip (west/left)
            [0, stepYMin, 0, 0.5, stepYMax, 1],
          ]
          : [
            [0, baseY, 0.5, 1, topY, 1],
            [0, stepYMin, 0, 1, stepYMax, 0.5],
            // side strip (east/right)
            [0.5, stepYMin, 0, 1, stepYMax, 1],
          ]

      case 1: // east (front = x[0.5..1], left = north z[0..0.5], right = south z[0.5..1])
        return left
          ? [
            // base slab (match your straight base for east = full slab)
            [0, baseY, 0, 1, topY, 1],
            // facing strip (east/front)
            [0.5, stepYMin, 0, 1, stepYMax, 1],
            // side strip (north/left)
            [0, stepYMin, 0, 1, stepYMax, 0.5],
          ]
          : [
            [0, baseY, 0, 1, topY, 1],
            [0.5, stepYMin, 0, 1, stepYMax, 1],
            // side strip (south/right)
            [0, stepYMin, 0.5, 1, stepYMax, 1],
          ]

      case 2: // south (front = z[0.5..1], left = east x[0.5..1], right = west x[0..0.5])
        return left
          ? [
            // base slab (match your straight base for south = full slab)
            [0, baseY, 0, 1, topY, 1],
            // facing strip (south/front)
            [0, stepYMin, 0.5, 1, stepYMax, 1],
            // side strip (east/left)
            [0.5, stepYMin, 0, 1, stepYMax, 1],
          ]
          : [
            [0, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0.5, 1, stepYMax, 1],
            // side strip (west/right)
            [0, stepYMin, 0, 0.5, stepYMax, 1],
          ]

      case 3: // west (front = x[0..0.5], left = south z[0.5..1], right = north z[0..0.5])
        return left
          ? [
            // base slab (your straight base for west = x[0.5..1])
            [0.5, baseY, 0, 1, topY, 1],
            // facing strip (west/front)
            [0, stepYMin, 0, 0.5, stepYMax, 1],
            // side strip (south/left)
            [0, stepYMin, 0.5, 1, stepYMax, 1],
          ]
          : [
            [0.5, baseY, 0, 1, topY, 1],
            [0, stepYMin, 0, 0.5, stepYMax, 1],
            // side strip (north/right)
            [0, stepYMin, 0, 1, stepYMax, 0.5],
          ]
    }
  }

  const glassPaneCanConnect = new Set(['glass', 'stained_glass'])

  function computePaneBB (world, origin) {
    const baseBoxes = []

    // Helper: determines if a glass pane connects to the given neighbor
    function canConnect (block) {
      if (!block) return false
      if (glassPaneIds.has(block.name) || glassPaneCanConnect.has(block.name)) return true
      if (block.boundingBox && block.boundingBox !== 'empty') return block.boundingBox !== 'empty'
      return false
    }

    // Get neighboring blocks
    const neighbors = CARDINAL.map(dir => world.getBlock(origin.plus(dir)))
    const [north, east, south, west] = neighbors

    const canConnectNorth = canConnect(north)
    const canConnectEast = canConnect(east)
    const canConnectSouth = canConnect(south)
    const canConnectWest = canConnect(west)
    const anyConnection = canConnectNorth || canConnectEast || canConnectSouth || canConnectWest

    // Handle east/west axis
    if ((!canConnectWest || !canConnectEast) && anyConnection) {
      if (canConnectWest) {
        baseBoxes.push([0.0, 0.0, 0.4375, 0.5, 1.0, 0.5625])
      } else if (canConnectEast) {
        baseBoxes.push([0.5, 0.0, 0.4375, 1.0, 1.0, 0.5625])
      }
    } else {
      // Either both connected or neither connected — add full NS plane
      baseBoxes.push([0.0, 0.0, 0.4375, 1.0, 1.0, 0.5625])
    }

    // Handle north/south axis
    if ((!canConnectNorth || !canConnectSouth) && anyConnection) {
      if (canConnectNorth) {
        baseBoxes.push([0.4375, 0.0, 0.0, 0.5625, 1.0, 0.5])
      } else if (canConnectSouth) {
        baseBoxes.push([0.4375, 0.0, 0.5, 0.5625, 1.0, 1.0])
      }
    } else {
      // Either both connected or neither connected — add full EW plane
      baseBoxes.push([0.4375, 0.0, 0.0, 0.5625, 1.0, 1.0])
    }

    return baseBoxes
  }

  function getSurroundingBBs (world, queryBB) {
    const surroundingBBs = []
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(queryBB.minY) - 1; cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block) {
            const blockPos = block.position
            let shapes = block.shapes
            if (wallIds.has(block.name)) {
              shapes = computeWallBB(world, blockPos)
            } else if (stairIds.has(block.name)) {
              shapes = computeStairBB(world, blockPos, block)
            } else if (fenceIds.has(block.name)) {
              shapes = computeFenceBB(world, blockPos)
            } else if (glassPaneIds.has(block.name)) {
              shapes = computePaneBB(world, blockPos)
            } else if (block.name === 'snow_layer' && block._properties.layers === 8) {
              const blockAbove = world.getBlock(blockPos.offset(0, 1, 0))
              if (blockAbove && blockAbove.name === 'snow_layer') {
                shapes = [[0, 0, 0, 1, 1, 1]]
              }
            }
            for (const shape of shapes) {
              const blockBB = new AABB(shape[0], shape[1], shape[2], shape[3], shape[4], shape[5])
              blockBB.offset(blockPos.x, blockPos.y, blockPos.z)
              surroundingBBs.push(blockBB)
            }
          }
        }
      }
    }
    return surroundingBBs
  }

  // run one tick of player simulation
  // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1948
  physics.simulatePlayer = (playerState, world) => {
    const { motion, pos } = playerState
    if (playerState.jumpTicks > 0) playerState.jumpTicks--
    if (!isNaN(playerState.yaw)) {
      playerState.yawDegrees = new JavaFloat((Math.PI - playerState.yaw) * RAD_TO_DEG)
    }
    if (!isNaN(playerState.pitch)) {
      playerState.pitchDegrees = new JavaFloat(-playerState.pitch * RAD_TO_DEG)
    }

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L1111
    const waterBB = getPlayerBB(pos).contract(
      new JavaDouble(0.001),
      new JavaDouble(new JavaFloat(0.400)),
      new JavaDouble(0.001)
    )

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L1216
    const lavaBB = getPlayerBB(pos).contract(
      new JavaDouble(new JavaFloat(0.1)),
      new JavaDouble(new JavaFloat(0.4)),
      new JavaDouble(new JavaFloat(0.1))
    )

    playerState.isInWater = isInWaterApplyCurrent(world, waterBB, motion)
    playerState.isInLava = isMaterialInBB(world, lavaBB, lavaIds)

    // Reset velocity component if it falls under the threshold
    if (motion.x.abs() < physics.negligeableVelocity) motion.x = new JavaDouble(0.0)
    if (motion.y.abs() < physics.negligeableVelocity) motion.y = new JavaDouble(0.0)
    if (motion.z.abs() < physics.negligeableVelocity) motion.z = new JavaDouble(0.0)

    // Handle inputs
    if (playerState.control.jump || playerState.jumpQueued) {
      // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1589
      if (playerState.isInWater || playerState.isInLava) {
        motion.y = motion.y.add(physics.liquidMotionY)
      } else if (playerState.onGround && playerState.jumpTicks === 0) {
        motion.y = new JavaDouble(physics.jumpMotionY)
        if (playerState.jumpBoost > 0) {
          motion.y = motion.y.add(new JavaDouble(new JavaFloat(playerState.jumpBoost).multiply(new JavaFloat(0.1))))
        }
        let forward = (playerState.control.forward - playerState.control.back)
        const isSprintingApplicable = forward > 0 && !playerState.control.sneak && !playerState.isInWater && !playerState.isInLava
        if (playerState.control.sprint && isSprintingApplicable) {
          // notchian yaw is inverted
          const notchianYaw = playerState.yawDegrees.multiply(DEG_TO_RAD)
          motion.x = motion.x.subtract(new JavaDouble(sin32(notchianYaw).multiply(new JavaFloat(0.2))))
          motion.z = motion.z.add(new JavaDouble(cos32(notchianYaw).multiply(new JavaFloat(0.2))))
        }
        playerState.jumpTicks = physics.autojumpCooldown
      }
    } else {
      playerState.jumpTicks = 0 // reset autojump cooldown
    }
    playerState.jumpQueued = false

    // movestrafing and moveforward are in range [-1.0, 1.0], already stored as F32
    let moveStrafing = new JavaFloat(
      playerState.control.right - playerState.control.left)
    let moveForward = new JavaFloat(
      playerState.control.forward - playerState.control.back)

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/util/MovementInputFromOptions.java#L42C1-L46C10
    if (playerState.control.sneak) {
      moveStrafing = new JavaFloat(new JavaDouble(moveStrafing).multiply(physics.sneakSpeed))
      moveForward = new JavaFloat(new JavaDouble(moveForward).multiply(physics.sneakSpeed))
    }

    moveStrafing = moveStrafing.multiply(new JavaFloat(0.98))
    moveForward = moveForward.multiply(new JavaFloat(0.98))

    moveEntityWithHeading(playerState, world, moveStrafing, moveForward)

    return playerState
  }

  function moveEntity (playerState, world, dx, dy, dz) {
    const { motion, pos } = playerState

    // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L612
    if (playerState.isInWeb) {
      playerState.isInWeb = false
      dx = dx.multiply(new JavaDouble(0.25))
      dy = dy.multiply(new JavaDouble(new JavaFloat(0.05)))
      dz = dz.multiply(new JavaDouble(0.25))
      motion.x = new JavaDouble(0)
      motion.y = new JavaDouble(0)
      motion.z = new JavaDouble(0)
    }

    // cloning shouldn't matter, since all operations are non-mutable anyways
    let oldVelX = dx
    let oldVelY = dy
    let oldVelZ = dz

    const validSneak = playerState.control.sneak && playerState.onGround

    if (validSneak) {
      const step = new JavaDouble(0.05)

      for (; dx.valueOf() !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, -1.0, 0)).length === 0; oldVelX = dx) {
        if (dx < step && dx >= -step) dx = new JavaDouble(0)
        else if (dx > 0) dx = dx.subtract(step)
        else dx = dx.add(step)
      }

      for (; dz.valueOf() !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(0, -1.0, dz)).length === 0; oldVelZ = dz) {
        if (dz < step && dz >= -step) dz = new JavaDouble(0)
        else if (dz > 0) dz = dz.subtract(step)
        else dz = dz.add(step)
      }

      for (; dx.valueOf() !== 0 && dz.valueOf() !== 0 && getSurroundingBBs(world, getPlayerBB(pos).offset(dx, -1.0, dz)).length === 0; oldVelZ = dz) {
        if (dx < step && dx >= -step) dx = new JavaDouble(0)
        else if (dx > 0) dx = dx.subtract(step)
        else dx = dx.add(step)

        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L679
        oldVelX = dx

        if (dz < step && dz >= -step) dz = new JavaDouble(0)
        else if (dz > 0) dz = dz.subtract(step)
        else dz = dz.add(step)
      }
    }

    let playerBB = getPlayerBB(pos)
    const queryBB = playerBB.clone().extend(dx, dy, dz)
    const surroundingBBs = getSurroundingBBs(world, queryBB)
    const oldBB = playerBB.clone()

    for (const blockBB of surroundingBBs) {
      dy = new JavaDouble(blockBB.computeOffsetY(playerBB, dy))
    }

    playerBB.offset(0, dy, 0)

    for (const blockBB of surroundingBBs) {
      dx = new JavaDouble(blockBB.computeOffsetX(playerBB, dx))
    }
    playerBB.offset(dx, 0, 0)

    for (const blockBB of surroundingBBs) {
      dz = new JavaDouble(blockBB.computeOffsetZ(playerBB, dz))
    }

    playerBB.offset(0, 0, dz)

    const onGroundFlag = (playerState.onGround || (oldVelY.valueOf() !== dy.valueOf() && oldVelY < 0))

    // Step on block if height < stepHeight
    if (physics.stepHeight > 0 && onGroundFlag && (oldVelX.valueOf() !== dx.valueOf() || oldVelZ.valueOf() !== dz.valueOf())) {
      const oldVelXCol = dx
      const oldVelYCol = dy
      const oldVelZCol = dz
      const AABB3 = playerBB.clone()
      dy = new JavaDouble(physics.stepHeight)

      const surroundingBBs = getSurroundingBBs(world, oldBB.clone().extend(oldVelX, dy, oldVelZ))
      const AABB4 = oldBB.clone()
      const AABB5 = AABB4.clone().extend(oldVelX, 0, oldVelZ)

      let dy1 = dy
      for (const blockBB of surroundingBBs) {
        dy1 = new JavaDouble(blockBB.computeOffsetY(AABB5, dy1))
      }
      AABB4.offset(0, dy1, 0)

      let dx1 = oldVelX
      for (const blockBB of surroundingBBs) {
        dx1 = new JavaDouble(blockBB.computeOffsetX(AABB4, dx1))
      }
      AABB4.offset(dx1, 0, 0)

      let dz1 = oldVelZ
      for (const blockBB of surroundingBBs) {
        dz1 = new JavaDouble(blockBB.computeOffsetZ(AABB4, dz1))
      }
      AABB4.offset(0, 0, dz1)

      const AABB14 = oldBB.clone()

      let dy2 = dy
      for (const blockBB of surroundingBBs) {
        dy2 = new JavaDouble(blockBB.computeOffsetY(AABB14, dy2))
      }
      AABB14.offset(0, dy2, 0)

      let dx2 = oldVelX
      for (const blockBB of surroundingBBs) {
        dx2 = new JavaDouble(blockBB.computeOffsetX(AABB14, dx2))
      }
      AABB14.offset(dx2, 0, 0)

      let dz2 = oldVelZ
      for (const blockBB of surroundingBBs) {
        dz2 = new JavaDouble(blockBB.computeOffsetZ(AABB14, dz2))
      }
      AABB14.offset(0, 0, dz2)

      const norm1 = dx1.multiply(dx1).add(dz1.multiply(dz1))
      const norm2 = dx2.multiply(dx2).add(dz2.multiply(dz2))

      if (norm1.valueOf() > norm2.valueOf()) {
        dx = dx1
        dz = dz1
        dy = -dy1
        playerBB = AABB4
      } else {
        dx = dx2
        dz = dz2
        dy = -dy2
        playerBB = AABB14
      }
      for (const blockBB of surroundingBBs) {
        dy = new JavaDouble(blockBB.computeOffsetY(playerBB, dy))
      }
      playerBB.offset(0, dy, 0)

      if (oldVelXCol.multiply(oldVelXCol).add(oldVelZCol.multiply(oldVelZCol)) >= dx.multiply(dx).add(dz.multiply(dz))) {
        dx = oldVelXCol
        dy = oldVelYCol
        dz = oldVelZCol
        playerBB = AABB3
      }
    }

    // Update position (finally!)
    resetPositionToBB(playerBB, pos)

    playerState.isCollidedHorizontally = dx.valueOf() !== oldVelX.valueOf() || dz.valueOf() !== oldVelZ.valueOf()
    playerState.isCollidedVertically = dy.valueOf() !== oldVelY.valueOf()
    playerState.onGround = playerState.isCollidedVertically && oldVelY < 0

    let blockPos = pos.offset(0, -0.2, 0).floored()
    let blockAtFeet = world.getBlock(blockPos)

    if (blockAtFeet?.type === 0) {
      const downBlock = world.getBlock(blockPos.offset(0, -1, 0))

      // warn: string comp might be unreliable and cause performance issues!
      if (downBlock.name.endsWith('wall') || downBlock.name.startsWith('fence')) {
        blockAtFeet = downBlock
      }
    }

    if (dx.valueOf() !== oldVelX.valueOf()) {
      motion.x = new JavaDouble(0)
    }
    if (dz.valueOf() !== oldVelZ.valueOf()) {
      motion.z = new JavaDouble(0)
    }
    if (dy.valueOf() !== oldVelY.valueOf()) {
      if (blockAtFeet && blockAtFeet.type === slimeBlockId && !playerState.control.sneak) {
        motion.y = new JavaDouble(-motion.y)
      } else {
        motion.y = new JavaDouble(0)
      }
    }

    // Finally, apply block collisions (web, soulsand...)
    doBlockCollisions(playerState)
  }

  function doBlockCollisions (playerState) {
    const { motion, pos } = playerState
    const playerBB = getPlayerBB(pos)
    playerBB.contract(0.001, 0.001, 0.001)
    const cursor = new Vec3(0, 0, 0)
    for (cursor.x = Math.floor(playerBB.minX); cursor.x <= Math.floor(playerBB.maxX); cursor.x++) {
      for (cursor.y = Math.floor(playerBB.minY); cursor.y <= Math.floor(playerBB.maxY); cursor.y++) {
        for (cursor.z = Math.floor(playerBB.minZ); cursor.z <= Math.floor(playerBB.maxZ); cursor.z++) {
          const block = world.getBlock(cursor)
          if (block) {
            if (block.type === soulsandId) {
              motion.x = motion.x.multiply(physics.soulsandSpeed)
              motion.z = motion.z.multiply(physics.soulsandSpeed)
            } else if (block.type === webId) {
              playerState.isInWeb = true
            }
          }
        }
      }
    }
  }

  // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/Entity.java#L1224
  function moveFlying (playerState, moveStrafe, moveForward, friction) {
    const { motion } = playerState

    const speedSquared = moveStrafe.multiply(moveStrafe).add(moveForward.multiply(moveForward))

    if (speedSquared >= physics.negligeableFlyingSpeed) {
      let speed = new JavaFloat(Math.sqrt(speedSquared))
      if (speed < new JavaFloat(1.0)) {
        speed = new JavaFloat(1.0)
      }
      speed = friction.divide(speed)
      moveStrafe = moveStrafe.multiply(speed)
      moveForward = moveForward.multiply(speed)

      const sin = sin32(playerState.yawDegrees.multiply(DEG_TO_RAD))
      const cos = cos32(playerState.yawDegrees.multiply(DEG_TO_RAD))
      motion.x = motion.x.add(new JavaDouble(moveStrafe.multiply(cos).subtract(moveForward.multiply(sin))))
      motion.z = motion.z.add(new JavaDouble(moveForward.multiply(cos).add(moveStrafe.multiply(sin))))
    }
  }

  function isOnLadder (world, pos) {
    const block = world.getBlock(pos)
    if (!block) {
      return false
    }
    return block.type === ladderId || block.type === vineId

  }

  function isOffsetPositionInLiquid (world, pos) {
    const pBB = getPlayerBB(pos)
    return !getSurroundingBBs(world, pBB).some(x => pBB.intersects(x))
      // any materialliquid, which is lava and water
      && !isMaterialInBB(world, pBB, liquidIds)
  }

  function moveEntityWithHeading (playerState, world, strafe, forward) {
    const { motion, pos } = playerState

    let playerSpeedAttribute
    if (playerState.attributes && playerState.attributes[physics.movementSpeedAttribute]) {
      // Use server-side player attributes
      playerSpeedAttribute = playerState.attributes[physics.movementSpeedAttribute]
    } else {
      // Create an attribute if the player does not have it
      playerSpeedAttribute = attribute.createAttributeValue(physics.playerSpeed)
    }
    // Client-side sprinting (don't rely on server-side sprinting)
    // setSprinting in LivingEntity.java
    playerSpeedAttribute = attribute.deleteAttributeModifier(playerSpeedAttribute, physics.sprintingUUID) // always delete sprinting (if it exists)

    const isSprintingApplicable = forward > 0 && !playerState.control.sneak && !playerState.isInWater && !playerState.isInLava
    if (playerState.control.sprint && isSprintingApplicable && !attribute.checkAttributeModifier(playerSpeedAttribute, physics.sprintingUUID)) {
      playerSpeedAttribute = attribute.addAttributeModifier(playerSpeedAttribute, {
        uuid: physics.sprintingUUID,
        amount: physics.sprintSpeed,
        operation: 2
      })
    }

    const attributeSpeed = new JavaFloat(attribute.getAttributeValue(playerSpeedAttribute))

    if (playerState.isInWater) {
      // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1701
      const lastY = pos.y
      let inertia = physics.waterInertia
      let acceleration = physics.baseLiquidAcceleration
      let strider = new JavaFloat(Math.min(playerState.depthStrider, 3))

      if (!playerState.onGround) {
        strider = strider.multiply(new JavaFloat(0.5))
      }

      if (strider.valueOf() > 0) {
        inertia = inertia.add(
          (new JavaFloat(0.54600006)
            .subtract(inertia))
            .multiply(strider)
            .divide(new JavaFloat(3.0))
        )
        acceleration = acceleration.add(
          (attributeSpeed.subtract(acceleration))
            .multiply(strider)
            .divide(3.0)
        )
      }

      moveFlying(playerState, strafe, forward, acceleration)
      moveEntity(playerState, world, motion.x, motion.y, motion.z)

      motion.x = motion.x.multiply(new JavaDouble(inertia))
      motion.y = motion.y.multiply(new JavaDouble(physics.waterInertia))
      motion.z = motion.z.multiply(new JavaDouble(inertia))
      motion.y = motion.y.subtract(physics.waterGravity)
      if (playerState.isCollidedHorizontally && isOffsetPositionInLiquid(world, pos.offset(motion.x, motion.y.add(new JavaDouble(0.6)).subtract(pos.y).add(lastY), motion.z))) {
        motion.y = new JavaDouble(physics.outOfLiquidImpulse) // jump out of liquid
      }
    } else if (playerState.isInLava) {
      const lastY = pos.y
      moveFlying(playerState, strafe, forward, physics.baseLiquidAcceleration)
      moveEntity(playerState, world, motion.x, motion.y, motion.z)
      motion.x = motion.x.multiply(physics.lavaInertia)
      motion.y = motion.y.multiply(physics.lavaInertia)
      motion.z = motion.z.multiply(physics.lavaInertia)
      motion.y = motion.y.subtract(physics.lavaGravity)
      if (playerState.isCollidedHorizontally && isOffsetPositionInLiquid(world, pos.offset(motion.x, motion.y.add(new JavaDouble(0.6)).subtract(pos.y).add(lastY), motion.z))) {
        motion.y = new JavaDouble(physics.outOfLiquidImpulse)
      }
    } else {
      // Normal movement
      let inertia = physics.airborneInertia
      if (playerState.onGround) {
        const blockUnder = world.getBlock(pos.floored().offset(0, -1, 0))
        const slipperiness = blockUnder?.type && typeof blockSlipperiness[blockUnder.type] === 'number' ?
          blockSlipperiness[blockUnder.type] : physics.defaultSlipperiness
        inertia = new JavaFloat(slipperiness).multiply(new JavaFloat(0.91))

      }

      const accelerationScale = physics.magicFrictionCubed.divide(inertia.multiply(inertia).multiply(inertia))
      // todo: change attributespeed to be javafloat
      let acceleration
      if (playerState.onGround) {
        acceleration = attributeSpeed.multiply(accelerationScale)
      } else {
        // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/player/EntityPlayer.java#L631
        let jumpMovementFactor = physics.airborneAcceleration
        const isSprintingApplicable = forward > 0 && !playerState.control.sneak && !playerState.isInWater && !playerState.isInLava
        if (playerState.control.sprint && isSprintingApplicable) {
          jumpMovementFactor = new JavaFloat(
            new JavaDouble(jumpMovementFactor).add(
              new JavaDouble(physics.airborneAcceleration).multiply(new JavaDouble(0.3))
            )
          )
        }
        acceleration = jumpMovementFactor
      }

      moveFlying(playerState, strafe, forward, acceleration)

      if (isOnLadder(world, pos)) {
        motion.x = motion.x.clamp(new JavaDouble(-physics.ladderMaxSpeed), new JavaDouble(physics.ladderMaxSpeed))
        motion.z = motion.z.clamp(new JavaDouble(-physics.ladderMaxSpeed), new JavaDouble(physics.ladderMaxSpeed))
        if (motion.y < -physics.ladderClimbSpeed) {
          // clone it
          motion.y = new JavaDouble(-physics.ladderClimbSpeed)
        }
        if (playerState.control.sneak && motion.y < new JavaDouble(0)) {
          motion.y = new JavaDouble(0)
        }
      }

      moveEntity(playerState, world, motion.x, motion.y, motion.z)

      if (isOnLadder(world, new Vec3(pos.x, pos.y, pos.z)) && (playerState.isCollidedHorizontally ||
        (supportFeature('climbUsingJump') && playerState.control.jump))) {
        motion.y = physics.ladderClimbSpeed // climb ladder
      }

      // unloaded chunks 1.8 behavior
      // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/entity/EntityLivingBase.java#L1664
      if (!world.getBlock(new Vec3(pos.x, 0, pos.z).floored())) {
        if (pos.y > 0) {
          motion.y = new JavaDouble(-0.1)
        } else {
          motion.y = new JavaDouble(0)
        }
      } else {
        motion.y = motion.y.subtract(physics.gravity)
      }

      motion.y = motion.y.multiply(new JavaDouble(physics.airdrag))
      motion.x = motion.x.multiply(new JavaDouble(inertia))
      motion.z = motion.z.multiply(new JavaDouble(inertia))
    }
  }

  function isMaterialInBB (world, queryBB, types) {
    const cursor = new Vec3(0, 0, 0)
    for (cursor.y = Math.floor(queryBB.minY); cursor.y <= Math.floor(queryBB.maxY); cursor.y++) {
      for (cursor.z = Math.floor(queryBB.minZ); cursor.z <= Math.floor(queryBB.maxZ); cursor.z++) {
        for (cursor.x = Math.floor(queryBB.minX); cursor.x <= Math.floor(queryBB.maxX); cursor.x++) {
          const block = world.getBlock(cursor)
          if (block && types.includes(block.type)) return true
        }
      }
    }
    return false
  }

  function getLiquidHeightPcent (block) {
    return (getRenderedDepth(block) + 1) / 9
  }

  function getRenderedDepth (block) {
    if (!block) return -1
    if (block.isWaterlogged) return 0
    if (!waterIds.includes(block.type)) return -1
    const meta = block.metadata
    return meta >= 8 ? 0 : meta
  }

  function getFlow (world, block) {
    const pos = block.position
    const curLevel = getRenderedDepth(block)
    const flow = new Vec3Double(0.0, 0.0, 0.0)

    const directions = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]

    for (const [dx, dz] of directions) {
      const adjPos = pos.offset(dx, 0, dz)
      const adjBlock = world.getBlock(adjPos)
      let adjLevel = getRenderedDepth(adjBlock)

      if (adjLevel < 0) {
        // block is "solid" if it blocks movement (non-empty bbox)
        const adjBlockStateSolid = adjBlock && adjBlock.boundingBox !== 'empty'
        if (!adjBlockStateSolid) {
          const belowBlock = world.getBlock(adjPos.offset(0, -1, 0))
          adjLevel = getRenderedDepth(belowBlock)
          if (adjLevel >= 0) {
            const k = new JavaDouble(adjLevel - (curLevel - 8))
            flow.x = flow.x.add(new JavaDouble(dx).multiply(k))
            flow.z = flow.z.add(new JavaDouble(dz).multiply(k))
          }
        }
      } else {
        const l = new JavaDouble(adjLevel - curLevel)
        flow.x = flow.x.add(new JavaDouble(dx).multiply(l))
        flow.z = flow.z.add(new JavaDouble(dz).multiply(l))
      }
    }

    // Falling water handling
    if (block.metadata >= 8) {
      for (const [dx, dz] of directions) {
        const side = pos.offset(dx, 0, dz)
        const sideUp = pos.offset(dx, 1, dz)
        const sideBlock = world.getBlock(side)
        const sideUpBlock = world.getBlock(sideUp)
        const solidSide = (sideBlock && sideBlock.boundingBox !== 'empty')
        const solidUp = (sideUpBlock && sideUpBlock.boundingBox !== 'empty')
        if (solidSide || solidUp) {
          flow.normalize()
          flow.y = flow.y.add(new JavaDouble(-6.0))
          break // only apply once!
        }
      }
    }

    return flow.normalize()
  }

  // https://github.com/Marcelektro/MCP-919/blob/1717f75902c6184a1ed1bfcd7880404aab4da503/src/minecraft/net/minecraft/world/World.java#L2077
  function isInWaterApplyCurrent (world, bb, motion) {
    const minX = Math.floor(bb.minX)
    const maxX = Math.floor(bb.maxX + 1)
    const minY = Math.floor(bb.minY)
    const maxY = Math.floor(bb.maxY + 1)
    const minZ = Math.floor(bb.minZ)
    const maxZ = Math.floor(bb.maxZ + 1)

    // Always assume area loaded
    let flag = false
    let vec3 = new Vec3Double(0.0, 0.0, 0.0)
    const cursor = new Vec3(0, 0, 0)

    for (cursor.x = minX; cursor.x < maxX; cursor.x++) {
      for (cursor.y = minY; cursor.y < maxY; cursor.y++) {
        for (cursor.z = minZ; cursor.z < maxZ; cursor.z++) {
          const block = world.getBlock(cursor)
          if (!block) continue
          if (waterIds.includes(block.type)) {
            const liquidHeight = new JavaDouble(cursor.y + 1)
              .subtract(new JavaDouble(getLiquidHeightPcent(block)))

            if (new JavaDouble(bb.maxY) >= liquidHeight) {
              flag = true
              // equivalent to Block.modifyAcceleration(world, pos, entity, vec3)
              const flow = getFlow(world, block)
              vec3 = new Vec3Double(
                vec3.x.add(flow.x),
                vec3.y.add(flow.y),
                vec3.z.add(flow.z)
              )
            }
          }
        }
      }
    }

    // todo: technically, should check if entity.isPushedByWater (!this.capabilities.isFlying), but since flying is not implemented, ignore that part
    if (vec3.norm() > new JavaDouble(0.0)) {
      const normalized = vec3.normalize()
      const d1 = new JavaDouble(0.014)
      motion.x = motion.x.add(normalized.x.multiply(d1))
      motion.y = motion.y.add(normalized.y.multiply(d1))
      motion.z = motion.z.add(normalized.z.multiply(d1))
    }

    return flag
  }

  return physics
}

function getEffectLevel (mcData, effectName, effects) {
  const effectDescriptor = mcData.effectsByName[effectName]
  if (!effectDescriptor) {
    return 0
  }
  const effectInfo = effects[effectDescriptor.id]
  if (!effectInfo) {
    return 0
  }
  return effectInfo.amplifier + 1
}

function getEnchantmentLevel (mcData, enchantmentName, enchantments) {
  const enchantmentDescriptor = mcData.enchantmentsByName[enchantmentName]
  if (!enchantmentDescriptor) {
    return 0
  }

  for (const enchInfo of enchantments) {
    if (typeof enchInfo.id === 'string') {
      if (enchInfo.id.includes(enchantmentName)) {
        return enchInfo.lvl
      }
    } else if (enchInfo.id === enchantmentDescriptor.id) {
      return enchInfo.lvl
    }
  }
  return 0
}

class PlayerState {
  constructor (bot, control) {
    const mcData = require('minecraft-data')(bot.version)

    this.pos = new Vec3Double(bot.entity.position.x, bot.entity.position.y, bot.entity.position.z)
    this.motion = new Vec3Double(bot.entity.velocity.x, bot.entity.velocity.y, bot.entity.velocity.z)

    this.onGround = bot.entity.onGround
    this.isInWater = bot.entity.isInWater
    this.isInLava = bot.entity.isInLava
    this.isInWeb = bot.entity.isInWeb
    this.isCollidedHorizontally = bot.entity.isCollidedHorizontally
    this.isCollidedVertically = bot.entity.isCollidedVertically
    this.jumpTicks = bot.jumpTicks
    this.jumpQueued = bot.jumpQueued
    this.fireworkRocketDuration = bot.fireworkRocketDuration

    // Input only (not modified)
    this.attributes = bot.entity.attributes
    // both rotational values in degrees (notchian format). they should be float32 to replicate what the server should receive
    this.yawDegrees = typeof bot.entity.yawDegrees?.valueOf() === 'number' ? new JavaFloat(bot.entity.yawDegrees) : new JavaFloat((Math.PI - bot.entity.yaw) * RAD_TO_DEG)
    this.pitchDegrees = typeof bot.entity.pitchDegrees?.valueOf() === 'number' ? new JavaFloat(bot.entity.pitchDegrees) : new JavaFloat(-bot.entity.pitch * RAD_TO_DEG)
    this.control = control

    // effects
    const effects = bot.entity.effects
    this.jumpBoost = new JavaInt(getEffectLevel(mcData, 'JumpBoost', effects))
    // armour enchantments
    const boots = bot.inventory.slots[8]
    if (boots && boots.nbt) {
      const simplifiedNbt = nbt.simplify(boots.nbt)
      const enchantments = simplifiedNbt.Enchantments ?? simplifiedNbt.ench ?? []
      const enchantmentsMap = boots?.componentMap?.get('enchantments')
      const strider = enchantmentsMap?.data?.enchantments?.find(({ id, level }) => id === 7)
      this.depthStrider = strider ? strider.level : getEnchantmentLevel(mcData, 'depth_strider', enchantments)
    } else {
      this.depthStrider = 0
    }
  }

  apply (bot) {
    bot.entity.position = new Vec3(
      this.pos.x.valueOf(),
      this.pos.y.valueOf(),
      this.pos.z.valueOf()
    )
    bot.entity.velocity = new Vec3(
      this.motion.x.valueOf(),
      this.motion.y.valueOf(),
      this.motion.z.valueOf()
    )
    bot.entity.onGround = this.onGround
    bot.entity.isInWater = this.isInWater
    bot.entity.isInLava = this.isInLava
    bot.entity.isInWeb = this.isInWeb
    bot.entity.isCollidedHorizontally = this.isCollidedHorizontally
    bot.entity.isCollidedVertically = this.isCollidedVertically
    bot.jumpTicks = this.jumpTicks
    bot.jumpQueued = this.jumpQueued
    bot.fireworkRocketDuration = this.fireworkRocketDuration
  }
}

module.exports = { Physics, PlayerState }