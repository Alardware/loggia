/* La carte « Pendant votre absence », en tête du rail de l'Accueil (05/11, étape 3 du rapport sur l'usage).
 *
 * La règle vit dans `absence.js` ; ici, la lecture et la carte. Deux lectures de l'historique au plus, et seulement
 * quand quelqu'un part ou rentre : la présence sur sept jours, puis, s'il y a eu une absence, ce qui s'est passé
 * pendant. Les machines viennent des cycles que le serveur garde déjà (`loggia/prises/etat`). Fermée d'un geste, la
 * carte ne revient qu'après le départ suivant — « fermée » est retenu par cet écran. */
import { useEffect, useRef, useState } from 'react';
import { tr } from '../i18n.js';
import { Ico } from '../icones.jsx';
import { Fi } from '../ui.jsx';
import { CARTE_RAIL } from '../styles.js';
import { getHass, LOGGIA_INDEX, plateformeDe, secAlarm } from '../state.js';
import { masqueDe } from '../app/noyau.jsx';
import { useLecturePrises } from '../prisesetat.js';
import { NOMS_PRISE, TYPES_PRISE } from '../prises.js';
import { evenementsPorte, ICONES_DETECTION } from '../evenement.js';
import { ICONES_ATTENTION } from '../attention.js';
import {
  LECTURE_MS, MAX_LIGNES, lireHistorique, sujetsAbsence, avecEtatActuel, derniereAbsence, encoreFraiche,
  entitesAbsence, faitsAbsence, faitsCycles, trierFaits, texteFait, heureDe,
} from '../absence.js';

const CLE_VUE = 'loggia-absence-vue';
// Une adresse raisonnable : quarante entités par lecture.
const PAQUET = 40;
const RELIRE_MS = 10 * 60000;
/* La dernière lecture, pour qu'un retour à l'Accueil ne relise pas tout : `{ sig, t, res }`. */
let MEMOIRE = null;

const lireVue = () => { try { return localStorage.getItem(CLE_VUE) || ''; } catch { return ''; } };

async function series(h, ids, t0, t1) {
  const out = {};
  for (let i = 0; i < ids.length; i += PAQUET) {
    const lot = ids.slice(i, i + PAQUET);
    const q = 'history/period/' + new Date(t0).toISOString() + '?filter_entity_id=' + lot.map(encodeURIComponent).join(',')
      + '&end_time=' + encodeURIComponent(new Date(t1).toISOString()) + '&minimal_response&no_attributes';
    Object.assign(out, lireHistorique(await h.callApi('GET', q)));
  }
  return out;
}

async function lire(h) {
  const S = h.states;
  const maintenant = Date.now();
  const sujets = sujetsAbsence(S, secAlarm());
  if (!sujets) return null;
  const presence = avecEtatActuel(await series(h, sujets.ids, maintenant - LECTURE_MS, maintenant), S, sujets.ids);
  const abs = derniereAbsence(presence, sujets.ids, sujets.absent, maintenant);
  if (!abs) return null;
  const entites = entitesAbsence(S, { porte: evenementsPorte(LOGGIA_INDEX), plateforme: plateformeDe, masque: masqueDe });
  const ids = Object.keys(entites).sort();
  const s = ids.length ? await series(h, ids, abs.debut, abs.fin) : {};
  return { ...abs, faits: faitsAbsence({ ...abs, series: s, entites }) };
}

