/* CE QUE L'ADMIN AJOUTE OU RETIRE VAUT POUR TOUS LES PROFILS (20/10).
 *
 * « Sur PC ou mobile, en admin, si je supprime une carte ou en ajoute une, ça ne
 * se répète pas sur les autres profils et appareils : je suis obligé, pour
 * chacun, de reproduire l'opération. »
 *
 * L'ADR 0185 rangeait tout par profil : le rangement — juste —, mais aussi le
 * CONTENU, quelles cartes existent sur une vue. On les sépare : quand le profil
 * qui agit est Admin, `cfgSet` (state.js) compare sa part AVANT et APRÈS, et le
 * changement de contenu qu'il y trouve part dans la part de CHAQUE profil, la
 * part commune « * » comprise — dans le même envoi. L'ordre, les tailles, les
 * places restent à chacun ; un profil ordinaire range toujours chez lui seul.
 *
 * Chaque fonction de report est IDEMPOTENTE (« cette carte est présente /
 * absente ») : appliquée aussi à la part de l'admin, elle n'y change rien. Elle
 * ne rend jamais `null` : une part vidée effacerait le profil, qui retomberait
 * sur la part commune au lieu de garder la sienne. */

/** Les vues à cartes (`useLayoutEditor`) : `{ <scope>: { added, removed, labels, types, … } }`. */
const VUES_A_CARTES = new Set(['loggia_roomlayout', 'loggia_objlayout', 'loggia_coverlayout', 'loggia_enlayout', 'loggia_seclayout']);

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const liste = (v) => (Array.isArray(v) ? v : []);
const avec = (l, id, present) => { const s = liste(l).filter((x) => x !== id); if (present) s.push(id); return s; };
const union = (...ls) => [...new Set(ls.flatMap(liste))];

/* Le défaut des widgets en option de l'Accueil (`ACC_AJOUTEES_DEFAUT`, App.jsx) :
 * une grille qui n'a jamais rien choisi les montre. Posé par App au chargement. */
let AJOUTEES_DEFAUT = [];
export function poserDefautsAccueil(l) { AJOUTEES_DEFAUT = liste(l).slice(); }

/** Le profil d'indice `id` est-il Admin ? (le rôle de `loggia_users`, casse ignorée) */
export function profilEstAdmin(users, id) {
  const u = liste(users)[Number(id)];
  return !!u && String(u.role || '').toLowerCase() === 'admin';
}

function reportCartes(avant, apres) {
  const A = obj(avant), B = obj(apres);
  const gestes = [];
  for (const scope of union(Object.keys(A), Object.keys(B))) {
    const a = obj(A[scope]), b = obj(B[scope]);
    for (const id of union(a.added, a.removed, b.added, b.removed)) {
      const ajoute = liste(b.added).includes(id), retire = liste(b.removed).includes(id);
      if (ajoute === liste(a.added).includes(id) && retire === liste(a.removed).includes(id)) continue;
      gestes.push({ scope, id, ajoute, retire, label: obj(b.labels)[id], type: obj(b.types)[id] });
    }
  }
  if (!gestes.length) return null;
  return (part) => {
    const P = { ...obj(part) };
    for (const g of gestes) {
      const L = { ...obj(P[g.scope]) };
      const added = avec(L.added, g.id, g.ajoute), removed = avec(L.removed, g.id, g.retire);
      if (added.length) L.added = added; else delete L.added;
      if (removed.length) L.removed = removed; else delete L.removed;
      // Une carte ajoutée arrive avec le nom et le type que l'admin lui a donnés.
      if (g.ajoute && g.label != null) L.labels = { ...obj(L.labels), [g.id]: g.label };
      if (g.ajoute && g.type != null) L.types = { ...obj(L.types), [g.id]: g.type };
      P[g.scope] = L;
    }
    return P;
  };
}

/* Une épingle s'identifie par son entité ; un gabarit (`t: 'tpl'`) par son contenu,
 * sans sa taille — agrandir une épingle range, ça n'ajoute rien. */
const cleEpingle = (x) => {
  if (typeof x === 'string') return x;
  if (x && x.t === 'tpl') { const { w: _w, h: _h, ...reste } = x; return 'tpl:' + JSON.stringify(reste); }
  return x && x.id;
};

function reportEpingles(avant, apres) {
  const ka = new Set(liste(avant).map(cleEpingle)), kb = new Set(liste(apres).map(cleEpingle));
  const plus = liste(apres).filter((x) => !ka.has(cleEpingle(x)));
  const moins = new Set([...ka].filter((k) => !kb.has(k)));
  if (!plus.length && !moins.size) return null;
  return (part) => {
    const l = liste(part).filter((x) => !moins.has(cleEpingle(x)));
    const deja = new Set(l.map(cleEpingle));
    plus.forEach((x) => { if (!deja.has(cleEpingle(x))) l.push(x); });
    return l;
  };
}

/* L'Accueil : les sections masquées (`caches`) et les widgets en option ajoutés
 * (`ajoutees`), sur la grille de l'ordinateur et sur chaque format ou appareil
 * qui a les siens (disposition.js). Ce qui change dans UN contexte vaut partout. */
const CLES_ACCUEIL = ['caches', 'ajoutees'];
function effectif(G, ctx, cle) {
  const o = ctx ? obj(obj(G[ctx[0]])[ctx[1]]) : G;
  if (cle in o) return liste(o[cle]);
  if (ctx && cle in G) return liste(G[cle]);
  return cle === 'ajoutees' ? AJOUTEES_DEFAUT : [];
}
function reportAccueil(avant, apres) {
  const A = obj(avant), B = obj(apres);
  const ctxs = [null];
  for (const t of ['formats', 'appareils']) for (const k of union(Object.keys(obj(A[t])), Object.keys(obj(B[t])))) ctxs.push([t, k]);
  const changes = new Map();
  for (const ctx of ctxs) {
    for (const cle of CLES_ACCUEIL) {
      const a = effectif(A, ctx, cle), b = effectif(B, ctx, cle);
      for (const id of union(a, b)) if (a.includes(id) !== b.includes(id)) changes.set(cle + '\u0000' + id, b.includes(id));
    }
  }
  if (!changes.size) return null;
  const appliquer = (o, base) => {
    for (const [k, present] of changes) {
      const [cle, id] = k.split('\u0000');
      if (base || cle in o) o[cle] = avec(cle in o ? o[cle] : (cle === 'ajoutees' ? AJOUTEES_DEFAUT : []), id, present);
    }
    return o;
  };
  return (part) => {
    const P = appliquer({ ...obj(part) }, true);
    for (const t of ['formats', 'appareils']) {
      if (!P[t] || typeof P[t] !== 'object') continue;
      P[t] = Object.fromEntries(Object.entries(P[t]).map(([k, v]) => [k, appliquer({ ...obj(v) }, false)]));
    }
    return P;
  };
}

/** Le report à appliquer à toutes les parts pour un geste de l'admin sur `cle`,
 *  ou `null` s'il n'a rien ajouté ni retiré (il n'a fait que ranger). */
export function reportContenu(cle, avant, apres) {
  if (VUES_A_CARTES.has(cle)) return reportCartes(avant, apres);
  if (cle === 'loggia_epingles') return reportEpingles(avant, apres);
  if (cle === 'loggia_accueil') return reportAccueil(avant, apres);
  return null;
}
