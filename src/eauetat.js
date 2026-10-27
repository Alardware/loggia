/* ── L'arrivée d'eau à l'écran : l'état du serveur, le geste d'une vanne, la question (chantier IoT, étape 3 ; I28, I29, I33) ──
 *
 * Chargé à la demande, avec la carte d'une vanne (cartevanne.jsx) et sa popup (fichevanne.jsx) : le démarrage n'en porte rien.
 *
 *  - `loggia/eau/etat` — pourquoi chaque vanne est fermée, ses détecteurs, le journal du jour, la règle — vit ICI, une fois pour
 *    tout l'écran, sur le motif de distributeuretat.js : rien ne part sans abonné ; 60 s tant qu'une carte est montée, 15 s popup
 *    ouverte ; une réponse plus vieille n'écrase pas une plus fraîche ; le serveur muet (Home Assistant pas encore redémarré) se dit
 *    (`erreur`), et la réponse d'avant reste lue.
 *  - Le geste d'une vanne (I33) est PARTAGÉ (optimiste.js) : la carte large, l'étroite, la compacte et la popup lisent le même. Un
 *    second appui pendant le vol ne commande pas deux fois — ni le même sens, ni l'inverse. Il tient 30 s plus un relevé du pont
 *    (une vanne motorisée tourne en 5 à 20 s), se lève quand la vanne ATTEINT son sens (`closed`, `open` : pendant `closing` et
 *    `opening` elle tourne encore — passe bis, point 2) et tombe sur un refus. Le service est explicite, toujours avec son
 *    `entity_id` ; jamais `toggle`.
 *  - La question d'une carte étroite ou compacte : elle n'a pas la place de demander (ADR 0202) ; elle pose la question ici et ouvre
 *    la popup, qui la trouve en s'ouvrant — une fois.
 *  - « Fermer en cas de fuite » (I29) part par sa commande ÉTROITE, `loggia/eau/regle {actif}` : la valeur seule, que le serveur fond
 *    dans `loggia_alertes` telle qu'elle est sur le disque. Jamais `loggia/config/set` depuis le cache de l'onglet.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getHass } from './state.js';
import { poserPartage, lirePartage, oublierPartage, useOptimistePartage } from './optimiste.js';
import { VANNE_MS, sensVanne, serviceVanne } from './eau.js';

export { VANNE_MS };
const TYPE_ETAT = 'loggia/eau/etat';
const SONDAGE_CARTE_MS = 60000;
const SONDAGE_FICHE_MS = 15000;
const ATTENTE_HASS_MS = 2000;
const HORLOGE = {
  repeter: (f, ms) => setInterval(f, ms), arreter: (t) => clearInterval(t),
  plusTard: (f, ms) => setTimeout(f, ms), annuler: (t) => clearTimeout(t),
};

let source = () => getHass();
let horloge = HORLOGE;
let instant = Object.freeze({ etat: null, erreur: false });
const ecouteurs = new Set();
let abonnes = 0, fiches = 0, minuteur = null, periode = 0, relance = null, tour = 0, publie = 0;

function publier(suite) {
  if (suite.etat === instant.etat && suite.erreur === instant.erreur) return;
  instant = Object.freeze(suite);
  ecouteurs.forEach(f => { try { f(); } catch { /* un écouteur tombé n'arrête pas les autres */ } });
}
/** L'instantané `{ etat, erreur }` — le même objet tant que rien ne change. */
export function lireEtatEau() { return instant; }
/** Une réponse plus fraîche (après « Fermer en cas de fuite ») : elle remplace le cache ; une lecture partie avant ne la recouvre pas. */
export function poserEtatEau(etat) {
  if (!etat || typeof etat !== 'object') return;
  publie = tour + 1;
  publier({ etat, erreur: false });
}
function ecouterEtatEau(f) { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; }

