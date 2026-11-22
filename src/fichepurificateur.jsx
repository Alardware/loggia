/* La fiche d'un PURIFICATEUR d'air (sa consigne du 21/11, ADR 0387) — chargée à la demande par `FichePurificateur`
 * (appareils/fiches.jsx).
 *
 * Une feuille à onglets sur le modèle du poêle : Accueil, Planning, Filtre (s'il publie la vie de son filtre), Historique.
 * L'Accueil porte la scène qu'il a voulu garder telle quelle — le halo qui respire, les particules aspirées vers le disque, les
 * quatre pales en moulinet qui tournent au rythme du ventilateur —, la rangée des modes et des vitesses, les actions rapides,
 * puis les lignes de l'appareil. Tout ce qui se calcule vit dans `purificateur.js` ; ici, le dessin, aux briques des fiches
 * (`fichecommune.jsx`, `fichekit.js`) et aux jetons du thème. Rien ne part que sur un geste.
 */
import { useState, useEffect, useRef, useId, useSyncExternalStore } from 'react';
import { tr, locale } from './i18n.js';
import { LOGGIA_INDEX, compteOrdinaire } from './state.js';
import { commanderService } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { relTime } from './format.js';
import { Fi, Bascule } from './ui.jsx';
import { chargeAllumage } from './ventilo.js';
import { nomJour } from './robots.js';
import { raisonEchec, texteRefus } from './refus.js';
import { magasin, abonnerMinuteurs, lireMinuteurs, ecouterMinuteurs, poserMinuteurs } from './prisesetat.js';
import { decalageServeur, resteMinuteur, decompte } from './minuteur.js';
import { EnteteFiche, FicheOnglets, PanneauOnglet, PETITES_CAPITALES, filet, focaliser, BoutonConfirme, useHistoriquePeriode, PasAPas } from './fichecommune.jsx';
import { vitesseVoisine } from './reglagesair.js';
import { PANNEAU, RANGEE, EN_BOUTON, TITRE, SOUS, ALERTE } from './fichekit.js';
import {
  vuePurificateur, PARTICULES, NIVEAUX, motNiveau, couleurNiveau, niveauDeLAir, modesPlanning, modeDe, hhmm, semaineType, journeePropre,
  plageEnCours, prochainChangement, phraseProchain, ajouterPlage, deplacerPlage, peutDeplacer, retirerPlage, modePlage, copierJour, bandesJour,
  escalierAir, pireNiveau, evenementsJour, suiteMinuterie,
} from './purificateur.js';

const LISTE = { ...PANNEAU, overflow: 'hidden' };
// Les trois voies d'entrée des particules (index.css, `pu-entre1` à 3) : écrites en entier, que la chasse aux classes mortes les lise.
const VOIES = ['pu-pt pu-p1', 'pu-pt pu-p2', 'pu-pt pu-p3'];
const VALEUR = { fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap' };
// Une teinte du niveau, en transparence : `color-mix`, jamais une valeur écrite (la garde du thème ne voit que les jetons).
const mix = (c, p) => 'color-mix(in srgb, ' + c + ' ' + p + '%, transparent)';
// Le puits des choix segmentés (tests/puces_segmentees.test.mjs) : le choisi en bleu plein, texte blanc.
const PUITS = { display: 'grid', gap: 4, padding: 4, borderRadius: 14, background: 'var(--o-well)' };
// Cinq pilules sur une ligne au téléphone : « Ⓐ Auto » demande 52 px, d'où le rembourrage de 2 px et l'écart de 4.
const PUCE = (on, peut = true) => ({ minHeight: 44, padding: '0 2px', borderRadius: 10, border: 'none', cursor: peut ? 'pointer' : 'default', fontFamily: 'inherit',
  fontSize: 12.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minWidth: 0, opacity: peut ? 1 : 0.4,
  background: on ? 'var(--o-accent-fond)' : 'transparent', color: on ? '#fff' : 'var(--o-text1)' });

/* L'état du planning des purificateurs (`loggia/purificateurs/etat`), relu comme celui des prises : une minute au repos, quinze
 * secondes fiche ouverte. */
const ETAT = magasin((h) => h.callWS({ type: 'loggia/purificateurs/etat' }), 60000, 15000);
function useEtatPurificateurs() {
  useEffect(() => ETAT.abonner({ rapide: true }), []);
  return useSyncExternalStore(ETAT.ecouter, ETAT.lire, ETAT.lire);
}
function useMinuteurs() {
  useEffect(() => abonnerMinuteurs({ rapide: true }), []);
  return useSyncExternalStore(ecouterMinuteurs, lireMinuteurs, lireMinuteurs);
}
// L'heure, relue toutes les `ms` tant que `actif` : la seconde d'un décompte, la demi-minute du trait « maintenant ».
function useHorloge(actif, ms) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { if (!actif) return undefined; const i = setInterval(() => setT(Date.now()), ms); return () => clearInterval(i); }, [actif, ms]);
  return t;
}
function useVivant() {
  const vivant = useRef(true);
  useEffect(() => { vivant.current = true; return () => { vivant.current = false; }; }, []);
  return vivant;
}

const nomLong = (j) => nomJour(j, locale(), 'long');
// Le nom du jour tel que sa langue l'écrit dans une phrase : « lundi » en français, « Monday » en anglais.
const nomDansPhrase = (j) => new Date(2024, 0, 1 + j).toLocaleDateString(locale(), { weekday: 'long' });
const aujourdhui = (t) => (new Date(t).getDay() + 6) % 7;
const minuteDuJour = (t) => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };

