/* ── Tempo en clair : la couleur d'aujourd'hui, celle de demain, les jours restants ──
 *
 * (chantier du 20/11, A3 ; ADR 0385)
 *
 * Loggia ne disait que « Demain : jour rouge ». La carte du tarif dit désormais
 * « Aujourd'hui bleu · demain blanc · encore 14 rouges » : c'est ce qui explique
 * le prix affiché — un jour blanc n'est pas un jour bleu.
 *
 *   — la couleur d'AUJOURD'HUI est l'`enum` que le serveur marque `couleur`
 *     (`tarifs.py`, depuis E4) ; celle de demain, `couleur_demain`, se trouve
 *     déjà (`creneau.js`) ;
 *   — les JOURS RESTANTS : seulement si l'intégration les publie, et qu'on les
 *     reconnaît sans nom d'entité — un capteur de la MÊME intégration que la
 *     couleur, dont la clé de traduction dit à la fois un nombre de jours et une
 *     couleur (`days_red`, `jours_rouges`…). Sans clé, rien : on n'invente pas
 *     un nombre de jours.
 *
 * Aucun nombre n'est calculé ici : un compte de jours est celui que l'intégration
 * publie, ou il n'est pas dit. Pur ; pas de React, pas de Home Assistant.
 */
const COULEURS = { bleu: ['bleu', 'blue'], blanc: ['blanc', 'white'], rouge: ['rouge', 'red'] };
const JOURS = ['jour', 'jours', 'day', 'days'];

/** Les mots d'un texte, à plat : « TEMPO_Rouge » → ['tempo', 'rouge'] ; sans accent ni casse. */
function mots(texte) {
  return String(texte == null ? '' : texte).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** La couleur d'un état Tempo : 'bleu' | 'blanc' | 'rouge', ou null quand il n'en dit aucune — ou plusieurs. */
export function couleurTempo(etat) {
  const m = mots(etat);
  const dites = Object.keys(COULEURS).filter(c => COULEURS[c].some(x => m.indexOf(x) >= 0));
  return dites.length === 1 ? dites[0] : null;
}

/** La couleur que dit une clé de traduction — « days_red », « jours_rouges » : le mot, avec ou sans pluriel. */
const couleurDeCle = (cle) => couleurTempo(mots(cle).map(x => x.replace(/s$/, '')).join(' '));

/** Un capteur de jours restants, par sa clé de traduction : un mot de jours ET une couleur. */
const compteDeJours = (cle) => {
  const m = mots(cle);
  return m.some(x => JOURS.indexOf(x) >= 0) ? couleurDeCle(cle) : null;
};

/**
 * Ce que l'écran suit pour dire Tempo, dans la forme de `enHaids` : des identifiants, jamais deux fois la même clé.
 * `entites` : `[{ id, cle, desactive, tarif }]` (`listeEntites`, resolve.js) ; `plateformeDe(id)` : l'intégration d'une entité (l'index), ou null.
 * `{ tempoJour?, tempoRestantsBleu?, tempoRestantsBlanc?, tempoRestantsRouge? }` — chaque clé absente quand rien ne se trouve, ou quand deux candidats se disputent.
 */
export function haidsTempo(entites, plateformeDe = () => null) {
  const vivants = (Array.isArray(entites) ? entites : []).filter(e => e && e.id && !e.desactive && String(e.id).indexOf('sensor.') === 0);
  const jours = vivants.filter(e => e.tarif === 'couleur');
  const out = {};
  if (jours.length === 1) out.tempoJour = jours[0].id;
  // L'intégration du contrat : celle de la couleur du jour, à défaut celle de demain.
  const contrat = jours[0] || vivants.find(e => e.tarif === 'couleur_demain');
  const plateforme = contrat ? plateformeDe(contrat.id) : null;
  if (!plateforme) return out;
  Object.keys(COULEURS).forEach(c => {
    const bons = vivants.filter(e => !e.tarif && plateformeDe(e.id) === plateforme && compteDeJours(e.cle) === c).map(e => e.id);
    if (bons.length === 1) out['tempoRestants' + c.charAt(0).toUpperCase() + c.slice(1)] = bons[0];
  });
  return out;
}
