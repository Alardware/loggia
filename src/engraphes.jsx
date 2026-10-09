/* ── Les graphes de l'Énergie ───────────────────────────────────────────────
 *
 * Deux dessins, tous les deux nourris par les statistiques longue durée
 * (stats.js) : l'HISTORIQUE d'une période en barres, et le CALENDRIER des douze
 * derniers mois en damier.
 *
 * Ils vivent ici et non dans `App.jsx` pour la même raison que le journal et
 * les courbes (historique.jsx) : le tronc fait déjà seize mille lignes, et un
 * graphe n'a besoin de rien connaître du reste du tableau de bord.
 *
 * Le texte ne s'étire pas, le dessin si. Le SVG est tracé dans un repère fixe
 * (1000 × 300) avec `preserveAspectRatio="none"` — les barres suivent la
 * largeur de la carte —, mais les étiquettes des axes sont du HTML posé en
 * pourcentage par-dessus : étirées, elles seraient illisibles.
 */
import { useState, useId } from 'react';
import { tr, locale } from './i18n.js';
import { nombre } from './format.js';
import { nomJour } from './robots.js';
import { graduations, suitesPleines } from './stats.js';

const W = 1000, H = 300;

/* ── Une courbe plutôt qu'une ligne brisée ──────────────────────────────────
 *
 * Relier les points au trait droit donne des angles secs et un graphe qui fait
 * « relevé technique ». On lisse donc, par une spline cubique MONOTONE
 * (Fritsch-Carlson) : les tangentes sont bornées pour que la courbe ne dépasse
 * jamais ses points. Un lissage naïf ferait plonger la consommation sous zéro
 * entre deux heures creuses — joli, et faux.
 */
