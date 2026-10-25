/* UNE CARTE, DEUX VUES (20/10).
 *
 * « Les cartes sont en double, dans Appareils et dans Pièces : si je supprime ou
 * ajoute dans l'un ou l'autre, ça doit aussi se répercuter sur l'autre. »
 *
 * Objets range ses cartes dans `loggia_objlayout` (scope « objets »), chaque
 * pièce dans `loggia_roomlayout` — avec les mêmes identifiants pour un appareil.
 * `refletCarte` dit, pour un geste fait d'un côté, ce qu'il faut écrire de
 * l'autre. Fonction pure : App.jsx lui passe l'état des deux vues et écrit.
 *
 * - retirer dans Objets → la carte quitte chaque pièce qui la montre (retrait
 *   si la pièce la propose, sortie de `added` si on l'y avait ajoutée) ;
 * - retirer dans une pièce → elle quitte Objets ;
 * - remettre une carte proposée → elle revient de l'autre côté (on lève son
 *   retrait ; on n'ajoute rien à la main : la découverte la propose déjà).
 *
 * Seules les cartes d'APPAREIL se reflètent — une entité (`light.x`) ou une zone
 * de chauffage (`zone:…`). Un intertitre de pièce (`sect:`), un groupe de
 * capteurs, une plante, le distributeur n'existent que d'un côté. */

const liste = (v) => (Array.isArray(v) ? v : []);
const carteDAppareil = (id) => typeof id === 'string'
  && (id.indexOf('zone:') === 0 || /^[a-z_]+\.[^\s]+$/.test(id));

/** L'agencement `L` après le geste, ou `null` s'il n'y a rien à changer. */
function appliquer(L, id, present, derive) {
  const added = liste(L.added), removed = liste(L.removed);
  let a = added, r = removed;
  if (present) {
    if (removed.indexOf(id) < 0) return null;
    r = removed.filter((x) => x !== id);
  } else if (added.indexOf(id) >= 0) a = added.filter((x) => x !== id);
  else if (derive && removed.indexOf(id) < 0) r = [...removed, id];
  else return null;
  const n = { ...L };
  if (a.length) n.added = a; else delete n.added;
  if (r.length) n.removed = r; else delete n.removed;
  return n;
}

/**
 * @param {{ source: 'objets'|'piece', id: string, present: boolean,
 *           pieces: { nom: string, derive: boolean, L: object }[], objets: object }} g
 * @returns {{ pieces?: Object<string, object>, objets?: object } | null}
 */
export function refletCarte({ source, id, present, pieces, objets }) {
  if (!carteDAppareil(id)) return null;
  if (source === 'objets') {
    const out = {};
    liste(pieces).forEach((p) => {
      const n = appliquer(p.L || {}, id, present, !!p.derive);
      if (n) out[p.nom] = n;
    });
    return Object.keys(out).length ? { pieces: out } : null;
  }
  // Depuis une pièce : Objets propose tous les appareils de la maison.
  const n = appliquer(objets || {}, id, present, true);
  return n ? { objets: n } : null;
}
