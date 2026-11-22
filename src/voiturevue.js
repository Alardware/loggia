/* ── Ce que montrent la carte et la fiche de la voiture (chantier du 20/11, A11 ; ADR 0386) ──
 *
 * Chargé avec elles seulement (voiture.jsx) : le démarrage n'en porte rien. La découverte, elle, est dans `composes.js`, qui
 * rend aussi les lecteurs d'état (en charge, branchée, verrouillée, ouvrants ouverts) : on les réutilise, on ne les recopie pas.
 *
 * Rien n'est supposé : une unité vient de l'entité (km ou mi, bar, psi, kPa), un pneu est « bas » quand SON binaire le dit,
 * jamais sous une pression choisie ici, une rangée sans entité lisible ne s'écrit pas.
 */
import { tr } from './i18n.js';
import { nombre } from './format.js';
import { entitesCompose, voitureEnCharge, voitureBranchee, voitureVerrouillee, ouvrantsOuverts } from './composes.js';

const MUETS = ['unavailable', 'unknown'];
const lisible = (st) => !!st && st.state != null && MUETS.indexOf(String(st.state)) < 0;
const SEPARATEURS = /^[\s·:\-–—_]+/;
// Un chiffre et son unité ne se coupent pas en fin de ligne.
const INSECABLE = ' ';

/** La mesure d'une entité : `{ n, unite }`, ou null quand elle se tait ou ne dit pas un nombre. */
function mesure(S, id) {
  const st = id ? S[id] : null;
  if (!lisible(st)) return null;
  const n = parseFloat(st.state);
  return Number.isFinite(n) ? { n, unite: (st.attributes && st.attributes.unit_of_measurement) || '' } : null;
}

/**
 * Le nom d'une entité dans Home Assistant, sans le nom de l'appareil devant (« Voiture Autonomie » → « Autonomie »). Le plus long
 * des préfixes qui s'applique, à une frontière de mot : « Car » ne mange pas « Carbone ». Un nom qui ne serait plus rien reste entier.
 */
export function nomSansAppareil(brut, ...appareils) {
  const b = String(brut == null ? '' : brut).trim();
  const prefixes = appareils.filter(Boolean).map(a => String(a).trim()).filter(Boolean).sort((x, y) => y.length - x.length);
  for (const p of prefixes) {
    if (b.length > p.length && b.slice(0, p.length).toLowerCase() === p.toLowerCase() && SEPARATEURS.test(b.slice(p.length))) {
      const reste = b.slice(p.length).replace(SEPARATEURS, '').trim();
      if (reste) return reste.charAt(0).toUpperCase() + reste.slice(1);
    }
  }
  return b;
}

/** L'entité qui représente la voiture : celle dont la carte porte l'icône choisie et que « L'appareil » ouvre. */
export const idPrincipal = (c) => (c ? [c.batterie, c.carburant, c.autonomie, c.compteur, c.position, c.verrou, c.charge, c.prise].find(Boolean) || entitesCompose(c)[0] || null : null);

/**
 * Ce que montrent la carte et la fiche de la voiture.
 * `{ nom, mort, etat, enCharge, ouverte, phrase: { texte, encre }, plaque: [fond, encre], chiffre, autonomie, position, lignes }`.
 *  - `etat` : 'muette' | 'ouverte' | 'charge' | 'branchee' | 'verrouillee' | 'deverrouillee' | null (elle ne dit rien) ;
 *  - `chiffre` : `{ v, u, nom, pct, batterie }` — la batterie, sinon le carburant ; `pct` le nombre brut ; ou null ;
 *  - `autonomie` : `{ valeur, unite }` ou null ;
 *  - `position` : « À la maison », le nom de la zone, « Hors de la maison », ou null ;
 *  - `lignes` : les rangées de la fiche, dans l'ordre, chacune `{ cle, titre, … }` (une rangée sans entité lisible n'y est pas).
 */