/* ════════════ La scène (§ 2.1, § 5) ════════════ */

/* Les pales : quatre lobes en moulinet, comme l'appli VeSync, dans un disque de 196 px ; deux anneaux fins. Le lobe s'éclaire à
 * l'encre du thème (`--o-text`) : un reflet clair sur un thème sombre, une ombre douce sur un thème clair. */
function Pales({ idBase, anime, duree }) {
  const lobe = idBase + 'l', disque = idBase + 'd';
  return (
    <svg aria-hidden="true" width="196" height="196" viewBox="0 0 196 196" style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs>
        <linearGradient id={lobe} x1="0" y1="0" x2="1" y2="0.35">
          <stop offset="0" style={{ stopColor: 'var(--o-text)', stopOpacity: 0.2 }} />
          <stop offset="0.55" style={{ stopColor: 'var(--o-text)', stopOpacity: 0.07 }} />
          <stop offset="1" style={{ stopColor: 'var(--o-text)', stopOpacity: 0 }} />
        </linearGradient>
        <clipPath id={disque}><circle cx="98" cy="98" r="97" /></clipPath>
      </defs>
      <g clipPath={'url(#' + disque + ')'}>
        <g className={anime ? 'pu-pales' : undefined} style={{ transformOrigin: '98px 98px', animationDuration: duree }}>
          {[0, 90, 180, 270].map(a => (
            <g key={a} transform={a ? 'rotate(' + a + ' 98 98)' : undefined}>
              <circle cx="98" cy="46" r="54" fill={'url(#' + lobe + ')'} />
              <path d="M44 46 A54 54 0 0 1 152 46" fill="none" style={{ stroke: 'var(--o-text)' }} strokeOpacity="0.1" strokeWidth="1" />
            </g>
          ))}
        </g>
      </g>
      <circle cx="98" cy="98" r="94" fill="none" style={{ stroke: 'var(--o-text)' }} strokeOpacity="0.14" strokeWidth="1" />
      <circle cx="98" cy="98" r="89" fill="none" style={{ stroke: 'var(--o-text)' }} strokeOpacity="0.06" strokeWidth="1" />
    </svg>
  );
}

/** La scène animée : 310 px de haut, toute la largeur du panneau. Éteint, tout passe au gris et rien ne bouge ; « réduire les
 * animations » coupe tout (index.css). */
function Scene({ vue, onFiltre }) {
  const idBase = 'pu' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const c = vue.couleur;
  const on = vue.allume && vue.f > 0;
  const f = on ? vue.f : 1;
  const mot = vue.muet ? tr('Indisponible') : vue.motNiveau;
  const taille = Math.min(30, Math.floor(300 / Math.max(6, mot.length)));
  const filtre = vue.filtre;
  return (
    <div data-scene={on ? 'anime' : 'repos'} className={on ? 'pu-anime' : undefined} style={{ position: 'relative', height: 310, overflow: 'hidden' }}>
      <div aria-hidden="true" className="pu-halo" style={{ position: 'absolute', left: '50%', top: '50%', width: 360, height: 360, margin: '-180px 0 0 -180px', borderRadius: '50%',
        background: 'radial-gradient(circle, ' + mix(c, on ? 55 : 18) + ' 0%, ' + mix(c, on ? 20 : 6) + ' 36%, transparent 68%)',
        animationDuration: (4.5 / Math.max(f, 0.5)).toFixed(2) + 's' }} />
      {on && PARTICULES.slice(0, vue.particules).map((p, i) => {
        const dur = p.base / f;
        return (
          <div key={i} aria-hidden="true" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transform: 'rotate(' + p.angle.toFixed(1) + 'deg)' }}>
            <span className={VOIES[p.voie - 1]} style={{ width: p.taille, height: p.taille, margin: (-p.taille / 2).toFixed(1) + 'px 0 0 ' + (-p.taille / 2).toFixed(1) + 'px',
              background: mix(c, 85), animationDuration: dur.toFixed(2) + 's', animationDelay: (-p.phase * dur).toFixed(2) + 's' }} />
          </div>
        );
      })}
      <div data-disque="" style={{ position: 'absolute', left: '50%', top: '50%', width: 196, height: 196, margin: '-98px 0 0 -98px', borderRadius: '50%', boxSizing: 'border-box',
        background: 'linear-gradient(160deg, ' + mix(c, on ? 26 : 10) + ', ' + mix(c, on ? 10 : 4) + '), var(--o-well)', border: '1px solid ' + mix(c, on ? 55 : 25),
        boxShadow: '0 0 0 7px ' + mix(c, on ? 10 : 4) + ', 0 0 50px ' + mix(c, on ? 35 : 8) + ', inset 0 0 36px ' + mix(c, on ? 10 : 4), overflow: 'hidden' }}>
        <Pales idBase={idBase} anime={on} duree={(14 / f).toFixed(2) + 's'} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '0 14px', textAlign: 'center' }}>
          {vue.air && <div style={{ ...PETITES_CAPITALES, color: 'var(--o-text2)' }}>{tr('QUALITÉ DE L’AIR')}</div>}
          <div data-niveau={vue.allume ? vue.niveau || '' : 'eteint'} style={{ fontSize: 'calc(' + taille + 'px * var(--o-texte, 1))', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.15, color: 'var(--o-text)' }}>{mot}</div>
          {vue.ligne && <div style={{ fontSize: 12.5, fontWeight: 700, color: 'color-mix(in srgb, ' + c + ' 70%, var(--o-text))' }}>{vue.ligne}</div>}
          {filtre && (filtre.pct <= 25
            ? <button type="button" onClick={onFiltre} style={{ marginTop: 6, height: 32, padding: '0 12px', borderRadius: 16, border: '1px solid ' + mix('var(--o-warn)', 45), background: mix('var(--o-warn)', 14),
                color: 'var(--o-warn)', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <Fi i="triangle-warning" size={12} />{tr('Vérifier le filtre')}</button>
            : <button type="button" onClick={onFiltre} style={{ marginTop: 6, height: 32, padding: '0 10px 0 12px', borderRadius: 16, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s1)',
                color: 'var(--o-text1)', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                {tr('Filtre {n} %', { n: filtre.pct })}<Fi i="angle-small-right" size={12} /></button>)}
        </div>
      </div>
    </div>
  );
}

/* ════════════ L'accueil (§ 2.1) ════════════ */

// Le bandeau d'état : neutre, ou — l'air mauvais ou pollué, l'appareil allumé — à la teinte du niveau.
function Bandeau({ vue }) {
  if (vue.muet) return null;
  const c = couleurNiveau(vue.niveau);
  return vue.alerte ? (
    <div role="status" data-bandeau="alerte" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: mix(c, 12), border: '1px solid ' + mix(c, 50) }}>
      <Fi i="triangle-warning" size={16} color={c} /><span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, minWidth: 0 }}>{vue.bandeau}</span>
    </div>
  ) : (
    <div role="status" data-bandeau="" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
      <Fi i="info" size={16} color="var(--o-text2)" /><span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, minWidth: 0 }}>{vue.bandeau}</span>
    </div>
  );
}

