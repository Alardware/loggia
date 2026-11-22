/* ── Ce que montrent la carte et la popup de la litière et de la fontaine (chantier du 20/11, A12 ; ADR 0386) ──
 *
 * Chargé avec elles seulement (animaux.jsx) : le démarrage n'en porte rien. La découverte, elle, est dans `composes.js`, dont
 * les lecteurs (`bacPlein`, `sableBas`, `filtreUse`) servent ici tels quels. Pur : ni React ni Home Assistant.
 *
 * Aucun nombre n'est deviné : un bac « plein » est ce que son binaire ou le code de l'appareil dit, un filtre « usé » ce que
 * son binaire dit ou 0 % / 0 jour. L'eau d'une fontaine sans binaire ne se dit jamais « basse » sous un seuil choisi ici.
 */
import { tr, comparerTextes } from './i18n.js';
import { nombre } from './format.js';
import { bacPlein, sableBas, filtreUse, nomGenre } from './composes.js';

const MUETS = ['unavailable', 'unknown'];
const lisible = (S, id) => !!id && !!S[id] && S[id].state != null && MUETS.indexOf(String(S[id].state)) < 0;
const etatDe = (S, id) => (lisible(S, id) ? String(S[id].state) : null);
const chiffreDe = (S, id) => { const n = parseFloat(etatDe(S, id)); return Number.isFinite(n) ? n : null; };
const uniteDe = (S, id, repli = '') => (S[id] && S[id].attributes && S[id].attributes.unit_of_measurement) || repli;
const nomEntite = (S, id) => (S[id] && S[id].attributes && S[id].attributes.friendly_name) || String(id).split('.').slice(1).join('.');

const TEXTE1 = 'var(--o-text1)';
const GRIS = ['var(--o-s1)', TEXTE1];
const ETEINT = ['var(--o-s1)', 'var(--o-text3)'];
const ROUGE = ['rgba(var(--o-bad-rgb),.14)', 'var(--o-bad)'];
const AMBRE = ['rgba(var(--o-warn-rgb),.18)', 'var(--o-warn)'];
const VERT = ['rgba(var(--o-ok-rgb),.18)', 'var(--o-ok)'];
const ENCRE = { ok: 'var(--o-ok)', warn: 'var(--o-warn)', bad: 'var(--o-bad)' };

/* Les codes de Litter-Robot (`status_code`), en minuscules : [mot, ton, travail]. Les codes que la liste de l'intégration
 * donne et que rien ici ne nomme (défaut de capteur, de position, surcouple, pincement) disent « Défaut ». */
const CODES = {
  rdy: ['Prête'], ccc: ['Prête'], cst: ['Prête'], cd: ['Chat dedans'], ccp: ['Nettoie', 'ok', true],
  df1: ['Bac presque plein', 'warn'], df2: ['Bac presque plein', 'warn'], ec: ['Vide le bac', 'ok', true],
  p: ['En pause'], csi: ['En pause'], off: ['Éteinte'], offline: ['Hors ligne'], br: ['Capot retiré', 'bad'],
  pwru: ['Démarrage'], pwrd: ['Démarrage'],
};
const CODES_DEFAUT = ['csf', 'scf', 'dhf', 'dpf', 'hpf', 'otf', 'pd', 'spf'];
const MOTS = {
  'Prête': () => tr('Prête'), 'Chat dedans': () => tr('Chat dedans'), 'Nettoie': () => tr('Nettoie'),
  'Bac presque plein': () => tr('Bac presque plein'), 'Vide le bac': () => tr('Vide le bac'), 'En pause': () => tr('En pause'),
  'Éteinte': () => tr('Éteinte'), 'Hors ligne': () => tr('Hors ligne'), 'Capot retiré': () => tr('Capot retiré'),
  'Démarrage': () => tr('Démarrage'), 'Défaut': () => tr('Défaut'), 'Maintenance': () => tr('Maintenance'), 'Réglage': () => tr('Réglage'),
};

/**
 * L'état de la litière en mots, d'après le texte de son entité : `{ texte, ton, travail }` ou null quand on ne sait pas le dire.
 * Litter-Robot (un code), PetKit (des états à préfixes), Petlibro (`IDLE`, `RUNNING`).
 */