/** Relire le serveur maintenant. Sans abonné, rien ne part. */
export function rafraichirEau() {
  if (abonnes <= 0) return Promise.resolve(null);
  const h = source();
  if (!h || typeof h.callWS !== 'function') {
    if (relance == null) relance = horloge.plusTard(() => { relance = null; rafraichirEau(); }, ATTENTE_HASS_MS);
    return Promise.resolve(null);
  }
  const n = ++tour;
  let p;
  try { p = Promise.resolve(h.callWS({ type: TYPE_ETAT })); } catch (e) { p = Promise.reject(e); }
  return p.then(r => {
    if (n < publie) return null;
    publie = n;
    publier(r && typeof r === 'object' ? { etat: r, erreur: false } : { etat: instant.etat, erreur: true });
    return r;
  }, () => {
    if (n < publie) return null;
    publie = n;
    publier({ etat: instant.etat, erreur: true });
    return null;
  });
}
function cadence() {
  const voulue = abonnes > 0 ? (fiches > 0 ? SONDAGE_FICHE_MS : SONDAGE_CARTE_MS) : 0;
  if (voulue === periode) return;
  if (minuteur != null) { horloge.arreter(minuteur); minuteur = null; }
  if (!voulue && relance != null) { horloge.annuler(relance); relance = null; }
  periode = voulue;
  if (voulue) minuteur = horloge.repeter(rafraichirEau, voulue);
}
/** Un abonné de plus — une carte, ou la popup (`fiche`). Le premier, et la popup qui s'ouvre, relisent aussitôt. Rend le désabonnement. */
export function abonnerEau({ fiche = false } = {}) {
  abonnes += 1;
  if (fiche) fiches += 1;
  const relire = abonnes === 1 || (fiche && fiches === 1);
  cadence();
  if (relire) rafraichirEau();
  let fait = false;
  return () => { if (fait) return; fait = true; abonnes -= 1; if (fiche) fiches -= 1; cadence(); };
}
/** Le crochet de la carte et de la popup : `{ etat, erreur }`. `suivre` : l'état de la vanne — quand il change, le carnet vient de
 *  noter pourquoi, et on le relit aussitôt (passe bis, point 3) : sans cela, une vanne fermée sur fuite pouvait attendre 60 s sa cause,
 *  et se rouvrir d'un appui dans l'intervalle. */
export function useEtatEau(actif = true, { fiche = false, suivre = null } = {}) {
  useEffect(() => (actif ? abonnerEau({ fiche }) : undefined), [actif, fiche]);
  const vu = useRef(suivre);
  useEffect(() => {
    if (vu.current === suivre) return;
    vu.current = suivre;
    if (actif) rafraichirEau();
  }, [actif, suivre]);
  return useSyncExternalStore(ecouterEtatEau, lireEtatEau, lireEtatEau);
}
/** Pour les tests : la source de `hass` et l'horloge doublées, le cache vidé. */
export function reglerEauEtat({ hass = undefined, horloge: h = undefined } = {}) {
  if (minuteur != null) horloge.arreter(minuteur);
  if (relance != null) horloge.annuler(relance);
  minuteur = null; relance = null; periode = 0; abonnes = 0; fiches = 0; tour = 0; publie = 0;
  instant = Object.freeze({ etat: null, erreur: false });
  ecouteurs.clear();
  source = hass === undefined ? () => getHass() : () => hass;
  horloge = h || HORLOGE;
}

/* ── Le `hass` vivant de la vanne et de ses détecteurs ──
 * La carte et la popup ne peuvent pas importer `useHass` d'App.jsx, et le leur passer en propriété pesait au démarrage : elles
 * relisent elles-mêmes, au rythme du pont (2 s), l'état de la vanne et des binaires de fuite, et se redessinent quand il change —
 * un détecteur qui voit de l'eau change la phrase de la carte sans attendre la vue derrière. */
const RELEVE_MS = 2000;
const signatureEau = (S, id) => Object.keys(S || {}).filter(k => k === id || (k.indexOf('binary_sensor.') === 0 && ((S[k] || {}).attributes || {}).device_class === 'moisture'))
  .map(k => k + '=' + S[k].state + '@' + S[k].last_changed).join('|');
