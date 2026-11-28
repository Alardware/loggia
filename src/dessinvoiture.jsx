/* ── La voiture (ADR 0392) ──
 *
 * Une berline électrique de profil, en photo de studio détourée, sans marque : la même pour toutes. Une teinte par thème — argent
 * au sombre, graphite au clair (son choix du 27/11) ; la bascule se fait en CSS (index.css, `.vo-photo-sombre` / `.vo-photo-clair`),
 * à l'instant où le thème change. L'ombre au sol est un noir translucide : elle va sur tous les fonds.
 * Ce qu'elle dit, seulement quand la voiture le publie, dessiné par-dessus la photo aux couleurs du thème :
 *  - branchée : la borne à gauche et son câble, vert ; en charge, le courant qui coule dans le câble (`vo-flux`) ;
 *  - une portière ouverte : elle s'ouvre sur la photo, l'habitacle sombre derrière elle ;
 *  - le climat en marche : l'air qui monte au-dessus du toit (`vo-air`) ;
 *  - muette : tout en gris, rien ne bouge.
 * « Réduire les animations » et le mode calme figent tout (index.css). Pas de chiffre ici : le dessin ne remplace pas une valeur.
 */
import { useId } from 'react';
import photoSombre from './assets/voiture/voiture-argent.webp';
import photoClair from './assets/voiture/voiture-graphite.webp';

const V = (n) => 'var(--vo-' + n + ')';
const mix = (a, p, b) => 'color-mix(in srgb, ' + V(a) + ' ' + p + '%, ' + V(b) + ')';

/* La photo et ses repères, dans le repère du dessin : la borne entre x = 9 et 29, le sol à y = 136 (le bas des pneus). Les deux
 * teintes sont la même prise de vue : mêmes portières, même trappe. L'avant est à droite, la trappe de charge à l'arrière gauche. */
const PHOTO = { x: 33.9, y: 26, l: 354.2, h: 113.3 };
// Les portières entières, vitre comprise, et leur charnière (le bord avant). Ouverte, une portière pivote vers nous : vue de
// profil, elle se resserre vers sa charnière (`OUVERTURE`, le cosinus de l'angle, ≈ 65°) et l'habitacle sombre paraît derrière.
const PORTES = {
  arriere: { d: 'M186 33.8 L186 60.4 L196.1 61.7 L198.4 114.2 L157.2 113.3 C152.5 112 145 106 141 100.6 C138 95 136 91 134.5 87.6 L124.7 64.9 L129.3 58.4 L137.7 36.7 L149.7 34.4 L165.9 33.8 Z', charniere: 194 },
  avant: { d: 'M194.5 33.8 L214.6 34.8 L234.1 38 L247 44.5 L260 52.3 L274.6 60.4 L278.5 61.7 L279.5 115.9 L198.4 114.2 L196.1 61.7 Z', charniere: 279 },
};
const OUVERTURE = 0.5;
// Ce qu'on voit par l'ouverture : le siège (dossier, appui-tête, assise) ; la portière en cache l'avant. `bord` : le bord libre
// de la portière, son épaisseur une fois ouverte.
const SIEGES = {
  arriere: 'M129 92 C129 80 130 66 133 59 L148 58 C150 68 151 80 151 88 L158 87 C160 89 160.5 93 159 96 L130 97 Z M135 50.5 L146 50.5 C147.5 50.5 148 51.5 148 53 L148 55.5 L134 55.5 L134 53 C134 51.5 134 50.5 135 50.5 Z',
  avant: 'M200 92 C200 80 201 64 204 57 L220 56 C222 66 223 78 223 87 L237 86 C239 88 239.5 92 238 95.5 L201 97 Z M206 47 L218 47 C219.5 47 220 48 220 49.5 L220 53.5 L205 53.5 L205 49.5 C205 48 205 47 206 47 Z',
};
const BORDS = { arriere: 'M186 33.8 L186 60.4 L196.1 61.7 L198.4 114.2', avant: 'M194.5 33.8 L196.1 61.7 L198.4 114.2' };
const TRAPPE = { x: 80, y: 67, w: 10, h: 6.5 };
const CABLE = 'M29 100 C34 138 62 142 72 122 C77 110 81 95 85 76';
const CABLE_COURT = 'M85 76 C80 96 70 111 57 121';

