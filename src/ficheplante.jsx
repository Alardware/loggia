/* ── La fiche d'une PLANTE, chargée à la demande (chantier Capteurs, étape 3 ; C31, § 7.3) ──────────
 *
 * Le cadre 1e de sa maquette « Cartes capteurs ». Le CONTENU seul : sa coquille
 * (`FichePlante`, App.jsx) garde la feuille — sans onglets, à la hauteur de son
 * contenu — et pose la frontière Suspense dedans. Il n'importe jamais App.jsx :
 * la coquille lui passe la plante lue dans le `hass` vivant de ses capteurs
 * (`lirePlante`) et l'ouverture de la fiche universelle de l'appareil.
 *  1. L'en-tête commun : la feuille sur le vert de la plante, le nom, « {pièce} ·
 *     capteur de plante », une croix. Pas d'épingle : une plante n'est pas une
 *     entité.
 *  2. Le panneau du haut (teinté à 0,06 quand quelque chose presse) : le sol en
 *     48 / 800 et « % de sol » en 20, la phrase de la carte, puis un conseil par
 *     mesure qui presse (plantes.js, `conseilsPlante`). Muette : « Dernier relevé
 *     {quand} : sol à {n} % », lu UNE fois dans les statistiques à l'heure de Home
 *     Assistant (dix jours), puis « Changez la pile. » si la dernière pile connue
 *     était à 20 % ou moins, sinon « Le capteur ne répond plus. ». Rien n'est deviné.
 *  3. Les mesures, une rangée chacune : le libellé et la valeur (en ambre hors de
 *     sa plage), une barre de 8 px — la plage idéale en vert à 0,28, un repère de
 *     4 px à la valeur, la lumière sur une échelle logarithmique —, et « Idéal :
 *     {a} à {b} {u} », d'après la seule table (`PLAGES_PLANTE`).
 *  4. Les faits : la pile du capteur (la règle de la maison, `niveauPile`), le
 *     dernier signal, et L'appareil, qui ouvre la fiche universelle.
 */
import { useState, useEffect, useRef } from 'react';
import { tr, locale } from './i18n.js';
import { Fi } from './ui.jsx';
import { nombre, relTime } from './format.js';
import { deCelsius, signeTemp } from './unites.js';
import { niveauPile, couleurNiveau, seuilsPile } from './attention.js';
import { PLAGES_PLANTE } from './objets.js';
import { dernierSignal } from './mesuresfiche.js';
import { EnteteFiche, filet } from './fichecommune.jsx';
import { LISERE } from './styles.js';
import { vuePlante, conseilsPlante, barrePlante, dernierReleve, quandPlante } from './plantes.js';

const PANNEAU = { background: 'var(--o-s3)', border: LISERE, borderRadius: 'var(--o-radius,18px)', boxSizing: 'border-box', minWidth: 0 };
const RANGEE = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 16px' };
const EN_BOUTON = { border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--o-text)', textAlign: 'left' };
const TITRE = { display: 'block', fontSize: 14, fontWeight: 700 };
const SOUS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };
const VALEUR = { fontSize: 13, fontWeight: 800, color: 'var(--o-text1)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' };

/* Le dernier relevé d'une plante MUETTE (§ 7.3) : UNE lecture des statistiques à l'heure de Home Assistant, sur dix jours, pour le
 * sol et la pile — à l'ouverture de la fiche, muette seulement. `undefined` quand il n'y a rien à lire (vivante, ou sans accès au
 * serveur), EN_ATTENTE tant que rien n'est lu, 'erreur' si Home Assistant ne répond pas, sinon ce que `dernierReleve` en tire — ou
 * `null` : LU, et aucun relevé (une sonde à plat depuis plus de dix jours, un sol sans `state_class`). Les deux riens se distinguent
 * (passe bis du 17/10, point 3) : confondus, la fiche disait « Chargement… » sans fin. */
