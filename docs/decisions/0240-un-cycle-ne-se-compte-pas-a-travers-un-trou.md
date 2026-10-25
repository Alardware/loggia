# 0240 — Un cycle ne se compte pas à travers un trou

*19 octobre 2026 — accepté, à l'essai (audit des prises, rien de publié). Complète l'ADR 0194.*

## Le problème

L'audit du 19/10 a prouvé trois défauts du suivi des cycles (plan 1 des prises) :

- la dernière puissance lue était supposée tenue pendant tout un écart de
  mesure. Une prise qui décroche, ou un redémarrage de Home Assistant en pleine
  chauffe, gonflait l'intégrale (essai : 3,33 kWh au lieu d'un compteur à
  1,10), et la règle « du simple au double » gardait alors l'intégrale fausse,
  qui partait dans l'alerte ;
- deux sorties d'une multiprise qui partagent un capteur étaient rangées dans
  une table `{capteur: interrupteur}` : la seconde écrasait la première, une
  seule était suivie, sans un mot ;
- l'écran proposait « Prévenir à la fin du cycle » pour tout électroménager,
  même quand le serveur ne suivait pas la prise.

## La décision

- **L'intégrale ne traverse pas un trou.** Un écart se compte sur dix minutes au
  plus (`ECART_MAX_S`) ; un `unavailable` / `unknown` coupe l'intégrale à cet
  instant (`couper`), et un redémarrage ne fait plus tenir la puissance. Le
  cycle est alors marqué « troué » (`troue`, gardé sur le disque), s'il tirait
  plus de 5 W : le compteur l'emporte, même au-delà du double. Un compteur qui
  dit moins de la moitié de l'intégrale (figé) ne passe toujours pas. Les kWh
  se comparent avant d'être arrondis.
- **Un capteur partagé ne fait suivre aucune sortie.** Personne ne peut dire à
  quelle sortie revient la puissance commune.
- **Le serveur dit ce qu'il suit** : chaque prise de `loggia/prises/etat` porte
  `suivi`. L'écran ne propose l'alerte que si `suivi` est vrai (à défaut du
  champ, un serveur plus ancien : la prise a un capteur de puissance).
- Le compteur se lit jusqu'à la baisse plus dix minutes : beaucoup de prises
  publient l'énergie en retard.
- Les unités du serveur sont celles de l'écran (`src/unites.js`) : mW, GW,
  VA, J, kJ, MJ… Une unité inconnue vaut facteur 1, comme à l'écran.
- Rien ne s'écrit avant que la mémoire soit relue du disque (`_relu`) ; la
  minute passe par `async_delay_save`, une étape du cycle s'écrit tout de suite,
  et l'arrêt écrit ce qui attendait. Les prises disparues sont purgées de la
  mémoire, sauf si le registre est illisible.
- Un minuteur ne se pose pas sur un appareil déjà éteint (`off`, `standby`) :
  refus nommé `minuteur_deja_eteint`, que l'écran traduit. Un appareil
  `unavailable` reste accepté (il revient souvent allumé).

## Les conséquences

- Il faut redémarrer Home Assistant (le composant change).
- Une pause de plus de dix minutes sous 5 W en milieu de programme (trempage)
  termine encore le cycle trop tôt : connu, non traité.
