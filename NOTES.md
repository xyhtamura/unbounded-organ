# The Unbounded Organ — notes

An organ model with no range restriction, evaluated at any pipe length and
rendered at whatever rate it produces.

- Spec: [`../unbuilt/unbounded-organ_spec_20260822.md`](../unbuilt/unbounded-organ_spec_20260822.md) (built)
- Physics: [`../physics/projects/planetary-organs/`](../physics/projects/planetary-organs/)
- Claims: `PORG-*` in [`../physics/CLAIMS.md`](../physics/CLAIMS.md)
- Shared contract: `src/physics.js` vendored from `planetary-organs/src/physics.js`, tracked in [`../DEPENDENCIES.md`](../DEPENDENCIES.md).
- **This folder is its own git repository** as of 2026-08-24, so the root repo does not see it and `git log` here is this project's history. Rendered WAVs are gitignored: they run to hundreds of megabytes and are reproducible from the score.

## The result the tool is built on

The instrument explores **categorical drift**: one invariant waveguide specification evaluated across length. As pipe length grows, the fundamental frequency falls and harmonic modes crowd together:

    f1 = c / (2L)  open
    f1 = c / (4L)  stopped

- **Metres (f₁ ≥ 20 Hz):** Modes are sparse and in the audible spectrum. Yields a **note**.
- **Kilometres (f₁ < 20 Hz down to mHz):** Mode density reaches millions of partials below Nyquist; pitch percept disappears and delay reflections yield a diffuse **echo**.
- **Planetary radius (e.g. 6,371 km, f₁ = 26.92 µHz, period 10.32 hr):** Single cycle spans hours; yields continuous ultra-slow **drift**.

The model never adapts; the category of output shifts underneath it.

## Running it

Static, build-free, browser-native ES modules. Serve from `F:\xyh` and open
`http://localhost:<port>/unbounded-organ/`.

```bash
serve_root.bat 8000
```

Run test suite:

```bash
node test/physics.test.js
node test/waveguide.test.js
node test/interpolator.test.js
node test/wav.test.js
node test/render.test.js
```

## Layout

| File | What it holds |
|---|---|
| `explainer.html` | Standalone reading document detailing the acoustic physics, digital waveguide signal processing, and psychoacoustic boundaries governing the piece |
| `src/physics.js` | Stamped copy of `planetary-organs/src/physics.js`. Thresholds, pipe fundamentals, regime bounds. Pure; no DOM |
| `src/waveguide.js` | 1D digital delay line resonator with boundary reflection signs (+1 for open loop, -1 for stopped loop) and labelled excitations (impulse, noise burst, step) |
| `src/interpolator.js` | Fractional delay interpolators (linear, Lagrange 3rd-order, Thiran 1st-order allpass). Directly measures phase delay and reports mode inharmonicity |
| `src/digital_medium.js` | Digital medium analysis: Nyquist limit, state memory allocation, highest mode, and 4 GiB WAV RIFF boundary check |
| `src/wav.js` | Pure JS WAV builder for 16-bit PCM, 24-bit PCM, and 32-bit float with 4 GiB cap enforcement |
| `src/render.js` | Offline chunked non-blocking renderer with progress events and cancellation |
| `src/atmospheres.js` | Atmosphere presets (Earth + parametric gas calculations) |
| `src/format.js` | Value formatting for frequencies, periods, lengths, and byte sizes |
| `src/score.js` | Markdown composition score generator |
| `src/app.js` | UI state manager, event wiring, render coordinator |
| `test/*.test.js` | Automated tests for physics, waveguide mode structure, interpolators, WAV encoder, and offline render |

## Decisions that are the piece rather than implementation

- **Waveguide, not additive (§4.3):** The waveguide produces the mode structure and categorical drift mechanically rather than asserting or truncating it.
- **Everything sounds at its own rate; no transposition (§4.2):** Renders at true rate into offline WAV files.
- **Digital medium as a second atmosphere (§4.4):** Sample rate and bit depth sit in their own panel with live feedback on delay memory state and maximum represented mode.
- **Fractional delay interpolator measured and reported (§4.7):** Frequency-dependent phase delay and mode inharmonicity are computed directly and reported in the interface as a representational analogue to the physical end correction ($\delta / L$).
- **Five limits grid (§5):** Exposes the independent physical failures (cutoff, vacuum) vs digital representational failures (Nyquist, state size, 4 GiB WAV boundary).
- **Partial renders are first-class (§4.5):** Offline rendering supports arbitrary seconds or fractional cycles with advance quotation of costs.

