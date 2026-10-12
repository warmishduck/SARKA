# CLAUDE.md — Forest Creatures AR (v2)

This file is the source of truth for Claude Code on this project.
Read it in full before making any change.

---

## What this project is

A WebAR experience for a museum: visitors point their phone at an exhibit (QR code
or physical object recognition) and a 3D creature appears in augmented reality.
Built with Three.js + 8th Wall JavaScript SDK, served as a static site (Vite build).
No native app, no installation — visitors use their own phones.

---

## Tech stack (frozen — do not change without explicit approval)

| Layer | Library / Tool | Pinned version |
|---|---|---|
| AR engine | `@8thwall/engine-binary` | `^1.0.0` |
| AR extras | `@8thwall/xrextras` | `^1.0.0` |
| Landing page | `@8thwall/landing-page` | `^1.0.0` |
| 3D rendering | `three` | `^0.183.2` |
| Build tool | `vite` | `^8.0.8` |
| Asset copying | `vite-plugin-static-copy` | `^4.1.1` |
| QR codes (`qr.html`) | `qrcode-generator` | `^2.0.4` |

**Rules:**
- Do not add npm dependencies without asking. Solve problems with what already exists.
- Do not upgrade library versions without asking.
- Do not use CDN imports, `<script>` tags for custom code, or global module patterns.
  Everything is ESM (`import`/`export`).

---

## Architecture overview

```
index.html                Page shell: loads the 8th Wall engine scripts and src/app.js
qr.html                   Staff page that prints one QR code per exhibit (qrcode-generator)
public/image-targets/     image-target-cli output (flat, no subfolder)
test/                     Node tests, run by `npm test`
src/
  app.js                  Entry point: reads the URL, starts AR or welcome
  route.js                Pure routing logic (no DOM) — testable in Node
  i18n.js                 All user-facing strings (fi, en, sv, uk; Finnish by default); language switch state
  welcome.js              The welcome page (no camera, Three.js preview)
  scan.js                 Object scanner (/?scan): find object → glow → exhibit on the floor ahead
  floor-spot.js           Pure maths: where on the floor the scanner places content (tested)
  stone-wall.js           Procedural stone wall a locked creature hides behind (scanner flow)
  debug-panel.js          On-phone readout of live values, only with ?debug in the address
  xr-pipeline.js          The shared 8th Wall camera pipeline every AR page starts with
  threejs-scene-init.js   8th Wall pipeline module: puts one exhibit into the Three.js AR scene
  ui.js                   In-AR DOM overlay: hints, mode switch, level buttons, mute, language, photo
  lights.js               Lighting and shadow floor shared by the AR view and the welcome page
  showcase.js             Creatures in a scene: loading, idle motion, tap reactions (welcome + AR)
  models.js               Maps a model or art file name to its Vite asset URL
  sound.js                Synthesized sound effects (Web Audio, no audio files)
  rig.js                  Helpers for measuring and placing rigged glTF characters
  creature-snapshot.js    Renders a creature model to a 2D image, a stand-in puzzle picture
  branch.js               Curve maths for the branch the acorn grows in the level
  glow.js                 Glowcap glow effect
  spark.js                One-shot spark burst when a puzzle is solved
  staff.js                Staff password for the ?staff=1 puzzle bypass (not real security)
  platformer.js           Side-on platformer physics for the level (pure logic, no Three.js; tested)
  level.js                Level diorama: scene, input and the cooperative puzzle
  level-data.js           Level geometry data
  index.css               Page and overlay styles (the .ui-* rules)
  content/
    exhibits.js           Exhibit registry (QR code → creatures + game + image target)
    creatures.js          Creature definitions (model, height, tap reactions, optional puzzle)
    games.js              Mini-game registry (the platformer level an exhibit can offer)
  image-targets/
    index.js              IMAGE_TARGET_DATA — add real targets here
  minigames/
    base.js               MiniGame base class: the contract every puzzle type follows
    registry.js           Loads a mini-game type's module by name, lazily
    puzzle.js             Jigsaw puzzle mini-game (DOM overlay on top of the AR canvas)
    puzzle-logic.js       Jigsaw rules, no DOM (tested)
    placeholder-art.js    Canvas-drawn stand-in puzzle image
  assets/                 .glb models and puzzle art, found by name via models.js
```

**Rules:**
- One concern per file. Do not mix routing, rendering, and UI in the same module.
- No circular imports. If A imports B, B must not import A.
- `content/` is pure data — no DOM, no Three.js, no 8th Wall calls inside it.
- `route.js` is pure (no DOM) — it must stay testable in Node without a browser.
- New creatures go in `content/creatures.js`. New exhibits go in `content/exhibits.js`.
- New mini-game types get their own file in `minigames/` (a `MiniGame` subclass,
  registered in `registry.js`).

---

## Code style and documentation

### JSDoc is mandatory on all non-trivial code

Every exported function and every complex type must have a JSDoc block.
This is not optional — it keeps the editor's type inference working
and lets Claude understand the code without reading the whole file.

