# The Unbounded Organ

An organ model with no range restriction. One waveguide specification is
evaluated at any pipe length from 8.575 mm to Earth's circumference, and
rendered at whatever rate it produces.

The specification never adapts. What changes across that range is the category
of the output: a note at metres, an echo at tens of kilometres, a drift at
planetary radius.

The instrument runs in the browser with no build step and no dependencies.
[`explainer.html`](explainer.html) is a standalone reading document covering the
acoustic physics, the waveguide signal processing, and the psychoacoustic
boundaries the piece is built on.

## The drift

A pipe's fundamental falls as its length grows:

    f1 = c / (2L)   open
    f1 = c / (4L)   stopped

- **Metres**, f₁ at or above 20 Hz. Modes are sparse and in the audible
  spectrum. The output is a note.
- **Kilometres**, f₁ below 20 Hz down to millihertz. Mode density reaches
  millions of partials below Nyquist, the pitch percept disappears, and the
  delay reflections read as a diffuse echo.
- **Planetary radius**, 6,371 km, f₁ = 26.92 µHz, period 10.32 hours. A single
  cycle spans hours. The output is a continuous drift.

The resonator is a digital waveguide: a delay line of 2L/c whose reflection
signs produce the mode series rather than being told it. An additive build
would have to truncate the series at some partial count, and that truncation
would be an authored choice standing in for the physics.

## The rank

A second view puts several pipes in the air at once. Its roll runs pipe length
up the vertical axis on a logarithmic scale rather than pitch, because a pitch
axis would quietly restore the range restriction the instrument is named for:
past the hearing floor there is no note to place on one. Length stays meaningful
across the whole range, so a common transposition is a rigid shift of the whole
rank and the roll says how many voices it throws out of hearing.

Polyphony is paid for in range. Every voice needs its own delay line, and the
1 GiB allocation ceiling is a ceiling on their sum, so the exchange rate is
exact: at 48 kHz one pipe reaches 479.5 km, and eight pipes of equal length
reach 59.9 km each. Mixed registers cost far less than that suggests — a metre
of pipe beside a kilometre of pipe is nearly free — and the roll shades the
region the pool can no longer afford.

## What the model does not do

The atmosphere panel is reported but never read by the audio path. A waveguide
models a tube, not the air around it, so above the acoustic cutoff the
instrument will render a note that the medium would not in fact carry. The
interface names the override when the fundamental falls below the cutoff; it
does not suppress the render.

## Running it

The instrument uses browser-native ES modules, which a browser will not load
over `file://`. Serve the repository root over HTTP and open it:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Tests

Ten suites: 159 counted checks across seven of them, and three more that
assert directly. No test framework and no dependencies; the suites are plain ES
modules. Verified on Node 20.10.

```bash
npm test
```

## Layout

| File | What it holds |
|---|---|
| `index.html` | The instrument |
| `explainer.html` | Standalone document on the physics, signal processing, and psychoacoustics |
| `src/physics.js` | Thresholds, pipe fundamentals, regime bounds. Pure; no DOM |
| `src/waveguide.js` | 1D delay-line resonator with boundary reflection signs (+1 open, −1 stopped) and labelled excitations |
| `src/interpolator.js` | Fractional delay interpolators (linear, 3rd-order Lagrange, 1st-order Thiran allpass); measures phase delay and reports mode inharmonicity |
| `src/digital_medium.js` | Nyquist limit, state memory allocation, highest represented mode, 4 GiB WAV boundary |
| `src/wav.js` | WAV builder for 16-bit PCM, 24-bit PCM, and 32-bit float, with the 4 GiB cap enforced |
| `src/render.js` | Offline chunked renderer with progress events and cancellation |
| `src/atmospheres.js` | Atmosphere presets: Earth, plus parametric gas calculations |
| `src/format.js` | Formatting for frequencies, periods, lengths, and byte sizes |
| `src/score.js` | Markdown composition score generator |
| `src/skin.js` | Pushes `--drift`, `--breath`, and `--kind` onto the root element. Touches neither physics nor audio; deleting it leaves a plain instrument |
| `src/scale-view.js` | Size comparison against dimensioned reference objects on a shared vertical scale |
| `src/polyphony.js` | The delay-line pool as a budget on the sum rather than on each voice, the set-level regime report, common transposition, and the render route for a rank |
| `src/roll-view.js` | The rank roll. Vertical axis is pipe length on a log scale, not pitch |
| `src/rank-panel.js` | Rank view state, presets, and its own render |
| `src/tube-view.js` | Shaded tube with the fundamental's pressure envelope, drawn in the audible regime only |
| `src/app.js` | UI state, event wiring, render coordination |
| `test/*.test.js` | Physics, waveguide mode structure, interpolators, WAV encoder, offline render, and render routing |

Rendered audio is not committed. The instrument writes multi-hundred-megabyte
WAVs by design, and they are reproducible from the score.

## License

MIT. See [LICENSE](LICENSE).
