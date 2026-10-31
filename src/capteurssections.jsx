/* ── Objets › Capteurs en sections (chantier Capteurs, § 5 ; C5, C10) ───────────────────────
 *
 * Sous le filtre Capteurs, hors édition, la grille se range en sections, dans
 * l'ordre de sa maquette : Air (CO₂, particules, COV), Confort (température,
 * humidité, bruit, luminosité), Maison (les capteurs binaires : ouvertures,
 * présence, sécurité), Dehors (ce qui est dans une pièce du dehors, et le vent),
 * Plantes et piles. Une section vide ne paraît pas ; une carte hors du bon reste
 * à sa place dans sa section — la maquette ne la remonte pas.
 *
 * L'en-tête dit « {n} cartes », puis « · {k} à regarder » quand une mesure est
 * hors du bon (C5 : le bleu et le vert de la table sont bons). Une section de
 * mesures dit, à côté de son titre, « {k} à regarder » dès qu'une de ses mesures
 * est hors du bon — comme l'en-tête, qui les compte (correction bis 2, point 3 :
 * un CO₂ muet faisait taire Air sous « · 3 à regarder »). « Rien à signaler »,
 * seulement si elle JUGE tout ce qu'elle montre (correction bis, point 2 ; sa
 * règle : jamais de « Tout va bien » permanent) : au moins une mesure jugée, et
 * rien qu'elle ne sache pas juger. Un portail du jardin, une plante, une pile,
 * une mesure muette ou dans une unité inconnue lui échappent : elle tait son
 * « Rien à signaler ». Dehors (C15, révisé le 16/10 ; décision D3 du 19/10) :
 * une mesure du dehors a ses zones, mais rien n'y est « à regarder », et une
 * vigilance au calme est NEUTRE — ni bonne, ni « Rien à signaler ». Dehors ne
 * parle que pour une vigilance ACTIVE (jaune ou plus) ou muette : « 1 à
 * regarder » ; sinon il se tait, toujours. Maison juge depuis l'étape 2 (les
 * groupes, par `jugerObjet`, App.jsx) ; Plantes et piles depuis l'étape 3 (les
 * plantes et la carte Piles). Une plante et la carte Piles restent dans
 * Plantes et piles, même dans une pièce du dehors (audit du 19/10, M10) : une
 * plante du balcon n'est pas une mesure du dehors.
 *
 * Son propre module, chargé à la première ouverture du filtre (`lazyRecharge`,
 * App.jsx), comme les en-têtes des volets, des prises et des lumières. Il
 * n'importe jamais App.jsx : la vue lui passe les objets visibles, dans l'ordre
 * de son éditeur, la cellule de chaque carte (`cellule`), la règle des pièces du
 * dehors (`dehors`) et la vue d'une mesure (`lire` : `vueMesure`, sa zone).
 * Son enveloppe vivante (`SectionsCapteursVive`, App.jsx) le redessine à chaque
 * relevé d'une mesure jugée : seul le décompte se recalcule, les grilles sont
 * mémoïsées (`GrilleSection`, correction bis 2, point 2).
 */
import { memo, useId } from 'react';
import { tr, trN, trSens } from './i18n.js';
import { cleMesure } from './confort.js';
import { GROUPES } from './groupes.js';
import { petitesCapitales } from './styles.js';

// Les sections, dans l'ordre de sa maquette.
const SECTIONS_CAPTEURS = ['air', 'confort', 'maison', 'dehors', 'plantes'];
/* Leur titre, lu au rendu, dans la langue du moment. « Maison » passe par une clé de contexte : sa clé nue est aussi
 * le mode « à la maison » d'une alarme, et l'allemand lisait « Zu Hause » au-dessus des portes. */
const titres = () => ({ air: tr('Air'), confort: tr('Confort'), maison: trSens('Maison · capteurs'), dehors: tr('Dehors'), plantes: tr('Plantes et piles') });
/* Les familles de la table qui disent l'air (le monoxyde compris, audit du 19/10, H10), et les mesures sans table qui le disent
 * aussi, NEUTRES (M7) : les PM1 et PM10, l'indice, les COV en ppb ou en µg/m³ — que la table ne lit pas : ses bornes sont celles
 * d'un indice —, le dioxyde d'azote et l'ozone. La pression, sans jugement, reste dans Confort. */
