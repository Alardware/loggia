// ─────────────────────────────────────────────────────────────────────────────
// Regroupement des automatisations.
//
// Home Assistant ne classe pas les automatisations : il n'y a que des NOMS,
// écrits au fil de l'eau. Les regrouper, c'est donc deviner — et deux pièges
// se sont vus tout de suite sur une installation réelle (retour 02/09) :
//
//   1. le PLURIEL. « Lumière salon » et « Lumières cuisine » faisaient deux
//      familles côte à côte, pour la même chose ;
//   2. le VERBE en tête. « Force veilleuse Liam » atterrissait dans une famille
//      « Force », alors qu'une veilleuse, c'est de la lumière.
//
// D'où l'ordre suivi ici : on cherche d'abord un mot de MÉTIER dans le nom
// entier — c'est lui qui dit de quoi parle l'automatisation, où qu'il se
// trouve — et l'on ne retombe sur le premier mot que si rien n'est reconnu.
// Ce repli saute les verbes d'action et ramène le pluriel au singulier, pour
// que « Lumière » et « Lumières » ne se séparent plus jamais.
// ─────────────────────────────────────────────────────────────────────────────

/** Minuscules sans accents : « Éclairage » et « eclairage » doivent se valoir. */
const sansAccent = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* Familles de métier, dans l'ordre où on les cherche. La première qui matche
 * gagne : « alarme lumière » est une affaire de sécurité avant d'être une
 * affaire de lampe. */
export const AUTO_FAMILLES = [
  ['Sécurité', /(alarme|alarmo|intrusion|serrure|verrou|camera|sonnette|portail|surveillance)/],
  ['Lumières', /(lumiere|lampe|veilleuse|eclairage|luminaire|led|spot|guirlande|plafonnier|suspension|applique)/],
  ['Volets', /(volet|store|rideau|persienne|brise.?soleil)/],
  ['Climat', /(chauffage|thermostat|clim|climatisation|radiateur|poele|granule|pompe.?a.?chaleur|consigne)/],
  ['Ventilation', /(vmc|ventilation|purificateur|humidificateur|deshumidificateur|aeration|ventilateur)/],
  ['Ouvrants', /(porte|fenetre|ouvrant|garage|baie)/],
  ['Présence', /(presence|arrivee|depart|absence|absent|personne|quitte|rentre)/],
  ['Énergie', /(energie|conso|consommation|tarif|heure.?creuse|solaire|batterie|panneau|onduleur|linky|delestage)/],
  ['Médias', /(media|musique|spotify|television|enceinte|volume|plex|radio|\btv\b)/],
  ['Robots', /(aspirateur|robot|tondeuse|luba|roborock|nettoyage)/],
  ['Arrosage', /(arrosage|irrigation|goutte.?a.?goutte)/],
  ['Notifications', /(notification|notif|alerte|rappel|previen|prevenir|message)/],
  ['Réveil', /(reveil|coucher|nuit|matin|soir|sommeil)/],
];

/* Verbes et mots de service qui commencent un nom sans rien dire du sujet.
 * « Force veilleuse » : c'est le mot d'APRÈS qui compte. */
const AUTO_VERBES = /^(force|forcer|allume|allumer|eteint|eteindre|coupe|couper|active|activer|desactive|desactiver|lance|lancer|met|mettre|envoie|envoyer|demarre|demarrer|arrete|arreter|ferme|fermer|ouvre|ouvrir|regle|regler|baisse|baisser|monte|monter|passe|passer|change|changer|notifie|notifier|synchronise|verifie|verifier|gere|gerer|auto|automatisation|routine|scenario|test|copie|nouvelle|nouveau)$/;

/**
 * Famille d'une automatisation, d'après son nom.
 *
 * Renvoie toujours quelque chose : à défaut de mot reconnu, le premier mot
 * significatif du nom, au singulier ; et « Divers » si le nom ne contient
 * aucun mot exploitable.
 */
export function autoFamille(nom) {
  const brut = String(nom || '').trim();
  if (!brut) return 'Divers';
  const n = sansAccent(brut);
  const trouve = AUTO_FAMILLES.find(([, re]) => re.test(n));
  if (trouve) return trouve[0];
  // Rien de reconnu : le premier mot qui ne soit pas un verbe d'action.
  const mots = brut.split(/[\s:–—_/-]+/).map(m => m.replace(/[^0-9A-Za-zÀ-ÿ]/g, '')).filter(m => m.length > 2);
  const mot = mots.find(m => !AUTO_VERBES.test(sansAccent(m))) || mots[0];
  if (!mot) return 'Divers';
  // Le pluriel rejoint le singulier — c'est là que « Lumière » et « Lumières »
  // se retrouvaient séparés.
  const sing = mot.replace(/([^sS])[sS]$/, '$1');
  return sing[0].toUpperCase() + sing.slice(1).toLowerCase();
}
