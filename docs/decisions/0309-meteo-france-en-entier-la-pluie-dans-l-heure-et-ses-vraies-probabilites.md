# 0309 — Météo-France en entier : la pluie dans l'heure, ses vraies probabilités, plus jamais un « 0 % » inventé

*1er novembre 2026 — appliqué (v3.97.0) (lot 5 du rapport « Gladys comparé au catalogue », 31/10 : D14, W1, W2)*

*Complète l'ADR [0303](0303-l-air-et-les-uv-dans-la-meteo.md) : après l'air et les UV, la pluie de la fiche météo.*

## Le problème

- **D14.** Avec la météo de Météo-France, le cadre « Risques » de la fiche
  écrivait toujours « Pluie 0 % · Neige 0 % », même sous l'averse. La
  prévision horaire de Météo-France, dans Home Assistant, n'a pas de
  `precipitation_probability`. Les probabilités étaient vides, les
  températures non, et `max([])` valait 0.
- **W2.** Les vraies probabilités existent, dans des capteurs à part de
  l'intégration : `rain_chance`, `snow_chance`, `freeze_chance`. Personne ne
  les lisait. Il n'y a pas de `thunder_chance` dans l'intégration.
- **W1.** Le capteur `next_rain` dit la pluie de l'heure qui vient. Son état
  est l'heure de la première tranche pluvieuse, vide s'il ne pleut pas dans
  l'heure. Son attribut `1_hour_forecast` donne la description de chaque
  tranche après `forecast_time_ref` : « 0 min », « 5 min »… « 55 min », de
  5 puis de 10 minutes. Relevé dans l'historique d'une installation : « Temps
  sec », « Pluie faible », « Pluie modérée », « Pluie forte ». C'est la
  question qu'on se pose avant d'étendre du linge ; l'écran ne la posait pas.

Ces capteurs n'ont ni clé de traduction ni classe utile. Leur `unique_id`
est `<latitude>,<longitude>_<clé>` (lu dans le registre) : il porte les
coordonnées de la ville.

## La décision

- **Reconnaissance au serveur** (`meteo.py`, `role_meteo`) : plateforme
  `meteo_france`, domaine `sensor`, fin de l'`unique_id` — `_rain_chance`,
  `_snow_chance`, `_freeze_chance`, `_next_rain`. L'index porte le rôle seul,
  `meteo` : `pluie`, `neige`, `gel`, `pluie_heure`. Les coordonnées restent
  au serveur. Jamais par le nom.
- **Rattachement par l'appareil** (`capteursMeteo`, meteo.js) : un capteur ne
  compte que s'il est sur le même appareil que l'entité `weather` choisie —
  l'appareil de la ville. Une météo sans appareil ne prend la pluie de
  personne.
- **Les risques** (`risquesMeteo`, meteofiche.js) : une case sans valeur
  connue ne s'affiche pas. Le capteur de Météo-France passe avant la
  déduction ; un capteur muet ne vaut rien, et la déduction reprend. La pluie
  et la neige ne se déduisent que s'il existe une probabilité dans la
  prévision ; le gel, de la température, comme avant.
- **La pluie dans l'heure** (`pluieDansLheure`, meteo.js) : « Pluie dans
  20 min, pendant 25 min environ », « Pluie dans 20 min », « Pluie encore
  15 min environ », « Pluie en cours ». La fin est la première tranche sèche
  qui suit le début. Une tranche est sèche si elle ressemble aux tranches
  d'avant le début, que l'état dit sèches, ou si elle dit « Temps sec ». Une
  pluie qui court jusqu'au bout de l'heure n'a pas de durée : on ne la dit
  pas. Les minutes s'arrondissent à 5, le pas de la prévision. Rien sur une
  prévision de plus d'une heure, une averse passée, ou un état que les
  tranches contredisent.
- **La phrase** (`phraseMeteo`) : la pluie dans l'heure prend le texte du
  widget et de la fiche, au ton froid. Le conseil reste celui de la pluie des
  heures qui viennent, s'il y en a une ; sinon, pas de conseil. Une vigilance
  orange ou rouge garde la phrase, comme avant. Rien quand il ne pleut pas
  dans l'heure.
- **La démo** porte le cas : `weather.maison` est une météo Météo-France, sur
  un appareil de service, avec ses quatre capteurs (40 % de pluie, une averse
  faible dans 20 minutes, pour 25 minutes).

Écarté : lire la description de chaque tranche comme un niveau d'intensité.
Les mots viennent de Météo-France, en français ; seule la distinction sèche /
pluvieuse sert, et elle se déduit de l'état.

## Les conséquences

- Redémarrage de Home Assistant : le rôle se pose dans l'index du composant.
  Sans le composant à jour, rien ne se rattache, et la fiche se tait au lieu
  d'écrire « 0 % ».
- Trois textes nouveaux, en sept langues. Rien ne part au téléphone.
- Tests : `tests/meteo_france_en_entier.test.mjs`,
  `tests/python/test_meteo_france.py`.
- Pas fait : la vigilance orange ou rouge sur l'Accueil (W3, une décision qui
  reste à prendre) ; l'intensité de la pluie (« faible », « forte ») dans la
  phrase.