function Borne({ id, enCharge }) {
  return (
    <g data-borne="">
      <rect x="5" y="134" width="28" height="3" rx="1.5" style={{ fill: V('nuit'), fillOpacity: 0.35 }} />
      <path d="M9 135 L9 62 Q9 55 16 55 L22 55 Q29 55 29 62 L29 135 Z" style={{ fill: 'url(#' + id + 'b)' }} />
      <rect x="12" y="61" width="14" height="36" rx="3" style={{ fill: mix('nuit', 80, 'caisse') }} />
      <rect x="17.6" y="66" width="2.8" height="25" rx="1.4" style={enCharge ? { fill: 'var(--o-ok)' } : { fill: V('lum'), fillOpacity: 0.25 }} />
      {enCharge && <rect x="16" y="64" width="6" height="29" rx="3" style={{ fill: 'var(--o-ok)', fillOpacity: 0.22 }} />}
      <path d="M10 62 Q10 56 16 56 L22 56" fill="none" style={{ stroke: V('lum'), strokeOpacity: 0.35 }} strokeWidth="0.8" />
    </g>
  );
}

/**
 * `etat` : `{ branchee, enCharge, ouverts: ['avant'|'arriere'], clim, muette }`. `borne` : dessiner la borne et le câble (la fiche) ;
 * la carte ne garde que la voiture, son câble court. `largeur` : en pixels, la hauteur suit.
 */
