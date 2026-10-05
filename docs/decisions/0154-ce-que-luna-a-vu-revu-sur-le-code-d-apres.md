# 0154 — Ce que Luna a vu, revu sur le code d'après

Date : 05/10/2026. Statut : appliqué. Pas de comportement serveur nouveau :
les messages des alertes et des veilles deviennent des constantes, au
caractère près ; le redémarrage de Home Assistant déjà requis par les lots 3
à 15 suffit.

**Le second regard.** L'utilisateur a transmis l'audit d'un autre agent
(« Luna »), fait sur le code d'AVANT les lots du 03/10. Ses constats ont été
revérifiés un par un sur le code d'après, puis contestés :
- sept étaient déjà corrigés : le verrou de la configuration partagée
  (lot 15), le chargement des règles (lot 5, ADR 0138), PBKDF2 hors de la
  boucle, un `rgb_color` mal formé, « Verrouiller » écrit en dur, le CSS
  orphelin, les fenêtres d'édition des profils et des vues ;
- quatre étaient faux ou voulus : pas de signal après `async_set_shared` (il
  ferait recharger les écrans en boucle, ADR 0067), BottomSheet présentée en
  modèle, la rangée de confort au téléphone, la barre de confort « à 59 px »
  (ADR 0051 respecté, 0,94 px d'écart) ;
- restent ouverts, à part : le boot d'environ 1 Mo (un chantier en étapes :
  Énergie, Sécurité, Scénarios chargés à la demande), le Dashboard sans
  `React.memo` (aucune tâche longue mesurée sur ordinateur), la question 9
  (le ciel 3D au téléphone) et la question 13 (`regles/etat` sans filtre).

L'utilisateur a dit « ok » au reste, et tranché les mots de la qualité de
l'air.

**Le thermostat en panne.** Sa fiche disait « Au repos », interrupteur
allumé, puces de mode à toucher, alors que sa carte disait « Indisponible ».
Elle reprend la définition de la carte : « Indisponible », consigne éteinte,
ni interrupteur ni puces, et le liseré rouge sur le bloc de l'appareil
(ADR 0048). `hvac_modes` se lit par une seule règle (`modesClimat`) à quatre
endroits : une chaîne faisait tomber la vue, un `null` dessinait une puce
vide.

**Les fiches des autres appareils en panne**, relues une à une avec la
définition de panne de leur carte : lumière, volet, prise, serrure, détecteur,
lecteur, capteur, zone de chauffage, distributeur, plante, alarme. Hors ligne,
chacune dit « Indisponible » et ne propose plus de commande vers l'entité
morte (pas même « +30 min » ni un code d'alarme en cours de saisie ; un
minuteur déjà posé reste annulable). Le liseré va sur le bloc de l'appareil,
une seule fois. Une serrure `open`, vivante, ne se dit plus « Indisponible ».

**Les boutons des cartes.** Sur une carte étroite, Exécuter, Armer,
Désarmer, Verrouiller débordaient : au téléphone, le nom disparaissait, et
la carte voisine était recouverte jusqu'à 57 px en allemand, 41 en français
— les cartes standard aussi, pas seulement les compactes. Sous 200 px de
contenu (requête de conteneur, `o-cvcarte`), le geste passe en icône seule ;
le mot reste dans le nom accessible et l'infobulle. La pastille et l'écart se
resserrent sur la standard étroite. Les mots polonais de Seba882 restent tels
quels : c'est la mise en page qui cède. Deux conséquences voulues :
- la pastille d'une serrure dit l'ÉTAT (cadenas ouvert si elle n'est pas
  verrouillée), le bouton le GESTE — sinon une porte ouverte montrait deux
  cadenas fermés ; ses sept états de Home Assistant s'écrivent avec les mots
  de sa fiche (« jammed » s'écrivait en anglais) ;
- les favoris de l'Accueil (cases de 225 px) sont en icône même sur
  ordinateur : l'icône rend 50 à 100 px au nom en allemand et en polonais.

**La qualité de l'air.** À côté de « Qualité de l'air », « High / Hoch /
Hoog / Alto » se lisait « bonne qualité », sur le palier même où il faut
aérer. Décision de l'utilisateur : des mots de QUALITÉ — Poor, Schlecht,
Slecht, Mala, Scarsa ; l'espagnol et l'italien s'accordent au féminin
(Buena, Buona, Media, Cargada, Viziata). Le français et le polonais ne
changent pas à l'écran. Des clés de contexte (« Bon · air »…) portent ces
mots ; les clés nues de la température, de l'humidité et du robot ne bougent
pas, les seuils non plus (« Élevé » CO₂ = 1400).
Au téléphone, une carte de mesure fait céder son libellé, plus jamais son
verdict (« Luft… · SCHLECHT ») : CO₂, température, humidité, bruit, une
seule rangée. Mesuré sur 784 lignes : 235 verdicts coupés avant, 8 après.
Les 8 restants sont plus larges que la ligne ENTIÈRE à 320 px et
s'ellipsent.

**Les alertes du téléphone.** Les messages de sûreté (fumée, eau, alarme,
ouverture, CO₂, pile, consommables, heures creuses) sont des constantes, et
un test Python vérifie chaque gabarit dans chaque langue, avec les mêmes
champs, plus des envois réels en allemand : retoucher un message français
sans sa traduction ne passe plus en silence. Le test refuse aussi un message
qui contournerait la liste (constante locale, seconde table, relais, autre
module qui parlerait au téléphone). Le générateur s'arrête sur une valeur
qui n'est pas une chaîne.

**Les nombres et les dates.**
- Une puissance autour du kilowatt ne saute plus de « 1 000 W » à
  « 1,00 kW » : on arrondit avant de choisir l'unité, partout (`fmtWatts`,
  les prises, la tuile Consommation de Paramètres, le schéma de la maison) ;
  plus de « -0 W », « — » pour l'illisible.
