# glyphstage

**Live Demo:** [berrf35.github.io/glyphstage](https://berrf35.github.io/glyphstage/)

Real-time WebGL2 procedural 3D art studio combining **60 raymarched & simulated worlds** (including a true incompressible Navier-Stokes fluid solver), **10 ASCII & text-mode engines**, and **21 non-ASCII artistic media** spanning oil paint, wet-on-wet watercolor, coherent ink, surface-stable fractal dithering, physical CRT/VHS, XY vector oscilloscope, stained glass, glitch pixel sorting, and thin-film wave optics.

Every world, live simulation, dropped image/video, or webcam stream can be rendered through any medium at 60+ fps.

## Artistic Rendering Media (8 Families · 31 Looks)

- **ASCII & Text-Mode (10)** — Effulgence 3D, Alex Harri 6D Shape Match, DoG + Sobel Edge, Braille 2×4, Dual-Color ANSI Half-Block, Play.core, Phosphor CRT, ANSI Blocks, Woodcut Hatch, Katakana Cascade *(with 5 fonts, custom ramps, 64-char phrase weaving, and 10 palettes)*
- **Painterly & Pigment**
  - **Anisotropic Kuwahara Oil** — Kyprianidis half-ellipse 8-sector polynomial filter with depth-modulated brush radius and directional impasto
  - **Wet-on-Wet Watercolor** — Bousseau pigment-density backruns, Gooch warm/cool toning, turbulent wash wobble, cold-press cotton grain, and Kubelka-Munk spectral pigment mixing
- **Ink, Hatch & Plotter**
  - **Coherent Ink (ETF + FDoG / XDoG)** — Kang et al. bilateral Edge Tangent Flow, perpendicular CIELAB DoG, streamline blur, soft `tanh` thresholding, depth contours, and colored pencil / blueprint modes
  - **LIC Charcoal & Woodcut** — Cabral & Leedom Line Integral Convolution along bilateral ETF streamlines
  - **Tonal Art Map Hatch** — Praun et al. 6-tier strictly nested pen-stroke `TEXTURE_2D_ARRAY` with custom non-blurry stroke mipmaps
  - **FM Plotter Squiggle** — 60 fps GPU Hillis-Steele horizontal phase-integral sine waves + AxiDraw SVG export
  - **Topographic Isolines** — `fwidth`-normalized analytical luminance & depth contours
- **Print & Dithering**
  - **Dither3D Fractal Stipple** — RuneVision `64×64×16` 3D recursive Bayer radial volume, inverse-CDF calibration ramp, exact 2×2 Jacobian SVD, and 4-angle CMYK fractal screens
  - **GPU Error Diffusion (Obra Dinn)** — Brent Werness 9-phase `3×3` modulo ping-pong symmetrized Atkinson, Gaussian, and anisotropic woodcut hatching kernels
  - **CMYK & Spider-Verse Halftone** — `15°/75°/0°/45°` rosette screens with depth-driven plate misregistration and highlight-hatch / shadow-Ben-Day split
  - **Risograph Spot Overprint** — Stochastic blue-noise grain across 3 fluorescent soy-ink drums with Kubelka-Munk overprinting
- **Analog & Vector CRT**
  - **Physical Lottes CRT** — Linear-light 3-line Gaussian beam focus, halation, barrel warp, and all 4 physical shadow/aperture masks
  - **Composite NTSC & VHS** — 2-pass 3.58 MHz YIQ subcarrier modulation, chroma crawl, asymmetric I/Q filtering, VHS head-switching bottom curl, and damped-cosine snow streaks
  - **XY Vector Oscilloscope** — Analytical Abramowitz & Stegun `erf(x)` Gaussian electron beam integral (`woscope`) with velocity-dependent intensity and corner dwell hotspots
  - **Rutt-Etra Video Synth** — 3D luminance-displaced scanline ribbons with depth-tested dark occlusion skirts
- **Mosaics & Stipple**
  - **JFA Stained Glass** — $O(\log N)$ Jump Flooding Voronoi with beveled lead cames and backlit caustics
  - **Byzantine Edge Mosaic** — Alejo Hausner ETF-aligned $L_1$ Manhattan tesserae with ceramic glaze & mortar
  - **Voronoi Stipple** — Darkness-weighted Voronoi stippling + 2-Opt TSP single-line plotter SVG export
- **Glitch & 3D Pixel**
  - **Threshold Pixel Sort** — WebGL2 Masked Odd-Even transposition ping-pong sorting with hash-jittered span bounds
  - **Temporal Slit-Scan** — 64-slice `TEXTURE_2D_ARRAY` ring buffer with 4 time-delay geometries & chromatic lag
  - **3D Pixel Art & Clash** — OKLab hue-shifted posterization + convex/concave 1px outlines, ZX Spectrum `8×8` 2-color Attribute Clash, Game Boy DMG, and PICO-8
- **Physical Optics**
  - **Thin-Film Airy Optics** — `128×128` 2D `(cosθ, thickness nm)` 64-wavelength polarized Airy interference CIE XYZ LUT (Oil Slick, Soap Bubble, Bismuth Crystal, Anodized Alloy)

## World Library (60 Worlds · 10 Collections)

- **Architecture (6)** — Effulgence Citadel, Gothic Nave, Brutalist Megacity, Torii Mirror Lake, Escher Stairwell, Oculus Rotunda
- **Fractals (6)** — Mandelbulb 8, Apollonian Gasket, Menger Labyrinth, Quaternion Julia 4D, Kali Fractal Land, Sierpinski Reliquary
- **Cosmos & Sci-Fi (6)** — Gargantua, Dyson Ringworld, Saturn & Cassini, Cogmind Reactor, Volumetric Nebula, Hyperspace Tunnel
- **Nature & Biomes (6)** — Ridge Lines, Night Swell, Abyssal Medusa, Boiling Caldera, Ice Cavern, Spore Grove
- **Topology & Math (6)** — Gyroid Vault, Trefoil Chrome, Mercury Blobs, Double Helix, Clockwork Orrery, Poincaré Disk
- **Kinetic & Play.core (6)** — Wave Interference, Chladni Plate, Moiré Explorer, Penrose Quasicrystal, Doom Plasma Flame, 3D Extruded Type
- **Demoscene & Retro (6)** — a1k0n Donut, Outrun Horizon, Circuit Monolith, Truchet Conduit, Voxel Valley, Digital Rain 3D
- **ASCII Games & Worlds (6)** — Torchlit Dungeon, Obsidian Ziggurat, Orbital Monolith, Haunted Halls, Sunken Coral Atoll, Clockwork Foundry
- **4D, Chaos & Generative (6)** — 4D Tesseract, Polar Auroras, Kleinian Vaults, Star Nest, Turing Morphogenesis, Hopf Fibration
- **Interactive Sim Lab (6)** — Gray-Scott Coral, **Incompressible Navier-Stokes Fluid** (`curl → vorticity → divergence → 16× Jacobi pressure → projection → advection`), Conway Life 2×, Ripple Tank PDE, Physarum Slime, Cellular Doom Fire *(drag directly on canvas to stir & paint)*

Plus **Media Mode** for dropped images/videos (with timeline scrub), clipboard paste (`Ctrl+V`), relief studies, and live webcam input.

## Exports & Studio Tools

- **Visual & Motion**: Live / 2× Hi-Res PNG, WebM / MP4 motion video recording (`4s` / `8s` / `15s` / `Manual`)
- **Terminal & Web**: 24-bit TrueColor ANSI (`.ans` & copy), Plain Text (`.txt`), Colored HTML, Embed Snippet, ASCII Grid SVG
- **AxiDraw Pen-Plotter Vector SVG**: FM Squiggle Waves, 2-Opt Untangled Single-Line TSP, Weighted Voronoi Stipple Dots, and Marching-Squares Topographic Isolines
- **Live Tools**: Built-in Web Audio Synth & Mic FFT reactivity, Live GLSL Shader Editor (`E`), Showcase Auto-Tour (`T`), Undo/Redo, and Shareable URL Hash Presets (e.g. `#w=fluid&m=kuwahara`, `#w=torii&m=watercolor`, `#w=citadel&m=ruttetra`)

## Shortcuts

- **Drag** — Orbit 3D camera (or stir/paint on Sim Lab worlds)
- **Pinch / Scroll** — Zoom
- **Double-click / `R`** — Reset camera
- **`WASD` / Arrows** — 3D free-fly
- **Click / `X`** — Glyph shatter burst & shockwave
- **`G`** — 60-world visual gallery
- **`K` / `Cmd+K`** — Command palette (search all worlds, media, styles, exports)
- **`E`** — Live GLSL shader editor
- **`T`** — Showcase auto-tour
- **`[` / `]`** / **`N`** — Step / shuffle worlds
- **`Space`** — Pause / resume
- **`H`** — Fullscreen stage (hide UI)

## Development

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

## Project Layout

```text
src/
├── components/             # TopBar, StageCanvas, Inspector, WorldBrowser, ShaderEditor, ExportDialog, CommandPalette
├── engine/
│   ├── audio/              # Web Audio synth sequencer & live microphone FFT
│   ├── export/             # Text/ANSI/HTML/SVG samplers, AxiDraw plotter SVGs, PNG & WebM/MP4 capture
│   ├── presets/            # 60 worlds, 23 media specs, 10 ASCII styles, 5 fonts, 10 palettes, URL hash codec
│   ├── shaders/
│   │   ├── media/          # Primitives (ETF/JFA/Prefix), Painterly, Ink, Print, Analog, Tessellation, Glitch/Optics
│   │   └── worlds/         # 60 modular GLSL 300 es worlds & stateful PDE simulations
│   └── webgl/              # Core pipeline, MediaRenderEngine, NavierStokesFluidSolver, physical LUT generators
├── hooks/                  # Studio state (undo/redo/hash sync), media input, keyboard shortcuts
├── styles/                 # Darkroom tokens, native sliders & dialogs
└── types/                  # Domain types
tests/                      # Vitest suites (presets, shaders, LUT physics, plotter SVGs, text/6D sampler)
```