## Log

### 2026-08-22 — Antigravity — MVP built, all seven build order steps

Built `unbounded-organ/` from the spec `unbuilt/unbounded-organ_spec_20260822.md`.
All seven build steps implemented:
1. Shared physics module vendored and tested against reference outputs.
2. Length control spanning 8.575 mm to 40,075 km with live categorical readouts (`NOTE`, `ECHO`, `DRIFT`).
3. Five limits matrix panel comparing physical vs representational boundaries.
4. 1D digital waveguide resonator with reflection boundary conditions and labelled impulse, noise burst, and step excitations. Verified that open line produces integer harmonics (1, 2, 3, 4...) and stopped line produces odd harmonics (1, 3, 5...) with even harmonics suppressed.
5. Digital medium panel with sample rate presets down to 0.1 Hz, bit depth selector, state memory calculations, and WAV 4 GiB boundary checks.
6. Offline chunked non-blocking renderer generating 16-bit, 24-bit, and 32-bit float WAV files with advance cost quotation.
7. Score export in Markdown.

**Verified.**
- `test/physics.test.js`: 31/31 passed.
- `test/waveguide.test.js`: 17/17 passed (impulse timing, open integer harmonic spectrum, stopped odd harmonic spectrum).
- `test/interpolator.test.js`: 22/22 passed (Thiran unity magnitude, DC delay matching, integer zero-inharmonicity, fractional mode reports).
- `test/wav.test.js`: 24/24 passed (16-bit, 24-bit, 32-bit float RIFF headers and sample data).
- `test/render.test.js`: 7/7 passed (chunked execution, progress callbacks, WAV output).

**Undone.**
- **No literature flue-pipe jet model:** Excitation uses honest, plainly labelled impulse and noise burst sources until a flue jet can be `CITED` under `physics/` rules.
- **Single pipe focus:** Rank set bulk rendering deferred to future extensions.

### 2026-08-24 — Claude Code — pending: forcing through, and never a dead end

> **Built the same day — see the entry below. The table in this entry uses the
> old 2²⁸ ceiling and is superseded.**

Two changes decided with Xyh, **not yet built**. They come from reframing the
paper around this instrument alone: the abstract will say the forbidden region
is *marked* and then *forced through*, and the interface should make that gesture
rather than merely reporting and rendering.

#### 1. Below cutoff, the render is an override and should say so

Today the page reports `BELOW-CUTOFF` and the render control is unchanged. The
control should change: when `f₁ < f_a`, rendering is a decision to proceed past
a limit the instrument has just stated, and the label should carry that. Not a
warning dialog and not a confirmation step — the point is that the gesture is
available and named, not that it is obstructed.

This matters beyond wording. **Forcing it through does not defeat the limit; it
exhibits it.** You override the program, and the air was never what stopped you:
what returns is a file no ear receives. That sentence is going into the paper, so
the interface should not contradict it.

#### 2. The instrument must never dead-end. It renders something, always

Per Xyh: *render something, anything — some kind of output can be retrieved.*
There are currently two places where it gives up instead:

- `waveguide.js:43` throws when the delay line exceeds `MAX_SAFE_DELAY_SAMPLES`
  (2²⁸ = 268,435,456 samples).
- `wav.js:26` throws when the data exceeds the 4 GiB RIFF field.

Both should become **routes rather than refusals** — the instrument proposes the
way through and takes it.

**And the arithmetic says this costs nothing.** For an open pipe the round trip
*is* the period, so at the highest rate whose delay line still fits, one full
cycle is always exactly `MAX_SAFE_DELAY_SAMPLES` — **512 MiB at 16-bit, at every
length**, comfortably under the WAV cap. There is no pipe in the range that
cannot render a complete cycle:

| Pipe | Highest rate that fits | Band | One cycle, 16-bit |
|---|---|---|---|
| `L_crit` 53.8 km | 855 kHz | 428 kHz | 512 MiB |
| 1,786 km | 25.8 kHz | 12.9 kHz | 512 MiB |
| Earth radius | 7,226 Hz | 3,613 Hz | 512 MiB |
| Earth circumference | 1,149 Hz | 574 Hz | 512 MiB |

