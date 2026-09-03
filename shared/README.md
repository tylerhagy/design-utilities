# shared/

## `tokens.css` — source of truth

`tokens.css` is the **canonical** set of CSS custom properties for the ORCA
(ooux) / jobmap / priority-guide family: ink/bg/dim/faint, hairlines, accent,
status colors, the type scale, the spacing scale, radius, motion ease, and
shadow.

**None of the three apps `@import` or build against this file.** By design,
none of them gained a build step here — they stay single-file `index.html` +
`./serve.sh`. Instead, each app keeps a **manually-synced copy** of this
file's `:root` block (and dark-mode override block, once it has dark mode)
pasted directly into its own `<style>` block. That's a deliberate tradeoff,
not an oversight: it avoids adding a fourth thing — a build pipeline — to
tools whose whole pitch is "it's just an `index.html`."

That means this file **will drift from the apps** unless someone deliberately
re-syncs it. Treat any difference between an app's `:root` block and this
file as a bug to reconcile, not as the app's "own" values — this file wins.

## Checking an app for drift

There's no automated check (no build step, no CI). To manually check an
app's `:root` block against this file:

```bash
# Pull just the app's :root block(s) out of its index.html
grep -n ':root' -A 40 ~/Projects/ooux/index.html | less
grep -n ':root' -A 20 ~/Projects/jobmap/index.html | less
grep -n ':root' -A 20 ~/Projects/priority-guide/index.html | less
```

Then diff by eye against `shared/tokens.css` — since each app's `:root`
block lives inline inside a larger `<style>` tag (not its own file), a plain
`diff` won't line up cleanly. If you want a rough textual diff anyway, copy
just the `:root { ... }` block out to a scratch file first:

```bash
# Example: check ooux against the shared tokens
sed -n '/:root {/,/^}/p' ~/Projects/ooux/index.html > /tmp/ooux-root.css
diff shared/tokens.css /tmp/ooux-root.css
```

Signals that an app has drifted:
- A custom property name in the app doesn't appear in `shared/tokens.css` at all.
- A custom property exists in both but the value differs.
- `shared/tokens.css` has a token the app hasn't adopted yet (e.g. `--line-2`, `--ease`, `--shadow-sm`, `--radius-sm`).

## Naming convention

Adopts **ORCA's convention** where the three apps disagreed, since it was
the most complete of the three going in:

- Named type scale: `--t-micro` … `--t-hero`
- Named spacing scale: `--s1` … `--s7`
- Single base radius: `--radius` (plus one new addition, `--radius-sm`, for controls — see `tokens.css` comments)

Every value in `tokens.css` that differs from what an app currently ships
has an inline one-line comment explaining the change and why — read that
file's comments before wiring the tokens into a per-app task, rather than
guessing which app's original value "won."

Two deliberate deviations from a single silent pick, called out explicitly:

- **`--dim`** (not ORCA's `--muted`, not priority-guide's own value) — canonical name taken from jobmap/priority-guide (2-of-3), canonical value taken from ORCA/jobmap (2-of-3). ORCA will need to rename `--muted` → `--dim` in its per-app task.
- **`--ok`** (not ORCA's `--signed`) — canonical name taken from jobmap/priority-guide (2-of-3); value already agreed with ORCA's `--signed`. ORCA will need to rename `--signed` → `--ok` (and `--signed-soft`/`--on-signed` → `--ok-soft`/`--on-ok`) in its per-app task.
