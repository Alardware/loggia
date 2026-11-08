/* ── Les conseils d'énergie, à l'écran (07/11, usage étape 11) ──────────────
 *
 * Deux endroits, les mêmes mots et le même geste :
 *  - la carte « Le tarif » de la vue Énergie, sous la barre des vingt-quatre
 *    heures : « Conseils » — le jour rouge de demain, et chaque appareil de
 *    l'électroménager au repos, « à lancer en heures creuses, dès 22:30 », avec
 *    son dernier cycle s'il a tourné en heures pleines ;
 *  - la fiche de sa prise, sous « Prévenir à la fin du cycle ».
 * Le geste : la puce « Me prévenir », bleu plein une fois posée (« Prévenu à
 * 22:30 », un appui l'annule) — comme les puces du minuteur, et tenue par le
 * serveur comme lui.
 *
 * Ce qui se calcule vit dans `conseils.js` et `tarif.js`, testés à sec.
 */
import { useState, useRef, useEffect } from 'react';
import { tr, locale } from './i18n.js';
import { nombre } from './format.js';
import { Fi, cvName } from './ui.jsx';
import { plagesAnnoncees, plagesApprises, plagesAutour, plagesVraies, heuresCreusesAVenir, lirePrevision, fenetreMoinsChere } from './tarif.js';
import { useEtatsHist } from './historique.jsx';
import { minuitLocal } from './jourstat.js';
import { useLecturePrises } from './prisesetat.js';
import { ELECTROMENAGER } from './prises.js';
import { jourRouge } from './attention.js';
import { texteRefus } from './refus.js';
import { enHaids, enPrix } from './state.js';
import { RANGEE, TITRE, SOUS } from './fichekit.js';
import { filet } from './fichecommune.jsx';
import { useRappels, ecrireRappel, rappelDe, dansCalme, momentEco, dernierCycleHp, appareilsAuRepos } from './conseils.js';

const heure = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/**
 * Le moment le moins cher, d'après ce que la maison publie : `{ moment, plagesHc, prix }`.
 *  - les heures creuses : annoncées par le capteur de créneau, sinon apprises
 *    de son historique depuis avant-hier (tarif.js) ;
 *  - sinon le creux d'un prix qui varie, d'après sa prévision ;
 *  - `plagesHc` : celles qui ont eu cours (le dernier cycle se juge dessus) ;
 *  - `prix` : `{ hc, hp }` à DEUX tarifs seulement — à plus, on ne sait pas
 *    lequel court (Tempo), et l'on ne chiffre rien.
 */
export function useMomentEco(hass, EN = {}, prixHa = [], tour = 0) {
  const S = (hass && hass.states) || {};
  const num = (id) => { const e = id && S[id]; const n = e ? parseFloat(e.state) : NaN; return Number.isFinite(n) ? n : null; };
  const maintenant = Date.now();
  const eHc = EN.hcActive ? S[EN.hcActive] : null;
  const enHc = eHc && (eHc.state === 'on' || eHc.state === 'off') ? eHc.state === 'on' : null;
  const annoncees = plagesAnnoncees(eHc && eHc.attributes);
  // Avant-hier à minuit : de quoi comparer deux journées entières. Une borne qui ne bouge qu'une fois par jour : une seule lecture.
  const avant = minuitLocal(minuitLocal(maintenant) - 36 * 3600e3);
  const etats = useEtatsHist(hass, annoncees.length ? null : (EN.hcActive || null), avant, null, tour);
  const apprises = annoncees.length ? [] : plagesApprises(etats, maintenant);
  const hc = heuresCreusesAVenir({ annoncees, apprises, enHc, maintenant });
  const plagesHc = annoncees.length ? plagesAutour(annoncees, maintenant) : (etats ? plagesVraies(etats, avant, maintenant) : []);
  // Le prix qui varie : une seule connexion, dont le prix vient d'une entité (la règle de la carte du tarif).
  const sansFiche = num(EN.hcPrice) == null && num(EN.hpPrice) == null;
  const dynamique = sansFiche && (prixHa || []).length === 1 && prixHa[0].valeur == null && prixHa[0].entite ? prixHa[0].entite : null;
  const creux = !hc && dynamique && S[dynamique] ? fenetreMoinsChere(lirePrevision(S[dynamique].attributes), maintenant) : null;
  const tableau = (prixHa || []).map(p => (p.valeur != null ? p.valeur : num(p.entite))).filter(Number.isFinite).sort((x, y) => x - y);
  const hcP = num(EN.hcPrice) != null ? num(EN.hcPrice) : (tableau.length === 2 ? tableau[0] : null);
  const hpP = num(EN.hpPrice) != null ? num(EN.hpPrice) : (tableau.length === 2 ? tableau[1] : null);
  const prix = hcP != null && hpP != null && hpP > hcP ? { hc: hcP, hp: hpP } : null;
  return { moment: momentEco({ hc, creux, maintenant }), plagesHc, prix };
}

