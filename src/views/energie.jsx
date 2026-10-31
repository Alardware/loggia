/* LA VUE ÉNERGIE, CHARGÉE À LA DEMANDE (25/10, ADR 0274).
 *
 * Elle vivait dans App.jsx, donc dans le boot que chaque écran télécharge et
 * analyse avant l'Accueil — près de 29 Ko minifiés pour une vue qu'on ouvre
 * d'un tap. Elle part avec ce qu'elle seule utilise (le schéma de la maison,
 * ses pastilles, ses câbles, la liste des postes). Ce qu'elle partage avec le
 * reste de l'interface (l'éditeur d'agencement, les cartes éditables, `Num`…)
 * reste dans le monolithe et lui est prêté par `OUTILS_VUES`. Le code est
 * celui d'App.jsx, déplacé sans retouche. */

import { useState, useEffect, Suspense } from 'react';
import { lazyRecharge } from '../recharge.js';
import { formatEcran } from '../disposition.js';
import { wattsDe, kwhDe, facteurKwh } from '../unites.js';
import { REDUCE_MOTION, Fi, Anim, MetricTile } from '../ui.jsx';
import { pilesMaison } from '../piles.js';
import { AnneauEnergie } from '../anneau.jsx';
import { armerReleve } from '../releve.js';
import { consoJourKwh, autosuffisance, resumeEnergie } from '../bilan.js';
import { compteurDuJour, useTotauxJour } from '../jourstat.js';
import { fmtWatts } from '../format.js';
import { LOGGIA_INDEX, enPrix, enVente, enHaids, enBatteries, enPrevisionSolaire } from '../state.js';
// Les sources qui se comptent à plusieurs, et la batterie au sens de Loggia (chantier G3, ADR 0302).
import { idsDe, sommeLue } from '../energieparts.js';
import { puissanceBatterie, niveauBatterie, reserveBatterieKwh, autonomieBatterie, consoPourAutonomie, texteAutonomie } from '../energiebatterie.js';
import { usePrevisionSolaire } from '../previsionsolaire.js';
import energyHomeImg from '../assets/energy/home.webp';
import energySolarImg from '../assets/energy/solar.webp';
import energyEvImg from '../assets/energy/ev-car-home.webp';
import energyBatImg from '../assets/energy/battery.webp';
import { tr, trN } from '../i18n.js';
import { OUTILS_VUES } from '../outilsvues.js';

// Emprunté au monolithe (outilsvues.js) : App.jsx le pose avant le premier rendu.
const {
  BandeauEdition, CardEditSheet, CarteAjout, ComposeurCartes, EditableCard, GlypheCarte, Num,
  adresseDessin, dec, enDevices, hx, sunInfo, useCoarse, useDomainCards, useLayoutEditor, useWide,
} = OUTILS_VUES;

/* Le tarif, l'historique et le calendrier de l'Energie : trente kilo-octets de
 * statistiques longue duree et de graphes, que l'Accueil n'affiche pas. Les
 * deux composants viennent du MEME module : un seul chargement pour les deux
 * (ADR 0104, 0145). */
const CarteTarif = lazyRecharge(() => import('./energiehisto.jsx').then(m => ({ default: m.CarteTarif })));

const BilansEnergie = lazyRecharge(() => import('./energiehisto.jsx').then(m => ({ default: m.BilansEnergie })));

const SectionHistorique = lazyRecharge(() => import('./energiehisto.jsx').then(m => ({ default: m.SectionHistorique })));

const EnergieCalendrier = lazyRecharge(() => import('./energiehisto.jsx').then(m => ({ default: m.EnergieCalendrier })));

const RAD = Math.PI / 180;

// Chip SVG façon Helios : icône mini + texte (soleil/panneau/maison/pylône)
const CHIP_ICONS = {
  sun: (c) => <g stroke={c} strokeWidth="1.2" fill="none"><circle cx="0" cy="0" r="2.6" fill={c} stroke="none" />{[0, 60, 120, 180, 240, 300].map(a => <line key={a} x1={4 * Math.cos(a * RAD)} y1={4 * Math.sin(a * RAD)} x2={5.8 * Math.cos(a * RAD)} y2={5.8 * Math.sin(a * RAD)} />)}</g>,
  panel: (c) => <path d="M 1.5 -5.5 L -3.5 0.5 L -0.5 0.5 L -1.5 5.5 L 3.5 -0.5 L 0.5 -0.5 Z" fill={c} />,
  house: (c) => <path d="M -5 0.5 L 0 -4.5 L 5 0.5 L 3.6 0.5 L 3.6 5 L -3.6 5 L -3.6 0.5 Z" fill={c} />,
  pylon: (c) => <g stroke={c} strokeWidth="1.3" fill="none"><path d="M -3.5 5.5 L -1 -5 L 1 -5 L 3.5 5.5" /><line x1="-4.8" y1="-2.6" x2="4.8" y2="-2.6" /><line x1="-2.6" y1="2" x2="2.6" y2="2" /></g>,
};

/* LA GEOMETRIE DE LA SCENE ENERGIE, ecrite UNE fois (08/10).
 *
 * « Sur mobile, la maison est trop petite » : elle tenait dans 180 x 135 px
 * sur un ecran de 375. Le cadre faisait 600 de large parce que l'arc du soleil
 * en occupait tout le pourtour ; la maison, elle, n'en prenait que le tiers
 * central. L'arc parti, le cadre se resserre sur ce qu'on dessine encore.
 *
 * « C'est encore un peu petit » : le cadre etait SYMETRIQUE autour du centre
 * de la maison, ce qui reservait a gauche autant de vide que la pastille du
 * reseau en demandait a droite — un dixieme du cadre perdu pour rien.
 *
 * L'invariant qui compte n'est pas la symetrie, c'est que LA SCENE TIENNE SON
 * RAPPORT. Un SVG en `meet` ne se recentre que dans un conteneur d'un autre
 * rapport que le sien ; c'est la seule chose qui faisait glisser les pastilles
 * par rapport au dessin. Le plafond de hauteur de la scene devient donc un
 * plafond de LARGEUR (index.css) : le rapport ne se rompt plus jamais, et le
 * cadre peut enfin coller au dessin, bord a bord a gauche.
 *
 * Ces nombres etaient semes entre le composant et la feuille de style, avec
 * un « 55.56% » a tenir a la main des que l'un bougeait. Ils vivent ici, et
 * la scene comme la maison s'y calent. */
const CHIP_RESEAU_X = 452;   // la pastille du réseau, posée au bout de son câble

/* C'est elle qui décide du bord DROIT du cadre, et elle est la seule à
 * dépasser du dessin : son libellé le plus long (« ↑ 12,3 kW ») lui donne 92
 * d'envergure, et son halo d'activité déborde encore de 6 — elle s'arrête donc
 * à 504. À gauche, rien ne dépasse : le cadre commence au bord de la maison. */
const SCENE = { x0: 133.33, w: CHIP_RESEAU_X + 46 + 6 - 133.33, h: 250, mx: 133.33, mw: 333.33 };

const SCENE_RATIO = (SCENE.w / SCENE.h).toFixed(4);

/* Le mot d'une pastille s'écrit à l'encre de l'îlot sombre (`o-sombre`, index.css) : son fond est sombre dans tous les thèmes. */
const Chip = ({ x, y, color, txt, icon, live = false }) => {
  const w = 22 + txt.length * 6.4 + 12;
  return (
    <g transform={`translate(${x - w / 2} ${y - 11})`}>
      {live && !REDUCE_MOTION && <rect x="-3" y="-3" width={w + 6} height="28" rx="14" fill="none" stroke={color} strokeWidth="1.4" opacity=".45"><animate attributeName="opacity" values=".45;.08;.45" dur="2.4s" repeatCount="indefinite" /><animate attributeName="x" values="-3;-6;-3" dur="2.4s" repeatCount="indefinite" /><animate attributeName="y" values="-3;-6;-3" dur="2.4s" repeatCount="indefinite" /><animate attributeName="width" values={`${w + 6};${w + 12};${w + 6}`} dur="2.4s" repeatCount="indefinite" /><animate attributeName="height" values="28;34;28" dur="2.4s" repeatCount="indefinite" /></rect>}
      <rect width={w} height="22" rx="11" fill="rgba(8,13,22,.9)" stroke={color} strokeWidth="1.6" />
      <g transform="translate(13 11)">{(CHIP_ICONS[icon] || CHIP_ICONS.sun)(color)}</g>
      <text x={(w + 22) / 2 - 1} y="15" textAnchor="middle" fontSize="11" fontWeight="800" className="o-sombre" fill="var(--o-text)" fontFamily="var(--o-font)">{txt}</text>
    </g>
  );
};