**Required on:**
- Every exported function (parameters, return type)
- Every `@typedef` for objects passed between modules
- Every `@type` annotation on module-level variables that hold non-obvious values

**Template for an exported function:**
```js
/**
 * Short one-line description.
 *
 * Longer explanation if the behaviour is not obvious from the name.
 *
 * @param {string} targetName - `detail.name` from the `reality.imagefound` event.
 * @param {Object<string, Exhibit>} [exhibits] - Override the default registry (for tests).
 * @returns {{code: string, exhibit: Exhibit} | null}
 */
export const routeFromImageTarget = (targetName, exhibits = EXHIBITS) => { … }
```

**Template for a shared type:**
```js
/**
 * @typedef {Object} Exhibit
 * @property {Placement[]} creatures
 * @property {string} [game] - A key of GAMES in content/games.js.
 * @property {'game'} [startIn]
 * @property {string} [imageTarget] - Name of the image target that opens this exhibit.
 */
```

Real examples to copy the style from: `src/route.js` and `src/content/exhibits.js`.

**Rules:**
- Do not write JSDoc on trivial one-liners (getters, constants).
- Do not write JSDoc that only restates the function name ("Gets the code").
  Describe what is non-obvious: edge cases, units, side-effects.
- Use `{string}`, `{number}`, `{boolean}`, `{Object}`, `{Array}`, specific typedefs,
  or `{*}` — never leave a parameter untyped.

### General code style

- No comments that explain *what* the code does — names do that.
  Write a comment only when the *why* is non-obvious (a workaround, a constraint,
  a subtle invariant).
- No trailing summary comments ("// end of function").
- `const` over `let`. `let` only when reassignment is necessary.
- Strings: single quotes for JS, double quotes inside HTML attributes.

---

## What Claude may change freely

- Content in `content/` (creatures, exhibits, games, image targets).
- Translations in `i18n.js`.
- Mini-game logic in `minigames/`.
- CSS in `src/index.css`.
- Adding JSDoc to existing functions that lack it.
- Fixing bugs inside a module without changing its public API.

## What Claude must ask before changing

- The public API of any module (exported function signatures, event names).
- `index.html` structure or script-loading order.
- `vite.config.js`.
- Adding or removing npm packages.
- Splitting or merging files.
- The 8th Wall pipeline module list in `xr-pipeline.js`.

## What Claude must NOT do without explicit instruction

- Add features not asked for.
- Refactor code that is not broken.
- Add error handling for scenarios that cannot happen in normal use.
- Change library versions.
- Add new npm packages.
- Modify `public/` assets manually (they are either static or generated at build time).
- Commit to, merge into, or push `main` (see "Branches and deployment" below).
- Touch anything in the old project at
  `C:\Users\artem\Downloads\threejs-world-effects-example-main\` —
  that project is frozen and shown to the museum.

---

## Branches and deployment

- `main` is the live site shown to the museum (currently v1). A push to `main` builds the
  site and publishes it to GitHub Pages (`.github/workflows/deploy.yml`), so `main` changes
  only when the developer explicitly asks for it.
- `v2` is this code. `origin` (`pulse-duck-ar`) only stores the branch and has no site for it.
  A public preview lives in a separate repository, `warmishduck/SARKA` (git remote `sarka`,
  `https://warmishduck.github.io/SARKA/`); `git push sarka v2:main` publishes `v2` there.
  That push goes to SARKA's own `main`, never to `origin`'s. Day-to-day testing on a phone
  still goes through a tunnel (see "Dev server").
- Commit on `v2`. Push only after the developer has tried the change on a phone and
  approved it.

---

## Security

### Dependency policy

**Allowed packages** are the ones already in `package.json`. Every new package
must be explicitly approved before being added. When evaluating a new package, check:
- Is it maintained (last commit < 1 year, no open critical CVEs)?
- Can the same be done with a library already in the project?
- Does its transitive dependency tree stay small?

**`package-lock.json` is sacred.**
- Never delete it, never add it to `.gitignore`.
- Never run `npm install <package>` without committing the updated lockfile.
- The lockfile pins every transitive dependency to an exact version — it is the
  single source of truth for what actually runs in production.
- The deploy installs with `npm ci`, so a lockfile that disagrees with `package.json`
  fails the build.
- Before committing a lockfile change, run `git diff package-lock.json` and
  confirm only the expected packages changed.

**`npm audit` must pass.** Run it before every release:
```
npm audit --audit-level=high
```
A `high` or `critical` finding blocks the release until resolved.

---

### External scripts and Subresource Integrity (SRI)

**Prefer zero external scripts.** The 8th Wall engine is already self-hosted
(served from npm packages at `external/xr/`). Do not add `<script src="…">`
or `<link href="…">` tags that point to a CDN or third-party host.

**If an external script is unavoidable**, it must carry an SRI hash:
```html
<script
  src="https://cdn.example.com/lib.min.js"
  integrity="sha384-<base64hash>"
  crossorigin="anonymous">
</script>
```
Generate the hash with:
```
openssl dgst -sha384 -binary lib.min.js | openssl base64 -A
```
Without an SRI hash, a compromised CDN can inject arbitrary code into every
visitor's phone. A museum audience is especially sensitive — children, schools.

