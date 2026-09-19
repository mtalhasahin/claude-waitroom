# Waitroom

**Turn-based games and calm scenes in a pane while Claude works. Zero model tokens.**

Every prompt buys you 10–60 seconds of dead time. Waitroom puts something in it: a garden that
grows a flower per wait, an aquarium that gains a species as the waits add up, or a game of
Tetris, 2048 or Word that advances one move at a time.

```
/wait scene aquarium
/wait game 2048
/wait off
```

---

## Why it is turn-based

A wait is an *interruption* of work already in progress, and a demanding secondary task makes the
return to the primary one slower (Sio & Ormerod on incubation; Altmann & Trafton on resumption
lag). So the games here are not real-time. **One wait is one move.** There is no clock, nothing is
lost half-finished, and a long wait becomes a reward rather than a penalty.

Scene mode is the low-load option and is therefore the default. Games are opt-in.

---

## Zero model tokens

This is a hard constraint, not a goal. Waitroom never spends a token, under any circumstances.

**What it never calls.** `$.model.*` (`complete`, `fork`, `classify`), `$.prompt.*` (`submit`,
`fill`, `suggest`), `$.agent.spawn`, `$.tool.call`, `$.mcp.call`, `$.session.compact`,
`$.session.messages`.

**What it never hooks.** `prompt.context`, `prompt.section`, `attribution.text`, `skill.prompt`,
`tool.describe`, `tool.call`, `tool.check` — every one of them returns text the model reads.

**Where the output goes instead.** The `ui.render` tree goes to the surface, not to the model.
Status and confirmations go to `$.ui.toast`, which leaves the transcript and the model untouched.
Button presses and text submissions start no model turn.

**Two details that are easy to get wrong**, and that this plugin handles deliberately:

- `command.run` may answer `{ text }`, and that text lands in the transcript, which the model
  reads on its next turn. `/wait` therefore answers `{}` and puts its reply in a toast or in the
  pane. It never sets `{ context }` either — that field is model-only by design.
- A `turn.complete` hook may return `{ text }`, shown beneath the answer. Waitroom passes
  `next(e)`'s result through verbatim and never substitutes its own.

**You can check this yourself**, without reading the source. The engine derives a plugin's
capabilities by scanning it:

```bash
claude plugin validate .claude-plugin/plugin.json
```

which reports, for this plugin:

```
hooks: session.start, command.run{command=wait}, turn.start, turn.complete,
       ui.close{id=waitroom}, ui.render{component=Spinner}, ui.render{component=Pane}
calls: $.clock.after, $.command.register, $.store.get, $.store.set,
       $.ui.close, $.ui.invalidate, $.ui.open, $.ui.resolve, $.ui.toast
```

No `fs`, no `http`, no `process`, no `model`, no `agent`, no `tool`, no `mcp`, no `prompt`. It does
not touch your files and it does not touch the network — the word list is a constant in the repo.
The scan is mechanical: a hooks module that reaches `$` dynamically fails to load at all, so this
list cannot be evaded.

---

## Requirements

- **Claude Desktop 2.1.269 or newer.** Function hooks live in the desktop app's own bundle, not in
  the global npm CLI. Built and tested against **2.1.275**.
- **Function hooks turned on** — they are early access and off by default.
- Desktop is the primary target. The terminal, VS Code and mobile draw too (see *Surfaces*).

### Turning function hooks on