/**
 * La puce « Me prévenir » : pose le rappel à `quand` (ms) ; posée, elle dit
 * « Prévenu à 22:30 » en bleu plein, et un appui l'annule. Rien sans téléphone
 * pour ce compte (`peut`), ni sans serveur. Une seule demande en vol.
 */
function PuceRappel({ hass, etat, quand, sorte, entite = null }) {
  const [enVol, setEnVol] = useState(false);
  const [err, setErr] = useState('');
  const vivant = useRef(true);
  useEffect(() => () => { vivant.current = false; }, []);
  if (!etat || !etat.peut || !hass || typeof hass.callWS !== 'function' || !Number.isFinite(quand)) return null;
  const r = rappelDe(etat, entite);
  const h = heure(r ? Number(r.quand) * 1000 : quand);
  const appui = () => {
    if (enVol) return;
    setEnVol(true);
    setErr('');
    const msg = r ? { type: 'loggia/rappels/annuler', id_rappel: r.id }
      : { type: 'loggia/rappels/poser', quand: Math.round(quand / 1000), sorte, ...(entite ? { entity_id: entite } : {}) };
    const fini = () => { if (vivant.current) setEnVol(false); };
    ecrireRappel(hass, msg).then(fini, (x) => { if (vivant.current) setErr(texteRefus(x) || tr('Le rappel n’a pas pu être enregistré.')); fini(); });
  };
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, marginLeft: 'auto' }}>
      <button type="button" onClick={appui} aria-pressed={!!r} aria-busy={enVol || undefined}
        aria-label={r ? tr('Prévenu à {h} — annuler', { h }) : tr('Me prévenir à {h}', { h })}
        style={{ height: 40, padding: '0 12px', borderRadius: 10, border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer', opacity: enVol ? 0.6 : 1,
          background: r ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: r ? '#fff' : 'var(--o-text1)' }}>
        <Fi i={r ? 'check' : 'bell'} size={13} />
        {r ? tr('Prévenu à {h}', { h }) : tr('Me prévenir')}
      </button>
      {r && dansCalme(etat.calme, Number(r.quand) * 1000) && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', textAlign: 'right' }}>{tr('Sans sonnerie : heures calmes')}</span>}
      {err && <span role="alert" style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-bad)', textAlign: 'right' }}>{err}</span>}
    </span>
  );
}

/** Une rangée de conseil : son titre, ses lignes, sa puce. Un filet la sépare de la précédente, jamais une boîte. Dans
 *  la carte étroite du PC (304 px), la puce passe SOUS le texte, calée à droite : à côté, elle le serrait sur cinq lignes. */
function Conseil({ titre, lignes, puce, premier }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 8, padding: '10px 0', borderTop: premier ? 'none' : filet(1) }}>
      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, overflowWrap: 'anywhere' }}>{titre}</div>
        {lignes.map((l, i) => <div key={i} style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.4, marginTop: 2, color: l.couleur || 'var(--o-text2)' }}>{l.texte}</div>)}
      </div>
      {puce}
    </div>
  );
}

/** Ce que l'appareil a à faire du moment : en cours, « le bon moment » ; à venir, « dès 22:30 ». */
function ligneMoment(m) {
  if (m.enCours) {
    return m.sorte === 'hc' ? tr('Heures creuses jusqu’à {h} : le bon moment pour le lancer.', { h: heure(m.fin) })
      : tr('Le moins cher jusqu’à {h} : le bon moment pour le lancer.', { h: heure(m.fin) });
  }
  return m.sorte === 'hc' ? tr('À lancer en heures creuses, dès {h}.', { h: heure(m.debut) })
    : tr('À lancer au moment le moins cher, dès {h}.', { h: heure(m.debut) });
}

/**
 * Les conseils de la carte du tarif. `eco` : ce que rend `useMomentEco`, que la
 * carte calcule une fois pour sa ligne « Heures creuses à partir de… ». Rien
 * quand aucun conseil n'est vrai : ni le jour rouge, ni un moment connu.
 */