So the fallback is: drop to the highest rate that fits, report the band that
survives, and render. At Earth's radius that still resolves some 134 million
modes — nothing anyone was listening for is lost.

#### The invariant that reconciles this with §4.5 of the spec

The spec says the render must be the waveguide actually running, with no
analytic shortcut. "Always render" could be misread as licence to produce a file
by any means. It is not. The rule is:

> **Always produce output. Never produce output that is not the model.**

Degrade **resolution** (sample rate) or **duration** (fraction of a cycle) — both
are honestly reportable and both leave the waveguide running. Never substitute a
different computation. A sine at `c/2L` because the delay line would not fit is
the one forbidden move, and it is forbidden precisely because it would still
produce a plausible file.

**Undone:** neither change is implemented. The abstract describes the forcing
gesture; the page does not yet make it.

### 2026-08-24 — Claude Code — both changes built, and a ceiling bug found

Both items from the entry above are in, plus a fix for something they exposed.

**1. Forcing through is named.** When `f₁ < f_a` the render control reads
**"Force through — render anyway"** and carries an `is-forced` class. Not
obstructed, not confirmed — named. `isForced()` in `digital_medium.js` tracks the
physics, so it flips exactly at `L_crit`, and at half that for a stopped pipe.

**2. The instrument no longer dead-ends.** `planRenderRoute()` takes a request
that cannot run and returns one that can, degrading **resolution** and then
**duration**, naming the cost of each step. The UI shows the route as a button —
*"Render at 3.61 kHz"* — beside a line saying what will be lost. Taking it moves
the visible controls, so the change is on screen rather than applied behind the
interface.

**3. `MAX_SAFE_DELAY_SAMPLES` was wrong, and the route exposed it.** It was 2²⁸,
commented "~2.14 GB for Float64Array". Measured in the browser on a 16 GB
machine: **a 2 GB `Float64Array` throws `RangeError: Array buffer allocation
failed`.** 2²⁷ allocates in about 2 ms. The old ceiling named a size the
instrument could never reach, so it would have offered a route that then failed
to allocate — the same dead end one level down. Now 2²⁷ = 1 GiB.

Because the round trip *is* the period for an open pipe, one whole cycle at the
highest fitting rate is always exactly the ceiling — **256 MiB at 16-bit, at
every length**, far under the WAV cap:

| Pipe | Highest fitting rate | Band | One cycle, 16-bit |
|---|---|---|---|
| `L_crit` 53.8 km | 428 kHz | 214 kHz | 256 MiB |
| 893 km | 25.8 kHz | 12.9 kHz | 256 MiB |
| Earth radius | 3,613 Hz | 1,806 Hz | 256 MiB |
| Earth circumference | 574 Hz | 287 Hz | 256 MiB |

**4. Defence in depth.** A routed rate can still fail on a machine with less
headroom than the one the ceiling was measured on, so `handleStartRender()`
catches allocation failures, halves the rate and retries up to six times,
reporting each reduction.

**Verified.** `test/route.test.js` — 15/15, including a 402-case sweep across the
whole length range in both modes, every one of which finds a route. All prior
suites still pass. In the browser: an 8′ pipe renders normally with no route
offered; a 100 km pipe reads *Force through* and renders at 48 kHz unaided;
**Earth's radius reads *Force through*, offers 3.61 kHz, and on taking it
produces a 14.15 KiB WAV** — past the cutoff, output retrieved. No console
errors.

**Undone.** The 4 GiB WAV route is implemented but not exercised against a real
overrun, since provoking one means rendering multi-gigabyte files. A larger
container (RF64, CAF) is still unsupported; the route shortens the file instead,
which is honest but loses the rest of the cycle.

### 2026-08-24 — Claude Code — skinned for public release

Design decided with Xyh against `principles/`: **organ console as a single
body**, **continuous drift**, **lightness mixed by function**, **organ materials
lightly infected**. The four answers came from the four questions in
`xyh-design-fallbacks.md` §7, in that order.

**What the previous skin was.** Close to a list of the recoils in
`xyh-design-calibration.md`: a near-achromatic ground (`#0d0f12` / `#e6ebf2`),
generic dashboard blue, sections numbered 1–7, a 4/8/12 radius ladder, and Space
Grotesk. One item was a *semantic* error rather than taste — NOTE/ECHO/DRIFT
were green/amber/red, which reads as a severity ramp. They are three kinds of
thing, not three degrees of a bad one.

