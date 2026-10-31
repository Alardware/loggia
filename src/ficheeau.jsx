/* ── La popup de l'eau chaude (chantier G3, E2 ; ADR 0302) ───────────────────
 *
 * Chargée à la demande (`FicheEauChaude`, cartes/eauborne.jsx). Une feuille SANS
 * onglets, à la hauteur de son contenu, UNE croix (celle de l'en-tête commun) :
 *  - la tête : la température de l'eau en grand, la consigne et le mode ;
 *    « Arrêter » / « Mettre en marche » quand l'appareil sait le faire ;
 *  - « Consigne » : − et +, au pas de l'appareil, DANS ses bornes (`min_temp`,
 *    `max_temp` — Home Assistant refuse ce qui en sort) :
 *    `water_heater.set_temperature` ;
 *  - « Mode » : une `ListeChoix`, jamais la liste native du navigateur — les modes
 *    standard traduits (`modeChauffeEau`, G1), ceux du fabricant tels quels :
 *    `set_operation_mode` ;
 *  - « Mode absence pendant les vacances » : l'option du serveur (chauffage,
 *    `eau_chaude.absence`), DÉCOCHÉE par défaut. Un administrateur la règle ;
 *    un compte ordinaire lit « Activé » / « Désactivé » ;
 *  - en pied, « L'appareil » : la fiche universelle, par-dessus.
 * Les valeurs qu'on vient de demander s'affichent tout de suite et expirent
 * (`useOptimiste`) : un appareil qui ne répond pas ne garde pas une consigne
 * qu'il n'a jamais prise.
 */
import { useState } from 'react';
import { tr } from './i18n.js';
import { Fi, Bascule, ListeChoix } from './ui.jsx';
import { LOGGIA_INDEX, compteOrdinaire } from './state.js';
import { LISERE } from './styles.js';
import { nombre } from './format.js';
import { commanderService } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { raisonEchec } from './refus.js';
import { useEtatChauffage, commanderChauffage } from './chauffageetat.js';
import { EnteteFiche, PETITES_CAPITALES } from './fichecommune.jsx';
import { vueEauChaude, bornerConsigne, ordreMarche } from './eauchaude.js';
import { modeChauffeEau } from './objets.js';

const PANNEAU = { marginTop: 12, borderRadius: 18, background: 'var(--o-s3)', border: LISERE, overflow: 'hidden' };
const RANGEE = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' };
const PUCE = { height: 44, padding: '0 14px', borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 };
const ROND = { width: 44, height: 44, borderRadius: 12, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', color: 'var(--o-text1)', fontFamily: 'inherit', flexShrink: 0 };

const pieceDe = (id) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(id) : null);
// Au dixième, dans la langue de l'écran (`nombre`, format.js), comme la phrase de la carte.
const degres = (v) => (v == null ? '—' : nombre(v, 1, 0) + '°');