const AIR = ['co2', 'co', 'pm25', 'cov'];
// Un monoxyde dans une unité que la table ne sait pas ramener au ppm (G1-D6) : hors de la famille `co`, il reste dans Air, neutre.
const AIR_SANS_TABLE = ['pm1', 'pm10', 'aqi', 'volatile_organic_compounds', 'volatile_organic_compounds_parts', 'nitrogen_dioxide', 'ozone', 'carbon_monoxide'];

/** La section d'un objet d'Objets › Capteurs. `dehors(piece)` dit une pièce du dehors. */
export function sectionDe(o, S, dehors) {
  // La vigilance météo (chantier Capteurs, C28) est du dehors, où qu'elle soit déclarée.
  if (o.vigilance) return 'dehors';
  // La carte Piles (C32) et les plantes (C33) : dans Plantes et piles, AVANT le dehors (M10) — une plante du balcon y reste.
  if (o.cle === 'groupe:piles' || o.type === 'plant') return 'plantes';
  const a = (S[o.id] && S[o.id].attributes) || {};
  if (o.domaine === 'sensor' && a.device_class === 'battery') return 'plantes';
  if (o.piece && dehors(o.piece)) return 'dehors';
  if (o.domaine !== 'sensor') return 'maison';
  const cle = cleMesure(a.device_class, a.unit_of_measurement);
  if (cle === 'vent') return 'dehors';
  return AIR.indexOf(cle) >= 0 || AIR_SANS_TABLE.indexOf(a.device_class) >= 0 ? 'air' : 'confort';
}

/* Ce qu'une section sait dire d'un objet (correction bis, point 2) :
 *  - 'regarder' : une mesure hors du bon (C5) — sa zone n'est ni bleue ni verte ;
 *  - 'bonne' : une mesure jugée, dans le bon ;
 *  - 'neutre' : une mesure qui n'a, à dessein, jamais rien à signaler — sans table (une pression), du dehors (C15, révisé le
 *    16/10 : ses zones disent où l'on est, jamais une alerte), qu'on ne juge pas (un frigo, D5) ; une vigilance au calme (D3) ;
 *  - null : ce qu'elle ne sait pas juger — un capteur binaire (un portail ouvert), une plante, une pile, et une mesure que la table
 *    jugerait si elle la lisait : muette, illisible, ou dans une unité qu'elle ne connaît pas (un vent en Beaufort). */
function lecture(o, S, lire, juger) {
  /* Ce qui n'est pas une mesure se juge dans App.jsx (`jugerObjet`, chantier Capteurs, étapes 2 et 3 : la vigilance météo, les
   * groupes, les plantes, les piles) : 'regarder', 'bonne', 'neutre' ou null ; `undefined` rend la main à la table. */
  if (juger) { const j = juger(o); if (j !== undefined) return j; }
  if (o.domaine !== 'sensor' || !o.id) return null;
  if (((S[o.id] && S[o.id].attributes) || {}).device_class === 'battery') return null;
  const v = lire(o.id);
  if (!v) return null;
  if (v.dehors) return 'neutre';
  if (v.zone) return v.zone.bon ? 'bonne' : 'regarder';
  return !v.cle || (v.neutre && !v.inconnue) ? 'neutre' : null;
}

/**
 * Les sections non vides, dans l'ordre : `{ id, titre, objets, regarder, statut }`
 * — `regarder` : ce qu'elle a hors du bon ; `statut` : elle dit son état — dès
 * qu'elle a quelque chose à regarder (correction bis 2, point 3), et pour dire
 * « Rien à signaler », si elle en juge au moins une et que rien ne lui échappe
 * (point 2) — jamais Dehors (D3, 19/10) : il ne parle que pour une vigilance
 * active. `lire(id)` : la vue d'une mesure.
 */
