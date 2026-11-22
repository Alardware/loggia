/* Le petit sapin de fin d'année (ADR 0342) : le dessin et ses mots. Le calcul
 * vit dans saison.js. Les couleurs sont celles du thème — le vert, l'or, deux
 * boules —, rien d'écrit en dur ; rien ne bouge. Le lecteur d'écran entend la
 * phrase entière (« Noël dans 45 jours ») et pas l'abréviation. */
import { tr, trN } from './i18n.js';
import { saisonNoel } from './saison.js';

export function SapinNoel({ date, className, style }) {
  const s = saisonNoel(date || new Date());
  if (!s) return null;
  const titre = s.jours === 0 ? tr('Joyeux Noël') : trN(s.jours, 'Noël demain', 'Noël dans {n} jours');
  const mot = s.jours === 0 ? tr('Joyeux Noël') : trN(s.jours, 'J-1', 'J-{n}');
  return (
    <span className={'o-noel' + (className ? ' ' + className : '')} role="img" aria-label={titre} title={titre} style={style}>
      <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M7 1.6 L10.4 6 H8.8 L11.8 10 H9.6 L12.8 13.6 H1.2 L4.4 10 H2.2 L5.2 6 H3.6 Z" fill="var(--o-ok)" />
        <rect x="6" y="13.6" width="2" height="2.2" rx=".5" fill="var(--o-piece-ambre)" />
        <circle cx="7" cy="1.5" r="1.4" fill="var(--o-gold)" />
        <circle cx="5.6" cy="8.6" r=".8" fill="var(--o-bad)" />
        <circle cx="8.6" cy="11.6" r=".8" fill="var(--o-accent)" />
        <circle cx="8.2" cy="7.2" r=".7" fill="var(--o-gold)" />
      </svg>
      <span aria-hidden="true">{mot}</span>
    </span>
  );
}
