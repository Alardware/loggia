/* ── La fiche d'une prise (chantier Prises, § 3.5 à 3.8 ; sa maquette « Cartes
 * prises », cadres 1b à 1e ; ADR 0193, 0195, 0196) ────────────────────────────
 *
 * Une feuille SANS onglets : sa hauteur suit son contenu (la règle des
 * popups), elle défile au-delà.
 *  - Le panneau du haut : le grand chiffre, ou « Coupée » / « Indisponible »,
 *    la phrase longue du § 4, le cadenas et la bascule ; la confirmation d'une
 *    prise protégée qu'on coupe à la main (P5) ; l'encart d'une prise muette ;
 *    la courbe des 24 heures, le trait de l'heure, la bande de chaque cycle.
 *  - L'énergie : Aujourd'hui et Ce mois-ci, en kWh et en euros comptés heure
 *    par heure (P7), le compteur total et le tarif.
 *  - Les rangées : Protéger, Prévenir à la fin du cycle (l'électroménager),
 *    Ce qu'elle alimente, Minuteur, L'appareil. La configuration est réservée
 *    aux administrateurs (P4) : un compte ordinaire lit tout, et un appui dit
 *    le refus, qui nomme la clé.
 *  - Le Journal du jour : ce qui s'est passé depuis minuit, et qui (P9).
 * Chargée à la demande (`FichePrise`, App.jsx), elle n'importe jamais App.jsx :
 * la coquille lui passe la règle (`prise` : ses capteurs), sa pièce, l'épingle,
 * l'icône choisie pour sa carte, la bascule de la maison et l'ouverture de la
 * fiche universelle de l'appareil. Ce qui se calcule vit dans prisesfiche.js ;
 * la phrase, le chiffre et la courbe, dans prises.js — ceux de la carte.
 */
import { useState, useEffect, useRef, useCallback, cloneElement } from 'react';
import { tr, trSens, locale } from './i18n.js';
import { Fi, Bascule, ListeChoix } from './ui.jsx';
import { Ico } from './icones.jsx';
import { compteOrdinaire, enHaids, enPrix, LOGGIA_INDEX } from './state.js';
import { commanderService, estVanneCarte } from './actions.js';
import { lazyRecharge } from './recharge.js';
import { useOptimiste } from './optimiste.js';
import { ecrireRegle, raisonEchec, texteRefus } from './refus.js';
import { wattsDe, kwhDe } from './unites.js';
import { minuitLocal } from './jourstat.js';
import { coutHoraire } from './tarif.js';
import { TYPES_PRISE, NOMS_PRISE, ELECTROMENAGER, DEMANDE_PRISE_MS, typeDePrise, ligneDePrise, phrasePrise, puissancePrise, typeEcrit, kwhPrise, dureePrise } from './prises.js';
import { useEtatPrises, useMesuresPrise, prisesDe, gardeDePrise, finMinuteur, lireEtatPrises, poserEtatPrises, poserMinuteurs, rafraichirPrises, useHorloge } from './prisesetat.js';
import {
  courbeJournee, bandesCycles, ligneCycle, etiquetteW, texteConfirmation, estZigbee, patchProtegee, patchType, patchPrevenir, fusionPrises, optionsType,
  kwhParHeure, heuresAujourdhui, coutCycle, tarifsMaison, connexionsHeures, enDevise, ligneCompteur, DUREES_MINUTEUR, AJOUTS_MINUTEUR, journalDuJour, PASTILLES_QUI, VEILLE_MS, personnesDe, motQui,
} from './prisesfiche.js';
import { fileEcritures } from './voletsfiche.js';
import { EnteteFiche, PETITES_CAPITALES, filet } from './fichecommune.jsx';
import { LISERE } from './styles.js';

/* Le contenu de la popup d'une vanne (fichevanne.jsx), pour la prise désignée comme vanne d'eau : chargé à la demande, seulement
 * quand une fiche de prise s'ouvre sur elle (passe bis de l'étape 3 IoT, point 9). Par vanne.jsx, le MÊME morceau que la carte : un
 * morceau de plus pesait au démarrage (son adresse). */
const VanneDansPrise = lazyRecharge(() => import('./vanne.jsx').then((m) => ({ default: m.ContenuVanne })));

/* Les panneaux de sa maquette : le gris --o-s3, l'arrondi du thème, sans ombre, et le liseré du réglage « Liserés ». */
const PANNEAU = { background: 'var(--o-s3)', border: LISERE, borderRadius: 'var(--o-radius,18px)', boxSizing: 'border-box', minWidth: 0 };
const RANGEE = { display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box', padding: '12px 14px 12px 18px' };
const EN_BOUTON = { border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--o-text)', textAlign: 'left' };
const TITRE = { display: 'block', fontSize: 14, fontWeight: 700 };
const SOUS = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 };
const ALERTE = { fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' };
// Une puce de sa maquette (`ChipButton`) : 40 px de haut, le gris doux, sans bordure ; inerte à .4.
const PUCE = (peut = true) => ({ height: 40, padding: '0 8px', borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)', fontFamily: 'inherit',
  fontSize: 12, fontWeight: 700, minWidth: 0, whiteSpace: 'nowrap', opacity: peut ? 1 : 0.4, cursor: peut ? 'pointer' : 'default' });
const SOUS_RANGEE = { padding: '0 14px 12px 18px' };