**Claude must never add an external script tag without an SRI hash.**
If Claude does not know the hash, it must say so and ask the developer to
generate it before the change is committed.

---

### Safe coding practices

- **No `innerHTML` with untrusted content.** Use `textContent` for strings from
  i18n or user input. Only set `innerHTML` for static, developer-controlled HTML.
- **No `eval()`, `new Function()`, or `setTimeout(string)`** under any circumstances.
- **URL parameters are untrusted.** `route.js` already validates the `?c=` value
  against a strict regex before using it. Follow the same pattern everywhere:
  validate at the boundary, trust inside.
- **No secrets in source code.** API keys, tokens, or credentials must never be
  committed. No API key or token is used today. If a service ever requires one, it
  goes in a `.env` file, which `.gitignore` already excludes.
  (`staff.js` holds the staff password for the puzzle bypass. It ships to every
  visitor's browser, so it is a nuisance guard, not a secret.)

---

### Camera data and privacy

The 8th Wall camera pipeline reads the video feed for AR and for image target
detection. The feed can show visitors' faces (children among them), which makes it
personal data under GDPR and similar laws, so it is handled strictly.

Rules that must never be broken:
- The camera feed is **never sent to a server**. All processing is local, in the
  browser, in memory.
- No frame, thumbnail, or derived value from the camera is stored (localStorage,
  IndexedDB, a cookie) beyond the lifetime of the page.
- The camera is started in exactly one place: `XR8.run` in `xr-pipeline.js`, which
  brings up the browser's own permission prompt. Do not start the camera anywhere
  else (no `getUserMedia`), and do not bypass or pre-empt the prompt.
- If a Privacy Policy is added to the site, it must state that the camera feed is
  processed locally and nothing from it is transmitted or stored.

The one deliberate exception is the photo button: the visitor takes a photo, sees it
in a preview, and alone decides whether to save or share it through the phone's
share sheet. The app itself uploads nothing.

---

### Code review principle

**Claude writes; a human approves before merge.**

Claude can produce, explain, and refactor code quickly, but it can miss
context-specific constraints, introduce subtle logic errors, or make changes
with unintended side-effects. Every non-trivial change must be reviewed by a
human developer before being pushed to production or shown to museum visitors.

For each change Claude makes, it must be able to answer, in plain language:
- What exactly changed and why.
- What could go wrong (edge cases, regressions).
- What was deliberately left unchanged and why.

If Claude cannot answer any of these, the change is not ready for review.

---

## How to add a new exhibit

1. Add the exhibit entry in `src/content/exhibits.js`:
   ```js
   '04': {creatures: [alone('newcreature')], imageTarget: '04'},
   ```
2. Add the creature definition in `src/content/creatures.js` (if it's new).
3. Place the GLB model in `src/assets/`.
4. Generate an image target (when the museum provides a photo):
   ```
   npx @8thwall/image-target-cli@latest
   ```
   - Photo: sharp, straight-on, evenly lit; flat objects (paintings, posters) work best.
     Repeating patterns (stripes, tiles) and 3D objects recognise poorly.
   - Crop to the object only (answer `n` to "default crop"); the crop is 3:4 or 4:3.
   - Output folder: `public/image-targets` — **flat, no subfolder**. The CLI writes
     `imagePath: "image-targets/<name>_luminance.jpg"`, so a subfolder breaks loading.
   - Name: same as the `imageTarget` value in step 1.
5. Import the JSON in `src/image-targets/index.js`
   (`import name from '../../public/image-targets/<name>.json'`) and add it to
   `IMAGE_TARGET_DATA`. The welcome page shows the "scan an object" button as soon as
   the list is non-empty.

---

## Testing

```
npm test
```

Tests live in `test/`. They run in Node (no browser, no 8th Wall).
`config.test.js` checks i18n keys, exhibit codes, routing (incl. `?scan` and
image-target lookup). `puzzle-logic.test.js` and `platformer.test.js` cover game logic.
`floor-spot.test.js` covers the scanner's floor-placement maths.

The `test` script in `package.json` lists the four files by name, so a new test file
is not run until it is added there.

When adding a new i18n key, the test will fail until all four languages have it.
That is intentional — fix all four before committing.

---

## Dev server

```
npm run serve
```

Starts Vite on port 5173 (or next free port). The 8th Wall engine is served from
`node_modules/@8thwall/*/dist/` at `external/xr/` by `vite-plugin-static-copy`
(in memory in dev, copied into `dist/` on build — see `engineFiles` in `vite.config.js`).
If `external/xr/xr.js` returns 404, AR pages stay blank: check this first.

ngrok and a few other tunnel domains are allowed in `vite.config.js` (`allowedHosts`).
Camera access needs HTTPS, so test on a real phone via: `ngrok http 5173`.

`npm run build` writes `dist/` (both `index.html` and `qr.html`).
