/* ── Les fiches d'un capteur, chargées à la demande (chantier Capteurs, plan 1 ; C12) ──────────
 *
 * La fiche d'une MESURE, celle de sa maquette « Cartes capteurs » (cadre 1b,
 * § 4), et celle d'un capteur binaire, sur son patron, sans courbe (étape 2 du
 * chantier, C26). Elles ont quitté App.jsx, et le démarrage avec lui
 * (tâche 1), et n'importent jamais App.jsx : les coquilles (`FicheCapteur`,
 * `FicheBinaire`) leur passent la vue de la carte et les briques des fiches de
 * là-bas (`briques`). Ce module n'exporte que des CONTENUS : chaque coquille garde
 * sa feuille et pose la frontière Suspense dedans (correction bis, point 3) — un
 * morceau qui ne se charge pas se dit dans la feuille, jamais à la place de la vue.
 *
 * La fiche d'une mesure : une feuille SANS onglets, sa hauteur suit son contenu.
 *  - L'en-tête : la plaque teintée comme la carte, le nom, « {pièce} · {famille} »,
 *    l'épingle et la croix.
 *  - Le panneau du haut, teinté à 0,08 hors du bon : le chiffre en 48 / 800 et son
 *    unité ; la barre des zones en 10 px et, dessous, le nom des zones qui y
 *    tiennent, puis les chiffres des repères ; la phrase de la carte ; le conseil
 *    et « depuis » (C9). Muette : le liseré qui respire, « — » et « Indisponible ».
 *  - « Dernières 24 h » : « min · max », la courbe — les moyennes sur 5 minutes de
 *    Home Assistant, sinon l'histoire —, les zones hors du bon en bandes de fond,
 *    les repères de la table sur l'axe de gauche.
 *  - Les faits : le dernier signal, la pile, et L'appareil, qui ouvre la fiche
 *    universelle.
 * Tout capteur l'ouvre : celui qu'aucune famille ne lit (une pression, une
 * puissance) y garde son chiffre et sa courbe, sans barre, ni zones, ni conseil ;
 * une mesure du dehors que la table ne juge pas (C15) aussi. Dehors (C15, révisé
 * le 16/10), la température et l'humidité gardent la barre, le nom des zones, la
 * courbe et ses bandes — celles du dehors —, mais rien n'y est une alerte : ni
 * teinte, ni conseil, ni « depuis ».
 * Ce qui se calcule vit dans mesuresfiche.js ; la zone, la phrase, le chiffre et
 * la barre, dans la vue de sa carte (`useVueMesure`, App.jsx).
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { tr, locale } from './i18n.js';
import { Fi } from './ui.jsx';
import { enPanne } from './outils.js';
import { relTime } from './format.js';
import { uniteVentConnue } from './unites.js';
import { lireStats, conseilMesure, journeeMesure, motsBarre, dernierSignal } from './mesuresfiche.js';
import { EnteteFiche, PETITES_CAPITALES, filet } from './fichecommune.jsx';
import { useJournee, bandesDuJour, depuisDuJour, resumeJour, heure, BandeJour } from './journee.jsx';
import { CLASSES_MOUVEMENT, couleurPile } from './attention.js';
import { LISERE } from './styles.js';
import { cfgSet } from './state.js';
import { CLE_NON_JUGEES } from './horsair.js';

/* Les panneaux de sa maquette : le gris --o-s3, l'arrondi du thème, sans ombre, et le liseré du réglage « Liserés ». */
const PANNEAU = { background: 'var(--o-s3)', border: LISERE, borderRadius: 'var(--o-radius,18px)', boxSizing: 'border-box', minWidth: 0 };
const RANGEE = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 16px' };
const EN_BOUTON = { border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--o-text)', textAlign: 'left' };
const TITRE = { display: 'block', fontSize: 14, fontWeight: 700 };
const SOUS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };
const VALEUR = { fontSize: 13, fontWeight: 800, color: 'var(--o-text1)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };
const ECHELLE = { fontSize: 11, fontWeight: 700, color: 'var(--o-text3)' };

/* Les moyennes sur 5 minutes des dernières 24 heures (§ 7) : UNE lecture, à
 * l'ouverture de la fiche — ou quand Home Assistant répond enfin (`sansWS`). Rend
 * null tant que rien n'est lu, [] quand Home Assistant n'en a pas — un capteur sans
 * `state_class`, pas d'enregistreur, une lecture qui échoue : la fiche lit alors
 * l'histoire, comme avant.
 * Les moyennes reviennent dans l'unité où la statistique est née : une température
 * relevée en °C puis affichée en °F se relisait « 21 °F ». `classe` et `unite`
 * demandent celle que la carte écrit (`units`, comme prisesetat.js) — `temperature`
 * pour une température, `speed` pour un vent (correction bis, point 5) ; rien pour
 * une famille que Home Assistant ne convertit pas. */
function useStats24(hass, id, classe = null, unite = null) {
  const [lu, setLu] = useState({ id: null, stats: null });
  const source = useRef(hass);
  source.current = hass;
  const sansWS = !hass || typeof hass.callWS !== 'function';
  useEffect(() => {
    const h = source.current;
    if (!h || typeof h.callWS !== 'function') return undefined;
    let vivant = true;
    // `new Promise` : un `callWS` qui lève avant de répondre est un échec comme un autre.
    new Promise((ok) => ok(h.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(Date.now() - 24 * 3600000).toISOString(),
      statistic_ids: [id], period: '5minute', types: ['mean'], ...(classe && unite ? { units: { [classe]: unite } } : null) })))
      .then((r) => { if (vivant) setLu({ id, stats: lireStats(r, id) }); }, () => { if (vivant) setLu({ id, stats: [] }); });
    return () => { vivant = false; };
  }, [id, sansWS, classe, unite]);
  return sansWS ? [] : lu.id === id ? lu.stats : null;
}

