# 0281 — Des filets sous la CI

*28 octobre 2026 — à l'essai (audit de consolidation du 28/10, lot 3 : H4, M14, M13, M9, B6)*

## Le problème

La CI de Loggia est exigeante. Elle a pourtant cinq trous, relevés par l'audit
du 28/10.

1. **Aucun vrai Home Assistant (H4).** La suite Python tourne sur des
   doublures écrites à la main. Une dérive de l'API de Home Assistant ne
   serait vue que chez les utilisateurs. `hacs.json` annonce
   `"homeassistant": "2024.7.0"` sans que rien ne le vérifie.
2. **Une CI sans garde de durée ni de versions (M14).**
   - Ni cache, ni délai maximal : un travail bloqué tient la file six heures.
   - Ni annulation : chaque push d'une PR empile un run.
   - `pytest` non épinglé : une nouvelle version changeait la suite un lundi,
     sans qu'aucun commit le dise.
   - Pas de version de Node déclarée.
3. **Les notes de travail entraient dans le dépôt (M13).** La règle « jamais
   de `docs/chantier-*` ni de `docs/audit-*` dans le dépôt » était dite, pas
   gardée. `docs/chantier-etages-cartes-veille.md` est entré au commit de la
   v3.87.0.
4. **Les couleurs en dur n'étaient pas gardées (M9).** La règle « jamais de
   couleur en dur dans un composant » n'avait aucun test : 130 couleurs en dur
   dans 12 composants au 28/10.
5. **`config_flow.py` n'avait aucun test (B6).**

## La décision

**Un banc « vrai Home Assistant », à part.**

- `tests/ha_reel/` démarre le Home Assistant de
  `pytest-homeassistant-custom-component==0.13.144`. Ce paquet épingle
  `homeassistant==2024.7.0` : c'est exactement le minimum de `hacs.json`, qui
  n'a donc pas à bouger. Relever ce minimum, c'est relever cette ligne avec
  lui.
- Deux autres épingles sont nécessaires, découvertes en faisant tourner le
  banc le 28/10 :
  - `home-assistant-frontend==20240703.0`, l'interface que `frontend` exige
    dans cette version de HA, sans laquelle Loggia ne démarre pas ;
  - `josepy==1.15.0` : josepy 2 a retiré ce qu'`acme` importe (via
    `hass-nabucasa`), et Home Assistant 2024.7 ne démarrait plus.
- Le `conftest.py` importe le `custom_components` du dépôt avant tout Home
  Assistant : le paquet de test porte le sien, qui le masquerait sinon.
- Les tests de fumée couvrent cinq portes :
  - l'ajout depuis l'interface (formulaire, entrée créée, second ajout
    abandonné) ;
  - le démarrage puis l'arrêt de l'entrée ;
  - le panneau ;
  - un aller-retour WebSocket (`config/set`, `config/get`, le refus
    `code_non_defini`) ;
  - le magasin : ce qui est écrit arrive au fichier et se relit au
    redémarrage de l'entrée.
- Le workflow `ha-reel.yml` tourne le lundi à 5 h et à la demande
  (`workflow_dispatch`), pas à chaque push : le paquet tire tout Home
  Assistant.
- Il n'emploie que les actions déjà épinglées par SHA, avec
  `permissions: contents: read`.
- Le banc a son propre `pytest.ini` (`asyncio_mode = auto`). Sans le paquet,
  son `conftest.py` ne collecte rien : la suite ordinaire et ses doublures
  n'en voient rien.

**Une CI qui ne traîne plus.**

- `concurrency` par branche ou par PR. Sur une PR, un nouveau push annule le
  run devenu inutile. Sur une branche, les runs attendent leur tour.
- Un `timeout-minutes` sur chaque travail : 10 pour hassfest et HACS, 15 pour
  Python et pour le paquet, 30 pour le frontend et le banc HA.
- `cache: npm` (suit `package-lock.json`) et `cache: pip` (suit les fichiers
  de versions).
- Les versions de la suite Python vivent dans `tests/python/requirements.txt`
  (`pytest==9.1.1`, `voluptuous==0.15.2`, `ruff==0.16.10`).
- `package.json` déclare `"engines": {"node": ">=22"}`, la version de la CI.

**Les notes de travail restent dehors.**

- `.gitignore` écarte `docs/chantier-*` et `docs/audit-*`.
- `tests/depot_propre.test.mjs` lit l'index git (`git ls-files`) et refuse
  ces fichiers, même forcés par `git add -f`. Une entrée de l'index dont le
  fichier a quitté le disque, c'est-à-dire une suppression pas encore
  commitée, ne compte pas.
- `docs/chantier-etages-cartes-veille.md` quitte le dépôt. L'ADR 0156, qui
  le citait, garde ce qui avait été décidé.

**Un cliquet sur les couleurs en dur.**

- `tests/couleurs_en_dur.test.mjs` compte les hexadécimaux de `src/`, hors
  commentaires et hors catalogues de langues.
- Sont tolérés partout le blanc et le noir : le blanc sur `--o-accent-fond`
  est la règle des puces choisies, le noir celle des ombres.
- Les deux palettes des thèmes (`theme.js`, `themes-bleus.js`) sont libres :
  c'est leur métier.
- Douze fichiers ont un **plafond**, le compte du 28/10. `parametres.jsx` en
  tient 61, avec les pastilles des thèmes et la pastille Ko-fi, qui garde son
  dessin.
- Un fichier hors liste n'a droit à aucune couleur, et un plafond ne peut pas
  être dépassé. Quand une couleur est résorbée (lot 6), le plafond doit
  descendre avec elle : la liste dit toujours la vérité.

**`config_flow.py` a ses tests.** `tests/python/test_config_flow.py` les fait
tourner contre une doublure de `ConfigFlow` (dans `doublures_ha.py`), et le
même parcours tourne contre le vrai Home Assistant dans le banc.

## Ce que cela coûte

- **Le banc HA tourne une fois par semaine**, et non à chaque push : une
  dérive se voit au plus tard le lundi suivant.
- **Le cliquet des couleurs** demande de descendre un plafond à chaque
  couleur résorbée, comme celui des avertissements d'eslint.
- **Les versions Python épinglées** ne montent plus seules : c'est voulu.

## Ce qui n'est pas fait

- **Les deux exécutions de `npm test`** (la seconde pour la couverture) sont
  gardées : les tests de la CI épinglent l'une et l'autre.
- **La matrice de versions** (plusieurs Node, plusieurs Python, plusieurs
  Home Assistant) n'est pas mise en place : le banc vérifie le minimum
  annoncé, la suite ordinaire tourne sur la version de la CI.
