/* LA VUE SÉCURITÉ, CHARGÉE À LA DEMANDE (25/10, ADR 0274).
 *
 * Même raison que la vue Énergie (views/energie.jsx) : elle pesait sur le boot
 * de chaque écran. Elle part avec ses tuiles ; ses cartes (alarme, présence,
 * sirène, caméras), que l'Accueil et les pièces affichent aussi, restent dans
 * le monolithe et lui sont prêtées par `OUTILS_VUES`. Code d'App.jsx, déplacé
 * sans retouche. */

import { useState } from 'react';
import { formatEcran } from '../disposition.js';
import { useLoggia, useEntities } from '../runtime.js';
import { Fi, Anim, editBtn, nomCarte } from '../ui.jsx';
import { RoomActivityCard, useDerniersEvenements } from '../historique.jsx';
import { colonnesCam, poserCamDispo, camSerre } from '../camdispo.js';
import { comptesSecurite, tuilesSecurite, resumeSecurite, messageAlarme, estSirene, pointsAttention } from '../attention.js';
import { evenementCamera, detecteursDe, reduireDerniers } from '../evenement.js';
import { cfgVal, cfgSet, loggiaEnt, plateformeDe, secAlarm } from '../state.js';
import { tr } from '../i18n.js';
import { OUTILS_VUES } from '../outilsvues.js';

// Emprunté au monolithe (outilsvues.js) : App.jsx le pose avant le premier rendu.
const {
  BandeauEdition, CameraTile, CardEditSheet, CarteAjout, CarteAttention, ChoixCamDispo,
  ComposeurCartes, CvAlarm, CvPresence, CvSirene, EditableCard, RM_ICO, RoomGenericCard, armCompte,
  cameras, masqueDe, ouvrantsDe, peopleList, sousCamera, useCoarse, useDomainCards,
  useLayoutEditor, useSeconde, useWide,
} = OUTILS_VUES;
// Une liste-fonction se prête appelée (tests/listes_fonctions.test.mjs).
const CAMERAS = () => cameras();

/* LA LIGNE D'ETAT de la securite (ADR 0028) : une tuile par famille presente
 * — portes, fenetres, mouvement, cameras —, le meme dessin sur l'Accueil et
 * dans la vue Securite (ADR 0033). `onTuile(t)` recoit la tuile cliquee :
 * l'Accueil mene a la vue, la vue defile jusqu'a la section. */
