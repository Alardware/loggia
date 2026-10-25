/* ── L'en-tête d'Objets › Prises (chantier Prises, § 3.4 ; sa maquette, 1a) ──
 *
 * Le titre du filtre et, à la place du compte des appareils, ce que font les
 * prises : « 3 allumées · 150 W en ce moment », puis « · 1 indisponible »
 * quand il y en a de muettes — au pluriel de chaque langue (`trN`). La
 * puissance est la somme de celles que les cartes montrent : les prises
 * allumées, vivantes, dont le capteur se lit ; sans aucune, elle se tait —
 * jamais « 0 W » inventé. `prises` : `[{ id, puissance }]`, les prises
 * visibles sous le filtre et le capteur que la règle leur donne (`priseDe`).
 *
 * Son propre module, chargé à la première ouverture du filtre (`lazyRecharge`,
 * App.jsx), comme l'en-tête des volets : ni l'Accueil ni une carte ne
 * l'affichent, et le démarrage n'a pas de place à lui donner
 * (tests/lot14_chargement.test.mjs).
 *
 * Il ne se redessine pas tout seul : il reçoit un `hass` VIVANT de
 * `EntetePrisesVive` (App.jsx), qui s'abonne aux prises visibles — ce module
 * ne peut pas importer `useHass` d'App.jsx.
 *
 * Au téléphone (index.css), le compte tient sur UNE ligne : « en ce moment »
 * s'efface, la puissance seule suffit, ses chiffres sont tabulaires — relecture
 * finale, A8. La rangée garde ainsi sa hauteur quelle que soit la puissance, et
 * son repli de chargement (App.jsx, mêmes classes) la même.
 */
import { tr, trN, trSens } from './i18n.js';
import { fmtWatts } from './format.js';
import { wattsDe } from './unites.js';

/** Le compte de l'en-tête : `{ allumees, watts, muettes }` — `watts` null quand aucune puissance ne se lit. */
export function comptePrises(prises, S) {
  let allumees = 0, muettes = 0, watts = null;
  for (const p of prises) {
    const st = S[p.id];
    if (!st || st.state === 'unavailable' || st.state === 'unknown') { muettes += 1; continue; }
    if (st.state !== 'on') continue;
    allumees += 1;
    const w = p.puissance && S[p.puissance] ? wattsDe(S[p.puissance]) : null;
    if (w != null) watts = (watts || 0) + w;
  }
  return { allumees, watts, muettes };
}

// Où « {w} en ce moment » met la puissance : une marque qu'aucune langue n'écrit, pour couper la phrase autour d'elle.
const MARQUE = '\u0001';

export default function EntetePrises({ hass, titre, prises }) {
  const { allumees, watts, muettes } = comptePrises(prises, (hass && hass.states) || {});
  // Les mots autour de la puissance (« en ce moment », « gerade », « right now ») : ce sont eux qui s'effacent au téléphone.
  const [avant, apres = ''] = tr('{w} en ce moment', { w: MARQUE }).split(MARQUE);
  return (
    <div className="o-prises-entete">
      <h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titre}</h2>
      <span className="o-prises-compte" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
        {/* « 1 allumée » d'une PRISE a sa clé (audit du 19/10, point 11e) : le polonais la dit au neutre (« włączone »), une lampe au
          * féminin ; au pluriel, les deux s'accordent pareil (« włączone », « włączonych ») et la clé commune reste. */}
        {allumees === 1 ? trSens('{n} allumée · prise').split('{n}').join('1') : trN(allumees, '{n} allumée', '{n} allumées')}
        {watts != null && <>{' · '}<span className="o-prises-moment">{avant}</span>{fmtWatts(watts)}<span className="o-prises-moment">{apres}</span></>}
        {muettes > 0 && <>{' · '}{trN(muettes, '{n} indisponible', '{n} indisponibles')}</>}
      </span>
    </div>
  );
}
