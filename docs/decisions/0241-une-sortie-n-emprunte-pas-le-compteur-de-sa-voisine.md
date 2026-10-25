# 0241 — Une sortie n'emprunte pas le compteur de sa voisine

*19 octobre 2026 — accepté, à l'essai (audit des prises, rien de publié). Complète l'ADR 0193 (P1, P2).*

## Le problème

L'audit du 19/10 a joué 31 prises réelles : l'écran et le serveur les classent
pareil, mais la règle elle-même se trompait sur des cas courants.

- Home Assistant fait commencer le nom de chaque entité par celui de son
  appareil. Les sorties d'une multiprise partageaient donc toutes un mot avec
  le compteur commun, et recevaient toutes la puissance totale. Une sortie de
  Shelly 2PM renommée prenait le capteur du canal voisin.
- Un second switch sans catégorie sur l'appareil (le voyant d'une prise
  ESPHome, le verrou enfant de LocalTuya) devenait une prise, et pouvait
  prendre la carte du relais : couper la carte coupait le voyant.
- Le relais d'un compteur de la maison (Shelly EM) devenait une prise qui
  affichait la puissance de toute la maison. Le poêle de la maison, posé sur
  l'appareil qui porte l'énergie de toute la maison, n'y échappait que par
  chance de nommage.
- Les sirènes nommées « Alarme sonore » ou « Syrena » n'étaient pas vues comme
  sirènes.
- L'électroménager n'était reconnu ni en allemand, ni en néerlandais, ni en
  italien, ni en espagnol : aucun cycle suivi sans configurer.

## La décision

- **Sur un appareil à plusieurs sorties**, les mots du nom de l'appareil, et
  ceux que toutes les sorties partagent, ne comptent plus pour apparier une
  sortie et un capteur. À égalité, le numéro de canal de l'identifiant
  départage (`switch_0` ↔ `switch_0_power`) ; sinon, aucun capteur. Un capteur
  réclamé par deux sorties n'est donné à aucune.
- **Les sorties d'une multiprise qui mesure restent des prises**, sans capteur
  à elles (P1 : l'appareil mesure), sauf si rien ne prouve que le compteur est
  celui de l'appareil.
- **Les réglages ne sont pas des prises** : sur un appareil qui porte plusieurs
  switch sans catégorie, seuls ceux de classe `outlet` sont des prises s'il y en
  a ; sinon les réglages (voyant, LED, verrou, kindersicherung, blokada…, en sept
  langues) partent en IoT, jamais tous.
- **Un compteur de la maison n'a pas de prise** : le switch d'un appareil
  déclaré source réseau, solaire, batterie ou gaz dans le tableau Énergie de
  Home Assistant n'est jamais une prise, même `outlet`. Sans préférences
  énergie, rien ne change.
- Les sirènes se reconnaissent aussi aux mots du type `siren`.
- Les mots de chaque type existent en allemand, néerlandais, italien et
  espagnol ; aucun mot polonais existant n'est touché. Les faux amis relevés
  (sèche-cheveux, fer forgé, vélo, trottinette, projecteur de jardin,
  ventilateur tour) ne sont plus pris pour un appareil.
- La même règle à l'écran (`src/prises.js`) et au serveur (`prises_types.py`),
  tenue par la fixture de parité.

## Les conséquences

- Une sortie de multiprise renommée « … LED » passerait en IoT : risque accepté.
- Les `input_boolean` ne sont pas découverts (ce sont des aides, pas des
  appareils) ; ajoutés à la main, ils vont sous IoT.
- Huit mots polonais nouveaux sont à faire relire par Seba882.
