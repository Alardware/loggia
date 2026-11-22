/* La feuille d'un switch qui n'est PAS une prise (chantier Prises, P1), et la
 * rangée du minuteur d'extinction qu'elle porte : chargées à la demande
 * (audit des prises, 19/10). Elles vivaient dans App.jsx, au démarrage, alors
 * qu'elles ne servent qu'une fois la feuille ouverte — le démarrage avait
 * dépassé sa borne (tests/lot14_chargement.test.mjs).
 *
 * Ce module n'importe jamais App.jsx : la coquille (`RoomSwitchSheet`, App.jsx)
 * garde la feuille et la frontière Suspense, et lui passe les briques des fiches
 * de là-bas (`briques`, comme `BRIQUES_CAPTEUR`). Ici arrivent le poêle, un
 * radiateur, un relais ; une prise ouvre sa fiche (`FichePrise`). */
import { useState, useEffect, useRef } from 'react';
import { tr, locale } from './i18n.js';
import { useEtatServeur } from './ui.jsx';
import { commanderService } from './actions.js';
import { enPanne } from './outils.js';
import { useOptimiste } from './optimiste.js';
import { texteRefus } from './refus.js';
import { decalageServeur, resteMinuteur, decompte } from './minuteur.js';
import { dureePrise } from './prises.js';
import { DUREES_MINUTEUR, AJOUTS_MINUTEUR } from './prisesfiche.js';
import { LISERE } from './styles.js';

/* ── Le minuteur d'extinction, tenu par Home Assistant (21/09) ─────────────
 * « Pourquoi Loggia doit rester ouvert, c'est absurde, et je n'ai pas le
 * décompte. » Il vivait dans l'onglet — un `setTimeout` : fermer l'écran
 * l'annulait sans rien dire, un autre appareil ne le voyait pas, et la ligne
 * se contentait d'un « dans 30 min » arrondi, relu toutes les 15 s. Il vit
 * maintenant dans le composant (`minuteurs.py`) : il part même quand aucun
 * écran n'est ouvert. L'écran LIT l'heure de fin et compte à la seconde,
 * calé sur l'heure du serveur (`src/minuteur.js`).
 *
 * Sans réponse du composant — trop ancien, pas encore redémarré —, pas de
 * rangée : un minuteur qui mourrait avec l'onglet ne se propose plus. */
/* `mort` (05/10) : l'appareil ne répond plus. Une durée programmerait
 * l'extinction d'une entité morte — elles restent inertes ; un minuteur DÉJÀ
 * posé reste affiché avec « Annuler », pour qu'on puisse l'annuler. Rien en
 * cours : pas de rangée.
 *
 * Le MÊME minuteur que la fiche d'une lumière ou d'une prise (audit du 12/11,
 * lot 4, I5) : l'interrupteur n'avait que « +30 min ». Rien en cours, les
 * quatre durées (`DUREES_MINUTEUR` : 15 min, 30 min, 1 h, 2 h) ; un minuteur
 * qui tourne, « +15 min », « +1 h » (`AJOUTS_MINUTEUR`) et « Annuler ». Les
 * mêmes commandes, `loggia/minuteurs/poser` et `loggia/minuteurs/annuler` ;
 * toutes les puces attendent la réponse d'un appel en vol. La rangée garde ses
 * briques (`FicheRangee`) et ses mots ; les puces passent dessous, sur toute la
 * largeur : quatre ne tiennent pas à droite du titre sur un téléphone. */
const PUCE_MINUTEUR = (peut) => ({ height: 40, padding: '0 8px', borderRadius: 10, border: LISERE, background: 'var(--o-s1)', color: 'var(--o-text1)', fontFamily: 'inherit',
  fontSize: 12.5, fontWeight: 700, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: peut ? 1 : 0.4, cursor: peut ? 'pointer' : 'default' });
