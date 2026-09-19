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
calls: $.clock.after, $.command.register, $.env.get, $.process.run,
       $.store.get, $.store.set, $.ui.close, $.ui.invalidate, $.ui.open,
       $.ui.resolve, $.ui.toast
```

No `fs`, no `http`, no `model`, no `agent`, no `tool`, no `mcp`, no `prompt`. It does not touch your
files and it does not touch the network — the word list is a constant in the repo. `$.env.get` reads
one name, `OS`, and `$.process.run` opens the page you set with `/wait page`; with no page set
— the default — neither is ever called. *Surfaces* below says why that exists.
The scan is mechanical: a hooks module that reaches `$` dynamically fails to load at all, so this
list cannot be evaded.

---

## Requirements

- **Claude Code 2.1.269 or newer.** Function hooks live in the desktop app's own bundle, not in the
  global npm CLI. Built against **2.1.275**, run against **2.1.278**.
- **Function hooks turned on** — they are early access and off by default.
- **A terminal.** That is where the pane draws today; the desktop app cannot yet, and *Surfaces*
  below says why and what to do instead.

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

Then **quit Claude completely and reopen it**, and start a session **in a terminal**. From there it
needs nothing else: five seconds into every turn the pane opens on its own, and `/wait` changes what
is in it. In the desktop app the plugin loads and counts your waits but cannot draw — *Surfaces*
below says why, and `/wait page` is what you get there instead.

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
| `/wait page <url>` · `/wait page off` | open a page in your browser on the session's first turn |
| `/wait reset` | clear game and scene progress (asks first) |
| `/wait help` | the list above, in a pane |

Defaults: `enabled`, scene mode, `garden`, `delay 5`, `spinner on`, `keep off`, no page.

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
| **Terminal** | one `Pane`, drawn by the engine itself as character cells — works today |
| Desktop | the app does not implement the plugin render protocol yet (see below) |
| VS Code | the surface has `Svg`; untested, and it needs an extension new enough for function hooks |
| Mobile | the same drawing, without the text field mobile has no element for |

`AbovePrompt` is not used anywhere. It is documented as *"one instance, terminal only"*, and on the
desktop app that band does not exist at all — which is why this plugin is built on `Pane`.

### Why the desktop app draws nothing, and what to do about it

The engine declares `Pane` for the `desktop` surface, and the tree this plugin returns is valid
there — `tests/pane.test.ts` renders it through the real `ui.render` chain and finds the `Svg`.
What is missing is the other half. The declarations put it plainly: the terminal is Ink, *"the rest
are remote surfaces drawing it themselves"*. So on the terminal the engine draws the pane into
character cells and the app only shows them; on the desktop the engine merely describes the pane
over the wire and the app must draw it.

Claude Desktop 2.2553.1.0 does not: its bundle carries `session.start`, `turn.complete` and
`command.run`, but no `ui_render`, `ui_open`, `ui_press`, `ui_input` or `ui_log` — while control
strings around them are plentiful. Every channel a plugin has for showing something goes through
that protocol, toasts and status lines included, so hooks fire and `$.store` fills up while nothing
is drawn. Nothing here can fix it; the plugin should start working unchanged when the app ships it.

A status line is **not** the way around it, though the settings schema makes it look like one: the
desktop app accepts `statusLine` in settings and never runs the command — no process is spawned and
nothing appears. The plugin's drawing and the status line are both things the app would have to
render, and it renders neither.

What is left is a page beside Claude, and one thing the plugin can still do for you there:

```
/wait page https://example.com/your-waitroom
```

With a page set, the first turn of each session opens it in your browser and the rest leave it
alone — so it is there once you start working, without a window in your face every time you press
Enter. `/wait page off` clears it.

**This is the one thing that reaches outside the plugin's own world**, and it is off until you ask
for it. With no page set — the default — `$.process.run` is never called. The URL is checked when
it is stored and again when it is read back (only `http`, `https` and `file`, no whitespace), and it
goes into an argument vector, never a shell.

**A status line, in the terminal.** `statusLine` in `~/.claude/settings.json` is a different road —
the engine runs a command and shows what it prints — and `refreshInterval` re-runs it on a timer, so
the scene can move. Beside the pane it is a second, quieter view of the same progress.
`statusline/waitroom-line.mjs` draws the garden or the swimming tank as one line:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /path/to/claude-waitroom/statusline/waitroom-line.mjs",
    "refreshInterval": 1
  }
}
```

An installed plugin keeps its files under a version-pinned path —
`~/.claude/plugins/cache/waitroom/waitroom/<version>/statusline/waitroom-line.mjs` — which moves
every time the plugin updates. Point the setting at a clone of this repo instead, and the line
survives upgrades.

The plugin stays the brain — it is the thing that knows a turn began and ended — and this is the
display. It is a plain program, not part of the plugin: it reads one file, the plugin store, and
writes nothing. The plugin’s own promise to touch no files is unaffected.

**A page.** `web/index.html` is the three games as one self-contained page — real graphics, a real
keyboard, and no wait to spend, so you play as long as you like. No build and no server: open the
file, or put it anywhere that serves static files. Keep it open beside Claude and switch to it while
a turn runs. Scores live in that browser.

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