function TuilesSecurite({ tuiles, onTuile = null }) {
  if (!tuiles || !tuiles.length) return null;
  return (
    <div className="grid-sec-etat" style={{ display: 'grid', gridTemplateColumns: 'repeat(' + tuiles.length + ', minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
      {tuiles.map(t => {
        const col = t.alerte ? 'var(--o-warn)' : t.actif ? 'var(--o-accent-soft)' : 'var(--o-text)';
        const fond = t.alerte ? 'rgba(var(--o-warn-rgb),.16)' : t.actif ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s2)';
        return (
          /* Son nom est ce qu'elle affiche, par `nomCarte` comme toute carte
           * (lot 13 de l'audit du 03/10) : « Portes, 3/4 fermées ». Le point
           * médian collé en dur faisait une règle à part, et « Mouvement ·
           * Aucun mouvement » finissait sur une espace — au repos, le libellé
           * est vide. Aucune commande dedans : elle reste un bouton. */
          <button key={t.cle} type="button" className="sec-tuile" onClick={() => onTuile && onTuile(t)} aria-label={nomCarte(t.nom, t.valeur + ' ' + t.libelle)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', color: 'var(--o-text)', textAlign: 'left', minWidth: 0 }}>
            <span className="sec-ico" style={{ ...RM_ICO(fond, col), width: 30, height: 30, borderRadius: 10 }}><Fi i={t.icone} size={14} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="sec-nom" style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nom}</span>
              <span className="sec-val" style={{ display: 'block', fontSize: 13, fontWeight: 800, color: col, whiteSpace: 'nowrap' }}>{t.valeur} <span className="sec-lib" style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text2)' }}>{t.libelle}</span></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Les etats qui valent « quelque chose se passe » : ceux d'un binary_sensor,
// plus `home` pour une personne. Partages entre la lecture du direct et le
// comptage de l'historique, qui doivent s'accorder.
const ACTIFS = ['on', 'true', 'True', 'detected', 'Detected', 'home'];

function SecuriteContent({ hass, edit = false, onEnt, onNav = null }) {
  const S = (hass && hass.states) || {};
  const isOn = id => { const s = id && S[id]; return !!(s && ACTIFS.indexOf(s.state) >= 0); };
  // ── Sources : configuration utilisateur d'abord, découverte ensuite ──
  const { resolved } = useLoggia();
  const alarmCfg = useEntities('alarm', null);
  const rAlarm = (resolved && resolved.alarm && resolved.alarm.available) ? resolved.alarm : null;
  const rCams = (resolved && resolved.cameras && resolved.cameras.available) ? resolved.cameras.list : [];
  // Le choix FRAIS de l'utilisateur (Paramètres → Entités, `loggia_alarm`)
  // prime sur l'héritage `loggia_entities.alarm` : l'ancien ordre gardait la
  // vieille entité (UniFi Protect…) après un changement de panneau (Alarmo),
  // et les commandes partaient vers le mauvais système.
  const alarmId = (secAlarm() && S[secAlarm()]) ? secAlarm() : (alarmCfg && S[alarmCfg]) ? alarmCfg : (rAlarm ? rAlarm.main : null);
  // Une seule source : la résolution, qui prend déjà la liste de l'utilisateur
  // quand il en a une, et la complète par les détecteurs du même appareil.
  const camList = rCams.map(c => ({
    haid: c.haid || c.id, label: c.label || c.name,
    motion: c.motion, person: c.person, vehicle: c.vehicle, sonnette: c.sonnette, colis: c.colis,
    preset: c.preset,
  })).filter(c => c && c.haid);
  // Le dernier declenchement de chaque detecteur, par le journal (ADR 0031).
  const derniersCams = useDerniersEvenements(hass, camList.flatMap(c => detecteursDe(c).map(d => d.id)), reduireDerniers);
  /* LE MEME LANGAGE QUE L'ACCUEIL (ADR 0033) : les comptes et la ligne d'etat
   * de la carte Securite, les points « A surveiller » qui touchent a la
   * securite (les etats et les cameras — pas le CO2 ni les piles, qui ont
   * leur place ailleurs), et les fiches des ouvrants. Une tuile de la ligne
   * d'etat defile jusqu'a sa section. */
  const dc = useDomainCards(hass, { onNav });
  // Les cameras comptees comme sur l'Accueil : la liste de l'utilisateur
  // (`loggia_cameras`, une camera sans entite y compte comme hors ligne),
  // sinon celles de la resolution — memes chiffres des deux cotes.
  const camsCfg = (() => { try { const c = cfgVal('loggia_cameras', null); const l = Array.isArray(c) ? c.filter(x => x && typeof x === 'object') : []; return l.length ? l : null; } catch { return null; } })();
  const camsInfoSec = (camsCfg || camList).map(c => ({ nom: c.name || c.label, online: S[c.haid] ? S[c.haid].state !== 'unavailable' : c.online !== false }));
  const comptesSecVue = comptesSecurite(S, camsInfoSec, { plateforme: plateformeDe, masque: masqueDe });
  const tuilesSecVue = tuilesSecurite(comptesSecVue);
  const pointsSec = pointsAttention({ S, cams: camsInfoSec, plateforme: plateformeDe, masque: masqueDe });
  const defiler = (cle) => {
    const el = document.getElementById(cle === 'cameras' ? 'sec-cameras' : cle === 'mouvement' ? 'sec-journal' : 'sec-ouvrants');
    // Un saut net, pas un glissement : le glissement est ignore par certains
    // navigateurs integres, et la section se cale sous l'en-tete fixe.
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
  };
  // Même source que l'accueil : une personne ne peut pas exister ici et pas là.
  const secPeople = peopleList().filter(p => p && p.haid);
  // ── Alarme : l'état du panneau, tel quel. Les gestes (armer, code,
  // décompte) vivent dans la carte Alarme, la même que le catalogue (ADR 0034).
  const alarmRaw = (alarmId && S[alarmId]) ? S[alarmId].state : null;
  const alarm = alarmRaw == null ? 'unknown'
    : (alarmRaw === 'armed_away' || alarmRaw === 'armed_vacation') ? 'away'
      : alarmRaw === 'armed_home' ? 'home'
        : alarmRaw === 'armed_night' ? 'night'
          : alarmRaw === 'triggered' ? 'triggered' : 'off';
  const arming = alarmRaw === 'arming' || alarmRaw === 'pending';
  const triggered = alarm === 'triggered';

  // ── Caméras : live + détections ──
  const cams = camList.map((c, ci) => {
    const s = S[c.haid];
    const online = s ? (s.state !== 'unavailable' && s.state !== 'unknown') : false;
    // La detection en cours, sinon le dernier declenchement du journal, sinon
    // rien : la meme sous-ligne que la tuile de l'Accueil (ADR 0031).
    const ev = evenementCamera(c, S, derniersCams);
    const active = !!(ev && ev.enCours);
    const preset = CAMERAS()[(c.preset != null ? c.preset : ci) % CAMERAS().length];
    return {
      haid: c.haid, hass, online, label: c.label || '', active, evenement: ev,
      tag: online ? 'LIVE · ' + String(c.label || '').toUpperCase() : tr('HORS LIGNE'),
      grad: preset.grad, glow: preset.glow,
      sub: sousCamera(online, ev),
    };
  });
  const anyMotion = cams.some(c => c.online && c.active);
  /* Combien par ligne (20/09) : la cle de la maison, lue par type d'ecran —
   * exactement celle de l'Accueil, pour que les deux vues se ressemblent. */
  const formatCam = formatEcran(useCoarse(), useWide(1180));
  const [camDispo, setCamDispo] = useState(() => cfgVal('loggia_camdispo', null));
  const poserCam = (id) => {
    const n = poserCamDispo(camDispo, formatCam, id);
    setCamDispo(n);
    cfgSet({ loggia_camdispo: n });
  };

  // ── Présence ──
  const people = secPeople.map(p => ({ name: p.name, home: isOn(p.haid) }));

  // ── État global ──
  const unknownState = alarm === 'unknown';
  const heroTitle = unknownState ? tr('État inconnu') : triggered ? tr('Alarme déclenchée') : anyMotion ? tr('Mouvement détecté') : tr('Tout est calme');
  const statusCol = unknownState ? 'var(--o-text3-rgb)' : triggered ? 'var(--o-bad-rgb)' : alarm !== 'off' ? 'var(--o-warn-rgb)' : 'var(--o-ok-rgb)';

  const cs = a => `rgb(${a})`;
  const ca = (a, al) => `rgba(${a},${al})`;
  // Décompte d'armement : le temps qui reste pour sortir, battu à la seconde.
  const cptAlarme = armCompte(alarmId ? S[alarmId] : null);
  useSeconde(!!cptAlarme);
  const armMot = cptAlarme ? tr('activation dans {n} s', { n: cptAlarme.reste }) : tr('activation en cours');
  const alarmWord = arming ? armMot : triggered ? tr('déclenchée') : alarm === 'unknown' ? tr('état inconnu')
    : alarm === 'away' ? tr('armée · absent') : alarm === 'home' ? tr('armée · présent') : alarm === 'night' ? tr('armée · nuit') : tr('désarmée');
  /* TROIS CARTES a la place du bandeau (ADR 0034) : l'alarme — la carte
   * « Alarme (seule) » du catalogue, avec son message —, les sirenes de la
   * maison, et qui est la. Chacune n'existe que si son entite existe. */
  // Le domaine `siren`, un interrupteur nomme sirene, ou celle que l'utilisateur
  // a choisie (`loggia_entities.sirene`) — beaucoup de sirenes Zigbee
  // n'arrivent qu'en `switch` (retour user du 16/09 : « je n'ai pas la carte
  // sirene »).
  const sireneChoisie = loggiaEnt('sirene', null);
  const sirenes = [...(sireneChoisie && S[sireneChoisie] ? [sireneChoisie] : []), ...Object.keys(S).filter(id => id !== sireneChoisie && S[id] && estSirene(id, S[id]))];
  const msgAlarme = messageAlarme(alarmId ? S[alarmId] : null, comptesSecVue, S);
  /* MODE EDITION, le meme que les autres vues (ADR 0036) : la decouverte
   * propose — l'alarme, les sirenes, la presence, puis les ouvrants sous leur
   * titre (les ouverts d'abord) —, l'utilisateur dispose : ordre, retrait,
   * nom, largeur, ajout, titres. L'agencement vit dans `loggia_seclayout`,
   * perimetre `securite`. */
  const ouvrantsIds = [...ouvrantsDe(S)].sort((a, b) => (b.on ? 1 : 0) - (a.on ? 1 : 0)).map(o => o.id);
  const derivesSec = [...(alarmId ? [alarmId] : []), ...sirenes, ...(people.length ? ['carte:presence'] : []), ...(ouvrantsIds.length ? ['sect:ouvrants', ...ouvrantsIds] : [])];
  const ed = useLayoutEditor('loggia_seclayout', 'securite', derivesSec);
  const [cardEdit, setCardEdit] = useState(null);
  const [addSheet, setAddSheet] = useState(false);
  const origineDe = (k) => {
    if (k === 'sect:ouvrants') return tr('Ouvrants');
    if (k.indexOf('sect:') === 0) return k.slice(5) || tr('Section');
    if (k === 'carte:presence') return tr('Présence');
    return (S[k] && S[k].attributes && S[k].attributes.friendly_name) || k;
  };
  const nomDe = (k) => ed.labelOf(k) || origineDe(k);
  const addSection = () => ed.toggle('sect:' + Date.now().toString(36));
  const blocs = [];
  ed.ids.forEach(k => {
    if (k.indexOf('sect:') === 0) blocs.push({ titre: k, cartes: [] });
    else { if (!blocs.length) blocs.push({ titre: null, cartes: [] }); blocs[blocs.length - 1].cartes.push(k); }
  });
  // La carte d'une cle : l'alarme et la sirene ont la leur, la presence aussi,
  // un ouvrant prend la carte illustree des pieces, le reste passe par la fabrique.
  const carteSec = (k) => {
    if (k.indexOf('alarm_control_panel.') === 0) return <CvAlarm id={k} hass={hass} sans message={k === alarmId ? msgAlarme : null} label={ed.labelOf(k)} />;
    if (k === 'carte:presence') return <CvPresence hass={hass} />;
    if (S[k] && estSirene(k, S[k])) return <CvSirene id={k} hass={hass} label={ed.labelOf(k)} />;
    if (k.indexOf('binary_sensor.') === 0) return <RoomGenericCard id={k} hass={hass} onOpen={dc.ouvrir} label={ed.labelOf(k)} />;
    return dc.card(k, ed.labelOf(k));
  };

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {edit && <BandeauEdition ed={ed} onAjouter={() => setAddSheet(true)} onEnt={onEnt} />}
      <div className="o-obj-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Sécurité')}</h1>
          {/* L'etat en une seconde, les mots de la carte Securite de l'Accueil (ADR 0033). */}
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 5, color: comptesSecVue.ok ? 'var(--o-ok)' : 'var(--o-warn)' }}>{tr('Alarme')} {alarmWord} · {resumeSecurite(comptesSecVue)}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: ca(statusCol, .14), color: cs(statusCol) }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: cs(statusCol), animation: triggered ? 'pulse 1.2s infinite' : 'none' }} />{heroTitle.toUpperCase()}</span>
      </div>
      {/* La ligne d'etat de l'Accueil, tuile par tuile ; chacune defile jusqu'a sa section. */}
      {tuilesSecVue.length > 0 && <div style={{ marginTop: -14 }}><TuilesSecurite tuiles={tuilesSecVue} onTuile={(t) => defiler(t.cle)} /></div>}

      {/* « A surveiller », comme sur l'Accueil : seulement quand il y a un
        * point, et seulement ceux de la securite (ADR 0033). Un point qui
        * mene ici reste ici. */}
      {pointsSec.length > 0 && <CarteAttention points={pointsSec} onNav={(v) => { if (v !== 'securite' && onNav) onNav(v); }} />}

      {/* LES CARTES, editables comme dans les autres vues (ADR 0036) : l'alarme
        * (la carte du catalogue, avec son message), les sirenes, la presence,
        * puis les ouvrants un par un — la carte des pieces, la porte ou la
        * fenetre dessinee en fond. En edition : glisser, retirer, renommer,
        * elargir, ajouter une carte ou un titre. Le bandeau est en tete de
        * la vue, comme partout (17/09). */}
      <div ref={ed.gridRef} id={ed.ids.indexOf('sect:ouvrants') < 0 ? 'sec-ouvrants' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {blocs.map((bloc, bi) => {
          if (!edit && bloc.titre && !bloc.cartes.length) return null;
          const titre = bloc.titre ? (
            <div id={bloc.titre === 'sect:ouvrants' ? 'sec-ouvrants' : undefined} style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{nomDe(bloc.titre)}</div>
          ) : null;
          // UNE grille pour toute la vue, celle des objets : 225 px, deux colonnes au
          // telephone et sur tablette, rangees de 184 px. L'alarme, la sirene et la
          // presence avaient la leur (250 px, une colonne de 362 px au telephone) :
          // « trop large », elles ne respectaient pas les dimensions (retour du 17/09).
          return (
            <div key={bloc.titre || 'b' + bi} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {bloc.titre && (edit ? <EditableCard plat ed={ed} id={bloc.titre} nom={nomDe(bloc.titre)} onEdit={setCardEdit}>{titre}</EditableCard> : titre)}
              <div className="grid-objets" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(225px,1fr))', gridAutoRows: 'minmax(184px, auto)', gap: 16, alignItems: 'stretch' }}>
                {bloc.cartes.map(k => edit
                  ? <EditableCard key={k} ed={ed} id={k} nom={nomDe(k)} onEdit={setCardEdit} hass={hass} taille={false} />
                  : <Anim key={k} i={ed.ids.indexOf(k)} className={ed.estLarge(k) ? 'o-cvw2' : ''}><div style={{ height: '100%', minHeight: 184 }}>{carteSec(k)}</div></Anim>)}
                {edit && bi === blocs.length - 1 && <CarteAjout onClick={() => setAddSheet(true)} />}
              </div>
            </div>
          );
        })}
        {edit && !blocs.length && <CarteAjout onClick={() => setAddSheet(true)} />}
      </div>

      <div id="sec-cameras" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Caméras en direct')}</span>
        <span style={{ flex: 1 }} />
        {/* Le meme reglage que l'Accueil, la meme cle : disposer ici dispose
          * partout, pour ce type d'ecran (20/09). */}
        {cams.length > 1 && <ChoixCamDispo valeur={camDispo} format={formatCam} onChoisir={poserCam} />}
      </div>
      <div className={'grid-sec-cams' + (camSerre(colonnesCam(camDispo, formatCam), formatCam) ? ' o-cams-serre' : '')} style={{ display: 'grid', gridTemplateColumns: `repeat(${colonnesCam(camDispo, formatCam)},minmax(0,1fr))`, gap: 16 }}>
        {cams.map((c, i) => <Anim key={c.haid || c.id} i={i} base={140}><CameraTile c={c} /></Anim>)}
      </div>

      {/* Le journal de ce qui touche à la sécurité : ouvrants, mouvements,
        * alarme et caméras — la carte des pièces, restreinte à ces entités. */}
      <div id="sec-journal">
        <RoomActivityCard hass={hass} max={12} titre={tr('Journal de la sécurité')} sous={tr('Ouvrants, mouvements et alarme — 24 h, en direct')}
          ids={[...ouvrantsDe(S).map(o => o.id), ...(alarmId ? [alarmId] : []), ...camList.map(c => c.haid).filter(Boolean), ...camList.flatMap(c => detecteursDe(c).map(d => d.id)), ...people.map(p => p.haid).filter(Boolean)]} />
      </div>
      {/* Les fiches des ouvrants : sans elles, une carte cliquee resterait muette. */}
      {dc.sheets}
      {cardEdit && <CardEditSheet ed={ed} id={cardEdit} nom={nomDe(cardEdit)} origine={origineDe(cardEdit)} hass={hass} onClose={() => setCardEdit(null)} />}
      {addSheet && <ComposeurCartes hass={hass} dc={dc} present={ed.ids} onToggle={ed.toggle} entete={tr('Ajouter une carte')} composites={false}
        pied={<button onClick={addSection} style={editBtn(false)}>{tr('Ajouter un titre')}</button>}
        domaines={['binary_sensor', 'lock', 'siren', 'switch', 'alarm_control_panel', 'sensor', 'camera']} onClose={() => setAddSheet(false)} />}
    </div>
  );
}

export { SecuriteContent };