export default function FicheEau({ id, hass, onFiche = null, epingle = null, Glyphe = null }) {
  const S = (hass && hass.states) || {};
  const v = vueEauChaude({ id, S });
  const [ovConsigne, poserConsigne] = useOptimiste(v.consigne);
  const [ovMode, poserMode] = useOptimiste(v.mode);
  const consigne = ovConsigne != null ? ovConsigne : v.consigne;
  const mode = ovMode != null ? ovMode : v.mode;
  const { etat } = useEtatChauffage(v.sait.absence);
  const option = etat && etat.eau_chaude ? !!etat.eau_chaude.absence : null;
  const admin = !compteOrdinaire(hass);
  const [envoi, setEnvoi] = useState(false);
  const [err, setErr] = useState('');
  const zone = pieceDe(id);
  const genre = tr('chauffe-eau');
  const marche = ordreMarche(id, v, !v.marche);

  const regler = (pas) => {
    const base = consigne != null ? consigne : (v.min != null ? v.min : null);
    const cible = bornerConsigne(base + pas, v.min, v.max, v.pas);
    if (cible == null || cible === consigne) return;
    poserConsigne(cible);
    commanderService(hass, id, 'water_heater', 'set_temperature', { entity_id: id, temperature: cible });
  };
  const choisirMode = (m) => {
    if (!m || m === mode) return;
    poserMode(m);
    commanderService(hass, id, 'water_heater', 'set_operation_mode', { entity_id: id, operation_mode: m });
  };
  const basculer = () => {
    if (!marche) return;
    const [dom, service, data] = marche;
    if (data.operation_mode) poserMode(data.operation_mode);
    commanderService(hass, id, dom, service, data);
  };
  const reglerOption = () => {
    if (option == null || envoi) return;
    setEnvoi(true); setErr('');
    commanderChauffage(hass, { type: 'loggia/chauffage/config', patch: { eau_chaude: { absence: !option } } })
      .catch((e) => setErr(raisonEchec(e, 'loggia_chauffage')))
      .finally(() => setEnvoi(false));
  };
  const enMarche = mode != null ? mode !== 'off' : v.marche;
  const phrase = [consigne != null ? tr('Consigne {t}', { t: degres(consigne) }) : null, mode ? modeChauffeEau(mode) : null, v.absence ? tr('Absence') : null].filter(Boolean).join(' · ');

  return (
    <div>
      <EnteteFiche nom={v.nom} epingle={epingle}
        plaque={{ fond: v.plaque[0], encre: v.plaque[1], icone: 'raindrops', glyphe: Glyphe ? <Glyphe id={id} size={18}><Fi i="raindrops" size={18} /></Glyphe> : null }}
        sousNom={zone ? zone + ' · ' + genre : genre.charAt(0).toUpperCase() + genre.slice(1)} />
      <div data-tete="" style={{ marginTop: 18, padding: 18, borderRadius: 18, background: v.chauffe ? 'rgba(var(--o-orange-rgb),.08)' : 'var(--o-s3)', border: LISERE }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...PETITES_CAPITALES }}>{tr('Température de l’eau')}</div>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, marginTop: 4, fontVariantNumeric: 'tabular-nums', color: v.mort ? 'var(--o-text3)' : 'var(--o-text)' }}>{v.mort ? tr('Indisponible') : degres(v.actuelle)}</div>
            {!v.mort && <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6 }}>{enMarche ? phrase : tr('Arrêt')}</div>}
          </div>
          {marche && !v.mort && (
            <button type="button" onClick={basculer} aria-label={(enMarche ? tr('Arrêter') : tr('Mettre en marche')) + ' ' + v.nom}
              style={{ ...PUCE, ...(enMarche ? { background: 'var(--o-s1)', color: 'var(--o-text1)' } : { background: 'var(--o-accent-fond)', color: '#fff' }) }}>
              <Fi i="power" size={13} />{enMarche ? tr('Arrêter') : tr('Mettre en marche')}
            </button>
          )}
        </div>
      </div>
      {v.sait.consigne && !v.mort && (
        <div data-consigne="" style={PANNEAU}>
          <div style={RANGEE}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{tr('Consigne')}</div>
              {v.min != null && v.max != null && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tr('De {min} à {max}', { min: degres(v.min), max: degres(v.max) })}</div>}
            </div>
            <button type="button" style={ROND} aria-label={tr('Baisser la consigne')} disabled={consigne != null && v.min != null && consigne <= v.min} onClick={() => regler(-v.pas)}><Fi i="minus-small" size={16} /></button>
            <span aria-live="polite" style={{ minWidth: 56, textAlign: 'center', fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{degres(consigne)}</span>
            <button type="button" style={ROND} aria-label={tr('Monter la consigne')} disabled={consigne != null && v.max != null && consigne >= v.max} onClick={() => regler(v.pas)}><Fi i="plus-small" size={16} /></button>
          </div>
        </div>
      )}
      {v.sait.mode && !v.mort && (
        <div data-mode="" style={{ ...PANNEAU, overflow: 'visible' }}>
          <div style={RANGEE}>
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>{tr('Mode')}</div>
            <ListeChoix value={mode} options={v.modes} onChange={choisirMode} label={tr('Mode')} recherche={false} />
          </div>
        </div>
      )}
      {v.sait.absence && (
        <div data-option="" style={{ ...PANNEAU, overflow: 'visible' }}>
          <div style={RANGEE}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{tr('Mode absence pendant les vacances')}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tr('Levé douze heures avant le retour, pour retrouver l’eau chaude')}</div>
              {option == null && etat && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn)', marginTop: 4 }}>{tr('Home Assistant doit être redémarré après la mise à jour.')}</div>}
              {err && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn)', marginTop: 4 }}>{err}</div>}
            </div>
            {option == null ? <span aria-busy="true" style={{ fontSize: 13, fontWeight: 800, color: 'var(--o-text3)' }}>…</span>
              : admin ? <span aria-busy={envoi ? 'true' : undefined}><Bascule on={option} nom={tr('Mode absence pendant les vacances')} cb={reglerOption} /></span>
                : <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--o-text2)' }}>{option ? tr('Activé') : tr('Désactivé')}</span>}
          </div>
        </div>
      )}
      {onFiche && (
        <button type="button" onClick={() => onFiche(id)} style={{ ...PANNEAU, ...RANGEE, width: '100%', cursor: 'pointer', color: 'var(--o-text)', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{tr('L’appareil')}</span><Fi i="angle-small-right" size={14} />
        </button>
      )}
    </div>
  );
}
