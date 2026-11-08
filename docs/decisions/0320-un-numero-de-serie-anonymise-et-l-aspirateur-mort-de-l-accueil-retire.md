# 0320 — Un numéro de série anonymisé, et l'aspirateur mort de l'Accueil retiré

*1er novembre 2026 — appliqué (v3.97.0) (lot 15 du rapport « Gladys comparé au catalogue » : deux décisions restées ouvertes après le lot 14)*

*Complète l'ADR [0319](0319-petits-correctifs-de-lecture-electricity-maps-prereglages-telephones-consommables.md) : après la tondeuse, l'aspirateur.*

## Le problème

- Un test publié (`tests/python/test_chauffage_familles.py`, le programme de l'appareil) portait le vrai numéro de série d'un
  poêle, dans trois `unique_id` (le climat, `…-crono_enabled`, `…-att_eco`). Le lot 4 avait anonymisé le même numéro dans
  `test_defauts_appareil.py` ; celui-ci était resté.
- `deriveAccueil` (`src/app/derive.jsx`) calculait `machines.aspirateur` — phase, couleur, batterie —, et rendait `vacLabel` et
  `vacBattery`. Aucun écran ne les lisait : l'Accueil ne lit que `machines.lv`. Le lot 14 avait retiré la tondeuse pour la même
  raison et laissé l'aspirateur, en attendant sa réponse. Sa réponse : « OUI, retire-le ».

## La décision

- Le numéro devient un code fictif, `0000000000002`, dans les trois identifiants. Le test vérifie la même chose : le programme
  se trouve à la clé (`crono_enabled`, `schedule`), jamais au nom. Plus aucun fichier du dépôt ne porte l'ancien numéro.
- Le bloc de l'aspirateur quitte `deriveAccueil`, avec ses variables, `vacLabel`, `vacBattery` et les imports qui ne servaient
  qu'à lui (`VACUUM_STATE_FR`, `couleurPile`). La carte du robot (`cartes/robot.jsx`) lit tout à la clé et s'abonne elle-même ;
  rien de ce qu'elle montre ne change.
- La clé « Sur base » n'était appelée que par ce bloc : elle quitte les six catalogues, le polonais compris. C'est un retrait,
  pas une réécriture, comme le permet `tests/polonais_seba882.test.mjs` (« une clé qui disparaît est permise ») ; aucune autre
  valeur polonaise ne bouge.

Écarté : retirer aussi `VACUUM_STATE_FR` de `resolve.js`. La table n'a plus de lecteur dans l'écran, mais `resolve.test.mjs`
l'épingle et ses mots vivent ailleurs ; ce serait un autre lot.

## Les conséquences

- Pas de redémarrage de Home Assistant. Le paquet de l'écran est à reconstruire.
- L'historique git publié garde l'ancien numéro (commit de la v3.94.0) : le réécrire serait sa décision, pas celle de ce lot.
- Tests : `tests/etats.test.mjs`, deux assertions modifiées (l'objet de l'aspirateur ne revient pas ; `couleurPile(` 7 → 6).
