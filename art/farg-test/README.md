# Färgbilder, test

Five test drawings in the style of the star maps in the chapter "En rymdresa": cartoon
figures that follow the stick-figure lines exactly, in flat colours with dark outlines, as
vector graphics in the same frame as the line drawings in `art/` (10 units = 1 degree,
x west/right, y south/down; see `art/STYLE.md`). The outlines are polygons with their
corners at the stars, so that every line is an edge of the figure, and limbs and tails are
straight strips along the lines with their joints at the stars. Only details inside the
figure (faces, manes, stripes) are drawn freely.

- **UMi, Lilla björnen:** a little bear hanging upside down by its tail; the bowl is its
  body (paws on η and Kochab, head by Pherkad), the handle its tail, Polstjärnan the tip.
- **Aur, Kusken:** the coachman lets his horse wear his party hat. The hexagon is the
  horse's head (nostril by Hassaleh, mouth by Elnath), the triangle Menkalinan–δ–Capella
  the hat, Capella–ε–ζ an ear, and a tiny singer sings a cappella by Capella.
- **Leo, Lejonet:** a proud lion walking west: the body Regulus–η–Algieba–Zosma–Chertan,
  the tail the triangle Zosma–Denebola–Chertan with its tuft at Denebola, the mane and face
  along the Sickle (brow at Rasalas, nose at Algenubi), Regulus the paw on the rule book.
- **Gem, Tvillingarna:** two twins in green suits, heads at Castor (the pastor) and Pollux
  (allergic to pollen), their limbs along the lines.
- **Boo, Björnvaktaren:** the bear keeper with a big nose and moustache: the kite is his
  head and shirt, Arcturus the lucky coin, and λ–κ–θ the ice cream he holds up.

They are made by `node scripts/farg-test.mjs` (shapes anchored on the star coordinates,
with the helpers in `scripts/lib/farg-kit.mjs`) and can be looked at over their stars with
`node scripts/farg-preview.mjs <ID> art/farg-test/<ID>.svg out.png [--no-lines]`.

They are not in the app yet: `scripts/build-art.mjs` only reads `art/*.svg`, and the app
draws illustrations as lines. Showing these on the sky needs fills and colours in the
drawing and in the art data.
