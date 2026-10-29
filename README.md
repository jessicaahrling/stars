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

- **Upptäck himlen:** himlen börjar med bara Stora björnen. Grannarna står utsatta med ett
  plus framför namnet, och man lägger till en i taget genom att klicka på den på himlen
  eller i panelen. Sedan erbjuds grannarna till alla man har hittat, tills man har alla
  som syns från vald ort, och därefter resten av himlen om man vill. Bara stjärnbilderna
  man har hittat visas, med sina stjärnor, linjer och namn. Grannar som är under
  horisonten just nu står som "nere" i panelen, och "Fortsätt med resten av himlen" gör
  marken genomskinlig eftersom de stjärnbilderna aldrig går upp här. Panelen kan fällas
  ihop. "Visa hela himlen" visar allt igen och knappen "Upptäck" går tillbaka dit man var.
  "Börja om" tar två tryck.
- **Träna:** flashcards med spaced repetition. En stjärnbild visas först med bara sina
  stjärnor (de runtomkring dämpas), ett tryck visar linjerna och nästa namnet och
  illustrationen. När namnet visas kan man slå av och på linjerna och bilden (knapparna
  Linjer och Bild, eller tangenterna L och B) för att lära sig formen; valet gäller även
  nästa kort. Under namnet står en kort berättelse om stjärnbilden, som kan fällas ihop
  (på en mobil börjar den hopfälld så att himlen syns). Sedan svarar man **Fel**, **Kan
  för tillfället** eller **Kan permanent** (eller tangenterna 1, 2 och 3; mellanslag visar
  nästa steg). Man börjar med fyra, Stora björnen, Cassiopeja, Orion och Svanen, och två
  nya kommer in så fort inget kort väntar på repetition (ett fel som vilar räknas inte),
  tills man kan alla som syns från vald ort. Överst i panelen väljer man om det är alla
  som syns någon gång under året (**Hela året**) eller bara de som syns på vinterkvällar
  (**Vinterkvällar**, se nedan).
  Vilan räknas i antal visade kort: ett fel kommer tillbaka efter två andra, "kan för
  tillfället" efter 6, sedan 15, 35 och 80 kort, och "kan permanent" först efter 120 kort.
  Mellan sessionerna kommer korten också tillbaka efter 1, 3, 7 eller 21 dagar (45 dagar
  för permanenta). Står stjärnbilden lågt eller under horisonten blir marken genomskinlig.
  Listan och lagren Linjer, Namn, Gränser och Illustrationer vilar medan man tränar,
  eftersom de skulle avslöja svaret. Framstegen sparas.
- **Titta runt:** dra för att vrida blicken, scrolla eller nyp för att zooma (piltangenter
  och `+`/`−` fungerar också). Projektionen är stereografisk, som i ett planetarium, och
  horisonten hålls vågrät.
- **Realistiska positioner:** stjärnornas lägen räknas om till höjd och azimut för vald ort
  och tid, med precession, och svagare stjärnor bleknar nära horisonten (extinktion).
  Vintergatan ritas ut och skogskanten vid horisonten är lägre åt söder.
- **Plats och tid:** åtta orter från Malmö till Kiruna, valfritt datum och klockslag, och
  tiden kan gå i realtid, 10 min/s eller 1 tim/s.
- **Bara figurstjärnor:** dölj alla stjärnor som inte ingår i någon stjärnbilds figur, så att
  mönstren framträder tydligt (fungerar med och utan linjer).
- **Illustrationer:** en linjeteckning av vad varje stjärnbild föreställer, ritad över de
  verkliga stjärnorna efter de klassiska stjärnatlasernas förebilder. Klicka på en
  stjärnbild på himlen för att visa eller dölja just dess teckning. Knappen
  "Illustrationer" visar alla, eller döljer alla om någon teckning syns. Markerade stjärnbilder får teckningen i sin
  egen färg.
