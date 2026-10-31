# design-utilities

Three small local tools for design work, plus the pieces they share. Each tool
is its own repo — this one is the family: a landing page, the shared design
tokens, and this README.

- **[ORCA](https://github.com/tylerhagy/ooux)** — an OOUX object-mapping tool. Objects, their attributes and actions, and the relationships between them, with a sign-off on every row so it's obvious what's actually agreed versus still moving.
- **[jobmap](https://github.com/tylerhagy/jobmap)** — a jobs-to-be-done editor over a markdown file, for separating what people are actually trying to achieve from today's process.
- **[priority guide](https://github.com/tylerhagy/priority-guide)** — a tool for writing priority guides: what a screen needs — content, data, functionality — agreed before any visual decision.

All three follow the same shape: a single `index.html`, no build step, no
account, no server beyond a local one. The markdown file you point them at is
always the source of truth — the app is a better way to read and edit it, not
a database that happens to export one.

## Getting started

Clone whichever tool(s) you want. They don't depend on each other.

```bash
git clone https://github.com/tylerhagy/ooux.git
git clone https://github.com/tylerhagy/jobmap.git
git clone https://github.com/tylerhagy/priority-guide.git
```

Requirements:

- **Python 3** — each tool serves itself with `./serve.sh`, no install step.
- **A Chromium browser** — Chrome, Edge, Arc or Brave. The File System Access
  API, which is how these tools read and write a folder on your machine, does
  not exist anywhere else. Safari and Firefox will show a notice instead of
  the folder picker.
- **Node** is only needed if you're running a tool's `validate.mjs` or test
  script, not to just run the app.

In each tool's folder:

```bash
./serve.sh
```

That opens the tool in Chrome, already pointed at its own fixed port —
ORCA on `8042`, jobmap on `8043`, priority guide on `8044`. Click **Open
folder** and pick wherever the project's notes live; the grant is remembered
between sessions.

**The port is pinned on purpose, per tool — don't change it.** Folder
permission grants in the File System Access API are keyed to the origin,
port included. Run a tool on a different port and Chrome treats it as a new
origin with no memory of the folder you already granted, so you'd be asked to
re-pick it every time. If you're running more than one of these tools at
once, that's exactly why they each claim a different port instead of sharing
one.

## Starting all three from a script

Each tool's own `./serve.sh` opens its URL in Chrome once the server is up.
That's fine from a terminal, and it's the wrong move from a sandboxed or
non-interactive shell — asking a GUI browser to activate there can hang or
kill the invoking process, taking the server it just started down with it.

`design-tools.sh`, in this repo, starts all three tools' servers directly in
the background with no `open` call anywhere, so it's safe to run from
anything, agents included. For each tool it checks whether its port is
already listening and leaves it alone if so; otherwise it looks for the
tool's directory — `ORCA_DIR`, `JOBMAP_DIR` or `PRIORITY_GUIDE_DIR` if set,
else the default clone locations `~/Projects/ooux`, `~/Projects/jobmap`,
`~/Projects/priority-guide` — and starts it there. If a tool's directory
isn't found, it says so for that tool specifically and keeps going with the
other two. It's safe to re-run any time: already-running tools are reported
as such, never double-launched.

Install it once, like the tools themselves:

```bash
ln -s "$PWD/design-tools.sh" ~/.local/bin/design-tools
```

Then, from anywhere:

```bash
design-tools
```

It prints each tool's status — already running, started, or failed with a
reason — and its URL. It never opens a browser for you, including for the
landing page below; once the servers are up, open `index.html` or the
individual URLs yourself.

## Optional: AI-assisted drafting

Each tool ships its own portable [Claude Code](https://claude.com/claude-code)
skill at `skills/<name>/SKILL.md` in its own repo — `skills/orca`,
`skills/jobmap`, `skills/priority-guide`. Copy the one you want into your own
skills folder:

```bash
cp -r skills/orca ~/.claude/skills/
```

Then ask for what the skill covers in plain language — "model the objects in
this product," "what are people trying to achieve here" — and the agent
drafts a file from whatever notes you already have, proves it round-trips
with that tool's own `validate.mjs`, and opens it in the app. Drafting is the
agent's job; editing is the app's. Nothing about this depends on any vault or
notes of mine — it reads whatever project files you point it at.

## Look and feel

All three share one visual language: a warm off-white ground (`--bg`) with
white paper surfaces (`--panel`), warm-brown hairlines, a single blue accent
for anything you can act on, and each tool's own colour in a small rounded
brand mark in the header. Selection is accent-tinted, hover lifts a surface
rather than greying it, and the header and cards carry one soft shadow
each. The values live in [`shared/tokens.css`](shared/tokens.css).

Recent changes worth knowing about:

- **ORCA** — the graph is drawn by [Cytoscape.js](https://js.cytoscape.org)
  (vendored and inlined by `build.mjs`, so it is still one offline file).
  It opens on the object you were just viewing; click any node to put it in
  the centre. Object detail is split into Attributes / Metadata /
  Relationships / Calls to action tabs that stay put as you move between
  objects, and there is a Back button (and Esc) to return to the map.
- **jobmap**, **priority guide** — the same palette and header treatment.

## This repo

- **[`shared/tokens.css`](shared/tokens.css)** — the canonical set of CSS
  custom properties across all three tools: ink/bg/dim/faint, hairlines,
  accent, status colors, the type scale, the spacing scale, radius, motion
  ease, shadow. None of the three tools build against this file directly —
  each keeps its own manually-synced copy pasted into its `<style>` block, so
  none of them needs a build step. See [`shared/README.md`](shared/README.md)
  for how to check a tool for drift against it.
- **[`index.html`](index.html)** — a static landing page for the family. Each
  card links to `localhost` on that tool's pinned port, so if you've already
  got one or more running, this is a fast way to jump between them.
