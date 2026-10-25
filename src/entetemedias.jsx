/* ── L'en-tête d'Objets › Multimédia (chantier Médias, § 6.4 ; M15) ──────────
 *
 * Le titre du filtre et le compte des lecteurs visibles — « 2 en lecture sur
 * 7 », ou « Rien en lecture », au pluriel de chaque langue —, sans puce
 * d'action : la maquette n'en a pas. Un lecteur se lit avec son jumeau
 * (`lireLecteur`, M14) : la paire de l'Echo Dot compte une fois, et c'est la
 * jumelle HACS qui dit qu'elle joue. Un lecteur indisponible compte dans le
 * total, jamais parmi ceux qui lisent.
 *
 * Son propre module, chargé à la première ouverture du filtre (`lazyRecharge`,
 * App.jsx), comme les en-têtes des volets, des prises et des lumières : ni
 * l'Accueil ni une carte ne l'affichent, et le démarrage n'a pas de place à lui
 * donner (tests/lot14_chargement.test.mjs). Il reçoit un `hass` VIVANT
 * d'`EnteteMediasVive` (App.jsx), qui s'abonne aux lecteurs visibles et à leurs
 * jumeaux — ce module ne peut pas importer `useHass` d'App.jsx.
 *
 * La rangée a la hauteur des autres en-têtes (40 px) ; le compte tient sur UNE
 * ligne (index.css).
 */
import { tr } from './i18n.js';
import { medPlayers } from './state.js';
import { compteLecteurs } from './lecteur.js';

/** Le compte : `{ enLecture, total }` — un lecteur se lit avec son jumeau ; indisponible, il compte dans le total seulement. */
export function compteMedias(ids, S) {
  const lecteurs = medPlayers();
  const c = compteLecteurs(S || {}, ids.map(id => lecteurs.find(p => p.haid === id) || { haid: id, ma: null }));
  return { enLecture: c.enLecture, total: c.total };
}

export default function EnteteMedias({ hass, titre, ids }) {
  const { enLecture, total } = compteMedias(ids, (hass && hass.states) || {});
  return (
    <div className="o-medias-entete">
      <h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titre}</h2>
      <span className="o-medias-compte" style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
        {enLecture ? tr('{n} en lecture sur {t}', { n: enLecture, t: total }) : tr('Rien en lecture')}
      </span>
    </div>
  );
}
