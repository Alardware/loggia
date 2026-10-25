/* ── Les refus d'un départ de robot (chantier IoT, tâche 4 ; I3 A) ──
 *
 * `loggia/robots/lancer` refuse ce qu'il ne peut pas faire juste, et le dit
 * par un code (robots.py, `async_lancer_depart`) : un robot qui ne répond
 * plus, un robot déjà en route — ou qu'un départ de moins de 15 s attend —,
 * des pièces que son intégration ne sait pas viser — le serveur ne part pas
 * pour tout le logement à la place —, une zone qui n'est pas la sienne, une
 * tondeuse dont aucune zone n'est allumée, une bascule d'aire restée sans
 * réponse, un script maison qui n'est pas des siens, un appel que Home Assistant
 * refuse — pour un départ, ou pour un geste (passe bis 2 du 18/10). Ces refus
 * n'arrivent qu'après un geste de départ : la fiche d'un robot, chargée à la
 * demande, les enregistre en se chargeant (`enregistrerRefus`, refus.js),
 * comme celles du chauffage, et `lancerRobot` (robotsetat.js) les charge au
 * premier refus, d'où que vienne le départ — le démarrage n'en porte rien. Ce
 * que le serveur nomme — l'identifiant d'un robot ou d'une zone — ne
 * s'affiche jamais.
 */
import { tr } from './i18n.js';

/** Les refus d'un départ de robot, par leur code. */
export const REFUS_ROBOTS = {
  robot_injoignable: () => tr('Départ non lancé — le robot ne répond pas'),
  deja_en_route: () => tr('Départ non lancé — le robot est déjà en route'),
  pieces_inconnues: () => tr('Départ non lancé — Loggia ne sait pas viser des pièces avec ce robot'),
  zone_inconnue: () => tr('Départ non lancé — cette zone n’appartient pas au robot'),
  commande_refusee: () => tr('Départ non lancé — Home Assistant a refusé la commande'),
  // Un script maison qui n'est pas un de ceux du robot (passe bis du 18/10, point A) : le serveur ne lance que les siens.
  script_inconnu: () => tr('Script non lancé — ce n’est pas un script de ce robot'),
  /* Passe bis 2 du 18/10 : une tondeuse à aires dont aucune n'est allumée ne tond pas (point D) ; une bascule d'aire sans réponse à
   * temps la retient (point E) ; un GESTE refusé — la pause, la reprise, la base d'un script maison — n'est pas un « départ non lancé »
   * (point K). */
  aucune_aire: () => tr('Départ non lancé — aucune zone allumée : choisissez-en une dans la fiche'),
  sans_reponse: () => tr('Départ non lancé — Home Assistant n’a pas répondu à temps'),
  geste_refuse: () => tr('Commande non exécutée — Home Assistant a refusé ou n’a pas répondu'),
  /* Tranche robots 2 (ADR 0218) : un départ par les zones de Home Assistant se vérifie AVANT l'appel — l'association absente, une zone
   * sans pièce, une zone d'une autre carte (R4, R11) ; et chez Ecovacs, une liste de pièces que le robot ne publie plus ne part pas (Q2). */
  association_absente: () => tr('Départ non lancé — associez d’abord les pièces du robot aux zones dans Home Assistant'),
  zone_sans_piece: () => tr('Départ non lancé — cette zone n’a plus de pièce associée'),
  autre_carte: () => tr('Départ non lancé — ces pièces sont sur une autre carte du robot'),
  pieces_perimees: () => tr('Départ non lancé — la liste des pièces du robot a changé : rouvrez la fiche'),
  /* Sa décision du 20/10 (« Mon script garde la main ») : un script de départ est désigné, le serveur ne part pas par zones ni par
   * segments — l'écran n'en envoie pas, mais le refus se dit des mêmes mots. */
  scripts_gardent_la_main: () => tr('Départ non lancé — vos scripts gardent la main pour les pièces'),
};