const VIEW_ART = Object.fromEntries(['solar', 'pylon', 'meter', 'piggy', 'leafart', 'pc', 'nas', 'radiator', 'dishwasher', 'camera', 'motion', 'shield', 'people', 'cpuart', 'ramart', 'diskart', 'serverart', 'routerart'].map(n => [n, adresseDessin(n)]));

/* ── Schéma maison + flux d'énergie animé (porté de Loggia V1) ── */
// Flèche directionnelle colorée (rendue dans <defs>, posée au bout du câble via markerStart/End)
const FluxArrow = ({ id, color }) => (
  <marker id={id} viewBox="0 0 12 12" refX="7" refY="6" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse" markerUnits="userSpaceOnUse" overflow="visible">
    <path d="M2.5 2.5 L9 6 L2.5 9.5" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </marker>
);

/* Câble de flux (réf vidéo) : conduit gris + câble énergisé tamisé + charge lumineuse qui circule + flèche au bout */
const FlowCable = ({ d, color, power, reverse, arrow }) => {
  if (!(power > 5)) return null;
  const dur = Math.max(0.7, 3 - Math.min(power, 5000) / 1900);
  return (
    <g>
      {/* conduit gris (statique) */}
      <path d={d} fill="none" stroke="rgba(223,230,247,.16)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* câble énergisé, tamisé (cable toujours "allumé") */}
      <path d={d} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .34, filter: `drop-shadow(0 0 4px ${color})` }} />
      {/* charge qui circule + flèche directionnelle (départ si import, arrivée sinon) */}
      <path d={d} fill="none" stroke={color} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30 90"
        markerStart={arrow && reverse ? `url(#${arrow})` : undefined}
        markerEnd={arrow && !reverse ? `url(#${arrow})` : undefined}
        style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 2px ${color})`, animation: `loggia-energy-flow ${dur}s linear infinite${reverse ? ' reverse' : ''}`, willChange: 'stroke-dashoffset' }} />
    </g>
  );
};

/**
 * Pastille du schema maison.
 *
 * Celles de l'arc solaire vivent dans un repere 600x250, celui-ci fait 960x720 :
 * a conteneur egal, une meme cote y parait ~2,6 fois plus petite. Le facteur
 * remet les deux familles a la meme taille apparente.
 */
const CHIP_K = 2.6;

const HouseChip = ({ x, y, color, txt, glyph }) => {
  const k = CHIP_K, w = (22 + txt.length * 6.4 + 12) * k;
  return (
    <g transform={`translate(${x - w / 2} ${y - 11 * k})`}>
      <rect width={w} height={22 * k} rx={11 * k} fill="rgba(8,13,22,.9)" stroke={color} strokeWidth={1.6 * k} />
      <g transform={`translate(${13 * k} ${11 * k}) scale(${k})`}>{glyph}</g>
      <text x={(w + 22 * k) / 2 - k} y={15 * k} textAnchor="middle" fontSize={11 * k} fontWeight="800" className="o-sombre" fill="var(--o-text)" fontFamily="var(--o-font)">{txt}</text>
    </g>
  );
};

// Traces en ligne comme CHIP_ICONS : la police UICons ne s'insere pas dans un <svg>.
const CHIP_BAT = (c) => (
  <g>
    <rect x="-5.5" y="-3.4" width="10" height="6.8" rx="1.8" fill="none" stroke={c} strokeWidth="1.3" />
    <path d="M 5.4 -1.4 L 7 -1.4 L 7 1.4 L 5.4 1.4" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M 0.8 -2.2 L -1.6 0.2 L 0.2 0.2 L -0.8 2.2 L 1.6 -0.2 L -0.2 -0.2 Z" fill={c} />
  </g>
);

const CHIP_CAR = (c) => (
  <g>
    <path d="M -6 1 L -6 -0.6 L -4.3 -3.2 L 4.3 -3.2 L 6 -0.6 L 6 1 Z" fill={c} />
    <circle cx="-3.4" cy="2.4" r="1.5" fill={c} />
    <circle cx="3.4" cy="2.4" r="1.5" fill={c} />
  </g>
);

function EnergyHouseSchema({ solarW = 47, homeW = 907, surplusW = 954, evW = 0, evBranche = false, batW = 0, batSoc = null, batPresente = false, solarPresente = true, format = 'pc' }) {
  const netGridW = surplusW > 0 ? -surplusW : (homeW - solarW);
  const gridImporting = netGridW > 0, gridFlowW = Math.abs(netGridW);
  // Palette calquée sur la vidéo de réf : solaire=jaune, maison=rose, réseau=violet.
  const C = { solar: 'var(--o-flux-solaire)', home: 'var(--o-flux-maison)', grid: 'var(--o-flux-reseau)', ev: 'var(--o-flux-ve)', bat: 'var(--o-flux-batterie)' };
  // Une batterie se charge ET se decharge. Le trace va de la batterie vers le
  // montant : direct = decharge, inverse = charge.
  const batCharge = batW > 0, batFlowW = Math.abs(batW || 0);
  // Pas de signe moins — le user l'a rejete sur l'import reseau, une fleche dit
  // le sens sans laisser croire a une valeur negative.
  // Arrondi AVANT l'unité (05/10) : 999,6 W donnait « 1000 W ».
  const fmtChipW = (v) => (Math.round(v) >= 1000 ? dec(v / 1000, 1) + ' kW' : Math.round(v) + ' W');
  const batTxt = (() => {
    const bouts = [];
    if (batSoc != null) bouts.push(batSoc + ' %');
    if (batW != null) bouts.push(batFlowW > 5 ? (batCharge ? '↓ ' : '↑ ') + fmtChipW(batFlowW) : '0 W');
    return bouts.length ? bouts.join(' · ') : '—';
  })();
  const layer = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' };
  /* PAS DE `width` (08/10) : donner la largeur à côté de la hauteur et du
   * rapport fait ignorer le rapport, et la maison sortait étirée à 664 × 340
   * au lieu de 453 × 340. La hauteur et le rapport suffisent.
   *
   * Et `left: 0`, non plus le centre : le cadre commence désormais au bord
   * gauche du dessin, puisque rien ne dépasse de ce côté. Tant que la scène
   * tient son rapport — c'est le rôle du plafond de largeur, dans index.css —
   * la maison déduite de sa hauteur remplit exactement la part du cadre
   * qu'elle occupe dans le repère. */
  return (
    <div className="o-en-house" style={{ position: 'absolute', top: 0, left: 0, height: '100%', aspectRatio: '960 / 720' }}>
      <img src={energyHomeImg} alt="" draggable={false} style={layer} />
      {solarPresente && <img src={energySolarImg} alt="" draggable={false} style={layer} />}
      {evBranche && <img src={energyEvImg} alt="" draggable={false} style={layer} />}
      {batPresente && <img src={energyBatImg} alt="" draggable={false} style={layer} />}
      <svg viewBox="0 0 960 720" preserveAspectRatio="xMidYMid meet" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <FluxArrow id="flux-solar" color={C.solar} />
          <FluxArrow id="flux-home" color={C.home} />
          <FluxArrow id="flux-grid" color={C.grid} />
          <FluxArrow id="flux-ev" color={C.ev} />
          <FluxArrow id="flux-bat" color={C.bat} />
        </defs>
        {solarW > 5 && <FlowCable color={C.solar} power={solarW} arrow="flux-solar" d="M 623 270 L 653 280 L 653 440" />}
        {(homeW > 2 || solarW > 5) && <FlowCable color={C.home} power={Math.max(homeW, 350)} arrow="flux-home" d="M 670 453 L 702 447 L 695 440" />}
        {gridFlowW > 5 && <FlowCable color={C.grid} power={gridFlowW} reverse={gridImporting} arrow="flux-grid" d="M 655 475 L 655 535 L 745 570 L 920 540" />}
        {evBranche && evW > 5 && <FlowCable color={C.ev} power={evW} arrow="flux-ev" d="M 648 477 L 648 532 L 643 538 L 520 560 L 510 560 L 373 508 L 373 462" />}
        {batPresente && <FlowCable color={C.bat} power={batFlowW} reverse={batCharge} arrow="flux-bat" d="M 610 464 L 641 458" />}
        {batPresente && <HouseChip x={585} y={410} color={C.bat} txt={batTxt} glyph={CHIP_BAT(C.bat)} />}
        {/* La voiture se pose sur le garage : c'est elle qui part en premier
          * quand la place manque (02/10). */}
        {evBranche && format !== 'tablette' && <HouseChip x={300} y={410} color={C.ev} txt={evW != null ? fmtChipW(evW) : '—'} glyph={CHIP_CAR(C.ev)} />}
      </svg>
    </div>
  );
}

/* LES PASTILLES POSEES SUR LA MAISON — l'arc du soleil n'est plus (08/10).
 *
 * « Retire la trajectoire du soleil aussi. » Ce composant s'appelait `SunArc`
 * et dessinait une courbe du lever au coucher, le rond du soleil a l'heure
 * reelle, et deux reperes d'horaires. Tout cela encerclait la maison et lui
 * prenait les deux tiers du cadre.
 *
 * Ce qui reste a de la valeur : les quatre pastilles qui disent, POSEES SUR LE
 * DESSIN, ce que chaque partie fait a l'instant. Elles gardent leurs places.
 *
 * Deux conditions, deux questions differentes : `solarPresente` dit s'il Y A
 * du solaire chez l'utilisateur, `format` dit quel ECRAN regarde. Les pastilles
 * ne retrecissent pas — a six sur un telephone elles se marchent dessus :
 * « pc mets-les toutes, tablette enleve garage, et mobile enleve panneau ». */
function PastillesEnergie({ solarW = 0, gridW = 0, exportW = 0, homeW = 0, appW = null, solarPresente = true, format = 'pc' }) {
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(iv); }, []);
  /* SANS POSITION DECLAREE, LES PASTILLES RESTENT (08/10). Le composant
   * rendait `null` des que Home Assistant n'avait pas de latitude : sans arc a
   * dessiner, ce renvoi emportait aussi la consommation de la maison et le
   * sens du reseau, qui n'ont rien a voir avec le soleil. Seule l'irradiance
   * depend du jour. */
  const s = sunInfo();
  const day = !!(s && s.day);
  const irr = day ? Math.max(0, Math.round(1090 * Math.pow(Math.max(0, Math.sin(s.elevation * RAD)), 1.15))) : 0; // irradiance ciel clair estimée
  // Arrondi AVANT l'unité (05/10) : 994,6 W s'écrivait « 995 W », et 995 « 1,0 kW ».
  const fmtKW = (w) => Math.abs(Math.round(w)) >= 995 ? dec(w / 1000, 1) + ' kW' : Math.round(w) + ' W';
  return (
    <svg viewBox={`${SCENE.x0} 0 ${SCENE.w} ${SCENE.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
      {/* L'IRRADIANCE A UNE PLACE FIXE. Elle suivait le soleil le long de
        * l'arc, avec tout un calcul pour eviter les trois pastilles fixes
        * (02/10, « le capteur du soleil se superpose »). Sans arc il n'y a
        * plus rien a suivre : elle se pose au-dessus du toit, a gauche du
        * badge de production, et ne peut plus rencontrer personne. */}
      {day && <Chip icon="sun" x={250} y={48} color="var(--o-gold)" txt={irr + ' W/m²'} />}
      {solarPresente && format !== 'mobile' && <Chip icon="panel" x={352} y={78} color="var(--o-flux-panneau)" txt={fmtKW(solarW)} live={solarW > 5} />}
      {/* La maison et le pylône ne disent que ce qui se lit (audit du 03/10).
        * Sans compteur, l'appel passe `null` et la pastille s'efface — comme
        * celle des panneaux sans capteur de production. Elles affichaient
        * « 0 W » et « ↓ 0 W » juste au-dessus des chiffres qui, eux, disaient
        * « — » (ADR 0030). */}
      {homeW != null && <Chip icon="house" x={352} y={200} color="var(--o-cyan)" txt={fmtKW(homeW)} />}
      {/* AU BOUT DU CABLE (08/10). Elle etait posee a 478, vingt-six unites
        * apres l'endroit ou le cable du reseau s'arrete (452) : du temps de
        * l'arc, ce vide a droite etait occupe par la courbe. Elle elargissait
        * le cadre d'autant, et donc retrecissait la maison. */}
      {gridW != null && <Chip icon="pylon" x={CHIP_RESEAU_X} y={168} color="var(--o-purple)" txt={(exportW > 5 ? '↑ ' : '↓ ') + fmtKW(exportW > 5 ? exportW : gridW)} live={(exportW > 5 ? exportW : gridW) > 5} />}
    </svg>
  );
}

