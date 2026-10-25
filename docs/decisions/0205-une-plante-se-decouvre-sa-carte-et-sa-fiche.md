# 0205 — Une plante se découvre ; sa carte et sa fiche

*16 octobre 2026 — accepté, à l'essai (chantier Capteurs, étapes 2 et 3 ; rien de publié). C29 à C31, C33 et C34 de `docs/chantier-capteurs-etapes-2-3.md` ; § 19.4 et 19.9.*

## Le problème

Une plante n'existait que configurée (`loggia_plants`, une base d'identifiant) : ses
deux Mi Flora, en zone « Technique », n'avaient pas de carte, et leurs modèles « Besoin
Eau » faisaient des cartes de fuite. La carte d'une plante disait « Tout lui convient »
en vert et portait quatre jauges sans repère ; sa fiche vivait dans App.jsx, avec ses
mots et ses deux dessins en `data:` (`PLANT_ART`, 6 778 octets au démarrage), à 5 263
octets de la borne du boot.

## La décision

**Une plante se découvre (C29)** — `plantes.js`, pur. Une plante, c'est un APPAREIL
physique qui mesure l'humidité du sol (`moisture`) ET la conductivité (`conductivity`) ;
une sonde de sol seule n'est pas une plante, un service ni une sonde masquée non plus. Ses
capteurs se trouvent par l'appareil ; chaque rôle se cherche parmi ceux qui restent, et la
pile ne se reconnaît qu'à sa classe — un sol se mesure aussi en %. Son nom est celui de
l'appareil ; sa base, le début commun de ses capteurs. `loggia_plants` COMPLÈTE la
découverte (le nom, la pièce, le dessin) sans la remplacer ; une base configurée sans
appareil connu marche comme avant. Le composeur et `nomDeCle` lisent la même liste
(`plantesDeLaMaison`). Ses capteurs ne font pas d'autre carte (C7) ; ses « Besoin Eau »
non plus, qu'ils vivent ou non : la carte dit elle-même « À arroser ». La règle C17 ne
s'applique pas : une plante n'est pas une mesure, elle se reconnaît à sa classe sur un
appareil physique, quelle que soit la zone.

**La carte (C30)** — `RoomPlantCard`, App.jsx, dans la grille commune (ADR 0202) : la
plaque feuille sur le vert de la plante (son identité, pas un verdict), le nom, la phrase
de sa vue (`vuePlante`), le sol en chiffre et « SOL » dessous, la grille des quatre
valeurs au pied, le dessin choisi en filigrane. La phrase : muette, « Indisponible depuis
{quand} » en rouge ; ce qui presse, deux au plus, avec les mots d'aujourd'hui (« À arroser
· Lumière faible ») en ambre ; sinon le mot du sol (« Humidité correcte », « Sol très
humide ») en neutre ; sans sol, « Mesure absente ». Jamais « Tout lui convient ». Plus de
lavis vert : l'ambre ne dit que ce qui presse (C5). **Ses repères ne bougent pas** :
`verdictsPlante` reste la seule table, `PLAGES_PLANTE` (sol de 15 à 70 %, 10 à 32 °C,
500 à 20 000 lx, 350 à 2 000 µS/cm) ; les chiffres de la maquette ne sont pas repris.
Sans commande, la carte reste un bouton entier dont le nom dit ce qu'elle affiche (lot
13) ; la compacte garde le gabarit de CvCard, que la feuille règle à 88 px.

**La fiche (C31)** — `ficheplante.jsx`, à la demande : l'en-tête sans épingle (une plante
n'est pas une entité), le sol en 48 px et « % de sol », la phrase, un conseil par mesure
qui presse (« Rapprochez-la d'une fenêtre : 84 lx reçus, il lui en faut au moins 500. »)
et « L'arrosage peut attendre. » si le sol va bien et qu'autre chose presse ; les quatre
mesures, chacune avec sa barre (la plage idéale en vert à 0,28, le repère à la valeur, la
lumière sur une échelle logarithmique) et « Idéal : {a} à {b} {u} » dans l'unité du
capteur ; la pile du capteur, le dernier signal, L'appareil. Muette : les statistiques
à l'heure de Home Assistant (`recorder/statistics_during_period`, dix jours), lues UNE
fois à l'ouverture, donnent « Dernier relevé {quand} : sol à {n} % », puis « Changez la
pile. » si la pile était à 20 % ou moins, sinon « Le capteur ne répond plus. ». Rien
n'est deviné. La coquille (`FichePlante`, App.jsx) garde la feuille, pose la frontière
Suspense dedans et lit la plante dans le `hass` vivant de ses capteurs (`lirePlante`).

**Plantes et piles juge (C33)** : les plantes par nom, puis Piles (ADR 0206). Une plante
qui presse ou qui se tait est « à regarder » ; l'enveloppe vivante s'abonne à ses
capteurs.

**La place (C34, § 19.9)** : les dessins restent, en fichiers (`public/plantes/*.svg`),
avec ceux de la vue Énergie et de la fiche d'appareil (`public/dessins/`) ; la fiche et
ses mots sont partis avec elle. Le boot passe de 1 094 737 octets au départ à 1 092 749
à la fin des deux étapes, 7 251 octets sous la borne.

## Ce que cela coûte

Une plante qui n'a pas de conductivité n'est pas découverte : elle se configure, comme
avant. La phrase d'une plante muette — « Indisponible depuis 10 oct. 14:05 », « Nicht
erreichbar seit 10. Okt. 14:05 », « Niedostępne od 10 paź 14:05 » — finit en « … » sur
la carte étroite dès 390 px (10,5 px), et aussi sur la carte LARGE à 1 280 px (mesuré le
17/10, passe bis : à côté du chiffre du sol, sa colonne fait 160 px pour un texte de
190 ; à 1 440 px, 200 px, elle tient) : la date d'un autre jour l'allonge ; la fiche la dit
en entier. Le dessin d'une plante découverte vient de `loggia_plants` ; sans configuration,
pas de filigrane. Les mots des anciens verdicts (« Sous le seuil : la plante a soif »,
« Plein soleil »…) ont quitté les sept catalogues.

## Ce qu'on n'a pas fait

Les seuils par plante (ses `input_number`), la détection d'un arrosage, le choix de la
pièce ou du dessin d'une plante découverte : hors chantier.

## Ce que les tests tiennent

`tests/plantes_decouverte.test.mjs` (qui est une plante, ses capteurs, sa base, la
configuration qui complète), `tests/plante_carte.test.mjs` (la vue, les conseils, la
barre, la carte large et la compacte, la fiche jouée vivante et muette, la coquille, les
sections, l'enveloppe), `tests/demo_mesures.test.mjs` et `tests/demo_capteurs.test.mjs`
(les deux plantes de la démo et leurs statistiques).
