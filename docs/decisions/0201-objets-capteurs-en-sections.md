# 0201 — Objets › Capteurs en sections ; la table gagne la lumière, les particules, les COV et le vent

*15 octobre 2026 — accepté, à l'essai (chantier Capteurs, plan 1, rien de publié). Revu le 16 octobre : le nom d'une carte (C13), le capteur sans pièce (C14), le dehors (C15) ; puis la passe de corrections « bis » : les sections en direct, ce qu'une section a le droit de dire, la barrière locale, le nom d'une zone qui n'est pas une pièce ; puis la passe « bis 2 » : ce que coûtent les sections en direct, « {k} à regarder » dès que k > 0.*

**16/10, passe 1 ter (C15 révisé, C16)** : une carte de mesure demande un appareil PHYSIQUE, dans une pièce de Loggia comme ailleurs — la prévision de Météo-France et l'« Humidité extérieure » calculée, posées dans sa pièce « Extérieur », sortent de Capteurs ; le bandeau de confort des pièces n'en change pas — ; dehors, une mesure a ses zones mais n'est jamais une alerte : Dehors n'a rien « à regarder » et ne dit jamais « Rien à signaler », qui y serait permanent ; l'enveloppe ne s'abonne plus aux mesures du dehors (`docs/chantier-capteurs.md`, C15, C16, § 5).

**16/10, passe 1 quater (C17, tranché)** : une mesure d'une zone que Loggia ne compte pas parmi ses pièces n'entre plus dans Capteurs — chez lui, les 25 sondes Glances de « network » et les 4 températures de sa passerelle (« technique ») sortent ; sans zone du tout, elle entre, NEUTRE, sous son nom de Home Assistant — son « Capteur Frigo », température et humidité —, et ne compte ni « à regarder » ni contre « Rien à signaler » ; l'enveloppe ne s'abonne pas à elle (`mesureJugee`). C13 ne nomme plus que d'après une pièce de Loggia : ce qui suit sur le nom d'une zone inconnue (« Jardin », « Garage ») tombe. Dans la démo, le jardin devient une pièce du dehors de la configuration, et sa station garde ses jauges ; un frigo sans zone porte la carte neutre — 36 cartes (`docs/chantier-capteurs.md`, C17, § 5, § 9).

## Le problème

Objets › Capteurs était une grille sans sections, « {n} appareils », à une carte
par APPAREIL : le capteur d'une chambre, qui porte le CO₂, le bruit, la
température et l'humidité, n'y montrait que son CO₂, et la température,
l'humidité et le bruit n'y entraient pas (la pièce les montre dans son bandeau de
confort). La table ne connaissait que quatre familles : la luminosité, les
particules et les COV de sa maquette n'avaient pas de zones, un vent non plus. Le
premier rejeu du plan a montré trois défauts de la règle d'alors : des noms de Home
Assistant qui disent la mesure deux fois (« Salle de bain température » au-dessus de
« TEMPÉRATURE »), et qui se coupaient ; un vrai capteur de CO₂ sans zone, perdu ; un
thermomètre du jardin à 5 °C, « Trop froid », compté « à regarder ».

## La décision

**Quelles mesures (C6, C7, C14).** Dans Objets › Capteurs, une carte PAR MESURE
pour une mesure de la table qui n'est ni la sonde d'un thermostat (son appareil
porte un `climate`), ni celle d'une plante (son appareil mesure une conductivité,
ou la plante est configurée), ni un réglage, ni un diagnostic. Dans une pièce de
Loggia, elle entre. Ailleurs — une zone que Loggia ne compte pas parmi ses pièces,
ou aucune zone —, elle entre si elle appartient à un appareil PHYSIQUE, et non à un
service comme la météo (`entry_type: service`, que l'index des appareils garde, par le
composant comme par les registres de Home Assistant). Chez lui, les températures
calculées et les prévisions n'ont pas d'appareil, ou un appareil de service : elles
restent dehors. Les autres capteurs gardent leur règle — une carte par appareil,
leurs classes — et les pièces ne changent pas.

