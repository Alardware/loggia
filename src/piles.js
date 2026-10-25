/* ── Les piles et batteries de la maison (vue Énergie, 19/09) ─────────────────
 *
 * Demande : « dans Énergie, à la suite des postes de consommation, on pourrait
 * ajouter les nouveaux capteurs de batterie, non ? » — les cartes à cinq
 * barres de la v3.57.0 (ADR 0057), toutes au même endroit.
 *
 * Un capteur de pile, c'est sa classe Home Assistant (`battery`), jamais son
 * nom. Les entités masquées ou désactivées restent dehors ; celles de
 * DIAGNOSTIC, non : c'est la catégorie de presque toutes les piles Zigbee, et
 * c'est d'elles qu'on parle. Les téléphones non plus (« retire les téléphones
 * de la liste des piles », même jour) : reconnus à leur intégration,
 * l'application Home Assistant (`mobile_app`) — tablettes comprises.
 *
 * La plus basse d'abord — c'est celle qu'on change —, puis les capteurs
 * muets : une pile à plat se tait souvent (voir `veilles.py`), elle ne doit
 * pas disparaître pour autant.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec.
 */

import { tr, trN, comparerTextes } from './i18n.js';
import { nombre } from './format.js';
import { seuilsPile } from './attention.js';

const MUETS = ['unavailable', 'unknown'];

/** Les piles : [{ id, niveau }] triées, `niveau` nul pour un capteur muet.
 * `meta(id)` rend { hidden, disabled, platform } (le registre des entités). */
export function pilesMaison(S, meta = () => ({})) {
  const etats = S && typeof S === 'object' ? S : {};
  const nomDe = (id) => {
    const a = etats[id] && etats[id].attributes;
    return String((a && a.friendly_name) || id);
  };
  const out = [];
  Object.keys(etats).forEach(id => {
    if (id.indexOf('sensor.') !== 0) return;
    const st = etats[id];
    const a = (st && st.attributes) || {};
    if (a.device_class !== 'battery') return;
    const m = meta(id) || {};
    if (m.hidden || m.disabled || m.platform === 'mobile_app') return;
    const brut = st.state == null ? '' : String(st.state);
    const n = parseFloat(brut);
    if (MUETS.indexOf(brut) >= 0) out.push({ id, niveau: null });
    else if (!isNaN(n)) out.push({ id, niveau: n });
  });
  return out.sort((x, y) => {
    if (x.niveau == null || y.niveau == null) {
      if (x.niveau != null) return -1;
      if (y.niveau != null) return 1;
    } else if (x.niveau !== y.niveau) return x.niveau - y.niveau;
    return comparerTextes(nomDe(x.id), nomDe(y.id));
  });
}

/** La glyphe d'une pile à son niveau — la même partout : le coin d'un capteur, la popup Piles. Sans niveau, la pile vide. */
export function glyphePile(n) {
  if (n == null) return 'battery-empty';
  return n < 12 ? 'battery-empty' : n < 37 ? 'battery-quarter' : n < 62 ? 'battery-half' : n < 87 ? 'battery-three-quarters' : 'battery-full';
}

/* ── La carte PILES (chantier Capteurs, étape 3 ; C32, § 8, § 19.8) ───────────────────────────────────────────────
 *
 * Qui : les piles de `pilesMaison` (ni masquées, ni désactivées, ni les téléphones) portées par un APPAREIL PHYSIQUE (audit
 * du 19/10, M13 : un `min_max` « pile la plus basse » ou un modèle sans appareil redisait une pile déjà comptée), plus le
 * `binary_sensor` de classe `battery` d'un appareil physique qui n'a pas de pile chiffrée (allumé : « faible ») ; moins une
 * batterie RECHARGEABLE — un appareil qui porte un aspirateur, une tondeuse, un `battery_charging`, une prise branchée (`plug` :
 * la tablette, la voiture) ou une puissance de charge, ou un onduleur (`nut`, `apcupsd`) —, moins ce que l'écran écarte (la
 * batterie de la maison, le rôle `batSoc` d'Énergie). La veille des piles du serveur suit la même règle (`veilles.py`,
 * `_rechargeable`). La liste de la vue Énergie, elle, ne change pas.
 * `ctx` : `meta(id)`, `physique(deviceId)`, `soeurs(id)`, `piece(id)`, `appareil(id)` — ce que `ctxCapteurs` (App.jsx) lit dans l'index.
 */
const classe = (S, e) => (S[e] && S[e].attributes && S[e].attributes.device_class) || null;
const ONDULEURS = ['nut', 'apcupsd'];
const rechargeable = (S, soeurs, plateforme) => ONDULEURS.indexOf(plateforme) >= 0 || soeurs.some(e => e.indexOf('vacuum.') === 0 || e.indexOf('lawn_mower.') === 0
  || (e.indexOf('binary_sensor.') === 0 && ['battery_charging', 'plug'].indexOf(classe(S, e)) >= 0)
  || (e.indexOf('sensor.') === 0 && classe(S, e) === 'power' && /charg/.test(e)));

