'use strict'

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const dns = require('dns')
const net = require('net')
const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const { sessionFromAccessToken, sessionFromRefreshToken } = require('./auth')
const { attachCommands } = require('./commands')

loadDotEnv(path.join(__dirname, '.env'))

const host = arg('--host') || process.env.HOST
const port = Number(arg('--port') || process.env.PORT || 25565)
const version = arg('--version') || process.env.VERSION || '1.8.9'
const refreshToken = arg('--refresh-token') || process.env.REFRESH_TOKEN || ''
const accessToken = arg('--access-token') || process.env.ACCESS_TOKEN || ''

const COMMANDS = ['/ac grim', '/warp scaffold']
const COMMAND_DELAY_MS = 1500

async function main () {
  if (!host) {
    throw new Error('Set HOST (or --host) to the Minecraft server address')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a number from 1 to 65535')
  }
  if (refreshToken && accessToken) {
    throw new Error('Provide either a refresh token or an access token, not both')
  }
  if (!refreshToken && !accessToken) {
    throw new Error('Set REFRESH_TOKEN or ACCESS_TOKEN (see .env.example)')
  }

  const session = refreshToken
    ? await sessionFromRefreshToken(refreshToken)
    : await sessionFromAccessToken(accessToken)

  console.log(`Authenticated as ${session.profile.username}`)
  if (session.refreshToken && session.refreshToken !== refreshToken) {
    console.log('Microsoft issued a new refresh token. Update REFRESH_TOKEN with this value:')
    console.log(session.refreshToken)
  }

  const game = await resolveGameHost(host, port)
  if (game.host !== host || game.port !== port) {
    console.log(`Minecraft address for ${host} is ${game.host}:${game.port}`)
  }

  const bot = mineflayer.createBot({
    host: game.host,
    port: game.port,
    version,
    username: session.profile.username,
    auth: 'mojang',
    skipValidation: true,
    profilesFolder: false,
    session: {
      accessToken: session.accessToken,
      clientToken: crypto.randomUUID().replace(/-/g, ''),
      selectedProfile: {
        id: session.profile.uuid.replace(/-/g, ''),
        name: session.profile.username
      }
    }
  })

  bot.loadPlugin(pathfinder)

  const commands = attachCommands(bot)
  let commandsSent = false

  bot.once('spawn', () => {
    if (commandsSent) return
    commandsSent = true
    commands.print(`Spawned on ${game.host}:${game.port}. Sending commands...`)
    sendCommands(bot).then(() => {
      if (bot.entity) commands.markReady()
    }).catch(err => {
      commands.print(err.message || String(err))
      bot.quit()
    })
  })

  bot.on('message', (message) => {
    const text = message.toString().trim()
    if (text) commands.print(`[chat] ${text}`)
  })

  bot.on('kicked', (reason) => {
    commands.print('Kicked: ' + (typeof reason === 'string' ? reason : JSON.stringify(reason)))
  })

  bot.on('error', (err) => {
    commands.print(err.message || String(err))
  })

  bot.on('end', (reason) => {
    commands.print(`Disconnected${reason ? `: ${reason}` : ''}`)
    commands.close()
  })
}

function resolveSrv (host, servers) {
  return new Promise((resolve, reject) => {
    const resolver = new dns.Resolver()
    if (servers) resolver.setServers(servers)
    const lookup = servers ? resolver : dns
    lookup.resolveSrv('_minecraft._tcp.' + host, (err, addresses) => {
      if (err) reject(err)
      else resolve(addresses || [])
    })
  })
}

// The game client follows the Minecraft SRV record. This machine's resolver is
// 127.0.0.1 and it refuses those queries, so hypixel.net was opened as a
// website address and the connection timed out.
async function resolveGameHost (host, port) {
  if (port !== 25565 || net.isIP(host) !== 0) return { host, port }
  const attempts = [undefined, ['1.1.1.1', '1.0.0.1'], ['8.8.8.8', '8.8.4.4']]
  for (const servers of attempts) {
    try {
      const records = await resolveSrv(host, servers)
      if (records.length === 0) continue
      records.sort((a, b) => a.priority - b.priority || b.weight - a.weight)
      return { host: records[0].name.replace(/\.$/, ''), port: records[0].port }
    } catch (err) {
      const code = err && err.code
      if (servers && (code === 'ENOTFOUND' || code === 'ENODATA')) return { host, port }
    }
  }
  return { host, port }
}

async function sendCommands (bot) {
  await sleep(COMMAND_DELAY_MS)
  for (const command of COMMANDS) {
    if (!bot.entity) return
    console.log(`> ${command}`)
    bot.chat(command)
    await sleep(COMMAND_DELAY_MS)
  }
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function arg (name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) return undefined
  return value
}

function loadDotEnv (file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

main().catch(err => {
  console.error(err.message || err)
  process.exitCode = 1
})
