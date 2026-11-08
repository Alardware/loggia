/* L'aide d'une panne, dans la fiche d'un appareil qui ne répond plus (06/11, étape 9 ; la règle vit dans `pannes.js`).
 *
 * Sous l'en-tête de la fiche : ce qui se tait, la piste à suivre, et — à un administrateur, hors démo — « Ouvrir dans Home
 * Assistant », la page de l'appareil, sinon celle de son intégration. Les fiches à en-tête commun (`EnteteFiche`) ne
 * connaissent pas leur entité : celui qui les ouvre la pose dans `FicheEntite` (appareils/fiches.jsx, la recherche). */
import { createContext, useContext } from 'react';
import { tr } from './i18n.js';
import { Fi } from './ui.jsx';
import { getHass, compteOrdinaire, plateformeDe, appareilDe, plateformeMuette } from './state.js';
import { aidePanne } from './pannes.js';

/** L'entité de la fiche ouverte : `{ id, hass, prise }`, ou null. */
export const FicheEntite = createContext(null);

/* L'origine des pages de Home Assistant, comme le lien du distributeur : rien hors navigateur (les tests), rien dans la démo. */
const origineHA = () => {
  if (typeof window === 'undefined' || window.__loggiaDemo) return null;
  try { return (window.top && window.top.location.origin) || window.location.origin; } catch { return window.location.origin; }
};

/** Ce qu'il faut pour dire la panne de `id`, lu dans l'index ; null quand l'entité répond. */
function aideDe(id, hass = null, estPrise = false) {
  const h = hass || getHass();
  const S = (h && h.states) || {};
  const st = id ? S[id] : null;
  if (!st || st.state !== 'unavailable') return null;
  const app = appareilDe(id);
  const plateforme = plateformeDe(id);
  return aidePanne({ id, st, plateforme, pont: app && app.pont, appareil: app && app.id, estPrise,
    integrationMuette: plateformeMuette(plateforme, S), admin: !compteOrdinaire(h) });
}

/** « Ouvrir dans Home Assistant », seul : la fiche d'une prise a déjà ses mots (ficheprise.jsx). */
export function LienPanne({ id, hass = null }) {
  const aide = aideDe(id, hass);
  const origine = origineHA();
  if (!aide || !aide.chemin || !origine) return null;
  return (
    <a href={origine + aide.chemin} target="_top" rel="noopener"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12.5, fontWeight: 700, color: 'var(--o-accent-soft)', textDecoration: 'none' }}>
      {tr('Ouvrir dans Home Assistant')}<Fi i="arrow-up-right-from-square" size={11} />
    </a>
  );
}

export function AidePanne({ id, hass = null, estPrise = false }) {
  const aide = aideDe(id, hass, estPrise);
  if (!aide) return null;
  return (
    <div role="note" className="o-aide-panne"
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, padding: '11px 13px', borderRadius: 14, background: 'rgba(var(--o-bad-rgb),.08)', border: 'var(--o-bw,1px) solid rgba(var(--o-bad-rgb),.32)' }}>
      <span aria-hidden="true" style={{ flexShrink: 0, display: 'flex', marginTop: 1, color: 'var(--o-bad)' }}><Fi i="signal-alt-slash" size={14} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--o-text)' }}>{aide.titre}</div>
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, color: 'var(--o-text2)', marginTop: 3 }}>{aide.conseil}</div>
        <LienPanne id={id} hass={hass} />
      </div>
    </div>
  );
}

/** Sous l'en-tête commun (`EnteteFiche`) : l'entité que l'ouvreur a posée ; la fiche d'une prise dit la sienne elle-même. */
export function AidePanneFiche() {
  const v = useContext(FicheEntite);
  return v && v.id && !v.prise ? <AidePanne id={v.id} hass={v.hass} /> : null;
}
