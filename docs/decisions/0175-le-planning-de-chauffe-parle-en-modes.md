# 0175 — Le planning de chauffe parle en modes

*9 octobre 2026 — accepté, à l'essai (plan 1 du chantier Chauffage, rien de publié)*

## Le problème

> « Quatre ordres par jour, rien à réguler, le radiateur garde le dernier ordre
> si HA tombe. » — décision D1, `docs/chantier-chauffage.md`.

Loggia n'avait aucun programme de chauffe. Chez celui qui l'a écrit, deux
radiateurs à fil pilote (des modules qui reçoivent des ORDRES — Confort, Éco,
Hors-gel, Arrêt — et règlent eux-mêmes sur leur molette) et un poêle qui parle
en degrés. Ailleurs, des thermostats virtuels (VTherm) qui régulent déjà sur
une sonde. Un planning en températures aurait obligé Loggia à réguler ce que
les appareils savent déjà réguler ; un planning en modes leur donne ce qu'ils
comprennent.

## La décision

**Six modes** — Confort, Confort −1, Confort −2, Éco, Hors-gel, Arrêt — et
chaque famille les reçoit dans sa langue (`chauffage_familles.py`) :

| Famille | Comment on la reconnaît | Ce qui part |
|---|---|---|
| fil pilote | un `select` dont les options portent les quatre ordres (`comfort`, `eco`, `frost_protection`, `off`, ou « Confort », « Hors-gel », « Arrêt »…) **et** dont l'`unique_id` ou le nom d'origine dit « pilot wire » | `select.select_option`, avec l'option **telle que le module l'écrit** |
| thermostat | tout autre `climate` qui n'est pas de Loggia et qui accepte une consigne (`TARGET_TEMPERATURE`) : un `climate` à préréglages seuls (un Heatzy…) n'en est pas un | `climate.set_temperature` : une consigne par mode, gardée en °C (20 / 17 / 7, Confort −1 et −2 déduits du Confort sans jamais passer sous l'Éco), envoyée dans l'unité de la maison, au pas de l'appareil et dans ses bornes ; s'il n'est pas en chauffe, `climate.set_hvac_mode: heat` part d'abord — un `hvac_mode` passé à `set_temperature` n'est lu que par certaines intégrations ; Arrêt = `set_hvac_mode: off` |
| VTherm | la plateforme `versatile_thermostat` | `set_preset_mode` (`comfort`, `eco`, `frost`) ; Arrêt = `off`. **Jamais** `set_temperature` : son préréglage passerait à `none` et sa propre présence ne s'appliquerait plus |

- **Deux familles de signaux, jamais le `friendly_name`** : des options seules
  ne font pas un fil pilote (ADR 0164, ADR 0174). C'est le **serveur** qui
  classe ; l'écran lira sa réponse.
- Un chauffage n'offre que **les modes qu'il comprend** ; un mode qu'il ne
  comprend pas prend le plus proche qu'il comprend (Confort −1 → Confort,
  Confort −2 → Confort −1 puis Confort, Éco → Hors-gel, Hors-gel → Éco,
  Arrêt → Hors-gel puis Éco) : une maison en Vacances sur un VTherm sans
  `frost` le met en Éco. Un Confort qu'il ne comprend pas ne donne rien.
- **Les températures tiennent l'ordre du froid au chaud** : pour un thermostat,
  Confort −1 et −2 ne descendent jamais sous l'Éco (`max(confort − n, éco)`), si
  bien qu'une fenêtre ou une Absence réglée sur Éco ne réchauffe jamais une
  pièce, et l'écriture ne refuse que l'absurde — un Éco plus chaud que le
  Confort, ou un Hors-gel pas plus froid que l'Éco
  (`chauffage_temperatures_desordre`) —, un petit abaissement (Confort 20, Éco
  19) restant permis.
- **Un seul calcul, en deux langues.** « Que doit faire ce chauffage à cette
  heure ? » vit dans `chauffage_calcul.py`, sans import de Home Assistant, et
  dans son jumeau `src/chauffage.js`. Les deux lisent
  `tests/fixtures/chauffage_parite.json` : la carte ne pourra pas dire
  « jusqu'à 23:00, puis Éco » autrement que le serveur ne décide.
- **L'heure murale d'un côté, les instants de l'autre.** Le calcul raisonne en
  (jour, minute) ; le moteur (`chauffage.py`) seul convertit, avec le fuseau de
  la maison : un « 02:30 » qui n'existe pas (passage à l'heure d'été) tombe à
  03:00, un « 02:30 » qui existe deux fois tombe à la première fois — et ne
  repart pas à la seconde, l'appareil y étant déjà. Et le planning ne recule
  jamais : au second passage de l'heure répétée d'octobre (02:00-03:00), le
  calcul lit 02:59 et non l'heure affichée, si bien qu'un « 02:15 » ne défait
  pas le changement de 02:45 déjà appliqué.
- La semaine **boucle** : un jour sans changement reprend la fin de la veille,
  et lundi matin celle du dimanche soir. Le « prochain changement » ignore un
  changement qui ne change rien (un Éco suivi d'un Éco).
- **Un planning a toujours au moins un changement** : l'écriture refuse une
  semaine vide (`chauffage_semaine_vide`), la lecture reprend la semaine type —
  sans cela, un chauffage resterait dans son dernier mode après une fenêtre, une
  Absence ou l'Été.

## Ce qu'on n'a pas fait

**Réguler sur une sonde.** C'est le métier de VTherm, et un fil pilote règle
sur sa molette.

**Lire un mode par le nom de l'entité.** Le nom se renomme et se traduit.

**Planifier un `climate` à préréglages seuls.** Sans consigne en degrés
(certains boîtiers de fil pilote), il n'a pas de planning dans cette version :
une famille « préréglages » viendra plus tard.

## Ce que les tests tiennent

`tests/python/test_chauffage_calcul.py` (le calcul), `test_chauffage_parite.py`
et `tests/chauffage.test.mjs` (la même fixture des deux côtés),
`test_chauffage_familles.py` (familles, ordres, « déjà dans le mode »),
`test_chauffage.py` (le fuseau de Paris écrit à la main : la machine de
développement n'a pas de base des fuseaux — les deux changements d'heure de
2026-2027 y sont rejoués).
