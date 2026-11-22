/* ── Le dessin d'un robot dans sa fiche : l'aspirateur, la tondeuse (sa demande du 22/11, ADR 0389) ──
 *
 * « Pour les robots j'aimerais bien retrouver comme sur Home Assistant le dessin de l'appareil en question animé en activité. »
 * L'appareil vu de dessus, dans un disque, au milieu du panneau de tête de l'Accueil — comme la fiche de Home Assistant, avec nos
 * dessins à nous : l'aspirateur rond, son pare-chocs, ses deux brosses latérales et son capot ; la tondeuse en « D », ses deux
 * grandes roues et la fenêtre de ses lames.
 *
 * Il prend l'ÉTAT de la fiche (`vue.phase`, l'avance d'un geste comprise) :
 *  - au travail, c'est le SOL qui défile sous lui — le parquet et sa poussière, la pelouse rayée et ses touffes —, les brosses ou les
 *    lames tournent, il tient son cap en louvoyant ; la tondeuse rejette ses brins d'herbe ;
 *  - en pause, la même scène, figée, au gris ;
 *  - au retour, sa base paraît en pointillé et des chevrons l'y mènent : l'aspirateur fait demi-tour (il y rentre à reculons), la
 *    tondeuse y va tout droit (elle y entre en avançant) ;
 *  - sur la base, il y est posé ; le témoin de la base ne s'allume que si l'appareil PUBLIE qu'il charge (règle 46 du guide) ;
 *  - en erreur, de travers, au rouge, une pastille « ! », le disque qui pulse ;
 *  - arrêté hors de sa base, seul, au gris ; muet, à demi effacé.
 * « Il bipe » (après « Localiser », que seul l'aspirateur a) : deux ondes de chaque côté.
 *
 * Rien ne bouge sous « réduire les animations » — celui du système comme celui de l'appareil (`html.loggia-calme`) : la scène du
 * travail reste lisible, immobile (index.css). Les couleurs sont des jetons du thème, posés en deux variables (`--rbd-c`, l'encre
 * de l'appareil ; `--rbd-a`, celle de ce qui bouge) ; la coque est au `--o-well` du thème, opaque, pour que le sol passe dessous.
 * Décoratif : le mot d'état, au-dessus, dit déjà tout (`aria-hidden`).
 */
import { useId } from 'react';

const ETATS = ['travail', 'pause', 'retour', 'base', 'erreur', 'repos', 'absent'];

/**
 * Ce que le dessin montre, d'après la phase de la fiche (`phaseRobot`, l'avance d'un geste comprise).
 * `{ famille, etat, encre, accent, station, charge, bipe, anime }` :
 *  - `encre` : celle de l'appareil — sa teinte au travail (l'accent pour l'aspirateur, le vert pour la tondeuse, celles de son mot
 *    d'état), le rouge en erreur, le gris sinon, le gris éteint muet ;
 *  - `accent` : celle de ce qui bouge — la teinte au travail et au retour ;
 *  - `station` : sa base se dessine — sur la base, et au retour, en pointillé ;
 *  - `charge` : le témoin de la base, seulement sur la base ET si l'appareil publie qu'il charge ;
 *  - `bipe` : les ondes de « Localiser », l'aspirateur seul ;
 *  - `anime` : quelque chose bouge (hors « réduire les animations »).
 */
export function etatDessinRobot({ domaine = 'vacuum', phase = 'absent', charge = false, bipe = false } = {}) {
  const tondeuse = domaine === 'lawn_mower';
  const etat = ETATS.indexOf(phase) >= 0 ? phase : 'repos';
  const teinte = tondeuse ? 'var(--o-ok)' : 'var(--o-accent-soft)';
  const encre = etat === 'travail' ? teinte : etat === 'erreur' ? 'var(--o-bad)' : etat === 'absent' ? 'var(--o-text3)' : 'var(--o-text2)';
  const enCharge = etat === 'base' && charge === true;
  const ondes = !tondeuse && bipe === true && etat !== 'absent';
  return {
    famille: tondeuse ? 'tondeuse' : 'aspirateur',
    etat,
    encre,
    accent: etat === 'travail' || etat === 'retour' ? teinte : encre,
    station: etat === 'base' || etat === 'retour',
    charge: enCharge,
    bipe: ondes,
    anime: etat === 'travail' || etat === 'retour' || etat === 'erreur' || enCharge || ondes,
  };
}