**Le nom (C13).** Dans Objets, la carte d'une mesure porte le nom de sa pièce — sa
famille, écrite sous le chiffre, dit le reste, comme sa maquette (« Séjour »,
TEMPÉRATURE). Une zone de Home Assistant qui n'est pas une pièce de Loggia (« Jardin »,
« Garage ») donne son nom comme une pièce (C14, aligné le 16/10). Elle garde son nom de
Home Assistant dans trois cas : dans la vue d'une pièce, quand deux mesures de la même
famille partagent une pièce, et sans zone du tout. Un nom
posé à la main dans Loggia l'emporte toujours. La compacte, qui n'écrit pas la
famille, garde son nom de Home Assistant ; l'édition aussi, qui range les cartes.

**Les sections (C10, § 5)**, sous le filtre Capteurs, hors édition, dans l'ordre de
sa maquette :
- **Air** : le CO₂, les particules, les COV, et les mesures d'air sans table
  (PM10, PM1, l'indice de qualité, un COV en µg/m³) ;
- **Confort** : la température, l'humidité, le bruit, la luminosité, et le reste
  (une pression) ;
- **Maison** : les capteurs binaires — ouvertures, présence, sécurité ;
- **Dehors** : ce qui est dans une pièce du dehors, et le vent, d'où qu'il soit ;
- **Plantes et piles** : les plantes, et une pile ajoutée à la main.

Une section vide ne paraît pas ; une carte hors du bon reste à sa place. L'en-tête
dit « {n} cartes », puis « · {k} à regarder » quand une mesure est hors du bon ;
une section de mesures dit, à côté de son titre, **« {k} à regarder » dès que k > 0**,
comme l'en-tête qui les compte (correction bis 2, point 3, tranché : un CO₂ muet
faisait taire Air sous « · 3 à regarder »). Elle ne dit « Rien à signaler » que si elle
**juge tout ce qu'elle montre** (correction bis, point 2 ; sa règle : jamais de « Tout
va bien » permanent) : au moins une mesure jugée, et rien qu'elle ne sache pas juger.
Des thermomètres du dehors seuls, neutres, ne jugent rien — son cas : il n'a pas
d'anémomètre ; un capteur binaire (un portail du jardin), une plante, une pile, une
mesure de la table muette, illisible ou dans une unité inconnue (un vent en Beaufort)
lui échappent : elle tait son « Rien à signaler ». Une mesure sans table (une pression)
ou neutre à dessein n'a jamais rien à signaler : elle ne la fait pas taire.
Les sections et l'en-tête lisent les mesures **en direct** (correction bis, point 1) :
la vue ne surveille pas `sensor.`, et « Air · 3 à regarder » restait celui de son
dernier rendu ; une enveloppe (`SectionsCapteursVive`, sur le modèle de l'en-tête des
prises) s'abonne aux mesures que la table **juge** (`mesureJugee` : une famille de la
table, qui n'est pas neutre) — elles seules changent le décompte. **Son coût**
(correction bis 2, point 2) : abonnée à toutes les mesures visibles, elle redessinait
toutes les cartes — dans la démo, un CO₂ qui change redessinait 23 cartes de mesure (36
cartes en tout), contre une avant elle. À chaque relevé, elle ne redessine plus que le
décompte, l'en-tête et l'état de chaque section : la grille de chaque section est
mémoïsée (`GrilleSection`, sur ses objets et sa cellule), et chaque carte garde son
propre abonnement. Mesuré dans la démo après : une carte. Le module introuvable ne fait plus tomber
Objets (point 4) : une barrière locale (`Barriere` et son `repli`) rend la place à la
grille ordinaire — avant, « Réessayer » retombait aussitôt, le filtre étant gardé en
`sessionStorage`. **Dehors (C15)**, la table ne juge que le vent et les particules : une
température, une humidité, un CO₂, un bruit, un COV ou une luminosité du dehors n'a
pas de zone, et ne compte pas « à regarder ». Une pièce du dehors se reconnaît à son
nom, dans les sept langues (« Jardin », « Tuin », « Giardino », « Jardín », « Ogród »).
**Maison et Plantes et piles ne disent rien encore** : leurs règles viennent aux
étapes 2 et 3 (C4 pour la sécurité), et « Rien à signaler » au-dessus d'un détecteur
de fumée qui sonne serait faux. Le titre « Maison » passe par une clé de contexte :
l'allemand lisait « Zu Hause », le mode d'une alarme. L'édition garde la grille,
qu'elle range. L'en-tête et les sections naissent à la demande
(`capteurssections.jsx`).

