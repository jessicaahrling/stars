# Källor

Stjärn- och stjärnbildsdatan kommer från [d3-celestial](https://github.com/ofrohn/d3-celestial)
av Olaf Frohn (BSD-3-Clause), version `7e720a3`. `scripts/build-data.mjs` laddar ner filerna
och gör om dem till `src/data/sky-data.js`.

- **Stjärnor** (ljusare än magnitud 6): XHIP, An Extended Hipparcos Compilation;
  Anderson E., Francis C. (2012), VizieR V/137D.
- **Stjärnnamn och beteckningar:** Kostjuk (2002) VizieR IV/27A, Smith (1996) VizieR IV/22,
  m.fl. enligt d3-celestial.
- **Stjärnbildsgränser:** Catalogue of Constellation Boundary Data; Davenhall A.C.,
  Leggett S.K. (1989), VizieR VI/49. IAU:s gränser från Delporte (1930), epok B1875.
- **Stjärnbildsfigurer och namnpositioner:** Olaf Frohn efter IAU.
- **Vintergatan:** Milky Way Outline Catalog, Jose R. Vieira.
- **Svenska namn** på stjärnbilderna: egen sammanställning (`src/data/names-sv.js`).

Mira (ο Ceti) läggs till för hand med magnitud 6,0 eftersom den varierar för mycket för
att finnas med i katalogen men ingår i Valfiskens figur.

Illustrationerna i `art/` är ritade för det här projektet efter de klassiska
stjärnatlasernas motiv (Bode, Hevelius, Flamsteed) och följer projektets licens.

Formler: Jean Meeus, *Astronomical Algorithms* (siderisk tid kap. 12, precession kap. 21).

Typsnitt: Jost och EB Garamond från Google Fonts (SIL Open Font License).
