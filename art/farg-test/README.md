# Färgbilder, test

Five test drawings in the style of the star maps in the chapter "En rymdresa": cartoon
figures built straight on the stick-figure lines, in flat colours with dark outlines, as
vector graphics in the same frame as the line drawings in `art/` (10 units = 1 degree,
x west/right, y south/down; see `art/STYLE.md`). Every figure star sits on the part of the
figure it belongs to:

- **UMi, Lilla björnen:** a little bear hanging upside down by its tail; the bowl is its
  body (paws on η and Kochab, head by Pherkad), the handle its tail, Polstjärnan the tip.
- **Aur, Kusken:** the coachman lets his horse wear his party hat. The hexagon is the
  horse's head (nostril at Hassaleh, chin at Elnath), the triangle Menkalinan–δ–Capella
  the hat, and a tiny singer on ε–ζ sings a cappella by Capella.
- **Leo, Lejonet:** a proud lion walking west, its head in the Sickle (brow at Rasalas,
  nose at Algenubi), Denebola the tuft of its tail and Regulus the paw on the rule book.
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
