/**
 * Le journal des notifications : ce qui est ARRIVÉ, pas ce qui est en cours.
 *
 * « Je ne trouve pas qu'elles servent à grand-chose, il n'y a rien ou presque
 * qui remonte ici » (01/10). Le diagnostic était juste, et le défaut plus
 * profond que la liste des sources : ce n'étaient pas des notifications, mais
 * des ÉTATS COURANTS recalculés à chaque passage.
 *
 * Trois choses manquaient, et ce sont celles qui font une notification :
 *
 *   — elle naît d'un ÉVÉNEMENT, à un instant qu'on peut nommer ;
 *   — elle SURVIT à la fin de l'événement. Le lave-vaisselle qui finit pendant
 *     qu'on est sorti ne se signalait jamais : la ligne apparaissait et
 *     disparaissait sans témoin ;
 *   — elle se MARQUE LUE, et ne revient plus.
 *
 * Ce module ne lit ni Home Assistant ni le stockage : il prend le journal
 * d'avant et ce qui est vivant maintenant, et rend le journal d'après. Tout ce
 * qui décide est ici, et se teste sans navigateur.
 *
 * Le journal vit dans le NAVIGATEUR : « lu » est propre à celui qui regarde,
 * pas à la maison. Deux écrans de la même maison ont chacun le leur, et c'est
 * voulu — marquer lu chez soi ne doit pas effacer l'alerte sur la tablette du
 * couloir.
 */

/** Au-delà, les plus anciennes tombent. Trente tient dans une feuille qu'on
 *  déroule une fois, et couvre largement une semaine ordinaire. */
export const JOURNAL_MAX = 30;

/** Une notification plus vieille que ça n'apprend plus rien. */
export const JOURNAL_JOURS = 7;

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Une entrée saine : sans clé ni horodatage, elle ne sait ni se reconnaître
 *  ni vieillir, et elle n'a rien à faire dans le journal. */
function saine(e) {
  return !!e && typeof e.k === 'string' && e.k !== '' && typeof e.ts === 'number' && isFinite(e.ts);
}

/**
 * Le journal d'après.
 *
 * `vivantes` sont les notifications que l'instant présent justifie, chacune
 * portant une CLÉ stable : c'est elle qui distingue « le même événement, qui
 * dure » de « un nouvel événement ». Sans elle, une fuite d'eau rentrerait
 * dans le journal toutes les deux secondes.
 *
 * Une entrée connue n'est pas réécrite : son texte et son heure sont ceux du
 * moment où elle est arrivée. Une alerte qui change de formulation en cours de
 * route raconterait le présent, et ce journal raconte le passé.
 */
export function fondre(journal, vivantes, now) {
  const t = typeof now === 'number' && isFinite(now) ? now : Date.now();
  const anciennes = (Array.isArray(journal) ? journal : []).filter(saine);
  const connues = new Set(anciennes.map(e => e.k));
  const neuves = [];
  for (const v of (Array.isArray(vivantes) ? vivantes : [])) {
    if (!v || typeof v.k !== 'string' || !v.k) continue;
    if (connues.has(v.k)) continue;
    connues.add(v.k);
    neuves.push({ k: v.k, c: v.c || null, t: v.t || '', m: v.m || '', ts: t, lu: false });
  }
  // La plus récente d'abord : c'est l'ordre de lecture d'un journal.
  const suite = [...neuves, ...anciennes]
    .filter(e => t - e.ts < JOURNAL_JOURS * JOUR_MS)
    .slice(0, JOURNAL_MAX);
  /* RIEN n'a bougé : on rend le tableau d'origine, pas une copie. L'écran
   * appelle cette fonction à chaque passage du sondage — toutes les deux
   * secondes. Une copie neuve à chaque fois redessinerait la page et
   * réécrirait le stockage pour rien. */
  if (!neuves.length && suite.length === anciennes.length && anciennes.length === (Array.isArray(journal) ? journal.length : -1)) {
    return journal;
  }
  return suite;
}

/** Combien n'ont pas été lues. */
export function nonLues(journal) {
  return (Array.isArray(journal) ? journal : []).filter(e => saine(e) && !e.lu).length;
}

/**
 * Tout marquer lu.
 *
 * Rend le MÊME tableau quand il n'y avait rien à marquer : l'écran qui le
 * range se garde alors d'écrire pour rien, et de se redessiner à chaque
 * ouverture de la feuille.
 */
export function marquerLues(journal) {
  const l = Array.isArray(journal) ? journal : [];
  if (!l.some(e => saine(e) && !e.lu)) return l;
  return l.map(e => (saine(e) && !e.lu ? { ...e, lu: true } : e));
}
