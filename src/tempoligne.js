/* La ligne Tempo de la carte du tarif (chantier du 20/11, A3 ; ADR 0385) : « Aujourd'hui bleu · demain blanc · encore 14 rouges ».
 * À part de `tempo.js` : seule la vue Énergie (chargée à la demande) l'écrit. Pur. */
import { tr, trN } from './i18n.js';
import { couleurTempo } from './tempo.js';

/** Un nombre de jours restants lisible : un entier de 0 à 366, sinon null. */
export function joursRestants(etat) {
  const n = typeof etat === 'number' ? etat : (typeof etat === 'string' && /^\s*\d+([.,]0+)?\s*$/.test(etat) ? parseFloat(etat.replace(',', '.')) : NaN);
  return Number.isInteger(n) && n >= 0 && n <= 366 ? n : null;
}

/**
 * La ligne de la carte du tarif : « Aujourd'hui bleu · demain blanc · encore 14 rouges ».
 * `{ aujourdhui, demain, rouges }` : les ÉTATS bruts (« Blanc », « red »…) et le compte brut. Chaque morceau se tait quand
 * il ne se lit pas ; rien du tout, rien d'écrit.
 * `[{ texte, rouge }]` : `rouge` quand le jour dit est rouge (la carte le met en alerte) ; ou null.
 */
export function ligneTempo({ aujourdhui = null, demain = null, rouges = null } = {}) {
  /* Une phrase par couleur et par jour, pas un mot de couleur recousu : l'ordre des mots et l'accord changent d'une langue à l'autre. */
  const dit = {
    aujourdhui: { bleu: tr('Aujourd’hui bleu'), blanc: tr('Aujourd’hui blanc'), rouge: tr('Aujourd’hui rouge') },
    demain: { bleu: tr('demain bleu'), blanc: tr('demain blanc'), rouge: tr('demain rouge') },
  };
  const parts = [];
  const j = couleurTempo(aujourdhui), d = couleurTempo(demain), r = joursRestants(rouges);
  if (j) parts.push({ texte: dit.aujourdhui[j], rouge: j === 'rouge' });
  if (d) parts.push({ texte: dit.demain[d], rouge: d === 'rouge' });
  // Les rouges restants ne se disent qu'avec une couleur : seuls, ils n'expliquent aucun prix.
  if (parts.length && r != null) parts.push({ texte: trN(r, 'encore {n} rouge', 'encore {n} rouges'), rouge: false });
  return parts.length ? parts : null;
}
