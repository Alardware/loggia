/* ── L'anneau de l'Aperçu ───────────────────────────────────────────────────
 *
 * Seul morceau de dessin de la vue Énergie qui reste dans le tronc : c'est le
 * héros, ce qu'on voit en arrivant sur la page. Les graphes et les calendriers
 * vivent dans `engraphes.jsx`, chargé à la demande.
 *
 * Il a son fichier pour cette raison : importé statiquement depuis
 * `engraphes.jsx`, il y entraînait tout le reste — deux graphes, deux
 * calendriers et le lissage des courbes —, et le budget du boot
 * (`tests/lot14_chargement.test.mjs`) a dit non.
 */
import { useId } from 'react';
import { REDUCE_MOTION, cl_hexRgb } from './ui.jsx';

/**
 * L'ANNEAU DE L'APERÇU : un disque qui se remplit comme un verre, cerclé des
 * parts de chaque source.
 *
 * Deux dessins superposés, repris de la maquette :
 *
 *  - le LIQUIDE, trois vagues décalées sous un niveau qui suit la part
 *    d'énergie propre. Elles glissent toutes les trois à des vitesses
 *    différentes : c'est ce qui donne l'impression d'une surface, et non d'une
 *    image qui défile ;
 *  - l'ANNEAU, un segment par source, séparés d'un petit vide. Une source à
 *    zéro n'a pas de segment du tout — pas un trait invisible.
 *
 * Le masque circulaire porte un identifiant tiré de `useId` : deux anneaux sur
 * la même page (une maison, une démonstration) partageraient sinon le même, et
 * le second effacerait le premier.
 */
export function AnneauEnergie({ pct = 0, couleur = 'var(--o-accent)', mix = [], taille = 216, lueur = null, classe = '', children }) {
  const masque = 'lgliq-' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const S = taille;
  const niveau = S * (1 - (0.16 + 0.62 * Math.max(0, Math.min(100, pct)) / 100));
  /* Une vague fait DEUX fois la largeur : le glissement d'une largeur la ramène
   * exactement sur elle-même, et la boucle ne se voit pas. */
  const onde = (amp, phase) => {
    let d = 'M0 ' + S;
    for (let x = 0; x <= S * 2; x += 6) d += ' L' + x + ' ' + (niveau + amp * Math.sin((x / S) * 2 * Math.PI + phase)).toFixed(1);
    return d + ' L' + S * 2 + ' ' + S + ' Z';
  };
  const couche = (amp, phase, opacite, duree, cle) => (
    <g key={cle} style={REDUCE_MOTION ? undefined : { animation: 'lgWave ' + duree + 's linear infinite' }}>
      <path d={onde(amp, phase)} style={{ fill: couleur, opacity: opacite, transition: REDUCE_MOTION ? 'none' : 'd .9s cubic-bezier(.2,.8,.2,1)' }} />
    </g>
  );

  const c = S / 2, r = c - 2, C = 2 * Math.PI * r;
  const vivants = (mix || []).filter(m => m && m.pct > 0);
  const vide = vivants.length > 1 ? 8 : 0;
  let pose = 0;
  const segments = vivants.map(m => {
    const lg = C * m.pct / 100;
    const el = (
      <circle key={m.label} cx={c} cy={c} r={r} fill="none"
        style={{ stroke: m.couleur, strokeWidth: 2, strokeLinecap: 'round',
          strokeDasharray: Math.max(0.1, lg - vide).toFixed(1) + ' ' + C.toFixed(1),
          strokeDashoffset: (-pose - vide / 2).toFixed(1),
          transition: REDUCE_MOTION ? 'none' : 'stroke-dasharray .7s cubic-bezier(.2,.8,.2,1), stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)' }} />
    );
    pose += lg;
    return el;
  });

  const halo = lueur || cl_hexRgb(couleur);
  return (
    <div className={classe || undefined} style={{ position: 'relative', width: S, height: S, maxWidth: '100%', borderRadius: '50%', overflow: 'hidden',
      background: 'radial-gradient(circle at 50% 38%,var(--o-surfA),var(--o-surfB)) var(--o-bg)',
      boxShadow: '0 0 18px rgba(' + halo + ',.22),0 0 44px rgba(' + halo + ',.14)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
      <svg viewBox={'0 0 ' + S + ' ' + S} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: '50%' }}>
        <defs><clipPath id={masque}><circle cx={S / 2} cy={S / 2} r={S / 2 - 7} /></clipPath></defs>
        <g clipPath={'url(#' + masque + ')'}>
          {couche(9, 0, 0.22, 7, 'a')}{couche(7, 2.1, 0.3, 4.6, 'b')}{couche(5, 4.2, 0.42, 3.2, 'c')}
        </g>
      </svg>
      <svg viewBox={'0 0 ' + S + ' ' + S} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <circle cx={c} cy={c} r={r} fill="none" style={{ stroke: 'var(--o-bd2)', strokeWidth: 2 }} />
        {segments}
      </svg>
      {children}
    </div>
  );
}