export function sectionsCapteurs(objets, { S, dehors, lire, juger = null }) {
  const t = titres();
  const par = new Map(SECTIONS_CAPTEURS.map(id => [id, []]));
  for (const o of objets) par.get(sectionDe(o, S, dehors)).push(o);
  // Maison (chantier Capteurs, C25) : Ouvertures, Sécurité, Présence d'abord, dans cet ordre, puis ce qui est à part, dans l'ordre de l'éditeur.
  const rang = (o) => (o.type === 'groupe' ? GROUPES.indexOf(String(o.cle).slice(7)) : GROUPES.length);
  par.set('maison', par.get('maison').map((o, i) => [o, i]).sort((a, b) => rang(a[0]) - rang(b[0]) || a[1] - b[1]).map(x => x[0]));
  // Plantes et piles (C33) : les plantes, dans l'ordre de l'éditeur, puis Piles.
  par.set('plantes', par.get('plantes').map((o, i) => [o, i]).sort((a, b) => (a[0].cle === 'groupe:piles') - (b[0].cle === 'groupe:piles') || a[1] - b[1]).map(x => x[0]));
  return SECTIONS_CAPTEURS.filter(id => par.get(id).length).map(id => {
    const lus = par.get(id).map(o => lecture(o, S, lire, juger));
    const regarder = lus.filter(l => l === 'regarder').length;
    const juge = id !== 'dehors' && lus.some(l => l === 'bonne' || l === 'regarder') && lus.every(l => l !== null);
    // Chaque section juge ce qu'elle montre (chantier Capteurs, étapes 2 et 3) : les groupes, la vigilance, les plantes, les piles.
    return { id, titre: t[id], objets: par.get(id), regarder, statut: regarder > 0 || juge };
  });
}

const TITRE_FILTRE = { margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, fontWeight: 400, color: 'var(--o-text2)' };
// La grille d'Objets, telle quelle : ses classes la passent en deux colonnes au téléphone (index.css).
const GRILLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(225px,1fr))', columnGap: 16, rowGap: 8 };

/* La grille d'une section, MÉMOÏSÉE (correction bis 2, point 2). L'enveloppe vivante redessine les sections à chaque relevé
 * d'une mesure jugée ; tant que la vue ne s'est pas redessinée, une section garde les mêmes objets, dans le même ordre, et la
 * même `cellule` : sa grille ne se redessine pas. Chaque carte s'abonne à sa mesure — un CO₂ qui change ne redessine que la
 * sienne (23 cartes avant, mesuré dans la démo). La vue redessinée, `cellule` change, et toutes les grilles suivent. */
const memesCellules = (a, b) => a.cellule === b.cellule && a.objets.length === b.objets.length && a.objets.every((o, i) => o === b.objets[i]);
const GrilleSection = memo(function GrilleSection({ objets, cellule }) {
  return <div className="grid-objets grid-dense" style={GRILLE}>{objets.map(cellule)}</div>;
}, memesCellules);

export default function SectionsCapteurs({ hass, titre, objets, cellule, dehors, lire, juger = null }) {
  const base = useId();
  const S = (hass && hass.states) || {};
  const sections = sectionsCapteurs(objets, { S, dehors, lire: (id) => lire(hass, id), juger: juger ? (o) => juger(hass, o) : null });
  const regarder = sections.reduce((n, s) => n + s.regarder, 0);
  return (<>
    {/* La rangée commune de 40 px (19/10) : le titre au niveau de celui des Lumières, pas 11 px plus haut. */}
    <div className="o-objets-entete">
      <h2 style={TITRE_FILTRE}>{titre}</h2>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
        {trN(objets.length, '{n} carte', '{n} cartes') + (regarder ? ' · ' + trN(regarder, '{n} à regarder', '{n} à regarder') : '')}
      </span>
    </div>
    {sections.map(s => (
      <section key={s.id} data-section={s.id} aria-labelledby={base + s.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h3 id={base + s.id} style={{ margin: 0, ...petitesCapitales(10.5) }}>{s.titre}</h3>
          {s.statut && (
            <span style={{ fontSize: 12, fontWeight: 700, color: s.regarder ? 'var(--o-warn)' : 'var(--o-text3)' }}>
              {s.regarder ? trN(s.regarder, '{n} à regarder', '{n} à regarder') : tr('Rien à signaler')}
            </span>
          )}
        </div>
        <GrilleSection objets={s.objets} cellule={cellule} />
      </section>
    ))}
  </>);
}