// Ce qu'un compte ordinaire lit quand il touche un réglage : le refus, qui nomme la clé (P4).
const refusLecture = () => raisonEchec(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }), 'loggia_prises');
/* La série d'écritures se bâtit sur une configuration RELUE (le piège des volets : un patch sur un vieux
 * sondage). Et une relecture qui ÉCHOUE n'écrit RIEN (relecture finale, B6) : `protegees` part ENTIÈRE, remplace
 * la liste du serveur — un patch bâti sur un cache vide effaçait TOUTES les protections (« ne plus protéger »
 * envoyait `protegees: []`), bâti sur un cache de 15 s il ignorait celle qu'un autre appareil venait de poser.
 * Le magasin publie `erreur` pour une lecture ratée : on lève, la file n'envoie rien, la rangée touchée le dit.
 * Une réponse DÉPASSÉE par une plus fraîche (`rafraichirPrises()` rend null sans erreur) est un autre cas : le
 * cache est alors le plus frais, on le garde. */
const relireConfig = () => rafraichirPrises().then((r) => {
  if (r && r.config) return r.config;
  const { etat, erreur } = lireEtatPrises();
  if (!erreur && etat && etat.config) return etat.config;
  throw new Error('loggia/prises/etat : la configuration n’a pas pu être relue');
});

/* La bascule d'un réglage qu'un compte ordinaire LIT (P4 ; audit du 19/10, point 8) : celle de la maison (`Bascule`,
 * ui.jsx), dite inerte D'AVANCE — `aria-disabled`, le curseur ordinaire —, comme la rangée « Ce qu'elle alimente » ;
 * même apparence, et un appui dit le refus, qui nomme la clé. Rendue par `Bascule` elle-même : pas de copie qui dérive. */
function BasculeLue(props) {
  const b = Bascule(props);
  return cloneElement(b, { 'aria-disabled': 'true', style: { ...b.props.style, cursor: 'default' } });
}

function useVivant() {
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  return vivant;
}

/* Les heures du mois (§ 7, P7) : UNE lecture des statistiques horaires, du 1er à
 * 0 h à maintenant — ce que le compteur de la prise a compté (`change`) ET sa
 * puissance moyenne (`mean`), et ce qu'ont compté les compteurs des tarifs. Les
 * DEUX capteurs sont demandés : un compteur sans statistiques de somme (pas de
 * `state_class`) ne dit rien, et `kwhParHeure` retombe alors sur la puissance —
 * demandé seul, il laissait le mois retomber sur le jour (relecture finale, B2).
 * À l'ouverture de la fiche, puis toutes les 5 minutes.
 *
 * Rend les statistiques lues, ou null : rien n'est lu encore, OU la lecture a
 * ÉCHOUÉ (pas d'enregistreur, pas de droit, une coupure) — le mois, alors, ne se
 * déduit pas : « — », sans euros. Un échec n'est pas une lecture vide : le `{}`
 * d'avant, vrai, faisait du mois le jour, euros compris. Ce qu'on ne sait pas ne
 * s'invente pas. */
function useHeuresMois(hass, ids, debut) {
  const [stats, setStats] = useState(null);
  const source = useRef(hass);
  source.current = hass;
  const cle = [...new Set(ids)].join('|');
  useEffect(() => {
    let vivant = true;
    /* Un échec PASSAGER ne vide pas le mois (audit du 19/10, point 7) : « — » tant qu'aucune lecture n'a réussi ; ensuite,
     * la dernière lecture tient jusqu'à la suivante qui réussit — l'enregistreur qui hoquette une fois toutes les 5 minutes
     * ne fait plus clignoter « Ce mois-ci ». D'autres capteurs, un autre mois (`cle`, `debut`) : on repart de rien. */
    let reussie = false;
    setStats(null);
    const rate = () => { if (vivant && !reussie) setStats(null); };
    const lire = () => {
      const h = source.current;
      if (!cle || !h || typeof h.callWS !== 'function') { rate(); return; }
      // `new Promise` : un `callWS` qui lève avant de répondre est un échec comme un autre.
      new Promise((ok) => ok(h.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(debut).toISOString(), statistic_ids: cle.split('|'),
        period: 'hour', types: ['change', 'mean'], units: { power: 'W', energy: 'kWh' } })))
        .then((r) => {
          const lu = r && typeof r === 'object' && !Array.isArray(r) ? r : null;
          if (!lu) { rate(); return; }
          reussie = true;
          if (vivant) setStats(lu);
        }, rate);
    };
    lire();
    const t = setInterval(lire, 300000);
    return () => { vivant = false; clearInterval(t); };
  }, [cle, debut]);
  return stats;
}

/* La courbe des 24 heures (§ 3.6) : 400 × 110, les lignes à 0 et au plafond en
 * `--o-bd1`, l'aire à .22 de la teinte, la ligne de 2 px, le trait de l'heure
 * en pointillés ; à gauche (44 px) le plafond rond et « 0 », dessous 0 h, 6 h,
 * 12 h, 18 h, 24 h ; la bande de chaque cycle du jour, et la ligne du dernier.
 * Un capteur sans statistiques : « Pas de courbe pour cette prise ». */