**La table (§ 6, C3)** gagne, avec les mots de la maquette :
- la **luminosité** (lx), sur une échelle LOGARITHMIQUE de 1 à 2 000 : Sombre sous
  50, Tamisé sous 300, Lumineux au-delà — toutes bonnes : une lumière n'est jamais
  une alerte ;
- les **particules PM2,5** (µg/m³) : Bon sous 10, Moyen sous 25, Mauvais au-delà ;
- les **COV**, un INDICE sans unité (celui des capteurs Sensirion, de 0 à 500) :
  Bon sous 150, Moyen sous 250, Mauvais au-delà ; un COV en µg/m³ ou en ppb ne se
  lit pas sur ces bornes et garde la carte d'une mesure sans table ;
- le **vent** (km/h) : Calme sous 20, Venteux sous 50, Fort au-delà ; un capteur en
  m/s, en mph, en nœuds ou en pieds par seconde se convertit (`versKmh`,
  `deKmh`).
Les particules et les COV disent une qualité d'air : leurs mots passent par les
clés de contexte du CO₂.

## Ce que cela coûte

Une carte par mesure dans Objets : sous Capteurs, la démo passe de 20 cartes (16
avant ce plan ; 20 avec les mesures de sa maquette) à 35, dont les trois de la
station du jardin — une zone de Home Assistant qui n'est pas une pièce de la démo,
sur un appareil physique. Environ un kilo-octet au
démarrage (la règle des mesures, la coquille des sections) ; les sections
elles-mêmes naissent à la demande.

La règle des appareils fait entrer, hors des pièces de Loggia, toute mesure d'un
appareil physique : un thermomètre de garage, un CO₂ nomade. Chez lui, à vérifier au
premier essai : ce qui entre ainsi, et que la règle d'avant ne montrait pas.

## Ce qu'on n'a pas fait

- Les cartes de groupe (Ouvertures, Présence, Sécurité) et leurs règles : étape 2.
- Les plantes et les piles : étape 3.
- Remonter une carte hors du bon en tête de sa section : la maquette ne le fait
  pas.
- Une notion du dehors dans Home Assistant : elle n'existe pas ; le nom de la pièce
  reste le seul indice.

## Ce que les tests tiennent

`tests/capteurs_sections.test.mjs` (la règle des mesures sur une maison de
fixtures : la chambre et son second CO₂, la sonde d'un thermostat, une plante, le
jardin, un diagnostic, une température calculée, celle d'un service météo, un garage
hors des pièces de Loggia, un CO₂ nomade sans zone ; le nom de chaque carte ; les
sections, leur ordre, ce qui est à regarder, le dehors ; l'en-tête rendu ; la vue,
son enveloppe vivante et sa barrière ; une section qui se tait — des thermomètres du
dehors seuls, un portail, un vent en Beaufort, un CO₂ muet ; pour la passe « bis 2 » :
l'enveloppe qui ne suit que les mesures jugées, la grille mémoïsée, « {k} à regarder »
dès que k > 0),
`tests/mesures_table.test.mjs` (les quatre familles, le logarithme, le vent
converti, ce qui est bon, ce qui se juge dehors), `tests/carte_mesure.test.mjs` (une
pièce du dehors dans les sept langues), `tests/demo_mesures.test.mjs` (la station du
jardin), et `tests/recharge.test.mjs` (le module à la demande) ; `objets` et
`composeur` lisent la carte qui prend le nom de sa pièce.
