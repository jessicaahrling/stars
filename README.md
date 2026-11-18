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

Appen ligger på **stjärnbilder.se** via GitHub Pages, som visar grenen som den är:
`index.html` och den byggda `dist/`. Filen `CNAME` anger domänen (i sin tekniska form,
`xn--stjrnbilder-n8a.se`), och `.nojekyll` gör att filerna visas oförändrade. Varje push till
grenen syns på sidan efter någon minut, så bygg (`npm run build`) innan du committar.

## Vad som finns

- **Upptäck himlen:** himlen i sina grupper, samma 28 grupper som i Träna. Varje grupp har
  en linje runt sig, en egen svag färg (grannar har aldrig samma färg) och sitt namn i den
  färgen. Stjärnbildernas linjer och namn syns bara i gruppen man pekar på, och i den man
  har valt: ett klick eller tryck på en grupp, eller på dess knapp i panelen, väljer den.
  Då syns också bilderna till alla dess stjärnbilder, och panelen berättar vilka
  stjärnbilder gruppen har och varför de hör ihop. Ett klick till släpper den. Knapparna **Linjer** och **Namn** i verktygsraden visar linjerna och namnen i
  alla grupper på en gång. Man väljer vilka grupper som visas: **Vinterhimlen** (10), de
  som **syns från** orten (18 från Stockholm; en grupp räknas om någon av dess stjärnbilder
  syns därifrån) eller **Alla** (28). Valet är detsamma som listans filter och Överblickens.
  Grupper som är under horisonten just nu står som "nere" eller "delvis uppe" i panelen.
  Under **Gränser** väljer man vilka gränser som ritas: runt varje **grupp** (som från
  början, med färgerna), runt varje **stjärnbild**, eller **Inga**, och knappen Gränser i
  verktygsraden slår av och på samma val. Panelen kan fällas ihop, och "Sluta upptäcka"
  lämnar Upptäck.
- **Överblick:** himlen att titta på, med en enkel panel. **Bilder** slår på och av alla
  bilder på en gång, och man väljer vilka stjärnbilder som visas: **Vinterhimlen**, de som
  **syns från** orten eller **Alla**. Valet är detsamma som listans filter, så listan och
  himlen visar samma stjärnbilder. Ett tryck på en stjärnbild öppnar dess kort, med fakta
  och berättelse, och ett tryck till eller på himlen runt om stänger det. Trycker man på en
  som inte är med säger appen varför. Överblick, Upptäck och Träna är aldrig på samtidigt,
  och var och en behåller sitt läge.
