# 0304 — Les ambiances et les scénarios prennent la couleur, le blanc et le fondu

*30 octobre 2026 — à l'essai, rien de publié (chantier G5, d'après la comparaison des intégrations Gladys du 30/10, section « Éclairage » : propositions 1 et 2)*

*Complète les ADR [0261](0261-l-ecran-a-une-seule-idee-de-la-lumiere.md) (le repli des Scènes) et [0198](0198-le-carnet-des-lumieres.md) (le carnet des lumières).*

## Le problème

- **L1, vérifié par un test** (`tests/scenes_couleurs.test.mjs`, premier test, rouge avant la correction). Sans script
  désigné, « Nightlight » partait en un seul `light.turn_on … brightness_pct=0` vers toutes les lampes variables de la maison.
  Home Assistant traite une luminosité nulle comme une extinction : l'ambiance « veilleuse » ÉTEIGNAIT la maison.
- **L2.** Sans script (`hueScripts`, qu'aucun écran n'écrit plus depuis l'ADR 0103), la bibliothèque ne posait aucune couleur :
  seule la luminosité partait. Ses pièces étaient écrites en dur (`HUE_ROOMS` : Séjour, Chambre, Chambre enfant, Toute la maison).
- Les scénarios n'envoyaient qu'une luminosité (`brightness_pct`) : ni fondu, ni blanc.

## La décision

**1. La bibliothèque pose ses couleurs elle-même** (`HUE_SCENES` et `ScenesContent` gardés, aucune ambiance retirée).

- Lampe par lampe, par `commander` (la capacité que la lampe déclare, ses bornes, le compte de la personne — le carnet le note à
  son nom). Les calculs vivent dans `lumieresfiche.js`, chargé avec les Scènes, jamais au démarrage (`ordresAmbiance`) :
  - une lampe **couleur** prend une des cinq couleurs, réparties sur les lampes couleur de la pièce dans l'ordre de leurs noms
    (jusqu'à cinq lampes, étalées sur l'ambiance ; au-delà, on recommence) ; en `xy_color` si elle parle `xy`, en `hs_color`
    sinon — les conversions de Home Assistant (`color_RGB_to_xy`, `color_RGB_to_hs`) ;
  - une lampe à **blanc réglable** prend le blanc le plus proche de la couleur moyenne de l'ambiance (la table des blancs de la
    carte, par pas de 50 K), dans ses `min_` / `max_color_temp_kelvin` ;
  - un **variateur** prend la luminosité seule ; une lampe tout ou rien, rien ;
  - **« Nightlight »** (luminosité 0 dans la bibliothèque) : 1 % au blanc le plus chaud de la lampe ; une lampe couleur sans blanc
    prend la couleur de 2 200 K. La carte de l'ambiance dit « 1 % ». Plus aucune luminosité nulle ne part ;
  - `transition: 1` à la lampe qui sait fondre (bit 32).
- Le moteur (`actions.js`) gagne deux capacités, `set_hs` et `set_xy` (accordées à tout mode couleur, comme `set_color`), dont
  la valeur reste dans son domaine ; `set_hs`, `set_xy` et `set_color_temp` acceptent `brightness_pct` et `transition`,
  `set_brightness` accepte `transition` : la couleur et sa luminosité partent dans le MÊME appel.
- **Les pièces sont les zones de Home Assistant** qui ont une lampe d'ambiance, après « Tout », dans une liste (`ListeChoix`) :
  une rangée de puces ne tiendrait pas au téléphone. « Blanc chaud », « Éteindre » et la luminosité seule suivent la pièce.
  **Compatibilité** : un `input_select` désigné (`hueScripts.room`) garde ses options comme pièces, la pièce choisie le règle
  comme avant, et l'ambiance sans script va à la zone du même nom. Toute la maison seulement pour « Tout » ou l'option
  « Toute la maison » : une pièce sans zone d'ambiance (« Séjour » face à « Salon », une zone qui n'a que sa veilleuse, un
  `input_select` muet) n'envoie RIEN — ni ambiance, ni « Blanc chaud », ni « Éteindre », ni luminosité —, et la section le
  dit en une ligne (« Aucune lampe d'ambiance dans … », relecture du 31/10).
- Un **script désigné** (`hueScripts.apply`) garde la priorité : il reçoit l'ambiance entière, comme avant.
- Les **veilleuses** restent épargnées ; tant que la règle Nuit n'est pas lue, rien ne part (B15).

**2. Fondu et blanc dans les scénarios.**

- Chaque action « lumières » prend un **fondu** facultatif (secondes, 1 h au plus) et, pour un allumage, un **blanc**
  facultatif (1 500 à 10 000 K). Absents, nuls ou vides : l'action d'avant. Le schéma est celui du patch existant
  (`loggia/scenarios/config`) : aucune commande WebSocket nouvelle, un scénario enregistré reste valide.
- La lampe fait le fondu elle-même (`transition`), seulement si elle l'annonce (`lumieres_maison.sait_fondre`, sorti de
  `nuit.py`, que la veilleuse lit aussi) : Loggia n'a rien de différé à tenir. Le blanc va aux lampes qui le prennent
  (blanc réglable ou couleur : Home Assistant convertit), borné par chacune. Les lampes au même ordre partent ensemble.