// Une action rapide (§ 2.1, 4) : un rond de 52 px et son libellé ; allumée, le rond en bleu plein.
function Action({ icone, mot, nom = null, on, peut = true, onClick }) {
  return (
    <button type="button" aria-pressed={on} aria-label={nom || undefined} aria-disabled={peut ? undefined : true} onClick={() => { if (peut) onClick(); }}
      style={{ border: 'none', background: 'none', padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, minWidth: 0, fontFamily: 'inherit',
        cursor: peut ? 'pointer' : 'default', opacity: peut ? 1 : 0.4 }}>
      <span style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)', boxShadow: on ? '0 6px 18px rgba(var(--o-accent-rgb),.35)' : 'none' }}>
        <Fi i={icone} size={20} /></span>
      {/* Deux lignes plutôt qu'une ellipse : « Marche/Arrêt » ne tient pas sur une colonne de 78 px au téléphone. */}
      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25, textAlign: 'center', textWrap: 'balance', overflowWrap: 'anywhere', color: on ? 'var(--o-accent)' : 'var(--o-text2)',
        fontVariantNumeric: 'tabular-nums', maxWidth: '100%' }}>{mot}</span>
    </button>
  );
}

/* Une vitesse sans crans (un pas de 1 à 10 %) : moins, la valeur, plus — d'un pas d'au moins 10 %, jamais à 0. */
function VitesseLibre({ hass, id, vue, peut }) {
  const [ov, poser] = useOptimiste(vue.pct);
  const courant = ov != null ? ov : vue.pct;
  const titre = tr('Vitesse du ventilateur');
  const vers = (sens) => (peut ? vitesseVoisine({ ...vue.vitesseLibre, pct: courant }, sens) : null);
  const envoyer = (pct) => { if (pct == null) return; poser(pct); commanderService(hass, id, 'fan', 'set_percentage', { entity_id: id, percentage: pct }, () => poser(null)); };
  return (
    <div data-vitesse="" style={{ ...RANGEE, padding: '12px 16px 4px 18px' }}>
      <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{titre}</span>
      <PasAPas nom={titre} valeur={courant != null ? Math.round(courant) + ' %' : '—'} peutMoins={vers(-1) != null} peutPlus={vers(1) != null}
        moins={() => envoyer(vers(-1))} plus={() => envoyer(vers(1))} />
    </div>
  );
}

