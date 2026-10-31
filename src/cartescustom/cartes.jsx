/* Les cartes des vues personnalisées dont les cartes et les fiches se servent : `CvCard`, les caméras, l'alarme.
 * Sorti d’App.jsx tel quel (lot 5 de l’audit du 28/10, ADR 0283) : seuls les imports sont neufs. */
import { useState, useRef, useEffect, Suspense } from 'react';
import { LOGGIA_INDEX, cfgVal } from '../state.js';
import { versHex, lisibleSurLavis } from '../contraste.js';
import { enPanne, gestesCover, positionPubliee } from '../outils.js';
import { LAVIS } from '../theme.js';
import { cameraModes } from '../discovery.js';
import { commanderService, estVanneCarte, commander } from '../actions.js';
import { cleCamera } from '../present.js';
import { Fi, BottomSheet, ListeChoix, CV_DOM_ICON, cvDomain, cvName, Surface, nomCarte } from '../ui.jsx';
import { appuiBascule } from '../prises.js';
import { luminosite, teinteDeCarte, phraseLumiere, lavisLumiere, capacitesLumiere } from '../lumieres.js';
import { pourcentTexte } from '../lecteur.js';
import { iconeMesure, cleMesure } from '../confort.js';
import { phraseChauffeEau, chauffeEauEnChauffe } from '../objets.js';
import { motPresence } from '../presence.js';
import { useOptimiste } from '../optimiste.js';
import { CamLive } from '../camera.jsx';
import { ICONES_ARMEMENT, couleurPile, CLASSES_OUVRANT } from '../attention.js';
import { LISERE } from '../styles.js';
import { relTime, fmtWatts } from '../format.js';
import { estVolet, vueVolet, coverActif, coverOuvert, iconeSelonEtat } from '../voletecran.js';
import { useCourseVolet, ordreEtArret, ordreEtCourse } from '../voletcourse.js';
import { useEtatVolets, voletDe } from '../voletsetat.js';
import { teinteClimat } from '../chauffageecran.js';
import { Ico } from '../icones.jsx';
import { depuis } from '../evenement.js';
import { tr, locale, trSens, trN } from '../i18n.js';
import { iconeChoisie, cvEstLumiere, priseDe, useGardeSwitch, estClair, decMax, lavisCarte, SURF_CARTE, hx, useAgenda } from '../app/noyau.jsx';
import { FicheEntete, zoneDe, FicheRangee, FicheValeur, FicheBouton, Epingles, FeuilleCalendrierContent } from '../appareils/fiches.jsx';
import { RmBascule, RM_ICO, GlypheCarte, RM_NAME, RM_SUB, RM_BTN } from '../cartes/briques.jsx';
import { RM_INERTE } from '../cartes/chauffage.jsx';
import { CarteVanne } from '../cartes/distributeur.jsx';
import { CarteEauChaude } from '../cartes/eauborne.jsx';
import { useVueLumiere } from '../cartes/lumiere.jsx';
import { useVueLecteur, CarteEnfant } from '../cartes/media.jsx';
import { useVueMesure, estMesure } from '../cartes/mesure.jsx';
import { useVuePrise, useDemandeCoupure } from '../cartes/prise.jsx';
import { useVueRobot } from '../cartes/robot.jsx';
import { envoyerGeste } from '../cartes/volet.jsx';

/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const CAMERAS = () => [
  { cle: 'demo-entree', label: tr('Entrée'), tag: 'LIVE · ' + tr('Entrée').toUpperCase(), grad: 'linear-gradient(180deg,#6ba8d8 0%,#9cc4e0 42%,#7a8a5c 60%,#56683f 100%)', glow: 'radial-gradient(120% 80% at 50% 18%,rgba(255,255,255,.18),transparent 55%)', sub: <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--o-lampe)" strokeWidth="2.4" strokeLinecap="round"><path d="M13 2L3 14h7l-1 8 11-13h-7z" /></svg>{tr('Mouvement il y a 3 min')}</> },
  { cle: 'demo-facade', label: tr('Façade'), tag: 'LIVE · ' + tr('Façade').toUpperCase(), grad: 'linear-gradient(180deg,#5e94c4 0%,#86b06f 38%,#6f7e4a 62%,#4a5a36 100%)', glow: 'radial-gradient(120% 80% at 60% 22%,rgba(255,255,255,.16),transparent 55%)', sub: <><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--o-ok)' }} />{tr('RAS · véhicule présent')}</> },
];

// ── Snapshot proxy authentifié (repli) ──

/* La tuile d'une camera, telle que l'Accueil la dessine : le nom, le badge
 * LIVE, la teinte de repli de la liste, le point d'etat. La fiche reprend la
 * meme tuile — le flux se voit partout de la meme facon (retour user du 14/09 :
 * « reprends la meme chose que les cameras sur l'accueil »). */
/* La sous-ligne d'une tuile camera (ADR 0031) : hors ligne ; la detection en
 * cours (point ambre, rouge pour la sonnette) ; sinon le dernier evenement du
 * journal et depuis quand ; sinon « Direct ». Le meme mot partout — l'Accueil,
 * la vue Securite, la fiche. `ev` vient d'`evenementCamera`, ou vaut null. */
const POINT_CAMERA = (fond) => ({ width: 7, height: 7, borderRadius: '50%', background: fond });
function sousCamera(online, ev) {
  if (!online) return <><span style={POINT_CAMERA('var(--o-bad)')} />{tr('Hors ligne')}</>;
  if (!ev) return <><span style={POINT_CAMERA('var(--o-ok)')} />{tr('Direct')}</>;
  if (ev.enCours) return <><span style={POINT_CAMERA(ev.genre === 'sonnette' ? 'var(--o-bad)' : ev.genre === 'colis' ? 'var(--o-accent)' : 'var(--o-warn)')} />{ev.libelle}</>;
  return <><Fi i={ev.icone} size={11} color="var(--o-lampe)" />{ev.libelle + ' · ' + depuis(ev.quand)}</>;
}
function tuileCamera(cam, i, hass) {
  const teinte = CAMERAS()[i % CAMERAS().length];
  return {
    label: cam.name, tag: 'LIVE · ' + (cam.name || '').toUpperCase(), grad: teinte.grad, glow: teinte.glow,
    sub: sousCamera(cam.online, cam.evenement || null),
    cle: cleCamera(cam, i), haid: cam.haid, online: cam.online, hass, evenement: cam.evenement || null,
  };
}

/* Fiche camera (maquettes du 14/09) : la tuile de l'Accueil en grand — meme
 * fond, meme badge, meme flux —, puis les modes de la camera (les interrupteurs
 * de son appareil, reconnus par `cameraModes`) et, depuis une piece, le chemin
 * vers la vue Securite, qui montre toutes les cameras cote a cote.
 *
 * On ne promet que ce que l'entite fait : pas de « enregistre 20 s » ni de
 * « sans filmer » — la maquette inspire, l'interrupteur decide.
 * Les libelles sont des FONCTIONS : dits au rendu, dans la langue du moment. */
