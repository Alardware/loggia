/* ── La popup d'une vanne (chantier IoT, étape 3 ; sa maquette « Cartes IoT », 1f ; I27, I28, I29, I30, I31, I32, I33) ──────────
 *
 * Chargée à la demande (App.jsx, `FicheVanne`) : le démarrage n'en porte que l'adresse. Une feuille SANS onglets, à la hauteur de
 * son contenu :
 *  - l'en-tête commun (`EnteteFiche`) : la plaque de la carte, le nom, « {pièce} · vanne d'eau », l'épingle, UNE croix ;
 *  - le panneau de tête dit POURQUOI (I28, le carnet du serveur) : « Fermée » (28 / 800, rouge sur fuite) et « Depuis 14:02 · fuite
 *    Sous l'évier », « · fermée à la main », « · par la maison », « · sur l'appareil » — sur le rouge à 0,08 après une fuite ; sa
 *    puce de 44 px : « Fermer l'eau » d'un appui (le sens sûr), « Rouvrir l'eau », qui DEMANDE après une fuite — « Le détecteur
 *    {nom} est sec depuis 14:40. La fuite est réparée ? » · « Pas encore » · « Oui, rouvrir l'eau » — et tant qu'un détecteur voit
 *    de l'eau : « {nom} voit encore de l'eau. Rouvrir quand même ? » ; et « Rouvrir l'eau ? » tant que le carnet ne dit pas pourquoi
 *    elle est fermée (passe bis : muet, pas lu, en retard). La personne décide, la maison jamais. La question posée par une carte
 *    étroite — ou par un appui qui voulait rallumer la prise-vanne (`question`) — est là à l'ouverture. Pendant que la vanne tourne,
 *    la puce reste, choisie et inerte ;
 *  - « DÉTECTEURS DE FUITE » : le résumé, une rangée par détecteur — « Cuisine · pile 76 % · sec depuis 14:40 » —, « Sec » NEUTRE ;
 *  - « Fermer en cas de fuite » (I29) : la bascule de « Vanne d'eau coupée », qui quitte Paramètres. Un administrateur la règle par
 *    la commande ÉTROITE (`loggia/eau/regle`, eauetat.js) ; la rangée attend tant que l'état du serveur n'est pas lu (« … ») ; un
 *    refus nomme la clé ; un compte ordinaire lit « Activé » / « Désactivé » (I32). Sans vanne choisie, la phrase d'I30 ;
 *  - « JOURNAL DU JOUR » (I28) : les plus récentes d'abord ; une personne se nomme par la règle commune ;
 *  - en pied, « L'appareil » : la fiche universelle, par-dessus.
 * Une autre vanne (I31) : la tête et sa puce seulement — ouvrir le gaz demande « Ouvrir le gaz ? ».
 */
import { useState } from 'react';
import { tr } from './i18n.js';
import { Fi, Bascule, BottomSheet } from './ui.jsx';
import { LOGGIA_INDEX, cfgVal, plateformeDe, compteOrdinaire } from './state.js';
import { plantsCfg } from './lectures.js';
import { pickSibling } from './discovery.js';
import { LISERE } from './styles.js';
import { raisonEchec } from './refus.js';
import { personnesDe } from './prisesfiche.js';
import { EnteteFiche, PETITES_CAPITALES } from './fichecommune.jsx';
import { vueVanne, vanneDesignee, questionVanne, teteVanne, rangeesDetecteurs, resumeDetecteurs, journalEau } from './eau.js';
import { useEtatEau, useGesteVanne, commanderVanne, prendreQuestion, reglerFermerSurFuite, useHassEau } from './eauetat.js';