Add this to `~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

**Then quit Claude Desktop completely and reopen it.** Hook modules load when a session starts;
there is no reload short of a restart.

If your organization ships a `managed-settings.json` or `policy-limits.json` that disables hooks,
the flag will not help — the gate is
`flagOn() && !policySettings.disableAllHooks && !settings.disableAllHooks && !safeMode()`.

---

## Install

```bash
claude plugin marketplace add mtalhasahin/claude-waitroom
claude plugin install waitroom@waitroom
```

Or, to run it straight from a clone while you poke at it:

```bash
claude --plugin-dir /path/to/claude-waitroom
```

That form watches the folder, so saving a file reloads the hooks module.

---

## Commands

| Command | What it does |
|---|---|
| `/wait` | show the current status |
| `/wait on` · `/wait off` | enable or disable it entirely |
| `/wait scene garden\|aquarium` | switch to scene mode and pick the scene |
| `/wait game tetris\|2048\|word` | switch to game mode and pick the game |
| `/wait delay <seconds>` | how long after a turn starts before the pane opens (`0` = at once) |
| `/wait spinner on\|off` | write a one-line status into the spinner |
| `/wait keep on\|off` | leave the pane up after the turn ends |
| `/wait reset` | clear game and scene progress (asks first) |
| `/wait help` | the list above, in a pane |

Defaults: `enabled`, scene mode, `garden`, `delay 5`, `spinner on`, `keep off`.

The command is registered `immediate`, so it works mid-turn.

---

## The games

All three keep their state in `$.store`, so nothing is lost when a turn ends, a session closes or
the plugin reloads. Progress is global: the same garden and the same 2048 board follow you into
every project.

**Tetris** — a 12×9 board, because a pane is wide and short. Five pieces. Buttons for left, rotate,
right and drop, with a dashed ghost showing where the piece will land. A piece you have not dropped
carries over to the next wait, so positioning it across several waits costs you nothing. When the
board fills up it clears and your line count moves to `best`.

**2048** — the standard 4×4 rules. A move that changes nothing is not a move: no tile spawns and
the wait is not spent. `score` and `best` persist.

**Word** — five letters, six guesses, one guess per wait, typed into the pane's input. Repeated
letters are scored the classic way: exact matches are taken first, and the `near` marks are drawn
from whatever is left, so two of a letter the answer has once earns one mark. 747 answers, all
committed to the repo.

### Controls

The pane's controls are pressed with the pointer, or with Tab and Enter once the pane holds the
keyboard. They deliberately do **not** use `hotkey`: the engine honours a button hotkey only in the
`AbovePrompt` band, and that band does not exist on the desktop app.

---

## The scenes

Scenes give no instructions and ask for nothing.

**Garden** — every completed wait grows a flower. Earlier flowers stand faded; the new one opens
over the turn. Ten to a bed, then the row starts over.

**Aquarium** — fish swim, seaweed sways, bubbles rise. A new species joins at 5, 20, 60, 120 and
240 completed waits.

Both animate with SMIL inside a single `Svg` element, which means the motion runs by itself: no
timer, no re-render, no CPU spent per frame, and certainly no tokens. A thin bar counts *up* rather
than down — a countdown to a moment nobody can predict reads as a broken promise.

---

## Surfaces

| Surface | How it draws |
|---|---|
| **Desktop** | one `Svg` plus buttons — the primary target |
| VS Code | the same; the surface has `Svg` too |
| Mobile | the same drawing; no text input, so Word is read-only there |
| Terminal | no `Svg` exists there, so the same states are drawn as rows of text |

`AbovePrompt` is not used anywhere. It is documented as *"one instance, terminal only"*, and on the
desktop app that band does not exist at all — which is why this plugin is built on `Pane`.

---

## How it is put together

```
hooks/
├── hooks.json
├── register.tsx        the only hooks module — a thin shell
├── core/
│   ├── config.ts       config shape, defaults, the /wait parser      [PURE]
│   └── state.ts        store schema, defensive reads, migration      [PURE]
├── games/
│   ├── tetris.ts       board, pieces, collision, rotation, clears    [PURE]
│   ├── g2048.ts        grid, moves, merging, tile spawn              [PURE]
│   ├── word.ts         guess scoring, locale-aware casing            [PURE]
│   └── words.ts        the answers                                   [PURE]
├── scenes/
│   ├── garden.ts       produces an SVG document                      [PURE]
│   └── aquarium.ts     produces an SVG document                      [PURE]
└── render/
    ├── svg.ts          scrub-safe SVG helpers                        [PURE]
    ├── board.ts        game state → SVG                              [PURE]
    └── text.ts         game state → rows of text                     [PURE]
```

**`[PURE]` means no engine, no surface, no `$`** — data in, data out. That is where the tests are,
and it is the reason an early-access API change can only break the thin shell.

Two shapes in `register.tsx` are forced by the engine's static scan and are worth knowing before
you edit it:

- **Every function that takes `$` is declared at the top of the file.** The scan follows `$` only
  through top-level declarations; a helper nested inside `register` makes the module fail to
  validate.
- **Session state is a `Room` record made inside `register` and passed explicitly.** There are no
  module-level mutable globals, so a reload starts clean.

### Developing

```bash
claude plugin test .                                # 169 tests, no network, no fs
claude plugin validate .claude-plugin/plugin.json   # what it hooks and calls
npx -p typescript@5.7 tsc --noEmit                  # types
```

`.claude/types/claude-code.d.ts` is committed on purpose: it pins the build this code was written
against. Regenerate it with `/plugin-types .claude/types` after a Claude Desktop update.

---

## Known limits

- **The API is early access.** Its own header says it "may change between releases without
  notice", and the desktop bundle self-updates. Breakage should be expected; the pure/shell split
  is the mitigation.
- **A pane takes up room.** It is more present than a thin status band, which is why `delay`,
  `keep` and `off` are first-class and why the calm scene is the default.
- **Being turn-based reduces the cognitive-load risk; it does not remove it.** Games are opt-in for
  that reason.
- **`<g>` is not used.** Some builds keep grouping in the SVG scrub and some do not; nothing here
  depends on it, so every element carries its own position and its own `animateTransform`.

## License

MIT. See [LICENSE](LICENSE).