// « +15 min », « +1 h » : la phrase entière au catalogue, comme les fins d'une reprise en main du chauffage.
const plusDuree = (n) => (n % 60 ? tr('+{n} min', { n }) : tr('+{h} h', { h: n / 60 }));
export function RangeeMinuteur({ hass, id, mort = false, briques }) {
  const { FicheRangee, FicheValeur, useSeconde } = briques;
  const { etat, setEtat } = useEtatServeur(hass, 'loggia/minuteurs/etat', 15000, '');
  const [decalage, setDecalage] = useState(0);
  const [erreur, setErreur] = useState('');
  const enVol = useRef(false);
  // La référence tranche dans le même tic (B28) ; l'état, lui, rend les puces inertes à l'écran tant que la réponse n'est pas là.
  const [volVu, setVolVu] = useState(false);
  useEffect(() => { if (etat) setDecalage(decalageServeur(etat, Date.now())); }, [etat]);
  const reste = resteMinuteur(etat, id, Date.now(), decalage);
  useSeconde(reste != null);
  if (!etat) return null;
  if (mort && reste == null) return null;
  /* Éteint (`off`, `standby`), l'appareil n'a rien à couper : « +30 min » ne se propose pas — le serveur le refuserait
   * (`minuteur_deja_eteint`, audit du 19/10), et un minuteur posé le couperait de nouveau une fois rallumé. Comme la fiche
   * d'une prise : la rangée le dit. Un minuteur qui tourne garde son « Annuler ». */
  const st = hass && hass.states ? hass.states[id] : null;
  const eteint = !!st && (st.state === 'off' || st.state === 'standby');
  /* Un ordre à la fois (audit du 12/11, B28). Rien ne répondait à l'appui avant la réponse du serveur : deux appuis rapides sur
   * « +30 min » posaient une heure. Le second attend la réponse du premier — la règle de la fiche d'une prise et de celle d'une
   * lumière ; la référence tranche dans le même tic, avant tout rendu. */
  const agir = (msg) => {
    if (enVol.current) return;
    enVol.current = true;
    setVolVu(true);
    hass.callWS(msg)
      .then(r => { setEtat(r); setErreur(''); })
      .catch(e => setErreur((e && e.code === 'unauthorized') ? tr('Ce compte ne pilote pas cet appareil.') : texteRefus(e) || tr('Le minuteur n’a pas pu être enregistré.')))
      .then(() => { enVol.current = false; setVolVu(false); });
  };
  const m = etat.minuteurs && etat.minuteurs[id];
  const fin = reste != null && m ? new Date(Number(m.fin) * 1000).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : null;
  const libre = !volVu;
  // Poser ou prolonger : ni mort, ni éteint — le serveur refuse un minuteur sur un appareil éteint (`minuteur_deja_eteint`).
  const peutPoser = !mort && !eteint && libre;
  const poser = (n) => { if (peutPoser) agir({ type: 'loggia/minuteurs/poser', entity_id: id, minutes: n }); };
  const annuler = () => { if (libre) agir({ type: 'loggia/minuteurs/annuler', entity_id: id }); };
  return (
    <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', paddingBottom: 13 }}>
      {/* À droite du titre, le décompte, à la seconde, en chiffres qui ne dansent pas ; le filet est celui du bloc entier. */}
      <FicheRangee premiere titre={tr('Minuteur')}
        desc={erreur || (fin ? tr('Extinction à {h}', { h: fin }) : eteint ? tr('Disponible une fois l’appareil allumé.') : tr('Aucun minuteur en cours'))}
        droite={reste != null ? <span aria-live="off" aria-label={tr('Temps restant')}><FicheValeur>{decompte(reste)}</FicheValeur></span> : null} />
      {reste != null ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {AJOUTS_MINUTEUR.map(n => <button key={n} type="button" aria-disabled={peutPoser ? undefined : true} onClick={() => poser(n)} style={PUCE_MINUTEUR(peutPoser)}>{plusDuree(n)}</button>)}
          <button type="button" title={tr('Annuler le minuteur')} aria-disabled={libre ? undefined : true} onClick={annuler} style={{ ...PUCE_MINUTEUR(libre), marginLeft: 'auto' }}>{tr('Annuler')}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {DUREES_MINUTEUR.map(n => <button key={n} type="button" aria-disabled={peutPoser ? undefined : true} onClick={() => poser(n)} style={PUCE_MINUTEUR(peutPoser)}>{dureePrise(n)}</button>)}
        </div>
      )}
    </div>
  );
}

/* Le contenu de la feuille : alimenté, le minuteur, le dernier changement. */
export default function FicheSwitchContent({ id, hass, briques }) {
  const { FicheEntete, FicheRangee, FicheIndispo, RmBascule, RangeeDernier, zoneDe } = briques;
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const a = (st && st.attributes) || {};
  const realOn = !!st && st.state === 'on';
  // Même définition que sa carte (RoomGenericCard, CvCard) : `enPanne` (05/10).
  const mort = enPanne(id, st);
  const [ov, setOv] = useOptimiste(realOn);
  const on = ov != null ? ov : realOn;
  const basculer = () => { const nv = !on; setOv(nv); commanderService(hass, id, 'homeassistant', nv ? 'turn_on' : 'turn_off', { entity_id: id }); };
  const nom = a.friendly_name || id;
  const zone = zoneDe(id);
  /* Plus de puissance ni d'énergie (chantier Prises, P1) : un switch qui MESURE
   * est une prise, et ouvre sa fiche. Celui qui arrive ici ne mesure pas — le
   * poêle, dont l'appareil porte les compteurs de toute la maison, y montrait
   * la puissance de la maison. */
  return (<>
    <FicheEntete titre={nom} sous={[zone, mort ? tr('Indisponible') : on ? tr('Allumée') : tr('Éteinte')].filter(Boolean).join(' · ')} id={id} />
    <div style={{ marginTop: 14 }}>
      <FicheRangee premiere panne={mort} titre={tr('Alimentée')} desc={tr('Coupe l’interrupteur, pas l’appareil derrière')} droite={mort ? <FicheIndispo /> : <RmBascule on={on} nom={nom} onToggle={basculer} />} />
      <RangeeMinuteur hass={hass} id={id} mort={mort} briques={briques} />
      <RangeeDernier st={st} />
    </div>
  </>);
}