function CourbeJournee({ points, watts, maintenant, tp, cycles, cycle, ligne }) {
  if (Array.isArray(points) && !points.length) {
    return <div style={{ ...SOUS, marginTop: 20 }}>{tr('Pas de courbe pour cette prise')}</div>;
  }
  const minuit = minuitLocal(maintenant);
  const lendemain = new Date(minuit).setDate(new Date(minuit).getDate() + 1);
  const c = courbeJournee(points, { watts, maintenant, minuit, lendemain });
  const bandes = bandesCycles(cycles, cycle, { minuit, lendemain, maintenant });
  const echelle = { fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' };
  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex' }}>
        <div aria-hidden="true" style={{ ...echelle, width: 44, flexShrink: 0, height: 110, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <span>{etiquetteW(c.max)}</span><span>0</span>
        </div>
        <svg aria-hidden="true" className="o-prise-journee" viewBox="0 0 400 110" preserveAspectRatio="none" style={{ flex: 1, minWidth: 0, height: 110, display: 'block', overflow: 'visible' }}>
          {bandes.map((b, i) => <rect key={i} x={b.x} y="0" width={b.l} height="110" rx="6" style={{ fill: 'rgba(' + tp.rgb + ',.12)' }} />)}
          <line x1="0" y1="0" x2="400" y2="0" vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--o-bd1)', strokeWidth: 1 }} />
          <line x1="0" y1="110" x2="400" y2="110" vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--o-bd1)', strokeWidth: 1 }} />
          {c.aire && <path d={c.aire} style={{ fill: 'rgba(' + tp.rgb + ',.22)' }} />}
          {c.ligne && <path d={c.ligne} vectorEffect="non-scaling-stroke" style={{ fill: 'none', stroke: tp.col, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }} />}
          <line x1={c.x} y1="0" x2={c.x} y2="110" vectorEffect="non-scaling-stroke" style={{ stroke: 'var(--o-text3)', strokeWidth: 1, strokeDasharray: '3 3' }} />
        </svg>
      </div>
      <div aria-hidden="true" style={{ ...echelle, marginLeft: 44, marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
        {[0, 6, 12, 18, 24].map(h => <span key={h}>{tr('{h} h', { h })}</span>)}
      </div>
      {ligne && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)', marginTop: 10 }}>{ligne}</div>}
    </div>
  );
}

/* Ce que le Journal du jour lit (§ 8) : le logbook de Home Assistant pour le
 * switch, avec ses contextes, depuis la VEILLE — 24 h avant minuit (F1, `VEILLE_MS`) :
 * le journal ne montre que les lignes d'aujourd'hui, mais il lui faut le dernier état
 * d'hier pour dire « De retour » d'une prise muette depuis 23:00, et ne pas faire d'une
 * reprise après un redémarrage un geste ; et le journal de Loggia qui le nomme
 * (`loggia/volets/manoeuvres`, réutilisée telle quelle — le contrat du plan 1), depuis
 * minuit : les cycles, la pose d'un minuteur, les gestes des règles. À l'ouverture,
 * quand la prise change (`cle`), puis toutes les minutes.
 *
 * Rend `{ evenements, lignes }` — null tant que rien n'est lu. Une lecture qui
 * échoue ne compte pas pour « rien » (relecture finale, B4) :
 *  - le logbook illisible : `evenements` vaut null, et le journal le DIT — « Rien
 *    depuis minuit. » aurait affirmé une journée calme qu'on n'a pas vue ;
 *  - le journal de Loggia illisible : `lignes` est vide, et le journal montre ce
 *    que dit le logbook (les cycles et la pose d'un minuteur y manquent, le « qui »
 *    retombe sur les contextes de Home Assistant). */
function useJournalDuJour(hass, id, minuit, cle) {
  const [lu, setLu] = useState(null);
  const source = useRef(hass);
  source.current = hass;
  /* La dernière lecture RÉUSSIE de chaque source, pour cette prise et ce jour (audit du 19/10, point 7) : un échec passager
   * la garde — « Le journal n'a pas pu être lu. » ne se dit que tant qu'aucune lecture n'a réussi. Elle survit aux
   * relectures que déclenche un changement d'état (`cle`) ; une autre prise, un autre jour, et l'on repart de rien. */
  const dernier = useRef({ ou: null, evenements: null, lignes: null });
  useEffect(() => {
    let vivant = true;
    const ou = id + '|' + minuit;
    if (dernier.current.ou !== ou) dernier.current = { ou, evenements: null, lignes: null };
    const memo = dernier.current;
    const lire = () => {
      const h = source.current;
      if (!h || typeof h.callWS !== 'function') { setLu({ evenements: memo.evenements, lignes: memo.lignes || [] }); return; }
      // `new Promise` : un `callWS` qui lève avant de répondre est un échec comme un autre.
      const appeler = (msg) => new Promise((ok) => ok(h.callWS(msg))).catch(() => null);
      Promise.all([
        appeler({ type: 'logbook/get_events', start_time: new Date(minuit - VEILLE_MS).toISOString(), entity_ids: [id] }),
        appeler({ type: 'loggia/volets/manoeuvres', entity_id: id, depuis: Math.floor(minuit / 1000) }),
      ]).then(([evenements, r]) => {
        if (Array.isArray(evenements)) memo.evenements = evenements;
        if (r && Array.isArray(r.lignes)) memo.lignes = r.lignes;
        if (vivant) setLu({ evenements: memo.evenements, lignes: memo.lignes || [] });
      });
    };
    lire();
    const t = setInterval(lire, 60000);
    return () => { vivant = false; clearInterval(t); };
  }, [id, minuit, cle]);
  return lu;
}

/* Le Journal du jour (§ 3.9) : son titre en petites capitales ; l'heure sur
 * 52 px en 13 px / 800, quoi en 13 px / 700, une note en 11,5 px, et qui —
 * une pastille au glyphe du § 8. Sur une feuille étroite, la pastille passe
 * sous le texte (`o-prise-journal`, index.css). « Rien depuis minuit. » ;
 * un logbook qu'on n'a pas pu lire (`lu.evenements` nul) le dit, après les lignes
 * de Loggia s'il y en a : « Le journal n'a pas pu être lu. » */
export function JournalDuJour({ lu, minuit, personnes = null }) {
  const illisible = !!lu && lu.evenements == null;
  // `personnes` (B5 de l'audit du 19/10) : qui est derrière un compte Home Assistant — la pastille dit son nom.
  const lignes = lu ? journalDuJour({ evenements: lu.evenements || [], lignes: lu.lignes, minuit, personnes }) : null;
  const qui = PASTILLES_QUI();
  const heure = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const note = (texte) => <div style={{ ...SOUS, marginTop: 10 }}>{texte}</div>;
  return (
    <div className="o-prise-journal" style={{ ...PANNEAU, padding: '14px 18px' }}>
      <div style={PETITES_CAPITALES}>{tr('Journal du jour')}</div>
      {lignes == null ? <div style={{ ...SOUS, marginTop: 10 }}>{tr('Chargement…')}</div>
        : !lignes.length ? note(illisible ? tr('Le journal n’a pas pu être lu.') : tr('Rien depuis minuit.'))
          : (<>
            {lignes.map((l, i) => (
              <div key={l.t + '-' + i} className="o-prise-journal-ligne" style={{ padding: '10px 0', borderTop: filet(i) }}>
                <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{heure(l.t)}</span>
                <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{l.quoi}</span>
                  {l.note && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{l.note}</span>}</span>
                <span data-qui="" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: 'var(--o-s1)', fontSize: 11.5, fontWeight: 800 }}>
                  <Fi i={qui[l.qui][1]} size={11} />{motQui(l, qui)}</span>
              </div>))}
            {illisible && note(tr('Le journal n’a pas pu être lu.'))}
          </>)}
    </div>
  );
}