const EN_ATTENTE = 'attente';
function useDernierReleve(hass, muette, idSol, idPile) {
  const [lu, setLu] = useState({ cle: null, releve: null });
  const source = useRef(hass);
  source.current = hass;
  const sansWS = !hass || typeof hass.callWS !== 'function';
  const cle = muette && idSol ? idSol + '|' + (idPile || '') : null;
  useEffect(() => {
    const h = source.current;
    if (!cle || !h || typeof h.callWS !== 'function') return undefined;
    let vivant = true;
    new Promise((ok) => ok(h.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(Date.now() - 10 * 86400000).toISOString(),
      statistic_ids: [idSol, idPile].filter(Boolean), period: 'hour', types: ['mean'] })))
      .then((r) => { if (vivant) setLu({ cle, releve: dernierReleve(r, idSol, idPile) }); }, () => { if (vivant) setLu({ cle, releve: 'erreur' }); });
    return () => { vivant = false; };
  }, [cle, sansWS, idSol, idPile]);
  return !cle || sansWS ? undefined : lu.cle === cle ? lu.releve : EN_ATTENTE;
}

/* La barre d'une mesure (§ 7.3) : 8 px, la plage idéale en `rgba(--o-ok-rgb, .28)`, le repère de 4 px à la valeur. Le chiffre est écrit :
 * elle ne se lit pas. Une fonction, pas un composant : la fiche la pose dans son propre arbre. */