export function vueVoiture({ c, S = {}, nom = null }) {
  if (!c) return null;
  S = S || {};
  const st = (id) => (id && S[id]) || null;
  const nomApp = nom || c.nom || tr('Voiture');
  const mort = !entitesCompose(c).some(id => lisible(st(id)));
  const ouverts = mort ? [] : ouvrantsOuverts(c, S);
  const enCharge = !mort && voitureEnCharge(c, S);
  const branchee = !mort && voitureBranchee(c, S);
  const verrouillee = mort ? null : voitureVerrouillee(c, S);
  const ouverte = ouverts.length > 0;
  let etat = null;
  if (mort) etat = 'muette';
  else if (ouverte) etat = 'ouverte';
  else if (enCharge) etat = 'charge';
  else if (branchee) etat = 'branchee';
  else if (verrouillee === true) etat = 'verrouillee';
  else if (verrouillee === false) etat = 'deverrouillee';

  const batt = mort ? null : mesure(S, c.batterie);
  const fuel = mort || batt ? null : mesure(S, c.carburant);
  const haut = batt || fuel;
  const chiffre = haut ? { v: nombre(haut.n, 0), u: batt ? (haut.unite || '%') : haut.unite, nom: batt ? tr('Batterie') : tr('Carburant'), pct: haut.n, batterie: !!batt } : null;
  const km = mort ? null : mesure(S, c.autonomie);
  const autonomie = km ? { valeur: nombre(km.n, 0), unite: km.unite } : null;

  const mots = { muette: tr('Indisponible'), ouverte: tr('Ouverte'), charge: tr('En charge'), branchee: tr('Branchée'), verrouillee: tr('Verrouillée'), deverrouillee: tr('Déverrouillée') };
  const encres = { muette: 'var(--o-bad)', ouverte: 'var(--o-warn)', charge: 'var(--o-ok)', branchee: 'var(--o-text2)', verrouillee: 'var(--o-text2)', deverrouillee: 'var(--o-warn2)' };
  const reste = autonomie ? autonomie.valeur + (autonomie.unite ? INSECABLE + autonomie.unite : '') : null;
  const phrase = etat === 'muette'
    ? { texte: mots.muette, encre: encres.muette }
    : { texte: [etat ? mots[etat] : null, reste].filter(Boolean).join(' · ') || '—', encre: etat ? encres[etat] : 'var(--o-text2)' };
  const plaque = etat === 'ouverte' ? ['rgba(var(--o-warn-rgb),.18)', 'var(--o-warn)']
    : etat === 'charge' ? ['rgba(var(--o-ok-rgb),.18)', 'var(--o-ok)']
    : mort ? ['var(--o-s1)', 'var(--o-text3)'] : ['var(--o-s1)', 'var(--o-text1)'];

  const pos = mort ? null : (lisible(st(c.position)) ? String(st(c.position).state) : null);
  const position = pos == null ? null : pos === 'home' ? tr('À la maison') : pos === 'not_home' ? tr('Hors de la maison') : pos;

  const nomDe = (id) => {
    const s = st(id);
    const brut = (s && s.attributes && s.attributes.friendly_name) || String(id).split('.').slice(1).join('.').replace(/_/g, ' ');
    return nomSansAppareil(brut, nom, c.nom);
  };
  const lignes = [];
  const mesuree = (cle, titre, id, decimales = 0) => {
    const m = mesure(S, id);
    if (m) lignes.push({ cle, titre, valeur: nombre(m.n, decimales, 0), unite: m.unite });
  };
  mesuree('batterie', tr('Batterie'), c.batterie);
  mesuree('carburant', tr('Carburant'), c.carburant);
  (c.autonomies || []).forEach(id => mesuree('autonomie:' + id, nomDe(id) || tr('Autonomie'), id));
  mesuree('kilometrage', tr('Kilométrage'), c.compteur);
  // La charge : son binaire ou son état ; la prise dit « Branchée » ou « Débranchée » ; une charge à l'arrêt sans prise ne dit que cela.
  if (!mort && (lisible(st(c.charge)) || lisible(st(c.prise)))) {
    const valeur = enCharge ? tr('En charge') : lisible(st(c.prise)) ? (branchee ? tr('Branchée') : tr('Débranchée')) : tr('Pas en charge');
    lignes.push({ cle: 'recharge', titre: tr('Recharge'), valeur, encre: enCharge ? 'var(--o-ok)' : null });
  }
  if (verrouillee != null) {
    const lock = c.verrou && String(c.verrou).split('.')[0] === 'lock' && lisible(st(c.verrou));
    lignes.push({
      cle: 'verrou', titre: tr('Verrou'), valeur: verrouillee ? tr('Verrouillée') : tr('Déverrouillée'), encre: verrouillee ? null : 'var(--o-warn2)',
      // Le seul geste de la voiture : verrouiller. Jamais déverrouiller — verrouiller ne laisse entrer personne.
      verrouiller: !verrouillee && lock ? c.verrou : null,
    });
  }
  if ((c.ouvrants || []).some(id => lisible(st(id)))) {
    lignes.push(ouverts.length
      ? { cle: 'ouvrants', titre: tr('Ouvrants'), valeur: ouverts.map(nomDe).join(', '), encre: 'var(--o-warn)' }
      : { cle: 'ouvrants', titre: tr('Ouvrants'), valeur: tr('Tout est fermé'), encre: null });
  }
  // Les pneus : les pressions avec leur unité ; « bas » quand le binaire du pneu est allumé — rattaché à sa pression par son nom,
  // sinon montré seul. Aucun seuil de pression n'est deviné.
  const bas = (c.pneus || []).filter(id => lisible(st(id)) && String(st(id).state) === 'on');
  const cle = (id) => nomDe(id).toLowerCase();
  const items = (c.pressions || []).map(id => {
    const m = mesure(S, id);
    return m ? { id, nom: nomDe(id), valeur: nombre(m.n, 2, 0), unite: m.unite, bas: bas.some(b => cle(b) === cle(id)) } : null;
  }).filter(Boolean);
  bas.forEach(b => { if (!items.some(i => i.bas && cle(i.id) === cle(b))) items.push({ id: b, nom: nomDe(b), valeur: null, unite: '', bas: true }); });
  if (!mort && items.length) lignes.push({ cle: 'pneus', titre: tr('Pneus'), items });

  return { nom: nomApp, mort, etat, enCharge, ouverte, phrase, plaque, chiffre, autonomie, position, lignes: mort ? [] : lignes };
}
