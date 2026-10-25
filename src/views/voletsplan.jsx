/* ── La vue « modes et planning » des volets (chantier Volets, V4) ──────────
 *
 * Sortie du démarrage le 19/10 (patch 2 de l'audit des volets) : avec lui,
 * `boot-*.js` passait de 1 098 850 à 1 102 553 octets, au-delà de la borne de
 * tests/lot14_chargement.test.mjs. La vue n'est pas à l'Accueil : elle se
 * charge à la demande (`lazyRecharge`, ADR 0145), comme Paramètres.
 *
 * Le texte de `VoletsContent` est celui d'App.jsx (sa coquille, `VoletsView`, y reste, avec son `<Suspense>`), à l'octet
 * près. Ce qu'ils y prenaient d'interne — composants, crochets, aides — leur
 * est POSÉ au chargement par App.jsx (`poserKit`), sous les mêmes noms : un
 * morceau chargé à la demande n'importe jamais App.jsx.
 */
import { useEffect, useMemo, useState } from 'react';
import { Anim, Fi, editBtn } from '../ui.jsx';
import { commanderService } from '../actions.js';
import { compteOrdinaire } from '../state.js';
import { coverFerme, estMuetVolet, estVolet } from '../voletecran.js';
import { ecrireRegle, raisonEchec } from '../refus.js';
import { gestesCover } from '../outils.js';
import { ordreEtArret, ordreEtCourse } from '../voletcourse.js';
import { rafraichirVolets } from '../voletsetat.js';
import { tr, trN } from '../i18n.js';
import { useOptimiste } from '../optimiste.js';
import { voletMode } from '../lectures.js';

/* Ce qu'App.jsx pose avant le premier rendu. */
let BandeauEdition, BarGroup, CardEditSheet, CarteAjout, ComposeurCartes, EditableCard, ViewBar, ViewHead, barBtn, envoyerGeste, useDomainCards, useLayoutEditor, voletCovers, voletModes, voletsCommandables;
export function poserKit(k) {
  ({ BandeauEdition, BarGroup, CardEditSheet, CarteAjout, ComposeurCartes, EditableCard, ViewBar, ViewHead, barBtn, envoyerGeste, useDomainCards, useLayoutEditor, voletCovers, voletModes, voletsCommandables } = k);
}

/* `embarque` : rendu comme SECTION de la vue Climatisation — un intertitre
 * « Volets » à la façon des sections de la vue Appareils, la barre d'actions
 * et les cartes ; ni grand titre, ni carte de synthèse (le confort n'a qu'une
 * vue, elle a déjà les siens). */
