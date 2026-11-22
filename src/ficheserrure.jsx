/* ── La fiche d'une serrure (maquettes du 14/09 ; chantier du 20/11, A4 ; ADR 0386) ──
 *
 * Chargée à la demande (`RoomLockSheet`, appareils/fiches.jsx) : le démarrage n'en porte que la coquille. Une feuille SANS
 * onglets, à la hauteur de son contenu, UNE croix (l'en-tête commun) :
 *  - « Verrouillée » : la bascule, comme avant. BLOQUÉE (`jammed`), la phrase le dit : le pêne est coincé à mi-course ;
 *  - LE CODE : une serrure qui publie `code_format` refuse `lock`, `unlock` et `open` sans lui — Home Assistant lève une erreur
 *    et la porte ne bouge pas. La fiche le demande AVANT d'agir, avec le pavé de l'alarme (`SaisieCodeAlarme`). Le code n'est
 *    jamais gardé : tapé, envoyé, oublié. Un code par défaut réglé dans Home Assistant ne se voit pas d'ici : le pavé le
 *    demande quand même ;
 *  - « Ouvrir » : tirer le pêne (`lock.open`), SEULEMENT si la serrure le déclare (`supported_features`, bit 1 — Nuki, Tedee,
 *    Matter…). Deux appuis (« Confirmer ? », 4 s, `BoutonConfirme`), puis le code s'il en faut un : la porte s'ouvre pour de bon ;
 *  - la pile et le dernier changement, comme avant.
 */
import { useState } from 'react';
import { tr } from './i18n.js';
import { commanderService } from './actions.js';
import { useOptimiste } from './optimiste.js';
import { enPanne } from './outils.js';
import { RmBascule } from './cartes/briques.jsx';
import { SaisieCodeAlarme } from './cartescustom/cartes.jsx';
import { BoutonConfirme } from './fichecommune.jsx';
import { FicheEntete, FicheRangee, FicheIndispo, RangeePile, RangeeDernier, pileDe, zoneDe } from './appareils/fiches.jsx';

/** Le bit « ouvrir » de `LockEntityFeature` (Home Assistant, `lock/const.py`). */
const SERRURE_OUVRE = 1;
/** La serrure sait-elle tirer son pêne ? Son `supported_features`, jamais son nom. */
const serrureOuvre = (st) => !!st && !!st.attributes && (Number(st.attributes.supported_features) & SERRURE_OUVRE) === SERRURE_OUVRE;

const MOTS_SERRURE = () => ({ locked: tr('Verrouillée'), unlocked: tr('Déverrouillée'), locking: tr('Verrouillage…'), unlocking: tr('Déverrouillage…'), jammed: tr('Bloquée'), open: tr('Ouverte'), opening: tr('Ouverture…') });

export default function FicheSerrure({ id, hass }) {
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const s2 = st ? st.state : null;
  const [ov, setOv] = useOptimiste(s2);
  const locked = ov != null ? ov : s2 === 'locked';
  // Le geste qui attend son code : `lock`, `unlock` ou `open` — le pavé s'ouvre sous sa rangée.
  const [demande, setDemande] = useState(null);
  const [code, setCode] = useState('');
  const envoyer = (svc, c = null) => {
    if (svc !== 'open') setOv(svc === 'lock');
    commanderService(hass, id, 'lock', svc, { entity_id: id, ...(c ? { code: c } : {}) });
  };
  const agir = (svc) => { if (a.code_format) { setDemande(svc); setCode(''); } else envoyer(svc); };
  const valider = () => { if (!code || !demande) return; envoyer(demande, code); setDemande(null); setCode(''); };
  const nom = a.friendly_name || id;
  // `enPanne`, comme sa carte (05/10) : morte, ni bascule ni « Ouvrir » — elles enverraient dans le vide.
  const mort = enPanne(id, st);
  const etat = mort ? tr('Indisponible') : MOTS_SERRURE()[s2] || String(s2);
  const bloquee = !mort && s2 === 'jammed';
  const ouvre = !mort && serrureOuvre(st);
  const pave = (svcs) => (!mort && svcs.indexOf(demande) >= 0 ? (
    <div style={{ padding: '0 0 13px' }}>
      <SaisieCodeAlarme code={code} setCode={setCode} onValider={valider} onAnnuler={() => setDemande(null)} />
    </div>
  ) : null);
  return (
    <>
      <FicheEntete titre={nom} sous={[zoneDe(id), etat].filter(Boolean).join(' · ')} id={id} />
      <div style={{ marginTop: 14 }}>
        <FicheRangee premiere panne={mort} titre={tr('Verrouillée')}
          desc={bloquee ? tr('Le pêne est coincé : rien ne tient la porte') : tr('Le pêne bouge tout de suite ; l’état revient du moteur')}
          droite={mort ? <FicheIndispo /> : <RmBascule on={locked} nom={nom} onToggle={() => agir(locked ? 'unlock' : 'lock')} />} />
        {pave(['lock', 'unlock'])}
        {ouvre && <FicheRangee titre={tr('Ouvrir')} desc={tr('Tire le pêne : la porte s’ouvre')}
          droite={<BoutonConfirme libelle={tr('Ouvrir')} nom={tr('Ouvrir') + ' ' + nom} onConfirme={() => agir('open')} />} />}
        {ouvre && pave(['open'])}
        <RangeePile n={pileDe(S, id)} />
        <RangeeDernier st={st} />
      </div>
    </>
  );
}