function motEtat(brut) {
  if (brut == null) return null;
  const e = String(brut).toLowerCase();
  const dire = (mot, ton = null, travail = false) => ({ texte: MOTS[mot](), ton, travail });
  if (CODES[e]) return dire(...CODES[e]);
  if (CODES_DEFAUT.indexOf(e) >= 0) return dire('Défaut', 'bad');
  if (e === 'idle') return dire('Prête');
  if (e === 'running') return dire('Nettoie', 'ok', true);
  // Une pause se lit AVANT le geste : `cleaning_litter_box_paused` et `maintenance_paused` sont à l'arrêt, pas au travail.
  if (e.indexOf('paused') >= 0) return dire('En pause');
  if (e.indexOf('cleaning') === 0) return dire('Nettoie', 'ok', true);
  if (e.indexOf('dumping') === 0) return dire('Vide le bac', 'ok', true);
  if (e.indexOf('maintenance') === 0) return dire('Maintenance');
  if (['resetting', 'resetting_device', 'leveling', 'calibrating'].indexOf(e) >= 0) return dire('Réglage');
  return null;
}

/** Les noms courts des chats : le nom de chaque entité, sans la partie que toutes les autres répètent (« Passages du jour »). */
function nomsCourts(ids, S) {
  const mots = ids.map(id => nomEntite(S, id).trim().split(/\s+/));
  if (mots.length < 2) return mots.map(m => m.join(' '));
  const commun = (lire) => { let n = 0; while (mots.every(m => m.length > n + 1 && lire(m, n) === lire(mots[0], n))) n++; return n; };
  const fin = commun((m, i) => m[m.length - 1 - i]);
  const debut = fin ? 0 : commun((m, i) => m[i]);
  return mots.map(m => (fin ? m.slice(0, m.length - fin) : m.slice(debut)).join(' '));
}

/** La litière : sa carte, sa popup. */
function vueLitiere({ c, S, nom }) {
  const visites = Array.isArray(c.visites) ? c.visites : [];
  const ids = [c.etat, c.bac, c.tiroir, c.sable, c.sableBas, c.tremie, c.passages, ...visites].filter(Boolean);
  const mort = !ids.some(id => lisible(S, id));
  const mot = mort ? null : motEtat(etatDe(S, c.etat));
  const plein = !mort && bacPlein(c, S);
  const bas = !mort && !plein && sableBas(c, S);
  let phrase;
  if (mort) phrase = { texte: tr('Indisponible'), encre: 'var(--o-text3)' };
  else if (plein) phrase = { texte: tr('Bac à vider'), encre: ENCRE.bad };
  else if (bas) phrase = { texte: tr('Litière à remettre'), encre: ENCRE.warn };
  else phrase = { texte: mot ? mot.texte : '', encre: (mot && ENCRE[mot.ton]) || 'var(--o-text2)' };
  // Les passages du jour : le compteur de l'appareil, sinon la somme de ceux de chaque chat.
  const parChat = visites.filter(id => chiffreDe(S, id) != null);
  const total = chiffreDe(S, c.passages) != null ? chiffreDe(S, c.passages) : parChat.length ? parChat.reduce((s, id) => s + chiffreDe(S, id), 0) : null;
  const noms = parChat.length > 1 && chiffreDe(S, c.passages) == null ? nomsCourts(parChat, S) : [];
  const detail = noms.map((n, i) => ({ id: parChat[i], nom: n, n: nombre(chiffreDe(S, parChat[i]), 0) })).sort((a, b) => comparerTextes(a.nom, b.nom));
  const chiffre = !mort && total != null ? { v: nombre(total, 0), u: '', nom: tr('Passages du jour') } : null;
  const tiroir = chiffreDe(S, c.tiroir), sable = chiffreDe(S, c.sable);
  let bac = null;
  if (!mort) {
    if (plein) bac = { texte: tr('Plein'), encre: ENCRE.bad };
    else if (tiroir != null) bac = { texte: nombre(tiroir, 0) + ' ' + uniteDe(S, c.tiroir, '%'), encre: 'var(--o-text)' };
    else if (etatDe(S, c.bac) === 'off') bac = { texte: tr('Pas plein'), encre: 'var(--o-text)' };
  }
  const nomDe = nom || nomGenre('litiere');
  return {
    genre: 'litiere', nom: nomDe, mort, icone: 'paw', phrase, chiffre,
    etat: mort ? 'muette' : plein ? 'plein' : bas ? 'bas' : mot && mot.travail ? 'travail' : 'repos',
    plaque: mort ? ETEINT : plein ? ROUGE : bas ? AMBRE : mot && mot.travail ? VERT : GRIS,
    ancre: c.etat || c.bac || c.tiroir || c.sable || c.sableBas || c.passages || visites[0] || null,
    ids,
    fiche: {
      etat: mot ? { texte: mot.texte, encre: ENCRE[mot.ton] || 'var(--o-text)' } : null,
      bac,
      sable: !mort && sable != null ? { texte: nombre(sable, 0) + ' ' + uniteDe(S, c.sable, '%'), encre: bas ? ENCRE.warn : 'var(--o-text)' } : null,
      passages: chiffre ? { texte: chiffre.v, detail } : null,
    },
  };
}