- Une date FUTURE ne se dit plus « À l'instant » : prochaine alarme du
  téléphone, prochain lever du soleil s'écrivent en date et heure.
- Un capteur daté ne se lit plus comme un nombre (« 2 026 », « 7,00 » pour
  07:30) : tuile, carte standard, grand chiffre, graphique 24 h, fiche et
  pastille passent par une seule règle (`texteDate`) ; il ouvre la fiche de
  son appareil, où il prend la tête.
- Une scène jamais lancée, un bouton jamais pressé, un événement jamais tiré
  sont à « unknown » dans Home Assistant : c'est leur état normal, plus une
  panne (seule « unavailable » l'est). La pastille ne dit plus « unknown »,
  un horodatage brut, ni l'état d'un appareil injoignable (« Armée »).

**La configuration abîmée** (édition à la main, ancienne version) ne fait
plus tomber l'écran : les lecteurs (`lectures.js`) n'acceptent que des
entités, `useHass` que des chaînes, Paramètres — la seule vue d'où l'on
répare — ne tombe plus sur un élément `null`. Rien ne se perd en silence à
l'enregistrement : un repas abîmé reste réparable dans l'éditeur (la fiche
l'ignore), la clé du distributeur survit tant qu'un de ses champs désigne
quelque chose, et son `haid` de premier niveau n'est plus effacé — une perte
qui touchait aussi une configuration VALIDE, depuis n'importe quelle vue. La
clé de rendu `_k` ne s'écrit plus dans les personnes et les médias.

**Le lint et le plan du robot.**
- 53 → 48 avertissements, tous `exhaustive-deps` : trois directives mal
  placées ou inutiles. Le cliquet de la CI passe à 48.
- La détection des pièces du plan du robot sort à l'identique dans
  `src/vacplan_pixels.js` (même morceau chargé à la demande, boot inchangé) ;
  ses tests FIGENT l'heuristique, seuils compris (`SEUIL_FUSION`,
  `PART_MIN`). Une instabilité de clé est documentée, pas corrigée : il
  faudrait une vraie capture de carte, et changer la clé effacerait les
  associations des pièces. `detecterPieces` est de nouveau exporté
  (ADR 0083) : il a un client.

**Comment c'est vérifié.** Dix-huit fichiers de tests nouveaux, chacun rouge
sur le code d'avant ; mesures dans la démo seulement, de 320 à 1440 px, dans
les sept langues ; boot à 1 053 838 octets (budget 1 100 000).

## Relecture

Une relecture en cinq angles (rendu, serveur, tests, accessibilité et
règles, données), puis un contradicteur par correctif. Ce qu'elle a ajouté :
- la serrure ouverte aux deux cadenas fermés, et l'infobulle des boutons en
  icône ;
- le liseré rouge absent de la fiche du thermostat, puis de dix autres
  fiches ;
- les trous de la garde Python (huit évasions prouvées par mutation, dont un
  message d'alarme qui serait parti en français) ;
- les seuils du plan du robot qui pouvaient bouger de 36 % sans bruit ;
- l'effacement de la configuration du distributeur à l'enregistrement.

**À soumettre à Seba882** (aucune de ses valeurs n'est réécrite) : les clés
nouvelles « Bon · air » (Dobra), « Moyen · air » (Średnia), « Élevé · air »
(Wysoki — peut se lire à l'envers à côté de « Jakość powietrza ») et
« Confiné · air » (Duszno), copies exactes de ses mots ; et « Otwarte » pour
une serrure `open` à côté d'« Otwarty » pour une serrure déverrouillée.

**Restes nommés**, à ne pas re-proposer comme des découvertes :
- l'espagnol « Cargada » se comprend moins bien que « Muy mala » ; huit
  verdicts plus larges que leur ligne à 320 px (es, nl, it, pl) ;
- les rangées d'entités sœurs d'une fiche (`LigneEntite`) gardent leurs
  commandes pour une entité morte ; une carte de zone pilotée morte dit
  encore « Au repos » ; la vue Sécurité ne fait pas arriver la panne d'un
  détecteur dans une fiche déjà ouverte ; la fiche d'une plante est un
  instantané ;
- une jauge ANCIENNE sur un capteur daté, et le Journal, écrivent encore la
  date brute ;
- une prise négative s'écrit « -1500 W », et la vue Énergie écrit la même
  puissance de trois façons ;
- la tuile d'un capteur daté ne s'ouvre pas, alors que sa carte standard
  mène à la fiche de son appareil.