- **Träna:** flashcards med spaced repetition. En stjärnbild visas först med bara sina
  stjärnor (de runtomkring dämpas), alltid lika utzoomad som himlen öppnar, så att den
  syns i sin rätta storlek bland grannarna. Ett tryck på himlen visar linjerna, nästa
  namnet och illustrationen, och ett tredje betyder **Kan för tillfället** (men inte ett
  dubbelklick, så att man hinner se namnet). När namnet visas kan man slå av och på linjerna och
  bilden (knapparna Linjer och Bild, eller tangenterna L och B) för att lära sig formen;
  valet gäller även nästa kort. Under namnet står en kort berättelse om stjärnbilden, som
  kan fällas ihop (på en mobil börjar den hopfälld så att himlen syns). Sedan svarar man
  **Fel**, **Kan för tillfället** eller **Kan permanent** (eller tangenterna 1, 2 och 3;
  mellanslag gör som ett tryck på himlen). Himlen lärs i tre steg: först
  **vinterhimlen** (34 stjärnbilder som syns kl. 22 på vintern från både Stockholm och
  Göteborg, se nedan), sedan de 25 andra som syns från någonstans i Sverige och sist de
  29 som aldrig går upp här; de visas då genom en genomskinlig mark. Inom varje steg
  kommer stjärnbilderna i grupper som hör ihop, genom en gemensam myt, ett mönster som
  sträcker sig över dem eller en klar granne som visar vägen till de andra, och som ligger
  bredvid varandra: 28 grupper om två till fyra, 10 i vinterhimlen, 8 för resten av
  Sverige och 10 för resten (`src/data/chunks-sv.js`). Den första är björnarna vid polen
  (Stora och Lilla björnen och Draken), den andra sagan om Perseus och Andromeda
  (Cassiopeja, Andromeda, Perseus och Cepheus), och varje ny grupp ligger intill en som
  man redan kan. Man går igenom en grupp i taget: dess stjärnbilder visas en efter en,
  och de man missar kommer tillbaka tills man kan alla i gruppen; då kommer nästa grupp
  man inte kan än. De i gruppen man redan kan ligger kvar på himlen, med linjer, bild och
  namn, medan man lär sig nästa. När man kommer till en grupp första gången, väljer den i
  överblicken eller har lärt sig den, visas hela gruppen samtidigt med alla linjer, bilder
  och namn, och varför de hör ihop; ett tryck, mellanslag eller **Fortsätt** går vidare.
  Gränsen runt gruppen, ytterkanten av dess stjärnbilders gränser tillsammans, ritas hela
  tiden man är i den, i alla steg; den säger inget mer än panelen gör, men visar var på
  himlen gruppen ligger. **Gränser** i panelen (eller i raden längst ner, eller tangenten
  `G`) stänger av och sätter på den. När en stjärnbild från en tidigare grupp repeteras är
  det i stället den gruppen som markeras: gränsen går runt den, panelen säger "Repetition
  från grupp …" (gruppens namn först när svaret visas, eftersom namnet ofta avslöjar det)
  och i överblicken är det den raden som är markerad, med "repeteras nu". Panelen visar vilken grupp man är på och hur många i den man kan, och
  var tredje kort är en repetition från en tidigare grupp när någon väntar. När namnet
  visas står under "Om …" varför gruppen hör ihop. Knappen **Grupper** öppnar en överblick
  över alla 28 grupper, steg för steg, med hur långt man kommit i varje, och där kan man
  välja vilken grupp man vill träna på nu (en grupp man redan kan går man igenom en gång
  till) och hur långt man vill gå: bara vinterhimlen (**Vinter**), hela Sverige
  (**Sverige**) eller alla 88 (**Alla**).
  **Milstolpar:** när alla grupper i vinterhimlen är klara, sedan alla i den svenska himlen
  och sist alla 88, firas det: hela steget visas tillsammans på himlen med linjer och namn
  och gränsen runt det, det regnar konfetti (inte om man bett om mindre rörelse), och
  panelen säger vad man nu kan och vad som är nästa steg. Stannade målet vid steget kan man
  gå vidare med en knapptryckning. Varje milstolpe firas en gång och står sedan som ett
  märke under förloppet i Träna, och i överblicken står steget som klart. Därifrån, eller
  direkt från firandet, kan man **öva på** vinterhimlen, svenska himlen eller hela himlen:
  en runda där varje stjärnbild i steget kommer en gång i blandad ordning och en miss kommer
  tillbaka efter tre andra. Svaren räknas som vanligt, och rundan slutar med hur många man
  kunde på första försöket (utan en enda miss blir det konfetti igen). **Sluta öva** går
  tillbaka till gruppen man lär sig.
  Vilan räknas i antal visade kort: ett fel kommer tillbaka efter två andra, "kan för
  tillfället" efter 6, sedan 15, 35 och 80 kort, och "kan permanent" först efter 120 kort.
  Mellan sessionerna kommer korten också tillbaka efter 1, 3, 7 eller 21 dagar (45 dagar
  för permanenta). Står stjärnbilden lågt eller under horisonten blir marken genomskinlig.
  Listan och lagren Linjer, Namn och Illustrationer vilar medan man tränar, eftersom de
  skulle avslöja svaret, och **Gränser** gäller då bara gränsen runt gruppen. Framstegen
  sparas.
- **Titta runt:** dra för att vrida blicken, scrolla eller nyp för att zooma (piltangenter
  och `+`/`−` fungerar också, liksom zoomknapparna, som på smala mobiler ger plats åt
  lägesknapparna eftersom man zoomar med två fingrar där). Projektionen är stereografisk,
  som i ett planetarium, och horisonten hålls vågrät.