function tangentes(pts) {
  const n = pts.length, pentes = [], m = [];
  for (let i = 0; i < n - 1; i++) pentes.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x || 1));
  m.push(pentes[0]);
  for (let i = 1; i < n - 1; i++) m.push(pentes[i - 1] * pentes[i] <= 0 ? 0 : (pentes[i - 1] + pentes[i]) / 2);
  m.push(pentes[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (pentes[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / pentes[i], b = m[i + 1] / pentes[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); m[i] = k * a * pentes[i]; m[i + 1] = k * b * pentes[i]; }
  }
  return m;
}

function cheminLisse(pts) {
  if (!pts.length) return '';
  const p = (v) => v.toFixed(1);
  if (pts.length === 1) return 'M' + p(pts[0].x) + ' ' + p(pts[0].y);
  const m = tangentes(pts);
  let d = 'M' + p(pts[0].x) + ' ' + p(pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const h = (pts[i + 1].x - pts[i].x) / 3;
    d += ' C' + p(pts[i].x + h) + ' ' + p(pts[i].y + m[i] * h)
      + ' ' + p(pts[i + 1].x - h) + ' ' + p(pts[i + 1].y - m[i + 1] * h)
      + ' ' + p(pts[i + 1].x) + ' ' + p(pts[i + 1].y);
  }
  return d;
}

/**
 * L'historique d'une période, en barres côte à côte.
 *
 * `series` : `[{ nom, couleur, valeurs }]` — une valeur par case, `null` là où
 * rien n'a été mesuré. `veille` trace par-dessus la période précédente, en
 * pointillé : c'est la comparaison, pas une troisième série.
 *
 * Les BARRES plutôt que des aires, pour les quatre périodes : le pas le plus
 * fin que Home Assistant garde au long terme est l'heure, soit vingt-quatre
 * points sur une journée. Une aire à vingt-quatre points se lit moins bien
 * qu'une barre, et surtout elle laisserait croire à une mesure continue. Le
 * tracé fin des dernières heures reste où il a toujours été : la carte
 * « Sources de puissance », qui lit l'historique d'états.
 */
export function EnHistoBarres({ series = [], cases = [], unite = 'kWh', veille = null, veilleNom = null, decimales = 1, hauteur = 290, mode = 'barres' }) {
  const [survol, setSurvol] = useState(null);
  /* Un identifiant par graphe : deux graphes sur la même page partageraient
   * sinon leurs dégradés, et le second effacerait le premier. */
  const idGraphe = useId().replace(/[^a-zA-Z0-9]/g, '');
  const vraies = (series || []).filter(s => s && Array.isArray(s.valeurs));
  const n = cases.length;
  if (!n || !vraies.length) {
    return (
      <div style={{ height: hauteur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
        {tr('historique indisponible')}
      </div>
    );
  }
  /* L'ECHELLE SUIT CE QU'ON DESSINE (08/10).
   *
   * En BARRES, les series s'empilent : la plus haute colonne est la plus
   * grande SOMME, pas la plus grande valeur. L'echelle prenait le maximum
   * d'une serie — trois series de 8 kWh faisaient une colonne de 24 sur un axe
   * gradue jusqu'a 10, et la barre sortait du cadre par le haut.
   *
   * En AIRES, les traces se superposent sans s'additionner : c'est bien le
   * maximum d'une serie qui donne le plafond.
   *
   * La veille, elle, est une ligne a part dans les deux cas. */
  const sommes = cases.map((_, i) => vraies.reduce((s, serie) => {
    const v = serie.valeurs[i];
    return s + (v != null && isFinite(v) && v > 0 ? v : 0);
  }, 0));
  const tous = (mode === 'aires' ? vraies.flatMap(s => s.valeurs) : sommes)
    .concat(veille || []).filter(v => v != null && isFinite(v));
  const { haut, vals } = graduations(Math.max(0, ...tous));
  const Y = (v) => H - (v / haut) * H;
  const pas = W / n;
  /* UNE SEULE BARRE PAR CASE, les séries empilées dedans (08/10).
   *
   * Elles se rangeaient côte à côte : trois séries sur vingt-quatre heures
   * faisaient 72 barres, la plus fine à 2,54 px réels sur un téléphone — des
   * traits. Empilée, la barre prend toute sa colonne, et ce qu'on compare
   * d'une heure à l'autre est la HAUTEUR TOTALE, qui est le vrai sujet.
   *
   * 82 % de la colonne : l'écart entre deux heures reste lisible. */
  const large = Math.min(34, Math.max(3, pas * 0.82));
  const fmt = (v) => nombre(v, decimales) + ' ' + unite;

  const ns = { vectorEffect: 'non-scaling-stroke' };
  const els = [];
  vals.forEach((v, i) => els.push(
    <line key={'g' + i} x1={0} x2={W} y1={Y(v)} y2={Y(v)} style={{ stroke: i ? 'var(--o-bd3)' : 'var(--o-bd1)', strokeWidth: 1, ...ns }} />
  ));
  /* La colonne survolée se surligne AVANT les barres : un fond posé après les
   * recouvrirait. */
  if (survol != null && cases[survol]) els.push(
    <rect key="sur" x={survol * pas + 1} y={0} width={pas - 2} height={H} style={{ fill: 'var(--o-s1)' }} />
  );
  const isoles = [];
  if (mode === 'aires') {
    /* UNE JOURNÉE se lit en courbe : le relief d'une consommation se suit mieux
     * d'un trait continu que de vingt-quatre bâtons. Les aires se posent de la
     * dernière série à la première pour que la production, plus large, reste
     * derrière la consommation.
     *
     * UN TROU COUPE LE TRAIT. Sauter les cases vides et relier les deux points
     * de part et d'autre dessinait une diagonale de dix-huit heures entre une
     * mesure de minuit et une de six heures du soir — un relief inventé, sur
     * une installation qui n'a encore que quelques points. Chaque suite de
     * cases mesurées fait donc son propre tracé, et ce qu'on ne sait pas reste
     * blanc (ADR 0030). */
    const X = (i) => (n > 1 ? i / (n - 1) * W : W / 2);
    const suites = suitesPleines;
    const chemin = (vals, is) => cheminLisse(is.map(i => ({ x: X(i), y: Y(vals[i]) })));
    els.push(
      <defs key="deg">
        {vraies.map((s, j) => (
          <linearGradient key={j} id={'lgA' + idGraphe + j} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: s.couleur, stopOpacity: 0.33 }} />
            <stop offset="1" style={{ stopColor: s.couleur, stopOpacity: 0.02 }} />
          </linearGradient>
        ))}
      </defs>
    );
    [...vraies].reverse().forEach((s) => {
      const j = vraies.indexOf(s);
      suites(s.valeurs).forEach((is, k) => {
        if (is.length < 2) return;          // une aire d'un seul point n'a pas de surface
        els.push(<path key={'a' + j + '-' + k}
          d={chemin(s.valeurs, is) + ' L' + X(is[is.length - 1]).toFixed(1) + ' ' + H + ' L' + X(is[0]).toFixed(1) + ' ' + H + ' Z'}
          style={{ fill: 'url(#lgA' + idGraphe + j + ')' }} />);
      });
    });
    vraies.forEach((s, j) => {
      suites(s.valeurs).forEach((is, k) => {
        /* Une mesure SEULE entre deux trous n'a pas de trait à tracer : elle
         * sort en point, posé en HTML par-dessus. Un cercle SVG deviendrait un
         * ovale — le repère est étiré en largeur (`preserveAspectRatio`). */
        if (is.length < 2) {
          const i = is[0];
          isoles.push({ cle: 'p' + j + '-' + k, couleur: s.couleur, gauche: (n > 1 ? i / (n - 1) : 0.5) * 100, haut: (1 - s.valeurs[i] / haut) * 100 });
          return;
        }
        els.push(<path key={'l' + j + '-' + k} d={chemin(s.valeurs, is)} fill="none"
          style={{ stroke: s.couleur, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', ...ns }} />);
      });
    });
    if (veille) {
      suites(veille).forEach((is, k) => {
        if (is.length < 2) return;
        els.push(<path key={'v' + k} d={chemin(veille, is)} fill="none"
          style={{ stroke: 'var(--o-text3)', strokeWidth: 1.5, strokeDasharray: '5 5', strokeLinejoin: 'round', ...ns }} />);
      });
    }
  } else {
  /* LES DEGRADES DES BARRES, comme ceux des aires : une barre d'aplat uni
   * detonne dans un tableau de bord qui est en lavis d'un bout a l'autre. La
   * teinte est pleine en bas, ou la barre a du poids, et s'allege vers le
   * haut — c'est la lumiere qui vient d'en haut, la meme que les cartes. */
  els.push(
    <defs key="degB">
      {vraies.map((s, j) => (
        <linearGradient key={j} id={'lgB' + idGraphe + j} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: s.couleur, stopOpacity: 0.72 }} />
          <stop offset="1" style={{ stopColor: s.couleur, stopOpacity: 1 }} />
        </linearGradient>
      ))}
    </defs>
  );

  /* Un rectangle dont SEUL LE HAUT est arrondi : le bas d'un segment pose sur
   * le segment d'en dessous, ou sur la ligne de base, et un coin rond l'en
   * décollerait. Le `rx` d'un <rect> arrondirait les quatre. Le rayon se réduit
   * pour un segment plus court que lui, sinon le tracé se replie. */
  const haussee = (x, y, w, h, r) => {
    const a = Math.max(0, Math.min(r, w / 2, h));
    return 'M' + x + ' ' + (y + h) + 'V' + (y + a)
      + 'a' + a + ' ' + a + ' 0 0 1 ' + a + ' ' + (-a)
      + 'h' + (w - 2 * a)
      + 'a' + a + ' ' + a + ' 0 0 1 ' + a + ' ' + a
      + 'V' + (y + h) + 'Z';
  };
  /* LE RAIL DE LA COLONNE. Une barre posée sur rien flotte ; sur un rail à
   * peine visible, elle a une assise, et une heure sans rien se lit comme une
   * heure vide plutôt que comme un trou dans le graphe. */
  cases.forEach((c, i) => {
    const x = i * pas + (pas - large) / 2;
    els.push(<path key={'r' + i} d={haussee(x, 0, large, H, 4)}
      style={{ fill: 'var(--o-s2)', opacity: survol === i ? 0.85 : 0.45 }} />);
  });
  cases.forEach((c, i) => {
    const x = i * pas + (pas - large) / 2;
    /* On empile du bas vers le haut, dans l'ordre des séries : la pile se lit
     * donc dans le même ordre que la légende. */
    let cumul = 0;
    const pile = [];
    vraies.forEach((s, j) => {
      const v = s.valeurs[i];
      if (v == null || !isFinite(v) || v <= 0) return;
      pile.push({ j, s, bas: cumul, haut: cumul + v });
      cumul += v;
    });
    pile.forEach((p, rang) => {
      const yHaut = Y(p.haut);
      const yBas = Y(p.bas);
      /* 2 px de surface entre deux segments : sans cet écart, deux teintes
       * voisines se touchent et la pile se lit comme un seul bloc. Le segment
       * du bas garde son pied sur la ligne de base. */
      const ecart = rang > 0 ? 2 : 0;
      const h = Math.max(0.5, yBas - yHaut - ecart);
      const dernier = rang === pile.length - 1;
      /* LA POUSSE : chaque colonne monte depuis sa base, un cheveu après la
       * précédente. Le balayage se lit de gauche à droite, comme la journée.
       * `transform-origin` au PIED de la barre — au centre, elle grandirait
       * aussi vers le bas, à travers l'axe. Plafonné à 0,4 s pour que la
       * dernière colonne d'une année n'arrive pas une seconde après. */
      els.push(<path key={'b' + i + '-' + p.j} d={haussee(x, yHaut, large, h, dernier ? 4 : 0)}
        className="o-barre"
        style={{ fill: 'url(#lgB' + idGraphe + p.j + ')', transition: 'd .45s cubic-bezier(.22,.61,.36,1)',
          transformOrigin: (x + large / 2).toFixed(1) + 'px ' + H + 'px',
          animationDelay: Math.min(400, i * 14) + 'ms',
          opacity: survol == null || survol === i ? 1 : 0.5 }} />);
    });
  });
  }
  if (veille && mode !== 'aires') {
    /* La veille en LIGNE pointillée : elle traverse les barres sans prétendre
     * en être une. Un trou dans la série coupe le trait au lieu de le
     * rabattre sur zéro. */
    let d = '', ouvert = false;
    veille.forEach((v, i) => {
      if (v == null || !isFinite(v)) { ouvert = false; return; }
      d += (ouvert ? 'L' : 'M') + (i * pas + pas / 2).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ';
      ouvert = true;
    });
    if (d) els.push(<path key="veille" d={d} fill="none"
      style={{ stroke: 'var(--o-text3)', strokeWidth: 1.5, strokeDasharray: '5 5', strokeLinejoin: 'round', ...ns }} />);
  }
  /* Les zones de survol en dernier, transparentes et par-dessus tout : chacune
   * porte son propre libellé, ce qui donne l'infobulle du système aux lecteurs
   * d'écran et au clavier, là où un calque unique n'aurait rien dit. */
  cases.forEach((c, i) => {
    const lignes = vraies.map(s => s.valeurs[i] != null ? s.nom + ' ' + fmt(s.valeurs[i]) : null).filter(Boolean);
    els.push(
      <rect key={'z' + i} x={i * pas} y={0} width={pas} height={H} style={{ fill: 'transparent', cursor: 'crosshair', touchAction: 'pan-y' }}
        onPointerEnter={() => setSurvol(i)} onPointerDown={() => setSurvol(i)}>
        <title>{c.titre + (lignes.length ? ' · ' + lignes.join(' · ') : ' · ' + tr('pas encore de données'))}</title>
      </rect>
    );
  });

  // Un libellé sur cinq quand les cases se serrent : trente-et-un jours ne
  // tiennent pas côte à côte, mais le premier et le dernier doivent se lire.
  const chaque = n > 14 ? Math.ceil(n / 7) : 1;
  const bulle = survol != null && cases[survol] ? survol : null;
  const gauche = bulle != null ? ((bulle + 0.5) / n) * 100 : 0;

  return (
    <div style={{ position: 'relative', height: hauteur, marginTop: 18 }}
      onPointerLeave={() => setSurvol(null)}>
      <div style={{ position: 'absolute', left: 46, right: 4, top: 8, bottom: 28 }}>
        {vals.map((v, i) => (
          <span key={'y' + i} aria-hidden="true" style={{ position: 'absolute', left: -46, width: 38, textAlign: 'right', top: ((1 - v / haut) * 100).toFixed(2) + '%', transform: 'translateY(-50%)', fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {i === vals.length - 1 ? nombre(v, v < 10 ? 1 : 0) + ' ' + unite : nombre(v, v < 10 && v > 0 ? 1 : 0)}
          </span>
        ))}
        {cases.map((c, i) => (i % chaque === 0 || i === n - 1) && (
          <span key={'x' + i} aria-hidden="true" style={{ position: 'absolute', top: 'calc(100% + 9px)', left: ((i + 0.5) / n * 100).toFixed(2) + '%', transform: 'translateX(-50%)', fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{c.label}</span>
        ))}
        <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" role="presentation"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>{els}</svg>
        {bulle != null && mode === 'aires' && (
          <>
            {/* Le filet du moment survolé, et un point par série : on lit la
              * valeur sur la courbe, pas seulement dans la bulle. */}
            <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: gauche.toFixed(2) + '%', width: 1, background: 'var(--o-bd1)', pointerEvents: 'none' }} />
            {vraies.map((s, j) => (s.valeurs[bulle] != null && isFinite(s.valeurs[bulle]) ? (
              <span key={'d' + j} aria-hidden="true" style={{ position: 'absolute', left: gauche.toFixed(2) + '%', top: ((1 - s.valeurs[bulle] / haut) * 100).toFixed(2) + '%', width: 10, height: 10, borderRadius: '50%', background: s.couleur, boxShadow: '0 0 0 3px var(--o-surfB)', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
            ) : null))}
          </>
        )}
        {isoles.map(p => (
          <span key={p.cle} aria-hidden="true" style={{ position: 'absolute', left: p.gauche.toFixed(2) + '%', top: p.haut.toFixed(2) + '%', width: 7, height: 7, borderRadius: '50%', background: p.couleur, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
        ))}
        {bulle != null && (
          <div aria-hidden="true" style={{ position: 'absolute', top: 6, left: gauche.toFixed(2) + '%', transform: gauche > 62 ? 'translateX(calc(-100% - 14px))' : 'translateX(14px)', minWidth: 160, padding: '10px 12px', borderRadius: 12, background: 'var(--o-header)', border: 'var(--o-bw,1px) solid var(--o-bd2)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', boxShadow: 'var(--o-shadow)', pointerEvents: 'none', zIndex: 2 }}>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--o-text2)', marginBottom: 6 }}>{cases[bulle].titre}</div>
            {vraies.every(s => s.valeurs[bulle] == null) && (!veille || veille[bulle] == null)
              ? <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('pas encore de données')}</div>
              : (
                <>
                  {vraies.map(s => s.valeurs[bulle] != null && (
                    <div key={s.nom} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 3, background: s.couleur, flexShrink: 0 }} />
                      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{s.nom}</span>
                      <span style={{ fontWeight: 800, color: 'var(--o-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(s.valeurs[bulle])}</span>
                    </div>
                  ))}
                  {veille && veille[bulle] != null && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)' }}>
                      <span style={{ width: 10, borderTop: '2px dashed var(--o-text3)', flexShrink: 0 }} />
                      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{veilleNom || tr('Période précédente')}</span>
                      <span style={{ fontWeight: 800, color: 'var(--o-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmt(veille[bulle])}</span>
                    </div>
                  )}
                </>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Le calendrier des douze derniers mois : une ligne par mois, une case par jour,
 * d'autant plus teintée que la journée a été chargée.
 *
 * `mois` : `[{ label, jours: [{ valeur, titre, aujourdhui, hors }] }]` — `hors`
 * marque les cases qui n'existent pas (le 31 d'un mois de trente jours).
 *
 * Trente-et-une colonnes ne tiennent pas dans un téléphone : la grille défile
 * horizontalement, et comme toute rangée qui défile elle n'a pas d'ombre
 * (ADR 0059).
 */
export function EnCalendrier({ mois = [], rgb = 'var(--o-accent-rgb)', min = null, max = null, formater = null, onJour = null }) {
  if (!mois.length) return null;
  const vus = mois.flatMap(m => m.jours.map(j => j.valeur)).filter(v => v != null && isFinite(v));
  if (!vus.length) {
    return <div style={{ padding: '18px 0', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('pas encore de données')}</div>;
  }
  const lo = min != null ? min : Math.min(...vus);
  const hi = max != null ? max : Math.max(...vus);
  const fmt = formater || ((v) => nombre(v, 1));
  /* Un dixième d'encre au minimum : une journée très basse reste une case
   * teintée, pas un trou dans la grille. */
  const teinte = (v) => 'rgba(' + rgb + ',' + (0.1 + 0.9 * (hi > lo ? (v - lo) / (hi - lo) : 1)).toFixed(2) + ')';
  const colonnes = '58px repeat(31,minmax(0,1fr))';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
        <span>{fmt(lo)}</span>
        <span aria-hidden="true" style={{ width: 150, height: 8, borderRadius: 4, background: 'linear-gradient(90deg,rgba(' + rgb + ',.1),rgba(' + rgb + ',1))' }} />
        <span>{fmt(hi)}</span>
      </div>
      <div className="o-cal-defile" style={{ overflowX: 'auto', marginTop: 14 }}>
        <div style={{ minWidth: 620, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {mois.map((m) => (
            <div key={m.label} className="o-cal-ligne" style={{ display: 'grid', gridTemplateColumns: colonnes, gap: 3, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{m.label}</span>
              {m.jours.map((j, k) => {
                /* Une case s'OUVRE si l'appelant sait quoi en faire et si elle
                 * a quelque chose a montrer : les derniers jours d'un mois de
                 * trente sont des trous, et ceux qui restent a venir dans le
                 * mois en cours ne sont pas encore des journees. */
                const ouvrable = !!onJour && !j.hors && !j.aVenir && j.instant != null;
                const Case = ouvrable ? 'button' : 'span';
                return (
                  <Case key={k} className="o-cal-case" type={ouvrable ? 'button' : undefined}
                    title={j.titre || undefined} aria-label={ouvrable ? j.titre : undefined}
                    onClick={ouvrable ? () => onJour(j.instant) : undefined}
                    style={{ height: 20, borderRadius: 4, padding: 0, border: 'none', appearance: 'none', font: 'inherit', cursor: ouvrable ? 'pointer' : 'default', background: j.hors ? 'transparent' : (j.valeur == null ? 'var(--o-s1)' : teinte(j.valeur)), boxShadow: j.aujourdhui ? '0 0 0 1.5px var(--o-text)' : 'none' }} />
                );
              })}
            </div>
          ))}
          <div aria-hidden="true" className="o-cal-ligne o-cal-jours" style={{ display: 'grid', gridTemplateColumns: colonnes, gap: 3, marginTop: 5 }}>
            <span />
            {Array.from({ length: 31 }, (_, i) => (
              <span key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * LE CALENDRIER D'UN MOIS, pour le telephone : sept colonnes, une case par
 * jour, son numero en haut et sa valeur en gros.
 *
 * Le damier des douze mois demande trente-et-une colonnes : lisible sur un
 * grand ecran, illisible sur un telephone. La maquette mobile montre donc un
 * vrai calendrier, qu'on feuillette mois par mois.
 *
 * `cases` et `serie` viennent de la periode « mois » (stats.js) : une entree
 * par jour, dans l'ordre. Le decalage du premier jour se calcule sur sa date —
 * la semaine commence le lundi, comme partout dans Loggia.
 */
export function CalendrierMois({ cases = [], serie = null, rgb = 'var(--o-accent-rgb)', formater = null, maintenant = Date.now(), onJour = null }) {
  const l = locale();
  const fmt = formater || ((v) => nombre(v, 0));
  const vus = (serie || []).filter(v => v != null && isFinite(v));
  const lo = vus.length ? Math.min(...vus) : 0;
  const hi = vus.length ? Math.max(...vus) : 0;
  /* Un dixieme d'encre au minimum : une journee tres basse reste une case
   * teintee, pas un trou dans la grille. */
  const teinte = (v) => 'rgba(' + rgb + ',' + (0.1 + 0.9 * (hi > lo ? (v - lo) / (hi - lo) : 1)).toFixed(2) + ')';
  const auj = new Date(maintenant);
  const memeJour = (d) => d.getFullYear() === auj.getFullYear() && d.getMonth() === auj.getMonth() && d.getDate() === auj.getDate();
  // `getDay()` rend 0 pour dimanche : la semaine commence le lundi.
  const vides = cases.length ? (new Date(cases[0].debut).getDay() + 6) % 7 : 0;
  if (!cases.length) return null;

  return (
    <div>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 6, marginBottom: 6 }}>
        {[0, 1, 2, 3, 4, 5, 6].map(j => (
          <span key={j} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)' }}>{nomJour(j, l, 'narrow')}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', gap: 6 }}>
        {Array.from({ length: vides }, (_, i) => <span key={'v' + i} />)}
        {cases.map((c, i) => {
          const v = serie && serie[i] != null && isFinite(serie[i]) ? serie[i] : null;
          const d = new Date(c.debut);
          const aVenir = c.debut > maintenant;
          /* Une case qui M\u00c8NE quelque part est un bouton : au clavier comme au
           * doigt, et avec le nom que les lecteurs d'\u00e9cran annoncent. Un jour \u00e0
           * venir n'a rien \u00e0 montrer \u2014 il reste inerte. */
          const ouvrable = !!onJour && !aVenir;
          const Case = ouvrable ? 'button' : 'div';
          return (
            <Case key={c.debut} type={ouvrable ? 'button' : undefined} title={c.titre + (v != null ? ' \u00b7 ' + fmt(v) : '')}
              aria-label={ouvrable ? c.titre : undefined} onClick={ouvrable ? () => onJour(c.debut) : undefined}
              style={{ position: 'relative', aspectRatio: '1 / 1', minWidth: 0, borderRadius: 10, padding: 5, boxSizing: 'border-box',
                border: 'none', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: ouvrable ? 'pointer' : 'default',
                background: v != null ? teinte(v) : 'var(--o-s1)',
                opacity: aVenir ? 0.45 : 1,
                boxShadow: memeJour(d) ? '0 0 0 1.5px var(--o-text)' : 'none',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: v != null ? 'var(--o-text)' : 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>{d.getDate()}</span>
              {v != null && <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>{fmt(v)}</span>}
            </Case>
          );
        })}
      </div>
      {vus.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
          <span>{fmt(lo)}</span>
          <span aria-hidden="true" style={{ flex: 1, height: 7, borderRadius: 4, background: 'linear-gradient(90deg,rgba(' + rgb + ',.1),rgba(' + rgb + ',1))' }} />
          <span>{fmt(hi)}</span>
        </div>
      )}
    </div>
  );
}
