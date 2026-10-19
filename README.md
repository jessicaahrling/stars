# Stjärnhimlen

Ett spel för att lära sig stjärnbilderna på den svenska natthimlen. Första steget är
en himmelsvy man kan titta runt i: stjärnorna och de 88 stjärnbilderna står där de
verkligen står, sett från en svensk ort vid en viss tidpunkt, och man kan markera
stjärnbilder för att se deras figurer och gränser.

## Köra

```sh
npm install
npm run dev      # utvecklingsserver med automatisk omladdning, http://localhost:8080
npm run build    # bygger dist/stjarnhimlen.js och dist/stjarnhimlen-fristaende.html
```

`index.html` fungerar också genom att bara dubbelklicka på den (efter `npm run build`),
och `dist/stjarnhimlen-fristaende.html` är en enda fil som går att skicka till någon.

## Vad som finns

- **Titta runt:** dra för att vrida blicken, scrolla eller nyp för att zooma (piltangenter
  och `+`/`−` fungerar också). Projektionen är stereografisk, som i ett planetarium, och
  horisonten hålls vågrät.
- **Realistiska positioner:** stjärnornas lägen räknas om till höjd och azimut för vald ort
  och tid, med precession, och svagare stjärnor bleknar nära horisonten (extinktion).
  Vintergatan ritas ut och skogskanten vid horisonten är lägre åt söder.
- **Plats och tid:** åtta orter från Malmö till Kiruna, valfritt datum och klockslag, och
  tiden kan gå i realtid, 10 min/s eller 1 tim/s.
- **Markera stjärnbilder:** klicka på himlen eller i listan. Markerade stjärnbilder får
  en egen färg på figur, gräns och yta. Listan kan filtreras på de stjärnbilder som syns
  från vald ort och visar vilka som är uppe just nu.
- **Infokort:** var stjärnbilden står nu, när den går upp, står högst och går ner, om den
  är cirkumpolär, vilken månad den står högst på kvällen och dess ljusstarkaste stjärna.

Inställningar och markeringar sparas i webbläsaren.

## Kod

```
src/astro/      tid, precession, höjd/azimut, synlighet (ren matematik, testad)
src/sky/        stjärnkatalog, stjärnbildsgränser, kamera och projektion
src/render/     WebGL (himmel, Vintergatan, mark) och 2D-canvas (stjärnor, linjer, namn)
src/ui/         listan, infokortet, plats/tid-panelen, gester
src/data/       svenska namn, orter och genererad stjärndata
scripts/        bygge och datagenerering
test/           enhetstester (node --test) och ett webbläsartest (Playwright)
```

Ritordningen är fyra lager ovanpå varandra: himmel och Vintergatan (WebGL), stjärnor och
linjer (2D), marken och skogskanten (WebGL), namn och väderstreck (2D).

Stjärnbildsgränserna är definierade i B1875-koordinater, där varje kant är en linje med
konstant rektascension eller deklination. Därför avgörs vilken stjärnbild en punkt ligger
i genom att räkna om punkten till B1875 och testa mot gränserna där.

```sh
npm test           # enhetstester
npm run test:e2e   # bygger och kör webbläsartestet i Chromium
npm run data       # genererar src/data/sky-data.js från källdatan på nytt
```

## Källor

Se [CREDITS.md](CREDITS.md).
