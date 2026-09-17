/* ── La barre de confort d'une pièce (ADR 0039) ─────────────────────────────
 *
 * Elle remplace la barre de réglages rapides (luminosité, couleur, volets) :
 * les cartes de la pièce pilotent déjà tout cela, alors que rien ne disait d'un
 * regard si l'on est BIEN dans la pièce. À gauche l'indice sur 100, son anneau
 * et son mot ; à droite une pastille par mesure que la pièce possède — valeur,
 * point de couleur, verdict. Un tap ouvre la fiche de confort et son
 * historique, qui n'avaient plus que cette barre pour porte.
 *
 * Tout ce qui se calcule vient de `confort.js` ; ici, seulement le dessin. La
 * mise en page vit dans index.css : au téléphone la rangée de mesures reste
 * sur UNE ligne, l'icône au-dessus.
 */
import { Fi, cl_hexRgb } from './ui.jsx';
import { tr } from './i18n.js';

const RAYON = 18;
const TOUR = 2 * Math.PI * RAYON;

export function BarreConfort({ confort, onOpen }) {
  if (!confort) return null;
  const { indice, verdict, mesures } = confort;
  return (
    <div className="o-confort" style={{ '--conf-n': mesures.length }}
      role="button" tabIndex={0} aria-label={tr('Historique du confort')}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      <div className="o-confort-indice">
        <span className="o-confort-anneau" aria-hidden="true">
          <svg width="46" height="46" viewBox="0 0 46 46" focusable="false">
            <circle cx="23" cy="23" r={RAYON} fill="none" stroke="var(--o-s1)" strokeWidth="5" />
            <circle cx="23" cy="23" r={RAYON} fill="none" stroke={verdict.c} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={TOUR} strokeDashoffset={TOUR * (1 - Math.max(0, Math.min(100, indice)) / 100)} transform="rotate(-90 23 23)" />
          </svg>
          <Fi i="leaf" size={15} color={verdict.c} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="o-confort-titre">{tr('INDICE DE CONFORT')}</div>
          <div className="o-confort-note">
            <span className="n">{indice}</span><span className="sur">/ 100</span><span className="mot" style={{ color: verdict.c }}>{verdict.t}</span>
          </div>
        </div>
      </div>
      <span className="o-confort-sep" aria-hidden="true" />
      <div className="o-confort-mesures">
        {mesures.map(m => (
          <div key={m.cle} className="o-confort-mesure">
            <span className="o-confort-ico" style={{ background: 'rgba(' + cl_hexRgb(m.verdict.c) + ',.16)', color: m.verdict.c }}><Fi i={m.icone} size={15} /></span>
            <div className="o-confort-txt">
              <div className="o-confort-nom">{m.nom}</div>
              <div className="o-confort-val">
                <span className="v">{m.valeur}</span>
                <span className="pt" aria-hidden="true" style={{ background: m.verdict.c }} />
                <span className="mot" style={{ color: m.verdict.c }}>{m.verdict.t}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