/** La durée restante d'un filtre : « 12 j » — l'unité est celle de l'entité (`d`, `days`), jamais supposée ; sans elle, rien. */
function joursDe(S, id) {
  const n = chiffreDe(S, id), u = uniteDe(S, id);
  if (n == null || !u) return null;
  return ['d', 'day', 'days', 'j'].indexOf(u) >= 0 ? tr('{n} j', { n: nombre(n, 0) }) : nombre(n, 0) + ' ' + u;
}

/** La fontaine : sa carte, sa popup. */
function vueFontaine({ c, S, nom }) {
  const ids = [c.eauBasse, c.eau, c.filtre, c.filtreJours, c.filtreChanger, c.pompe].filter(Boolean);
  const mort = !ids.some(id => lisible(S, id));
  const manque = !mort && etatDe(S, c.eauBasse) === 'on';
  const use = !mort && !manque && filtreUse(c, S);
  const pompe = etatDe(S, c.pompe);
  const marche = pompe === 'on' ? true : pompe === 'off' ? false : null;
  const jours = joursDe(S, c.filtreJours);
  let phrase;
  if (mort) phrase = { texte: tr('Indisponible'), encre: 'var(--o-text3)' };
  else if (manque) phrase = { texte: tr('À remplir'), encre: ENCRE.warn };
  else if (use) phrase = { texte: tr('Filtre à changer'), encre: ENCRE.warn };
  else if (marche != null) phrase = { texte: (marche ? tr('En marche') : tr('Arrêtée')) + (jours ? ' · ' + jours : ''), encre: 'var(--o-text2)' };
  else phrase = { texte: '', encre: 'var(--o-text2)' };
  const filtre = chiffreDe(S, c.filtre), eau = chiffreDe(S, c.eau);
  const chiffre = mort ? null : filtre != null ? { v: nombre(filtre, 0), u: uniteDe(S, c.filtre, '%'), nom: tr('Filtre') }
    : eau != null ? { v: nombre(eau, 0), u: uniteDe(S, c.eau, '%'), nom: tr('Eau') } : null;
  let niveau = null;
  if (!mort) {
    if (manque) niveau = { texte: tr('À remplir'), encre: ENCRE.warn };
    else if (eau != null) niveau = { texte: nombre(eau, 0) + ' ' + uniteDe(S, c.eau, '%'), encre: 'var(--o-text)' };
    else if (etatDe(S, c.eauBasse) === 'off') niveau = { texte: tr('Suffisante'), encre: 'var(--o-text)' };
  }
  const reste = [filtre != null ? nombre(filtre, 0) + ' ' + uniteDe(S, c.filtre, '%') : null, jours].filter(Boolean);
  const remise = c.remise && S[c.remise] && String(S[c.remise].state) !== 'unavailable' ? c.remise : null;
  return {
    genre: 'fontaine', nom: nom || nomGenre('fontaine'), mort, icone: 'water', phrase, chiffre,
    etat: mort ? 'muette' : manque ? 'remplir' : use ? 'filtre' : marche ? 'marche' : 'repos',
    plaque: mort ? ETEINT : manque || use ? AMBRE : marche ? ['var(--o-accent-fond)', '#fff'] : GRIS,
    ancre: c.pompe || c.filtre || c.eauBasse || c.eau || c.filtreChanger || c.filtreJours || null,
    ids,
    fiche: {
      niveau,
      filtre: !mort && reste.length ? { texte: reste.join(' · '), encre: use ? ENCRE.warn : 'var(--o-text)' } : null,
      pompe: !mort && marche != null ? { id: c.pompe, on: marche } : null,
      remise: !mort ? remise : null,
    },
  };
}

/**
 * Ce que montrent la carte et la popup d'une litière ou d'une fontaine.
 * `{ genre, nom, mort, etat, icone, phrase: { texte, encre }, chiffre: { v, u, nom } | null, plaque: [fond, encre], ancre, ids, fiche }`.
 * `etat` — litière : 'muette' | 'plein' | 'bas' | 'travail' | 'repos' ; fontaine : 'muette' | 'remplir' | 'filtre' | 'marche' | 'repos'.
 * `fiche` — les rangées de la popup, null quand l'appareil ne les porte pas ; `ancre` : l'entité qui porte l'icône de la plaque.
 */
export function vueAnimal({ c, S = {}, nom = null }) {
  if (!c || (c.genre !== 'litiere' && c.genre !== 'fontaine')) return null;
  const etats = S || {};
  return c.genre === 'litiere' ? vueLitiere({ c, S: etats, nom }) : vueFontaine({ c, S: etats, nom });
}