/* Une tuile de l'énergie (§ 3.7) : le titre en petites capitales, les kWh en 20 px / 800 — l'unité en 12 :
 * « 123,4 kWh » d'un bloc prenait 108 px des 99 d'une tuile au téléphone de 320 px —, les euros en 12 px. */
function TuileEnergie({ titre, kwh, euros }) {
  const ecrit = kwh == null ? null : kwhPrise(kwh);
  return (
    <div style={{ ...PANNEAU, padding: '14px 16px' }}>
      <div style={PETITES_CAPITALES}>{titre}</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{ecrit == null ? '—'
        : <>{ecrit.slice(0, ecrit.lastIndexOf(' '))}<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>{ecrit.slice(ecrit.lastIndexOf(' '))}</span></>}</div>
      {euros && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{euros}</div>}
    </div>
  );
}

/**
 * `prise` : `{ puissance, energie }`, les capteurs que la règle lui donne ;
 * `piece` : le nom de sa pièce ; `epingle` : son épingle ; `glyphe(defaut)` :
 * l'icône choisie pour sa carte autour du glyphe de l'appareil ; `bascule` : la
 * bascule de la maison (`RmBascule`) ; `onFiche(id)` ouvre la fiche
 * universelle de l'appareil ; `maintenant` sert aux tests.
 */