function OngletAccueil({ hass, id, vue, minuteurs, onOnglet, onFiche }) {
  const vivant = useVivant();
  const choisie = vue.allume ? (vue.pilules.find(p => p.on) || {}).cle || null : 'arret';
  const [ovPilule, poserPilule] = useOptimiste(choisie);
  const [ovMarche, poserMarche] = useOptimiste(vue.allume);
  const [ovEcran, poserEcran] = useOptimiste(vue.ecranAllume);
  const [ovVerrou, poserVerrou] = useOptimiste(vue.verrouille);
  const [enVol, setEnVol] = useState(false);
  const [err, setErr] = useState('');
  const peut = !vue.muet;
  const pilule = ovPilule != null ? ovPilule : choisie;
  const marche = ovMarche != null ? ovMarche : vue.allume;

  const choisir = (p) => {
    if (!peut || pilule === p.cle) return;
    poserPilule(p.cle); poserMarche(true);
    commanderService(hass, id, 'fan', p.envoi.service, { entity_id: id, ...p.envoi.data }, () => { poserPilule(null); poserMarche(null); });
  };
  const basculerMarche = () => {
    if (marche) { poserMarche(false); poserPilule('arret'); commanderService(hass, id, 'fan', 'turn_off', { entity_id: id }, () => { poserMarche(null); poserPilule(null); }); }
    // Rallumé dans le mode qu'il avait (ticket #43) : un purificateur VeSync allumé d'un `turn_on` nu repart en manuel.
    else { poserMarche(true); commanderService(hass, id, 'fan', 'turn_on', { entity_id: id, ...(chargeAllumage(id) || {}) }, () => poserMarche(null)); }
  };
  const basculer = (ent, on, poser) => { poser(!on); commanderService(hass, ent, ent.split('.')[0], on ? 'turn_off' : 'turn_on', { entity_id: ent }, () => poser(null)); };

  // La minuterie : seulement quand le composant répond (sans lui, pas d'action plutôt qu'un repli dans l'onglet).
  // Une réponse lisible du composant (sa table des minuteurs) ; sans elle, pas de bouton.
  const etatMin = minuteurs && minuteurs.etat && minuteurs.etat.minuteurs && typeof minuteurs.etat.minuteurs === 'object' ? minuteurs.etat : null;
  const m = etatMin && etatMin.minuteurs ? etatMin.minuteurs[id] || null : null;
  const decalage = useRef(0);
  useEffect(() => { decalage.current = decalageServeur(etatMin, Date.now()); }, [etatMin]);
  const t = useHorloge(!!m, 1000);
  const reste = m ? resteMinuteur(etatMin, id, t, decalage.current) : null;
  const minuterie = () => {
    if (enVol || !hass || typeof hass.callWS !== 'function') return;
    const suite = suiteMinuterie(reste != null && m ? Number(m.duree) || 0 : 0);
    const msg = suite.annuler ? { type: 'loggia/minuteurs/annuler', entity_id: id } : { type: 'loggia/minuteurs/poser', entity_id: id, minutes: suite.poser };
    setEnVol(true); setErr('');
    const fini = () => { if (vivant.current) setEnVol(false); };
    new Promise((ok) => ok(hass.callWS(msg))).then((r) => { if (r && r.minuteurs) poserMinuteurs(r); },
      (x) => { if (vivant.current) setErr(texteRefus(x) || tr('Le minuteur n’a pas pu être enregistré.')); }).then(fini, fini);
  };

  const ecran = vue.ent.ecran ? (ovEcran != null ? ovEcran : vue.ecranAllume) : null;
  const verrou = vue.ent.verrou ? (ovVerrou != null ? ovVerrou : vue.verrouille) : null;
  const actions = [
    // Marche/Arrêt : s'il sait s'allumer ou s'éteindre (bits 32, 16). La minuterie éteint par `fan.turn_off` : seulement s'il sait s'éteindre.
    (vue.peutAllumer || vue.peutEteindre) && <Action key="marche" icone="power" mot={tr('Marche/Arrêt').replace('/', '/\u200b')} nom={tr('Marche/Arrêt')} on={!!marche}
      peut={peut && (marche ? vue.peutEteindre : vue.peutAllumer)} onClick={basculerMarche} />,
    vue.ent.ecran && <Action key="ecran" icone="screen" mot={tr('Écran')} on={!!ecran && !!marche} peut={peut && !!marche} onClick={() => basculer(vue.ent.ecran, !!ecran, poserEcran)} />,
    vue.ent.verrou && <Action key="verrou" icone="lock" mot={tr('Verrou')} on={!!verrou} peut={peut} onClick={() => basculer(vue.ent.verrou, !!verrou, poserVerrou)} />,
    etatMin && vue.peutEteindre && <Action key="minuterie" icone="stopwatch" mot={reste != null ? decompte(reste) : tr('Minuterie')}
      nom={reste != null ? tr('Minuterie : {reste} avant l’arrêt', { reste: decompte(reste) }) : tr('Minuterie')} on={reste != null} peut={peut && !!marche && !enVol} onClick={minuterie} />,
  ].filter(Boolean);

  return (
    <div className="rb-accueil" style={{ gap: 12 }}>
      <Bandeau vue={vue} />
      <div data-panneau="air" style={LISTE}>
        <Scene vue={vue} onFiltre={() => onOnglet('filtre')} />
        {vue.pilules.length > 0 && <div role="group" aria-label={tr('Mode')} style={{ ...PUITS, gridTemplateColumns: 'repeat(' + vue.pilules.length + ', minmax(0, 1fr))', margin: '16px 16px 4px' }}>
          {vue.pilules.map(p => {
            const on = pilule === p.cle;
            return (
              <button key={p.cle} type="button" aria-pressed={on} aria-disabled={peut ? undefined : true} onClick={() => choisir(p)} style={PUCE(on, peut)}>
                {p.signe === 'auto' && <span aria-hidden="true" style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid currentColor', fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxSizing: 'border-box' }}>{p.mot.charAt(0)}</span>}
                {p.signe === 'nuit' && <Fi i="moon" size={13} />}
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.mot}</span>
              </button>
            );
          })}
        </div>}
        {vue.vitesseLibre && <VitesseLibre hass={hass} id={id} vue={vue} peut={peut} />}
        {actions.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + actions.length + ', minmax(0, 1fr))', gap: 4, padding: '12px 10px 14px' }}>{actions}</div>}
        {err && <div role="alert" style={{ ...ALERTE, padding: '0 18px 14px' }}>{err}</div>}
      </div>
      <div data-liste="" style={LISTE}>
        <div style={RANGEE}>
          <span style={{ ...TITRE, flex: 1, minWidth: 0 }}>{tr('Dernier signal')}</span>
          <span style={{ ...VALEUR, color: 'var(--o-text2)' }}>{vue.dernier ? relTime(vue.dernier) : '—'}</span>
        </div>
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