function barre(cle, valeur) {
  const b = barrePlante(cle, valeur);
  return (
    <div aria-hidden="true" style={{ position: 'relative', height: 8, marginTop: 8, borderRadius: 4, background: 'var(--o-s1)' }}>
      <span data-plage="" style={{ position: 'absolute', top: 0, bottom: 0, left: b.plage[0] + '%', width: (b.plage[1] - b.plage[0]) + '%', borderRadius: 4, background: 'rgba(var(--o-ok-rgb),.28)' }} />
      {b.pos != null && <span data-repere="" style={{ position: 'absolute', top: -2, left: b.pos + '%', width: 4, height: 12, marginLeft: -2, borderRadius: 2, background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-s3)' }} />}
    </div>
  );
}

/**
 * La fiche d'une plante. `pl` : la plante lue dans le `hass` vivant (`lirePlante`, App.jsx) — nom, pièce, sol, lumière,
 * température, engrais, pile, et ses capteurs (`ids`) ; `onFiche(id)` ouvre la fiche universelle de l'appareil ; `maintenant`
 * sert aux tests.
 */
export default function FichePlanteContent({ pl, hass, onFiche = null, maintenant = null }) {
  const S = (hass && hass.states) || {};
  const t = maintenant == null ? Date.now() : maintenant;
  const loc = locale();
  const v = vuePlante(pl, { quand: (ms) => quandPlante(ms, t, loc), deCelsius });
  const conseils = conseilsPlante(pl, { deCelsius });
  const ids = pl.ids || {};
  const releve = useDernierReleve(hass, v.muette, ids.hum || null, ids.bat || null);
  const uT = pl.uniteTemp || 'C';
  const P = PLAGES_PLANTE;
  // Les mesures (§ 7.3) : le libellé, la valeur, la plage idéale dans l'unité du capteur.
  const mesures = [
    { cle: 'hum', titre: tr('Humidité du sol'), valeur: pl.hum, ideal: tr('Idéal : {a} à {b} {u}', { a: P.hum[0], b: P.hum[1], u: '%' }) },
    { cle: 'lux', titre: tr('Lumière reçue'), valeur: pl.lux, ideal: tr('Idéal : {a} à {b} {u}', { a: nombre(P.lux[0], 0), b: nombre(P.lux[1], 0), u: 'lx' }) },
    { cle: 'temp', titre: tr('Température'), valeur: pl.temp, ideal: tr('Idéal : {a} à {b} {u}', { a: nombre(deCelsius(P.temp[0], uT), 0), b: nombre(deCelsius(P.temp[1], uT), 0), u: signeTemp(uT) }) },
    { cle: 'cond', titre: tr('Conductivité'), valeur: pl.cond, ideal: tr('Idéal : {a} à {b} {u}', { a: nombre(P.cond[0], 0), b: nombre(P.cond[1], 0), u: 'µS/cm' }) },
  ];
  const ecrite = Object.fromEntries(v.mesures.map(m => [m.cle, m]));
  const pile = pl.bat == null ? null : Math.round(pl.bat);
  const niveau = niveauPile(pile);
  const signal = dernierSignal(S, Object.values(ids).filter(Boolean));
  const plaque = { icone: 'leaf', fond: 'rgba(var(--o-ok-rgb),.14)', encre: 'var(--o-ok)' };
  const encre = v.ton === 'bad' ? 'var(--o-bad)' : v.ton === 'warn' ? 'var(--o-warn)' : 'var(--o-text2)';
  return (
    <div className="rb-fiche" data-plante="" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <EnteteFiche nom={pl.name} plaque={plaque} sousNom={[pl.room, tr('capteur de plante')].filter(Boolean).join(' · ')} />

      {/* Muette, le panneau porte le liseré qui respire (ADR 0048), « — » et « Indisponible depuis … ». */}
      <div className={v.muette ? 'o-panne' : undefined} style={{ ...PANNEAU, padding: 18, background: v.ton === 'warn' ? 'rgba(var(--o-warn-rgb),.06)' : 'var(--o-s3)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontWeight: 800, lineHeight: 1 }}>
          <span style={{ fontSize: 48, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums', color: v.sol == null ? 'var(--o-text3)' : 'var(--o-text)' }}>{v.sol == null ? '—' : nombre(v.sol, 0)}</span>
          <span style={{ fontSize: 20, color: 'var(--o-text2)' }}>{tr('% de sol')}</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 800, marginTop: 10, color: encre }}>{v.phrase}</div>
        {conseils.map(c => <div key={c} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text1)', marginTop: 4, lineHeight: 1.45 }}>{c}</div>)}
        {v.muette && releve !== undefined && (
          <div data-releve="" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text1)', marginTop: 4, lineHeight: 1.45 }}>
            {releve === EN_ATTENTE ? tr('Chargement…') : releve === 'erreur' ? tr('Historique indisponible pour le moment') : releve === null ? tr('Aucun relevé récent')
              : (tr('Dernier relevé {quand} : sol à {n} %', { quand: quandPlante(releve.quand, t, loc), n: nombre(releve.sol, 0) }) + ' ' + (releve.pile != null && releve.pile <= seuilsPile().alerte ? tr('Changez la pile.') : tr('Le capteur ne répond plus.')))}
          </div>
        )}
      </div>

      <div style={{ ...PANNEAU, overflow: 'hidden' }}>
        {mesures.map((m, i) => (
          <div key={m.cle} data-mesure={m.cle} style={{ padding: '12px 16px 14px', borderTop: filet(i) }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <span style={TITRE}>{m.titre}</span>
              <span style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: ecrite[m.cle].presse ? 'var(--o-warn)' : v.muette ? 'var(--o-text3)' : 'var(--o-text1)' }}>{ecrite[m.cle].valeur == null ? '—' : ecrite[m.cle].valeur}</span>
            </div>
            {barre(m.cle, v.muette ? null : m.valeur)}
            <span style={{ ...SOUS, marginTop: 6 }}>{m.ideal}</span>
          </div>
        ))}
      </div>

      <div style={{ ...PANNEAU, overflow: 'hidden' }}>
        <div style={RANGEE}>
          <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Pile du capteur')}</span>
          <span style={{ ...VALEUR, color: niveau ? couleurNiveau(niveau).col : pile == null ? 'var(--o-text3)' : 'var(--o-text1)' }}>{pile == null ? '—' : nombre(pile, 0) + '\u00a0%'}</span>
        </div>
        <div style={{ ...RANGEE, borderTop: filet(1) }}>
          <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Dernier signal')}</span>
          <span style={VALEUR}>{signal == null ? '—' : relTime(new Date(signal).toISOString())}</span>
        </div>
        {onFiche && (ids.hum || ids.cond) && (
          <button type="button" onClick={() => onFiche(ids.hum || ids.cond)} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>
    </div>
  );
}