/** Le `hass` du moment (`getHass()`, sinon celui de la vue) ; le composant se redessine quand la vanne ou un détecteur change. */
export function useHassEau(hass, id) {
  const [, redessiner] = useState(0);
  useEffect(() => {
    const lire = () => { const h = getHass() || hass; return signatureEau(h && h.states, id); };
    let avant = lire();
    const t = setInterval(() => { const s = lire(); if (s !== avant) { avant = s; redessiner(n => n + 1); } }, RELEVE_MS);
    return () => clearInterval(t);
  }, [id, hass]);
  return getHass() || hass;
}

/* ── Le geste d'une vanne (I33) ── */
const cle = (id) => 'vanne:' + id;
/* Pendant que la vanne TOURNE (`closing`, `opening`), elle n'a pas encore atteint son sens (passe bis, point 2) : `closing` levait le
 * geste, et la puce proposait aussitôt « Rouvrir l'eau » d'un appui. Le geste tient jusqu'à `closed` / `open` (ou son filet). */
const TOURNE = ['closing', 'opening'];
const signature = (id, st) => ({ reel: st ? (TOURNE.indexOf(st.state) >= 0 ? 'tourne' : sensVanne(id, st.state)) : null, change: st ? st.last_changed || null : null });
/** Le geste en vol sur cette vanne, `{ sens }`, ou null — lu au moment même. */
export function gesteVanne(id, st) { return lirePartage(cle(id), signature(id, st)); }
/** Pour un composant : le geste en vol, et il se redessine quand il se pose ou tombe. */
export function useGesteVanne(id, st) { return useOptimistePartage(id ? cle(id) : null, signature(id, st)); }
/**
 * Fermer ou rouvrir (`sens` : 'fermer' | 'ouvrir'), d'où que vienne l'appui : un geste en vol sur cette vanne, et rien ne part ;
 * sinon il se pose, et le service part — explicite, avec son `entity_id`. Un refus de Home Assistant fait tomber le geste et se dit
 * par le canal commun (le rejet relancé, orphelin, comme `commanderService`) — ou par `surRefus`, qui le reçoit. Rend vrai si la commande
 * est partie.
 */
export function commanderVanne(hass, id, sens, st, { surRefus = null } = {}) {
  if (!hass || typeof hass.callService !== 'function' || !id || (sens !== 'fermer' && sens !== 'ouvrir')) return false;
  if (gesteVanne(id, st)) return false;
  const s = signature(id, st);
  const jeton = poserPartage(cle(id), Object.freeze({ sens }), { reel: s.reel, change: s.change, filet: VANNE_MS, cible: sens === 'fermer' ? 'fermee' : 'ouverte' });
  const [domaine, service] = serviceVanne(id, sens);
  let p;
  try { p = Promise.resolve(hass.callService(domaine, service, { entity_id: id })); } catch (e) { p = Promise.reject(e); }
  p.then(null, (e) => { oublierPartage(cle(id), jeton); if (surRefus) surRefus(e); else Promise.reject(e); });
  return true;
}

/* ── La question d'une carte qui n'a pas la place de demander ── */
const QUESTIONS = new Map();
const QUESTION_MS = 30000;
/** La carte étroite ou compacte pose la question, puis ouvre la popup. */
export function poserQuestion(id) { QUESTIONS.set(id, Date.now()); }
/** La popup qui s'ouvre la prend : vrai une fois, dans les 30 s. */
export function prendreQuestion(id) {
  const t = QUESTIONS.get(id);
  QUESTIONS.delete(id);
  return t != null && Date.now() - t <= QUESTION_MS;
}

/* ── « Fermer en cas de fuite » (I29) ── */
/** La valeur SEULE au serveur ; l'état rendu se pose. Un refus revient à l'appelant (qui le dit, la clé nommée), et rien ne change. */
export function reglerFermerSurFuite(hass, actif) {
  if (!hass || typeof hass.callWS !== 'function') return Promise.reject({ code: 'not_available', message: 'carnet de l’eau indisponible' });
  return Promise.resolve(hass.callWS({ type: 'loggia/eau/regle', actif: !!actif })).then((etat) => { poserEtatEau(etat); return etat; });
}