/* ════════════ Le planning (§ 2.2) ════════════ */

const BOUTON_ROND = (peut) => ({ width: 44, height: 44, borderRadius: '50%', border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'transparent', color: 'var(--o-text1)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: peut ? 'pointer' : 'default', opacity: peut ? 1 : 0.4, padding: 0 });
const BOUTON_COPIE = { minHeight: 44, padding: '0 10px', borderRadius: 12, fontSize: 12.5, width: '100%' };

function Frise({ jour, modes, maintenant }) {
  return (
    <div style={{ position: 'relative', paddingTop: 6 }}>
      <div aria-hidden="true" style={{ display: 'flex', height: 34, borderRadius: 10, overflow: 'hidden', gap: 2, background: 'var(--o-well)' }}>
        {bandesJour(jour).map((b, i) => (
          <div key={i} data-bande={b.mode} style={{ width: ((b.fin - b.debut) / 14.4).toFixed(3) + '%', background: modeDe(modes, b.mode).couleur, opacity: b.mode === 'arret' ? 0.45 : 0.9 }} />
        ))}
      </div>
      {maintenant != null && <div aria-hidden="true" style={{ position: 'absolute', left: (maintenant / 14.4).toFixed(2) + '%', top: 0, width: 3, height: 46, marginLeft: -1, borderRadius: 2, background: 'var(--o-text)', boxShadow: '0 0 0 2px var(--o-s3)' }} />}
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginTop: 8 }}>
        {[0, 6, 12, 18, 24].map(h => <span key={h}>{tr('{n} h', { n: h })}</span>)}
      </div>
    </div>
  );
}

