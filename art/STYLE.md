# Constellation illustrations

One line drawing per constellation, shown over the real stars when the viewer turns on
"Illustrationer". `scripts/build-art.mjs` turns the files in this folder into
`src/data/art-data.js`.

## File format

`art/<ID>.svg`, where `<ID>` is the IAU abbreviation (`Ori`, `UMa`, `CVn`, …), in a small
SVG subset (checked by `node scripts/art-tool.mjs preview <ID>`):

- one `<svg viewBox="…">` root; `<g>` without attributes may group paths; comments are fine
- only `<path d="…">` elements, optionally with `class="fine"` for thin detail lines
- path commands `M L C Q Z` only, absolute (upper case); numbers with at most one decimal
- no fills, transforms, styles, text, circles, rects or other elements

## Coordinates

Every illustration has its own flat frame centred on its constellation. Get it with
`node scripts/art-tool.mjs kit <ID>`:

- 10 units = 1 degree near the centre
- x grows to the **west** (right), y grows to the **south** (down)
- in other words: draw the figure exactly as it looks on the sky with north up, east left

The kit lists the stars (with `figure: true` for stick-figure stars), the stick-figure
lines, the boundary and where the neighbouring constellations are.

## Drawing rules

**Build the figure around the stars.** Never move a star. Every figure star should sit on
or inside the drawing, on a fitting part of the body or object. Traditional star names
often say where. Regulus is the lion's heart and Denebola its tail. Aldebaran is the
bull's eye, Antares the scorpion's heart and Deneb the swan's tail. Fomalhaut is the
fish's mouth, Betelgeuse the hunter's shoulder and Rigel his foot. The stick-figure lines
are a guide, not an outline to trace.

**Follow the classical depiction** (Bode, Hevelius, Flamsteed atlases) fitted to the
modern IAU stick figure. For example:

- Leo walks west, with its head in the Sickle.
- Taurus is the front half of a charging bull, horns tipped by Elnath and ζ Tau.
- Ursa Major's long tail is the Big Dipper's handle.
- Cygnus flies along the Milky Way with its neck down to Albireo.
- Scorpius curls its tail to the sting at Shaula.
- Sagittarius is a centaur drawing a bow at Scorpius.
- Pegasus is the front half of a winged horse, upside down.
- Perseus holds Medusa's head at Algol.
- The Gemini twins have their heads at Castor and Pollux.

The modern instrument constellations show their object: Antlia an air pump, Pyxis a ship's
compass, Horologium a pendulum clock, Telescopium a telescope, Microscopium a microscope,
Sextans a sextant, Octans an octant, Circinus a pair of compasses, Norma a set square,
Caelum an engraver's chisel, Fornax a chemical furnace, Sculptor a sculptor's bust on a
stand, Pictor a painter's easel and Mensa a flat-topped mountain. Reticulum is a reticle,
and the two triangles are triangles. Vela, Puppis and Carina are the sail, stern and keel
of the ship Argo.

**Serpens** has two parts, the head (Caput, west) and the tail (Cauda, east). Draw the
snake's head part and its tail part and leave the middle out, where Ophiuchus holds it.
Ophiuchus should hold the snake with his hands near the two gaps. Draw only your own
constellation, never its neighbours.

**Size.** Fill roughly the box around the figure stars (`figureBox` in the kit) plus a
margin of 10–20 %. Stay mostly inside the boundary; limbs, tails and wings may cross it a
little where the figure needs it.

**Style.** Match `art/Ori.svg`:

- Main outlines are clean continuous strokes: silhouettes, limbs, heads and objects. Use
  closed shapes where natural and smooth `C`/`Q` curves; keep straight segments for
  angular objects (instruments, ship parts, triangles).
- Use `class="fine"` for sparse inner detail: eyes, mane, feathers, folds, rigging or
  scales. Keep it to well under half of all strokes.
- About 6–25 main paths, at most about 900 points after flattening (the preview prints
  the count).
- No hatching, shading, text, stars, frames or borders.

## Checking your drawing

```sh
node scripts/art-tool.mjs preview <ID>              # /tmp/stars-art/<ID>.png, with the stick figure
node scripts/art-tool.mjs preview <ID> --no-lines   # how it looks with the lines turned off
node scripts/art-tool.mjs sheet --out /tmp/sheet.png Ori Tau Gem   # several side by side
node scripts/art-tool.mjs pair Car Pup Vel          # neighbours together, in the first one's frame
node scripts/art-tool.mjs clash Sgr                 # where drawings cross their neighbours' drawings
node scripts/art-tool.mjs preview And --file /tmp/candidate.svg     # try a candidate outside art/
```

Neighbouring drawings are shown together on the sky, so they must not draw through each
other (a unit test checks this). Where figures traditionally touch, let them meet cleanly. Ophiuchus
grips the serpent and stands on the Scorpion, and the Cup stands on the Water Snake's back.
Carina, Puppis and Vela together form one ship.

The drawing is done when four things hold:

- it reads at a glance as its subject
- the bright stars sit on the right body parts
- it looks like it belongs with Orion
- it has no stray lines, gaps or tangled curves