/* Un trait de la coque : le fond opaque du thème, puis la teinte et le bord à l'encre de l'appareil. */
const Coque = ({ forme: Forme, ...p }) => (<><Forme className="rbd-coque" {...p} /><Forme className="rbd-bord" {...p} /></>);
const Rond = (p) => <circle {...p} />;
const Chemin = (p) => <path {...p} />;
const Boite = (p) => <rect {...p} />;

/* ════════════ L'aspirateur ════════════ */

// Le parquet : une latte tous les 24 px, les joints en quinconce ; il défile de deux lattes par tour (le motif se répète).
const LATTES = Array.from({ length: 12 }, (_, k) => -48 + k * 24);
// La poussière, devant lui : elle avance avec le sol et passe sous le pare-chocs (le corps la couvre).
const POUSSIERE = [[86, -4, 2.2, 0], [112, 10, 1.7, 0.45], [128, -16, 2, 0.9], [72, 20, 1.6, 1.3], [104, -30, 2.3, 1.75], [94, 30, 1.6, 2.2],
  [120, 28, 2, 2.65], [66, -12, 1.8, 3.05], [134, 6, 1.6, 3.45], [80, -34, 1.9, 3.8]];

function Aspirateur() {
  return (<>
    {/* Les deux brosses latérales, aux coins avant, à moitié sous le corps : un moyeu et trois brins courbes. */}
    {[[59.5, 63.6, 'rbd-brosse-g', 1], [140.5, 63.6, 'rbd-brosse-d', -1]].map(([x, y, c, s]) => (
      <g key={c} className={'rbd-brosse ' + c} style={{ transformOrigin: x + 'px ' + y + 'px' }}>
        {[20, 140, 260].map(a => <path key={a} className="rbd-brin" d={'M' + x + ' ' + y + ' q' + (6 * s) + ' -6 ' + (2 * s) + ' -15'} transform={'rotate(' + a * s + ' ' + x + ' ' + y + ')'} />)}
        <circle className="rbd-moyeu" cx={x} cy={y} r="2.6" />
      </g>
    ))}
    <Coque forme={Rond} cx="100" cy="100" r="54" />
    <circle className="rbd-fin" cx="100" cy="100" r="47" />
    {/* Le pare-chocs : l'arc avant, épais. */}
    <path className="rbd-pare" d="M54.2 71.4 A54 54 0 0 1 145.8 71.4" />
    {/* Le capot : un rond, son anneau, et le témoin qui en fait le tour au travail. */}
    <Coque forme={Rond} cx="100" cy="84" r="14" />
    <circle className="rbd-fin" cx="100" cy="84" r="9" />
    <path className="rbd-tour" d="M100 75 A9 9 0 0 1 109 84" style={{ transformOrigin: '100px 84px' }} />
    {/* Les boutons, et la trappe du bac à l'arrière. */}
    <rect className="rbd-fin" x="88" y="117" width="24" height="10" rx="5" />
    <circle className="rbd-point" cx="100" cy="122" r="2.2" />
    <path className="rbd-fin" d="M132.8 122.9 A40 40 0 0 1 67.2 122.9" />
  </>);
}