const PANNEAU = { marginTop: 12, borderRadius: 18, background: 'var(--o-s3)', border: LISERE, overflow: 'hidden' };
const RANGEE = { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' };
const PUCE = { height: 44, padding: '0 14px', borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', flexShrink: 0 };
const DOUX = { ...PUCE, height: 40, fontSize: 12, background: 'var(--o-s2)', color: 'var(--o-text1)' };
const PLEIN = { ...DOUX, background: 'var(--o-accent-fond)', color: '#fff' };

const pieceDe = (id) => (LOGGIA_INDEX && typeof LOGGIA_INDEX.areaNameOf === 'function' ? LOGGIA_INDEX.areaNameOf(id) : null);
const pileDe = (S) => (id) => { const sid = pickSibling(LOGGIA_INDEX, S, id, { domain: 'sensor', deviceClass: 'battery' }); const n = sid && S[sid] ? parseFloat(S[sid].state) : NaN; return isNaN(n) ? null : Math.round(n); };

export function ContenuVanne({ id, hass: vue, onFiche = null, epingle = null, question = false }) {
  const hass = useHassEau(vue, id);
  const S = (hass && hass.states) || {};
  const st = S[id] || null;
  const nomDe = (x) => (S[x] && S[x].attributes && S[x].attributes.friendly_name) || x;
  const designee = vanneDesignee(cfgVal('loggia_alertes', null));
  // `suivre` : quand la vanne change d'état, le carnet se relit aussitôt (passe bis, point 3).
  const { etat, erreur } = useEtatEau(true, { fiche: true, suivre: st ? st.state : null });
  const enVol = useGesteVanne(id, st);
  // La question posée par une carte étroite (eauetat.js), ou par un appui qui voulait rallumer la prise-vanne (`question`, App.jsx).
  const [demande, setDemande] = useState(() => prendreQuestion(id) || question);
  const [envoi, setEnvoi] = useState(false);
  const [err, setErr] = useState('');
  const maintenant = Date.now();
  const v = vueVanne({ id, S, etat, designee, plateforme: plateformeDe, plantes: plantsCfg().map(p => p.base).filter(Boolean), enVol, maintenant });
  const eau = v.genre === 'eau';
  const tete = teteVanne(v, etat && etat.vannes ? etat.vannes[id] : null, maintenant);
  const geste = v.geste;
  // En vol, ou la vanne qui tourne (`closing`, `opening` ; passe bis, point 2) : la puce reste, choisie, et ne fait rien.
  const inerte = !!enVol || !!(geste && geste.inerte);
  const enQuestion = demande && !!geste && !!geste.demander && !inerte;
  const q = enQuestion ? questionVanne(v, { detecteurs: (etat && etat.detecteurs) || {}, noms: Object.fromEntries(v.detecteurs.map(d => [d, nomDe(d)])), maintenant }) : null;
  const zone = pieceDe(id);
  const genre = eau ? tr('vanne d’eau') : v.genre === 'gaz' ? tr('vanne de gaz') : tr('vanne');
  const rangees = eau ? rangeesDetecteurs(v.detecteurs, S, (etat && etat.detecteurs) || {}, { piece: pieceDe, pile: pileDe(S), maintenant }) : [];
  const journal = eau ? journalEau(etat && etat.journal, [id, ...v.detecteurs], { personnes: personnesDe(S), nomDe, pieceDe }) : [];
  const regle = etat && etat.regle ? etat.regle : null;
  const admin = !compteOrdinaire(hass);
  const appui = () => {
    if (!geste || inerte) return;
    if (geste.demander) { setDemande(true); return; }
    commanderVanne(hass, id, geste.sens, st);
  };
  const regler = () => {
    if (!regle || envoi) return;
    setEnvoi(true); setErr('');
    reglerFermerSurFuite(hass, !regle.actif).catch((e) => setErr(raisonEchec(e, 'loggia_alertes'))).finally(() => setEnvoi(false));
  };
  const muet = !regle && erreur;
  return (
    <div>
      <EnteteFiche nom={v.nom} epingle={epingle} plaque={{ fond: v.plaque[0], encre: v.plaque[1], icone: 'water' }}
        sousNom={zone ? zone + ' · ' + genre : genre.charAt(0).toUpperCase() + genre.slice(1)} />
      {/* La tête : le mot, pourquoi, la puce ; la question dans le même panneau. */}
      <div data-tete="" style={{ marginTop: 18, padding: 18, borderRadius: 18, background: tete.alerte ? 'rgba(var(--o-bad-rgb),.08)' : 'var(--o-s3)', border: LISERE }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, color: v.fuite ? 'var(--o-bad)' : 'var(--o-text)' }}>{tete.mot}</div>
            {tete.phrase && <div style={{ fontSize: 12.5, fontWeight: 600, color: v.mouillees.length && v.sens === 'ouverte' ? 'var(--o-bad)' : 'var(--o-text2)', marginTop: 6 }}>{tete.phrase}</div>}
          </div>
          {geste && !q && (
            <button type="button" onClick={appui} aria-label={geste.mot + ' ' + v.nom} aria-disabled={inerte ? 'true' : undefined}
              style={{ ...PUCE, ...(inerte || (!geste.rouge) ? { background: 'var(--o-accent-fond)', color: '#fff' } : { background: 'var(--o-s1)', color: 'var(--o-bad)' }) }}>
              <Fi i="water" size={13} />{geste.mot}
            </button>
          )}
        </div>
        {q && (
          <div role="group" aria-label={q.texte} style={{ marginTop: 16, padding: '14px 16px', borderRadius: 14, background: 'var(--o-s1)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{q.texte}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" style={DOUX} onClick={() => setDemande(false)}>{q.non}</button>
              <button type="button" style={PLEIN} onClick={() => { setDemande(false); commanderVanne(hass, id, geste.sens, st); }}>{q.oui}</button>
            </div>
          </div>
        )}
      </div>
      {eau && rangees.length > 0 && (
        <div data-detecteurs="" style={PANNEAU}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '14px 16px 8px' }}>
            <div style={PETITES_CAPITALES}>{tr('Détecteurs de fuite')}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-text2)' }}>{resumeDetecteurs(rangees)}</div>
          </div>
          {rangees.map(r => (
            <div key={r.id} style={RANGEE}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.nom}</div>
                {r.ligne.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>
                  {r.ligne.map((x, i) => <span key={i} style={x.encre ? { color: x.encre } : null}>{(i ? ' · ' : '') + x.texte}</span>)}
                </div>}
              </div>
              <span data-etat-detecteur="" style={{ fontSize: 13, fontWeight: 800, color: r.encre }}>{r.etat}</span>
            </div>
          ))}
        </div>
      )}
      {eau && (
        <div data-regle="" style={{ ...PANNEAU, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', overflow: 'visible' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{tr('Fermer en cas de fuite')}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 2 }}>{tr('Coupe l’arrivée dès qu’un détecteur voit de l’eau')}</div>
            {regle && regle.toutes && regle.vannes.length > 1 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{tr('Faute d’en avoir choisi une, la maison ferme toutes les vannes d’eau en cas de fuite')}</div>}
            {regle && regle.entite && regle.entite !== id && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 4 }}>{tr('En cas de fuite, la maison ferme {nom}.', { nom: nomDe(regle.entite) })}</div>}
            {regle && !regle.reagit && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn)', marginTop: 4 }}>{tr('La maison ne réagit plus aux dangers : Paramètres › Alertes.')}</div>}
            {muet && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn)', marginTop: 4 }}>{tr('Le carnet de l’eau ne répond pas : Home Assistant doit être redémarré après la mise à jour.')}</div>}
            {err && <div role="status" style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-warn)', marginTop: 4 }}>{err}</div>}
          </div>
          {!regle ? <span aria-busy="true" style={{ fontSize: 13, fontWeight: 800, color: 'var(--o-text3)' }}>…</span>
            : admin ? <span aria-busy={envoi ? 'true' : undefined}><Bascule on={!!regle.actif} nom={tr('Fermer en cas de fuite')} cb={regler} /></span>
              : <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--o-text2)' }}>{regle.actif ? tr('Activé') : tr('Désactivé')}</span>}
        </div>
      )}
      {journal.length > 0 && (
        <div style={PANNEAU}>
          <div style={{ padding: '14px 16px 8px', ...PETITES_CAPITALES }}>{tr('Journal du jour')}</div>
          {journal.map((l, i) => (
            /* La grille des manœuvres d'un volet (`o-volet-manoeuvre`, index.css) : au téléphone, la pastille passe SOUS le texte — à côté,
             * « Automatisierung » écrasait « Wasser abgedreht » à 390 px. */
            <div key={i} data-ligne="" className="o-volet-manoeuvre" style={{ padding: '11px 16px', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{l.heure}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{l.quoi}</span>
                {l.note && <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{l.note}</span>}
              </span>
              <span data-qui="" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999, background: 'var(--o-s1)', color: 'var(--o-text1)', fontSize: 11.5, fontWeight: 800 }}>
                <Fi i={l.glyphe} size={11} />{l.qui}
              </span>
            </div>
          ))}
        </div>
      )}
      {onFiche && (
        <button type="button" onClick={() => onFiche(id)} style={{ ...PANNEAU, ...RANGEE, borderTop: LISERE, width: '100%', cursor: 'pointer', color: 'var(--o-text)', fontFamily: 'inherit', textAlign: 'left' }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{tr('L’appareil')}</span><Fi i="angle-small-right" size={14} />
        </button>
      )}
    </div>
  );
}

/** La feuille : son contenu, et la fiche universelle par-dessus (`Appareil`, la `FicheAppareil` d'App.jsx) ; `Epingle`, le
 *  `BoutonEpingle` d'App.jsx. */
export default function FicheVanne({ id, hass, onClose, Appareil = null, Epingle = null, question = false }) {
  const [fiche, setFiche] = useState(false);
  return (
    <BottomSheet onClose={onClose}>
      {() => (<>
        <ContenuVanne id={id} hass={hass} question={question} epingle={Epingle ? <Epingle id={id} /> : null} onFiche={Appareil ? () => setFiche(true) : null} />
        {fiche && Appareil && <Appareil id={id} hass={hass} onClose={() => setFiche(false)} />}
      </>)}
    </BottomSheet>
  );
}