/** L'unité où la fiche demande les moyennes (`units`) : `{ classe, unite }` — `temperature` dans l'unité affichée (« °C », « °F »),
 * `speed` dans celle du vent quand la table la connaît ; null pour le reste. */
function unitesStats(cle, unite, uniteTable) {
  if (cle === 'temp' && (unite === '°C' || unite === '°F')) return { classe: 'temperature', unite };
  if (cle === 'vent' && uniteVentConnue(uniteTable)) return { classe: 'speed', unite: uniteTable };
  return null;
}

/* La barre de la fiche (§ 4) : celle de la carte en 10 px — une bande par zone, sa
 * part de l'échelle, la zone où l'on est pleine, les autres à 0,28 ; le repère de
 * 4 px sur 18, cerclé du panneau ; dessous, le nom des zones qui tiennent
 * (`motsBarre`) — celle où l'on est en gras, dans la couleur de sa zone hors du
 * bon (`teinte`), en `--o-text` si elle est bonne ou du dehors —, puis les
 * chiffres des repères. Le chiffre et la phrase sont déjà dits : elle ne se lit
 * pas à voix haute. */
function BarreFiche({ barre, teinte }) {
  return (
    <div aria-hidden="true" className="o-mesure-barre-fiche" style={{ marginTop: 18 }}>
      <div style={{ position: 'relative', paddingTop: 4 }}>
        <div style={{ display: 'flex', gap: 2, height: 10 }}>
          {barre.zones.map((b, k) => <span key={k} data-bande="" style={{ flexGrow: b.part, flexShrink: 1, flexBasis: 0, minWidth: 0, borderRadius: 4, background: 'rgba(' + b.rgb + ',' + (k === barre.i ? 1 : .28) + ')' }} />)}
        </div>
        <span data-repere="" style={{ position: 'absolute', top: 0, left: barre.pos + '%', width: 4, height: 18, marginLeft: -2, borderRadius: 2, background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-s3)' }} />
      </div>
      <div style={{ position: 'relative', height: 14, marginTop: 7, fontSize: 11.5, lineHeight: '14px' }}>
        {motsBarre(barre).map(m => {
          // Gardé dans la barre, quelle que soit sa largeur : « Duszno » débordait de 2 px au téléphone de 320 px (mesuré).
          const demi = m.t.length * 3.6;
          return (
            <span key={m.k} data-mot="" style={{ position: 'absolute', left: 'clamp(' + demi + 'px, ' + m.pos + '%, calc(100% - ' + demi + 'px))', transform: 'translateX(-50%)',
              whiteSpace: 'nowrap', fontWeight: m.on ? 800 : 700, color: m.on ? (teinte ? teinte.c : 'var(--o-text)') : 'var(--o-text3)' }}>{m.t}</span>
          );
        })}
      </div>
      <div style={{ position: 'relative', height: 14, marginTop: 3, fontSize: 10.5, fontWeight: 700, lineHeight: '14px', color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
        {barre.reperes.map(r => {
          const demi = r.t.length * 3.2;
          return <span key={r.t} style={{ position: 'absolute', left: 'clamp(' + demi + 'px, ' + r.pos + '%, calc(100% - ' + demi + 'px))', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>{r.t}</span>;
        })}
      </div>
    </div>
  );
}

/* La courbe des 24 heures (§ 4) : 400 × 120 ; les zones hors du bon en bandes de
 * fond à 0,08 ; l'aire et la ligne dans la couleur de la zone, en neutre si elle
 * est bonne ; à gauche (44 px), les repères de la table que l'axe montre ;
 * dessous, « il y a 24 h · il y a 12 h · maintenant ». Le chiffre et « min · max »
 * sont écrits : elle ne se lit pas à voix haute. */
function CourbeFiche({ courbe, points, teinte }) {
  if (!courbe) {
    return <div style={{ ...SOUS, marginTop: 14 }}>{points == null ? tr('Chargement…') : points === 'erreur' ? tr('Historique indisponible pour le moment') : tr("Pas d'historique sur 24 h")}</div>;
  }
  return (
    <div aria-hidden="true" style={{ position: 'relative', marginTop: 14, paddingLeft: 44 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 38, height: 120, fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>
        {courbe.reperes.map(r => <span key={r.t} style={{ position: 'absolute', right: 0, top: r.y, marginTop: -6, lineHeight: '12px', whiteSpace: 'nowrap' }}>{r.t}</span>)}
      </div>
      <svg className="o-mesure-courbe" viewBox="0 0 400 120" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 120, overflow: 'visible' }}>
        {courbe.bandes.map((b, k) => <rect key={k} data-bande="" x="0" y={b.y} width="400" height={b.h} style={{ fill: 'rgba(' + b.rgb + ',.08)' }} />)}
        <path d={courbe.aire} style={{ fill: teinte ? 'rgba(' + teinte.rgb + ',.16)' : 'var(--o-s1)' }} />
        <path d={courbe.ligne} vectorEffect="non-scaling-stroke" style={{ fill: 'none', stroke: teinte ? teinte.c : 'var(--o-text1)', strokeWidth: 2, strokeLinejoin: 'round' }} />
      </svg>
      <div style={{ ...ECHELLE, display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <span>{tr('il y a {n} h', { n: 24 })}</span><span>{tr('il y a {n} h', { n: 12 })}</span><span>{tr('maintenant')}</span>
      </div>
    </div>
  );
}

/**
 * La fiche d'une mesure. `vue` : celle de sa carte (`useVueMesure`, App.jsx) — le
 * nom, la zone, la phrase, le chiffre, la barre, le `hass` vivant et le passage
 * au repère de la table ; `piece` : le nom de sa pièce ; `epingle`, `glyphe` : son
 * épingle et l'icône de sa carte ; `onFiche(id)` ouvre la fiche universelle de
 * l'appareil ; `briques` : ce qu'elle lit d'App.jsx — l'histoire de 24 h
 * (`useHistorique24`), la pile (`pileDe`) et les entités de l'appareil
 * (`soeursDe`) ; `maintenant` sert aux tests.
 */
export default function FicheCapteurContent({ id, vue, piece = null, epingle = null, glyphe = null, onFiche = null, briques, maintenant = null }) {
  const { useHistorique24, pileDe, soeursDe, jugement } = briques;
  const H = vue.hass;
  const S = (H && H.states) || {};
  const { cle, uniteTable, unite: ecrite, neutre, dehors } = vue;
  const demande = unitesStats(cle, ecrite, uniteTable);
  const stats = useStats24(H, id, demande && demande.classe, demande && demande.unite);
  const histoire = useHistorique24(H, stats && !stats.length ? id : null);
  // Les points de la journée, dans l'unité du capteur : les statistiques, sinon l'histoire ; null tant que rien n'est lu.
  const brut = stats == null ? null : stats.length ? stats : histoire;
  const z = vue.zone;
  const zi = z ? z.i : -1;
  // Hors du bon, la couleur de la zone ; dehors, rien n'est une alerte (C15, révisé le 16/10) : le neutre.
  const teinte = z && !z.bon && !dehors ? z : null;
  /* La courbe, « depuis » et « min · max », calculés une fois par lecture, et non à chaque relevé de la carte (correction bis,
   * point 13). Une mesure du dehors que la table ne juge pas (C15) : sa courbe, sans bandes ni repères ; une température ou une
   * humidité du dehors : sa courbe sur les zones du dehors, sans « depuis ». */
  const { courbe, depuis, minmax } = useMemo(() => journeeMesure(brut, { cle, uniteTable, ecrite, neutre, dehors, zi, maintenant }), [brut, cle, uniteTable, ecrite, neutre, dehors, zi, maintenant]);
  const conseil = [conseilMesure(cle, z), depuis].filter(Boolean).join(' ');
  const pile = pileDe(S, id);
  const dernier = dernierSignal(S, [id, ...soeursDe(id)]);
  // Un capteur qui n'écrit pas un nombre garde son état, tel quel, comme la fiche d'avant ; sa phrase, qui le redit, se tait (point 10).
  const mot = vue.muette ? '—' : vue.chiffre == null ? (vue.st ? vue.st.state : '—') : null;
  /* « Ne pas juger cette mesure » (audit du 19/10, décision D5) : la découverte devine — un frigo, la sonde d'un appareil —, ce réglage
   * CORRIGE, dans les deux sens. Il s'écrit dans la configuration de la maison : un compte ordinaire ne le voit pas (un refus nommerait
   * la clé). Seulement pour une mesure que la table jugerait — dans une pièce du dedans. */
  const j = jugement ? jugement(H, id, cle) : null;
  const [force, setForce] = useState(null);
  const nonJugee = force != null ? force : !!(j && j.nonJugee);
  const basculerJugement = () => {
    const v = !nonJugee;
    setForce(v);
    cfgSet({ [CLE_NON_JUGEES]: (brut) => ({ ...(brut && typeof brut === 'object' && !Array.isArray(brut) ? brut : {}), [id]: v }) })
      .then(pris => { if (pris === false) setForce(null); });
  };
  const plaque = { icone: 'thermometer-half', glyphe, fond: teinte ? 'rgba(' + teinte.rgb + ',.16)' : 'var(--o-s1)', encre: teinte ? teinte.c : vue.muette ? 'var(--o-text3)' : 'var(--o-text1)' };
  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <EnteteFiche nom={vue.nom} epingle={epingle} plaque={plaque} sousNom={[piece, vue.famille].filter(Boolean).join(' · ')} />

      {/* Muette, le panneau porte le liseré qui respire (ADR 0048), « — » sans unité et « Indisponible ». */}
      <div className={vue.muette ? 'o-panne' : undefined} style={{ ...PANNEAU, padding: 18, background: teinte ? 'rgba(' + teinte.rgb + ',.08)' : 'var(--o-s3)' }}>
        {mot == null
          ? (<div style={{ display: 'flex', alignItems: 'baseline', gap: 5, fontWeight: 800, lineHeight: 1 }}>
            <span style={{ fontSize: 48, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}>{vue.chiffre}</span>
            {vue.unite && <span style={{ fontSize: 20 }}>{vue.unite}</span>}
          </div>)
          : <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, color: vue.muette ? 'var(--o-text3)' : 'var(--o-text)', overflowWrap: 'anywhere' }}>{mot}</div>}
        {vue.barre && <BarreFiche barre={vue.barre} teinte={teinte} />}
        {vue.phrase && vue.phrase !== mot && <div style={{ fontSize: 14, fontWeight: 800, marginTop: 10, color: vue.muette ? 'var(--o-bad)' : teinte ? teinte.c : 'var(--o-text2)' }}>{vue.phrase}</div>}
        {conseil && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text1)', marginTop: 4, lineHeight: 1.45 }}>{conseil}</div>}
      </div>

      <div style={{ ...PANNEAU, padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <span style={PETITES_CAPITALES}>{tr('DERNIÈRES 24 H')}</span>
          {minmax && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)', fontVariantNumeric: 'tabular-nums' }}>{minmax}</span>}
        </div>
        <CourbeFiche courbe={courbe} points={brut} teinte={teinte} />
      </div>

      <div style={{ ...PANNEAU, overflow: 'hidden' }}>
        <div style={RANGEE}>
          <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Dernier signal')}</span>
          <span style={VALEUR}>{dernier == null ? '—' : relTime(new Date(dernier).toISOString())}</span>
        </div>
        {pile != null && (
          <div style={{ ...RANGEE, borderTop: filet(1) }}>
            <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Pile')}</span>
            <span style={{ ...VALEUR, color: couleurPile(pile, 'var(--o-text1)') }}>{pile + '\u00a0%'}</span>
          </div>
        )}
        {onFiche && (
          <button type="button" onClick={() => onFiche(id)} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
        {/* La correction, en dernier : un réglage rare, sous les faits. */}
        {j && j.possible && j.reglable && (
          <button type="button" role="switch" aria-checked={nonJugee} aria-label={tr('Ne pas juger cette mesure')} onClick={basculerJugement} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Ne pas juger cette mesure')}</span><span style={SOUS}>{tr('Un frigo, la sonde d’un appareil : le chiffre et la courbe, sans zone ni alerte.')}</span></span>
            <span aria-hidden="true" style={{ width: 42, height: 24, borderRadius: 14, flexShrink: 0, position: 'relative', background: nonJugee ? 'var(--o-accent-fond)' : 'var(--o-bd1)' }}>
              <span style={{ position: 'absolute', top: 3, left: nonJugee ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff' }} /></span>
          </button>
        )}
      </div>
    </div>
  );
}

/* La fiche d'un CAPTEUR BINAIRE (chantier Capteurs, étape 2 ; C26, § 5.2) : celle d'une mesure (ADR 0200), sans courbe. Le
 * CONTENU seul : sa coquille (`FicheBinaire`, App.jsx) garde la feuille et pose la frontière Suspense dedans.
 *  - L'en-tête : la plaque, le nom, « {pièce} · {famille} », l'épingle, la croix.
 *  - Le panneau du haut : l'état en 28 / 800 (« Ouverte », « Aucune fumée »), dans sa couleur — le calme en neutre, ouvert en
 *    ambre, un mouvement en accent, un danger en rouge ; « depuis 22:25 » ; la bande du jour et son résumé (« ouverte 2 fois
 *    aujourd'hui »), lus dans l'historique du jour — une lecture, à l'ouverture (journee.jsx). Muet : le liseré qui respire.
 *  - Les faits : le dernier signal, la pile, et L'appareil, qui ouvre la fiche universelle.
 * Partent les trois lignes de Home Assistant d'avant : « Relevé », « Pièce », « Dernier changement ». */
export function RoomBinarySheet({ id, hass, briques, piece = null, famille = null, epingle = null, glyphe = null, onFiche = null, maintenant = null }) {
  const { etatsBinaires, pileDe, soeursDe } = briques;
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const e = etatsBinaires()[a.device_class] || null;
  /* `enPanne`, comme sa carte (05/10) : un capteur `unknown` y est « Indisponible ». */
  const mort = enPanne(id, st);
  const on = !mort && st.state === 'on';
  const mot = mort ? tr('Indisponible') : e ? (on ? e[0] : e[1]) : (on ? tr('Détecté') : tr('RAS'));
  const danger = on && !!(e && e[2]);
  const encre = mort || danger ? 'var(--o-bad)' : !on ? 'var(--o-text)' : CLASSES_MOUVEMENT.indexOf(a.device_class) >= 0 ? 'var(--o-accent-soft)' : 'var(--o-warn)';
  const j = useJournee(hass, [id]);
  const lu = j && j !== 'erreur' ? j : null;
  /* Une entité que l'historique ignore (un enregistreur qui l'exclut) n'a pas de journée : ni bande, ni « depuis » — `[]` la
   * faisait passer pour « fermée toute la journée » sous « Ouverte » (audit du 19/10, M17 ; la règle des popups de groupe). */
  const etats = lu ? (lu.etats[id] || null) : null;
  const depuis = etats ? depuisDuJour(etats, lu.debut) : null;
  const pile = pileDe(S, id);
  const dernier = dernierSignal(S, [id, ...soeursDe(id)]);
  const plaque = { icone: 'sensor', glyphe, fond: danger ? 'rgba(var(--o-bad-rgb),.16)' : 'var(--o-s1)', encre: danger ? 'var(--o-bad)' : mort ? 'var(--o-text3)' : 'var(--o-text1)' };
  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <EnteteFiche nom={a.friendly_name || id} epingle={epingle} plaque={plaque} sousNom={[piece, famille].filter(Boolean).join(' · ')} />
      <div className={mort ? 'o-panne' : undefined} style={{ ...PANNEAU, padding: 18, background: danger ? 'rgba(var(--o-bad-rgb),.08)' : 'var(--o-s3)' }}>
        {/* Le grand mot se coupe s'il le faut : « Sicherheitswarnung » débordait à 320 px. */}
        <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.15, color: encre, overflowWrap: 'anywhere' }}>{mot}</div>
        {depuis != null && <div style={{ fontSize: 14, fontWeight: 800, marginTop: 6, color: 'var(--o-text2)' }}>{tr('depuis {h}', { h: heure(depuis, locale()) })}</div>}
        {etats
          ? <BandeJour bandes={bandesDuJour(etats, lu.debut, maintenant == null ? Date.now() : maintenant)} resume={resumeJour(a.device_class, etats)} />
          : !lu && <div style={{ ...SOUS, marginTop: 10 }}>{j === 'erreur' ? tr('Historique indisponible pour le moment') : tr('Chargement…')}</div>}
      </div>

      <div style={{ ...PANNEAU, overflow: 'hidden' }}>
        <div style={RANGEE}>
          <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Dernier signal')}</span>
          <span style={VALEUR}>{dernier == null ? '—' : relTime(new Date(dernier).toISOString())}</span>
        </div>
        {pile != null && (
          <div style={{ ...RANGEE, borderTop: filet(1) }}>
            <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Pile')}</span>
            <span style={{ ...VALEUR, color: couleurPile(pile, 'var(--o-text1)') }}>{pile + '\u00a0%'}</span>
          </div>
        )}
        {onFiche && (
          <button type="button" onClick={() => onFiche(id)} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>
    </div>
  );
}