const EN_LAYOUT_KEY = 'loggia_enlayout';

function EnergieContent({ hass, edit = false, onEnt }) {
  /* Le format decide du nombre de pastilles sur la maison : toutes sur
   * l'ordinateur, sans la voiture sur tablette, sans le panneau au telephone.
   * Meme calcul que partout ailleurs — la souris fait l'ordinateur, le doigt
   * la tablette au-dela de 1180 px. */
  const formatEn = formatEcran(useCoarse(), useWide(1180));
  const S = (hass && hass.states) || null;
  const num = (id, def = 0) => { const e = S && S[id]; if (!e || e.state == null || e.state === 'unknown' || e.state === 'unavailable') return def; const n = parseFloat(e.state); return isNaN(n) ? def : n; };
  const avail = (id) => { const e = S && S[id]; return !!(e && e.state != null && e.state !== 'unknown' && e.state !== 'unavailable' && !isNaN(parseFloat(e.state))); };
  /* Une puissance se lit en WATTS, une énergie en kWh, quelle que soit l'unité
   * du capteur (audit du 03/10). Un compteur P1/DSMR publie 2,75 kW : `num` le
   * rendait tel quel, le schéma disait « 3 W », les seuils « > 5 W » ne se
   * franchissaient jamais et le solaire ne paraissait jamais actif. `num` reste
   * pour ce qui n'a pas d'unité à ramener : les taux (%) et la devise. */
  const numW = (id, def = 0) => { const w = avail(id) ? wattsDe(S[id]) : null; return w == null ? def : w; };
  const numKwh = (id, def = 0) => { const k = avail(id) ? kwhDe(S[id]) : null; return k == null ? def : k; };
  // Package énergie v3 prioritaire, repli sur les capteurs bruts si absent
  const EN = enHaids();
  // Vehicule electrique : sa puissance de charge suffit a tout piloter — le
  // calque du garage, le flux le long du cable, et la valeur affichee.
  // Ce qui decide de l'affichage, c'est que le ROLE soit renseigne — pas que sa
  // valeur soit lisible a l'instant. Une borne de recharge repasse a
  // `unavailable` des qu'on debranche : lier les deux faisait disparaitre le
  // calque, le cable et la pastille d'un bloc, par intermittence.
  const evBranche = !!EN.evNow;
  const evW = avail(EN.evNow) ? Math.max(0, Math.round(numW(EN.evNow))) : null;
  /* LA BATTERIE, DANS LES DEUX SENS (07/10). `batNow` suppose un capteur
   * SIGNE — positif en charge, negatif en decharge —, et beaucoup d'onduleurs
   * en publient un. Mais le tableau de bord Energie nomme souvent les deux
   * sens separement (`power_config`), et deux capteurs toujours positifs ne
   * disent rien a eux seuls : la puissance de la batterie est leur DIFFERENCE.
   * Le capteur signe reste prioritaire quand il existe. */
  /* TOUTES LES BATTERIES, ET LE SENS DE HOME ASSISTANT (chantier G3, ADR 0302).
   * Son `stat_rate` est positif en DÉCHARGE : `puissanceBatterie` l'inverse,
   * additionne les batteries, et garde l'ordre d'avant — le capteur signé de
   * la fiche, sinon les deux sens. Le niveau se pondère par la capacité quand
   * Home Assistant la déclare. */
  const lireW = (id) => (avail(id) ? numW(id, null) : null);
  const lireN = (id) => (avail(id) ? num(id, null) : null);
  const batPresente = !!(idsDe(EN, 'batNow').length || idsDe(EN, 'batRate').length || idsDe(EN, 'batSoc').length || EN.batChargeNow || EN.batDechargeNow);
  const batBrut = puissanceBatterie(EN, lireW);
  const batW = batBrut == null ? null : Math.round(batBrut);
  const batteries = enBatteries();
  const socBrut = niveauBatterie({ EN, batteries, lire: lireN });
  const batSoc = socBrut == null ? null : Math.round(socBrut);

  // Postes de consommation : la liste proposee, puis l'agencement.
  const postes = enDevices((hass && hass.states) || null);
  const derived = postes.map(d => 'dev:' + d.power).filter(k => k !== 'dev:undefined');
  const ed = useLayoutEditor(EN_LAYOUT_KEY, 'energie', derived);
  const [enAdd, setEnAdd] = useState(false);
  const [cardEdit, setCardEdit] = useState(null);
  // Les piles et batteries de la maison (19/09) : leurs cartes a cinq barres,
  // apres les postes — la plus basse d'abord (piles.js).
  const dc = useDomainCards(hass);
  const piles = pilesMaison(S, (id) => (LOGGIA_INDEX && LOGGIA_INDEX.entityMeta && LOGGIA_INDEX.entityMeta.get(id)) || {});
  // Un poste ajoute a la main n'a qu'une entite : on lui donne l'habillage par
  // defaut, l'important etant sa puissance.
  const posteDe = (k) => {
    const id = k.indexOf('dev:') === 0 ? k.slice(4) : k;
    const connu = postes.find(d => d.power === id);
    const st = (hass && hass.states && hass.states[id]) || null;
    const base = connu || {
      name: (st && st.attributes && st.attributes.friendly_name) || id,
      power: id, kwh: null, art: null, icon: 'bolt', c: 'var(--o-accent-soft)',
    };
    return { ...base, name: ed.labelOf(k) || base.name };
  };
  const posteOrigine = (k) => {
    const id = k.indexOf('dev:') === 0 ? k.slice(4) : k;
    const connu = postes.find(d => d.power === id);
    if (connu) return connu.name;
    const st = (hass && hass.states && hass.states[id]) || null;
    return (st && st.attributes && st.attributes.friendly_name) || id;
  };
  /* Deux onduleurs : leurs DEUX puissances (ADR 0302). Le flux net du réseau
   * aussi se somme, au cas — rare — de deux compteurs distincts. */
  const solarSomme = sommeLue(idsDe(EN, 'solarNow'), lireW);
  const netSomme = sommeLue(idsDe(EN, 'consoNow'), lireW);
  const solarAvail = solarSomme != null || avail(EN.solarOutput);
  const consoAvail = avail(EN.gridNow) || netSomme != null;
  const surplusAvail = avail(EN.injectionNow) || avail(EN.surplusNow);
  // consoNow = flux NET du compteur (négatif = export) — source unique du temps réel
  // réseau (cf. CONTEXTE de packages/energie.yaml). On dérive import/export du net BRUT en priorité :
  // aucune dépendance à la fraîcheur des templates du package.
  const solarW = Math.round(solarSomme != null ? solarSomme : numW(EN.solarOutput));
  const netRaw = netSomme != null ? Math.round(netSomme) : null;
  const gridDrawW = netRaw != null ? Math.max(0, netRaw) : Math.round(avail(EN.gridNow) ? numW(EN.gridNow) : 0);
  const surplusW = netRaw != null ? Math.max(0, -netRaw) : Math.round(avail(EN.injectionNow) ? numW(EN.injectionNow) : Math.max(0, numW(EN.surplusNow)));
  const consoW = avail(EN.consoMaison) ? Math.round(numW(EN.consoMaison)) : Math.max(0, gridDrawW + solarW - surplusW);
  const exporting = surplusW > 5;
  const importW = Math.max(0, gridDrawW);
  const gridNetW = exporting ? surplusW : importW;
  /* Le TOUR de relecture : toutes les cinq minutes, l'historique et les
   * statistiques se relisent. Rien quand la page est cachee, le tour manque au
   * retour (releve.js) ; quitter la vue coupe le minuteur. Sans lui, sur une
   * tablette ouverte au mur, « les douze derniers mois » s'arretaient au jour
   * de l'arrivee sur la page. */
  const [tourEn, setTourEn] = useState(0);
  useEffect(() => armerReleve(() => setTourEn(x => x + 1), 5 * 60000), []);
  /* LA PRODUCTION PRÉVUE (chantier G3, E7) : Forecast.Solar ou Solcast,
   * rattachés aux onduleurs dans le tableau Énergie. Home Assistant la tient
   * (`energy/solar_forecast`) ; relue au même tour que l'historique. */
  const prevision = usePrevisionSolaire(hass, enPrevisionSolaire(), tourEn);

  /* LE TOTAL DU JOUR, SUR N'IMPORTE QUEL COMPTEUR (audit du 07/10).
   *
   * Le tableau de bord Energie de Home Assistant ne designe pas des compteurs
   * journaliers : il designe l'INDEX du compteur, qui ne fait que monter. Lu
   * tel quel, il annoncait « 12 450 kWh aujourd'hui » chez quiconque n'avait
   * jamais rempli la fiche Entites a la main — c'est-a-dire chez presque tout
   * le monde sauf l'installation qui a servi a ecrire la vue.
   *
   * Un compteur qui s'est remis a zero cette nuit le DIT (`last_reset`) : son
   * etat est alors le total du jour, et rien n'est demande. Les autres sont des
   * index, et leur journee se lit dans les statistiques — une seule requete
   * pour tous (`jourstat.js`). Quand ni l'un ni l'autre ne repond, on ne rend
   * rien : un tiret vaut mieux qu'un index pris pour une journee.
   */
  const CPT_JOUR = [EN.consoJour, EN.consoJourHc, EN.consoJourHp, EN.consoReseauToday,
    EN.consoHcToday, EN.consoHpToday, ...idsDe(EN, 'prodJour'), EN.injectionJour, EN.coutJour, EN.revenuJour];
  const cumulatifs = CPT_JOUR.filter(id => id && S && S[id] && !compteurDuJour(S[id]));
  const totauxJour = useTotauxJour(hass, cumulatifs, tourEn);
  /* `kwh` ramene en kilowattheures ce qui est une energie ; une somme d'argent
   * garde son unite. L'etat brut passe par `numKwh`, qui convertit deja. */
  const valJour = (id, kwh) => {
    if (!id || !S || !S[id]) return null;
    if (compteurDuJour(S[id])) return avail(id) ? (kwh ? numKwh(id, null) : num(id, null)) : null;
    const v = totauxJour[id];
    if (v == null || !isFinite(v)) return null;
    const u = (S[id].attributes && S[id].attributes.unit_of_measurement) || '';
    return kwh ? v * facteurKwh(u) : v;
  };
  const kwhJour = (id) => valJour(id, true);
  const euroJour = (id) => valJour(id, false);

  // Bilans / coûts du package
  /* La production du jour de TOUS les onduleurs (`prodJourParts`, calculé
   * depuis le 07/10 et jamais lu) : un compteur muet ne compte pas, aucun
   * lisible et il n'y a pas de chiffre. */
  const prodJour = sommeLue(idsDe(EN, 'prodJour'), kwhJour);
  const autosuff = avail(EN.autosuffJour) ? Math.round(num(EN.autosuffJour)) : null;
  const tauxAutoconso = avail(EN.tauxAutoconso) ? Math.round(num(EN.tauxAutoconso)) : null;
  /* Le COUT du jour (05/10). `resolveEnergy` le resolvait depuis le tableau
   * de bord Energie de Home Assistant (`stat_cost`) et personne ne le lisait :
   * on allait le chercher, on le rangeait dans l'index, et il mourait la.
   *
   * Home Assistant le CALCULE lui-meme, avec les heures creuses et les tarifs
   * multiples : on reprend son chiffre, on n'en refait pas un a partir d'un
   * prix du kWh. Sans tarif declare, `stat_cost` n'existe pas et rien ne
   * s'affiche — ni zero, ni tiret. */
  const coutJour = euroJour(EN.coutJour);
  /* Ce que l'injection RAPPORTE, quand Home Assistant le tient
   * (`stat_compensation`). Meme lecture que le cout : un cumul, pas une
   * journee — `euroJour` s'en charge. */
  const revenuJour = euroJour(EN.revenuJour);
  // La devise suit l'entite, puis l'installation — jamais suppose en euros.
  const uniteDe = (id) => (id && S[id] && S[id].attributes && S[id].attributes.unit_of_measurement) || null;
  const deviseJour = uniteDe(EN.coutJour) || uniteDe(EN.ecoJour)
    || (hass && hass.config && hass.config.currency) || '€';
  /* Le total du jour n'existe que si un compteur se lit (audit du 03/10).
   * `num()` rend 0 pour une entité muette : heures creuses + heures pleines
   * valaient 0 kWh avec un Linky indisponible, `totalToday` n'était jamais
   * nul, et le garde-fou de l'autosuffisance ne jouait pas. `numKwh(id, null)`
   * dit « illisible » ; `consoJourKwh` (bilan.js) choisit le compteur et rend
   * null quand aucun ne répond. */
  const hcToday = EN.consoJourHc ? kwhJour(EN.consoJourHc) : kwhJour(EN.consoHcToday);
  const hpToday = EN.consoJourHp ? kwhJour(EN.consoJourHp) : kwhJour(EN.consoHpToday);
  /* Configuré mais muet n'est pas « non configuré » (relecture du 03/10). */
  const hcMuet = !!(EN.consoJourHc || EN.consoHcToday) && hcToday == null;
  const hpMuet = !!(EN.consoJourHp || EN.consoHpToday) && hpToday == null;
  const totalToday = consoJourKwh({ jour: kwhJour(EN.consoJour), hc: hcToday, hp: hpToday, reseau: kwhJour(EN.consoReseauToday), hcMuet, hpMuet });

  const [onglEn, setOnglEn] = useState('vue');       // vue | piles
  const [pilesFiltre, setPilesFiltre] = useState('toutes');
  /* A surveiller : une pile faible, ou une qui ne repond plus. Le seuil est
   * celui des cartes (piles.js) : rien de neuf a regler. Le badge de l'onglet
   * et le filtre comptent la MEME chose — deux comptes differents sur le meme
   * ecran mentiraient. */
  const pilesSurveiller = piles.filter(p => p.niveau == null || p.niveau <= 35).length;
  const pilesVues = pilesFiltre === 'surveiller' ? piles.filter(p => p.niveau == null || p.niveau <= 35) : piles;

  /* Autosuffisance : la part de la consommation couverte par le solaire. Le
   * capteur du package si l'installation en publie un, sinon les kWh du jour —
   * ce que produit la maison MOINS ce qu'elle renvoie au reseau, rapporte a
   * tout ce qu'elle a consomme. */
  const injJour = kwhJour(EN.injectionJour);
  const injectionMuette = !!EN.injectionJour && injJour == null;
  /* Sans production OU sans consommation lisible, pas de taux (audit du
   * 03/10) : `autosuffisance` (bilan.js) rend null — jamais « 100 % » sur un
   * compteur muet. */
  const autoPct = autosuff != null ? autosuff : (tauxAutoconso != null ? tauxAutoconso : autosuffisance(prodJour, totalToday, injJour, injectionMuette));

  /* Part bas-carbone : Electricity Maps (ou CO2 Signal) publie le pourcentage
   * d'energies FOSSILES du reseau. Le solaire de la maison est bas-carbone par
   * construction ; on pondere donc les deux sources par leurs kWh du jour.
   * Sans cette integration, pas de tuile — on ne devine pas un mix. */
  const fossilePct = (() => {
    if (!S) return null;
    const id = Object.keys(S).find(k => k.indexOf('sensor.') === 0 && /fossil/i.test(k)
      && S[k].attributes && S[k].attributes.unit_of_measurement === '%');
    if (!id) return null;
    const v = parseFloat(S[id].state);
    return isNaN(v) ? null : v;
  })();
  const basCarbonePct = (() => {
    if (fossilePct == null || totalToday == null || injectionMuette) return null;
    const solaireConsomme = prodJour != null ? Math.max(0, prodJour - (injJour || 0)) : 0;
    const conso = totalToday + solaireConsomme;
    if (conso <= 0) return null;
    return Math.round((totalToday * (100 - fossilePct) / 100 + solaireConsomme) / conso * 100);
  })();
  const solarActive = solarW > 5;
  const fmtW = fmtWatts;
  /* L'en-tete ne dit que ce qui se lit (audit du 03/10). Il etait bati sur
   * `consoW`, `solarW` et `gridNetW`, que `num()` met a 0 quand l'entite se
   * tait : « Consommation 0 W » au-dessus de chiffres qui, eux, disaient
   * « — ». Il suit les MEMES conditions que ces chiffres, et sans rien de
   * lisible il n'y a ni ligne ni pastille : ce que rien ne mesure ne s'affirme
   * pas (ADR 0030). */
  const consoLue = consoAvail || avail(EN.consoMaison);
  const reseauLu = surplusAvail || consoAvail;
  /* Les deux SENS du reseau ne se lisent pas aux memes capteurs (relecture du
   * 03/10). Un capteur de surplus seul mesure l'export, pas l'achat : la nuit,
   * sans surplus, l'en-tete ecrivait « reseau 0 W » alors que rien n'avait
   * mesure l'achat. */
  const sensLu = exporting ? reseauLu : consoAvail;
  const ligneEnTete = resumeEnergie({
    conso: consoLue ? consoW : null,
    solaire: solarAvail ? solarW : null,
    reseau: sensLu ? gridNetW : null,
  });

  /* ── L'APERÇU, sur le modèle de la maquette ───────────────────────────────
   *
   * Un disque qui se remplit comme un verre, cerclé des parts de chaque source,
   * et à sa droite les chiffres du jour. L'onglet « Maison » bascule sur le
   * SCHÉMA DE LOGGIA — ses flux à lui, pas les maisons dessinées de la
   * maquette : « pour la maison par contre garde les flux d'energie actuel ».
   */
  const [faceApercu, setFaceApercu] = useState('apercu');            // apercu | maison

  /* Le MIX du moment : d'où vient ce que la maison consomme à l'instant.
   * Le solaire ne compte que pour ce qui est consommé sur place — ce qui part
   * au réseau n'alimente rien ici. */
  const solaireUtile = Math.max(0, Math.min(solarW, consoW + Math.max(0, evW || 0)));
  const batterieSortie = batW != null ? Math.max(0, -batW) : 0;
  const totalMix = solaireUtile + batterieSortie + importW;
  const mix = totalMix > 0 ? [
    { label: tr('Solaire'), couleur: 'var(--o-gold)', pct: Math.round(solaireUtile / totalMix * 100) },
    batPresente && { label: tr('Batterie'), couleur: 'var(--o-purple)', pct: Math.round(batterieSortie / totalMix * 100) },
    { label: tr('Réseau'), couleur: 'var(--o-accent)', pct: Math.round(importW / totalMix * 100) },
  ].filter(Boolean) : [];
  // La part qui ne vient PAS du réseau : c'est le niveau du liquide.
  const partPropre = totalMix > 0 ? Math.round((solaireUtile + batterieSortie) / totalMix * 100) : 0;
  const couleurAnneau = importW === 0 && totalMix > 0 ? 'var(--o-ok)' : solarActive ? 'var(--o-gold)' : 'var(--o-accent)';

  /* L'AUTONOMIE DE LA BATTERIE (chantier G3, E6) : « ≈ 3 h de réserve » = ce
   * qu'elle tient (niveau × capacité) ÷ ce que la maison consomme, batterie
   * comprise (`consoPourAutonomie`, relecture du 30/10). Seulement
   * quand Home Assistant déclare la capacité de TOUTES les batteries : on ne
   * devine pas une capacité. */
  const autonomie = batPresente && consoLue
    ? texteAutonomie(autonomieBatterie({ reserveKwh: reserveBatterieKwh({ batteries, lire: lireN }), consoW: consoPourAutonomie({ consoW, batW, mesuree: avail(EN.consoMaison) }) })) : null;

  /* Les SOURCES en direct, sous le disque. Une source absente de l'installation
   * n'a pas de jeton : on ne montre pas une batterie à qui n'en a pas. */
  const jetons = [
    solarAvail && { icone: 'sun', couleur: 'var(--o-gold)', v: fmtW(solarW), label: tr('Solaire') },
    batPresente && { icone: 'battery-full', couleur: 'var(--o-purple)', v: batW != null ? fmtW(Math.abs(batW)) : (batSoc != null ? batSoc + ' %' : '—'), label: (batW > 0 ? tr('Charge') : batW < 0 ? tr('Décharge') : tr('En veille')) + (batSoc != null ? ' · ' + batSoc + ' %' : ''), sous: autonomie },
    reseauLu && { icone: 'bolt', couleur: exporting ? 'var(--o-ok)' : 'var(--o-accent-soft)', v: fmtW(gridNetW), label: exporting ? tr('Vente réseau') : tr('Achat réseau') },
    evBranche && { icone: 'car-side', couleur: 'var(--o-ok)', v: evW != null ? fmtW(evW) : '—', label: tr('Véhicule') },
  ].filter(Boolean);

  /* La phrase du haut de carte : ce qui alimente la maison en ce moment. */
  const titreApercu = solarActive ? tr('Production solaire active')
    : (batW != null && batW < 0) ? tr('La batterie prend le relais')
      : tr('Alimentée par le réseau');

  /* Les quatre chiffres de la colonne droite. Chacun n'apparaît que s'il se
   * lit — une maison sans panneaux n'a pas de « Production du jour » à zéro. */
  /* LE TELEPHONE REORGANISE, il ne retrecit pas (maquette mobile du 07/10).
   * Sur la LARGEUR et non sur le type d'appareil : les regles CSS de la vue
   * basculent au meme endroit, et un navigateur de bureau retreci doit lire la
   * meme page qu'un telephone. */
  const etroit = !useWide(760);

  const statsJour = [
    prodJour != null && { l: tr('Production du jour'), v: dec(prodJour, 1), u: 'kWh' },
    autoPct != null && { l: tr('Autosuffisance'), v: String(autoPct), u: '%' },
    totalToday != null && { l: tr('Réseau importé'), v: dec(totalToday, 1), u: 'kWh' },
    injJour != null && { l: tr('Réseau exporté'), v: dec(injJour, 1), u: 'kWh' },
    // La production PRÉVUE (E7), après ce qui s'est passé : aujourd'hui, puis demain.
    prevision.aujourdhui != null && { l: tr('Prévu aujourd’hui'), v: dec(prevision.aujourdhui, 1), u: 'kWh' },
    prevision.demain != null && { l: tr('Prévu demain'), v: dec(prevision.demain, 1), u: 'kWh' },
  ].filter(Boolean);

  /* Les tuiles de mesure, sous l'historique. Le gaz et l'eau viennent du
   * tableau de bord Énergie quand la maison en déclare — sinon ils n'existent
   * pas, et on ne les invente pas. */
  const mesures = [
    autoPct != null && { caption: tr('Autosuffisance'), value: String(autoPct), unit: '%', icon: 'leaf', tone: 'var(--o-ok)', pct: autoPct },
    basCarbonePct != null && { caption: tr('Électricité bas-carbone'), value: String(basCarbonePct), unit: '%', icon: 'bolt', tone: 'var(--o-cyan)', pct: basCarbonePct },
    avail(EN.gasJour) && { caption: tr('Gaz'), value: dec(numKwh(EN.gasJour), 1), unit: uniteDe(EN.gasJour) || 'kWh', icon: 'flame', tone: 'var(--o-orange)', pct: null },
    avail(EN.waterJour) && { caption: tr('Eau'), value: dec(num(EN.waterJour), 0), unit: uniteDe(EN.waterJour) || 'L', icon: 'raindrops', tone: 'var(--o-cold)', pct: null },
  ].filter(Boolean);

  /* La CONSOMMATION DU JOUR et ses quatre chiffres : a droite de l'anneau sur
   * un grand ecran, dans leur propre carte au telephone. Meme contenu, deux
   * places — c'est ce que fait la maquette. */
  const colonneDuJour = (
    <>
      <div style={etroit ? { display: 'flex', alignItems: 'flex-end', gap: 10 } : undefined}>
        <div style={etroit ? { flex: 1, minWidth: 0 } : undefined}>
          <div style={{ fontSize: etroit ? 12.5 : 13, fontWeight: etroit ? 700 : 600, color: 'var(--o-text2)' }}>{tr('Consommation du jour')}</div>
          <div style={{ marginTop: 6, fontSize: etroit ? 28 : 34, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {totalToday != null ? <Num v={totalToday} d={1} /> : '—'}<span style={{ fontSize: etroit ? 12 : 14, fontWeight: 700, color: 'var(--o-text2)', marginLeft: etroit ? 4 : 5 }}>kWh</span>
          </div>
        </div>
        {coutJour != null && (etroit
          ? <div style={{ textAlign: 'right', lineHeight: 1.3 }}>
            <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}><Num v={coutJour} d={2} suffix={' ' + deviseJour} /></div>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>{tr('Coût du jour')}</div>
          </div>
          : <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)' }}><Fi i="euro" size={15} /></span>
            <span style={{ minWidth: 0, lineHeight: 1.3 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}><Num v={coutJour} d={2} suffix={' ' + deviseJour} /></span>
              <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('Coût du jour')}</span>
            </span>
          </div>)}
      </div>
      {!etroit && statsJour.length > 0 && <div style={{ height: 1, width: 110, background: 'var(--o-bd2)' }} />}
      {/* Au telephone les quatre chiffres sont ENCADRES : sans cadre, ils se
        * confondent avec le grand nombre juste au-dessus. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: etroit ? 8 : '18px 20px', marginTop: etroit ? 14 : 0 }}>
        {statsJour.map(s => (
          <div key={s.l} style={etroit
            ? { minWidth: 0, padding: '10px 12px', background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: 14 }
            : { minWidth: 0 }}>
            <div style={{ fontSize: etroit ? 11 : 12.5, fontWeight: 600, color: 'var(--o-text2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.l}</div>
            <div style={{ marginTop: etroit ? 4 : 5, fontSize: etroit ? 18 : 22, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{s.v}<span style={{ fontSize: etroit ? 11 : 12, fontWeight: 700, color: 'var(--o-text2)', marginLeft: etroit ? 3 : 4 }}>{s.u}</span></div>
          </div>
        ))}
      </div>
    </>
  );

  /* La pastille du reseau : a droite du titre au telephone, au bout de la barre
   * d'onglets au large. Deux places, un seul dessin. */
  const pastilleReseau = reseauLu ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '5px 11px', borderRadius: 999, fontSize: etroit ? 10.5 : 11, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', background: exporting ? 'rgba(var(--o-ok-rgb),.13)' : 'rgba(var(--o-accent-rgb),.13)', color: exporting ? 'var(--o-ok)' : 'var(--o-accent-soft)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{(exporting ? tr('Surplus') : tr('Import')) + ' ' + fmtW(gridNetW)}
    </span>
  ) : null;

  // Le total des postes suivis, en en-tête de leur grille.
  const totalPostes = ed.ids.reduce((a, k) => a + (avail(posteDe(k).power) ? Math.round(numW(posteDe(k).power)) : 0), 0);

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {edit && <BandeauEdition ed={ed} onAjouter={() => setEnAdd(true)} ajouterLabel={tr('Ajouter un poste')} onEnt={onEnt} entLabel={tr('Entités du schéma')} />}

      <div className="o-en-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: etroit ? '1 1 100%' : '1 1 320px', minWidth: 0, display: etroit ? 'flex' : 'block', alignItems: 'flex-end', gap: 10 }}>
          <h1 className="o-en-titre" style={{ flex: etroit ? 1 : undefined, minWidth: 0, margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500, lineHeight: 1.1 }}>{tr('L’énergie')}</h1>
          {!etroit && ligneEnTete && <div style={{ fontSize: 13.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 6, textWrap: 'pretty' }}>{ligneEnTete}</div>}
          {etroit && pastilleReseau}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {/* Les piles ont leur onglet (06/10) : elles étaient en bas d'une page
            * qui s'allonge, et personne ne descend jusque-là pour voir qu'une
            * télécommande est à plat. Le badge dit combien sont à surveiller. */}
          {piles.length > 0 && (
            <div className="o-en-onglets" style={{ display: 'inline-flex', gap: 4, padding: 3, borderRadius: 12, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd2)', flexShrink: 0 }}>
              {[['vue', tr('Vue d’ensemble'), 0], ['piles', tr('Piles et batteries'), pilesSurveiller]].map(([id, lb, badge]) => (
                <button key={id} onClick={() => setOnglEn(id)} aria-pressed={onglEn === id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 13px', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', background: onglEn === id ? 'var(--o-accent-fond)' : 'transparent', color: onglEn === id ? '#fff' : 'var(--o-text2)' }}>
                  {lb}
                  {badge > 0 && <span style={{ minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, background: onglEn === id ? 'rgba(255,255,255,.22)' : 'rgba(var(--o-bad-rgb),.16)', color: onglEn === id ? '#fff' : 'var(--o-bad)' }}>{badge}</span>}
                </button>
              ))}
            </div>
          )}
          {!etroit && pastilleReseau}
        </div>
      </div>

      {onglEn === 'vue' && (<>
      {/* Pas d'`Anim` sur les GRANDES sections : elle enveloppe son enfant
        * dans un div, qui devient le vrai enfant flex — une carte posee la se
        * reduit a son contenu au lieu de prendre la largeur (07/10). Les cartes
        * de postes et de piles, elles, la gardent : la, c'est le geste commun. */}
      {/* L'APERÇU et LE TARIF, côte à côte. */}
      <div className="grid-ehero" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'stretch' }}>
        <div style={{ flex: '2 1 620px', minWidth: 0, display: 'flex' }}><section style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', borderRadius: 'var(--o-radius,18px)', border: 'var(--o-bw,1px) solid var(--o-bd2)', boxShadow: 'var(--o-shadow)', padding: '22px 24px 24px' }}>
          <div className="o-en-cartehead" style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
            <div className="o-en-cartetitre" style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--o-text2)' }}>{tr('Aperçu')}</div>
              <div style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 500, marginTop: 2 }}>{titreApercu}</div>
            </div>
            <div className="o-en-onglets" style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd2)', flexShrink: 0 }}>
              {[['apercu', tr('Synthèse'), 'chart-pie-alt'], ['maison', tr('Maison'), 'home']].map(([id, lb, ic]) => (
                <button key={id} onClick={() => setFaceApercu(id)} aria-pressed={faceApercu === id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 13px', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', background: faceApercu === id ? 'var(--o-accent-fond)' : 'transparent', color: faceApercu === id ? '#fff' : 'var(--o-text2)' }}>
                  <Fi i={ic} size={12} />{lb}
                </button>
              ))}
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: solarActive ? 'rgba(var(--o-gold-rgb),.13)' : 'var(--o-s2)', color: solarActive ? 'var(--o-gold)' : 'var(--o-text3)' }}><Fi i="sun" size={11} />{solarActive ? tr('Solaire actif') : tr('Solaire inactif')}</span>
          </div>

          {/* Les deux faces de l'aperçu occupent la MÊME place : la synthèse
            * reste en flux (elle donne sa hauteur), le schéma se pose dessus.
            * Bascule sans que la carte change de taille. */}
          <div style={{ position: 'relative', marginTop: 20 }}>
            <div style={{ display: (etroit && faceApercu === 'maison') ? 'none' : 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 28, visibility: faceApercu === 'maison' ? 'hidden' : 'visible' }}>
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, padding: '14px 0 4px' }}>
                <AnneauEnergie classe="o-en-anneau" pct={partPropre} couleur={couleurAnneau} mix={mix} taille={216}>
                  <span style={{ position: 'relative', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--o-text)', textShadow: '0 1px 3px rgba(0,0,0,.35)' }}>{tr('Consommation')}</span>
                  <div style={{ position: 'relative', textShadow: '0 1px 4px rgba(0,0,0,.3)', fontSize: 42, fontWeight: 800, letterSpacing: '-.01em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {consoLue ? <Num v={consoW} fmt={fmtW} /> : '—'}
                  </div>
                  <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 800, color: 'var(--o-text)', textShadow: '0 1px 3px rgba(0,0,0,.35)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-ok)' }} />{tr('En direct')}</span>
                </AnneauEnergie>
                {jetons.length > 0 && (
                  <div className="o-en-jetons" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {jetons.map(j => (
                      <div key={j.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 6px', borderRadius: 12, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
                        <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hx(j.couleur, 0.15), color: j.couleur }}><Fi i={j.icone} size={13} /></span>
                        <span style={{ lineHeight: 1.2 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{j.v}</span>
                          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 600, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{j.label}</span>
                          {j.sous && <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--o-purple)', whiteSpace: 'nowrap' }}>{j.sous}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!etroit && (
                <div className="o-en-col" style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20, paddingLeft: 28, borderLeft: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
                  {colonneDuJour}
                </div>
              )}
            </div>
            {/* LE SCHÉMA DE LA MAISON : celui de Loggia, ses flux à lui. */}
            {faceApercu === 'maison' && (
              <div className="o-en-well" style={etroit
                ? { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, overflow: 'hidden', background: 'radial-gradient(120% 90% at 50% 30%,var(--o-well0),var(--o-well2))', border: 'var(--o-bw,1px) solid var(--o-bd3)', padding: 10 }
                : { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 14, overflow: 'hidden', background: 'radial-gradient(120% 90% at 50% 30%,var(--o-well0),var(--o-well2))', border: 'var(--o-bw,1px) solid var(--o-bd3)', padding: 10 }}>
                {/* Le rapport part aussi en variable : la feuille de style en
                  * tire le plafond de LARGEUR, pour que la scène ne rompe
                  * jamais son rapport — c'est ce qui garde les pastilles
                  * posées sur le dessin. */}
                <div className="o-en-scene" style={{ position: 'relative', width: '100%', aspectRatio: SCENE_RATIO, margin: '0 auto', '--o-scene-ratio': SCENE_RATIO }}>
                  <EnergyHouseSchema solarW={solarW} homeW={consoW} surplusW={surplusW} evW={evW} evBranche={evBranche} batW={batW} batSoc={batSoc} batPresente={batPresente} solarPresente={solarAvail} format={formatEn} />
                  <PastillesEnergie solarW={solarW} gridW={consoAvail || exporting ? importW : null} exportW={surplusW} homeW={consoLue ? consoW : null} appW={null} solarPresente={solarAvail} format={formatEn} />
                </div>
              </div>
            )}
          </div>

          {/* Les bilans se calculent des STATISTIQUES quand la maison n'a pas
            * de compteurs mois et annee a elle : ils arrivent donc du module
            * a la demande, avec le tarif et l'historique. Au telephone ils
            * suivent la consommation du jour, dans sa carte. */}
          {!etroit && (
            <Suspense fallback={null}>
              <BilansEnergie hass={hass} EN={EN} tour={tourEn} devise={deviseJour} etroit={etroit} />
            </Suspense>
          )}
        </section></div>

        {/* LA CONSOMMATION DU JOUR a sa propre carte au telephone : dans
          * l'apercu, elle passerait sous l'anneau sans rien pour l'en separer. */}
        {etroit && (
          <section style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', borderRadius: 'var(--o-radius,18px)', border: 'var(--o-bw,1px) solid var(--o-bd2)', boxShadow: 'var(--o-shadow)', padding: 14 }}>
            {colonneDuJour}
            <Suspense fallback={null}>
              <BilansEnergie hass={hass} EN={EN} tour={tourEn} devise={deviseJour} etroit={etroit} />
            </Suspense>
          </section>
        )}
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex' }}><div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
          <Suspense fallback={<div style={{ flex: 1, minHeight: 320 }} />}>
            <CarteTarif hass={hass} EN={EN} tour={tourEn} devise={deviseJour} etroit={etroit} prixHa={enPrix()} venteHa={enVente()} coutJour={coutJour} revenuJour={revenuJour} />
          </Suspense>
        </div></div>
      </div>

      {/* L'HISTORIQUE, pleine largeur. */}
      <Suspense fallback={<div style={{ minHeight: 360 }} />}>
        <SectionHistorique hass={hass} EN={EN} tour={tourEn} devise={deviseJour} etroit={etroit} />
      </Suspense>

      {mesures.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: 16 }}>
          {mesures.map(m => <MetricTile key={m.caption} caption={m.caption} value={m.value} unit={m.unit} icon={m.icon} tone={m.tone} pct={m.pct} />)}
        </div>
      )}

      {/* LES POSTES. Un titre sans rien dessous ne s'affiche pas (ADR 0030) :
        * une maison dont le tableau de bord Énergie ne suit aucun appareil
        * voyait « Postes de consommation » seul au milieu de la page. En
        * ÉDITION il reste — c'est là qu'on ajoute le premier. */}
      {(ed.ids.length > 0 || edit) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <div style={{ flex: 1, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 500, color: 'var(--o-text2)' }}>{tr('Postes de consommation')}</div>
            {ed.ids.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>{tr('{v} suivis en direct', { v: fmtW(totalPostes) })}</div>}
          </div>
          <div ref={ed.gridRef} className="grid-edevices" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
            {ed.ids.map((k) => { const d = posteDe(k); const di = ed.ids.indexOf(k); const w = Math.round(numW(d.power)); const kwh = avail(d.kwh) ? numKwh(d.kwh) : null; const on = w > 5;
              const carte = (
              /* Le gabarit de la maquette : l'illustration ou l'icône en grand,
               * très pâle, dans le coin ; le nom et les chiffres poussés en bas
               * de carte. */
              <div style={{ position: 'relative', overflow: 'hidden', minHeight: 130, boxSizing: 'border-box', padding: 16, background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', borderRadius: 'var(--o-radius,18px)', border: 'var(--o-bw,1px) solid var(--o-bd2)', boxShadow: 'var(--o-shadow)', display: 'flex', flexDirection: 'column' }}>
                {d.art && VIEW_ART[d.art]
                  ? <div aria-hidden="true" style={{ position: 'absolute', right: 6, bottom: -6, width: 92, height: 92, backgroundImage: `url("${VIEW_ART[d.art]}")`, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center bottom', opacity: 0.16, pointerEvents: 'none' }} />
                  : <span aria-hidden="true" style={{ position: 'absolute', right: 14, bottom: 10, lineHeight: 1, color: 'var(--o-text)', opacity: 0.06, pointerEvents: 'none' }}><Fi i={d.icon} size={56} /></span>}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 10, background: hx(d.c, 0.15), display: 'flex', alignItems: 'center', justifyContent: 'center', color: d.c }}><GlypheCarte id={d.power} size={15}><Fi i={d.icon} size={15} color={d.c} /></GlypheCarte></span>
                  <span style={{ width: 7, height: 7, marginTop: 4, borderRadius: '50%', background: on ? 'var(--o-ok)' : 'var(--o-text3)' }} />
                </div>
                <div style={{ position: 'relative', marginTop: 'auto', paddingTop: 16, fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                <div style={{ position: 'relative', marginTop: 4, fontSize: 17, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: on ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{avail(d.power) ? <Num v={w} fmt={fmtW} /> : '—'}</div>
                <div style={{ position: 'relative', marginTop: 3, fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kwh != null ? tr('{n} kWh jour', { n: dec(kwh, 2) }) : '—'}</div>
              </div>);
              if (!edit) return <Anim key={k} i={di} base={160} className={ed.estLarge(k) ? 'o-cvw2' : ''}>{carte}</Anim>;
              return <EditableCard key={k} ed={ed} id={k} nom={d.name} onEdit={setCardEdit} hass={hass} taille={false}>{carte}</EditableCard>;
            })}
            {edit && <CarteAjout onClick={() => setEnAdd(true)} label={tr('Ajouter un poste')} />}
          </div>
        </div>
      )}
      {enAdd && <ComposeurCartes hass={hass} entete={tr('Ajouter un poste')} domaines={['sensor']} composites={false} present={ed.ids.map(k => k.indexOf('dev:') === 0 ? k.slice(4) : k)} onToggle={(id) => ed.toggle('dev:' + id)} onClose={() => setEnAdd(false)} />}
      {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={posteDe(cardEdit).name} origine={posteOrigine(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}

      {/* LE CALENDRIER, du même module à la demande que l'historique. */}
      <Suspense fallback={<div style={{ minHeight: 280 }} />}>
        <EnergieCalendrier hass={hass} EN={EN} tour={tourEn} devise={deviseJour} etroit={etroit} />
      </Suspense>
      </>)}

      {/* LES PILES, dans leur onglet, au gabarit de la maquette. */}
      {onglEn === 'piles' && piles.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 500, color: 'var(--o-text2)' }}>{tr('Piles et batteries')}</div>
              <div style={{ marginTop: 4, fontSize: 12.5, fontWeight: 600, color: 'var(--o-text3)' }}>{trN(piles.length, '{n} capteur', '{n} capteurs')}</div>
            </div>
            {pilesSurveiller > 0 && (
              <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 12, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd2)', flexShrink: 0 }}>
                {[['toutes', tr('Toutes'), piles.length], ['surveiller', tr('À surveiller'), pilesSurveiller]].map(([id, lb, n]) => (
                  <button key={id} onClick={() => setPilesFiltre(id)} aria-pressed={pilesFiltre === id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 30, padding: '0 13px', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', background: pilesFiltre === id ? 'var(--o-accent-fond)' : 'transparent', color: pilesFiltre === id ? '#fff' : 'var(--o-text2)' }}>
                    {lb}<span style={{ minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 800, background: pilesFiltre === id ? 'rgba(255,255,255,.22)' : 'var(--o-s1)', color: pilesFiltre === id ? '#fff' : 'var(--o-text2)' }}>{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="o-piles grid-objets grid-dense" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(225px,1fr))', columnGap: 16, rowGap: 8 }}>
            {pilesVues.map((p, i) => <Anim key={p.id} i={i} base={200}>{dc.card(p.id)}</Anim>)}
          </div>
        </>
      )}
      {dc.sheets}

    </div>
  );
}

export { EnergieContent };
