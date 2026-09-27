# Bot

This fork of [binmasterdotpro/mineflayer](https://github.com/binmasterdotpro/mineflayer) includes the 1.8.9 movement work in one repo:

- `vendor/prismarine-physics` — 1.8 ladder boxes and climb speed
- `pathfinder` — one-node parkour follower
- `bot` — login, `move` / `goto`, Grim flag trace, and the position-packet flag detector

From the repo root, after `npm install`:

```powershell
copy bot\.env.example bot\.env
npm start
```

`bot/.env` takes `HOST`, `PORT`, `VERSION`, and either `REFRESH_TOKEN` or `ACCESS_TOKEN`. Do not commit that file.