export default function DessinVoiture({ etat = {}, borne = true, largeur = 320, titre = null }) {
  const id = 'vo' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const { branchee = false, enCharge = false, ouverts = [], clim = false, muette = false } = etat;
  const air = clim && !muette;
  const ouvertes = ['arriere', 'avant'].filter(c => ouverts.indexOf(c) >= 0);
  const cable = borne ? CABLE : CABLE_COURT;
  const x0 = borne ? 0 : 36;
  const l = borne ? 392 : 350;
  const h = 144;
  return (
    <svg role={titre ? 'img' : undefined} aria-label={titre || undefined} aria-hidden={titre ? undefined : 'true'} width={largeur} height={Math.round(largeur * h / l)}
      viewBox={x0 + ' 2 ' + l + ' ' + h} data-voiture={muette ? 'muette' : enCharge ? 'charge' : branchee ? 'branchee' : 'repos'}
      className={'vo-dessin' + (enCharge && !muette ? ' vo-anime' : '')} style={{ display: 'block', maxWidth: '100%', height: 'auto', overflow: 'visible', filter: muette ? 'grayscale(1)' : undefined, opacity: muette ? 0.5 : 1 }}>
      <defs>
        <linearGradient id={id + 'b'} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: mix('lum', 30, 'caisse') }} />
          <stop offset="0.4" style={{ stopColor: mix('lum', 12, 'caisse') }} />
          <stop offset="1" style={{ stopColor: mix('nuit', 35, 'caisse') }} />
        </linearGradient>
        {/* L'habitacle, vu par une portière ouverte : sombre, un peu de jour en haut par les vitres d'en face. */}
        <linearGradient id={id + 'h'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: mix('nuit', 72, 'lum') }} />
          <stop offset="0.45" style={{ stopColor: mix('nuit', 92, 'lum') }} />
          <stop offset="1" style={{ stopColor: V('nuit') }} />
        </linearGradient>
        <linearGradient id={id + 's'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: mix('nuit', 62, 'lum') }} />
          <stop offset="1" style={{ stopColor: mix('nuit', 82, 'lum') }} />
        </linearGradient>
        {ouvertes.map(c => <clipPath key={c} id={id + 'p' + c}><path d={PORTES[c].d} /></clipPath>)}
      </defs>

      {borne && branchee && <Borne id={id} enCharge={enCharge} />}

      {/* L'air qui monte au-dessus du toit, le climat en marche. */}
      {air && [162, 184, 206].map((x, i) => (
        <path key={x} className="vo-air" d={'M' + x + ' 26 q-3.5 -4.5 0 -9 q3.5 -4.5 0 -9'} fill="none" style={{ stroke: 'var(--o-accent)', animationDelay: (i * 0.45).toFixed(2) + 's' }} strokeWidth="1.6" strokeLinecap="round" />
      ))}

      {/* La voiture : argent au thème sombre, graphite au clair (index.css montre l'une, cache l'autre). */}
      <image className="vo-photo-sombre" href={photoSombre} x={PHOTO.x} y={PHOTO.y} width={PHOTO.l} height={PHOTO.h} preserveAspectRatio="xMidYMid meet" />
      <image className="vo-photo-clair" href={photoClair} x={PHOTO.x} y={PHOTO.y} width={PHOTO.l} height={PHOTO.h} preserveAspectRatio="xMidYMid meet" />

      {/* Une portière ouverte : l'habitacle sombre à sa place, puis la portière elle-même, prise sur la photo et resserrée vers
        * sa charnière — elle a pivoté vers nous. */}
      {ouvertes.map(c => (
        <g key={'h' + c}>
          <path d={PORTES[c].d} style={{ fill: 'url(#' + id + 'h)' }} />
          <path d={SIEGES[c]} clipPath={'url(#' + id + 'p' + c + ')'} style={{ fill: 'url(#' + id + 's)' }} />
        </g>
      ))}
      {ouvertes.map(c => {
        const h = PORTES[c].charniere;
        return (
          <g key={c} data-porte="ouverte" transform={'translate(' + h + ' 0) scale(' + OUVERTURE + ' 1) translate(' + (-h) + ' 0)'}>
            {[['vo-photo-sombre', photoSombre], ['vo-photo-clair', photoClair]].map(([classe, src]) => (
              <image key={classe} className={classe} href={src} x={PHOTO.x} y={PHOTO.y} width={PHOTO.l} height={PHOTO.h} preserveAspectRatio="xMidYMid meet" clipPath={'url(#' + id + 'p' + c + ')'} />
            ))}
            {/* Tournée vers l'avant, la peau de la portière prend moins de lumière ; son bord libre montre son épaisseur. */}
            <path d={PORTES[c].d} style={{ fill: V('nuit'), fillOpacity: 0.22 }} />
            <path d={PORTES[c].d} fill="none" vectorEffect="non-scaling-stroke" style={{ stroke: V('nuit'), strokeOpacity: 0.5 }} strokeWidth="0.8" />
            <path d={BORDS[c]} fill="none" vectorEffect="non-scaling-stroke" style={{ stroke: mix('nuit', 70, 'lum') }} strokeWidth="2.6" strokeLinejoin="round" />
            <path d={BORDS[c]} fill="none" vectorEffect="non-scaling-stroke" style={{ stroke: V('lum'), strokeOpacity: 0.35 }} strokeWidth="0.7" strokeLinejoin="round" />
          </g>
        );
      })}

      {/* Branchée : la trappe verte, le câble, et le courant qui y coule en charge. */}
      {branchee && (
        <g>
          <rect x={TRAPPE.x} y={TRAPPE.y} width={TRAPPE.w} height={TRAPPE.h} rx="2" style={{ fill: 'var(--o-ok)' }} />
          <path d={cable} fill="none" style={{ stroke: 'var(--o-ok)' }} strokeWidth="2.8" strokeLinecap="round" />
          {enCharge && <path className="vo-flux" d={cable} fill="none" style={{ stroke: V('lum'), strokeOpacity: 0.9 }} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="3 9" />}
          <rect x={TRAPPE.x + 1} y={TRAPPE.y + 1} width="8" height="8.5" rx="2.6" style={{ fill: 'var(--o-ok)', stroke: V('nuit'), strokeOpacity: 0.35 }} strokeWidth="0.7" />
        </g>
      )}
    </svg>
  );
}