function OngletPlanning({ hass, id, vue, t }) {
  const vivant = useVivant();
  const { etat, erreur } = useEtatPurificateurs();
  const modes = modesPlanning(vue);
  const ordinaire = compteOrdinaire(hass);
  const p = etat && etat.purificateurs ? etat.purificateurs[id] || null : null;
  const [brouillon, setBrouillon] = useState(null);
  const [actifEnVol, setActifEnVol] = useState(null);
  const [jour, setJour] = useState(() => aujourdhui(t));
  const [ouverte, setOuverte] = useState(-1);
  const [copie, setCopie] = useState('');
  const [err, setErr] = useState('');
  const file = useRef(Promise.resolve());
  const idBase = useId();

  if (!etat) {
    return erreur
      ? <div role="status" style={{ ...LISTE, ...RANGEE, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Le planning se règle une fois Home Assistant redémarré avec cette version de Loggia.')}</div>
      : <div style={{ minHeight: 260 }} />;
  }
  const semaine = (brouillon || (p && p.semaine) || semaineType(modes)).map(journeePropre);
  const actif = actifEnVol != null ? actifEnVol : !!(p && p.actif);
  const auj = aujourdhui(t);
  const minute = minuteDuJour(t);
  const plages = semaine[jour];
  const prochain = actif ? prochainChangement(semaine, auj, minute) : null;

  // Une écriture : la semaine entière (ou l'interrupteur), l'une après l'autre ; l'écran l'avance, la réponse la confirme.
  const ecrire = (patch) => {
    if (ordinaire || !hass || typeof hass.callWS !== 'function') return;
    if (patch.semaine) setBrouillon(patch.semaine);
    if (patch.actif != null) setActifEnVol(patch.actif);
    setErr('');
    file.current = file.current.then(() => hass.callWS({ type: 'loggia/purificateurs/regler', entity_id: id, ...patch }))
      .then((r) => { if (r && r.purificateurs) ETAT.poser(r); if (vivant.current) { setBrouillon(null); setActifEnVol(null); } },
        (x) => { if (vivant.current) { setBrouillon(null); setActifEnVol(null); setErr(raisonEchec(x, tr('Planning'))); } });
  };
  const changerJour = (nouveau) => ecrire({ semaine: semaine.map((j, k) => (k === jour ? nouveau : j)) });
  const copier = (cibles, msg) => { ecrire({ semaine: copierJour(semaine, jour, cibles) }); setCopie(msg); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...LISTE, ...RANGEE, minHeight: 66 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={TITRE}>{tr('Planning')}</span>
          <span style={{ ...SOUS, color: actif ? 'var(--o-accent)' : 'var(--o-text2)' }}>
            {actif ? (prochain ? tr('Prochain : {quoi}', { quoi: phraseProchain(prochain, modes, nomDansPhrase) }) : tr('Allumé')) : tr('En pause · il reste sur le réglage en cours')}</span>
        </span>
        {ordinaire ? <span style={{ ...SOUS, marginTop: 0 }}>{tr('Réservé aux administrateurs.')}</span>
          : <Bascule on={actif} nom={tr('Planning')} cb={() => ecrire(actif ? { actif: false } : { actif: true, semaine })} />}
      </div>

      <div style={{ ...LISTE, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14, opacity: actif ? 1 : 0.55 }}>
        <div role="group" aria-label={tr('Jour')} style={{ ...PUITS, gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {[0, 1, 2, 3, 4, 5, 6].map(j => (
            <button key={j} type="button" aria-pressed={jour === j} aria-label={nomLong(j)} title={nomLong(j)} onClick={() => { setJour(j); setOuverte(-1); setCopie(''); }}
              style={{ ...PUCE(jour === j), flexDirection: 'column', gap: 3, fontSize: 13.5 }}>
              {nomJour(j, locale(), 'narrow')}
              <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: 2, background: j === auj ? (jour === j ? '#fff' : 'var(--o-accent)') : 'transparent' }} />
            </button>
          ))}
        </div>
        <Frise jour={plages} modes={modes} maintenant={jour === auj ? minute : null} />
      </div>

      <div style={{ ...LISTE, opacity: actif ? 1 : 0.55 }}>
        <div style={{ ...PETITES_CAPITALES, padding: '14px 18px 6px' }}>{tr('PLAGES · {jour}', { jour: nomLong(jour).toUpperCase() })}</div>
        {plages.map((x, i) => {
          const fin = i + 1 < plages.length ? plages[i + 1].debut : 1440;
          const m = modeDe(modes, x.mode);
          const enCours = actif && jour === auj && plageEnCours(plages, minute) === i;
          const deplie = ouverte === i && !ordinaire;
          const idPanneau = idBase + '-p' + i;
          return (
            <div key={i + ':' + x.debut} style={{ borderTop: filet(1) }}>
              <button type="button" aria-expanded={ordinaire ? undefined : deplie} aria-controls={deplie ? idPanneau : undefined} onClick={() => { if (!ordinaire) setOuverte(deplie ? -1 : i); }}
                style={{ ...RANGEE, ...EN_BOUTON, minHeight: 56, cursor: ordinaire ? 'default' : 'pointer' }}>
                <span style={{ width: 104, flexShrink: 0, fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{hhmm(x.debut) + ' – ' + (fin === 1440 ? '24:00' : hhmm(fin))}</span>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: m.couleur, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>{m.mot}</span>
                {enCours && <span style={{ height: 22, padding: '0 8px', borderRadius: 11, background: mix('var(--o-ok)', 16), color: 'var(--o-ok)', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>{tr('En cours')}</span>}
                {!ordinaire && <Fi i={deplie ? 'angle-small-down' : 'angle-small-right'} size={16} color="var(--o-text3)" />}
              </button>
              {deplie && (
                <div id={idPanneau} style={{ padding: '4px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div role="group" aria-label={tr('Mode')} style={{ ...PUITS, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                    {modes.map(md => (
                      <button key={md.cle} type="button" aria-pressed={x.mode === md.cle} onClick={() => { if (x.mode !== md.cle) changerJour(modePlage(plages, i, md.cle)); }} style={{ ...PUCE(x.mode === md.cle), gap: 7 }}>
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: md.couleur, boxShadow: x.mode === md.cle ? '0 0 0 1.5px currentColor' : 'none', flexShrink: 0 }} />{md.mot}
                      </button>
                    ))}
                  </div>
                  {i > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--o-text2)' }}>{tr('Début')}</span>
                      <button type="button" aria-label={tr('30 minutes plus tôt')} aria-disabled={peutDeplacer(plages, i, -1) ? undefined : true} onClick={() => { const l = deplacerPlage(plages, i, -1); if (l) changerJour(l); }} style={BOUTON_ROND(peutDeplacer(plages, i, -1))}><Fi i="minus-small" size={16} /></button>
                      <span aria-live="polite" style={{ width: 64, textAlign: 'center', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{hhmm(x.debut)}</span>
                      <button type="button" aria-label={tr('30 minutes plus tard')} aria-disabled={peutDeplacer(plages, i, 1) ? undefined : true} onClick={() => { const l = deplacerPlage(plages, i, 1); if (l) changerJour(l); }} style={BOUTON_ROND(peutDeplacer(plages, i, 1))}><Fi i="plus-small" size={16} /></button>
                    </div>
                  )}
                  {i > 0 && <BoutonConfirme libelle={tr('Supprimer la plage')} onConfirme={() => { const l = retirerPlage(plages, i); if (l) { setOuverte(-1); changerJour(l); } }} style={{ alignSelf: 'flex-start', minHeight: 40 }} />}
                </div>
              )}
            </div>
          );
        })}
        {!ordinaire && (
          <button type="button" onClick={() => { const r = ajouterPlage(plages, (modes.find(md => md.cle === 'auto') || modes.find(md => md.cle !== 'arret') || modes[0]).cle); if (r) { setOuverte(r.indice); changerJour(r.jour); } }}
            style={{ ...RANGEE, ...EN_BOUTON, justifyContent: 'center', minHeight: 54, borderTop: filet(1), color: 'var(--o-accent)', fontSize: 14, fontWeight: 800 }}>
            <Fi i="plus-small" size={16} />{tr('Ajouter une plage')}</button>
        )}
      </div>

      {!ordinaire && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <BoutonConfirme libelle={tr('Copier sur lun → ven')} onConfirme={() => copier([0, 1, 2, 3, 4], tr('Copié du {jour} sur lundi → vendredi', { jour: nomDansPhrase(jour) }))} style={BOUTON_COPIE} />
          <BoutonConfirme libelle={tr('Copier sur 7 jours')} onConfirme={() => copier([0, 1, 2, 3, 4, 5, 6], tr('Copié du {jour} sur les 7 jours', { jour: nomDansPhrase(jour) }))} style={BOUTON_COPIE} />
        </div>
      )}
      {copie && <div role="status" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--o-ok)', marginTop: -4 }}>{copie}</div>}
      {err && <div role="alert" style={ALERTE}>{err}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 14, background: 'var(--o-well)', border: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
        <Fi i="info" size={16} color="var(--o-text2)" />
        <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{tr('Un réglage à la main tient jusqu’au prochain changement de mode, puis le planning reprend.')}</span>
      </div>
    </div>
  );
}

/* ════════════ Le filtre (§ 2.3) ════════════ */

const ENCRE_FILTRE = { bas: 'var(--o-bad)', moyen: 'var(--o-warn)', bon: 'var(--o-ok)' };
function OngletFiltre({ hass, vue }) {
  const f = vue.filtre;
  if (!f) return null;
  const c = ENCRE_FILTRE[f.niveau];
  const remise = vue.ent.remiseFiltre;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div data-panneau="filtre" style={{ ...PANNEAU, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={PETITES_CAPITALES}>{tr('FILTRE')}</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
          <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{f.pct}</span>
          <span style={{ fontSize: 20, fontWeight: 800 }}>%</span>
          <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: c }}>{f.etat}</span>
        </div>
        <div aria-hidden="true" style={{ height: 10, borderRadius: 5, background: 'var(--o-well)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: f.pct + '%', borderRadius: 5, background: c }} />
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.5, color: 'var(--o-text2)' }}>
          {remise ? tr('Après un remplacement, remettez le compteur à zéro.') : tr('Après un remplacement, remettez son compteur à zéro dans l’application de l’appareil.')}</div>
        {remise && f.pct < 100 && (
          <BoutonConfirme libelle={tr('Filtre remplacé · remettre à 100 %')} onConfirme={() => commanderService(hass, remise, 'button', 'press', { entity_id: remise })}
            style={{ minHeight: 48, borderRadius: 12, fontSize: 14 }} />
        )}
      </div>
    </div>
  );
}

/* ════════════ L'historique (§ 2.4) ════════════ */

const LARGEUR = 320, HAUTEUR = 140, BANDE = HAUTEUR / 5;
const yDe = (n) => HAUTEUR - BANDE * n - BANDE / 2;
function OngletHistorique({ hass, id, vue, t }) {
  const air = vue.ent.air;
  const lu = useHistoriquePeriode(hass, { ids: air ? [air] : [], idsAttributs: [id], jours: 1, cle: String(Math.floor(t / 300000)) });
  if (lu == null) return <div style={{ minHeight: 260 }} />;
  if (lu === 'erreur') return <div role="status" style={{ ...LISTE, ...RANGEE, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Historique indisponible pour le moment')}</div>;
  const listeDe = (eid) => lu.find(l => Array.isArray(l) && l.length && l[0].entity_id === eid) || [];
  const debut = t - 86400000;
  const meta = LOGGIA_INDEX && LOGGIA_INDEX.entityMeta ? LOGGIA_INDEX.entityMeta.get(air) : null;
  const unite = air && hass.states[air] ? (hass.states[air].attributes || {}).unit_of_measurement : null;
  const escalier = air ? escalierAir(listeDe(air), (s) => niveauDeLAir(s, meta || {}, unite), debut, t) : [];
  const pire = pireNiveau(escalier);
  const dernier = escalier.length ? escalier[escalier.length - 1].n : -1;
  const x = (tt) => ((tt - debut) / 86400000) * LARGEUR;
  let ligne = '';
  escalier.forEach((p, i) => {
    const px = x(i === 0 ? debut : p.t).toFixed(1), py = yDe(p.n).toFixed(1);
    ligne += i === 0 ? 'M' + px + ' ' + py : ' L' + px + ' ' + yDe(escalier[i - 1].n).toFixed(1) + ' L' + px + ' ' + py;
  });
  if (escalier.length) ligne += ' L' + LARGEUR + ' ' + yDe(dernier).toFixed(1);
  const aire = ligne ? ligne + ' L' + LARGEUR + ' ' + HAUTEUR + ' L0 ' + HAUTEUR + ' Z' : '';
  const c = dernier >= 0 ? couleurNiveau(NIVEAUX[dernier]) : 'var(--o-text3)';
  const evenements = evenementsJour(listeDe(id), escalier, { presetAuto: vue.presetAuto, presetNuit: vue.presetNuit, n: vue.n, vitesse: vue.vitesse });
  const heure = (tt) => new Date(tt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {air && (
        <div style={{ ...PANNEAU, padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={PETITES_CAPITALES}>{tr('DERNIÈRES 24 H')}</span>
            {pire >= 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)' }}>{tr('pire : {niveau}', { niveau: motNiveau(NIVEAUX[pire]).toLowerCase() })}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div aria-hidden="true" style={{ width: 58, height: HAUTEUR, flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', fontSize: 10.5, fontWeight: 700, color: 'var(--o-text2)', textAlign: 'right' }}>
              {[4, 3, 2, 1, 0].map(n => <span key={n} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{motNiveau(NIVEAUX[n])}</span>)}
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 0, height: HAUTEUR }}>
              <svg role="img" aria-label={tr('Qualité de l’air sur 24 heures')} width="100%" height={HAUTEUR} viewBox={'0 0 ' + LARGEUR + ' ' + HAUTEUR} preserveAspectRatio="none" style={{ display: 'block' }}>
                {[4, 3, 2].map(n => <rect key={n} x="0" y={HAUTEUR - BANDE * (n + 1)} width={LARGEUR} height={BANDE} style={{ fill: mix(couleurNiveau(NIVEAUX[n]), 8) }} />)}
                {aire && <path d={aire} style={{ fill: mix(c, 16) }} />}
                {ligne && <path d={ligne} fill="none" style={{ stroke: c }} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
              </svg>
              {dernier >= 0 && <span aria-hidden="true" style={{ position: 'absolute', right: -4, top: yDe(dernier) - 5, width: 10, height: 10, borderRadius: '50%', background: c, boxShadow: '0 0 0 2px var(--o-s3)' }} />}
            </div>
          </div>
          <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', paddingLeft: 66 }}>
            <span>{tr('il y a 24 h')}</span><span>{tr('il y a 12 h')}</span><span>{tr('maintenant')}</span>
          </div>
        </div>
      )}
      <div style={LISTE}>
        {evenements.length ? evenements.map((e, i) => (
          <div key={i} style={{ ...RANGEE, gap: 14, minHeight: 52, borderTop: filet(i) }}>
            <span style={{ width: 44, flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--o-text2)', fontVariantNumeric: 'tabular-nums' }}>{heure(e.t)}</span>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: e.couleur, flexShrink: 0 }} />
            <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0 }}>{e.texte}</span>
          </div>
        )) : <div style={{ ...RANGEE, fontSize: 13, fontWeight: 600, color: 'var(--o-text2)' }}>{tr('Rien de neuf depuis 24 h.')}</div>}
      </div>
    </div>
  );
}

/* ════════════ La fiche ════════════ */

/**
 * La fiche entière. La coquille (`FichePurificateur`) passe `hass` (suivi en direct), l'entité, sa pièce, le fabricant et le modèle
 * de l'appareil, l'épingle, l'icône choisie pour sa carte (`glyphe`) et `onFiche(id)`, qui ouvre la fiche universelle par-dessus.
 * `ongletDepart` et `maintenant` servent aux tests.
 */
export default function FichePurificateurContent({ hass, id, piece = null, appareil = null, epingle = null, glyphe = null, onFiche = null, ongletDepart = 'accueil', maintenant = null }) {
  const idOnglets = useId();
  const [onglet, setOnglet] = useState(ongletDepart);
  const minuteurs = useMinuteurs();
  const { etat } = useEtatPurificateurs();
  // La demi-minute suffit : le trait « maintenant » du planning, la plage « En cours », la phrase du prochain changement.
  const horloge = useHorloge(maintenant == null, 30000);
  const t = maintenant == null ? horloge : Number(maintenant);
  const S = (hass && hass.states) || {};
  const p = etat && etat.purificateurs ? etat.purificateurs[id] || null : null;
  // Le prochain changement du planning, quand il est allumé : la phrase du bandeau.
  // La minuterie posée : sa durée s'écrit dans la ligne du disque (« Auto · vitesse faible · 2 h »).
  const minuteur = minuteurs.etat && minuteurs.etat.minuteurs ? minuteurs.etat.minuteurs[id] || null : null;
  const avant = vuePurificateur(LOGGIA_INDEX, S, id, { minuteur });
  const semaine = p && p.actif && Array.isArray(p.semaine) ? p.semaine.map(journeePropre) : null;
  const prochain = semaine ? phraseProchain(prochainChangement(semaine, aujourdhui(t), minuteDuJour(t)), modesPlanning(avant), nomDansPhrase) : null;
  const vue = prochain ? vuePurificateur(LOGGIA_INDEX, S, id, { minuteur, prochain }) : avant;
  const nom = (vue.st && vue.st.attributes && vue.st.attributes.friendly_name) || id || tr('Purificateur d’air');
  const plaque = { icone: 'wind', fond: vue.allume ? mix(vue.couleur, 18) : 'var(--o-s1)', encre: vue.allume ? vue.couleur : 'var(--o-text3)' };
  if (typeof glyphe === 'function') plaque.glyphe = glyphe(<Fi i="wind" size={18} />);
  // Le Planning : seulement s'il y a au moins deux modes que l'appareil sait ; le Filtre : seulement s'il publie son filtre.
  const onglets = [['accueil', tr('Accueil'), 'home'], modesPlanning(vue).length >= 2 && ['planning', tr('Planning'), 'calendar-clock'], vue.filtre && ['filtre', tr('Filtre'), 'filter'],
    ['historique', tr('Historique'), 'time-past']].filter(Boolean);
  const actuel = onglets.some(o => o[0] === onglet) ? onglet : 'accueil';
  const versOnglet = (o) => { setOnglet(o); focaliser(idOnglets + '-t-' + o); };
  return (
    <div className="rb-fiche" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <EnteteFiche nom={nom} epingle={epingle} plaque={plaque} sousNom={[piece, appareil].filter(Boolean).join(' · ') || null} panne={vue.muet ? tr('Indisponible') : null} />
      <FicheOnglets idBase={idOnglets} nom={nom} onglets={onglets} actuel={actuel} onChoisir={setOnglet} />
      <PanneauOnglet idBase={idOnglets} actuel={actuel} avecOnglets>
        {actuel === 'accueil' && <OngletAccueil hass={hass} id={id} vue={vue} minuteurs={minuteurs} onOnglet={versOnglet} onFiche={onFiche} />}
        {actuel === 'planning' && <OngletPlanning hass={hass} id={id} vue={vue} t={t} />}
        {actuel === 'filtre' && <OngletFiltre hass={hass} vue={vue} />}
        {actuel === 'historique' && <OngletHistorique hass={hass} id={id} vue={vue} t={t} />}
      </PanneauOnglet>
    </div>
  );
}
