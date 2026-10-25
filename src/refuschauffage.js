/* ── Les refus du planning de chauffe que seules la fiche et la barre « Maison » reçoivent ──
 *
 * La configuration (`loggia/chauffage/config`) ne s'écrit que depuis la fiche
 * d'un chauffage, et une date de retour de Vacances (`/maison`) que depuis la
 * barre « Maison » : ces refus-là n'arrivent qu'à elles, toutes deux chargées
 * à la demande. Chacune les enregistre en se chargeant
 * (`enregistrerRefus(REFUS_CHAUFFAGE)`, refus.js) ; le démarrage ne garde que
 * les quatre qu'une CARTE peut recevoir d'une reprise en main, dits sans lieu
 * (relecture des tâches 11 et 12 du plan 2 : 918 octets de moins au
 * démarrage). Les phrases sont celles d'avant, mot pour mot
 * (tests/chauffage_refus.test.mjs) ; `chauffage_mode_inconnu` et
 * `chauffage_temperature_hors_bornes` y reprennent leur lieu.
 *
 * Le serveur nomme OÙ il refuse (chauffage_config.py) : « jeu[2].h » ou
 * « jeu[2].mode » se disent « jeudi, changement 3 », « jeu » seul « jeudi »,
 * « temperatures.eco » le mot du mode ; autre chose — « semaine »,
 * « fenetre », « mode », l'identifiant opaque d'un chauffage, la clé de la
 * date des Vacances — ne s'affiche jamais : la phrase générale. Les bornes —
 * 12 changements par jour, 5 à 30 °C — sont celles du serveur
 * (MAX_CHANGEMENTS_JOUR, TEMPERATURE_MIN / MAX). Les mots se lisent à
 * l'APPEL : bâtis au chargement, ils garderaient la langue du démarrage.
 */
import { tr, trN, locale } from './i18n.js';

/* Le nom du jour vient d'Intl, dans la casse de la langue (« jeudi »,
 * « Donnerstag ») : le 1er janvier 2024 est un lundi. `nomJour` (robots.js)
 * met une capitale. */
const JOURS_CHAUFFAGE = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
function ouDansLePlanning(k) {
  const s = String(k == null ? '' : k);
  const jour = /^(lun|mar|mer|jeu|ven|sam|dim)(?:\[(\d+)\]\.(?:h|mode))?$/.exec(s);
  if (jour) {
    const nom = new Date(2024, 0, 1 + JOURS_CHAUFFAGE.indexOf(jour[1])).toLocaleDateString(locale(), { weekday: 'long' });
    return jour[2] == null ? nom : tr('{jour}, changement {n}', { jour: nom, n: Number(jour[2]) + 1 });
  }
  const consigne = /^temperatures\.(confort|eco|hors_gel)$/.exec(s);
  if (!consigne) return '';
  return { confort: tr('Confort'), eco: tr('Éco'), hors_gel: tr('Hors-gel') }[consigne[1]];
}

/** Les refus du planning de chauffe, par leur code : `(clé nommée, nombre) => phrase`. */
export const REFUS_CHAUFFAGE = {
  chauffage_heure_illisible: (k) => {
    const ou = ouDansLePlanning(k);
    return ou ? tr('Heure illisible ({ou}).', { ou }) : tr('Heure illisible.');
  },
  chauffage_heure_en_double: (k) => {
    const ou = ouDansLePlanning(k);
    return ou ? tr('Deux changements à la même heure ({ou}).', { ou }) : tr('Deux changements à la même heure.');
  },
  chauffage_mode_inconnu: (k) => {
    const ou = ouDansLePlanning(k);
    return ou ? tr('Ce chauffage ne connaît pas ce mode ({ou}).', { ou }) : tr('Ce chauffage ne connaît pas ce mode.');
  },
  chauffage_trop_de_changements: (k) => {
    const ou = ouDansLePlanning(k);
    return ou ? tr('12 changements par jour au plus ({ou}).', { ou }) : tr('12 changements par jour au plus.');
  },
  chauffage_semaine_vide: () => tr('Un planning garde au moins un changement.'),
  chauffage_temperature_hors_bornes: (k) => {
    const ou = ouDansLePlanning(k);
    return ou ? tr('Température hors bornes ({ou}) : de 5 à 30 °C.', { ou }) : tr('Température hors bornes : de 5 à 30 °C.');
  },
  chauffage_temperatures_desordre: () => tr('Les températures doivent rester dans l’ordre : Hors-gel sous Éco, Éco au plus Confort.'),
  chauffage_trop_de_chauffages: (k, n) => (typeof n === 'number' ? trN(n, '{n} chauffage au plus.', '{n} chauffages au plus.') : null),
  chauffage_date_illisible: () => tr('Date de retour illisible ou déjà passée.'),
  // Le serveur nomme le `switch` du programme ; la fiche, elle, le dit par son nom (Avertissements).
  // Velair, Scheduler ou une automatisation commande déjà ce chauffage (D5 ; audit du 19/10).
  chauffage_programme_concurrent: () => tr('Un autre programme commande déjà ce chauffage : coupez-le d’abord pour que le planning commande seul.'),
  chauffage_programme_appareil: () => tr('Son propre programme est allumé : coupez-le d’abord pour que le planning commande seul.'),
};