/** Les piles de la carte : `[{ id, niveau, muette, binaire, allume, nom, piece }]` — la plus basse d'abord, les muettes à la fin, les
 *  binaires après les chiffrées. Le nom est celui de l'appareil, sinon celui de Home Assistant. */
export function pilesDeLaMaison(S, ctx, { exclure = [] } = {}) {
  const etats = S && typeof S === 'object' ? S : {};
  const horsJeu = new Set(exclure.filter(Boolean));
  const nomDe = (id) => ctx.appareil(id) || String(((etats[id] || {}).attributes || {}).friendly_name || id);
  const chiffrees = new Set();
  const out = [];
  pilesMaison(etats, ctx.meta).forEach(({ id, niveau }) => {
    const m = ctx.meta(id) || {};
    const d = m.deviceId;
    if (horsJeu.has(id) || !d || !ctx.physique(d) || rechargeable(etats, ctx.soeurs(id), m.platform)) return;
    chiffrees.add(d);
    out.push({ id, niveau, muette: niveau == null, binaire: false, allume: false, nom: nomDe(id), piece: ctx.piece(id) || null });
  });
  Object.keys(etats).sort().forEach(id => {
    if (id.indexOf('binary_sensor.') !== 0 || horsJeu.has(id)) return;
    const a = (etats[id] && etats[id].attributes) || {};
    if (a.device_class !== 'battery') return;
    const m = ctx.meta(id) || {};
    if (m.hidden || m.disabled || !m.deviceId || chiffrees.has(m.deviceId) || !ctx.physique(m.deviceId) || rechargeable(etats, ctx.soeurs(id), m.platform)) return;
    const brut = String(etats[id].state);
    out.push({ id, niveau: null, muette: MUETS.indexOf(brut) >= 0, binaire: true, allume: brut === 'on', nom: nomDe(id), piece: ctx.piece(id) || null });
  });
  return out;
}

/**
 * La vue de la carte Piles (C32, § 8) : `{ glyphe, phrase, ton, regarder, puces, chiffre, legende, aChanger, muettes, basse, ordre }`.
 *  1. des piles au seuil ou en dessous — le seuil de la veille des piles (§ 19.8, `seuilsPile`) —, ou un binaire allumé : « {k} piles
 *     à changer », en ambre ; en rouge si l'une est au critique (5 %) ; le chiffre {k} et sa légende « ≤ 15 % » ;
 *  2. sinon, des muettes : « {k} piles sans nouvelles », en ambre ;
 *  3. sinon : « {n} piles · la plus basse à {p} % », en neutre — un fait qui change, jamais « Tout va bien ».
 * Les puces : celles à changer (« {nom} · 14 % », « {nom} · faible »), puis les muettes (« {nom} · muette ») ; au calme, la plus basse.
 * `ordre` : la popup — à changer, puis celles qui tiennent (la plus basse d'abord), puis les muettes.
 */
export function vuePiles(piles, seuils = seuilsPile()) {
  const liste = Array.isArray(piles) ? piles : [];
  const { alerte: seuil, danger } = seuils;
  const aChanger = liste.filter(p => !p.muette && (p.binaire ? p.allume : p.niveau != null && p.niveau <= seuil));
  const muettes = liste.filter(p => p.muette);
  const tiennent = liste.filter(p => !p.muette && aChanger.indexOf(p) < 0);
  const critique = aChanger.some(p => p.niveau != null && p.niveau <= danger);
  const basse = tiennent.find(p => p.niveau != null) || null;
  const k = aChanger.length, m = muettes.length, n = liste.length;
  const pct = (p) => nombre(p.niveau, 0) + '\u00a0%';
  const phrase = k ? trN(k, '{n} pile à changer', '{n} piles à changer') : m ? trN(m, '{n} pile sans nouvelles', '{n} piles sans nouvelles')
    : basse ? trN(n, '{n} pile · {p} %', '{n} piles · la plus basse à {p} %', { p: nombre(basse.niveau, 0) }) : trN(n, '{n} pile', '{n} piles');
  const tonDe = (p) => (p.niveau != null && p.niveau <= danger ? 'bad' : 'warn');
  const puces = k || m
    ? [...aChanger.map(p => ({ t: p.nom + ' · ' + (p.binaire ? tr('faible') : pct(p)), glyphe: glyphePile(p.binaire ? 10 : p.niveau), ton: tonDe(p) })),
      ...muettes.map(p => ({ t: p.nom + ' · ' + tr('muette'), glyphe: 'battery-empty', ton: 'warn' }))]
    : basse ? [{ t: basse.nom + ' · ' + pct(basse), glyphe: glyphePile(basse.niveau), ton: null }] : [];
  return { glyphe: 'battery-quarter', phrase, ton: k ? (critique ? 'bad' : 'warn') : m ? 'warn' : null, regarder: k > 0 || m > 0, puces,
    chiffre: k ? String(k) : null, legende: k ? '\u2264\u00a0' + seuil + '\u00a0%' : null, aChanger, muettes, basse, ordre: [...aChanger, ...tiennent, ...muettes] };
}