export function VoletsContent({ hass, edit = false, onEnt, embarque = false }) {
  const S = (hass && hass.states) || null;
  const derivedCovers = voletCovers(S).map(c => { const e = S && S[c.haid]; const a = e && e.attributes; const pos = a && a.current_position; return { ...c, pos: pos != null ? pos : (e && e.state === 'open' ? 100 : e && e.state === 'closed' ? 0 : 50) }; });
  const csig = derivedCovers.map(c => c.id + ':' + c.pos).join('|');
  /* « Tout ouvrir / tout fermer » et le mode de l'installation passent par le
   * filet commun (lot 15 de l'audit du 03/10) : recopiés dans un état local,
   * ils ne se recalaient que si HA bougeait — un refus laissait « tous
   * fermés » et le mode choisi allumé jusqu'au changement de page. */
  const [ovPos, poserPos] = useOptimiste(csig);
  const covers = ovPos != null ? derivedCovers.map(c => ({ ...c, pos: ovPos })) : derivedCovers;
  // Meme raison qu'au volet isole : aucun mode invente.
  const haMode = (S && S[voletMode()] && S[voletMode()].state) || null;
  const [ovModeHa, setModeLocal] = useOptimiste(haMode);
  const mode = ovModeHa != null ? ovModeHa : haMode;
  /* Le mode que LOGGIA tient, quand c'est lui qui fait le planning. Tant que
   * la regle dort, on continue d'afficher l'`input_select` de l'installation :
   * c'est lui qui commande, et le remplacer par des boutons sans effet serait
   * mentir sur qui pilote. */
  const [modeLoggia, setModeLoggia] = useState(null);
  /* Le mode DEMANDÉ, le temps de la réponse (audit du 03/10). Le choix
   * s'écrivait droit dans `modeLoggia`, et le `catch` d'un refus recopiait
   * l'état sur lui-même : le bouton restait allumé jusqu'au sondage suivant —
   * quinze secondes —, puis revenait seul, sans un mot, pendant que les volets
   * se fermaient le soir selon l'ancien mode. Il passe donc par le filet
   * commun, qui expire, et qu'un échec efface tout de suite. */
  const [ovMode, poserMode] = useOptimiste(modeLoggia);
  const modeAffiche = ovMode != null ? ovMode : modeLoggia;
  const connecte = !!hass;
  useEffect(() => {
    if (!hass || typeof hass.callWS !== 'function') return undefined;
    let vivant = true;
    const lire = () => hass.callWS({ type: 'loggia/volets/etat' })
      .then(r => {
        const p = (r && r.config && r.config.planning) || null;
        if (vivant) setModeLoggia(p && p.actif ? (p.mode || 'auto') : null);
      })
      .catch(() => { if (vivant) setModeLoggia(null); });
    lire();
    const t = setInterval(lire, 15000);
    return () => { vivant = false; clearInterval(t); };
  }, [connecte]);
  const MODES_LOGGIA = () => [
    { id: 'auto', label: tr('Auto lever/coucher') },
    { id: 'nuit', label: tr('Fermeture nuit') },
    { id: 'manuel', label: tr('Manuel') },
  ];
  /* Un refus — `loggia/volets/config` est réservé aux administrateurs de Home
   * Assistant — remonte au toast global en NOMMANT la clé où le composant
   * range ces règles (ADR 0046, 0125), et l'ancien mode revient sous le
   * doigt. Rien n'est masqué : un compte ordinaire voit la barre, et apprend
   * pourquoi son choix n'a pas pris.
   *
   * Le succès se lit dans la RÉPONSE : attendre le sondage ferait revenir
   * l'ancien bouton quand le filet expire (6 s), jusqu'à la relecture
   * suivante (15 s). */
  const pickModeLoggia = (m) => {
    poserMode(m);
    ecrireRegle(hass, 'loggia/volets/config', { planning: { mode: m } }, { cle: 'loggia_volets', annuler: () => poserMode(null) })
      .then((r) => {
        const p = r && r.config && r.config.planning;
        if (p) setModeLoggia(p.actif ? (p.mode || 'auto') : null);
        // Le cache des cartes se relit aussitôt (audit du 19/10).
        if (r) rafraichirVolets();
      });
  };

  // Agencement : la découverte propose, l'utilisateur dispose.
  const nbEntites = Object.keys(S).length;
  const derivedX = useMemo(() => {
    const dejaLa = voletCovers(S).map(c => c.haid).filter(Boolean);
    return [...dejaLa, ...Object.keys(S).filter(k => k.indexOf('cover.') === 0 && dejaLa.indexOf(k) < 0).sort()];
  }, [nbEntites, csig]);
  const ed = useLayoutEditor('loggia_coverlayout', 'volets', derivedX);
  const dc = useDomainCards(hass);
  const [cardEdit, setCardEdit] = useState(null);
  const [addSheet, setAddSheet] = useState(false);
  const origineDe = (k) => {
    if (k.indexOf('sect:') === 0) return k.slice(5) || tr('Section');
    const st = hass && hass.states && hass.states[k];
    return (st && st.attributes && st.attributes.friendly_name) || k;
  };
  const nomDe = (k) => ed.labelOf(k) || origineDe(k);
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));
  const blocs = [];
  ed.ids.forEach(k => {
    if (k.indexOf('sect:') === 0) blocs.push({ titre: k, cartes: [] });
    else {
      if (!blocs.length) blocs.push({ titre: null, cartes: [] });
      blocs[blocs.length - 1].cartes.push(k);
    }
  });

  const call = (d, s, data) => commanderService(hass, (data || {}).entity_id, d, s, data || {});
  /* Ouvrir, Fermer, Stop (19/10) : un ordre à chaque volet vivant, celui qu'il ACCEPTE (`gestesCover`), et sa course — comme
   * l'en-tête d'Objets : chez lui, sans elle, les cartes restaient figées une à trois minutes. Un refus de Home Assistant
   * oublie la course de ce volet ; Stop fige celles qui bougent. */
  const chaqueVolet = (cle, faire) => voletsCommandables(S).filter(c => !estMuetVolet(S[c.haid]) && gestesCover(S[c.haid])[cle])
    .filter(c => faire(c.haid, S[c.haid], envoyerGeste(hass, c.haid, gestesCover(S[c.haid])[cle])) != null).length;
  const allOpen = () => { if (chaqueVolet('monter', (id, st, envoi) => ordreEtCourse(id, 100, st, envoi))) poserPos(100); };
  const allClose = () => { if (chaqueVolet('descendre', (id, st, envoi) => ordreEtCourse(id, 0, st, envoi))) poserPos(0); };
  const allStop = () => { chaqueVolet('stop', ordreEtArret); };
  /* Le mode de LOGGIA s'écrit dans `loggia/volets/config`, réservé aux administrateurs : un compte ordinaire le lit, ses
   * boutons sont inertes, et un appui dit le refus, qui nomme la clé — comme la fiche d'un volet (V10, ADR 0144). */
  const ordinaire = compteOrdinaire(hass);
  const [refusMode, setRefusMode] = useState(null);
  const pickMode = (m) => { setModeLocal(m); call('input_select', 'select_option', { entity_id: voletMode(), option: m }); };

  // Le mode tel qu'il se DIT : son libellé dans la liste, ou rien. Un état que
  // la liste ne connaît pas (`unavailable`, `unknown`) n'est pas un mode.
  const nomDuMode = (voletModes(S).find(m => m.id === mode) || {}).label || null;

  // « n ouverts » : le meme verdict que les cartes, sinon un volet qui bute a
  // 1 % se comptait comme ouvert dans le resume de la vue.
  // Et les VOLETS seulement (audit du 19/10) : un garage ou un groupe n'en est
  // pas un, et un volet muet, compté à 50 %, se disait « ouvert ».
  const volets = covers.filter(c => S && estVolet(S[c.haid]));
  const nVolets = volets.length;
  const openCount = volets.filter(c => !estMuetVolet(S[c.haid]) && !coverFerme(S[c.haid], c.pos)).length;

  return (
    <div className="loggia-content" style={{ padding: embarque ? '0 28px 40px' : '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {edit && <BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} ajouterLabel={tr('Ajouter un volet')} onEnt={onEnt} />}
      {embarque
        /* L'intertitre de la vue Appareils : icône + titre serif — et les
         * chips de MODE à droite, seule commande qui n'a pas de carte. */
        ? <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>
              <Fi i="blinds" size={16} color="var(--o-purple)" />{tr('Volets')}
            </span>
            <span style={{ flex: 1 }} />
            {voletModes(S).length > 0 && voletMode() && voletModes(S).map(m => (
              <button key={m.id} onClick={() => pickMode(m.id)} style={barBtn(mode === m.id)}>{m.label}</button>
            ))}
          </div>
        : <ViewHead titre={tr('Volets')}
            /* Le NOM du mode, jamais l'état brut. Une installation dont
             * l'entité de mode est indisponible affichait « 2 volets ·
             * unavailable » — un mot de Home Assistant, en anglais, dans une
             * ligne qui se lit (vu chez l'utilisateur le 26/09). */
            sous={trN(nVolets, '{n} volet', '{n} volets') + (nomDuMode ? ' · ' + String(nomDuMode).toLowerCase() : '')}
            /* « tous fermés » se SAIT : pas sans volet, ni quand l'un d'eux est muet (19/10, comme l'en-tête d'Objets). */
            badge={openCount ? trN(openCount, '{n} ouvert', '{n} ouverts') : nVolets && !volets.some(c => estMuetVolet(S[c.haid])) ? tr('tous fermés') : null}
            rgb={openCount ? 'var(--o-ok-rgb)' : 'var(--o-text3-rgb)'} />}

      {!embarque && <ViewBar>
        <BarGroup label={tr('Volets')}>
          <button onClick={allOpen} style={barBtn(false)}>{tr('Ouvrir')}</button>
          <button onClick={allStop} style={barBtn(false)}>{tr('Stop')}</button>
          <button onClick={allClose} style={barBtn(false)}>{tr('Fermer')}</button>
        </BarGroup>
        {modeLoggia !== null ? (
          <BarGroup label={tr('Mode')}>
            {MODES_LOGGIA().map(m => <button key={m.id} aria-pressed={modeAffiche === m.id} aria-disabled={ordinaire || undefined}
              onClick={() => { if (ordinaire) setRefusMode(raisonEchec(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }), 'loggia_volets')); else pickModeLoggia(m.id); }}
              style={{ ...barBtn(modeAffiche === m.id), ...(ordinaire ? { cursor: 'default', opacity: modeAffiche === m.id ? 1 : .4 } : null) }}>{m.label}</button>)}
          </BarGroup>
        ) : (voletModes(S).length > 0 && voletMode() && (
          <BarGroup label={tr('Mode')}>
            {voletModes(S).map(m => <button key={m.id} onClick={() => pickMode(m.id)} style={barBtn(mode === m.id)}>{m.label}</button>)}
          </BarGroup>
        ))}
      </ViewBar>}
      {!embarque && refusMode && modeLoggia !== null && <div role="alert" style={{ marginTop: -12, fontSize: 12.5, fontWeight: 700, color: 'var(--o-bad)' }}>{refusMode}</div>}

      {!embarque && (edit || ed.ids.length > 0) && (
        <div style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Volet par volet')}</div>
      )}
      <div ref={ed.gridRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {blocs.map((bloc, bi) => {
          if (!edit && bloc.titre && !bloc.cartes.length) return null;
          return (
            <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {bloc.titre && (edit
                ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '9px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(nomDe(bloc.titre)).toUpperCase()}</span>
                      <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                    </div>
                  </EditableCard>
                : <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '4px 0 0' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)' }}>{String(nomDe(bloc.titre)).toUpperCase()}</span>
                    <span style={{ height: 1, flex: 1, background: 'var(--o-bd3)' }} />
                  </div>)}
              <div className="grid-roomdev grid-dense" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(232px,1fr))', columnGap: 16, rowGap: 8 }}>
                {bloc.cartes.map(k => {
                  const compacte = ed.estCompact(k);
                  const carte = compacte ? dc.compact(k, ed.labelOf(k)) : dc.card(k, ed.labelOf(k));
                  if (!edit) return <Anim key={k} i={ed.ids.indexOf(k)} className={(ed.estLarge(k) ? 'o-cvw2 ' : '') + (compacte ? 'o-cvrow1' : '')}>{carte}</Anim>;
                  return <EditableCard key={k} ed={ed} id={k} nom={nomDe(k)} onEdit={setCardEdit} hass={hass}>{carte}</EditableCard>;
                })}
                {edit && bi === blocs.length - 1 && <CarteAjout onClick={() => setAddSheet(true)} label={tr('Ajouter un volet')} />}
              </div>
            </div>
          );
        })}
      </div>
      {dc.sheets}
      {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}
      {addSheet && <ComposeurCartes hass={hass} present={ed.ids} onToggle={ed.toggle} entete={tr('Ajouter un volet')} composites={false}
        pied={<button onClick={addSection} style={editBtn(false)}>{tr('Ajouter un titre')}</button>}
        domaines={['cover']} onClose={() => setAddSheet(false)} />}
    </div>
  );
}
