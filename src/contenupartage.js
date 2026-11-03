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

/* Les FAVORIS et l'ACCUEIL n'en sont plus (ticket #43, 02/11) : « je modifie
 * sur mobile en tant que Guillaume, ça modifie aussi sur PC en Admin (autre
 * profil), et vice versa » — « l'interface est propre à chacun ». Une épingle,
 * une section masquée, un widget ajouté sont la personnalisation de quelqu'un,
 * pas le contenu de la maison : chaque profil garde les siens. */

/** Le report à appliquer à toutes les parts pour un geste de l'admin sur `cle`,
 *  ou `null` s'il n'a rien ajouté ni retiré (il n'a fait que ranger). */
export function reportContenu(cle, avant, apres) {
  if (VUES_A_CARTES.has(cle)) return reportCartes(avant, apres);
  return null;
}