export function ConseilsEnergie({ hass, EN = {}, eco, devise = '€' }) {
  const { moment: m, plagesHc, prix } = eco || {};
  const { etat: prises } = useLecturePrises(!!m);
  const { etat: rappels } = useRappels(!!m);
  const S = (hass && hass.states) || {};
  const rouge = !!(EN.tempoDemain && S[EN.tempoDemain] && jourRouge(S[EN.tempoDemain].state));
  const conseils = [];
  if (rouge) {
    conseils.push({ cle: 'rouge', titre: tr('Demain : jour rouge'), lignes: [{ texte: m && m.sorte === 'hc' && !m.enCours
      ? tr('Ce qui peut attendre se lance en heures creuses, dès {h}.', { h: heure(m.debut) }) : tr('Décalez ce qui peut attendre') }] });
  }
  const appareils = m ? appareilsAuRepos(prises, ELECTROMENAGER) : [];
  for (const a of appareils) {
    const hp = m.sorte === 'hc' ? dernierCycleHp(a.cycles, plagesHc, prix) : null;
    const lignes = [{ texte: ligneMoment(m) }];
    if (hp) {
      lignes.push({ couleur: 'var(--o-warn)', texte: hp.surcout != null
        ? tr('Dernier cycle en heures pleines, fini à {h} : {e} de plus qu’en heures creuses.', { h: heure(hp.fin), e: nombre(hp.surcout, 2) + ' ' + devise })
        : tr('Dernier cycle en heures pleines, fini à {h}.', { h: heure(hp.fin) }) });
    }
    conseils.push({ cle: a.id, titre: cvName(S[a.id], a.id), lignes,
      puce: m.enCours ? null : <PuceRappel hass={hass} etat={rappels} quand={m.debut} sorte={m.sorte} entite={a.id} /> });
  }
  // Sans électroménager suivi (les prises LUES) : un seul rappel, pour la maison — s'il y a un téléphone où le recevoir.
  if (m && !m.enCours && prises && !appareils.length && rappels && rappels.peut) {
    conseils.push({ cle: 'maison', titre: m.sorte === 'hc' ? tr('Heures creuses à partir de {h}', { h: heure(m.debut) }) : tr('Le moins cher à partir de {h}', { h: heure(m.debut) }),
      lignes: [{ texte: tr('Une notification sur votre téléphone, pour lancer les machines.') }],
      puce: <PuceRappel hass={hass} etat={rappels} quand={m.debut} sorte={m.sorte} /> });
  }
  if (!conseils.length) return null;
  return (
    <div style={{ marginTop: 16, paddingTop: 12, borderTop: filet(1) }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--o-text2)', marginBottom: 2 }}>{tr('Conseils')}</div>
      {conseils.map((c, i) => <Conseil key={c.cle} titre={c.titre} lignes={c.lignes} puce={c.puce || null} premier={i === 0} />)}
    </div>
  );
}

/**
 * La rangée de la fiche d'une prise d'électroménager : le moment le moins cher
 * et sa puce. Rien quand on ne le connaît pas, ni pendant un cycle.
 */
export function RangeeMomentEco({ hass, id, enCycle = false }) {
  const { moment: m } = useMomentEco(hass, enHaids(), enPrix());
  const { etat } = useRappels(!!m && !enCycle);
  if (!m || enCycle) return null;
  const hc = m.sorte === 'hc';
  const titre = m.enCours ? (hc ? tr('Heures creuses jusqu’à {h}', { h: heure(m.fin) }) : tr('Le moins cher jusqu’à {h}', { h: heure(m.fin) }))
    : (hc ? tr('Heures creuses à partir de {h}', { h: heure(m.debut) }) : tr('Le moins cher à partir de {h}', { h: heure(m.debut) }));
  const sous = m.enCours ? tr('C’est le bon moment pour le lancer.')
    : etat && etat.peut ? tr('Une notification à cette heure-là, pour le lancer.') : tr('Le bon moment pour le lancer.');
  return (
    <div style={{ ...RANGEE, borderTop: filet(1) }}>
      <span style={{ flex: 1, minWidth: 0 }}><span style={TITRE}>{titre}</span><span style={SOUS}>{sous}</span></span>
      {!m.enCours && <PuceRappel hass={hass} etat={etat} quand={m.debut} sorte={m.sorte} entite={id} />}
    </div>
  );
}