- Les scénarios de Loggia : « Bonne nuit » s'éteint en 10 s, « Réveil » monte à 30 % en 3 min, « Cinéma » se règle en 3 s.
  Un scénario intégré déjà modifié garde ses actions : rien n'est imposé.
- L'écran : des puces (Aucun · 3 s · 10 s · 1 min · 3 min ; Aucun · Chaude · Neutre · Froide — les blancs nommés de la fiche
  d'une lumière, 2 200 / 4 000 / 6 500 K), choisies en bleu plein. Elles ne paraissent que si une lampe visée sait le faire :
  `loggia/scenarios/etat` le dit par portée (`lampes` : maison, pièces de vie, chaque pièce) ; un réglage déjà là reste visible
  pour qu'on puisse le retirer.
- **Le carnet** : la fonte (30 s) et l'écho (10 s) ne couvrent pas un fondu de 3 min. Le scénario l'**annonce** au carnet avant
  l'ordre (`annoncer_fondu`), avec le contexte de cet ordre (`Context.id`, que portent ses premiers paliers). Jusqu'à sa fin
  plus 10 s, pour un état SANS compte ou de ce contexte : vers un niveau, les paliers se fondent dans la note du fondu ; vers
  l'extinction, un `on` STRICTEMENT plus bas qu'avant (un palier, l'écho) ne fait pas de note et le dernier niveau reste celui
  d'avant (« se rallumera à 80 % », pas 3 %). Une note sans auteur prend celui du fondu seulement dans son SENS (un `on` vers un
  niveau, un `off` vers l'extinction). Le geste d'un compte — même celui qui a lancé le scénario, par un autre ordre — et un
  rallumage à son niveau d'avant ou plus haut restent des gestes (relecture du 31/10). Le fondu ne s'écrit jamais sur le
  disque. Un fondu de 3 min fait UNE entrée.

**La démo** porte les deux cas : la chambre a une lampe couleur qui sait fondre (le ruban), une lampe à blanc réglable,
un variateur et la veilleuse ; ses scénarios ont les trois fondus et disent ce que leurs lampes savent faire.

## Ce que ça coûte

- **Redémarrage de Home Assistant** : `scenarios.py`, `lumieres.py`, `lumieres_calcul.py`, `lumieres_maison.py`, `nuit.py`.
- Deux textes nouveaux, « Fondu » et « Aucune lampe d'ambiance dans {p} », en sept langues ; « Enfant », que seul
  `HUE_ROOMS` lisait, quitte les six catalogues.
- Toutes les puces de la fiche d'un scénario (teinte, nature, gestes, portées, moments, fondu, blanc) suivent désormais sa
  règle, sans exception : choisie, bleu plein et texte blanc (31/10). La teinte du scénario n'est plus le fond d'une puce ; elle
  reste le point de chaque puce de teinte et l'icône de chaque action.

## Ce qu'on n'a pas fait

- La veilleuse de la règle Nuit n'annonce pas son fondu au carnet (son journal a déjà sa règle à l'écran, ADR 0198).
- Non vu chez lui : le comportement réel de ses Hue (Zigbee2MQTT) pendant un fondu de 3 min. Les tests jouent des paliers de
  2 à 61 s, et un `off` d'abord suivi d'un écho.

## Les tests

`tests/scenes_couleurs.test.mjs` (L1, les pièces, la répartition, le blanc, `xy`/`hs`, le script, la compatibilité, la démo, le
moteur), `tests/scenario_fondu.test.mjs` (les puces, l'enregistrement, la démo), `tests/python/test_lumieres_fondu.py` (un
fondu de 3 min, une entrée, dans les deux sens), `test_lumieres.py`, `test_lumieres_maison.py`, `test_scenarios.py`.
Assertions modifiées : `tests/actions.test.mjs`, `tests/lot15_tests_ci.test.mjs`, `tests/scenarios.test.mjs`.
