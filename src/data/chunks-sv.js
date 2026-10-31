// The groups "Träna" brings constellations in by (see src/sky/curriculum.js), in learning
// order: first the winter sky at ten (stage 1), then the rest seen from Sweden (2), then
// the rest (3). The members of a group border each other and belong together by a shared
// story, a pattern that spans them or a bright neighbour that leads to the others; the
// reason says how. Each group lies next to ones learnt before it, and its members are
// listed in the order they come in, the easiest first. Designed and fact-checked against
// the stories in stories-sv.js and the sky itself.
export const CHUNKS = [
  {
    stage: 1,
    name: "Björnarna vid polen",
    reason: "Karlavagnen hör till Stora björnen, och dess två bakre stjärnor pekar mot Polstjärnan längst ut i Lilla björnens svans. Draken ringlar sig mellan de två björnarna.",
    members: ["UMa", "UMi", "Dra"],
  },
  {
    stage: 1,
    name: "Perseus räddar Andromeda",
    reason: "Drottning Cassiopeja, prinsessan Andromeda, hjälten Perseus och kung Cepheus hör till samma saga. Börja med Cassiopejas W, mitt emot Karlavagnen på andra sidan Polstjärnan.",
    members: ["Cas", "And", "Per", "Cep"],
  },
  {
    stage: 1,
    name: "Över havet på djurens rygg",
    reason: "Oxen simmade över havet med Europa på ryggen, och Väduren bar Frixos och Helle genom luften. Leta efter Plejaderna i Oxen och den lilla Triangeln mellan Andromeda och Väduren.",
    members: ["Tau", "Ari", "Tri"],
  },
  {
    stage: 1,
    name: "Jägaren Orion",
    reason: "Orions bälte pekar snett uppåt mot Aldebaran i Oxen och snett nedåt mot Sirius i Stora hunden, som jagar Haren vid jägarens fötter. Floden Eridanus börjar vid klara Rigel.",
    members: ["Ori", "CMa", "Lep", "Eri"],
  },
  {
    stage: 1,
    name: "Vinterns klara båge",
    reason: "En båge av klara stjärnor går från Capella i Kusken via Castor och Pollux i Tvillingarna ner till Procyon i Lilla hunden. Enhörningen gömmer sig mellan Orions två hundar.",
    members: ["Aur", "Gem", "CMi", "Mon"],
  },
  {
    stage: 1,
    name: "Herakles fiender",
    reason: "Följ Karlavagnens två bakre stjärnor bort från Polstjärnan till Lejonet. Herakles kämpade mot Lejonet, Vattenormen och Kräftan, och Sextanten ligger mellan Lejonet och Vattenormen.",
    members: ["Leo", "Cnc", "Hya", "Sex"],
  },
  {
    stage: 1,
    name: "Björnvaktaren och hundarna",
    reason: "Följ bågen i Karlavagnens skaft till klara Arcturus i Björnvaktaren. Han håller Jakthundarna i koppel under skaftet, och Berenikes hår ligger mellan Arcturus och Lejonets svans.",
    members: ["Boo", "CVn", "Com"],
  },
  {
    stage: 1,
    name: "Svanen och Lyran",
    reason: "Deneb i Svanen och Vega i Lyran hör till Sommartriangeln. En vinterkväll vid tiotiden står de ganska lågt i nordväst och norr. Ödlan ligger inklämd mellan Svanen och Andromeda.",
    members: ["Cyg", "Lyr", "Lac"],
  },
  {
    stage: 1,
    name: "Pegasus och havsdjuren",
    reason: "Pegasus stora kvadrat delar ett hörn med Andromeda. Under kvadraten ligger Fiskarnas svaga ring, och längre ner lurar Valfisken, odjuret ur sagan om Andromeda.",
    members: ["Peg", "Psc", "Cet"],
  },
  {
    stage: 1,
    name: "Gömda djur kring björnen",
    reason: "Runt Stora björnen gömmer sig tre svaga djur: Lodjuret, Lilla lejonet och Giraffen. Hevelius skrev att man behöver ögon som ett lodjur för att se Lodjuret.",
    members: ["Lyn", "LMi", "Cam"],
  },
  {
    stage: 2,
    name: "Jungfrun och korpen som ljög",
    reason: "Fortsätt bågen förbi Arcturus ner till Spica i Jungfrun. Sydväst om Spica sitter Korpen och längre västerut Bägaren, på Vattenormens rygg, ur sagan om korpen som ljög.",
    members: ["Vir", "Crv", "Crt"],
  },
  {
    stage: 2,
    name: "Kronan, hjälten och läkaren",
    reason: "Norra kronan och Herkules ligger mellan Arcturus och Vega. Herkules står huvud mot huvud med Ormbäraren, läkaren Asklepios, som håller Ormen med huvudet mot kronan.",
    members: ["CrB", "Her", "Oph", "Ser"],
  },
  {
    stage: 2,
    name: "Örnen och Pilen",
    reason: "Altair i Örnen bildar Sommartriangeln med Vega och Deneb. Strax ovanför flyger Pilen, som Herakles i en saga sköt mot örnen som åt av Prometheus lever, och Skölden ligger nedanför.",
    members: ["Aql", "Sge", "Sct"],
  },
  {
    stage: 2,
    name: "Skorpionen och Skytten",
    reason: "Skorpionen som stack Orion syns från Sverige bara lågt i söder sommartid, med röda Antares som hjärta. Skytten siktar mot hjärtat, och Vågen var för grekerna Skorpionens klor.",
    members: ["Sco", "Sgr", "Lib"],
  },
  {
    stage: 2,
    name: "Tre små djur",
    reason: "Mellan Svanen, Örnen och Pegasus ligger tre små djur: Delfinen, Lilla hästen, som sticker fram huvudet vid Pegasus, och Räven med en gås i munnen.",
    members: ["Del", "Equ", "Vul"],
  },
  {
    stage: 2,
    name: "Vattumannens kruka",
    reason: "Vattumannen är ofta Ganymedes, som Örnen i en saga rövade bort, och han häller vatten ur sin kruka. Bredvid ligger Stenbocken, halvt get och halvt fisk, och under den Mikroskopet.",
    members: ["Aqr", "Cap", "Mic"],
  },
  {
    stage: 2,
    name: "Fisken som dricker ur krukan",
    reason: "Södra fisken dricker ur Vattumannens kruka, och i fiskens mun lyser Fomalhaut ensam, mycket lågt i söder. Österut, under Valfisken, ligger Lacailles svaga Bildhuggaren och Ugnen.",
    members: ["PsA", "Scl", "For"],
  },
  {
    stage: 2,
    name: "Akterskeppet och Kompassen",
    reason: "Lågt under Stora hunden ligger Akterskeppet, aktern på skeppet Argo. Lacaille ställde Kompassen intill skeppet och Luftpumpen strax bredvid, under Vattenormen.",
    members: ["Pup", "Pyx", "Ant"],
  },
  {
    stage: 3,
    name: "Kentauren och Södra korset",
    reason: "Söder om Vattenormen står Kentauren, och hans två klaraste stjärnor pekar mot Södra korset, som grekerna räknade till hans bakben. Han håller också fast Vargen.",
    members: ["Cen", "Cru", "Lup"],
  },
  {
    stage: 3,
    name: "Skeppet Argo",
    reason: "Kölen och Seglet är resten av Argo, som seglade efter Vädurens gyllene skinn. I Kölen lyser Canopus, och stjärnor i båda bildar Falska korset, som lätt förväxlas med Södra korset.",
    members: ["Car", "Vel"],
  },
  {
    stage: 3,
    name: "Tre ritverktyg",
    reason: "Nära Kentaurens klara stjärnor ligger Södra triangeln, Passaren och Vinkelhaken sida vid sida, tre verktyg för att mäta och rita. Lacaille lade de två senare intill triangeln.",
    members: ["TrA", "Cir", "Nor"],
  },
  {
    stage: 3,
    name: "Flugan och Kameleonten",
    reason: "Flugan sitter strax söder om Södra korset, granne med Kameleonten, som gärna äter flugor. Paradisfågeln flyger intill, och alla tre kommer från de holländska sjöfararnas resor.",
    members: ["Mus", "Cha", "Aps"],
  },
  {
    stage: 3,
    name: "Altaret och Södra kronan",
    reason: "Söder om Skorpionens gadd står Altaret och söder om Skytten Södra kronan, en krans som Dionysos i en saga satte på himlen, liksom Norra kronan. Kikaren ligger intill.",
    members: ["Ara", "CrA", "Tel"],
  },
  {
    stage: 3,
    name: "Påfågeln och sydpolen",
    reason: "Påfågeln och Indianen kommer från de holländska sjöfararnas resor till Ostindien. Bredvid dem ligger Oktanten med himlens sydpol, där det inte finns någon klar polstjärna.",
    members: ["Pav", "Ind", "Oct"],
  },
  {
    stage: 3,
    name: "Tre sydliga fåglar",
    reason: "Tranan, Fenix och Tukanen är tre fåglar från de holländska sjöfararnas resor. Tranan hittar du söder om Södra fisken, och i Tukanen syns Lilla magellanska molnet.",
    members: ["Gru", "Phe", "Tuc"],
  },
  {
    stage: 3,
    name: "Mellan de magellanska molnen",
    reason: "Lilla vattenormen slingrar sig mellan de magellanska molnen, nära slutet av Floden Eridanus. Intill ligger Lacailles Pendeluret, som mäter tiden, och Nätet från hans teleskop.",
    members: ["Hyi", "Ret", "Hor"],
  },
  {
    stage: 3,
    name: "Svärdfisken jagar Flygfisken",
    reason: "Svärdfisken, egentligen en guldmakrill, jagar Flygfisken intill. Granngalaxen Stora magellanska molnet ligger över Svärdfisken och Taffelberget, som molnet över det riktiga berget.",
    members: ["Dor", "Vol", "Men"],
  },
  {
    stage: 3,
    name: "Duvan och bildkonsten",
    reason: "Duvan, som Noa släppte ut från arken, sitter söder om Haren och Stora hunden. Bredvid ligger Målaren och Gravstickeln, två av Lacailles stjärnbilder som hedrar bildkonsten.",
    members: ["Col", "Pic", "Cae"],
  },
];