function SceneAspirateur({ d }) {
  return (<>
    <g className="rbd-sol">
      {LATTES.map((y, k) => (
        <g key={y}>
          <line x1="0" y1={y} x2="200" y2={y} />
          {[0, 1, 2].map(m => { const x = (k % 2 ? 30 : 66) + m * 72; return <line key={m} x1={x} y1={y} x2={x} y2={y + 24} />; })}
        </g>
      ))}
    </g>
    {d.station && (
      <g className="rbd-station">
        <Coque forme={Boite} x="68" y={d.etat === 'retour' ? 160 : 136} width="64" height={d.etat === 'retour' ? 28 : 34} rx="9" />
        <circle className="rbd-temoin" cx="100" cy={d.etat === 'retour' ? 174 : 158} r="3" />
      </g>
    )}
    {d.etat === 'retour' && (
      <g className="rbd-chevrons">
        {[142, 150].map((y, i) => <path key={y} className="rbd-chevron" d={'M92 ' + y + ' l8 6 l8 -6'} style={{ animationDelay: (i * 0.25) + 's' }} />)}
      </g>
    )}
    {d.etat === 'travail' && (
      <g className="rbd-poussieres">
        {POUSSIERE.map(([x, y, r, t], i) => <circle key={i} className="rbd-poussiere" cx={x} cy={y} r={r} style={{ animationDelay: (-t) + 's' }} />)}
      </g>
    )}
    <g className="rbd-pose"><g className="rbd-corps"><Aspirateur /></g></g>
  </>);
}

/* ════════════ La tondeuse ════════════ */

// La pelouse rayée : une bande sur deux, plus soutenue ; elle défile de deux bandes par tour.
const BANDES = Array.from({ length: 12 }, (_, k) => -48 + k * 24);
// Les touffes d'herbe haute, devant : elles avancent avec la pelouse et passent sous elle.
const TOUFFES = [[80, -6, 0], [114, 8, 0.5], [130, -18, 1], [92, 26, 1.5], [68, 14, 2], [106, -30, 2.5], [124, 30, 3], [72, -26, 3.5]];
// Les brins rejetés de chaque côté de la fenêtre des lames.
const BRINS = [[-1, 0], [-1, 0.33], [-1, 0.66], [1, 0.16], [1, 0.5], [1, 0.83]];

function Tondeuse() {
  return (<>
    {/* Les deux grandes roues, sous le corps, et leurs crans qui défilent. */}
    <Coque forme={Boite} x="46" y="104" width="16" height="40" rx="6" />
    <Coque forme={Boite} x="138" y="104" width="16" height="40" rx="6" />
    {[54, 146].map(x => <line key={x} className="rbd-crans" x1={x} y1="107" x2={x} y2="141" />)}
    <Coque forme={Chemin} d="M60 90 A40 40 0 0 1 140 90 L140 130 Q140 146 124 146 L76 146 Q60 146 60 130 Z" />
    <path className="rbd-fin" d="M68 92 A32 32 0 0 1 132 92 L132 128 Q132 138 122 138 L78 138 Q68 138 68 128 Z" />
    <path className="rbd-pare" d="M62.4 76.3 A40 40 0 0 1 137.6 76.3" />
    {/* La fenêtre des lames : trois lames qui tournent au travail. */}
    <circle className="rbd-fenetre" cx="100" cy="106" r="20" />
    <g className="rbd-lames" style={{ transformOrigin: '100px 106px' }}>
      {[0, 120, 240].map(a => <rect key={a} className="rbd-lame" x="98.4" y="88" width="3.2" height="18" rx="1.6" transform={a ? 'rotate(' + a + ' 100 106)' : undefined} />)}
    </g>
    <circle className="rbd-point" cx="100" cy="106" r="3.2" />
    {/* Le témoin à l'avant, et la poignée à l'arrière. */}
    <circle className="rbd-del" cx="100" cy="66" r="3.4" />
    <rect className="rbd-fin" x="86" y="130" width="28" height="7" rx="3.5" />
  </>);
}