export default function FichePriseContent({ hass, id, prise = null, piece = null, epingle = null, glyphe = null, bascule: Interrupteur, onFiche = null, maintenant = null }) {
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const capteurs = prise || { puissance: null, energie: null };
  const t = maintenant == null ? Date.now() : Number(maintenant);
  const { etat, minuteurs } = useEtatPrises(true, { rapide: true });
  const jour = useMesuresPrise(capteurs.puissance, capteurs.energie, true);
  const vivant = useVivant();
  const [file] = useState(() => fileEcritures(relireConfig));
  const [ov, poserOv] = useOptimiste(st ? st.state : null);
  const [demande, setDemande] = useState(false);
  const [err, setErr] = useState(null);
  const [errMinuteur, setErrMinuteur] = useState('');
  // Un appel du minuteur est parti : les puces attendent sa réponse (B3). Le drapeau en `ref` garde aussi deux appuis dans le même tour.
  const [minuteurEnVol, setMinuteurEnVol] = useState(false);
  const volMinuteur = useRef(false);
  const racine = useRef(null);
  const config = (etat && etat.config) || null;
  const [ovCfg, poserOvCfg] = useOptimiste(config ? JSON.stringify(config) : null);
  const debutMois = new Date(new Date(t).getFullYear(), new Date(t).getMonth(), 1).getTime();
  const EN = enHaids();
  const num = (x) => { const s = x && S[x]; const n = s ? parseFloat(s.state) : NaN; return isFinite(n) ? n : null; };
  const tarifs = tarifsMaison(EN, enPrix(), num);
  // Le compteur ET la puissance (B2) : sans statistiques de somme, le compteur ne dit rien, et la puissance fait le mois.
  const heures = useHeuresMois(hass, [capteurs.energie, capteurs.puissance, ...tarifs.map(x => x.compteur)].filter(Boolean), debutMois);
  const journal = useJournalDuJour(hass, id, minuitLocal(t), st ? st.last_changed : null);
  /* La demande se défait : le focus qui y était revient à la bascule, AVANT que ses boutons ne
   * disparaissent (relecture des volets : jamais sur <body>). */
  const defaire = useCallback(() => {
    const el = racine.current;
    const pied = el && el.querySelector('[data-demande]');
    if (pied && typeof document !== 'undefined' && pied.contains(document.activeElement)) { const b = el.querySelector('[role="switch"]'); if (b) b.focus(); }
    setDemande(false);
  }, []);
  /* La demande prend le focus (Annuler) et se défait seule au bout de 6 s, comme celle de la carte (B5) :
   * une question qu'on laisse en plan ne doit pas attendre qu'une automatisation rallume la prise. */
  useEffect(() => {
    if (!demande) return undefined;
    const b = racine.current && racine.current.querySelector('[data-annuler]');
    if (b) b.focus();
    const minuterie = setTimeout(defaire, DEMANDE_PRISE_MS);
    /* Échap défait la question, comme sur la compacte et le gros interrupteur — et SEULEMENT elle (audit du 19/10, point 9) :
     * la feuille ferme sur Échap et arrête l'événement (ui.jsx), un écouteur ordinaire de `document` ne l'entendrait jamais.
     * Écouté à la CAPTURE, il passe avant elle et l'arrête : la question part, la fiche reste ouverte. */
    const echap = (ev) => { if (ev.key !== 'Escape') return; if (ev.stopPropagation) ev.stopPropagation(); if (ev.preventDefault) ev.preventDefault(); defaire(); };
    if (typeof document !== 'undefined') document.addEventListener('keydown', echap, true);
    return () => { clearTimeout(minuterie); if (typeof document !== 'undefined') document.removeEventListener('keydown', echap, true); };
  }, [demande, defaire]);

  const e = prisesDe(etat, id);
  const cfg = ovCfg ? JSON.parse(ovCfg) : config;
  const nom = (st && st.attributes && st.attributes.friendly_name) || id;
  const muette = !st || st.state === 'unavailable' || st.state === 'unknown';
  const enAvance = !muette && ov != null && ov !== (st.state === 'on');
  const vu = enAvance ? { ...st, state: ov ? 'on' : 'off', last_changed: new Date(t).toISOString() } : st;
  const on = !muette && vu.state === 'on';
  /* Le type : celui qu'on impose ; sinon celui que retient le serveur (il ne se
   * redevine pas ici) — sauf pendant l'avance d'un « Deviner d'après le nom »,
   * où le serveur dit encore l'ancien : le nom, alors, comme lui le fera. */
  const impose = !!(cfg && cfg.types && cfg.types[id]);
  const type = impose ? cfg.types[id] : (!ovCfg && e && TYPES_PRISE[e.type]) ? e.type : typeDePrise(nom, null, id);
  const tp = TYPES_PRISE[type] || TYPES_PRISE.prise;
  /* La protection (P5, B1) : `protegee` ne vaut que pour une protection CONNUE — elle seule met le cadenas et
   * dit « · protégée » —, avec l'avance d'un geste de cette fiche ; `garde` est ce que couper à la main doit
   * DEMANDER : protégée, OU protection pas encore lue (aucune lecture n'a réussi). Dans le doute, on demande, comme la
   * carte (`gardeDePrise`, prisesetat.js, la règle qu'elles partagent) : un appui de trop vaut mieux que le NAS coupé d'un seul. */
  const g = gardeDePrise(etat, id);
  const protegee = cfg ? (cfg.protegees || []).includes(id) : g.protegee;
  const garde = protegee || g.inconnu;
  const prevenir = cfg ? !!(cfg.prevenir || {})[id] : !!(e && e.prevenir);
  /* « Prévenir à la fin du cycle » ne se propose que si le serveur SUIT le cycle de cette prise (audit du 19/10, point 1) :
   * `suivi`, le mot du serveur ; sans lui (un serveur d'avant), la prise qui a un capteur de puissance — sans courbe, pas
   * de cycle, et la bascule promettait une alerte qui ne partirait jamais. */
  const suivi = e && typeof e.suivi === 'boolean' ? e.suivi : !!capteurs.puissance;
  const brut = capteurs.puissance && S[capteurs.puissance] ? wattsDe(S[capteurs.puissance]) : null;
  const watts = on && brut != null ? brut : null;
  // Une fin déjà passée n'est plus un minuteur (point 5) : « Se coupe à 20:40 · dans 0 min » le temps que le sondage l'apprenne.
  const fin = finMinuteur(minuteurs, id, t);
  // Le minuteur se décompte à la seconde (20/10), comme dans la fiche d'une lampe : la fiche bat tant qu'il tourne.
  useHorloge(maintenant == null && !!fin && on);
  const ligne = ligneDePrise({ st: vu, mesure: !!capteurs.puissance, watts: brut, minuteur: fin, cycle: e && e.cycle, cycles: e ? e.cycles : [], type, maintenant: t });
  const ordinaire = compteOrdinaire(hass);
  const devise = (hass && hass.config && hass.config.currency) || 'EUR';

  // L'interrupteur : le geste d'abord ; allumée et gardée — protégée, ou protection pas encore lue —, il demande (P5).
  const commanderPrise = (allumer) => { poserOv(allumer); commanderService(hass, id, 'homeassistant', allumer ? 'turn_on' : 'turn_off', { entity_id: id }); };
  const toucher = () => { if (on && garde) setDemande(true); else commanderPrise(!on); };
  // Coupée ou muette entre-temps, la question n'a plus d'objet : elle ne doit pas attendre, tapie, qu'une automatisation rallume la prise (B5).
  useEffect(() => { if (demande && !on) setDemande(false); }, [demande, on]);

  /* Écrire la configuration (P2, P4, P6) : l'avance se montre tout de suite ;
   * le patch se bâtit au moment d'écrire, dans la file de la fiche — sur la
   * configuration relue avant la première écriture d'une série, puis sur celle
   * que rend la précédente ; `protegees` part ENTIÈRE. La réponse porte l'état
   * entier, qui remplace le cache. `ou` : la rangée touchée, où se dit un refus.
   *
   * Une relecture qui échoue n'écrit rien (B6, `relireConfig`) : la file rend alors
   * une promesse rejetée — l'avance s'annule, et la rangée touchée dit l'échec. */
  const ecrire = (ou, fabriquer) => {
    if (ordinaire) { setErr({ ou, texte: refusLecture() }); return; }
    const avance = fabriquer(cfg || {});
    poserOvCfg(JSON.stringify(fusionPrises(cfg || {}, avance)));
    setErr(null);
    file(fabriquer, (patch) => ecrireRegle(hass, 'loggia/prises/config', patch, { cle: 'loggia_prises', annuler: () => poserOvCfg(null),
      signaler: (x) => { if (vivant.current) setErr({ ou, texte: raisonEchec(x, 'loggia_prises') }); } }))
      .then((r) => { if (r && r.etat) poserEtatPrises(r.etat); },
        (x) => { poserOvCfg(null); if (vivant.current) setErr({ ou, texte: raisonEchec(x, 'loggia_prises') }); });
  };
  const alerte = (ou) => (err && err.ou === ou ? <div role="alert" style={{ ...ALERTE, ...SOUS_RANGEE }}>{err.texte}</div> : null);
  /* Un ordre au minuteur (B3). Le serveur AJOUTE le temps à ce qui reste (`poser`, `prolonger`) : deux
   * appuis sur « 30 min » posaient donc 60 min. Une seule demande en vol à la fois — toutes les puces
   * attendent sa réponse, et le minuteur qu'elle rend remplace la rangée. */
  const minuteur = (msg) => {
    if (volMinuteur.current || !hass || typeof hass.callWS !== 'function') return;
    volMinuteur.current = true;
    setMinuteurEnVol(true);
    setErrMinuteur('');
    // Que la réponse soit bonne, refusée ou perdue, les puces reprennent la main.
    const fini = () => { volMinuteur.current = false; if (vivant.current) setMinuteurEnVol(false); };
    // `new Promise` : un `callWS` qui lève avant de répondre est un échec comme un autre.
    new Promise((ok) => ok(hass.callWS(msg))).then((r) => { if (r && r.minuteurs) poserMinuteurs(r); },
      // Un refus nommé se dit par son code (`minuteur_deja_eteint` : la prise coupée entre-temps, le sondage ne le savait pas encore).
      (x) => { if (vivant.current) setErrMinuteur(x && x.code === 'unauthorized' ? tr('Ce compte ne pilote pas cet appareil.') : texteRefus(x) || tr('Le minuteur n’a pas pu être enregistré.')); })
      .then(fini, fini);
  };

  // L'énergie : le jour des mesures sur 5 minutes (le chiffre de la carte), le mois des heures d'avant minuit, plus le jour.
  const minuit = minuitLocal(t);
  const mesures = capteurs.puissance || capteurs.energie;
  const parHeure = heures ? kwhParHeure(heures, capteurs.energie, capteurs.puissance) : [];
  const dHeures = heuresAujourdhui(parHeure, jour.kwh, { minuit, maintenant: t });
  const avant = heures ? parHeure.filter(h => h.debut >= debutMois && h.debut < minuit) : null;
  const moisKwh = avant && jour.kwh != null ? avant.reduce((s, h) => s + h.kwh, 0) + jour.kwh : null;
  const connexions = heures ? connexionsHeures(tarifs, heures) : connexionsHeures(tarifs, {});
  const cout = (kwhs) => { const v = coutHoraire(kwhs, connexions); return v == null ? null : enDevise(v, devise); };
  const totalCompteur = capteurs.energie && S[capteurs.energie] ? kwhDe(S[capteurs.energie]) : null;
  // Le cycle se paie comme la tuile (B9) : heure par heure, d'après ce que la puissance a compté dans chaque heure du cycle.
  const ligneDuCycle = ligneCycle(e ? e.cycles : [], t, (c) => { const v = coutCycle(c, connexions, jour.points); return v == null ? null : enDevise(v, devise); });

  // La plaque, comme celle de la carte : la teinte de l'appareil allumée, le gris coupée, le gris éteint muette.
  const plaque = { icone: 'bolt', fond: muette || !on ? 'var(--o-s1)' : 'rgba(' + tp.rgb + ',.18)', encre: muette ? 'var(--o-text3)' : on ? tp.col : 'var(--o-text2)' };
  const dessin = tp.ico ? <Ico name={tp.ico} size={18} /> : null;
  plaque.glyphe = typeof glyphe === 'function' ? glyphe(dessin) : dessin;
  const { v: chiffre, u: unite } = puissancePrise(watts);
  /* Un mot en grand — « Coupée », « Indisponible » — : 34 px, moins quand la place manque, d'après sa
   * longueur et la largeur du bloc (une requête de conteneur) : « Niedostępny » prenait 214 px des 176 du
   * téléphone de 320 px, sous la bascule (mesuré). */
  const motGrand = (mot, couleur) => <span style={{ fontSize: 'clamp(20px, calc(100cqi / (0.64 * ' + Math.max(1, mot.length) + ')), 34px)', fontWeight: 800, color: couleur }}>{mot}</span>;
  // « Indisponible » d'une prise a SA clé (point 11e) : le polonais la dit au neutre, « Niedostępne », comme la carte.
  const grand = muette ? motGrand(trSens('Indisponible · prise'), 'var(--o-bad)')
    : !on ? motGrand(tr('Coupée'), 'var(--o-text2)')
      : watts == null ? motGrand(tr('Allumée'), 'var(--o-text)')
        : <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}><span style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>{chiffre}</span><span style={{ fontSize: 22, fontWeight: 800 }}>{unite}</span></span>;
  const phrase = phrasePrise(ligne, { longue: true, maintenant: t }) + (protegee && ligne.ligne > 2 ? ' · ' + tr('protégée') : '');
  const enDemande = demande && on;
  /* La protection pas encore lue (point 10) : la fiche demande par prudence — et le DIT, au lieu de demander sans raison. */
  const prudence = g.inconnu && !protegee;
  const B = ordinaire ? BasculeLue : Bascule;
  const choixType = impose ? type : 'deviner';
  const valeurType = (NOMS_PRISE()[type] || NOMS_PRISE().prise) + (impose ? '' : ' ' + tr('(deviné)'));
  /* La prise désignée comme vanne d'eau (Paramètres › Alertes, « Quelle vanne » ; passe bis de l'étape 3 IoT, point 9) n'a pas de
   * fiche de prise : sa bascule la rallumait d'un appui. La recherche, une carte posée avant que la configuration soit lue, ou un
   * appui qui voulait la rallumer (actions.js) ouvrent cette fiche : elle montre la popup de la vanne, SUR sa question (qui ne se
   * pose que si la vanne est fermée). Après les crochets de la prise : leur ordre ne change pas. */
  if (estVanneCarte(id)) return <VanneDansPrise id={id} hass={hass} epingle={epingle} onFiche={onFiche} question />;
  return (
    <div ref={racine} className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EnteteFiche nom={nom} epingle={epingle} plaque={plaque} sousNom={[piece, typeEcrit(type)].filter(Boolean).join(' · ')} />

      <div style={{ ...PANNEAU, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0, containerType: 'inline-size' }}>
            <div style={{ lineHeight: 1.1 }}>{grand}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>{phrase}</div>
          </div>
          {protegee && <span role="img" aria-label={tr('Protégée')} title={tr('Protégée')} style={{ display: 'flex', alignItems: 'center', height: 26, color: 'var(--o-text3)' }}><Fi i="lock" size={12} /></span>}
          {Interrupteur && <Interrupteur on={on} nom={nom} onToggle={toucher} inerte={muette} />}
        </div>
        {enDemande && (
          <div role="group" aria-label={tr('Couper la prise ?')} data-demande="" style={{ marginTop: 16, padding: 14, borderRadius: 14, background: 'rgba(var(--o-bad-rgb),.08)', border: '1px solid rgba(var(--o-bad-rgb),.35)' }}>
            {prudence && <div style={{ ...SOUS, marginTop: 0, marginBottom: 6 }}>{tr('Protection inconnue : Loggia demande par prudence.')}</div>}
            <div style={{ fontSize: 13, fontWeight: 700 }}>{texteConfirmation(type, nom, watts)}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {/* Sur deux lignes plutôt que coupés : « Trotzdem abschalten » ne tient pas sur une au téléphone. */}
              <button type="button" data-annuler="" onClick={defaire} style={{ ...PUCE(), flex: 1, whiteSpace: 'normal', lineHeight: '14px' }}>{tr('Annuler')}</button>
              <button type="button" onClick={() => { defaire(); commanderPrise(false); }} style={{ ...PUCE(), flex: 1, whiteSpace: 'normal', lineHeight: '14px', color: 'var(--o-bad)' }}>{tr('Couper quand même')}</button>
            </div>
          </div>
        )}
        {muette && (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: 'var(--o-s1)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--o-bad)', display: 'flex', marginTop: 1 }}><Fi i="signal-alt-slash" size={14} /></span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)' }}>
              {(estZigbee(LOGGIA_INDEX, id) ? tr('Vérifiez qu’elle est branchée et à portée du réseau Zigbee.') : tr('Vérifiez qu’elle est branchée et à portée du réseau.')) + ' ' + tr('Loggia la reprendra dès qu’elle répond.')}
            </span>
          </div>
        )}
        {capteurs.puissance && <CourbeJournee points={jour.points} watts={watts} maintenant={t} tp={tp} cycles={e ? e.cycles : []} cycle={e && e.cycle} ligne={ligneDuCycle} />}
      </div>

      {mesures && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
            <TuileEnergie titre={tr('Aujourd’hui')} kwh={jour.kwh} euros={jour.kwh == null ? null : cout(dHeures)} />
            <TuileEnergie titre={tr('Ce mois-ci')} kwh={moisKwh} euros={moisKwh == null ? null : cout([...avant, ...dHeures])} />
          </div>
          {/* « Estimés d'après la puissance » dès que les kWh du jour viennent de la courbe (F6) : pas de compteur, OU un compteur sans
            * statistiques de somme (`mesuresDe` : `estime`). `!capteurs.energie` garde la ligne dès le premier rendu d'une prise sans compteur. */}
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 8 }}>{ligneCompteur({ total: totalCompteur, estime: jour.estime || !capteurs.energie, tarifs, devise })}</div>
        </div>
      )}

      <div style={{ ...PANNEAU, overflow: 'hidden' }}>
        <div style={RANGEE}>
          {/* Ce que la protection couvre, dit honnêtement (point 11a) : les gestes de Loggia — pas la voix ni les automatisations. */}
          <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Protéger')}</span>
            <span style={SOUS}>{protegee ? tr('Demande avant de couper depuis Loggia') : prudence ? tr('Protection inconnue : Loggia demande par prudence.') : tr('Coupe sans demander')}</span>
            {protegee && <span style={{ ...SOUS, fontWeight: 600, color: 'var(--o-text3)' }}>{tr('L’assistant vocal et les automatisations de Home Assistant ne demandent pas.')}</span>}</span>
          <B on={protegee} nom={tr('Protéger')} cb={() => ecrire('proteger', (c) => patchProtegee(c, id, !protegee))} />
        </div>
        {alerte('proteger')}
        {ELECTROMENAGER.includes(type) && suivi && (<>
          <div style={{ ...RANGEE, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('Prévenir à la fin du cycle')}</span>
              <span style={SOUS}>{tr('Une notification quand il a fini')}</span>
              {etat && !etat.notifier && <span style={{ ...SOUS, color: 'var(--o-warn)', fontWeight: 700 }}>{tr('Choisissez le téléphone dans Paramètres › Alertes')}</span>}</span>
            <B on={prevenir} nom={tr('Prévenir à la fin du cycle')} cb={() => ecrire('prevenir', () => patchPrevenir(id, !prevenir))} />
          </div>
          {alerte('prevenir')}
        </>)}
        {(() => {
          const corps = (<>
            <span style={{ flex: '1 1 110px', minWidth: 'min-content' }}><span style={TITRE}>{tr('Ce qu’elle alimente')}</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto', minWidth: 0, maxWidth: '100%' }}>
              <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'normal', textAlign: 'right' }}>{valeurType}</span>
              <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
            </span>
          </>);
          const style = { ...RANGEE, ...EN_BOUTON, borderTop: filet(1), flexWrap: 'wrap', rowGap: 4 };
          return ordinaire
            ? <button type="button" aria-disabled="true" onClick={() => setErr({ ou: 'type', texte: refusLecture() })} style={{ ...style, cursor: 'default' }}>{corps}</button>
            : <ListeChoix value={choixType} options={optionsType()} recherche={false} onChange={(x) => ecrire('type', () => patchType(id, x === 'deviner' ? null : x))}
              label={tr('Ce qu’elle alimente')} nom={tr('{a} : {b}', { a: tr('Ce qu’elle alimente'), b: valeurType })} style={{ ...style, width: '100%' }}>{() => corps}</ListeChoix>;
        })()}
        {alerte('type')}
        {(() => {
          /* Le minuteur qui tourne ne se montre que sur une prise ALLUMÉE (B3) : le serveur l'annule quand elle
           * passe à `off` (minuteurs.py), mais le sondage de la fiche ne le sait qu'au tour suivant — 15 s pendant
           * lesquelles « +1 h » aurait posé un minuteur neuf sur une prise coupée, qui la couperait de nouveau
           * une fois rallumée. Coupée, la rangée redit « Disponible une fois la prise allumée. », puces inertes.
           * Et toutes les puces attendent la réponse d'un appel en vol : le serveur AJOUTE à ce qui reste. */
          const enMarche = fin && on;
          const libre = !minuteurEnVol;
          const inerte = (peut) => (peut ? undefined : true);
          return (
            <div style={{ ...RANGEE, borderTop: filet(1), flexDirection: 'column', alignItems: 'stretch' }}>
              <span><span style={TITRE}>{tr('Minuteur')}</span>
                <span style={SOUS}>{enMarche ? phrasePrise({ ligne: 3, fin }, { longue: true, maintenant: t }) : on ? tr('Coupe la prise au bout du temps choisi.') : tr('Disponible une fois la prise allumée.')}</span></span>
              {enMarche ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {AJOUTS_MINUTEUR.map(n => <button key={n} type="button" aria-disabled={inerte(libre)} onClick={() => { if (libre) minuteur({ type: 'loggia/minuteurs/poser', entity_id: id, minutes: n }); }} style={PUCE(libre)}>{'+' + dureePrise(n)}</button>)}
                  <button type="button" aria-disabled={inerte(libre)} onClick={() => { if (libre) minuteur({ type: 'loggia/minuteurs/annuler', entity_id: id }); }} style={{ ...PUCE(libre), marginLeft: 'auto' }}>{tr('Annuler')}</button>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
                  {DUREES_MINUTEUR.map(n => <button key={n} type="button" aria-disabled={inerte(on && libre)} onClick={() => { if (on && libre) minuteur({ type: 'loggia/minuteurs/poser', entity_id: id, minutes: n }); }} style={PUCE(on && libre)}>{dureePrise(n)}</button>)}
                </div>
              )}
              {errMinuteur && <div role="alert" style={ALERTE}>{errMinuteur}</div>}
            </div>
          );
        })()}
        {onFiche && (
          <button type="button" onClick={() => onFiche(id)} style={{ ...RANGEE, ...EN_BOUTON, borderTop: filet(1) }}>
            <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{tr('L’appareil')}</span><span style={SOUS}>{tr('L’épingle, les commandes et toutes ses entités')}</span></span>
            <Fi i="angle-small-right" size={16} color="var(--o-text3)" />
          </button>
        )}
      </div>

      <JournalDuJour lu={journal} minuit={minuit} personnes={personnesDe(S)} />
    </div>
  );
}
