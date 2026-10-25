/* ── L'en-tête d'Objets › Lumières (chantier Lumières, § 3.4 ; L2) ──────────
 *
 * Le titre du filtre, le compte des lampes visibles — « 3 allumées sur 6 », ou
 * « Toutes éteintes », au pluriel de chaque langue — et, à droite, « Tout
 * éteindre », seulement si une lampe hors veilleuse est allumée. Un appui
 * éteint les lampes allumées de la famille, sauf les veilleuses de la règle
 * Nuit (`loggia_nuit.veilleuse.lampes`, L2) et les groupes de lumières qui en
 * contiennent une (leur `turn_off` l'éteindrait aussi) : `light.turn_off` pour un
 * `light.*`, `homeassistant.turn_off` pour un switch-lumière — jamais
 * `toggle`. Les cartes le montrent tout de suite (`avancerLumieres`), le
 * compte aussi. Tant que la règle Nuit n'est pas lue, on ne sait pas quelles
 * lampes épargner : la puce attend (une veilleuse inconnue est gardée) — sauf
 * si le module Nuit est ABSENT (`not_available`) : aucune veilleuse ne peut
 * alors exister, et la puce paraît sans rien épargner (ADR 0261). Ce qu'on
 * épargne est la règle de toute la maison (`estEpargnee`, lumieres.js).
 *
 * Son propre module, chargé à la première ouverture du filtre (`lazyRecharge`,
 * App.jsx), comme les en-têtes des volets et des prises : ni l'Accueil ni une
 * carte ne l'affichent, et le démarrage n'a pas de place à lui donner
 * (tests/lot14_chargement.test.mjs). Il reçoit un `hass` VIVANT
 * d'`EnteteLumieresVive` (App.jsx), qui s'abonne aux lampes visibles — ce
 * module ne peut pas importer `useHass` d'App.jsx.
 *
 * La rangée a la hauteur de la puce (40 px), qu'elle soit là ou non ; le
 * compte tient sur UNE ligne ; au téléphone, la puce n'a que son icône
 * (index.css) — son nom le dit toujours.
 */
import { useCallback, useRef } from 'react';
import { tr, trN } from './i18n.js';
import { Fi, useEtatServeur } from './ui.jsx';
import { commanderService } from './actions.js';
import { enPanne } from './outils.js';
import { veilleusesDe, veilleusesLues, estEpargnee } from './lumieres.js';
import { avancerLumieres, avanceDe, useAvancesLumieres } from './lumieresetat.js';

/* Allumée à l'écran : l'avance d'un geste d'abord (« Tout éteindre »), puis la maison. Une muette ne l'est jamais. */
const allumee = (id, st, maintenant) => {
  if (enPanne(id, st)) return false;
  const a = avanceDe(id, st, maintenant);
  return a != null ? a : st.state === 'on';
};

/** Le compte : `{ allumees, total }` — une lampe muette compte dans le total, jamais parmi les allumées. */
export function compteLumieres(ids, S, maintenant = Date.now()) {
  return { allumees: ids.filter(id => allumee(id, S[id], maintenant)).length, total: ids.length };
}

/* Les veilleuses de la règle Nuit, et ce qu'on en lit (lumieres.js) : les tests de l'en-tête les lisent ici. */
export { veilleusesDe, veilleusesLues };

/** Ce que « Tout éteindre » éteint : les lampes allumées, hors veilleuses et hors groupes qui en contiennent une (L2, `estEpargnee`) ; rien tant que les veilleuses ne sont pas connues. */
export function aEteindre(ids, S, veilleuses, maintenant = Date.now()) {
  if (!veilleuses) return [];
  return ids.filter(id => !estEpargnee(id, S, veilleuses) && allumee(id, S[id], maintenant));
}

/** Éteint `ids` : les cartes le montrent tout de suite, puis l'ordre part — `turn_off`, jamais `toggle`. Rend `ids`. */
export function toutEteindre(hass, ids, maintenant = Date.now()) {
  avancerLumieres(ids, false, (hass && hass.states) || {}, maintenant);
  for (const id of ids) commanderService(hass, id, id.indexOf('light.') === 0 ? 'light' : 'homeassistant', 'turn_off', { entity_id: id });
  return ids;
}

// La puce de sa maquette (`ChipButton`) : 40 px de haut, le gris doux, sans bordure — celle de l'en-tête des volets.
const PUCE = { position: 'relative', height: 40, padding: '0 12px', borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)',
  display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 };

export default function EnteteLumieres({ hass, titre, ids }) {
  useAvancesLumieres();
  // La règle Nuit, relue chaque minute : ses veilleuses changent rarement.
  const { etat, codeErr } = useEtatServeur(hass, 'loggia/nuit/etat', 60000);
  /* « Tout éteindre » disparaît sous le doigt : s'il avait le focus, le focus va
   * au compte, qui dit ce qui reste allumé — il ne tombe pas sur la page (la
   * leçon de l'en-tête des volets). React détache la référence AVANT de retirer
   * le bouton : le focus s'y lit encore. */
  const compte = useRef(null);
  const puce = useRef(null);
  const refPuce = useCallback((noeud) => {
    if (noeud) { puce.current = noeud; return; }
    const partie = puce.current;
    puce.current = null;
    if (!partie || typeof document === 'undefined' || document.activeElement !== partie) return;
    queueMicrotask(() => {
      const ici = document.activeElement;
      if (compte.current && (!ici || ici === document.body || ici === partie)) compte.current.focus();
    });
  }, []);
  const S = (hass && hass.states) || {};
  const maintenant = Date.now();
  const { allumees, total } = compteLumieres(ids, S, maintenant);
  const cibles = aEteindre(ids, S, veilleusesLues(etat, codeErr), maintenant);
  return (
    <div className="o-lumieres-entete">
      <h2 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' }}>{titre}</h2>
      <span ref={compte} className="o-lumieres-compte" tabIndex={-1} style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
        {allumees ? trN(allumees, '{n} allumée sur {t}', '{n} allumées sur {t}', { t: total }) : tr('Toutes éteintes')}
      </span>
      {cibles.length > 0 && (
        <button type="button" ref={refPuce} onClick={() => toutEteindre(hass, cibles)} aria-label={tr('Tout éteindre')} title={tr('Tout éteindre')} style={PUCE}>
          <Fi i="power" size={12} /><span className="o-lumieres-tout-mot">{tr('Tout éteindre')}</span>
        </button>
      )}
    </div>
  );
}