- **Realistiska positioner:** stjärnornas lägen räknas om till höjd och azimut för vald ort
  och tid, med precession, och svagare stjärnor bleknar nära horisonten (extinktion).
  Vintergatan ritas ut och skogskanten vid horisonten är lägre åt söder.
- **Plats och tid:** åtta orter från Malmö till Kiruna, valfritt datum och klockslag, och
  tiden kan gå i realtid, 10 min/s eller 1 tim/s.
- **Rikta mot himlen:** på en mobil eller platta finns en kompassknapp längst ner till
  höger. Tryck på den och håll upp telefonen, så vrider sig himlen efter hur du håller den
  och du ser stjärnbilderna där du tittar. Telefonens kompass visar mot magnetisk norr, så
  appen vrider om ungefär 6° till sann norr, och stämmer riktningen ändå inte drar man i
  sidled för att rätta den (rättelsen gäller så länge sidan är öppen); höjden följer
  alltid telefonen. Medan läget är på zoomar en flygning till en stjärnbild, till exempel
  ett nytt kort i Träna, bara, och appen säger åt vilket håll man ska vända telefonen
  ("Vänd telefonen mot sydost, 30° över horisonten"). På iPhone frågar telefonen först om
  lov, och kompassen hittar norr när telefonen lutas bakåt mot himlen en stund. Saknar
  telefonen kompass börjar himlen där den stod och vrider sig med telefonen. När läget
  stängs av medan telefonen pekar ner i marken lyfts vyn upp till himlen. Sensorerna kräver att appen är öppnad som en egen sida över https, till
  exempel via GitHub Pages; visas den inuti en annan sida som inte släpper fram sensorerna,
  säger appen det efter några sekunder.
- **Sikt:** stjärnknappen längst ner till höger öppnar en mätare för hur ljussvaga
  stjärnor som syns. Drar man den ända ner syns bara de allra klaraste (magnitud 1, femton
  stjärnor på hela himlen), och ju högre upp desto fler, ända till alla 5 045 som på en
  mörk himmel på landet. Bredvid mätaren visar staplar hur många stjärnor det finns av varje
  ljusstyrka, tända så långt man har valt, och himlar att välja direkt: mörk himmel på
  landet, förort, stad, mitt i storstan, disigt eller tunna moln och bara de klaraste. Som
  i verkligheten tonar de svagaste stjärnorna som är kvar ut, alla stjärnor blir lite
  svagare i diset, Vintergatan försvinner först, och nära horisonten syns färre. Linjer
  ritas bara mellan stjärnor som syns. I Träna syns kortets egna stjärnor ändå, så att det
  alltid finns något att svara på. Mätaren går också med piltangenterna, Page Up/Down och
  Home/End, och valet sparas.
- **Bara figurstjärnor:** dölj alla stjärnor som inte ingår i någon stjärnbilds figur, så att
  mönstren framträder tydligt (fungerar med och utan linjer).
- **Illustrationer:** en linjeteckning av vad varje stjärnbild föreställer, ritad över de
  verkliga stjärnorna efter de klassiska stjärnatlasernas förebilder. Utanför Upptäck
  och Överblick visar eller döljer ett klick på en stjärnbild på himlen just dess teckning
  (i Upptäck väljer klicket gruppen, och i Överblick öppnar det kortet). Knappen
  "Illustrationer" visar alla, eller döljer alla om någon teckning syns. Markerade stjärnbilder får teckningen i sin
  egen färg.
- **Markera stjärnbilder:** i listan, med rutan framför namnet eller med knappen på
  infokortet. Markerade stjärnbilder får en egen färg på figur, gräns och yta. Listan kan
  filtreras på de stjärnbilder som syns från vald ort, på vinterhimlen eller visa alla 88,
  och den visar vilka som är uppe just nu.
- **Vinterhimlen:** de stjärnbilder där minst halva figuren står 5° eller högre över
  horisonten kl. 22 under minst en månad av vintern (december–februari), sett från både
  Stockholm och Göteborg: 34 stycken. Orion, Oxen, Tvillingarna, Kusken, Stora och Lilla
  hunden, Haren, Lejonet och Vattenormen hör dit, liksom de som aldrig går ned, som Stora
  björnen och Cassiopeja. Herkules är uppe kl. 22 en månad i Stockholm men inte i Göteborg
  och väntar därför till nästa steg. Listan kan visa bara vinterhimlen.