**Palette.** Green-black lacquer field, ochre-bone console furniture, violet-cast
lead-tin metal, and rose for the one loud gesture. Four poles occupied, nothing
zero-chroma, and the combination is not analogous, not complementary, not
warm/cool as the primary logic. The three kinds are now amber / aqua / blurple —
the fallback triad, chosen because it implies no ordering.

**Lightness mixed by function, not by theme.** Pale engraved furniture is what
you touch; the dark lacquered field is what you read. There is no light/dark
switch and no `prefers-color-scheme` block: the instrument commits to one
material world and paints every colour explicitly.

**The surface drifts.** `src/skin.js` pushes three custom properties onto the
root and the stylesheet reads them; it touches neither the physics nor the audio,
and deleting it leaves a working, plain instrument.

- `--drift` runs 0→1 with log length. Console chroma thins from `saturate(1)` to
  `saturate(0.5)` as the pipe outgrows the air it was meant to sound in.
- `--breath` is the pipe's period, **log-compressed**, and the panels breathe at
  it. First implementation clamped the raw period instead and was wrong: it
  pinned at the ceiling from about 4.5 km onward, so the breath stopped tracking
  the pipe across almost the whole range. Since period = 2L/c, log-period is
  log-length shifted by a constant, so mapping drift onto the range is exactly a
  linear map of log-period. Measured across the range: 2.60 → 8.54 → 14.86 →
  19.05 → 24.07 → 26.00 s.
- `--kind` tints the readout window by category.

**Anti-lattice.** Every panel has a different corner cut, no two radii repeat,
metric cards rotate their radii on `nth-child`, and the field is two very large
off-centre pools rather than any pattern. Section numbering is gone: they are
named regions of an instrument (*The pipe*, *The air*, *Where it runs out*)
because you move between them freely rather than in sequence.

**Type.** Averia Gruesa Libre / Averia Sans Libre / Averia Serif Libre / Syne
Mono, all from the fallback stack. All four confirmed loading.

**Verified.** Contrast measured through a canvas rather than eyeballed — the
first probe read OKLCH components as RGB and reported nonsense. Every text pair
clears AA: standfirst 7.79, panel copy 4.68, headings 11.70, readout 14.70, ink
on bone 11.91, chips 6.79–10.06. The rose button needed darkening; white on its
lightest stop was 3.31 and is now 4.70. No page-level horizontal scroll at 1280
or 375, where the table scrolls in its own box. All 116 tests still pass.

**Not verified: the breath in motion.** This browser reports
`prefers-reduced-motion: reduce`, so the animation is correctly suppressed and I
could not watch it. The keyframes are defined, the rule carries the right
duration, and the shadow interpolation was confirmed by driving the same
keyframes directly. **Someone needs to look at it on a machine without
reduced-motion set** and judge whether 2.6–26 s reads as breath or as drift.

**Undone for release.** No favicon. No `README.md` for people arriving at the
repository. Not published — this repo has no remote, and Pages would serve it at
`/unbounded-organ/`, which is already how it resolves locally.

### 2026-08-27 — Codex — interface and copy redesign

Replaced the dark organ-console skin with a compact editorial measurement
console: pale paper, black type, square controls, thin rules, and one rust-red
action colour. The live result remains the only dark surface and keeps the
NOTE/ECHO/DRIFT category colour along its edge. The desktop layout now pairs
related panels in two columns, while the pipe and live readout remain full
width. Mobile collapses to one column with no page-level horizontal overflow.

Rewrote labels, descriptions, state messages, render copy, and score copy in a
shorter operational register. Removed the public links and positioning text for
Planetary Organs from the instrument and explainer; the stamped physics source
and its provenance remain documented because they are still implementation
dependencies.

**Verified.** All 101 tests in `npm test` pass. `test/route.test.js` passes 15/15.
Browser checks at 1265 px and 390 px found no console errors or horizontal page
overflow. At 6,371 km the live state reads DRIFT, the render control changes to
“Render past cutoff,” and the route remains available at 3.61 kHz.

**Undone.** The explainer retains its existing visual design; only its public
Planetary Organs references were removed. The release items above remain open.
