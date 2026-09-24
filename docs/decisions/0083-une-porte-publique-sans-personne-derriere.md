# ADR 0083 — Une porte publique sans personne derrière

**Statut** : décidé et appliqué le 2026-09-24 ; gardé en local pour la mise à
jour groupée de correctifs.

Point S4 du plan du 22/09 : « Exports et fonctions morts ». Suite directe de
l'ADR 0082, côté écran cette fois — et même raison de fond : ce que personne
n'appelle se maintient pour rien, et ment sans qu'on s'en aperçoive.

## Ce qu'un `export` engage

Un `export` est une promesse faite à un appelant inconnu : ce symbole gardera
son nom, sa signature et son comportement. Tant que quelqu'un l'importe, la
promesse a un sens. Quand plus personne ne l'importe, elle tient dans le vide —
et surtout **elle empêche de voir que le code est mort**. Un symbole interne, le
premier qui passe le retire ; un symbole exporté, personne n'ose y toucher.

Trois familles, trois traitements.

## 1. Huit symboles morts : supprimés

`nomAssistant` (assistant.js), `CONDITIONS` (scenarios.js), `importLoggiaConfig`
et `exportLoggiaConfig` (state.js), `EnRow`, `EnVal`, `EnGauge` (ui.jsx),
`SysArea` (historique.jsx). Aucun appelant, dans `src/` comme dans `tests/`.

Les deux de `state.js` méritent un mot : c'étaient l'export et l'import de la
configuration **du seul `localStorage`**. C'était la vérité avant que la
configuration soit partagée entre appareils ; depuis, la source est le composant.
`exportConfigComplete` et `importConfigComplete` les avaient remplacés sans que
les anciens partent. L'ADR 0040 l'avait déjà écrit : « à retirer avec leur test ».

`EnVal` n'était utilisé que par `EnGauge`, lui-même sans appelant : une paire
morte qui se tenait chaude toute seule. C'est exactement ce qu'un balayage
naïf « ce symbole est-il cité quelque part ? » ne voit pas.

### Le test qui épinglait le mort

`tests/reglages.test.mjs` vérifiait que « l'export garde tout » — en comparant le
**texte** d'`exportLoggiaConfig` à une expression régulière. Le sujet était bon,
la cible ne l'était plus depuis longtemps.

Il vise désormais le vrai export, et vise autre chose : `exportConfigComplete`
part du serveur et complète par le stockage local **par motif** (`loggia_` ou
`loggia-`), jamais par une liste. C'est ce qui doit rester vrai — une clé
nouvelle est exportée sans qu'on y pense. Le test échoue si l'export se remet à
filtrer par `LOGGIA_SYNC_KEYS` ou `LOGGIA_CONFIG_KEYS`.

## 2. Sept `export default` redondants : supprimés

`views/fenetres.jsx`, `interrupteurs.jsx`, `journal.jsx`, `nuit.jsx`,
`presence.jsx`, `veilles.jsx`, `volets.jsx` finissaient par
`export default XxxReglages;` — un second nom pour un symbole déjà exporté
nommément, qu'aucun fichier n'importait par défaut.

Deux noms pour une chose, c'est une occasion de les faire diverger.

## 3. Trente exports sur des symboles internes : le mot-clé part, le code reste

Le plan en annonçait 34 ; la mesure en trouve 30. Aucun n'est mort — tous sont
utilisés **dans leur propre fichier**. Seule la porte publique se ferme :
`AUTO_FAMILLES`, `CAM_DISPOS`, `CAM_MAX`, `MIGRATABLE_KEYS`, `collectLegacy`,
`collectMigratable`, `ajusterTous`, `couleursDe`, `versRgb`, `CAP_DOMAINS`,
`VIEW_CAPS`, `fetchRegistries`, `LANGUE_SOURCE`, `CLASSES_PRESENCE`, `creerOrbe`,
`ECART`, `LARGEUR_MIN`, `RANGEE`, `LOGGIA_ENT`, `LOGGIA_SERVER`, `MED_COLORS`,
`discoveredRooms`, `medResolved`, `SYS_NAMES_DEF`, `estTaille`, `uniteDe`,
`detecterPieces`, `VIEW_ALWAYS`, `VUES_PRINCIPALES`, `nomMeteo`.

Le gain n'est pas la taille — un paquet minifié ne change pas. Le gain est
qu'**à partir de maintenant, le jour où l'un d'eux meurt, ça se voit**.

## Ce qui n'a PAS été touché, et pourquoi

Le plan notait aussi « huit exports qui n'existent que pour un test ». Il y en a
**soixante-sept**, et ils restent tous.

**Un test est un client légitime.** Sortir une règle pure pour la vérifier sans
monter d'écran est précisément ce que le plan demande ailleurs (M11 : « du texte
épinglé vers du comportement »). Les retirer reviendrait à punir la seule bonne
habitude du projet. `resolveRooms`, `niveauCo2`, `formePlurielle`,
`profilesFor` : ce sont des frontières de test, pas des oublis.

## Le garde-fou

`tests/exports_sans_client.test.mjs` : deux contrôles, une seconde.

- Aucun `export` de `src/` sans un consommateur — un autre fichier de `src/`, ou
  un test.
- Aucun `export default` qui double un export nommé du même fichier.

Vérifié en remettant un `export` retiré : le test le nomme et échoue.
`src/langues/` est hors du compte — ce sont des catalogues d'un seul objet,
jamais des symboles à importer un par un.

## Conséquences

- **Aucun changement à l'écran, aucun redémarrage de Home Assistant** : rien
  n'est sorti du composant, rien ne change de comportement.
- `historique.jsx` ne trace plus rien : il ne rend que `RoomActivityCard` et
  fournit des lectures. `SysArea` était son seul tracé, et personne ne
  l'affichait.
- Le prochain symbole qui meurt sera signalé, pas oublié.

Tests : 952 au vert côté JS (+2), lint propre, `npm run build` passe. Côté
Python, rien de touché.