- **Himlen som en stjärnkarta i natten:** himlen är djupt marinblå, nästan svart rakt upp
  och blåare mot horisonten, med svaga, långsamma skiftningar i färg som följer stjärnorna
  (svagare än Vintergatan, så att den går att känna igen) och ett tunt rutnät av
  rektascension och deklination, som blir finare när man zoomar in. De ljusare stjärnorna
  har ett mjukt sken, och de klaraste glimmar med tunna strålar uppåt, nedåt och åt
  sidorna, längre ju klarare stjärnan är. Stjärnbildernas linjer är varmt vita med ett svagt
  sken och går ända in till stjärnorna, och där en figurs linjer sluter sig (Karlavagnens
  skopa, Pegasus kvadrat, Orions kropp: 47 av de 88 har en sådan form) fylls formen med en
  tunn, molnig, rödbrun färg, som en nebulosa bakom linjerna. Fyllningen är starkare och
  lyser lite för den stjärnbild man pekar på, har öppnat kortet för eller tränar på och för
  gruppen man valt i Upptäck; en markerad stjärnbild fylls i sin markerings färg.
  Fyllningen följer linjerna: syns inte en av formens stjärnor (för dålig sikt, för nära
  horisonten, eller Bara figurstjärnor utan den) fylls den inte. Linjer och fyllningar
  fortsätter ut ur bild och ner bakom marken när bara en del av figuren syns, så att de
  inte försvinner när man zoomar in. Illustrationerna ritas i en sval blågrå ton, så att
  figurens egna linjer går att skilja från teckningen. Stjärnornas namn håller sig undan
  stjärnbildernas namn, varandra och helst också figurernas linjer: ett namn som inte får
  plats till höger om sin stjärna sätts ovanför eller till vänster, och annars utelämnas
  det. Ett stjärnbildsnamn som skulle hamna på en av de klaraste stjärnorna flyttas en rad.
- **Design:** knappen "Design" i övre raden byter utseende på knappar och paneler, och på
  namnen på himlen. Från början används **Stjärnatlas**: mörkblått glas med tunna kanter,
  rubriker och stjärnbildsnamn i spärrade versaler i antikva (EB Garamond), stjärnnamn och
  det appen säger i kursiv, en varmvit huvudknapp, och små fyruddiga stjärnor som tänds
  för det som är på. Grupperna i Upptäck har sin färg på himlen som en liten lampa på
  knappen. **Lekfull**, inspirerad av jonasgeografi.se, finns kvar: djupt rymdblått, tjocka
  rundade knappar i fet stil, en gul huvudknapp som ser ut att gå att trycka ner, glada
  pastellfärgade knappar och vita pratbubblor för det appen säger. Dessutom finns Mjukt
  glas och fem i stil med äldre NASA-gränssnitt: Mission Control 1969, Apollo DSKY,
  Bärnstensskärm, NASA 1975 och Checklista. Valet sparas. Den som hade förvalet sparat får
  det nya förvalet; den som själv valt en annan design behåller den.
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

Ritordningen är fyra lager ovanpå varandra: himmel, färgmoln och Vintergatan (WebGL),
rutnät, fyllda former, linjer och stjärnor (2D), marken och skogskanten (WebGL), namn och
väderstreck (2D). De slutna formerna i en figur hittas genom att gå runt varje yta som
linjerna ringar in (`src/sky/faces.js`), och de fylls med ett moln som görs en gång och
sitter fast på himlen vid sin figur: det flyttar sig, vrids och växer med den.

Stjärnbildsgränserna är definierade i B1875-koordinater, där varje kant är en linje med
konstant rektascension eller deklination. Därför avgörs vilken stjärnbild en punkt ligger
i genom att räkna om punkten till B1875 och testa mot gränserna där. Två stjärnbilder som
gränsar till varandra har kanter på samma linje som överlappar, och gränsen runt en grupp
är det som blir kvar av medlemmarnas kanter när de delade bitarna tagits bort
(`src/sky/group-outline.js`).

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