const CAM_MODES = () => ({
  mouvement: [tr('Détection de mouvement'), tr('Prévient à chaque passage devant l’objectif.')],
  suivi: [tr('Suivi de mouvement'), tr('La caméra tourne pour garder le sujet au centre.')],
  pleurs: [tr('Mode baby care'), tr('Écoute les pleurs et prévient.')],
  prive: [tr('Mode privé'), tr('Objectif occulté : plus aucune image ne sort.')],
});
function CamSheet({ haid, nom, hass, onClose, onNav = null, evenement = null }) {
  const S = (hass && hass.states) || {};
  const st = S[haid] || null;
  const etat = st ? st.state : 'unavailable';
  const online = !!st && etat !== 'unavailable' && etat !== 'unknown';
  const etatTxt = !online ? tr('Indisponible') : (etat === 'streaming' || etat === 'recording' || etat === 'idle') ? tr('En direct') : String(etat);
  const modes = cameraModes(LOGGIA_INDEX, S, haid);
  const libelles = CAM_MODES();
  const basculer = (id) => {
    const on = !!S[id] && S[id].state === 'on';
    commanderService(hass, id, 'switch', on ? 'turn_off' : 'turn_on', { entity_id: id });
  };
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <FicheEntete titre={nom} sous={[zoneDe(haid), etatTxt].filter(Boolean).join(' · ')} id={haid} />
        {/* La tuile de l'Accueil, sans son bouton d'agrandissement : on y est deja. */}
        <CameraTile c={tuileCamera({ name: nom, haid, online, evenement }, 0, hass)} agrandir={false} />
        {(modes.length > 0 || onNav) && (
          <div style={{ marginTop: 14 }}>
            {modes.map((m, i) => {
              const [titre, desc] = libelles[m.cle] || [m.nom, tr('Réglage de la caméra')];
              const e = S[m.id];
              const mort = !e || e.state === 'unavailable';
              return <FicheRangee key={m.id} premiere={i === 0} titre={titre} desc={desc}
                droite={mort ? <FicheValeur couleur="var(--o-text3)">{tr('Indisponible')}</FicheValeur> : <RmBascule on={e.state === 'on'} nom={titre} onToggle={() => basculer(m.id)} />} />;
            })}
            {onNav && <FicheRangee premiere={!modes.length} titre={tr('Toutes les caméras')} desc={tr('La vue Sécurité les montre côte à côte.')}
              droite={<FicheBouton icone="shield-check" onClick={() => { close(); onNav('securite'); }}>{tr('Sécurité')}</FicheBouton>} />}
          </div>
        )}
      </>)}
    </BottomSheet>
  );
}
function CameraTile({ c, agrandir = true }) {
  const live = !!(c.haid && c.hass);
  const t = new Date(), hhmm = t.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  // TOUTE la tuile agrandit (retour 20/09 : « un clic pourrait la zoomer,
  // l'afficher en plus gros ») — viser un bouton de 36 px sur une vignette de
  // caméra était une corvée. Le ⤢ du coin reste, en repère : il dit ce que le
  // clic fait, sans être la seule cible. Le flux est DÉJÀ en direct, il n'y a
  // rien d'autre à commander ici (retour 31/08).
  const [grand, setGrand] = useState(false);
  const ctrl = { width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,.16)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' };
  return (
    <div className={'o-sombre o-cam-tuile' + (c.online === false ? ' o-panne' : '')} style={{ position: 'relative', borderRadius: 'var(--o-radius,18px)', overflow: 'hidden', aspectRatio: '16/9', background: c.grad, border: 'var(--o-bw,1px) solid var(--o-bd1)', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.4))' }}>
      {live && <CamLive hass={c.hass} haid={c.haid} online={c.online} nom={c.label} />}
      {!live && <div style={{ position: 'absolute', inset: 0, background: c.glow }} />}
      {live && agrandir && (
        <button type="button" aria-label={tr('Agrandir') + ' ' + (c.label || '')} onClick={() => setGrand(true)}
          style={{ position: 'absolute', inset: 0, zIndex: 2, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} />
      )}
      <div className="o-livebadge" style={{ position: 'absolute', top: 13, left: 13, display: 'flex', alignItems: 'center', gap: 8, padding: '5px 11px', borderRadius: 999, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(6px)', fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: '#fff' }}><span className="o-livedot" style={{ width: 7, height: 7, '--o-point-r': 3.5, borderRadius: '50%', background: 'var(--o-bad)' }} />{c.tag}</div>
      <div className="o-camheure" style={{ position: 'absolute', top: 13, right: 14, fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,.85)', textShadow: '0 1px 4px rgba(0,0,0,.5)' }}>{hhmm}</div>
      {/* Les classes portent les règles du téléphone (deux tuiles par ligne). */}
      <div className="o-campied" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '30px 16px 14px', background: 'linear-gradient(to top,rgba(0,0,0,.72),transparent)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0 }}><div className="o-camnom" style={{ fontSize: 15, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div><div className="o-camsous" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.82)' }}>{c.sub}</div></div>
        {live && agrandir && (
          <span className="o-camzoom" style={ctrl}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" /></svg></span>
        )}
      </div>
      {grand && <CamSheet haid={c.haid} nom={c.label} hass={c.hass} evenement={c.evenement} onClose={() => setGrand(false)} />}
    </div>
  );
}

/* « Normal » d'une vitesse a sa clé à sens : la nue est l'état d'un capteur,
 * « Normalnie » (un adverbe) en polonais, entre « Cichy » et « Mocny »
 * (relecture du 03/10). */
const FAN_FR = () => ({ quiet: tr('Silencieux'), normal: trSens('Normal · réglage'), max: 'Max', max_plus: 'Max+', standard: trSens('Normal · réglage'), strong: tr('Fort') });
/* Sélecteur compact façon fiche native : un bouton qui dit la valeur courante,
 * un menu dépoli qui liste les autres. Partagé : vitesse d'aspiration,
 * préréglages de thermostat — partout où des chips feraient brouillon. */
function MenuDeroulant({ icone = null, etiquette, valeur, options, surChoix, rendre = (v) => v }) {
  /* La liste est celle de tous les menus (`ListeChoix`) : même panneau, même
   * taille, même clavier (retour du 18/09). Le bouton reste celui de la
   * fiche — l'étiquette au-dessus de la valeur. */
  return (
    <div role="presentation" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
      <ListeChoix value={valeur} onChange={surChoix} label={etiquette} options={(options || []).map(v => ({ id: v, label: String(rendre(v)) }))}
        style={{ padding: '7px 13px', borderRadius: 14, background: 'var(--o-s1)', border: LISERE, color: 'var(--o-text1)' }}>
        {() => (
          <>
            {icone && <Fi i={icone} size={14} color="var(--o-text2)" />}
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--o-text3)' }}>{etiquette}</span>
              <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{valeur != null ? rendre(valeur) : '—'}</span>
            </span>
          </>
        )}
      </ListeChoix>
    </div>
  );
}
/* `dense` : la COMPACTE — une seule ligne (icône, nom, état) et le contrôle
 * primaire à droite, JAMAIS de rangée de contrôles dessous. La pleine, elle,
 * est la STANDARD : mêmes en-têtes, les contrôles du domaine en dessous. */
/* L'icône suit l'ENTITÉ, pas seulement son domaine : device_class du capteur,
 * type de luminaire, état du moment (porte ouverte/fermée, chauffe en cours).
 * Tous les glyphes sont vérifiés dans uicons-regular-rounded.css. */
function cvIcoEntite(dom, id, st, name) {
  // Ce que l'utilisateur a choisi passe avant tout le reste, et ne change rien
  // d'autre que le glyphe (26/09).
  const mienne = iconeChoisie(id);
  if (mienne) return mienne;
  const a = (st && st.attributes) || {};
  const dc = a.device_class || '';
  const s = st ? st.state : null;
  // Toute lumière porte la même ampoule, quel que soit son nom (sa demande du 14/10) ; le choix de l'utilisateur est déjà passé devant.
  if (dom === 'light') return 'bulb';
  if (dom === 'climate') return a.hvac_action === 'heating' ? 'flame' : a.hvac_action === 'cooling' ? 'snowflake' : 'thermometer-half';
  // Une mesure de la table prend le glyphe de sa FAMILLE (correction bis du chantier Capteurs, point 9) : le bruit, le vent et les COV portaient le générique.
  if (dom === 'sensor') return iconeMesure(cleMesure(dc, a.unit_of_measurement)) || ({ pm10: 'smog', pm1: 'smog', aqi: 'smog', nitrogen_dioxide: 'smog', ozone: 'smog', volatile_organic_compounds: 'smog', volatile_organic_compounds_parts: 'smog', power: 'bolt', atmospheric_pressure: 'dashboard', energy: 'bolt', voltage: 'bolt', current: 'bolt', battery: 'battery-half', pressure: 'dashboard', gas: 'flame', moisture: 'raindrops' })[dc] || 'chart-line-up';
  if (dom === 'binary_sensor') return dc === 'door' ? (s === 'on' ? 'door-open' : 'door-closed') : ({ window: 'window-alt', garage_door: 'garage', motion: 'radar', occupancy: 'radar', presence: 'radar', smoke: 'smoke', moisture: 'raindrops', gas: 'flame', carbon_monoxide: 'flame' })[dc] || 'radar';
  if (dom === 'cover') return (dc === 'garage' || dc === 'gate') ? 'garage' : dc === 'window' ? 'window-alt' : 'blinds';
  if (dom === 'media_player') return dc === 'tv' ? 'screen' : 'tv-music';
  if (dom === 'valve') return 'water';
  /* Serrure : la pastille dit l'ÉTAT, le bouton le GESTE (relecture du lot 16,
   * 05/10). Au téléphone le bouton passe en icône — le cadenas FERMÉ de
   * « verrouiller » — et la pastille, toujours fermée, faisait d'une porte
   * OUVERTE deux cadenas fermés : elle se lisait verrouillée. Seule `locked`
   * garde le cadenas fermé ; tout état de HA où le pêne n'est pas tenu prend le
   * cadenas ouvert : `unlocked`, `unlocking`, `locking` (pas encore fermée),
   * `open`, `opening`, et `jammed` (coincée, rien ne garantit qu'elle tient).
   * Un état inconnu ou absent garde l'icône du domaine : une panne a déjà son
   * liseré (ADR 0048), un cadenas ouvert y affirmerait une porte ouverte. */
  if (dom === 'lock') return ['unlocked', 'unlocking', 'locking', 'open', 'opening', 'jammed'].indexOf(s) >= 0 ? 'unlock' : 'lock';
  return CV_DOM_ICON[dom] || 'bolt';
}
function CvCard({ id, hass, label = null, onOpen = null, dense = false }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const call = (d, s, data) => commanderService(hass, id, d, s, { entity_id: id, ...(data || {}) });
  // Consigne optimiste de la compacte climat (fenêtre fixe 4 s, comme partout).
  const [ovT, setOvT] = useState(null);
  const ovTRef = useRef(0);
  useEffect(() => () => clearTimeout(ovTRef.current), []);
  const poseT = (v) => { setOvT(v); clearTimeout(ovTRef.current); ovTRef.current = setTimeout(() => setOvT(null), 4000); };
  const dom = cvDomain(id);
  const name = label || cvName(st, id);
  /* Une PRISE (P1 ; chantier Prises, § 3.3) : la compacte garde sa disposition
   * et prend de sa carte la phrase (§ 4), la puissance et le glyphe de son
   * appareil. Protégée et allumée, sa bascule ouvre la fiche : une compacte n'a
   * pas la place de demander (P5). `vp` vaut null pour tout le reste, et rien
   * ne s'abonne ; ni courbe ni kWh ici, rien ne se lit du jour. */
  const vp = useVuePrise(hass, id, label, dom === 'switch' && !cvEstLumiere(id) && priseDe(hass && hass.states, id).prise, { jour: false });
  /* Une LUMIÈRE compacte (chantier Lumières, § 3.3) : elle garde sa disposition et prend de sa carte la phrase (§ 4),
   * le pourcentage — à partir de 140 px de contenu, comme la puissance d'une prise — et la teinte de la vraie lumière
   * (L6), sur la pastille et le lavis. Pas de barre ; un appui ouvre la fiche, la bascule allume ou éteint (L3).
   * `vl` vaut null pour tout le reste — la standard comprise —, et rien ne s'abonne. */
  const vl = useVueLumiere(hass, id, label, dense && cvEstLumiere(id));
  /* Une MESURE compacte (chantier Capteurs, § 3) : elle garde sa disposition et prend de sa carte la phrase, le chiffre — en
   * haut à droite, à la place d'une commande qu'elle n'a pas — et, hors du bon, la teinte de sa zone sur la pastille et le
   * lavis ; bonne, le neutre (C5). Pas de barre. `vm` vaut null pour tout le reste — la standard comprise —, et rien ne s'abonne. */
  const vm = useVueMesure(hass, id, label, dense && dom === 'sensor' && estMesure(st));
  /* Un LECTEUR (chantier Médias, M17) : la compacte garde sa disposition et prend de sa carte la phrase (M6), la pochette dans la
   * plaque et la teinte (M8) ; sa seule commande reste lecture/pause, explicite (M13 : `media_pause` si le lecteur joue, `media_play`
   * sinon, sur la jumelle qui commande). La standard prend la même vue. `vd` vaut null pour tout le reste, et rien ne s'abonne. */
  const vd = useVueLecteur(hass, id, label, dom === 'media_player');
  /* Un ROBOT (chantier IoT, I12) : la compacte garde sa disposition et prend de sa carte la phrase (I7), la batterie à droite, la
   * teinte de la plaque au travail (I8) et, pour mini-commande, la première puce de la carte. `vr` vaut null pour tout le reste, et
   * rien ne s'abonne. */
  const vr = useVueRobot(hass, id, label, dom === 'vacuum' || dom === 'lawn_mower');
  const vdJoue = !!vd && vd.on && !vd.indispo && (vd.playing || vd.paused);
  // Dehors, rien n'est une alerte (C15, révisé le 16/10) : le mot de la zone, sans teinte.
  const tm = vm && vm.zone && !vm.zone.bon && !vm.dehors ? vm.zone : null;
  /* Un switch que l'index ne classe pas ENCORE (le chargement : le NAS s'affiche en switch ordinaire) suit la même règle que
   * les prises (F2, `gardeDeSwitch`) : allumé et gardé, il ouvre la fiche, ou demande sur place. Un switch ordinaire, l'index lu,
   * n'a rien à demander et ne s'abonne à rien ; `vp` a déjà sa garde. */
  const gs = useGardeSwitch(hass && hass.states, id, !vp);
  const ico = dom === 'switch' ? (iconeChoisie(id) || (cvEstLumiere(id) ? 'bulb' : null)) || (vp ? vp.tp.ico : null) : cvIcoEntite(dom, id, st, name); // null = prise, SVG maison
  const s = st ? st.state : null;
  const a = (st && st.attributes) || {};
  /* La luminosité d'une lumière STANDARD (la compacte passe par sa vue) : le geste d'abord, 4 s — l'écho Zigbee rejoue
   * l'ancienne valeur (ADR 0261) ; le curseur et le sous-titre la lisent. */
  const [ovBri, poserBri] = useOptimiste(dom === 'light' ? luminosite(a) : null, 4000);
  /* Une scène jamais lancée (`unknown`) n'est pas en panne : `enPanne` (05/10). Une LUMIÈRE compacte lit sa panne dans SA vue,
   * celle de sa phrase et de sa bascule : le `hass` du parent peut être en retard d'un tic (relecture des tâches 6 à 9, point 13). */
  const dead = vl ? vl.muette : vm ? vm.muette : vd ? vd.indispo : vr ? vr.panne : enPanne(id, st);
  /* Un VOLET (sa classe, V3) : la compacte garde sa disposition et ses ▲ ▼, et
   * ne prend de sa carte que la phrase d'état (§ 4) et la position de sa
   * course (§ 5) — chantier Volets, § 3.3. `volet` faux : rien ne s'abonne. */
  const volet = dom === 'cover' && estVolet(st);
  const { etat: etatVolets } = useEtatVolets(volet);
  const vVolet = volet ? voletDe(etatVolets, id) : null;
  const course = useCourseVolet(volet ? id : null, st, vVolet && vVolet.manoeuvre);
  const vue = volet ? vueVolet({ st, course, v: vVolet, etat: etatVolets }) : null;
  /* Un geste de cover (19/10) : ce qu'il accepte ; un VOLET lance sa course (Stop la fige), qu'un refus de Home Assistant oublie. */
  const gestesCv = dom === 'cover' ? gestesCover(st) : null;
  const bougerCover = (g, cible) => {
    if (!g) return;
    const envoi = envoyerGeste(hass, id, g);
    if (!vue) envoi();
    else if (cible == null) ordreEtArret(id, st, envoi);
    else ordreEtCourse(id, cible, st, envoi);
  };
  // Alarme en cours d'armement : le temps restant, battu à la seconde.
  const cptAlarme = dom === 'alarm_control_panel' ? armCompte(st) : null;
  useSeconde(!!cptAlarme);
  const on = vl ? vl.on : vp ? vp.on : vr ? vr.travail : !dead && (vue ? vue.allume : dom === 'cover' ? coverActif(st) : dom === 'lock' ? s === 'unlocked' : vd ? vd.playing : dom === 'climate' ? s !== 'off' : dom === 'water_heater' ? s !== 'off' && chauffeEauEnChauffe(a) : s === 'on');
  // Sans fiche à ouvrir (la compacte de l'appareil, dans SA fiche), elle demande sur place : deux appuis (A4). Coupée entre-temps, la question tombe (F4).
  const [demande, setDemande] = useDemandeCoupure(on);
  const enDemande = vp ? vp.on && demande : gs.garde && on && demande;
  // Chaque domaine garde sa teinte des vues intégrées : lumière = la teinte de la VRAIE lumière, la règle de sa carte
  // (`teinteDeCarte` : un blanc par la table, plafonné à 4 000 K en thème clair, une couleur par son `rgb_color`), sinon l'or ;
  // climat = celle de ses cartes — l'accent bleu pour le reste.
  const teinteVraie = dom === 'light' && on ? teinteDeCarte(a, null, estClair()) : null;
  const rgbHex = teinteVraie ? versHex(teinteVraie) : null;
  /* Climat : l'orange de la chauffe, le bleu d'un appareil qui refroidit
   * (`teinteClimat`) — les couleurs de sa maquette « Cartes chauffage »,
   * choisies le 11/10 : le rouge reste aux alertes. Il avait remplacé l'ambre
   * le 31/08 (« rendait jaune ») ; la maquette l'a rendue au chauffage. */
  const teinte = cvEstLumiere(id) ? (rgbHex || 'var(--o-lampe)') : dom === 'climate' ? teinteClimat(st) : dom === 'cover' ? 'var(--o-purple)' : null;
  const teinteLu = rgbHex ? lisibleSurLavis(rgbHex, estClair(), .28) : teinte;
  const teinteTxt = rgbHex || (cvEstLumiere(id) ? 'var(--o-warn)' : dom === 'climate' ? teinteClimat(st) : dom === 'cover' ? 'var(--o-purple)' : 'var(--o-accent-soft)');
  /* Une clim qui sèche ou ventile ne prend AUCUNE teinte (`teinteClimat` :
   * null ; relecture de la dernière passe) — ni l'orange, ni le bleu, ni
   * l'accent des autres domaines : allumée, elle reste neutre, sans lavis. */
  const neutre = on && dom === 'climate' && !teinte;
  const togglable = ['light', 'switch', 'input_boolean', 'fan', 'humidifier', 'siren'].indexOf(dom) >= 0;
  // Presque tout s'ouvre : les domaines à fiche dédiée, et tout appareil du
  // registre via la fiche universelle. Seuls les capteurs texte restent muets.
  // Un capteur qui porte une DATE ou une heure n'est pas une mesure :
  // `parseFloat` y lisait l'année (« 2026 ») ou l'heure (« 7 »), et un tap
  // ouvrait une courbe (05/10).
  const dateTxt = dom === 'sensor' ? texteDate(st) : null;
  const ouvrable = !dead && !!onOpen && ((dom === 'sensor' && dateTxt == null && !isNaN(parseFloat(s)))
    || ['light', 'climate', 'cover', 'media_player', 'vacuum', 'lawn_mower', 'fan', 'lock', 'switch', 'humidifier', 'water_heater', 'siren', 'binary_sensor', 'input_boolean', 'alarm_control_panel'].indexOf(dom) >= 0);
  const runnable = { scene: ['scene', 'turn_on', tr('Activer')], script: ['script', 'turn_on', tr('Exécuter')], button: ['button', 'press', tr('Appuyer')], input_button: ['input_button', 'press', tr('Appuyer')], automation: ['automation', 'trigger', tr('Exécuter')] }[dom];
  // L'icône du geste, montrée À LA PLACE du mot sur une carte étroite (05/10).
  const icoRun = { button: 'cursor-finger', input_button: 'cursor-finger' }[dom] || 'play';
  let stateTxt;
  if (vl) stateTxt = vl.phrase.texte;
  else if (vm) stateTxt = vm.phrase;
  else if (vd) stateTxt = vd.phrase.texte;
  else if (vr) stateTxt = vr.phrase.texte;
  else if (vp) stateTxt = enDemande ? tr('Couper la prise ?') : vp.phrase;
  else if (enDemande) stateTxt = tr('Couper la prise ?');
  /* Une personne, un traceur (G1-D8) : la zone où elle est, telle quelle ; « Inconnu » quand son traceur se tait — jamais
   * « Absent », ni « Indisponible » : un téléphone muet n'est pas une maison vide (presence.py). */
  else if (dom === 'person' || dom === 'device_tracker') stateTxt = motPresence(st);
  else if (dead) stateTxt = tr('Indisponible');
  // Une lumière, le vocabulaire de sa carte (§ 4, ADR 0261) : « Allumée depuis 18:05 · 45 % », « Éteinte » ; le pourcentage au plancher de 1 %.
  else if (cvEstLumiere(id)) { const pct = ovBri != null ? ovBri : luminosite(a); stateTxt = phraseLumiere({ st }).texte + (on && dom === 'light' && pct != null ? ' · ' + pct + '\u00a0%' : ''); }
  else if (togglable) stateTxt = on ? tr('Allumé') : tr('Éteint');
  else if (dom === 'climate') stateTxt = (a.current_temperature != null ? decMax(a.current_temperature, 1) + '°' : '—') + (a.temperature != null ? ' → ' + decMax(a.temperature, 1) + '°' : '') + (s !== 'off' ? '' : ' · ' + tr('Éteint'));
  else if (vue) stateTxt = vue.phrase;
  // Le verdict de V12 aux deux bouts, et un entier (19/10) : plus de « Ouvert · 98% » ni de « 1.5% ».
  else if (dom === 'cover') stateTxt = s === 'opening' ? tr('Ouverture…') : s === 'closing' ? tr('Fermeture…') : on ? (tr('Ouvert') + (positionPubliee(st) != null && !coverOuvert(positionPubliee(st)) ? ' · ' + Math.round(positionPubliee(st)) + '%' : '')) : tr('Fermé');
  // Serrure : les sept états de HA, avec les mots de sa fiche — la pastille
  // ouverte d'une serrure `jammed` s'écrivait « jammed », brut et en anglais
  // dans toutes les langues (contre-relecture du lot 16, 05/10).
  else if (dom === 'lock') stateTxt = ({ locked: tr('Verrouillée'), unlocked: tr('Déverrouillée'), locking: tr('Verrouillage…'), unlocking: tr('Déverrouillage…'), jammed: tr('Bloquée'), open: tr('Ouverte'), opening: tr('Ouverture…') })[s] || String(s);
  else if (dom === 'alarm_control_panel') stateTxt = s === 'disarmed' ? tr('Désarmée') : s === 'triggered' ? tr('ALERTE') : (s === 'arming' || s === 'pending') ? (cptAlarme ? tr('Activation dans {n} s', { n: cptAlarme.reste }) : tr('Activation en cours…')) : s === 'armed_home' ? tr('Maison') : s === 'armed_night' ? tr('Nuit') : tr('Armée');
  else if (dom === 'binary_sensor') stateTxt = s === 'on' ? tr('Détecté') : tr('RAS');
  // Un chauffe-eau (G1-D7) : son mode traduit — tel quel s'il est du fabricant —, la température relevée et la consigne.
  else if (dom === 'water_heater') stateTxt = phraseChauffeEau(st);
  else if (dom === 'sensor' && dateTxt != null) stateTxt = dateTxt;
  else if (dom === 'sensor') stateTxt = (isNaN(parseFloat(s)) ? s : parseFloat(s)) + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
  // scene/script/button : état = date de dernière exécution. Un `event` aussi :
  // jamais tiré (`unknown`, plus en panne), il dit « — », pas « unknown » (05/10).
  else if (runnable || dom === 'event' || /^\d{4}-\d\d-\d\dT/.test(String(s))) stateTxt = relTime(s) || '—';
  else stateTxt = String(s);
  /* La bascule : une prise passe par sa vue (le geste d'abord) ; allumée et
   * gardée — protégée, ou protection inconnue — elle ouvre sa fiche, qui demande
   * (P5) ; sans fiche à ouvrir, elle demande sur place, et le second appui coupe.
   * Une bascule ne reste jamais sans effet (`appuiBascule`, A4). Un switch que
   * l'index ne classe pas encore suit la même règle (F2) ; tout autre appareil
   * garde le geste d'abord. */
  const basculerCompacte = () => {
    // Une lumière : `turn_on` / `turn_off` d'après l'état affiché, le geste d'abord (sa vue).
    if (vl) { vl.commander(!vl.on); return; }
    if (!vp) {
      const geste = appuiBascule({ on, garde: gs.garde, ouvrable: !!onOpen, enDemande });
      if (geste === 'fiche') onOpen(id);
      else if (geste === 'demander') setDemande(true);
      else { setDemande(false); call('homeassistant', on ? 'turn_off' : 'turn_on'); }
      return;
    }
    const geste = appuiBascule({ on: vp.on, garde: vp.garde, ouvrable: !!onOpen, enDemande });
    if (geste === 'fiche') onOpen(id);
    else if (geste === 'demander') setDemande(true);
    else { setDemande(false); vp.commander(!vp.on); }
  };
  /* Le sous-titre AFFICHÉ, une seule variable pour l'œil et pour le nom de la
   * carte (lot 13 de l'audit du 03/10). Compacte climat : la consigne vit
   * entre les boutons — le sous-titre ne garde que la température relevée. */
  const sousTitre = dense && dom === 'climate' && a.current_temperature != null ? tr('actuel {n}°', { n: decMax(a.current_temperature, 1) }) : stateTxt;
  /* Une vanne (étape 3 IoT, I11, I31) a SA carte, chargée à la demande — la standard d'une vue personnelle comme la compacte. Sa
   * bascule rouvrait l'eau d'un seul appui, même après une fuite. Ici, après tous les crochets : ils ne font rien pour elle. */
  if (estVanneCarte(id)) return <CarteVanne id={id} hass={hass} nom={label} chip={dense} onOpen={onOpen} />;
  /* Un chauffe-eau (chantier G3, E2 ; ADR 0302) a SA carte, chargée à la demande : la température de l'eau, la consigne, le mode
   * traduit. Elle REMPLACE ce rendu générique, qui écrivait son état brut (« eco ») dans les sept langues. */
  if (dom === 'water_heater') return <CarteEauChaude id={id} hass={hass} label={label} chip={dense} onOpen={onOpen} />;
  return (
    /* La carte n'englobe plus ses commandes (lot 13 de l'audit du 03/10, motif
     * de l'ADR 0074). Racine `role="button"`, elle rendait sa descendance
     * présentationnelle : interrupteur, curseur, « Armer », « Verrouiller »,
     * flèches d'un volet disparaissaient d'un lecteur d'écran
     * (`nested-interactive`), et son nom « Ouvrir Volet salon » taisait l'état
     * affiché tout en prenant celui du bouton « Ouvrir » du volet. Le geste
     * « ouvrir la fiche » passe par la `Surface`, premier enfant, nommée de ce
     * que la carte affiche (« Volet salon, Ouvert · 60% »). Chaque commande
     * est positionnée : peinte après la surface, elle reçoit son clic. La
     * rangée, elle, ne l'est plus : un clic sur l'icône, le nom, l'état ou la
     * consigne ouvre la fiche, comme avant. */
    <div className={'o-piece' + (dense ? ' o-cvdense' : '') + (dead ? ' o-panne' : '') + ' o-cvcarte'}
      style={{ position: 'relative', background: vl ? (vl.on && LAVIS ? lavisCarte(vl.couleurs.rgb, lavisLumiere(vl.bri).haut, lavisLumiere(vl.bri).bas) : SURF_CARTE) : vm ? (tm && LAVIS ? lavisCarte(tm.rgb, tm.i === vm.barre.zones.length - 1 ? .16 : .1, .03) : SURF_CARTE) : vp ? (vp.vive ? lavisCarte(vp.tp.rgb, .16) : SURF_CARTE) : vd ? (vdJoue && LAVIS ? lavisCarte(vd.teinte, vd.playing ? .16 : .08, .03) : SURF_CARTE) : vr ? (vr.travail && LAVIS ? lavisCarte(vr.teinte[0], .14, .03) : SURF_CARTE) : on && !neutre ? lavisCarte((a) => hx(teinte || 'var(--o-accent)', a)) : SURF_CARTE, border: LISERE, borderRadius: 'var(--o-radius,18px)', padding: dense ? '12px 14px' : 16, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', opacity: dead ? .55 : 1, cursor: ouvrable ? 'pointer' : 'default', transition: 'all .25s', ...(dense ? { height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center' } : {}) }}>
      {ouvrable && <Surface onClick={() => onOpen(id)} label={vr ? nomCarte(name, sousTitre, vr.panne || vr.batterie == null ? null : tr('batterie {p} %', { p: vr.batterie })) : nomCarte(name, vm && vm.chiffre != null ? vm.chiffre + (vm.unite ? ' ' + vm.unite : '') : null, sousTitre)} />}
      <div className="o-cvrow" style={{ display: 'flex', alignItems: 'center' }}>
        <span className="o-cvpastille" style={{ background: vl ? (on ? 'rgba(' + vl.couleurs.rgb + ',.22)' : 'var(--o-s1)') : vm ? (tm ? 'rgba(' + tm.rgb + ',.16)' : 'var(--o-s1)') : vp ? (on ? 'rgba(' + vp.tp.rgb + ',.16)' : 'var(--o-s1)') : vd ? (vdJoue ? 'rgba(' + vd.teinte + ',.16)' : 'var(--o-s1)') : vr ? (vr.travail ? 'rgba(' + vr.teinte[0] + ',.18)' : 'var(--o-s1)') : on && !neutre ? (teinte ? hx(teinte, .16) : 'rgba(var(--o-accent-rgb),.16)') : 'var(--o-s1)',
          color: vl ? (on ? vl.encre : 'var(--o-text3)') : vm ? (tm ? tm.c : vm.muette ? 'var(--o-text3)' : 'var(--o-text1)') : vp ? (on ? vp.tp.col : 'var(--o-text3)') : vd ? (vd.indispo || !vd.on ? 'var(--o-text3)' : 'var(--o-text1)') : vr ? (vr.panne ? 'var(--o-text3)' : vr.travail ? vr.teinte[1] : 'var(--o-text1)') : neutre ? 'var(--o-text1)' : on ? (teinteLu || 'var(--o-accent-soft)') : 'var(--o-text3)',
          ...(vdJoue && vd.l.art ? { overflow: 'hidden' } : null) }}>{/* `Ico` et non `Fi` : une icone CHOISIE peut etre un dessin, que `Fi`
                  * aurait cherche dans la police et rendu vide. */}
          {/* La pochette d'un lecteur dans la plaque (M17), sinon son glyphe. */}
          {vdJoue && vd.l.art ? <img src={vd.l.art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : ico ? <Ico name={vue ? iconeSelonEtat(ico, vue) : ico} size={dense ? 15 : 17} /> : <PlugIcon size={dense ? 15 : 17} />}</span>
        <div className="o-cvtxt">
          <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <div style={{ fontSize: 12, fontWeight: enDemande ? 700 : 600, color: vl ? (vl.phrase.panne ? 'var(--o-bad)' : 'var(--o-text2)') : vm ? (vm.muette ? 'var(--o-bad)' : tm ? tm.c : 'var(--o-text2)') : vp ? (vp.muet ? 'var(--o-bad)' : enDemande ? 'var(--o-text1)' : 'var(--o-text2)') : vd ? vd.phrase.encre : vr ? vr.phrase.encre : enDemande ? 'var(--o-text1)' : neutre ? 'var(--o-text2)' : on ? (teinte ? teinteTxt : 'var(--o-accent-soft)') : 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sousTitre}
          </div>
          {/* La question d'une prise s'annonce (audit du 19/10, point 13). Toujours montée, vide (ADR 0107) : une région qui
            * apparaît déjà remplie ne dit rien. Après la phrase : la phrase reste le deuxième enfant. */}
          <span className="o-vh" aria-live="polite">{enDemande ? tr('Couper la prise ?') : ''}</span>
        </div>
        {/* La puissance d'une prise allumée et vivante, 12 px / 800, comme la pile d'un robot ; elle cède sur une
          * compacte étroite (index.css). Hors de la surface, un lecteur d'écran la lit après elle, quand elle se voit. */}
        {/* Le pourcentage d'une lumière allumée et variable, de même : il cède sur une compacte étroite (index.css). */}
        {/* Le chiffre d'une mesure, 13 px / 800 : il a la place d'une commande, il ne cède pas. */}
        {vm && vm.chiffre != null && <span className="o-cvmesure" style={{ fontSize: 13, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--o-text)' }}>{vm.chiffre + (vm.unite ? '\u00a0' + vm.unite : '')}</span>}
        {/* Un lecteur sous profil (chantier Mode enfant, E17) : la pastille en petit, le glyphe seul ; la phrase du blocage vient de sa vue. */}
        {vd && vd.pastille && !vd.indispo && <Suspense fallback={null}><CarteEnfant quoi="pastille" petite levee={vd.levee} /></Suspense>}
        {vl && vl.on && vl.bri != null && <span className="o-cvpourcent" style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--o-text2)' }}>{vl.bri + '\u00a0%'}</span>}
        {vp && vp.watts != null && !dead && <span className="o-cvpuissance" style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--o-text2)' }}>{fmtWatts(vp.watts)}</span>}
        {togglable && !dead && <span role="switch" aria-checked={on} tabIndex={0} aria-label={enDemande ? tr('Couper') + ' ' + name : on ? tr('Éteindre {nom}', { nom: name }) : tr('Allumer {nom}', { nom: name })} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculerCompacte(); } }} onClick={(e) => { e.stopPropagation(); basculerCompacte(); }} style={{ width: 44, height: 25, borderRadius: 14, background: on ? 'var(--o-accent-fond)' : 'var(--o-bd1)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} /></span>}
        {/* Chaque commande dit son geste PUIS l'appareil (lot 13 de l'audit
          * du 03/10) : hors de la carte-bouton, « Activer » ou « Pause » seuls
          * ne disaient plus de quoi. Positionnée, elle passe sur la surface.
          * Exécuter, la serrure et l'alarme portent leur mot ET leur icône
          * (`o-cvact`) : sur une carte étroite, compacte ou standard, l'icône
          * remplace le mot (index.css) et le nom garde sa place (05/10). */}
        {runnable && !dead && <button className="o-cvact" aria-label={runnable[2] + ' ' + name} title={runnable[2]} onClick={(e) => { e.stopPropagation(); call(runnable[0], runnable[1]); }} style={{ position: 'relative', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', border: 'none', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}><span className="o-cvact-ico"><Ico name={icoRun} size={14} /></span><span className="o-cvact-mot">{runnable[2]}</span></button>}
        {dom === 'lock' && !dead && <button className="o-cvact" aria-label={(s === 'locked' ? tr('Déverrouiller') : tr('Verrouiller')) + ' ' + name} title={s === 'locked' ? tr('Déverrouiller') : tr('Verrouiller')} onClick={(e) => { e.stopPropagation(); call('lock', s === 'locked' ? 'unlock' : 'lock'); }} style={{ position: 'relative', borderRadius: 10, background: s === 'locked' ? 'rgba(var(--o-ok-rgb),.14)' : 'rgba(var(--o-warn2-rgb),.16)', border: 'none', color: s === 'locked' ? 'var(--o-ok)' : 'var(--o-warn2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}><span className="o-cvact-ico"><Ico name={s === 'locked' ? 'unlock' : 'lock'} size={14} /></span><span className="o-cvact-mot">{s === 'locked' ? tr('Déverrouiller') : tr('Verrouiller')}</span></button>}
        {/* Alarme : le geste attendu, comme la serrure — armer quand elle
          * dort, désarmer sinon. Si le panneau réclame un code, le bouton
          * ouvre la fiche plutôt que d'échouer en silence. */}
        {dom === 'alarm_control_panel' && !dead && (() => {
          const dormante = s === 'disarmed';
          const codeVoulu = dormante ? (!!a.code_format && a.code_arm_required !== false) : !!a.code_format;
          // L'armement du bouton suit le panneau : le premier mode qu'il offre
          // (absent d'abord, le plus courant). Aucun mode déclaré → pas de
          // bouton d'armement, la fiche reste la voie.
          const armements = armChips(a, s).filter(c => c[1] !== 'alarm_disarm');
          const svcArm = (armements.find(c => c[1] === 'alarm_arm_away') || armements[0] || [])[1] || null;
          if (dormante && !svcArm) return null;
          const [bg, col] = dormante ? ['rgba(var(--o-accent-rgb),.14)', 'var(--o-accent-soft)']
            : s === 'triggered' ? ['rgba(var(--o-bad-rgb),.16)', 'var(--o-bad)']
              : ['rgba(var(--o-ok-rgb),.14)', 'var(--o-ok)'];
          return (
            <button className="o-cvact" aria-label={(dormante ? tr('Armer') : tr('Désarmer')) + ' ' + name} title={dormante ? tr('Armer') : tr('Désarmer')} onClick={(e) => {
              e.stopPropagation();
              if (codeVoulu) { if (onOpen) onOpen(id); return; }
              call('alarm_control_panel', dormante ? svcArm : 'alarm_disarm');
            }} style={{ position: 'relative', borderRadius: 10, background: bg, border: 'none', color: col, fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}><span className="o-cvact-ico"><Ico name={dormante ? (ICONES_ARMEMENT[svcArm] || ICONES_ARMEMENT.alarm_arm_away) : ICONES_ARMEMENT.alarm_disarm} size={14} /></span><span className="o-cvact-mot">{dormante ? tr('Armer') : tr('Désarmer')}</span></button>
          );
        })()}
        {/* La batterie d'un robot (I12), 12 px / 800 : l'attribut, sinon la sœur (sa vue), à la règle des piles (`couleurPile`). */}
        {vr && !vr.panne && vr.batterie != null && (
          <span style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: couleurPile(vr.batterie, 'var(--o-text2)') }}>{pourcentTexte(vr.batterie)}</span>
        )}
        {/* Compacte : le contrôle PRIMAIRE du domaine reste sur la ligne —
          * discret, pour laisser le nom respirer. */}
        {dense && !dead && (() => {
          // Pilules rectangulaires sans filet, le dessin de la maquette —
          // le même pour tous les minis de la compacte. Les ▲ ▼ d'un volet
          // prennent leur largeur de la feuille (`--o-mini-volet`, index.css) :
          // 38 px, 32 sur une compacte étroite (relecture du 13/10).
          const mini = { position: 'relative', width: dom === 'cover' ? 'var(--o-mini-volet, 38px)' : 38, height: 26, borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text1)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, padding: 0 };
          const miniAccent = { ...mini, background: 'var(--o-accent-fond)', color: '#fff' };
          // Climat : la consigne ENTRE les deux boutons, comme la maquette.
          if (dom === 'climate') {
            const base = ovT != null ? ovT : a.temperature;
            const bouge = (d) => { if (base == null) return; const v = commander(hass, id, 'set_temperature', base + d, 'temperature'); poseT(v != null ? v : base + d); };
            /* Groupe serré, ancré à droite — l'espace libre reste à gauche.
             * PLUS SERRÉ QUE LES AUTRES depuis le gabarit à deux rangées
             * (05/10) : il partage sa ligne avec l'ICÔNE, qui ne s'efface plus.
             * 148 px de contenu au téléphone, moins 26 d'icône et 9 d'écart, il
             * lui reste 113. À 38 px de bouton et 8 d'écart il en demandait 126
             * et le « + » tombait à la ligne, la carte débordant de 26 px sur sa
             * voisine. À 30 et 4 il en prend 102, et 113 avec une consigne à
             * trois chiffres (« 101,5° », en Fahrenheit) : la largeur tient
             * PILE. 32 px la ferait déborder — mesuré. */
            const miniClim = { ...mini, width: 30 };
            return (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 }}>
                <button style={miniClim} aria-label={'− ' + name} onClick={(e) => { e.stopPropagation(); bouge(-0.5); }}>−</button>
                <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', minWidth: 34, textAlign: 'center' }}>{base != null ? decMax(base, 1) + '°' : '—'}</span>
                <button style={miniClim} aria-label={'+ ' + name} onClick={(e) => { e.stopPropagation(); bouge(0.5); }}>+</button>
              </span>
            );
          }
          /* Un volet lance sa course (§ 5) : la compacte, la carte et la fiche la dessinent ensemble. Les ▲ ▼ suivent ce que
           * le cover accepte (`gestesCover`, 19/10) : inertes s'il ne sait pas, jamais un toast de refus. */
          if (dom === 'cover') return (<>
            <button style={{ ...mini, ...(gestesCv.monter ? null : RM_INERTE) }} aria-disabled={gestesCv.monter ? undefined : true} aria-label={tr('Ouvrir') + ' ' + name} onClick={(e) => { e.stopPropagation(); bougerCover(gestesCv.monter, 100); }}><Fi i="angle-up" size={13} /></button>
            <button style={{ ...mini, ...(gestesCv.descendre ? null : RM_INERTE) }} aria-disabled={gestesCv.descendre ? undefined : true} aria-label={tr('Fermer') + ' ' + name} onClick={(e) => { e.stopPropagation(); bougerCover(gestesCv.descendre, 0); }}><Fi i="angle-down" size={13} /></button>
          </>);
          /* Un robot (I12) : la PREMIÈRE puce de sa carte — Démarrer, Pause, Reprendre —, jamais la base ; en erreur, la base seule :
           * rien ici. Le geste est celui de la carte (sa vue), « Démarrer » par le serveur. Un geste en vol garde sa puce, quelle
           * qu'elle soit : « Base » posée pendant le vol d'un départ ne laisse plus la compacte sans rien (passe bis 2 du 18/10,
           * point H) — choisie, elle ne fait rien. */
          if (vr) {
            const p = vr.cmd.find(x => x.enVol) || vr.cmd[0];
            if (!p || (!p.enVol && ['demarrer', 'pause', 'reprendre'].indexOf(p.cle) < 0)) return null;
            // Un geste en vol (passe bis du 18/10, point 1) : la mini-commande reste sur lui et ne fait rien — jamais l'inverse.
            return (
              <button style={miniAccent} title={p.mot} aria-label={p.mot + ' ' + name} aria-disabled={p.enVol ? 'true' : undefined} onClick={(e) => { e.stopPropagation(); p.agir(); }}><Fi i={p.glyphe} size={12} /></button>
            );
          }
          if (vd) {
            /* « Lire », le geste : « Lecture » est l'ÉTAT écrit sur la carte
             * (« Playing » en anglais) — relecture du lot 13, comme la carte
             * lecteur. Sans texte visible, rien ne change à l'écran ; le bouton
             * standard, lui, garde le mot qu'il affiche. Le service est explicite
             * (chantier Médias, M13), sur la jumelle qui commande ; absent s'il
             * n'y a rien à reprendre (« Rien en lecture » : rien d'inerte, M11 ;
             * passe bis 2 du 17/10), si le lecteur ne sait ni lire ni mettre en
             * pause (M11), ou s'il est éteint. */
            if (!vd.on || !vd.cmd.lecture || !vd.reprenable) return null;
            return (
              <button style={miniAccent} aria-label={(vd.playing ? tr('Pause') : tr('Lire')) + ' ' + name} onClick={(e) => { e.stopPropagation(); vd.lecture(); }}><Fi i={vd.playing ? 'pause' : 'play'} size={12} /></button>
            );
          }
          return null;
        })()}
      </div>
      {/* Standard lumière : la luminosité en dessous — commit au relâcher. Une lampe VARIABLE (`capacitesLumiere`, pas
        * seulement le mot `brightness`) ; le curseur se recale sur la valeur montrée (`key`), le geste d'abord (`ovBri`)
        * tenant 4 s pour qu'un écho ne le fasse pas remonter ; `pan-y` laisse défiler la page au doigt (ADR 0261). */}
      {!dense && dom === 'light' && !dead && capacitesLumiere(id, a).variable && (() => {
        const lue = on ? luminosite(a) : null;
        const pct = ovBri != null ? ovBri : (lue != null ? lue : 0);
        const regler = (v) => { poserBri(v); call('light', 'turn_on', { brightness_pct: v }); };
        return (
          <div className="o-cvrange" role="presentation" style={{ position: 'relative', marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
            <Fi i="bulb" size={13} color="var(--o-text3)" />
            {/* Un curseur se nomme par ce qu'il COMMANDE — sa valeur, elle, est déjà dite par le curseur lui-même. Même formule
              * que les jauges des cartes de pièce. */}
            <input type="range" min="1" max="100" key={pct}
              defaultValue={pct} aria-label={tr('Luminosité') + ' ' + name}
              onPointerUp={(e) => regler(+e.target.value)}
              onKeyUp={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') regler(+e.target.value); }}
              style={{ flex: 1, minWidth: 0, touchAction: 'pan-y' }} />
          </div>
        );
      })()}
      {!dense && dom === 'climate' && !dead && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <button aria-label={'− ' + name} onClick={(e) => { e.stopPropagation(); if (a.temperature != null) commander(hass, id, 'set_temperature', a.temperature - .5); }} style={{ position: 'relative', flex: 1, padding: 8, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>−</button>
          <span style={{ fontSize: 15, fontWeight: 800, minWidth: 52, textAlign: 'center' }}>{a.temperature != null ? decMax(a.temperature, 1) + '°' : '—'}</span>
          <button aria-label={'+ ' + name} onClick={(e) => { e.stopPropagation(); if (a.temperature != null) commander(hass, id, 'set_temperature', a.temperature + .5); }} style={{ position: 'relative', flex: 1, padding: 8, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>+</button>
        </div>
      )}
      {!dense && dom === 'cover' && !dead && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {/* Trois flèches nues : sans nom, un lecteur d'écran n'annonçait que
            * « bouton » trois fois de suite (plan M7). */}
          {/* Ce que le cover accepte (`gestesCover`, 19/10) ; un volet lance sa course, Stop la fige — et un refus l'oublie. */}
          {[['monter', 'angle-up', tr('Ouvrir'), 100], ['stop', 'square', tr('Stop'), null], ['descendre', 'angle-down', tr('Fermer'), 0]].map(([cle, gi, nom, cible]) => (
            <button key={cle} aria-label={nom + ' ' + name} title={nom} aria-disabled={gestesCv[cle] ? undefined : true} onClick={(e) => { e.stopPropagation(); bougerCover(gestesCv[cle], cible); }} style={{ position: 'relative', flex: 1, padding: 9, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(gestesCv[cle] ? null : RM_INERTE) }}><Fi i={gi} size={14} /></button>
          ))}
        </div>
      )}
      {/* La standard d'un lecteur : le même geste, explicite (M13), absent s'il n'y a rien à reprendre (M11 ; passe bis 2). */}
      {!dense && vd && vd.on && !vd.indispo && vd.cmd.lecture && vd.reprenable && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button aria-label={(vd.playing ? tr('Pause') : tr('Lecture')) + ' ' + name} onClick={(e) => { e.stopPropagation(); vd.lecture(); }} style={{ position: 'relative', flex: 1, padding: 9, borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, fontSize: 12 }}><Fi i={vd.playing ? 'pause' : 'play'} size={13} />{vd.playing ? tr('Pause') : tr('Lecture')}</button>
        </div>
      )}
      {/* Les épingles sont des lignes à commandes : positionnées, elles passent
        * sur la surface (lot 13 de l'audit du 03/10). Vide, l'enveloppe ne
        * mesure rien. */}
      {!dense && <div style={{ position: 'relative' }}><Epingles pourId={id} hass={hass} /></div>}
    </div>
  );
}

/* ════════════ CATALOGUE DE CARTES des vues custom ════════════
 * Le TYPE se choisit à l'ajout — jamais par un geste implicite : quand une
 * entité admet plusieurs cartes, le sheet d'ajout les propose. Chaque entrée
 * typée de `cv.ents` s'écrit { t, id } ; la chaîne nue reste la compacte. */

// Le liseré du réglage (04/10) : le cadre de toutes les cartes de vue perso.
const CV_CADRE = { background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: LISERE, borderRadius: 'var(--o-radius,18px)', padding: 16, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' };
// La fonte UICons n'a pas de prise : SVG maison.
const PlugIcon = ({ size = 19 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 2v6M15 2v6" />
    <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" />
    <path d="M12 17v5" />
  </svg>
);
/* Un état qui est une DATE ou une HEURE, dit pour l'œil (05/10). `parseFloat`
 * y lisait l'année ou l'heure : la tuile (`CvCard`) d'un capteur horodaté
 * — prochaine alarme du téléphone, dernier passage du facteur — affichait
 * « 2026 », la pastille « 2 026 », un capteur « 07:30 » disait « 7 ».
 * Un horodatage (`device_class: timestamp`, ou un état ISO avec son heure)
 * passe par `relTime` comme dans la fiche (`LigneEntite`) : passé relatif,
 * futur en heure absolue. Une date seule (`device_class: date`) s'écrit par
 * Intl dans la langue de l'écran, l'année si ce n'est pas celle-ci —
 * `relTime` la lirait minuit UTC, « lun. 02:00 ». Une heure seule reste
 * telle quelle. `null` : ni date ni heure, la valeur se lit comme avant. */
function texteDate(st) {
  if (!st) return null;
  const s = String(st.state);
  // L'espace vaut le T (05/10, suite « dates partout ») : un `input_datetime`,
  // un capteur gabarit écrivent « 2026-10-05 07:30:00 », que la fiche lisait
  // « 2 026 ». Remis en T avant `new Date` : sans fuseau, l'heure est LOCALE,
  // et la forme à espace n'est pas garantie par la norme.
  const iso = /^\d{4}-\d\d-\d\d[T ]\d/.test(s);
  if ((st.attributes || {}).device_class === 'timestamp' || iso) return relTime(iso ? s.replace(' ', 'T') : s) || '—';
  const j = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s);
  if (j) {
    // Minuit LOCAL (`new Date(a, m, j)`), pas UTC : à l'ouest de Greenwich,
    // `new Date('2026-10-12')` tombe la veille.
    const q = new Date(+j[1], j[2] - 1, +j[3]);
    return q.toLocaleDateString(locale(), { day: 'numeric', month: 'short', ...(q.getFullYear() !== new Date(Date.now()).getFullYear() ? { year: 'numeric' } : {}) });
  }
  return /^\d\d?:\d\d(:\d\d)?$/.test(s) ? s : null;
}

/* Décompte d'un panneau qui s'arme (ou qui laisse le temps de désarmer).
 *
 * Home Assistant ne normalise pas ce délai : Alarmo publie `delay` (le total
 * de la phase en cours, en secondes), les autres nomment cela `arming_time`,
 * `delay_time` ou `pending_time`. On prend le premier connu et on le compte
 * depuis `last_changed`, l'instant où la phase a commencé. Sans délai publié,
 * pas de décompte inventé — la carte dit simplement l'activation en cours.
 * Renvoie { reste, total } en secondes, ou null. */
function armCompte(st) {
  if (!st || (st.state !== 'arming' && st.state !== 'pending')) return null;
  const a = st.attributes || {};
  const total = [a.delay, a.arming_time, a.delay_time, a.pending_time]
    .map(v => (v == null ? NaN : +v)).find(v => !isNaN(v) && v > 0);
  if (total == null) return null;
  const debut = Date.parse(st.last_changed || st.last_updated || '');
  if (isNaN(debut)) return null;
  const reste = Math.ceil(total - (Date.now() - debut) / 1000);
  return { reste: Math.max(0, Math.min(total, reste)), total };
}
/* Un battement par seconde, seulement quand quelque chose décompte : sans
 * `actif`, aucun minuteur ne tourne. */
function useSeconde(actif) {
  const [, tic] = useState(0);
  useEffect(() => {
    if (!actif) return undefined;
    const iv = setInterval(() => tic(n => n + 1), 1000);
    return () => clearInterval(iv);
  }, [actif]);
}

/* Vers QUEL mode un panneau est en train de s'armer. Alarmo l'annonce dans
 * `arm_mode`, d'autres intégrations dans `next_state` ; à défaut on retient le
 * mode que l'écran vient de demander (`optimiste`). Renvoie le SERVICE du
 * bouton concerné, ou null quand le panneau ne dit rien — auquel cas on ne
 * devine pas, on garde la barre. */
function armVise(st, optimiste) {
  const a = (st && st.attributes) || {};
  const parEtat = { armed_away: 'alarm_arm_away', armed_home: 'alarm_arm_home', armed_night: 'alarm_arm_night', armed_vacation: 'alarm_arm_vacation' };
  const dit = a.arm_mode || a.next_state || a.arming_mode || null;
  if (dit && parEtat[dit]) return parEtat[dit];
  return { away: 'alarm_arm_away', home: 'alarm_arm_home', night: 'alarm_arm_night' }[optimiste] || null;
}

/* La progression de l'armement tracée SUR le bouton du mode visé : le tour se
 * referme, et le bouton est cerné quand l'alarme prend. Un rect SVG normalisé
 * (`pathLength=100`) avance à vitesse constante le long du périmètre, ce qu'un
 * dégradé conique ne fait pas sur une forme large. Le trait déborde de moitié,
 * rogné par l'`overflow` du bouton : il reste collé au bord. */
function ArmAnneau({ pct, col = 'var(--o-warn2)', r = 9 }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg width="100%" height="100%" aria-hidden="true" focusable="false" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <rect x="0" y="0" width="100%" height="100%" rx={r} ry={r} fill="none" stroke={col} strokeWidth="3"
        pathLength="100" strokeDasharray="100" strokeDashoffset={100 - p}
        style={{ transition: 'stroke-dashoffset 1s linear' }} />
    </svg>
  );
}

/* L'ARMEMENT en tête du rail de l'accueil : c'est le geste du départ et du
 * retour, il ne devrait pas demander d'ouvrir une vue. Les modes proposés sont
 * ceux du panneau ; s'il réclame un code, on ouvre la vue Sécurité, qui sait le
 * demander. Composant à part pour battre la seconde du décompte sans faire
 * tictaquer tout l'accueil. */
/* Armements RÉELLEMENT offerts par un panneau, lus dans `supported_features`
 * (bits Home Assistant : 1 = maison, 2 = absent, 4 = nuit, 32 = vacances).
 * Alarmo ne déclare que les modes configurés : n'afficher que ceux-là évite
 * de proposer un geste qui ne ferait rien. Un panneau muet sur ses capacités
 * garde les deux armements courants — mieux vaut deux boutons de trop qu'une
 * carte sans aucun geste.
 * Renvoie [libellé, service, actif] — « Désarmé » d'abord, toujours. */
function armChips(attrs, etat) {
  const f = +((attrs || {}).supported_features) || 0;
  const out = [[tr('Désarmé'), 'alarm_disarm', etat === 'disarmed']];
  const veut = (bit) => (f ? !!(f & bit) : bit === 1 || bit === 2);
  if (veut(1)) out.push([tr('Maison'), 'alarm_arm_home', etat === 'armed_home']);
  if (veut(2)) out.push([tr('Absent'), 'alarm_arm_away', etat === 'armed_away']);
  if (veut(4)) out.push([tr('Nuit'), 'alarm_arm_night', etat === 'armed_night']);
  if (veut(32)) out.push([tr('Vacances'), 'alarm_arm_vacation', etat === 'armed_vacation']);
  // Un panneau armé dans un mode qu'il ne déclare pas ne doit pas paraître
  // désarmé : sa chip rejoint la liste plutôt que de mentir.
  const connus = { armed_home: [1, tr('Maison'), 'alarm_arm_home'], armed_away: [2, tr('Absent'), 'alarm_arm_away'], armed_night: [4, tr('Nuit'), 'alarm_arm_night'], armed_vacation: [32, tr('Vacances'), 'alarm_arm_vacation'] }[etat];
  if (connus && !out.some(c => c[1] === connus[2])) out.push([connus[1], connus[2], true]);
  return out;
}

/* Alarme : l'état et les gestes que le panneau offre. Le désarmement passe par
 * le service ; si le panneau exige un code, Home Assistant refusera — comme
 * partout. */
/* Sirene (ADR 0034) : la carte de la vue Securite — au gabarit maison, icone
 * en haut a gauche, bascule a droite, nom SOUS l'icone, puis l'etat. Les
 * tuiles ne disent que ce que l'entite expose (`available_tones`,
 * `volume_level`) : ni volume ni delai inventes. « Test sonore » sonne trois
 * secondes, TENUES PAR HOME ASSISTANT (`sirene.py`, ADR 0065) : par
 * `duration` quand la sirene le gere, sinon le composant l'eteint lui-meme.
 * L'onglet ne compte plus rien — fermer l'ecran pendant le test n'a plus
 * d'effet — et une sirene qui sonne pour de vrai ne se teste pas. */
function CvSirene({ id, hass, label = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const s = st ? st.state : null;
  const a = (st && st.attributes) || {};
  const mort = !st || s === 'unavailable' || s === 'unknown';
  const on = !mort && s === 'on';
  const nom = label || cvName(st, id);
  // Une sirene en `switch` s'allume et s'eteint comme un interrupteur.
  const dom = String(id).split('.')[0];
  const call = (svc, data) => commanderService(hass, id, dom, svc, { entity_id: id, ...(data || {}) });
  const [test, setTest] = useState(false);
  const [erreur, setErreur] = useState('');
  // Le bouton se libere a la fin que le serveur annonce : un affichage, rien
  // de plus — l'extinction, elle, part de Home Assistant.
  const finTestRef = useRef(0);
  useEffect(() => () => clearTimeout(finTestRef.current), []);
  const tester = () => {
    if (mort || test || !hass || typeof hass.callWS !== 'function') return;
    setTest(true); setErreur('');
    hass.callWS({ type: 'loggia/sirene/tester', entity_id: id })
      .then((r) => { finTestRef.current = setTimeout(() => setTest(false), Math.max(1, Number(r && r.duree) || 3) * 1000); })
      .catch((e) => { setTest(false); setErreur(e && e.code === 'unauthorized' ? tr('Ce compte ne pilote pas cet appareil.') : tr('Le test n’a pas pu partir.')); });
  };
  const col = on ? 'var(--o-bad)' : 'var(--o-text3)';
  const tuiles = [];
  if (Array.isArray(a.available_tones) && a.available_tones.length) tuiles.push([tr('Sonneries'), String(a.available_tones.length)]);
  if (typeof a.volume_level === 'number') tuiles.push([tr('Volume'), Math.round(a.volume_level * 100) + ' %']);
  return (
    <div className={'o-piece' + (mort ? ' o-panne' : '')} style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={RM_ICO(on ? 'rgba(var(--o-bad-rgb),.16)' : 'var(--o-s1)', col)}><GlypheCarte id={id} size={16}><Fi i="bell-ring" size={16} /></GlypheCarte></span>
        {!mort && <RmBascule on={on} nom={nom} onToggle={() => call(on ? 'turn_off' : 'turn_on')} />}
      </div>
      <div style={{ marginTop: 10, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={RM_NAME}>{nom}</div>
        <div style={{ ...RM_SUB, color: erreur ? 'var(--o-bad)' : mort ? 'var(--o-text3)' : col }}>{erreur || (mort ? tr('Indisponible') : on ? tr('Sirène active') : tr('Sirène au repos'))}</div>
        {/* Ce que l'entite expose (sonneries, volume) tient sur UNE ligne : en
          * tuiles, la carte montait a 223 px et entrainait toute sa rangee — le
          * format standard est de 184 px (retour du 17/09). */}
        {!mort && tuiles.length > 0 && <div style={RM_SUB}>{tuiles.map(([l, v]) => l + ' ' + v).join(' · ')}</div>}
        <div style={{ flex: 1 }} />
        {!mort && <button type="button" onClick={tester} disabled={test} className="o-rmbtn" style={{ ...RM_BTN, marginTop: 11, width: '100%', opacity: test ? .6 : 1 }}><Fi i="volume" size={12} /> {test ? tr('Test en cours…') : tr('Test sonore (3 s)')}</button>}
      </div>
    </div>
  );
}

/* La saisie du code d'alarme, quand le panneau en exige un : la carte de
 * l'alarme et sa ligne dans la fiche d'un appareil (appareils/fiches.jsx)
 * avaient chacune la sienne (M7, audit du 28/10). Entrée valide, Échap
 * renonce. `serre` : la ligne de la fiche, où le champ s'arrête à 130 px et
 * la croix fait 28 px. `onValider` ne part pas sans code : c'est à lui de le
 * vérifier. */
function SaisieCodeAlarme({ code, setCode, onValider, onAnnuler, style = null, serre = false }) {
  const croix = serre ? 28 : 30;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', ...style }}>
      <input type="password" inputMode="numeric" autoFocus value={code} onChange={(e) => setCode(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onValider(); if (e.key === 'Escape') onAnnuler(); }}
        placeholder={tr('Code')} aria-label={tr('Code')}
        style={{ flex: 1, minWidth: 0, ...(serre ? { maxWidth: 130 } : null), padding: '6px 10px', borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text)', fontSize: 13, fontWeight: 700, letterSpacing: '.2em' }} />
      <button onClick={onValider} style={{ padding: '6px 12px', borderRadius: 10, border: 'none', background: 'var(--o-accent-fond)', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>{tr('Valider')}</button>
      <button onClick={onAnnuler} aria-label={tr('Annuler')} style={{ width: croix, height: croix, borderRadius: 10, border: 'none', background: 'var(--o-s1)', color: 'var(--o-text2)', fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>✕</button>
    </div>
  );
}

/* `message` (ADR 0034) : ce que la carte a a dire entre son nom et ses
 * boutons — un ouvrant ouvert a l'armement, un capteur contourne, par quoi
 * l'alarme s'est declenchee. Rien a dire : rien d'affiche. */
function CvAlarm({ id, hass, sans = false, message = null, label = null }) {
  const st = hass && hass.states ? hass.states[id] : null;
  const s = st ? st.state : null;
  const aAl = (st && st.attributes) || {};
  const call = (svc, code) => commanderService(hass, id, 'alarm_control_panel', svc, { entity_id: id, ...(code ? { code } : {}) });
  // Si le panneau exige un code (code_format), on le demande avant d'agir :
  // Home Assistant refuserait silencieusement sans lui.
  const codeRequis = !!aAl.code_format;
  const codePourArm = codeRequis && aAl.code_arm_required !== false;
  const [demande, setDemande] = useState(null); // { svc } en attente de code
  const [code, setCode] = useState('');
  const agir = (svc) => {
    const faut = svc === 'alarm_disarm' ? codeRequis : codePourArm;
    if (faut) { setDemande({ svc }); setCode(''); } else call(svc);
  };
  const valider = () => { if (demande && code) { call(demande.svc, code); setDemande(null); setCode(''); } };
  // Le temps qu'il reste pour sortir (ou pour désarmer), battu à la seconde.
  const cpt = armCompte(st);
  useSeconde(!!cpt);
  // Le mode que le panneau prépare : son bouton portera le tour de progression.
  const svcVise = cpt ? armVise(st, null) : null;
  /* `enPanne`, comme CvCard (05/10). Morte, l'alarme disait « Armée » en
   * ambre — toute valeur inconnue l'était — et ses modes s'armaient dans le
   * vide ; c'est elle aussi le bloc de l'appareil dans FicheAppareil. Un
   * code en cours de saisie quand elle tombe ne part pas non plus. */
  const mort = enPanne(id, st);
  const [txt, col] = mort ? [tr('Indisponible'), 'var(--o-text3)'] : s === 'disarmed' ? [tr('Désarmée'), 'var(--o-ok)']
    : s === 'triggered' ? [tr('ALERTE'), 'var(--o-bad)']
      : (s === 'arming' || s === 'pending') ? [cpt ? tr('Activation dans {n} s', { n: cpt.reste }) : tr('Activation en cours…'), 'var(--o-warn2)']
        : s ? [tr('Armée'), 'var(--o-warn2)'] : ['—', 'var(--o-text3)'];
  // Les chips SUIVENT le panneau : `supported_features` dit quels armements
  // existent (Alarmo n'expose que les modes configurés). Proposer « Maison »
  // à un panneau qui l'ignore, c'est promettre un geste sans effet.
  const CHIPS = mort ? [] : armChips(aAl, s);
  return (
    <div className={'o-piece o-carte-alarme' + (mort ? ' o-panne' : '')} style={{ ...CV_CADRE, height: '100%', minHeight: 172, overflow: 'hidden' }}>
      {/* GABARIT MAISON — règle dure : icône hg SEULE, état hd, TITRE SOUS
        * L'ICÔNE avec de l'air. Jamais côte à côte, maquette ou pas. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hx(col, .16), color: col }}><GlypheCarte id={id} size={15}><Fi i="shield-check" size={15} /></GlypheCarte></span>
        <span style={{ fontSize: 11, fontWeight: 800, color: col }}>{txt}</span>
      </div>
      <div style={{ marginTop: 8, ...(sans ? { flex: 1, display: 'flex', flexDirection: 'column' } : {}) }}>
        <div style={RM_NAME}>{label || cvName(st, id)}</div>
        {/* Le message se DIT aussi (audit du 03/10, règle de l'ADR 0107) : il
          * arrive quand l'alarme s'arme sur un ouvrant resté ouvert, ou se
          * déclenche — la carte est déjà à l'écran, et un encadré monté avec
          * son texte ne s'annonçait pas. La région est donc toujours là, vide
          * tant qu'il n'y a rien ; l'encadré reste pour l'œil. Poli : c'est un
          * état, pas la réponse à un geste. */}
        <div className="o-vh" role="status">{message && message.texte ? message.texte : ''}</div>
        {message && message.texte && (
          <div aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8, padding: '8px 10px', borderRadius: 10, background: message.niveau === 'danger' ? 'rgba(var(--o-bad-rgb),.12)' : 'rgba(var(--o-warn-rgb),.12)', color: message.niveau === 'danger' ? 'var(--o-bad)' : 'var(--o-warn)', fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>
            <Fi i="triangle-warning" size={13} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ minWidth: 0 }}>{message.texte}</span>
          </div>
        )}
        {/* Le temps qui reste se lit sur le tour du mode visé (voir plus bas).
          * Panneau muet sur ce qu'il prépare : la barre reste le repère. */}
        {cpt && !svcVise && (
          <div aria-hidden="true" style={{ height: 4, borderRadius: 4, background: 'var(--o-s1)', overflow: 'hidden', margin: '8px 0 2px' }}>
            <div style={{ height: '100%', width: Math.round((cpt.reste / cpt.total) * 100) + '%', background: col, transition: 'width 1s linear' }} />
          </div>
        )}
        {/* Version « seule » : les chips descendent au pied de la carte,
          * comme les boutons des cartes machines. */}
        {sans && <div style={{ flex: 1 }} />}
        {demande && !mort ? (
          <SaisieCodeAlarme code={code} setCode={setCode} onValider={valider} onAnnuler={() => setDemande(null)} style={{ margin: '7px 0 6px' }} />
        ) : (
          /* Le mot d'une chip ne se TRONQUE jamais (« Dés », « Mais ») : quand la
           * carte est trop etroite pour ses modes, il s'efface et l'icone reste —
           * requete de conteneur, d'apres le nombre de chips (index.css). */
          <div className="o-armchips" data-n={CHIPS.length} style={{ display: 'flex', gap: 8, margin: '7px 0 6px' }}>
            {CHIPS.map(([lbl, svc, actif]) => (
              <button key={svc} onClick={() => agir(svc)} aria-label={lbl} aria-pressed={actif} className="o-armchip" title={lbl}
                style={{ position: 'relative', flex: 1, padding: sans ? '10px 4px' : '6px 4px', borderRadius: 10, border: 'none', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: actif ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: actif ? '#fff' : 'var(--o-text2)' }}>
                {/* L'icone du mode, et le mot — qui s'efface au telephone
                  * (retour user du 16/09 : « on ne les voit pas bien »). */}
                <Fi i={ICONES_ARMEMENT[svc] || 'shield'} size={13} />
                {(cpt && svcVise === svc) ? <span>{cpt.reste + ' s'}</span> : <span className="o-armchip-txt">{lbl}</span>}
                {/* Le tour se referme au rythme du décompte : à zéro, le mode
                  * visé est cerné — l'alarme prend. */}
                {cpt && svcVise === svc && <ArmAnneau pct={100 - (cpt.reste / cpt.total) * 100} col={col} />}
              </button>
            ))}
          </div>
        )}
        {/* Le tour de la maison : ouvrants et caméras — sauf en version
          * « seule » (sans capteurs). Les caméras viennent de la
          * CONFIGURATION d'abord (comme la vue Sécurité), la découverte
          * camera.* en repli. */}
        {!sans && (() => {
          const S = (hass && hass.states) || {};
          const os = ouvrantsDe(S);
          const ouverts = os.filter(o => o.on).length;
          const cfgCams = (() => { try { const c = cfgVal('loggia_cameras', null); return Array.isArray(c) ? c.map(x => x && x.haid).filter(Boolean) : []; } catch { return []; } })();
          const camIds = cfgCams.length ? cfgCams : Object.keys(S).filter(cid => cid.indexOf('camera.') === 0);
          const cams = camIds.filter(cid => S[cid] && S[cid].state !== 'unavailable').length;
          // Lignes nues, sans fond ni contour (retour 31/08).
          const ligne = (l, v, c) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text1)' }}>{l}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: c }}>{v}</span>
            </div>
          );
          if (!os.length && !camIds.length) return null;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {os.length > 0 && ligne(tr('Ouvrants'), ouverts === 0 ? tr('{n} fermés', { n: os.length }) : trN(ouverts, '{n} ouvert', '{n} ouverts'), ouverts ? 'var(--o-warn)' : 'var(--o-ok)')}
              {camIds.length > 0 && ligne(tr('Caméras'), tr('{n} en ligne', { n: cams }), 'var(--o-text2)')}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/* ── Cartes AGRÉGATS (sans entité d'ancrage, comme l'horloge) ────────────────
 * Elles lisent la maison entière : découverte par device_class ou
 * configuration existante — zéro YAML, sources injectables pour la biblio. */
const OUVRANT_DCS = CLASSES_OUVRANT;
const ouvrantsDe = (S) => Object.keys(S || {})
  .filter(id => id.indexOf('binary_sensor.') === 0 && S[id] && S[id].state !== 'unavailable')
  .map(id => ({ id, dc: (S[id].attributes || {}).device_class, on: S[id].state === 'on', nom: (S[id].attributes || {}).friendly_name || id, lc: S[id].last_changed }))
  .filter(o => OUVRANT_DCS.indexOf(o.dc) >= 0);

/* La feuille du Calendrier — le mois entier, et le choix des agendas (la carte
 * du rail l'ouvre) : la coquille. Le contenu se charge à la demande
 * (`feuillecalendrier.jsx`, audit des lumières, 19/10 : la borne du démarrage)
 * et n'importe jamais App.jsx : la coquille lui passe `useAgenda`, qui n'existe
 * qu'ici. Comme `FicheLumiere`, elle GARDE la feuille et pose la frontière
 * Suspense DEDANS : un morceau qui ne se charge pas se dit dans la feuille, par
 * sa barrière (`Barriere`, ui.jsx). Le repli tient la hauteur d'une fiche
 * (260 px), comme celui des autres feuilles chargées à la demande. */
function FeuilleCalendrier({ hass, onClose }) {
  return (
    <BottomSheet onClose={onClose}>
      {() => (
        <Suspense fallback={<div style={{ minHeight: 260 }} />}>
          <FeuilleCalendrierContent hass={hass} useAgenda={useAgenda} />
        </Suspense>
      )}
    </BottomSheet>
  );
}

export { CAMERAS, sousCamera, tuileCamera, CamSheet, CameraTile, FAN_FR, MenuDeroulant, cvIcoEntite, CvCard, CV_CADRE, PlugIcon, texteDate, armCompte, useSeconde, armChips, CvSirene, CvAlarm, SaisieCodeAlarme, OUVRANT_DCS, ouvrantsDe, FeuilleCalendrier };