function SceneTondeuse({ d }) {
  return (<>
    <g className="rbd-sol rbd-pelouse">
      {BANDES.map((y, k) => (k % 2 ? <rect key={y} className="rbd-bande" x="0" y={y} width="200" height="24" /> : null))}
    </g>
    {d.station && (
      <g className="rbd-station">
        {/* Sa plaque de charge, sous elle, et la borne devant : la tondeuse y entre en avançant. */}
        {d.etat === 'base' && <rect className="rbd-plaque" x="60" y="34" width="80" height="54" rx="12" />}
        <Coque forme={Boite} x="70" y="14" width="60" height="24" rx="8" />
        <circle className="rbd-temoin" cx="100" cy="26" r="3" />
      </g>
    )}
    {d.etat === 'retour' && (
      <g className="rbd-chevrons">
        {[66, 56].map((y, i) => <path key={y} className="rbd-chevron" d={'M92 ' + y + ' l8 -6 l8 6'} style={{ animationDelay: (i * 0.25) + 's' }} />)}
      </g>
    )}
    {d.etat === 'travail' && (
      <g className="rbd-touffes">
        {TOUFFES.map(([x, y, t], i) => <path key={i} className="rbd-touffe" d={'M' + (x - 3) + ' ' + y + ' v-6 M' + x + ' ' + (y + 1) + ' v-9 M' + (x + 3) + ' ' + y + ' v-5'} style={{ animationDelay: (-t) + 's' }} />)}
      </g>
    )}
    <g className="rbd-pose"><g className="rbd-corps">
      <Tondeuse />
      {d.etat === 'travail' && BRINS.map(([s, t], i) => (
        <path key={i} className={'rbd-brin-coupe ' + (s < 0 ? 'rbd-brin-g' : 'rbd-brin-d')} d={s < 0 ? 'M60 96 l-5 -2' : 'M140 96 l5 -2'}
          style={{ animationDelay: (-t) + 's', transformOrigin: (s < 0 ? 60 : 140) + 'px 96px' }} />
      ))}
    </g></g>
  </>);
}

/** Le dessin : 176 px dans la popup, 132 au téléphone (index.css) ; `domaine`, `phase`, `charge`, `bipe` : ceux de la vue de la fiche. */
export default function DessinRobot({ domaine, phase, charge = false, bipe = false }) {
  const d = etatDessinRobot({ domaine, phase, charge, bipe });
  const disque = 'rbd' + useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <div className="rb-dessin" aria-hidden="true" data-dessin={d.famille} data-etat={d.etat} data-charge={d.charge ? '' : undefined}
      data-anime={d.anime ? '' : undefined} style={{ '--rbd-c': d.encre, '--rbd-a': d.accent }}>
      <svg viewBox="0 0 200 200" focusable="false">
        <defs><clipPath id={disque}><circle cx="100" cy="100" r="96" /></clipPath></defs>
        <circle className="rbd-disque" cx="100" cy="100" r="96" />
        <g clipPath={'url(#' + disque + ')'}>
          {d.famille === 'tondeuse' ? <SceneTondeuse d={d} /> : <SceneAspirateur d={d} />}
        </g>
        {d.bipe && (
          <g className="rbd-ondes">
            {[['M155.4 68 A64 64 0 0 1 155.4 132', 0], ['M44.6 132 A64 64 0 0 1 44.6 68', 0], ['M164.1 63 A74 74 0 0 1 164.1 137', 0.3], ['M35.9 137 A74 74 0 0 1 35.9 63', 0.3]]
              .map(([p, t]) => <path key={p} className="rbd-onde" d={p} style={{ animationDelay: t + 's' }} />)}
          </g>
        )}
        {d.etat === 'erreur' && (
          <g className="rbd-alerte">
            <circle cx="152" cy="46" r="12" />
            <path d="M152 39 v8.5 M152 52.6 v0.4" />
          </g>
        )}
      </svg>
    </div>
  );
}
