# 0310 — La vigilance rouge est un point d'attention, l'orange va au rail, et le niveau se lit en un seul endroit

*1er novembre 2026 — appliqué (v3.97.0) (lot 6 du rapport « Gladys comparé au catalogue », 31/10 : W3)*

*Complète l'ADR [0309](0309-meteo-france-en-entier-la-pluie-dans-l-heure-et-ses-vraies-probabilites.md) : après la pluie de la fiche météo, la vigilance sur l'Accueil.*

## Le problème

- **W3.** La vigilance de Météo-France, orange ou rouge, ne faisait que
  remplacer la phrase du widget météo. Ni « À surveiller » ni le reste du
  rail ne la voyaient. Elle est rare, et elle est actionnable : rentrer le
  salon de jardin avant un orage, ne pas prendre la route.
- MeteoAlarm avait déjà sa règle dans les points d'attention : un point
  ambre pour une vigilance jaune, des jours entiers. C'est du bruit, pas un
  point rare.
- Le niveau se lisait à **trois** endroits (`attention.js`, `vigilance.js`,
  `meteo.js`), plus les notifications (`derive.jsx`). Ces copies disaient
  « Severe » = rouge. Or, à l'échelle de MeteoAlarm elle-même, « Severe »
  est l'**orange** (`3; orange; Severe`), et « Extreme » le rouge
  (`4; red; Extreme`). Une alerte orange de MeteoAlarm passait pour rouge.
- Dans le registre réel, l'alerte départementale de Météo-France n'a pas de
  clé de traduction. Son `unique_id` est `<département> Weather alert`
  (« 18 Weather alert »).

## La décision

**Un choix par défaut, réversible.** Il suit sa règle : l'information va
dans le rail, un point d'attention est actionnable et rare.

- **Rouge** → un point d'attention, au niveau `danger` : « Vigilance
  rouge », et le phénomène en dessous (« Orages »). Il mène à Sécurité,
  comme le point de MeteoAlarm avant lui.
- **Orange** → une ligne en tête d'« En ce moment », la liste du rail qui dit
  ce qui se passe maintenant : « Vigilance orange », « Orages ». Elle ouvre la
  fiche météo, qui détaille chaque phénomène.
- **Jaune et vert** → rien de plus qu'avant : la popup météo et la carte
  Vigilance de Dehors. Le widget garde sa phrase et sa teinte pour l'orange
  et le rouge.
- Revenir sur ce choix, c'est changer deux constantes : `VIGILANCE_POINT` et
  `VIGILANCE_RAIL` (`attention.js`). **Aucun réglage** n'a été ajouté. Un
  réglage sûr demanderait une clé de configuration, un écran réservé aux
  administrateurs et ses sept langues : ce n'est pas « simple ».

**Une seule lecture du niveau** (`attention.js`, qui reste pur) :
`lireVigilance(id, état)`, `texteVigilance`, `motVigilance`, `estMeteoAlarm`,
`niveauVigilanceDe`. Le widget et la popup (`meteo.js`), la carte Vigilance
(`vigilance.js`), les notifications (`derive.jsx`), le point et le rail la
lisent. `groupes.js` et `vigilance.js` réexportent `estMeteoAlarm` et
`niveauDe` : leurs appelants ne changent pas.

- **Météo-France** : l'état est le niveau ; le détail, ce sont les
  phénomènes à ce niveau (« Orages, Vent violent »).
- **MeteoAlarm** : la couleur de `awareness_level` d'abord. Sans elle, la
  gravité à son échelle : Minor vert, Moderate jaune, Severe orange, Extreme
  rouge. Allumée sans rien de cela : le jaune, comme avant. Éteinte : vert
  si elle le dit, sinon rien.

**Une seule source, pas de doublon.** Le point et la ligne lisent le capteur
de la maison, celui du widget (`capteurVigilance` : Météo-France d'abord,
MeteoAlarm sinon). Ce capteur est passé à `pointsAttention` par le contexte
`vigilance`, depuis l'Accueil et la vue Sécurité. Une alerte que Météo-France
et MeteoAlarm disent toutes deux ne fait qu'un point. Un appelant qui ne
passe pas `vigilance` garde l'ancienne lecture : chaque binaire MeteoAlarm,
au rouge seulement. Le widget et la fiche reçoivent désormais l'index : ils
choisissent le même capteur que l'Accueil.

**La reconnaissance, par la clé.** Le composant pose le rôle `vigilance`
dans l'index (`meteo.py`, `ROLES_METEO`) quand l'`unique_id` d'un capteur de
`meteo_france` finit par « ` Weather alert` ». Le numéro du département
reste au serveur. `estVigilanceMeteoFrance` lit ce rôle d'abord. La clé de
traduction `weather_alert` et l'identifiant restent des replis (sans
registre, dans la démo).

**La démo** porte le cas : `?demo&vigilance=orange` met la ligne en tête
d'« En ce moment », `?demo&vigilance=rouge` fait le point. Les orages passent
au niveau demandé. Sans le paramètre, la démo garde sa vigilance jaune.

Écarté :
- mettre l'orange dans « À surveiller » au niveau `info` : un point
  d'attention doit rester rare ;
- compter sur le seul widget pour l'orange : on peut le retirer du rail, et
  il ne se voit qu'en le lisant ;
- un réglage dans Paramètres (voir plus haut).

## Les conséquences

- **ASSERTIONS MODIFIÉES** : la vigilance jaune de MeteoAlarm ne fait plus
  de point d'attention. « Severe » devient l'orange (widget, carte Vigilance,
  notifications). La couleur de `awareness_level` l'emporte sur la gravité.
  Tests concernés : `attention.test.mjs`, `groupes_membres.test.mjs`,
  `meteo_fiche.test.mjs`, `vigilance.test.mjs`. `vue_securite_adr0033.test.mjs`
  aussi, parce que la vue passe la vigilance.
- Les notifications de l'écran (`deriveNotifs`) gardent la vigilance jaune,
  en ambre. Seul leur rouge suit la nouvelle lecture.
- La ligne orange compte dans « En ce moment » : la tuile de la bannière
  affiche « 1 EN COURS ». Le sous-titre de la carte (« Lecture, machines,
  chauffage, volets en mouvement ») ne la nomme pas. Le changer aurait laissé
  une clé orpheline, et pl.js ne se retouche pas.
- Rien ne part au téléphone : c'est hors lot. Au téléphone, l'Accueil montre
  la même ligne dans sa page « En ce moment ».
- Aucun texte nouveau : les mots existaient déjà dans les sept langues.
- Redémarrage de Home Assistant nécessaire : le rôle vient de l'index du
  composant. Avant ce redémarrage, l'identifiant `…_weather_alert` suffit
  chez lui.
- Tests : `tests/vigilance_accueil.test.mjs` (12), `tests/python/test_vigilance_accueil.py` (3).