/** `{ debut, fin, lignes, fermer }` quand il y a quelque chose à dire d'une absence finie, null sinon. */
export function useAbsence(hass, actif = true) {
  const S = hass && hass.states;
  const api = !!(hass && typeof hass.callApi === 'function');
  const sujets = S ? sujetsAbsence(S, secAlarm()) : null;
  // Qui est là, en une chaîne : un départ ou un retour relance la lecture.
  const sig = sujets ? sujets.ids.map(id => id + '=' + (sujets.absent(String(S[id].state)) ? 0 : 1)).join(',') : '';
  /* L'index arrive après le premier rendu : sans lui, la sonnette et le colis ne seraient pas reconnus, et la lecture
   * gardée jusqu'au prochain départ les aurait oubliés. On l'attend. */
  const indexPret = !!(LOGGIA_INDEX && LOGGIA_INDEX.entityMeta);
  const hRef = useRef(null);
  /* Sans tableau : à chaque rendu, avant l'effet de lecture déclaré plus bas (le motif de `useEtatServeur`). */
  useEffect(() => { hRef.current = hass; });
  const [res, setRes] = useState(() => (MEMOIRE && MEMOIRE.sig === sig ? MEMOIRE.res : null));
  const [vue, setVue] = useState(lireVue);
  const prises = useLecturePrises(actif && !!res);
  useEffect(() => {
    if (!actif || !api || !sig || !indexPret) return undefined;
    let mort = false;
    // Lue il y a peu pour la même présence : l'état initial l'a déjà reprise.
    if (MEMOIRE && MEMOIRE.sig === sig && Date.now() - MEMOIRE.t < RELIRE_MS) return undefined;
    const h = hRef.current || getHass();
    if (!h || !h.states) return undefined;
    lire(h).then(r => { MEMOIRE = { sig, t: Date.now(), res: r }; if (!mort) setRes(r); })
      .catch(() => { /* l'historique ne répond pas : la carte attend le prochain départ ou retour */ });
    return () => { mort = true; };
  }, [actif, api, sig, indexPret]);
  if (!actif || !res || !encoreFraiche(res) || vue === String(res.fin)) return null;
  const nomMachine = (id, type) => NOMS_PRISE()[type] || ((S && S[id] && S[id].attributes && S[id].attributes.friendly_name) || id);
  const lignes = trierFaits([...res.faits, ...faitsCycles(prises && prises.etat, res, nomMachine)]);
  if (!lignes.length) return null;
  const fermer = () => {
    const v = String(res.fin);
    try { localStorage.setItem(CLE_VUE, v); } catch { /* écran sans stockage : fermée jusqu'au rechargement */ }
    setVue(v);
  };
  return { debut: res.debut, fin: res.fin, lignes, fermer };
}

const ICONE = { sonnette: ICONES_DETECTION.sonnette, colis: ICONES_DETECTION.colis, mouvement: ICONES_DETECTION.motion, alarme: ICONES_ATTENTION.alarme };
const iconeDe = (l) => (l.genre === 'ouverture' ? (l.famille === 'fenetres' ? ICONES_ATTENTION.fenetres : ICONES_ATTENTION.ouvrant)
  : l.genre === 'machine' ? ((TYPES_PRISE[l.type] && TYPES_PRISE[l.type].ico) || 'plug') : ICONE[l.genre]);

/** La carte, au gabarit des panneaux du rail : titre, période, une ligne par fait, six au plus. */
export function CarteAbsence({ absence }) {
  if (!absence) return null;
  const maintenant = Date.now();
  const vues = absence.lignes.slice(0, MAX_LIGNES);
  const reste = absence.lignes.length - vues.length;
  return (
    <section aria-label={tr('Pendant votre absence')} style={{ ...CARTE_RAIL, padding: '13px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{tr('Pendant votre absence')}</span>
        <button type="button" onClick={absence.fermer} aria-label={tr('Masquer')} title={tr('Masquer')}
          style={{ width: 28, height: 28, margin: '-4px -6px -4px 0', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--o-text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Fi i="cross-small" size={13} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--o-text2)', fontWeight: 600, margin: '2px 0 4px' }}>
        {tr('De {debut} à {fin}', { debut: heureDe(absence.debut, maintenant), fin: heureDe(absence.fin, maintenant) })}
      </div>
      {vues.map(l => {
        const t = texteFait(l, maintenant);
        return (
          <div key={l.genre + ':' + l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <span aria-hidden="true" style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: l.genre === 'alarme' ? 'var(--o-bad)' : 'var(--o-text2)' }}>
              <Ico name={iconeDe(l)} size={14} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titre}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.detail}</div>
            </div>
          </div>
        );
      })}
      {reste > 0 && (
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', padding: '8px 0 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>{tr('{n} autres', { n: reste })}</div>
      )}
    </section>
  );
}
