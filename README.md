# Curb Appeal

A leaf blowing game. Every day there is a new sidewalk. Get 90% of the leaves onto the blue tarp before the tank runs dry, and keep them out of the street.

## Play locally

There is no build step and there are no dependencies. The game uses ES modules, so it needs to be served over HTTP rather than opened as a file.

```bash
npm start
```

Then open http://localhost:8080. Any static host works for deploying: upload the repo as is.

## Rules

- **Win** by getting 90% of the leaves onto the tarp. The tarp keeps what it catches.
- **Fuel is a hard budget.** When the tank is empty the run is over.
- **The yellow line is traffic.** A leaf that crosses it is gone. Lose more than 10% and the run is over.
- **Score** is one number: time points plus fuel points, minus strays. Each block has a par.
- **Conditions** change with the block: a parked car, a planter, trash cans, a wet patch of heavy leaves, gusts, and a neighbor's lawn that costs you points.

The daily block is the same for everyone on the same screen shape (wide or tall), so scores are comparable. Random blocks are practice and do not keep a best.

## Controls

- Desktop: point with the mouse and he follows. Hold click or Space to blow. Right click or Shift gives a gentle puff that sips fuel. WASD overrides the follow. R restarts.
- Phone: left thumb walks, right thumb aims and blows. Push the right stick further for more power.

## Code

| File | What it does |
| --- | --- |
| `src/sim.js` | Wind field, leaves, fuel, win and lose rules. No DOM, fixed 60Hz steps. |
| `src/level.js` | Builds a block from a seed: layout, obstacles, conditions, par. |
| `src/render.js` | Canvas drawing. Resting leaves are baked into a cached layer. |
| `src/input.js` | Mouse, keyboard and twin-stick touch. |
| `src/audio.js` | Synthesized engine, wind and feedback sounds. |
| `src/store.js` | Saved preferences, daily bests and the share text. |
| `src/main.js` | Game loop, HUD and cards. |

Add `?debug` to the URL to expose the live sim as `window.__curb`.

## Tests

```bash
npm test
```

The sim runs headlessly in Node. The tests cover level generation, determinism, the fuel and street rules, scoring, and a simple herding bot (`test/bot.js`) that plays real blocks. The bot is a much worse player than a person, so it proves progress rather than par.

## Tuning

The numbers most worth playing with are at the top of `src/sim.js` (`FUEL_SECONDS`, `LOSS_LIMIT`, `FEATHER`) and the par values in `src/level.js`.

Fonts are Bowlby One and Figtree, self-hosted under the SIL Open Font License (see `fonts/`).