- **Markera stjärnbilder:** i listan, med rutan framför namnet eller med knappen på
  infokortet. Markerade stjärnbilder får en egen färg på figur, gräns och yta. Listan kan
  filtreras på de stjärnbilder som syns från vald ort, på dem som syns på vinterkvällar
  eller visa alla 88, och den visar vilka som är uppe just nu.
- **Vinterkvällar:** de stjärnbilder där minst halva figuren står 5° eller högre över
  horisonten någon gång mellan kl. 18 och midnatt under december–februari, räknat för vald
  ort. Från Stockholm är det 48 av de 57 som syns någon gång under året. De som fattas är
  sommarens Skorpionen, Skytten, Ormbäraren och Vågen och de som bara når strax över
  horisonten i söder: Södra fisken, Ugnen, Bildhuggaren, Akterskeppet och Kompassen.
  "Syns från vald ort" (Hela året) räknar alla vars figur över huvud taget går upp där.
- **Design:** knappen "Design" i övre raden byter utseende på knappar och paneler.
  Förutom det nuvarande finns fem designer i stil med äldre NASA-gränssnitt: Mission
  Control 1969, Apollo DSKY, Bärnstensskärm, NASA 1975 och Checklista. Valet sparas.
- **Infokort:** välj en stjärnbild i listan så vänder sig vyn dit och ett kort visar var
  den står nu, när den går upp, står högst och går ner, om den är cirkumpolär, vilken
  månad den står högst på kvällen och dess ljusstarkaste stjärna.
- **Berättelser:** en kort text om var och en av de 88 stjärnbilderna: vilken mytologi
  eller vilken astronom den kommer från, vem eller vad den föreställer och vad som är
  speciellt med den, som klara stjärnor, galaxer och stjärnhopar. Den står på infokortet
  och under namnet när man tränar. Texterna är skrivna för appen och faktagranskade, och
  stjärnnamnen är desamma som på himlen i appen (`src/data/stories-sv.js`).

Inställningar och markeringar sparas i webbläsaren.

## Kod

```
src/astro/      tid, precession, höjd/azimut, synlighet (ren matematik, testad)
src/sky/        stjärnkatalog, stjärnbildsgränser och grannar, kamera och projektion
src/render/     WebGL (himmel, Vintergatan, mark) och 2D-canvas (stjärnor, linjer, namn)
src/ui/         listan, infokortet, plats/tid-panelen, upptäck-panelen, designlistan, gester
src/themes/     designerna, en stilmall per design
src/data/       svenska namn, berättelser, orter och genererad stjärn- och bilddata
art/            illustrationerna, en SVG per stjärnbild (se art/STYLE.md)
scripts/        bygge, datagenerering och verktyg för illustrationerna och designerna
test/           enhetstester (node --test) och ett webbläsartest (Playwright)
```

Ritordningen är fyra lager ovanpå varandra: himmel och Vintergatan (WebGL), stjärnor och
linjer (2D), marken och skogskanten (WebGL), namn och väderstreck (2D).

Stjärnbildsgränserna är definierade i B1875-koordinater, där varje kant är en linje med
konstant rektascension eller deklination. Därför avgörs vilken stjärnbild en punkt ligger
i genom att räkna om punkten till B1875 och testa mot gränserna där.

Illustrationerna ritas i ett eget koordinatsystem per stjärnbild, en stereografisk
projektion kring stjärnbildens mitt med norr uppåt (se `src/sky/art-frame.js`). Vid
bygget plattas kurvorna ut till linjer, och appen räknar om dem till riktningar på himlen
så att de följer stjärnorna exakt i alla vyer.

```sh
node scripts/art-tool.mjs preview Ori   # förhandsvisa en illustration över sina stjärnor
node scripts/theme-shots.mjs crt        # skärmbilder av en design i de viktigaste lägena
npm run art                             # src/data/art-data.js från art/*.svg (ingår i npm run build)
npm test           # enhetstester
npm run test:e2e   # bygger och kör webbläsartestet i Chromium
npm run data       # genererar src/data/sky-data.js från källdatan på nytt
```

## Källor

Se [CREDITS.md](CREDITS.md).
