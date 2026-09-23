# 0070 — Loggia en six langues : le socle, puis la première vague

Date : 22/09/2026. Statut : acceptée. Origine : le plan d'évolution du 22/09,
point A9, ajouté à la demande de l'utilisateur (« la traduction de Loggia
dans d'autres langues, les plus communes pour commencer »), puis « go pour le
socle, vague 1 allemand néerlandais italien espagnol […] assure toi que tout
soit bien traduit, et correctement. […] le bouton, faire un menu déroulant ».

## Contexte

Deux langues, l'anglais écrit en dur à trois endroits (le préchargement de
l'amorce, le chargement tardif, les locales), et un serveur qui parlait
français même chez un compte anglais : le journal affichait `quoi`, `motif`,
`detail` tels quels, et les notifications téléphone partaient en français.
Les catalogues allemand et espagnol retirés le 29/08/2026 n'étaient plus à
l'échelle (le catalogue a plus que doublé depuis).

D'après les statistiques publiques de Home Assistant (22/09/2026, 686 702
installations), l'allemand est loin devant hors anglais et français, puis
le néerlandais, l'italien, l'espagnol, le polonais, le chinois.

## Décision

**Le socle, une fois.**

- **Un seul endroit qui liste les langues** : `src/langues/index.js` —
  `LANGUES` (code, nom natif, nom français), `CHARGEURS` (un import
  dynamique explicite par catalogue : Vite en fait un morceau chacun, Node
  les résout sans magie), `LOCALES`, `langueServie`. L'amorce et `i18n.js`
  l'importent ; ajouter une langue, c'est un fichier dans `langues/` et une
  ligne dans chacune des trois tables.
- **Le catalogue de la langue probable se charge avant l'application**
  (`window.__loggiaCatalogue = { code, cat }`), et lui seul. Une langue
  exotique servie par « auto » reçoit le filet anglais, comme avant.
- **Les pluriels restent à deux formes**, mais passent par `trN`, le seul
  endroit à étendre (`Intl.PluralRules`) le jour où une langue à trois formes
  entre. Les appelants existants ne sont pas convertis : aucune langue de la
  vague 1 n'en a besoin.
- **Le serveur parle par parties.** Le composant continue d'écrire le
  français au journal (les journaux existants, les logs, les tests ne bougent
  pas). Un texte composé — un gabarit et ses arguments,
  `("vent {v}", {"v": "62 km/h"})`, ou une liste de parties jointes par
  « · » — garde ses parties dans la ligne (`g`), et l'écran les traduit
  gabarit par gabarit (`src/journalmots.js`) avec le même mécanisme que le
  reste : la clé est le texte français. Un mot fixe (« couper », « maison
  vide ») n'a pas besoin de `g` : sa clé suffit. Une ligne ancienne garde son
  français composé.
- **Les notifications partent dans la langue de Home Assistant**
  (`hass.config.language`) : `textes.py` les rend par un catalogue
  **généré** depuis `src/langues/` (`scripts/textes_serveur.mjs`), jamais
  écrit à la main ; un test le vérifie à jour.
- **Le choix de la langue est un menu** (`ListeChoix`), chaque langue dans sa
  propre langue, son nom traduit en petit dessous — comme le sélecteur de HA.
  Une rangée de boutons ne tenait plus à six.
- **Quelques mots du serveur changent de texte** pour avoir leur propre clé :
  « coucher +30 min » devient « coucher du soleil +30 min » (le coucher de la
  maison est une autre règle), le détail d'un scénario passe de « lumieres 3,
  volets 2 » à « lumieres 3 · volets 2 ». La règle « retour » a une clé à
  part (`retour (règle)`) : « retour » est aussi le bouton Retour.

**La première vague** : allemand, néerlandais, italien, espagnol — les
langues des cinq premiers pays hors anglophones et francophones. Chaque
catalogue porte exactement les clés de l'anglais (un test le verrouille :
clés, repères `{…}`, valeurs vides, restes d'anglais bornés) ; traduit depuis
le français, avec le vocabulaire officiel de Home Assistant dans la langue,
au registre informel de son interface ; relu par une seconde passe avant
d'être posé.

## Conséquences

- Le journal gagne un champ optionnel `g` ; rien d'autre ne change pour les
  lecteurs existants.
- Un argument de gabarit n'est pas traduit (« 1 tenu par vent » garde le nom
  de la règle) : ce sont des noms d'appareils, des nombres, des unités — et
  quelques noms de règles, à traiter si quelqu'un s'en plaint.
- Les noms de pièces, d'appareils et d'entités restent ceux de Home
  Assistant ; la démo en ligne nomme les siens en français.
- Le README, le site et les pages légales restent en français (à trancher à
  part). Le polonais et le tchèque attendent les pluriels à trois formes ; le
  chinois, une passe à part (formats, police).
- Redémarrage de Home Assistant requis : le composant change.

Tests : tests/langues_socle.test.mjs (6), tests/langues_catalogues.test.mjs
(5), tests/textes_serveur.test.mjs (2), tests/python/test_textes.py (10).
