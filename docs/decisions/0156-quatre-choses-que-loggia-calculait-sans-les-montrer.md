# 0156 — Quatre choses que Loggia calculait sans les montrer

Date : 05/10/2026. Statut : appliqué. **Redémarrage de Home Assistant requis**
(mise à jour d'un composant personnalisé) ; le paquet est rebâti.

Quatre chantiers, nés d'une comparaison avec deux autres tableaux de bord —
[`dwains-dashboard-next`](https://github.com/dwainscheeren/dwains-dashboard-next)
(MIT) et [`oikos`](https://github.com/Bobsilvio/oikos) (propriétaire, dont on
n'a repris aucun code, seulement une idée). Le détail de ce qui a été écarté, et
pourquoi, vit dans `docs/chantier-etages-cartes-veille.md`.

Trois d'entre eux ont la **même histoire** : la donnée était déjà calculée, elle
traversait tout le système, et personne ne la montrait.

## 1. Le retour à l'accueil après inactivité

Sur une tablette murale, une fiche laissée ouverte y restait jusqu'au prochain
passage. Passé un délai — 1, 2, 5, 10 ou 30 minutes, **coupé par défaut** — les
feuilles se ferment et la vue revient à l'Accueil.

**Une seule ligne ferme toutes les feuilles.** Elles naissent dans une dizaine
d'endroits, sans ancêtre commun qui pourrait les fermer ensemble : chacune
s'auto-ferme sur un événement nommé (`FERMER_TOUT`, dans `ui.jsx`). Écrire une
feuille de plus demain ne demandera rien.

Trois garde-fous :

- **Par appareil**, dans `localStorage`, comme la veille. La tablette du couloir
  et le téléphone qu'on garde en main n'ont pas le même besoin.
- **Seuls les gestes comptent** — pointeur, clavier, toucher. Un changement
  d'état de la maison n'en est pas un, sinon le délai ne s'écoulerait jamais.
- **Une saisie en cours ne se fait pas couper** : un formulaire à moitié rempli
  fait repartir le délai au lieu de disparaître sous les doigts.

Le minuteur vit dans l'onglet, et c'est sa place : il ne s'agit pas d'une action
différée sur la maison — celles-là vivent dans le composant —, mais du
comportement d'un écran.

## 2. Le coût de l'énergie

`resolveEnergy` résolvait `coutJour` depuis `stat_cost` du tableau de bord
Énergie de Home Assistant. `grep` n'en trouvait **qu'une occurrence : la ligne
qui le crée.** On allait chercher le chiffre, on le rangeait dans l'index, et il
mourait là.

Il s'affiche maintenant dans la rangée du schéma Énergie. Home Assistant le
calcule lui-même, heures creuses et tarifs multiples compris : on reprend son
chiffre, on n'en refait pas un à partir d'un prix du kWh. Sans tarif déclaré,
`stat_cost` n'existe pas et **rien ne s'affiche** — ni zéro, ni tiret.

La devise suit l'entité, puis l'installation. L'euro n'est que le dernier
recours.

## 3. Les étages

Home Assistant tient un registre d'étages. `discovery.py` l'interrogeait,
`discovery.js` le normalisait, l'index portait le `floor` de chaque zone — et
les seuls `floor` d'`App.jsx` étaient des `Math.floor`.

**Ils FILTRENT les pièces, ils ne les regroupent pas.** La grille des pièces
porte un placement libre, des tailles par carte et un glisser-déposer, rangés
par format d'écran : la découper en sections titrées aurait défait tout cela.
Des puces dans l'en-tête — « Tous », puis un étage par puce — masquent les
autres.

- **Du plus bas au plus haut**, par `level` : le sous-sol (−1) avant le
  rez-de-chaussée (0), avant l'étage (1). Jamais par ordre alphabétique.
- **Rien sans deux étages habités.** Une maison de plain-pied ne voit aucune
  puce, et un seul étage ne vaut pas un filtre : « Tous » et lui diraient la
  même chose.
- **Une pièce sans étage reste visible** quel que soit le filtre. La cacher
  reviendrait à la perdre.
- **Les cartes se réalignent.** Premier essai : les positions enregistrées
  valent pour la maison entière, et les appliquer à un sous-ensemble laissait
  les trous des pièces masquées — « les cartes doivent se réaligner
  automatiquement ». Sous un filtre, le placement se recalcule ; sans filtre,
  l'agencement reprend tous ses droits, trous voulus compris.
- **Deux rangées au téléphone.** Les puces tenaient dans l'en-tête à côté du
  titre, du compte et du sélecteur de vue : à 390 px il fallait 373 px de place
  pour 344 disponibles, et tout se chevauchait — « sur mobile c'est pas
  terrible ». L'en-tête se coupe en deux rangées nommées sous 641 px, les puces
  passant dessous. Rien ne rétrécit, rien ne disparaît : c'est la disposition
  qui cède.

## 4. Les cartes Lovelace tierces

Le seul des quatre qui n'existait nulle part. Le catalogue de Loggia est riche
mais il était **fermé** : ni `mini-graph-card`, ni `apexcharts-card`, ni même
une `tile`. Tout l'écosystème restait dehors. Les deux tableaux de bord comparés
le permettent, tous deux par collage de YAML.

`src/cartelovelace.jsx` monte la carte avec les aides de Home Assistant
(`loadCardHelpers` → `createCardElement`), et lui **repasse** l'état de la
maison au lieu de la faire renaître : la reconstruire à chaque changement la
ferait clignoter et lui ferait perdre son animation.

**Trois pannes, trois messages, jamais une page blanche** : les aides qui ne
répondent pas, le type introuvable (ressource absente ou nom mal écrit), la
configuration vide. `createCardElement` lève sur un type inconnu — sans ce
`try`, la vue entière tombait avec la carte.

**Le thème.** Une carte Home Assistant lit SES variables (`--primary-color`,
`--card-background-color`…), pas celles de Loggia. `PONT_THEME` les fait pointer
sur les nôtres : la carte garde sa mise en page, elle prend nos couleurs — sur
les trente thèmes. Vérifié : une carte montée prend bien la surface de Loggia.

**Lire la configuration sans dépendance.** On colle du YAML, parce que c'est ce
que donnent la documentation des cartes et l'éditeur de Home Assistant. Le
paquet versionné pèse déjà un mégaoctet : plutôt qu'une bibliothèque,
`src/miniyaml.js` lit le coin du langage qu'une configuration de carte emploie —
clés, indentation, listes, scalaires, commentaires — et le JSON par-dessus. Ce
qu'il ne sait pas lire (ancres, blocs `|`, documents multiples) est **refusé et
dit** : une configuration mal comprise donnerait une carte fausse, ce qui est
pire qu'un refus.

L'éditeur montre un **aperçu vivant** — la vraie carte, avec les vrais états —
et n'enregistre pas une configuration illisible.

## 5. Et puisque la carte de pièce avait trouvé la réponse

Celui-là n'était pas prévu : « la carte pièce compacte a été modifiée, on
pourrait appliquer la même méthode sur toutes les compactes non ? » — puis,
devant mes questions, « **je te demande de faire comme la carte pièce compacte,
il y a pas à chercher** ».

La carte de pièce avait renoncé à la ligne unique le 03/10 (maquette 1b) :
l'icône et la commande en haut, le nom et son détail dessous, sur toute la
largeur. Les quatre autres cartes compactes à la même structure — distributeur,
plante, appareil, et la `CvCard` générique — étaient restées sur une ligne. Au
téléphone, **le nom du distributeur n'avait plus que 19 px**. Il en a 148.

**Le gabarit vit dans la feuille, pas dans les quatre composants.** Elles
portent la même structure (`o-cvrow` + `o-cvtxt`) : la cinquième en héritera
sans rien demander.

**Il a d'abord fallu sortir trois valeurs de la ligne.** Un style en ligne bat
toute règle de feuille : tant que `flex: 1`, `gap: 8` et les 34 px de l'icône
étaient écrits sur les balises, la règle ne mordait pas — elle était en place,
et il ne se passait rien. Elles vivent maintenant dans la feuille, où la mise
en page peut les reprendre.

**Sans seuil, comme la carte de pièce**, et c'est mesuré. Un premier essai
l'avait rangé sous les 200 px du geste (lot 16) : une carte de 240 px montrait
alors **moins** qu'une de 176 — 86 px de texte contre 148 — parce qu'au-dessus
du seuil la ligne unique revenait et que l'icône, la valeur et le bouton
reprenaient leurs 126 px. Sur une ligne, le texte n'a jamais que la largeur
moins ces 126 px ; sur deux, il a tout. **Il n'existe aucune largeur où une
seule ligne en dise plus** — donc aucun seuil à poser.

**Deux rangées dans 88 px**, puisque c'est la hauteur d'une compacte : la ligne
du haut fait 26 px — non à cause de l'icône, mais des commandes (38 × 26) ;
l'écart vertical tombe de 8 à 4 ; le texte passe de 36 à 30 px par un interligne
de 1,15. 60 px pour 64 disponibles, et 62 dans le pire cas (le bouton de geste,
haut de 28). Avec les valeurs d'avant, la rangée en faisait 78 et débordait sur
la carte voisine. La pastille perd ses 8 px **sur la compacte seulement** : la
standard a 184 px de haut, elle n'a rien à rendre.

**Seule l'icône est poussée, pas les commandes entre elles.** Premier jet :
`justify-content: space-between`, qui répartissait toute la ligne — les deux
flèches du volet se retrouvaient aux deux bouts de la carte, « bien trop
espacé », et la vitesse du robot loin de son bouton. Une marge automatique sur
l'icône seule tient la gauche et laisse le reste groupé à droite. Sur la carte
de pièce la différence ne se voyait pas : son interrupteur est seul.

**Le climat ne cache plus rien.** Sous 270 px, son nom s'effaçait au profit du
« − consigne + », l'icône portant l'identité seule — d'où « pour le thermostat
il y a aucun changement » : cette règle avait survécu au gabarit et le masquait
toujours. Je l'ai d'abord inversée, en escamotant l'icône : « il manque
l'icône ». C'est donc **le groupe de consigne** qui cède, puisque c'est lui qui
ne tenait pas — ni le nom, ni l'icône, comme pour le bouton de geste du lot 16.

Mesuré : à 38 px de bouton et 8 d'écart, le groupe demande 126 px là où il en
reste 113 une fois l'icône et son écart retirés des 148 du téléphone ; le « + »
tombait à la ligne et la carte débordait de 26 px sur sa voisine. À **30 et 4**,
il en prend 102 — et 113 avec une consigne à trois chiffres (« 101,5° », en
Fahrenheit), soit **pile** la place disponible. 32 px la feraient déborder.

## Ce qu'on a appris

**Chercher les champs que plus personne ne lit.** Trois chantiers sur quatre
étaient le même défaut, à trois endroits. Il existe déjà un test pour les
exports sans client et un autre pour les clés de langue orphelines ; il
manquait l'équivalent pour les champs de l'index.

**Un garde-fou vaut pour tout le monde.** Le `placeholder` du champ de
configuration montrait `type: tile` — du code, pas une phrase. Le test des
textes en clair l'a refusé quand même, et il a eu raison : l'exception
s'écrirait une fois, puis deux.

**Une règle posée n'est pas une règle appliquée.** Le gabarit des compactes
était écrit, juste, et sans aucun effet : trois valeurs en ligne le battaient.
Entre « la règle existe » et « la règle gagne », il y a une mesure à faire.

1900 tests JavaScript, 1429 tests Python, lint et audit propres.
