/**
 * Vue Parametres et son formulaire d'entites, charges a la demande.
 *
 * 1300 lignes que personne n'analyse en ouvrant le dashboard : on n'arrive ici
 * que volontairement. Le module ne remonte jamais vers App.jsx — un cycle
 * ramenerait le monolithe entier dans ce morceau et annulerait le decoupage.
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { Fi, Ico, Anim, REDUCE_MOTION, EnRow, EnVal, EnGauge, LOOK_DEF, HIDDEN_VIEWS,
  readViewsCfg, writeViewsCfg, cl_hexRgb, userBg, userImg, personPicture } from '../ui.jsx';
import { cfgVal, cfgSet, getHass, loggiaEnt, LOGGIA_CFG, LOGGIA_ENT, LOGGIA_RESOLVED, LOGGIA_INDEX, readLS,
  enHaids, medCompanion, medPlayers, normRooms, secAlarm, switchLightsCfg,
  exportLoggiaConfig, importLoggiaConfig,
  exportConfigComplete, importConfigComplete, resetLoggiaComplet,
  cheminPanneau, lirePageAccueil, definirPageAccueil } from '../state.js';
import { CV_ICONS, cvInp, cvName, cvEstTpl, cvKey, TplForm, USER_COLORS, BottomSheet, EntPicker, CV_DOM_ICON, cvDomain } from '../ui.jsx';
import { useLoggia } from '../runtime.js';
import { viewReason } from '../views.js';
import { weatherEntity } from '../wxutil.jsx';
import { tr, choixLangue, languesDisponibles } from '../i18n.js';

/**
 * Ce que l'installation est REELLEMENT.
 *
 * La carte affichait « v3.0 » et « A JOUR » ecrits en dur : deux affirmations
 * qui ne venaient d'aucune source et se sont retrouvees fausses des la
 * publication de la 2.1.0.
 *
 * La version se lit dans le manifeste du composant qui tourne — c'est lui que
 * HACS remplace. L'etat de mise a jour, lui, ne peut pas se deviner sans
 * interroger GitHub, ce que ce dashboard s'interdit (aucune ressource
 * externe) : quand HACS suit l'integration, il cree une entite `update` qui
 * porte deja la reponse. Sans elle, on n'affirme rien.
 */
function installationReelle() {
  const version = (LOGGIA_INDEX && LOGGIA_INDEX.componentVersion) || null;
  const S = (getHass() || {}).states || {};
  const suivi = Object.keys(S).find(id => id.startsWith('update.')
    && /loggia/i.test(id + ' ' + ((S[id].attributes && S[id].attributes.friendly_name) || '')));
  const st = suivi ? S[suivi] : null;
  const at = (st && st.attributes) || {};
  return {
    version: version ? 'v' + version : null,
    // `on` = une version plus recente existe. Sans entite de suivi, `null` :
    // on ne sait pas, et le dire vaut mieux que de rassurer a tort.
    aJour: st ? (st.state === 'off' ? true : (st.state === 'on' ? false : null)) : null,
    disponible: at.latest_version || null,
    suiviPar: suivi ? 'HACS' : null,
  };
}

// Cartes du sélecteur de thème Loggia ('' = défaut). cols = [accent, fond, accent2] pour l'aperçu.
/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const PRESET_META = () => [
  { id: '', name: 'Loggia', desc: tr('Thème par défaut'), cols: ['#4f8cff', '#0b101b', '#6ea8ff'] },
  { id: 'neumorphix', name: 'Neumorphix', desc: 'Doux, en relief', cols: ['#6c7ae0', '#1e2128', '#5de0d8'] },
  { id: 'google', name: 'Google', desc: tr('Material épuré'), cols: ['#1a73e8', '#171717', '#8ab4f8'] },
  { id: 'ios', name: 'iOS', desc: 'Apple, arrondi', cols: ['#ff9409', '#0d0d10', '#ff9f09'] },
  { id: 'frosted', name: 'Frosted Glass', desc: tr('Verre dépoli, flou'), cols: ['#6a74d3', '#1a2540', '#bcc8f0'] },
  { id: 'onedark', name: 'One Dark Pro', desc: "L'esprit Atom", cols: ['#61afef', '#282c34', '#98c379'] },
  { id: 'dracula', name: 'Dracula', desc: 'Violet vampirique', cols: ['#bd93f9', '#282a36', '#ff79c6'] },
  { id: 'github', name: 'GitHub Dark', desc: tr('Sobre, façon GitHub'), cols: ['#58a6ff', '#0d1117', '#3fb950'] },
  { id: 'tokyo', name: 'Tokyo Night', desc: tr('Néon nocturne'), cols: ['#7aa2f7', '#1a1b26', '#bb9af7'] },
  { id: 'material', name: 'Material Theme', desc: tr('Océan Material'), cols: ['#80cbc4', '#263238', '#82aaff'] },
  { id: 'nightowl', name: 'Night Owl', desc: 'Nuit profonde', cols: ['#82aaff', '#011627', '#c792ea'] },
  { id: 'lavande', name: 'Lavande', desc: 'Charcoal, lavande douce', cols: ['#c3b5e6', '#2b2b2f', '#d6cdea'] },
  { id: 'plum', name: 'Plum Wine', desc: tr('Prune, rose poudré'), cols: ['#eda4b6', '#341624', '#f2c6cf'] },
  { id: 'atrium', name: 'Atrium', desc: tr('A plat, sans ombre'), cols: ['#5b8cff', '#050609', '#2dd4bf'] },
];
// Luminance 0..1 d'une couleur (hex/rgb) → choix sombre/clair

/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const PAR_TABS = () => [['connexion', tr('Connexion HA')], ['users', tr('Utilisateurs')], ['vues', tr('Vues')], ['entites', tr('Entités')], ['auto', tr('Automatisations')], ['maj', tr('Mises à jour')], ['apparence', tr('Apparence')], ['about', tr('À propos')]];
// Nav latérale des Paramètres, groupée façon Atrium (réf. user 20/08) : { grp, items: [id, label, glyphe UICons] }

/* Une FONCTION, pas une table.
 *
 * Evaluee a l'import, cette liste figeait ses libelles dans la langue du
 * demarrage. C'est ce qui obligeait a recharger la page apres un changement de
 * langue. Appelee au rendu, elle se dit dans la langue du moment. */
const PAR_HELPS = () => [
  { id: 'nabu', title: tr('Bascule automatique pour Nabu Casa'), body: "Si tu ouvres Loggia depuis une URL *.ui.nabu.casa (HTTPS) alors que l'URL stockée est en http://, Loggia détecte le conflit et utilise automatiquement l'origine de la page courante. Aucune intervention nécessaire." },
  { id: 'why', title: 'Pourquoi cette bascule ?', body: 'Les navigateurs bloquent les requêtes HTTP depuis une page HTTPS (protection "mixed content"). Le token n\'est pas en cause — il marche pour les deux URLs.' },
  { id: 'notoken', title: tr('Sans token'), body: 'Loggia fonctionne en mode démo (état local seulement).' },
];



/* ════════════ VUES PERSONNALISÉES : cartes génériques par domaine + éditeur (admin) ════════════ */

// Éditeur du code administrateur (comme V1 AdminPinEditor). Stocké localStorage 'loggia_admin_pin'.
// Aperçu vivant du thème (Paramètres → Apparence) : il rend avec les CSS vars COURANTES,
// donc il suit chaque clic de thème/mode sans plomberie. Valeurs réelles si hass est là.
function ParPreview({ themeMode, loggiaTheme = '', hass, userName = '', look = LOOK_DEF }) {
  // Les rayons de l'apercu sont en dur (il doit rester lisible a 264 px) : on les derive
  // du reglage « Arrondi » pour qu'il montre vraiment ce que donnent Net / Doux / Rond.
  const RAD = look.radius === 'net' ? [5, 4, 4, 3] : look.radius === 'rond' ? [22, 17, 15, 9] : [16, 11, 10, 6];
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const iv = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(iv); }, []);
  const { resolved: pvRes } = useLoggia();
  const S = (hass && hass.states) || {};
  const rooms = normRooms(cfgVal('loggia_rooms', null));
  const t0 = rooms[0] && rooms[0].haid && rooms[0].haid.temp ? S[rooms[0].haid.temp] : null;
  const temp = t0 && !isNaN(parseFloat(t0.state)) ? parseFloat(t0.state).toFixed(1).replace('.', ',') + ' °C' : '—';
  const lightsOn = Object.keys(S).filter(id => id.indexOf('light.') === 0 && S[id].state === 'on').length;
  const en = { ...enHaids(), ...(cfgVal('loggia_energyHaids', null) || {}) };
  const cw = en.consoNow && S[en.consoNow] ? parseFloat(S[en.consoNow].state) : NaN;
  const conso = !isNaN(cw) ? (Math.abs(cw) >= 995 ? (Math.abs(cw) / 1000).toFixed(1).replace('.', ',') + ' kW' : Math.round(Math.abs(cw)) + ' W') : '—';
  const pvAlarm = (pvRes && pvRes.alarm && pvRes.alarm.available) ? pvRes.alarm.main : null;
  const al = (secAlarm() && S[secAlarm()]) ? S[secAlarm()] : (pvAlarm ? S[pvAlarm] : null);
  const alTxt = al ? (al.state === 'disarmed' ? tr('désarmée') : al.state.indexOf('armed') === 0 ? 'armée' : al.state) : '—';
  const h = now.getHours();
  const greet = h < 6 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? tr('Bon après-midi') : 'Bonsoir';
  const tile = (v, l, c) => (
    <div key={l} style={{ background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: RAD[2], padding: '9px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 3, background: c, flexShrink: 0 }} /><span style={{ fontSize: 12.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span></div>
      <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 3 }}>{l}</div>
    </div>
  );
  return (
    <div className="o-par-preview" style={{ position: 'sticky', top: 20 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', color: 'var(--o-text3)', padding: '2px 2px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>{tr('APERÇU')}<span style={{ flex: 1, height: 1, background: 'var(--o-bd3)' }} /></div>
      <div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: RAD[0], padding: 13, boxShadow: 'var(--o-shadow,0 10px 26px rgba(0,0,0,.3))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ width: 20, height: 20, borderRadius: 6, background: 'linear-gradient(135deg,var(--o-ok),var(--o-accent))', flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, fontWeight: 800 }}>Loggia</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums' }}>{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</span>
        </div>
        <div style={{ background: 'var(--o-s3)', border: 'var(--o-bw,1px) solid var(--o-bd3)', borderRadius: RAD[1], padding: '10px 12px', marginBottom: 9 }}>
          <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 15, fontWeight: 500 }}>{greet}{userName ? ', ' + userName : ''}</div>
          <div style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--o-text3)', marginTop: 2 }}>{tr("l'aperçu suit le thème choisi")}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 9 }}>
          {tile(temp, rooms[0] ? rooms[0].room : tr('Pièce'), '#ffb347')}
          {tile(lightsOn + ' on', tr('Lumières'), 'var(--o-gold)')}
          {tile(conso, tr('Consommation'), 'var(--o-ok)')}
          {tile(alTxt, tr('Alarme'), 'var(--o-accent)')}
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          <span style={{ flex: 1.4, height: 14, borderRadius: RAD[3], background: 'var(--o-accent)', opacity: .85 }} />
          <span style={{ flex: 1, height: 14, borderRadius: RAD[3], background: 'var(--o-s1)' }} />
          <span style={{ flex: 1, height: 14, borderRadius: RAD[3], background: 'var(--o-s2)' }} />
          <span style={{ flex: 1, height: 14, borderRadius: RAD[3], background: 'var(--o-s3)' }} />
        </div>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--o-text3)', padding: '8px 2px 0' }}>Thème « {(PRESET_META().find(x => x.id === (loggiaTheme || '')) || PRESET_META()[0]).name} » · mode {themeMode === 'light' ? 'clair' : 'foncé'}.</div>
    </div>
  );
}

/**
 * Propose un fichier au telechargement.
 *
 * Le presse-papier ne suffit pas pour une configuration complete : elle peut
 * peser plusieurs dizaines de kilo-octets, et surtout on veut pouvoir la garder.
 */
function telechargerConfig(texte, base) {
  try {
    const jour = new Date().toISOString().slice(0, 10);
    const blob = new Blob([texte], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = base + '-' + jour + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) { return false; }
}

function ResetLoggiaBtn({ compact = false }) {
  const [arm, setArm] = useState(false);
  useEffect(() => { if (!arm) return undefined; const t = setTimeout(() => setArm(false), 4000); return () => clearTimeout(t); }, [arm]);
  const [enCours, setEnCours] = useState(false);
  /**
   * Remise a zero REELLE : la configuration du serveur comprise.
   *
   * L'ancienne version ne vidait que le stockage de ce navigateur. La
   * configuration etant partagee entre appareils depuis, tout redescendait du
   * serveur au rechargement : le bouton promettait une remise a zero qu'il ne
   * faisait pas.
   *
   * Une sauvegarde part AVANT, automatiquement. L'operation ne se rattrape pas
   * autrement, et personne ne pense a exporter avant d'effacer.
   */
  const doReset = async () => {
    setEnCours(true);
    try {
      const j = await exportConfigComplete();
      telechargerConfig(j, 'loggia-avant-remise-a-zero');
    } catch (e) { /* une sauvegarde impossible ne doit pas bloquer la remise a zero demandee */ }
    try { await resetLoggiaComplet(); } catch (e) { /* on recharge quand meme */ }
    window.location.reload();
  };
  return <button disabled={enCours} onClick={() => { if (arm) doReset(); else setArm(true); }} style={{ padding: compact ? '5px 10px' : '9px 16px', borderRadius: compact ? 8 : 11, flexShrink: 0, background: arm ? 'var(--o-bad)' : 'rgba(var(--o-bad-rgb),.12)', border: '1px solid rgba(var(--o-bad-rgb),.4)', color: arm ? '#fff' : 'var(--o-bad)', fontWeight: 700, fontSize: compact ? 11.5 : 12.5, cursor: 'pointer', transition: 'all .2s' }}>{arm ? 'Confirmer ?' : (compact ? 'Réinitialiser Loggia' : 'Réinitialiser')}</button>;
}

function AdminPinEditor() {
  const [pin, setPin] = useState(() => { try { return localStorage.getItem('loggia_admin_pin') || '0000'; } catch (e) { return '0000'; } });
  const [show, setShow] = useState(false);
  const [np, setNp] = useState('');
  const [cf, setCf] = useState('');
  const [msg, setMsg] = useState(null);
  const dg = v => v.replace(/\D/g, '').slice(0, 4);
  const save = () => {
    if (np.length !== 4) { setMsg({ ok: false, t: 'Le code doit faire 4 chiffres.' }); return; }
    if (np !== cf) { setMsg({ ok: false, t: 'Les deux codes ne correspondent pas.' }); return; }
    try { localStorage.setItem('loggia_admin_pin', np); } catch (e) {}
    setPin(np); setNp(''); setCf(''); setMsg({ ok: true, t: 'Code administrateur mis à jour.' });
  };
  const inp = { width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 18, fontWeight: 700, letterSpacing: '.3em', textAlign: 'center', fontFamily: 'monospace' };
  return (
    <div style={{ marginTop: 22, paddingTop: 20, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Code administrateur</div>
      <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 16 }}>{tr('Requis pour basculer vers un profil Admin. Reste local à cet appareil (jamais synchronisé).')}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--o-text3)' }}>ACTUEL</span>
        <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, letterSpacing: '.3em', color: 'var(--o-accent-soft)' }}>{show ? pin : '••••'}</span>
        <button onClick={() => setShow(s => !s)} style={{ padding: '5px 12px', borderRadius: 9, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{show ? 'Masquer' : 'Afficher'}</button>
      </div>
      <div className="grid-par-about" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 6 }}>NOUVEAU CODE</div><input value={np} onChange={e => { setNp(dg(e.target.value)); setMsg(null); }} inputMode="numeric" placeholder="••••" style={inp} /></div>
        <div><div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 6 }}>CONFIRMER</div><input value={cf} onChange={e => { setCf(dg(e.target.value)); setMsg(null); }} inputMode="numeric" placeholder="••••" style={inp} /></div>
      </div>
      {msg && <div style={{ fontSize: 12.5, fontWeight: 600, color: msg.ok ? 'var(--o-ok)' : '#f87171', marginBottom: 12 }}>{msg.t}</div>}
      <button onClick={save} style={{ padding: '11px 18px', borderRadius: 12, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>{tr('Enregistrer le code')}</button>
    </div>
  );
}



// Modale ajout / modification d'un utilisateur (admin uniquement).
function UserEditor({ user, onSave, onDelete, onClose }) {
  const [name, setName] = useState(user ? user.name : '');
  const [role, setRole] = useState(user ? user.role : 'Famille');
  const [c, setC] = useState(user ? (user.c || USER_COLORS[0]) : USER_COLORS[0]);
  const inp = { width: '100%', padding: '12px 14px', borderRadius: 12, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 14.5, fontWeight: 600, boxSizing: 'border-box' };
  const save = () => { const n = name.trim(); if (!n) return; onSave({ name: n, role, c, sub: role + ' · ' + n.toLowerCase().replace(/\s+/g, '.') }); };
  const roleBtn = (on) => ({ flex: 1, padding: 11, borderRadius: 11, border: '1px solid ' + (on ? 'var(--o-accent)' : 'var(--o-bd1)'), background: on ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s2)', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' });
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(4,8,15,.6)', backdropFilter: 'blur(4px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 380, maxHeight: '92vh', overflowY: 'auto', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: 18, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}><span style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, color: '#fff', background: `linear-gradient(135deg,${c},rgba(${cl_hexRgb(c)},.6))` }}>{(name.trim()[0] || '?').toUpperCase()}</span><div style={{ fontSize: 17, fontWeight: 800 }}>{user ? "Modifier l'utilisateur" : 'Nouvel utilisateur'}</div></div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 6 }}>NOM</div>
        <input value={name} autoFocus onChange={e => setName(e.target.value)} placeholder="Nom" style={{ ...inp, marginBottom: 16 }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 6 }}>{tr('RÔLE')}</div>
        <div style={{ display: 'flex', gap: 9, marginBottom: 16 }}>
          <button onClick={() => setRole('Admin')} style={roleBtn(role === 'Admin')}>Admin</button>
          <button onClick={() => setRole('Famille')} style={roleBtn(role === 'Famille')}>Famille</button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 8 }}>COULEUR</div>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginBottom: 20 }}>
          {USER_COLORS.map(col => <button key={col} onClick={() => setC(col)} style={{ width: 32, height: 32, borderRadius: '50%', border: col === c ? '2px solid var(--o-text)' : '2px solid transparent', background: col, cursor: 'pointer', flexShrink: 0 }} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {onDelete && <button onClick={onDelete} style={{ padding: '11px 15px', borderRadius: 12, background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.4)', color: '#f87171', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Supprimer</button>}
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ padding: '11px 16px', borderRadius: 12, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Annuler</button>
          <button onClick={save} style={{ padding: '11px 18px', borderRadius: 12, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// Éditeur de vue custom (modal admin) : nom, icône, sélection d'entités avec recherche.
function CvEditor({ cv, hass, onSave, onClose }) {
  const [name, setName] = useState(cv ? cv.name : '');
  const [icon, setIcon] = useState(cv ? cv.icon : 'sparkles');
  const [ents, setEnts] = useState(cv ? [...cv.ents] : []);
  const inp = cvInp;
  const save = () => { const n = name.trim(); if (!n) return; onSave({ id: cv ? cv.id : 'cv_' + Math.random().toString(36).slice(2, 8), name: n, icon, ents }); };
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(4,8,15,.6)', backdropFilter: 'blur(4px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onMouseDown={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 470, maxHeight: '92vh', overflowY: 'auto', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd1)', borderRadius: 18, padding: 22, boxShadow: '0 24px 60px rgba(0,0,0,.5)' }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 16 }}>{cv ? 'Modifier la vue' : 'Nouvelle vue'}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', marginBottom: 6 }}>NOM</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Ma vue" style={inp} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', margin: '14px 0 6px' }}>{tr('ICÔNE')}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {CV_ICONS.map(ic => <button key={ic} onClick={() => setIcon(ic)} style={{ width: 40, height: 40, borderRadius: 11, border: icon === ic ? '2px solid var(--o-accent)' : 'var(--o-bw,1px) solid var(--o-bd2)', background: icon === ic ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: icon === ic ? 'var(--o-accent-soft)' : 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i={ic} size={16} /></button>)}
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', margin: '14px 0 6px' }}>ENTITÉS ({ents.length})</div>
        {ents.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {ents.map((x, i) => <span key={cvKey(x)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 10px', borderRadius: 9, background: 'rgba(var(--o-accent-rgb),.12)', border: '1px solid rgba(var(--o-accent-rgb),.25)', fontSize: 11.5, fontWeight: 700, color: 'var(--o-accent-soft)', maxWidth: '100%' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cvEstTpl(x) ? '{ } ' + (x.name || 'Template') : cvName(hass && hass.states && hass.states[x], x)}</span><span onClick={() => setEnts(prev => prev.filter((_, k) => k !== i))} style={{ cursor: 'pointer', fontWeight: 800, opacity: .8 }}>×</span></span>)}
        </div>}
        <EntPicker hass={hass} exclude={ents.filter(x => typeof x === 'string')} onPick={(id) => setEnts(prev => prev.indexOf(id) < 0 ? [...prev, id] : prev)} />
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.04em', margin: '14px 0 6px' }}>{tr('OU UNE CARTE TEMPLATE')}</div>
        <TplForm onAdd={(t) => setEnts(prev => [...prev, t])} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '11px 16px', borderRadius: 11, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>Annuler</button>
          <button onClick={save} style={{ padding: '11px 20px', borderRadius: 11, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', opacity: name.trim() ? 1 : .5 }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

/* ── Onglet Entités : éditeur générique de listes (Paramètres, admin) ──
   cols: [{k, label, ph, domain?, flex?}] — domain remplit un <datalist> d'autocomplétion depuis hass. */

const entInp = { width: '100%', padding: '9px 11px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 12.5, fontWeight: 600, boxSizing: 'border-box', fontFamily: 'inherit' };

function EntSection({ title, desc, cols, rows, onRows, addable = true, check = null }) {
  const set = (i, k, v) => onRows(rows.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const del = (i) => onRows(rows.filter((_, j) => j !== i));
  const add = () => onRows([...rows, { ...Object.fromEntries(cols.map(c => [c.k, ''])), _k: 'r' + Date.now() + Math.random().toString(36).slice(2, 6) }]);
  // clés stables : les lignes chargées depuis localStorage n'ont pas de _k → on le pose une fois
  // Pas d'effet de rattrapage des cles ici : il appelait `onRows`, donc
  // `entSet`, qui leve `entTouched` — et le formulaire cessait alors de se
  // resynchroniser sur la configuration serveur, puis l'ecrasait a
  // l'enregistrement. Les cles sont posees par `readEnt()`, a la lecture.
  // Un filet de separation, pas un cadre : ces sections vivent deja dans la
  // carte des reglages, et deux encadrements imbriques volent de chaque cote
  // une largeur qui manque cruellement sur un telephone.
  return (
    <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>{title}</div>
        {addable && <button onClick={add} style={{ padding: '5px 11px', borderRadius: 9, background: 'rgba(var(--o-accent-rgb),.14)', border: 'none', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>+ Ajouter</button>}
      </div>
      {desc && <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>{desc}</div>}
      <div style={{ display: 'flex', gap: 8, padding: '0 2px 5px', fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--o-text3)' }}>
        {cols.map(c => <span key={c.k} style={{ flex: c.flex || 1, minWidth: 0 }}>{c.label.toUpperCase()}</span>)}
        {addable && <span style={{ width: 30, flexShrink: 0 }} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {rows.map((r, i) => (
          <div key={r._k || 'i' + i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {cols.map(c => { const v = r[c.k] || ''; const st = check && c.domain && v ? (check(v) ? 'ok' : 'bad') : null; return (
              <span key={c.k} style={{ position: 'relative', flex: c.flex || 1, minWidth: 0, display: 'flex' }}>
                <input value={v} onChange={e => set(i, c.k, e.target.value)} placeholder={c.ph || ''} list={c.domain ? 'o-dl-' + c.domain : undefined} spellCheck={false} style={{ ...entInp, width: '100%', minWidth: 0, paddingRight: st ? 24 : undefined, borderColor: st === 'bad' ? 'rgba(var(--o-bad-rgb),.55)' : undefined }} />
                {st && <span title={st === 'ok' ? 'Entité trouvée' : 'Introuvable dans Home Assistant'} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', width: 7, height: 7, borderRadius: '50%', background: st === 'ok' ? 'var(--o-ok)' : 'var(--o-bad)', pointerEvents: 'none' }} />}
              </span>
            ); })}
            {addable && <button onClick={() => del(i)} title="Retirer" style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: 'rgba(var(--o-bad-rgb),.12)', border: 'none', color: 'var(--o-bad)', cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>×</button>}
          </div>
        ))}
        {!rows.length && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '4px 2px' }}>Vide.</div>}
      </div>
    </div>
  );
}

// Clés synchronisables entre origines (WiFi = IP locale / 5G = Nabu Casa → localStorage SÉPARÉS).
// loggia_admin_pin exclu volontairement (PIN local à l'appareil, jamais synchronisé) ; loggia_active_user = par appareil.

// Hook partagé : état + persistance de la config d'entités (onglet Entités ET édition en place sur chaque vue).
function useEntConfig(hass) {
  // Cle de rendu stable, posee DES la lecture : sans elle, les lignes se
  // reperaient par leur rang et une suppression deplacait le curseur de saisie.
  const avecCle = (a) => a.map((r, i) => ({ ...r, _k: r._k || 'k' + i + '_' + Math.random().toString(36).slice(2, 6) }));
  // Lecture de la configuration courante, telle que le formulaire l'affiche.
  const readEnt = () => ({
    rooms: avecCle(normRooms(cfgVal('loggia_rooms', null)).map(r => ({ room: r.room || '', temp: (r.haid && r.haid.temp) || '', humidity: (r.haid && r.haid.humidity) || '', co2: (r.haid && r.haid.co2) || '',
      lights: Array.isArray(r.haid && r.haid.lights) ? r.haid.lights.join(', ') : ((r.haid && r.haid.lights) || '') }))),
    energy: { ...enHaids(), ...(cfgVal('loggia_energyHaids', null) || {}) },
    alarm: secAlarm() || '',
    weather: weatherEntity(getHass()) || '',
    people: avecCle((cfgVal('loggia_people', null) || []).map(p => ({ name: p.name || '', haid: p.haid || '' }))),
    switches: avecCle(switchLightsCfg().map(id => ({ haid: id }))),
    cams: avecCle((cfgVal('loggia_cameras', null) || []).map(c => ({ name: c.name || '', haid: c.haid || '' }))),
    medias: avecCle(medPlayers().map(m => ({ name: m.name || '', haid: m.haid || '', ma: m.ma || medCompanion(m.haid) || '' }))),
    /* Chauffage : les thermostats `climate.*` se decouvrent seuls, mais un
     * radiateur fil pilote est un `switch` entoure d'aides — seule une
     * configuration peut dire lesquelles. Elle n'avait aucun ecran jusqu'ici. */
    climate: avecCle((cfgVal('loggia_climate', null) || loggiaEnt('climate', null) || []).map(z => ({
      name: z.name || '', room: z.room || '', haid: z.haid || '',
      tempCible: z.tempCible || '', modeEnt: z.modeEnt || '',
      autoEnt: z.autoEnt || '', tempSensor: z.tempSensor || '',
    }))),
  });
  const [ent, setEnt] = useState(readEnt);
  // La configuration serveur arrive APRES le premier rendu. Sans cette
  // resynchronisation, le formulaire montrerait un etat capture avant sa
  // reponse — et l'enregistrer ecraserait les vrais reglages.
  const [entTouched, setEntTouched] = useState(false);
  const cfgSig = JSON.stringify(LOGGIA_CFG || {});
  useEffect(() => { if (!entTouched) setEnt(readEnt()); }, [cfgSig]);
  const entSet = (k) => (rows) => { setEntTouched(true); setEnt(o => ({ ...o, [k]: rows })); };
  const ENT_KEYS = ['loggia_rooms', 'loggia_energyHaids', 'loggia_alarm', 'loggia_people', 'loggia_switchlights', 'loggia_cameras', 'loggia_medias', 'loggia_climate'];
  const saveEnt = () => {
    try {
      cfgSet({
        loggia_rooms: ent.rooms.filter(r => r.room).map(r => ({ room: r.room, haid: { temp: r.temp || null, humidity: r.humidity || null, co2: r.co2 || null,
          // Vide = toutes les lumieres de la piece. Une liste explicite ne
          // vaut que pour le bouton de la carte, pas pour le comptage.
          lights: String(r.lights || '').split(',').map(s => s.trim()).filter(Boolean) } })),
        loggia_energyHaids: ent.energy,
        loggia_alarm: ent.alarm || '',
        loggia_weather: ent.weather || '',
        loggia_people: ent.people.filter(p => p.haid),
        loggia_switchlights: ent.switches.map(s => s.haid).filter(Boolean),
        loggia_cameras: ent.cams.filter(c => c.haid).map((c, i) => ({ id: 'cam_' + i, name: c.name || ('Caméra ' + (i + 1)), online: true, haid: c.haid })),
        loggia_medias: ent.medias.filter(m => m.haid),
        /* Une zone n'a de sens qu'avec l'entite qu'elle pilote. `id` sert de
         * cle interne : il est derive du nom, faute de mieux, mais reste stable
         * tant que le nom ne bouge pas. */
        loggia_climate: ent.climate.filter(z => z.haid).map((z, i) => ({
          id: (z.name || ('zone' + i)).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('zone' + i),
          name: z.name || z.haid, room: z.room || null, haid: z.haid,
          type: z.haid.indexOf('climate.') === 0 ? 'thermostat' : 'pilot_wire',
          tempCible: z.tempCible || null, modeEnt: z.modeEnt || null,
          autoEnt: z.autoEnt || null, hasAuto: !!z.autoEnt,
          tempSensor: z.tempSensor || null,
        })),
      });
    } catch (e) { alert('Enregistrement impossible — la configuration n’a pas été appliquée.'); return; }
    // L'écriture serveur part en arrière-plan : on lui laisse le temps d'aboutir
    // avant de recharger, sinon la page relirait l'ancienne valeur.
    setTimeout(() => window.location.reload(), 700);
  };
  const resetEnt = () => {
    // `null` efface la clé côté serveur comme en local : sans quoi la valeur
    // enregistrée reviendrait au rechargement.
    const vide = {};
    ENT_KEYS.forEach(k => { vide[k] = null; });
    cfgSet(vide);
    setTimeout(() => window.location.reload(), 700);
  };
  const dlists = useMemo(() => {
    const doms = ['sensor', 'person', 'switch', 'camera', 'media_player', 'alarm_control_panel', 'weather',
      'climate', 'input_number', 'input_select', 'input_boolean'];
    const m = {}; doms.forEach(d => { m[d] = []; });
    if (hass && hass.states) Object.keys(hass.states).forEach(id => { const d = id.slice(0, id.indexOf('.')); if (m[d]) m[d].push(id); });
    Object.keys(m).forEach(d => m[d].sort());
    return m;
  }, [hass]);
  return { ent, setEnt, entSet, saveEnt, resetEnt, dlists };
}



// Sections d'édition des entités — partagées entre l'onglet Paramètres→Entités et le sheet d'édition par vue.
function EntSections({ ent, setEnt, entSet, dlists, only = null, hass = null }) {
  const has = (k) => !only || only.indexOf(k) >= 0;
  const check = hass && hass.states ? (id) => !!hass.states[id] : null;
  return (
    <>
      {Object.keys(dlists).map(d => <datalist key={d} id={'o-dl-' + d}>{dlists[d].map(id => <option key={id} value={id} />)}</datalist>)}
      {has('rooms') && <EntSection title={tr('Pièces (Accueil)')} desc="Cartes pièces : capteurs température / humidité / CO2 (CO2 optionnel). « Lampes du bouton » choisit ce que l'interrupteur de la carte allume — vide, il agit sur toutes les lumières de la pièce." cols={[{ k: 'room', label: tr('Pièce'), ph: tr('Séjour'), flex: .8 }, { k: 'temp', label: tr('Température'), ph: 'sensor.…', domain: 'sensor' }, { k: 'humidity', label: tr('Humidité'), ph: 'sensor.…', domain: 'sensor' }, { k: 'co2', label: 'CO2', ph: 'sensor.… (optionnel)', domain: 'sensor' }, { k: 'lights', label: 'Lampes du bouton', ph: tr('toutes (light.a, light.b)'), domain: 'light' }]} rows={ent.rooms} onRows={entSet('rooms')} check={check} />}
      {has('energy') && (
        <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 3 }}>{tr('Énergie')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>Capteurs de puissance (W) du flux énergétique. Le véhicule et la batterie n'apparaissent sur le schéma que si tu les renseignes.</div>
          {/* Deux colonnes : a trois, le champ tronquait les noms d'entites,
              qui depassent souvent trente caracteres. */}
          <div className="grid-par-about" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 8 }}>
            {[['consoNow', tr('Consommation')], ['surplusNow', 'Surplus'], ['solarOutput', 'Production solaire'],
              ['evNow', 'Véhicule · charge'], ['batNow', 'Batterie · puissance'], ['batSoc', 'Batterie · niveau']].map(([k, l]) => (
              <div key={k}><div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.05em', color: 'var(--o-text3)', marginBottom: 4 }}>{l.toUpperCase()}</div><input value={ent.energy[k] || ''} onChange={e => setEnt(o => ({ ...o, energy: { ...o.energy, [k]: e.target.value } }))} placeholder="sensor.…" list="o-dl-sensor" spellCheck={false} style={entInp} /></div>
            ))}
          </div>
        </div>
      )}
      {has('alarm') && (
        <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 3 }}>Alarme</div>
          <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>{tr("Panneau d'alarme (vue Sécurité, bannière, notifications).")}</div>
          <input value={ent.alarm} onChange={e => setEnt(o => ({ ...o, alarm: e.target.value }))} placeholder="alarm_control_panel.…" list="o-dl-alarm_control_panel" spellCheck={false} style={entInp} />
        </div>
      )}
      {has('weather') && (
        <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 3 }}>{tr('Météo')}</div>
          <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>{tr("Entité météo (vue Météo, bannière de l'Accueil, conseils extérieur).")}</div>
          <input value={ent.weather} onChange={e => setEnt(o => ({ ...o, weather: e.target.value }))} placeholder="weather.…" list="o-dl-weather" spellCheck={false} style={entInp} />
        </div>
      )}
      {has('people') && <EntSection title={tr('Présence')} desc="Personnes affichées sur l'Accueil (avatars)." cols={[{ k: 'name', label: tr('Prénom'), ph: tr('Prénom'), flex: .7 }, { k: 'haid', label: tr('Entité person'), ph: 'person.…', domain: 'person' }]} rows={ent.people} onRows={entSet('people')} check={check} />}
      {has('switches') && <EntSection title={tr('Interrupteurs traités comme lumières')} desc={tr('Entités switch affichées dans la vue Lumières.')} cols={[{ k: 'haid', label: tr('Entité switch'), ph: 'switch.…', domain: 'switch' }]} rows={ent.switches} onRows={entSet('switches')} />}
      {has('cams') && <EntSection title={tr('Caméras (Accueil)')} desc="Tuiles caméras de l'Accueil (flux live)." cols={[{ k: 'name', label: 'Nom', ph: tr('Entrée'), flex: .7 }, { k: 'haid', label: tr('Entité camera'), ph: 'camera.…', domain: 'camera' }]} rows={ent.cams} onRows={entSet('cams')} />}
      {has('medias') && <EntSection title={tr('Lecteurs médias')} desc="Vue Médias. « Compagnon MA » optionnel : entité Music Assistant qui porte titre/pochette (métadonnées + transport)." cols={[{ k: 'name', label: 'Nom', ph: 'Echo Salon', flex: .8 }, { k: 'haid', label: tr('Entité native'), ph: 'media_player.…', domain: 'media_player' }, { k: 'ma', label: 'Compagnon MA', ph: 'media_player.… (optionnel)', domain: 'media_player' }]} rows={ent.medias} onRows={entSet('medias')} />}
      {has('climate') && <EntSection title={tr('Chauffage')}
        desc={tr('Un thermostat (climate.…) est trouvé tout seul : rien à saisir. Cette liste sert aux radiateurs fil pilote — un interrupteur entouré de ses aides, que rien ne permet de deviner.')}
        cols={[
          { k: 'name', label: tr('Nom affiché'), ph: tr('Chambre'), flex: .8 },
          { k: 'room', label: tr('Pièce'), ph: tr('Chambre'), flex: .7 },
          { k: 'haid', label: tr('Interrupteur'), ph: 'switch.… / climate.…', flex: 1.1, check: true },
          { k: 'tempCible', label: tr('Consigne'), ph: 'input_number.…', domain: 'input_number', flex: 1.1 },
          { k: 'modeEnt', label: tr('Mode'), ph: 'input_select.…', domain: 'input_select', flex: 1.1 },
          { k: 'autoEnt', label: tr('Auto'), ph: 'input_boolean.…', domain: 'input_boolean', flex: 1.1 },
          { k: 'tempSensor', label: tr('Température'), ph: 'sensor.…', domain: 'sensor', flex: 1.1 },
        ]}
        rows={ent.climate} onRows={entSet('climate')} check={check} />}
    </>
  );
}



// Quelles sections d'entités chaque vue intégrée peut éditer en place (crayon → sheet).
const VIEW_ENT_SECTIONS = {
  accueil: ['rooms', 'energy', 'people', 'cams'],
  lumieres: ['switches'],
  energie: ['energy'],
  securite: ['alarm', 'cams'],
  medias: ['medias'],
  meteo: ['weather'],
  climat: ['climate'],
};



export function ViewEntSheet({ view, hass, onClose }) {
  const { ent, setEnt, entSet, saveEnt, dlists } = useEntConfig(hass);
  return (
    <BottomSheet onClose={onClose}>
      {close => (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <button onClick={close} aria-label={tr('Fermer')} title={tr('Fermer')} style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--o-s1)', border: 'none', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{tr('Entités de cette vue')}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 14 }}>{tr('Autocomplétion en tapant. « Enregistrer » recharge le dashboard pour appliquer.')}</div>
        <EntSections ent={ent} setEnt={setEnt} entSet={entSet} dlists={dlists} only={VIEW_ENT_SECTIONS[view]} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <button onClick={close} style={{ padding: '10px 16px', borderRadius: 11, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
          <button onClick={saveEnt} style={{ padding: '10px 18px', borderRadius: 11, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Enregistrer et recharger</button>
        </div>
      </>)}
    </BottomSheet>
  );
}

export function ParametresContent({ themeMode, loggiaTheme = '', haTheme, onMode, onPickTheme, onFollowHa, navbar = true, onToggleNavbar, wxFx = true, onToggleWxFx, navMargin = 0, navAuto = true, onNavOffset, onNavOffsetReset, onNavSet, onTopSet, look = LOOK_DEF, onLook, topMargin = 0, topAuto = true, onTopOffset, onTopOffsetReset, hass, users = [], userIdx = 0, isAdmin = false, onAddUser, onUpdateUser, onDeleteUser, customViews = [], onSaveCustomViews }) {
  /* La section ouverte survit au rechargement, comme la vue elle-meme.
   *
   * Changer de langue recharge la page : on revenait au sommaire des sections,
   * alors qu'on venait de regler quelque chose dans Apparence. Retrouver la vue
   * Parametres ne suffisait pas — il fallait rouvrir la section a la main.
   *
   * `hub` reste le point de depart d'un onglet neuf : la memoire est propre a
   * la session, et on n'ouvre pas Loggia le lendemain au milieu d'un reglage. */
  const [tab, setTab] = useState(() => {
    try { return window.sessionStorage.getItem('loggia-par-section') || 'hub'; } catch (e) { return 'hub'; }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem('loggia-par-section', tab); } catch (e) { /* stockage indisponible */ }
  }, [tab]);
  // Une vue que l'installation ne peut pas remplir se montre ici verrouillée,
  // avec son motif : mieux vaut expliquer que faire disparaître sans un mot.
  const { views: availViews } = useLoggia();
  const [open, setOpen] = useState({});
  const [panel, setPanel] = useState(() => { try { return localStorage.getItem('loggia-parpanel') !== '0'; } catch (e) { return true; } });
  const togglePanel = () => setPanel(v => { const nv = !v; try { localStorage.setItem('loggia-parpanel', nv ? '1' : '0'); } catch (e) {} return nv; });
  // Loggia est-il la page ouverte au démarrage, sur ce compte ?
  // true = oui · false = non · null = impossible à savoir (page parente
  // inaccessible, ou Home Assistant qui ne répond pas).
  const [accueilDefaut, setAccueilDefaut] = useState(null);
  useEffect(() => {
    let vivant = true;
    const chemin = cheminPanneau();
    if (!chemin) { setAccueilDefaut(null); return undefined; }
    lirePageAccueil(hass).then(actuel => { if (vivant) setAccueilDefaut(actuel === chemin); });
    return () => { vivant = false; };
  }, [hass]);
  const mettreEnAccueil = () => {
    const chemin = cheminPanneau();
    if (!chemin) return;
    definirPageAccueil(hass, chemin).then(ok => setAccueilDefaut(ok ? true : false));
  };
  // Connexion : latence mesurée sur l'API (design Claude Design 21/08)
  const [lat, setLat] = useState(null); // null = pas mesurée, -1 = échec, n = ms
  const [latBusy, setLatBusy] = useState(false);
  const ping = () => {
    if (!hass || !hass.callApi) { setLat(-1); return; }
    setLatBusy(true); const t0 = performance.now();
    hass.callApi('GET', 'config').then(() => { setLat(Math.round(performance.now() - t0)); setLatBusy(false); }).catch(() => { setLat(-1); setLatBusy(false); });
  };
  useEffect(() => { if (tab === 'connexion' && lat == null) ping(); }, [tab]);
  const accessOrigin = (() => { try { return (window.top && window.top.location.origin) || window.location.origin; } catch (e) { return window.location.origin; } })();
  const accessKind = /nabu\.casa/.test(accessOrigin) ? 'Nabu Casa' : /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|localhost|127\.)/.test(accessOrigin) ? tr('réseau local') : 'accès distant';
  // Adresses du serveur : locales a cet appareil. Loggia n'ouvre PAS de session par ces URL
  // (il emprunte celle du navigateur) — elles servent au test de joignabilite, au repli
  // Nabu Casa et a l'intervalle de rafraichissement du pont hass.
  const [haDraft, setHaDraft] = useState(() => {
    const c = { ...HA_CFG_DEF, ...(cfgVal('loggia_haCfg', null) || {}) };
    if (!c.local && accessKind === tr('réseau local')) c.local = accessOrigin;
    if (!c.remote && accessKind === 'Nabu Casa') c.remote = accessOrigin;
    return c;
  });
  const [urlTest, setUrlTest] = useState({});
  const [themeTab, setThemeTab] = useState(() => (['', 'atrium', 'ios', 'google', 'neumorphix'].indexOf(loggiaTheme || '') >= 0 ? 'natifs' : 'commu'));
  const writeHaCfg = (c) => { try { localStorage.setItem('loggia_haCfg', JSON.stringify(c)); } catch (e) {} };
  const toggleFallback = () => setHaDraft(d => { const n = { ...d, fallback: !d.fallback }; writeHaCfg(n); return n; });
  const testUrl = (key) => {
    const raw = (haDraft[key] || '').trim().replace(/\/+$/, '');
    const set = (o) => setUrlTest(t => ({ ...t, [key]: { ...o, ts: Date.now() } }));
    if (!raw) { set({ ms: -1, msg: 'Adresse vide' }); return; }
    if (!/^https?:\/\//.test(raw)) { set({ ms: -1, msg: 'Doit commencer par http:// ou https://' }); return; }
    setUrlTest(t => ({ ...t, [key]: { busy: true } }));
    if (raw === accessOrigin && hass && hass.callApi) { // acces courant : vrai appel API
      const t0 = performance.now();
      hass.callApi('GET', 'config').then(() => set({ ms: Math.round(performance.now() - t0) })).catch(() => set({ ms: -1, msg: "L'API ne répond pas" }));
      return;
    }
    if (window.location.protocol === 'https:' && raw.indexOf('http://') === 0) { set({ ms: -1, msg: 'Bloqué : page HTTPS, adresse HTTP (contenu mixte)' }); return; }
    const t0 = performance.now();
    const ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const to = setTimeout(() => { try { if (ctl) ctl.abort(); } catch (e) {} }, 2500);
    // no-cors : reponse opaque, on ne lit pas le corps — on mesure la JOIGNABILITE.
    fetch(raw + '/manifest.json', { mode: 'no-cors', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(() => { clearTimeout(to); set({ ms: Math.round(performance.now() - t0) }); })
      .catch(() => { clearTimeout(to); set({ ms: -1, msg: 'Injoignable depuis ce réseau' }); });
  };
  const saveHaCfg = () => { writeHaCfg(haDraft); location.reload(); };
  const resetHaCfg = () => {
    setHaDraft({ ...HA_CFG_DEF, local: accessKind === tr('réseau local') ? accessOrigin : '', remote: accessKind === 'Nabu Casa' ? accessOrigin : '' });
    setUrlTest({});
  };
  const POLL_CHOICES = [[2000, '2 s'], [5000, '5 s'], [10000, '10 s'], [30000, '30 s']];
  const testLine = (key) => {
    const r = urlTest[key];
    if (!r) return null;
    if (r.busy) return { txt: 'Test en cours…', col: 'var(--o-text3)' };
    if (r.ms >= 0) return { txt: 'Répond en ' + r.ms + ' ms' + (hass && hass.states ? ' · ' + Object.keys(hass.states).length + ' entités synchronisées.' : '.'), col: 'var(--o-ok)' };
    return { txt: r.msg || 'Échec', col: 'var(--o-bad)' };
  };
  const [autoQ, setAutoQ] = useState('');
  const [autoFilter, setAutoFilter] = useState('all'); // all | on | off
  const [autoOpen, setAutoOpen] = useState({});
  // Mises à jour : « Tout installer » (confirmation 2 temps) + revérification
  const [updAllConfirm, setUpdAllConfirm] = useState(false);
  const [updCheckTs, setUpdCheckTs] = useState(null);
  // Utilisateurs : dernière activité par profil (posée par applyUser)
  const lastSeen = (() => { try { return JSON.parse(localStorage.getItem('loggia-lastseen') || '{}'); } catch (e) { return {}; } })();
  const seenRel = (name, isCur) => { if (isCur) return 'actif maintenant'; const t = lastSeen[name]; if (!t) return ''; const m = (Date.now() - t) / 60000; if (m < 60) return 'vu il y a ' + Math.max(1, Math.round(m)) + ' min'; if (m < 1440) return 'vu il y a ' + Math.round(m / 60) + ' h'; if (m < 2880) return 'vu hier'; return 'vu il y a ' + Math.round(m / 1440) + ' j'; };
  const [editing, setEditing] = useState(null); // { i, u } pour éditer, { i:null } pour ajouter
  const visTabs = isAdmin ? PAR_TABS() : PAR_TABS().filter(([id]) => id !== 'vues' && id !== 'auto' && id !== 'maj' && id !== 'entites');
  // Automatisations : état optimiste local (id → on/off) au-dessus de hass.
  const [autoOv, setAutoOv] = useState({});
  // Signature des états automation.* → purge l'override optimiste dès que HA confirme (ou change depuis un autre appareil).
  const autoSig = (hass && hass.states) ? Object.keys(hass.states).filter(e => e.indexOf('automation.') === 0).map(id => id + ':' + hass.states[id].state).join('|') : '';
  useEffect(() => {
    setAutoOv(o => {
      const ids = Object.keys(o); if (!ids.length || !hass || !hass.states) return o;
      const n = { ...o }; let ch = false;
      for (const id of ids) { const s = hass.states[id]; if (s && (s.state === 'on') === n[id]) { delete n[id]; ch = true; } }
      return ch ? n : o;
    });
  }, [autoSig]);
  const autoCall = (svc, id) => { try { if (hass && hass.callService) hass.callService('automation', svc, { entity_id: id }); } catch (e) {} };
  // ── Entités (config du dashboard) : édition des mappings, persistés localStorage, appliqués au rechargement ──
  const { ent, setEnt, entSet, saveEnt, resetEnt, dlists } = useEntConfig(hass);
  const entIds = [...ent.rooms.flatMap(r => [r.temp, r.humidity, r.co2]), ent.energy.consoNow, ent.energy.surplusNow, ent.energy.solarOutput, ent.alarm, ...ent.people.map(x => x.haid), ...ent.switches.map(x => x.haid), ...ent.cams.map(x => x.haid), ...ent.medias.flatMap(x => [x.haid, x.ma])].filter(Boolean);
  const entMissing = (hass && hass.states) ? entIds.filter(id => !hass.states[id]) : [];
  const [cvEditing, setCvEditing] = useState(null); // null | 'new' | objet vue custom
  // Synchro entre origines (WiFi/IP locale vs Nabu Casa) : export/import du localStorage Loggia.
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncTxt, setSyncTxt] = useState('');
  const [syncMsg, setSyncMsg] = useState('');
  const doExport = async () => {
    const j = exportLoggiaConfig();
    setSyncTxt(j); setSyncOpen(true);
    try { await navigator.clipboard.writeText(j); setSyncMsg('Copiée dans le presse-papier ✓ — colle-la sur l\'autre accès (Importer).'); }
    catch (e) { setSyncMsg('Copie auto impossible ici — sélectionne le texte ci-dessous et copie-le manuellement.'); }
  };
  const doImport = () => { try { importLoggiaConfig(syncTxt); } catch (e) { setSyncMsg('Import impossible : colle une config valide (bouton « Copier la config » de l\'autre accès).'); } };
  // ── Mises à jour (entités update.*) : install avec confirmation 2 temps, skip, progression ──
  const [updConfirm, setUpdConfirm] = useState(null); // id en attente de confirmation
  const [updBusy, setUpdBusy] = useState({}); // id → timestamp : « Installation… » optimiste dès le clic (HA met du temps à passer in_progress)
  const updTimer = useRef(null);
  useEffect(() => () => clearTimeout(updTimer.current), []);
  const updCall = (svc, id) => { try { if (hass && hass.callService) hass.callService('update', svc, { entity_id: id }); } catch (e) {} };
  const askInstall = (u) => {
    if (updConfirm === u.id) { setUpdConfirm(null); clearTimeout(updTimer.current); setUpdBusy(b => ({ ...b, [u.id]: Date.now() })); updCall('install', u.id); return; }
    setUpdConfirm(u.id); clearTimeout(updTimer.current); updTimer.current = setTimeout(() => setUpdConfirm(null), 4000);
  };
  const upsAll = (hass && hass.states) ? Object.keys(hass.states).filter(e => e.indexOf('update.') === 0).map(id => {
    const s = hass.states[id], at = s.attributes || {};
    let prog = at.in_progress === true ? (at.update_percentage != null ? at.update_percentage : true) : (typeof at.in_progress === 'number' ? at.in_progress : false);
    // optimiste : « Installation… » dès le clic, tant que HA n'a pas confirmé (filet 3 min)
    if (prog === false && updBusy[id] && Date.now() - updBusy[id] < 180000 && s.state === 'on') prog = true;
    return { id, name: at.friendly_name || at.title || id.replace('update.', '').replace(/_/g, ' '), avail: s.state === 'on', installed: at.installed_version, latest: at.latest_version, prog, pic: at.entity_picture, notes: at.release_url };
  }) : [];
  // purge l'optimiste dès que HA prend le relais (in_progress réel) ou que la MàJ est terminée (state off)
  useEffect(() => {
    const ids = Object.keys(updBusy); if (!ids.length || !hass || !hass.states) return;
    const done = ids.filter(id => { const s = hass.states[id]; if (!s) return true; const at = s.attributes || {}; return s.state !== 'on' || at.in_progress === true || typeof at.in_progress === 'number'; });
    if (done.length) setUpdBusy(b => { const n = { ...b }; done.forEach(id => delete n[id]); return n; });
  }, [autoSig, upsAll.map(u => u.id + ':' + u.avail + ':' + String(u.prog)).join('|')]);
  // on n'affiche QUE les mises à jour disponibles ou en cours — celles déjà faites n'encombrent pas la liste
  const ups = upsAll.filter(u => u.avail || u.prog !== false).sort((a, b) => a.name.localeCompare(b.name));
  const upsAvail = ups.filter(u => u.avail).length;
  const upsTotal = upsAll.length;
  const toggleAuto = (a) => { setAutoOv(o => ({ ...o, [a.id]: !a.on })); autoCall(a.on ? 'turn_off' : 'turn_on', a.id); };
  const runAuto = (a) => autoCall('trigger', a.id);
  const autoRel = (t) => { try { if (!t) return ''; const m = (Date.now() - new Date(t).getTime()) / 60000; if (m < 1) return "à l'instant"; if (m < 60) return 'il y a ' + Math.round(m) + ' min'; if (m < 1440) return 'il y a ' + Math.round(m / 60) + ' h'; return 'il y a ' + Math.round(m / 1440) + ' j'; } catch (e) { return ''; } };
  const autos = (hass && hass.states) ? Object.keys(hass.states).filter(e => e.indexOf('automation.') === 0).map(id => { const s = hass.states[id], at = s.attributes || {}; return { id, name: at.friendly_name || id.replace('automation.', '').replace(/_/g, ' '), on: autoOv[id] != null ? autoOv[id] : s.state === 'on', last: at.last_triggered }; }).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const tabStyle = on => on
    ? { padding: '9px 18px', borderRadius: 13, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, background: 'var(--o-accent)', color: '#fff', flexShrink: 0, whiteSpace: 'nowrap' }
    : { padding: '9px 18px', borderRadius: 13, border: 'var(--o-bw,1px) solid var(--o-bd1)', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, background: 'var(--o-s2)', color: 'var(--o-text1)', flexShrink: 0, whiteSpace: 'nowrap' };
  const cardSt = { background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,22px)', padding: 24, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))' };

  // Sections du sommaire : chiffre mis en avant + accroche.
  const SECTIONS = [
    { id: 'users', name: 'Profils', ico: 'users', col: 'var(--o-accent-soft)', bg: 'rgba(var(--o-accent-rgb),.14)',
      sub: (users[userIdx] || {}).name ? (users[userIdx] || {}).name + ' · ' + String((users[userIdx] || {}).role || '').toLowerCase() : 'Profils locaux et code admin',
      big: String(users.length), unit: tr('profils du foyer'), admin: false },
    { id: 'apparence', name: tr('Apparence'), ico: 'palette', col: 'var(--o-purple)', bg: 'rgba(var(--o-purple-rgb),.14)',
      sub: tr('Thème, mode, effets'), big: (PRESET_META().find(x => x.id === loggiaTheme) || PRESET_META()[0]).name, unit: tr('{n} thèmes', { n: PRESET_META().length }), admin: false, small: true },
    { id: 'connexion', name: tr('Connexion HA'), long: 'Connexion à Home Assistant', ico: 'link', col: 'var(--o-ok)', bg: 'rgba(var(--o-ok-rgb),.14)',
      sub: accessKind, pageSub: 'Session empruntée au navigateur · ' + accessKind, big: (lat != null && lat >= 0) ? lat + ' ms' : (hass ? 'active' : 'hors ligne'), unit: hass ? 'session active' : 'session absente', admin: false, small: true },
    { id: 'auto', name: tr('Automatisations'), ico: 'bolt', col: 'var(--o-warn)', bg: 'rgba(var(--o-warn-rgb),.14)',
      sub: tr('Gérées dans Home Assistant'), big: String(autos.filter(a => a.on).length), unit: tr('actives sur {n}', { n: autos.length }), admin: true },
    { id: 'maj', name: tr('Mises à jour'), ico: 'refresh', col: 'var(--o-warn2)', bg: 'rgba(var(--o-warn2-rgb),.14)',
      sub: upsAvail ? 'Firmwares et modules' : tr('Tout est à jour'), big: String(upsAvail || 0), unit: upsAvail ? 'en attente' : 'à jour', admin: true, dot: upsAvail > 0 },
    { id: 'vues', name: tr('Vues'), ico: 'layout-fluid', col: 'var(--o-cyan)', bg: 'rgba(var(--o-cyan-rgb),.14)',
      sub: tr('Menu latéral et vues perso'), big: String(11 + customViews.length), unit: tr('vues disponibles'), admin: true },
    { id: 'entites', name: tr('Entités'), ico: 'list', col: entMissing.length ? 'var(--o-bad)' : 'var(--o-text2)', bg: entMissing.length ? 'rgba(var(--o-bad-rgb),.14)' : 'var(--o-s1)',
      sub: tr('Capteurs reliés aux cartes'), big: String(entMissing.length || entIds.length), unit: entMissing.length ? 'introuvables' : tr('configurées'), admin: true, dot: entMissing.length > 0 },
    { id: 'about', name: tr('À propos'), ico: 'info', col: 'var(--o-text2)', bg: 'var(--o-s1)',
      sub: tr('React + Vite · servi par l’intégration'),
      big: (LOGGIA_INDEX && LOGGIA_INDEX.componentVersion) ? 'v' + LOGGIA_INDEX.componentVersion : '—',
      unit: tr('version installée'), admin: false, small: true },
  ].filter(x => !x.admin || isAdmin);
  // Interrupteur du bandeau (Tgl n'existe que dans la portée d'Apparence)
  const curSection = SECTIONS.find(x => x.id === tab);
  // Bandeau d'une section : volontairement LEGER (1 a 2 groupes) — entasser dix reglages
  // sur une ligne rend la barre illisible. Le reste vit dans les cartes en lignes denses.
  const SecBar = ({ children }) => (
    <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
      {children}
      <span style={{ flex: 1 }} />
      <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
    </div>
  );
  const SecGroup = ({ label, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{label}</span>
      {children}
    </div>
  );
  const secBtn = (on) => ({ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', background: on ? 'rgba(var(--o-accent-rgb),.18)' : 'var(--o-s1)', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)' });
  const SecTgl = ({ on, cb, label }) => (
    <span onClick={cb} role="switch" aria-checked={!!on} aria-label={label} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cb(); } }}
      style={{ position: 'relative', width: 38, height: 21, flexShrink: 0, borderRadius: 11, cursor: 'pointer', background: on ? 'var(--o-accent)' : 'var(--o-s4)', border: on ? 'none' : 'var(--o-bw,1px) solid var(--o-bd1)', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 17, height: 17, borderRadius: '50%', background: '#fff', transition: 'left .2s cubic-bezier(.4,1.3,.5,1)' }} />
    </span>
  );
  const secTagBg = (c) => 'rgba(' + (c === 'ok' ? 'var(--o-ok-rgb)' : c === 'warn' ? 'var(--o-warn2-rgb)' : c === 'bad' ? 'var(--o-bad-rgb)' : 'var(--o-accent-rgb)') + ',.14)';
  const secTagFg = (c) => c === 'ok' ? 'var(--o-ok)' : c === 'warn' ? 'var(--o-warn2)' : c === 'bad' ? 'var(--o-bad)' : 'var(--o-accent-soft)';
  const SecCard = ({ title, tag, tagCol, sub, children }) => (
    <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
        {tag ? <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, background: secTagBg(tagCol), color: secTagFg(tagCol) }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: secTagFg(tagCol) }} />{tag}</span> : null}
      </div>
      {sub ? <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{sub}</div> : null}
      <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {tab === 'hub' ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Paramètres')}</h1>
              <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{tr('Réglages propres à cet appareil')} · {tr('{n} profils', { n: users.length })}</div>
            </div>
            <span style={{ flex: 1 }} />
            {upsAvail > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: 'rgba(var(--o-warn2-rgb),.14)', color: 'var(--o-warn2)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-warn2)' }} />{upsAvail > 1 ? tr('{n} MISES À JOUR', { n: upsAvail }) : tr('{n} MISE À JOUR', { n: upsAvail })}</span>}
          </div>

          <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>Mode</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['dark', 'Sombre'], ['light', 'Clair']].map(([id, lb]) => (
                  <button key={id} onClick={() => onMode(id)} disabled={haTheme === 'FOLLOW'} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: haTheme === 'FOLLOW' ? 'not-allowed' : 'pointer', fontSize: 11.5, fontWeight: 700, opacity: haTheme === 'FOLLOW' ? .5 : 1, background: themeMode === id ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: themeMode === id ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{lb}</button>
                ))}
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
          </div>

          {panel && (
            <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{tr("État de l'installation")}</div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-accent)' }} />{tr('THÈME')} {(PRESET_META().find(x => x.id === loggiaTheme) || PRESET_META()[0]).name.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{tr("Les modifications s'appliquent immédiatement à cet appareil")}</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <EnRow label={tr('Connexion')} desc={hass ? 'Session empruntée à Home Assistant · ' + Object.keys(hass.states || {}).length + ' entités' : 'Session Home Assistant introuvable'}>
                  <EnVal v={(lat != null && lat >= 0) ? lat + ' ms' : (hass ? 'active' : 'absente')} col={hass ? 'var(--o-ok)' : 'var(--o-bad)'} />
                </EnRow>
                {isAdmin && (
                  <EnRow label={tr('Automatisations')} desc={autos.length + ' automatisations Home Assistant'}>
                    <EnVal v={autos.filter(a => a.on).length + ' / ' + autos.length} col="var(--o-text)" />
                  </EnRow>
                )}
                {isAdmin && (
                  <EnRow label={tr('Entités du dashboard')} desc={entMissing.length ? (entMissing.length > 1 ? tr('{n} introuvables sur', { n: entMissing.length }) : tr('{n} introuvable sur', { n: entMissing.length })) + ' ' + tr('{n} configurées', { n: entIds.length }) : tr('{n} entités configurées, toutes résolues', { n: entIds.length })}>
                    <EnVal v={entMissing.length ? entMissing.length + ' en erreur' : tr('toutes résolues')} col={entMissing.length ? 'var(--o-bad)' : 'var(--o-ok)'} />
                  </EnRow>
                )}
                {isAdmin && (
                  <EnRow label={tr('Mises à jour')} desc={upsAvail ? 'Firmwares et modules en attente' : upsTotal + ' modules suivis'}>
                    <EnVal v={upsAvail ? upsAvail + ' en attente' : 'à jour'} col={upsAvail ? 'var(--o-warn2)' : 'var(--o-ok)'} />
                  </EnRow>
                )}
              </div>
            </div>
          )}

          <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Toutes les sections')}</div>
          <div className="grid-parsections" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
            {SECTIONS.map(sec => (
              <button key={sec.id} onClick={() => setTab(sec.id)} style={{ textAlign: 'left', cursor: 'pointer', padding: '16px 17px', borderRadius: 16, background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: sec.bg }}><Fi i={sec.ico} size={15} color={sec.col} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800 }}>{sec.name}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sec.sub}</div>
                  </div>
                  {sec.dot && <span style={{ width: 7, height: 7, borderRadius: '50%', background: sec.col, flexShrink: 0 }} />}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: sec.small ? 17 : 24, fontWeight: 800, letterSpacing: '-.02em', color: sec.col, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sec.big}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sec.unit}</span>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--o-accent-soft)' }}>Ouvrir<Fi i="angle-small-right" size={12} color="var(--o-accent-soft)" /></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <button onClick={() => setTab('hub')} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)' }}><Fi i="angle-small-left" size={13} color="var(--o-text2)" />{tr('Paramètres')}</button>
            <h1 style={{ margin: '10px 0 0', fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 34, fontWeight: 500 }}>{curSection ? (curSection.long || curSection.name) : tr('Paramètres')}</h1>
            <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 4 }}>{curSection ? (curSection.pageSub || curSection.sub) : ''}</div>
          </div>

      {editing && isAdmin && <UserEditor user={editing.u} onSave={(data) => { if (editing.i == null) onAddUser && onAddUser(data); else onUpdateUser && onUpdateUser(editing.i, data); setEditing(null); }} onDelete={editing.i != null ? () => { onDeleteUser && onDeleteUser(editing.i); setEditing(null); } : null} onClose={() => setEditing(null)} />}

      {tab === 'apparence' && (<>
        <SecBar>
          <SecGroup label={tr('Mode')}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['dark', 'Foncé'], ['light', 'Clair']].map(([id, lb]) => (
                <button key={id} onClick={() => onMode(id)} disabled={haTheme === 'FOLLOW'} style={{ ...secBtn(haTheme !== 'FOLLOW' && themeMode === id), opacity: haTheme === 'FOLLOW' ? .5 : 1, cursor: haTheme === 'FOLLOW' ? 'not-allowed' : 'pointer' }}>{lb}</button>
              ))}
            </div>
          </SecGroup>
        </SecBar>
        {panel && (() => {
          const pm = PRESET_META().find(x => x.id === loggiaTheme) || PRESET_META()[0];
          const formes = [look.glass ? 'verre' : 'opaque', look.radius, look.shadow ? 'ombres' : 'à plat', look.hairline ? 'liserés' : 'sans liseré'].join(' · ');
          return (
            <SecCard title={tr('Thème actif')} tag={haTheme === 'FOLLOW' ? 'SUIVI DE HA' : 'CHOIX MANUEL'} tagCol={haTheme === 'FOLLOW' ? 'warn' : 'ok'}
              sub="Réglages visuels, propres à cet appareil. L'aperçu à droite suit vos choix.">
              <EnRow label="Palette" desc={pm.desc}><EnVal v={pm.name} col="var(--o-accent-soft)" /></EnRow>
              <EnRow label="Mode d'affichage" desc={haTheme === 'FOLLOW' ? 'Imposé par le thème actif de Home Assistant' : 'Clair ou foncé, appliqué au thème choisi'}><EnVal v={themeMode === 'light' ? 'Clair' : 'Foncé'} col="var(--o-text)" /></EnRow>
              <EnRow label={tr('Effets animés')} desc={wxFx ? 'Ciel météo suivant la condition et l’heure réelles' : 'Bannière fixe, aucun rendu animé'}><EnVal v={wxFx ? tr('Météo') : 'Désactivés'} col={wxFx ? 'var(--o-ok)' : 'var(--o-text3)'} /></EnRow>
              <EnRow label={tr('Matière & formes')} desc={formes}><EnVal v={look.contrast ? 'contraste renforcé' : 'contraste normal'} col="var(--o-text)" /></EnRow>
              <EnRow label="Interface mobile" desc={'Marge du haut ' + (topAuto ? 'auto' : Math.round(topMargin) + ' px') + (navbar ? ' · marge du bas ' + (navAuto ? 'auto' : Math.round(navMargin) + ' px') : '')}><EnVal v={navbar ? 'Barre de navigation' : 'Sans barre'} col={navbar ? 'var(--o-text)' : 'var(--o-text3)'} /></EnRow>
            </SecCard>
          );
        })()}
        <div className="grid-appar" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 264px', gap: 18, alignItems: 'start' }}>
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>{(() => {
        const notFollow = haTheme !== 'FOLLOW';
        // Carte de reglages : en-tete a fond leger + corps en lignes denses (patron Atrium).
        const AppCard = ({ title, sub, note, action, children }) => (
          <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', overflow: 'hidden', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', background: 'var(--o-s4)', borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14.5, fontWeight: 700 }}>{title}</span>
              {sub ? <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{sub}</span> : null}
              <span style={{ flex: 1 }} />
              {note ? <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)', fontFamily: 'ui-monospace,monospace' }}>{note}</span> : null}
              {action}
            </div>
            <div style={{ padding: '4px 18px 16px' }}>{children}</div>
          </div>
        );
        const OptRow = ({ title, desc, children }) => (
          <div className="o-optrow" style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <div style={{ flex: 1, minWidth: 0, maxWidth: '62ch' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--o-text2)', fontWeight: 600, lineHeight: 1.45, marginTop: 2 }}>{desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{children}</div>
          </div>
        );
        const Tgl = ({ on, cb, label, off = false }) => (
          <span onClick={off ? undefined : cb} role="switch" aria-checked={!!on} aria-label={label} tabIndex={off ? -1 : 0} onKeyDown={(e) => { if (!off && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); cb(); } }}
            style={{ width: 46, height: 26, borderRadius: 13, background: on ? 'var(--o-accent)' : 'var(--o-bd1)', position: 'relative', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? .45 : 1, flexShrink: 0, transition: 'background .25s', display: 'inline-block' }}>
            <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} />
          </span>
        );
        // Segment : 2 a 3 choix mutuellement exclusifs, sur une piste unique.
        const Seg = ({ value, opts, onPick, disabled = false }) => (
          <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 11, background: 'var(--o-s2)', opacity: disabled ? .5 : 1 }}>
            {opts.map(([v, lb]) => (
              <button key={String(v)} disabled={disabled} onClick={() => onPick(v)} style={{ padding: '6px 13px', borderRadius: 8, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: value === v ? 'var(--o-surfA)' : 'transparent', color: value === v ? 'var(--o-text)' : 'var(--o-text2)', boxShadow: value === v ? '0 1px 3px rgba(0,0,0,.25)' : 'none' }}>{lb}</button>
            ))}
          </div>
        );
        const stepBtn = { width: 30, height: 30, borderRadius: 9, border: 'var(--o-bw,1px) solid var(--o-bd1)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontWeight: 800, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
        // Marge : stepper + glissiere absolue. « auto » = valeur calculee, non figee.
        const MarginRow = ({ label, px, auto, onStep, onSet }) => (
          <div className="o-optrow" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, width: 108, flexShrink: 0 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: 3, borderRadius: 10, background: 'var(--o-s2)', flexShrink: 0 }}>
              <button onClick={() => onStep(-2)} style={stepBtn} aria-label={'Réduire ' + label}>−</button>
              <span style={{ minWidth: 48, textAlign: 'center', fontWeight: 800, fontSize: 12.5, fontFamily: 'ui-monospace,monospace', color: auto ? 'var(--o-text3)' : 'var(--o-text)' }}>{auto ? 'auto' : Math.round(px) + 'px'}</span>
              <button onClick={() => onStep(2)} style={stepBtn} aria-label={'Augmenter ' + label}>+</button>
            </div>
            <input type="range" min={0} max={100} step={1} value={Math.round(px) || 0} onChange={e => onSet && onSet(+e.target.value)} aria-label={label}
              style={{ flex: 1, minWidth: 60, accentColor: 'var(--o-accent)', cursor: 'pointer' }} />
          </div>
        );
        const ACCENTS = [['', 'Couleur du thème'], ['#4f8cff', 'Bleu'], ['#2dd4bf', 'Turquoise'], ['#a78bfa', 'Violet'], ['#f5a524', 'Ambre'], ['#f87171', 'Rouge']];
        const NATIFS = ['', 'atrium', 'ios', 'google', 'neumorphix'];
        const COMMU = ['frosted', 'onedark', 'dracula', 'github', 'tokyo', 'nightowl', 'plum', 'material', 'lavande'];
        const ids = themeTab === 'natifs' ? NATIFS : COMMU;
        const themeList = ids.map(id => PRESET_META().find(x => x.id === id)).filter(Boolean);
        const tabBtn = (on) => ({ padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: on ? 'var(--o-surfA)' : 'transparent', color: on ? 'var(--o-text)' : 'var(--o-text2)', boxShadow: on ? '0 1px 3px rgba(0,0,0,.25)' : 'none' });
        return (<>
          <AppCard title="Affichage">
            <OptRow title={tr('Mode')} desc={tr('Appliqué au thème choisi.')}>
              <Seg value={themeMode} opts={[['dark', 'Foncé'], ['light', 'Clair']]} onPick={onMode} disabled={!notFollow} />
            </OptRow>
            <OptRow title={tr('Langue')} desc={tr('Les états et les commandes viennent de Home Assistant, dans toutes les langues qu’il connaît. Les noms de pièces et d’appareils aussi : ils ne sont pas traduits ici.')}>
              {/* Plus de liste deroulante.
                *
                * Un `<select>` n'est pas peint par la page : le systeme dessine
                * son menu et ignore le style pose sur les `<option>`. Les
                * colorer ne pouvait rien changer, et `color-scheme` ne suffit
                * pas partout — les langues restaient illisibles.
                *
                * Le commentaire d'origine justifiait le `<select>` par « une
                * soixantaine de langues ». Il n'y en a plus que cinq : le
                * segmente maison, deja utilise partout ailleurs sur cet ecran,
                * les affiche tres bien et suit le theme comme le reste. */}
              <Seg value={choixLangue()}
                opts={languesDisponibles(hass).map(l => [l.code, l.code === 'auto' ? tr('Auto') : l.code.toUpperCase()])}
                onPick={v => {
                  /* Plus de rechargement.
                   *
                   * Il n'existait que pour reconstruire les libelles figes a
                   * l'import — navigation, themes, onglets. Ces listes sont
                   * devenues des fonctions : elles se disent dans la langue du
                   * moment, et un simple redessin suffit. */
                  cfgSet({ 'loggia-langue': v });
                  // La racine ecoute : elle rappelle `preparerLangue` puis redessine.
                  try { window.dispatchEvent(new CustomEvent('loggia-langue-changee')); } catch (e) {}
                }} />
            </OptRow>
            <OptRow title="Suivre Home Assistant" desc={tr('Calque le thème actif de Home Assistant et désactive les choix ci-dessous.')}>
              <Tgl on={haTheme === 'FOLLOW'} cb={onFollowHa} label={tr('Suivre le thème Home Assistant')} />
            </OptRow>
            <OptRow title="Barre de navigation" desc="Accès rapide en bas de l'écran, sur mobile uniquement.">
              <Tgl on={!!navbar} cb={onToggleNavbar} label="Barre de navigation mobile" />
            </OptRow>
            <OptRow title="Page d'accueil"
              desc={accueilDefaut === true
                ? 'Home Assistant ouvre Loggia au démarrage, sur ce compte.'
                : accueilDefaut === null
                  ? 'Réglage indisponible : la page qui affiche Loggia n’a pas pu être identifiée.'
                  : 'Home Assistant ouvre un autre écran au démarrage. Son sélecteur ne propose que les tableaux de bord — ce bouton fait le réglage à sa place.'}>
              <button onClick={mettreEnAccueil} disabled={accueilDefaut !== false}
                style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                  cursor: accueilDefaut === false ? 'pointer' : 'default',
                  border: '1px solid ' + (accueilDefaut === false ? 'rgba(var(--o-accent-rgb),.5)' : 'var(--o-bd2)'),
                  background: accueilDefaut === false ? 'rgba(var(--o-accent-rgb),.16)' : 'var(--o-s2)',
                  color: accueilDefaut === false ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}>
                {accueilDefaut === true ? 'C’est déjà le cas' : 'Ouvrir Loggia au démarrage'}
              </button>
            </OptRow>
          </AppCard>

          <AppCard title="Effets" note="coût GPU modéré">
            <OptRow title={tr('Effets météo animés')} desc="Ciel vivant derrière la bannière d'accueil, suivant la météo réelle.">
              <Tgl on={!!wxFx} cb={onToggleWxFx} label={tr('Effets météo animés')} />
            </OptRow>
          </AppCard>

          <AppCard title={tr('Matière & formes')} note="aucun coût GPU">
            <OptRow title={tr('Matière des cartes')} desc={tr('Le verre rend les cartes translucides et floute ce qui passe dessous.')}>
              <Seg value={!!look.glass} opts={[[false, 'Opaque'], [true, 'Verre']]} onPick={v => onLook({ glass: v })} />
            </OptRow>
            <OptRow title="Arrondi" desc={tr('Rayon des cartes, des champs et des boutons.')}>
              {[['net', 'Net', 3], ['doux', 'Doux', 8], ['rond', 'Rond', 999]].map(([v, lb, r]) => {
                const on = look.radius === v;
                return (
                  <button key={v} onClick={() => onLook({ radius: v })} aria-pressed={on} aria-label={'Arrondi ' + lb}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '9px 11px 7px', borderRadius: 12, cursor: 'pointer', transition: 'all .2s', background: on ? 'rgba(var(--o-accent-rgb),.12)' : 'var(--o-s2)', border: '1px solid ' + (on ? 'var(--o-accent)' : 'var(--o-bd1)') }}>
                    <span style={{ width: 22, height: 22, borderRadius: r, background: 'var(--o-s1)', border: '2px solid ' + (on ? 'var(--o-accent)' : 'var(--o-text3)') }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: on ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{lb}</span>
                  </button>
                );
              })}
            </OptRow>
            <OptRow title={tr('Ombres portées')} desc={tr('Détache les cartes du fond. À couper pour un rendu plat.')}>
              <Tgl on={!!look.shadow} cb={() => onLook({ shadow: !look.shadow })} label={tr('Ombres portées')} />
            </OptRow>
            <OptRow title={tr('Liserés')} desc={tr('Trait de 1 px autour des cartes et des tableaux.')}>
              <Tgl on={!!look.hairline} cb={() => onLook({ hairline: !look.hairline })} label={tr('Liserés')} />
            </OptRow>
            <OptRow title={tr('Contraste renforcé')} desc={tr('Éclaircit les textes secondaires et marque les séparateurs.')}>
              <Tgl on={!!look.contrast} cb={() => onLook({ contrast: !look.contrast })} label={tr('Contraste renforcé')} />
            </OptRow>
            <OptRow title={tr("Teinte d'état")} desc={tr('Les cartes actives — lampe allumée, volet ouvert, chauffage en marche — se lavent de leur couleur.')}>
              <Seg value={look.tint || 'douce'}
                opts={[['sans', tr('Sans')], ['discrete', tr('Discrète')], ['douce', tr('Douce')], ['pleine', tr('Pleine')]]}
                onPick={v => onLook({ tint: v })} />
            </OptRow>
            <OptRow title={tr("Fond d'écran")} desc={tr('Un dégradé discret sous les cartes, dans la palette du thème. Donne sa profondeur au verre.')}>
              {[['aucun', tr('Aucun'), 'var(--o-bg)'],
                ['minuit', tr('Minuit'), 'radial-gradient(90% 80% at 25% 15%, #16233b 0%, #0b0f16 75%)'],
                ['abysse', tr('Abysse'), 'radial-gradient(70% 60% at 80% 10%, rgba(var(--o-accent-rgb),.4) 0%, #0e1726 70%)'],
                ['ardoise', tr('Ardoise'), 'radial-gradient(120% 110% at 50% -10%, #23303f 0%, #0e141f 80%)']].map(([v, lb, ap]) => {
                const on = (look.fond || 'aucun') === v;
                return (
                  <button key={v} onClick={() => onLook({ fond: v })} aria-pressed={on} aria-label={tr("Fond d'écran") + ' ' + lb}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '9px 11px 7px', borderRadius: 12, cursor: 'pointer', transition: 'all .2s', background: on ? 'rgba(var(--o-accent-rgb),.12)' : 'var(--o-s2)', border: '1px solid ' + (on ? 'var(--o-accent)' : 'var(--o-bd1)') }}>
                    <span style={{ width: 34, height: 22, borderRadius: 6, background: ap, border: '1px solid ' + (on ? 'var(--o-accent)' : 'var(--o-bd2)') }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: on ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{lb}</span>
                  </button>
                );
              })}
            </OptRow>
            <OptRow title="Couleur d'accent" desc={tr('Éléments actifs, jauges et liens.')}>
              {ACCENTS.map(([c, lb]) => {
                const on = (look.accent || '') === c;
                return (
                  <button key={c || 'auto'} onClick={() => onLook({ accent: c })} title={lb} aria-label={lb} aria-pressed={on}
                    style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c || 'var(--o-accent)', border: c ? (on ? '2px solid var(--o-text)' : '2px solid transparent') : (on ? '2px solid var(--o-text)' : '2px dashed var(--o-bd1)') }}>
                    {on ? <Fi i="check" size={12} color="#fff" /> : null}
                  </button>
                );
              })}
            </OptRow>
          </AppCard>

          <AppCard title="Marges de l'écran" action={(navAuto && topAuto) ? null : (
            <button onClick={() => { onNavOffsetReset && onNavOffsetReset(); onTopOffsetReset && onTopOffsetReset(); }} style={{ padding: '6px 12px', borderRadius: 9, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 11.5, cursor: 'pointer' }}>{tr('Revenir à auto')}</button>
          )}>
            <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, lineHeight: 1.5, maxWidth: '62ch', padding: '12px 0 2px' }}>
              À ajuster seulement si la barre passe sous l'encoche ou la barre d'accueil de votre téléphone. « auto » convient dans la quasi-totalité des cas.
            </div>
            {navbar && <MarginRow label="Marge du bas" px={navMargin} auto={navAuto} onStep={onNavOffset} onSet={onNavSet} />}
            <MarginRow label="Marge du haut" px={topMargin} auto={topAuto} onStep={onTopOffset} onSet={onTopSet} />
          </AppCard>

          <AppCard title={tr('Thème')} sub={themeList.length + ' disponibles'} action={(
            <div style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 11, background: 'var(--o-s2)' }}>
              <button onClick={() => setThemeTab('natifs')} style={tabBtn(themeTab === 'natifs')}>Natifs</button>
              <button onClick={() => setThemeTab('commu')} style={tabBtn(themeTab === 'commu')}>{tr('Communauté')}</button>
            </div>
          )}>
            <div className="grid-par-pal" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, opacity: notFollow ? 1 : .55, transition: 'opacity .25s', paddingTop: 14 }}>
              {themeList.map(p => {
                const on = notFollow && (loggiaTheme || '') === p.id, rgb = cl_hexRgb(p.cols[0]);
                return (
                  <button key={p.id || 'loggia'} onClick={() => onPickTheme(p.id)} style={{ position: 'relative', textAlign: 'left', padding: '11px 12px', borderRadius: 13, cursor: 'pointer', transition: 'all .25s', border: '1px solid ' + (on ? `rgba(${rgb},.55)` : 'var(--o-bd1)'), background: on ? `rgba(${rgb},.10)` : 'var(--o-s2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                      {on && <span style={{ flexShrink: 0, marginLeft: 6, display: 'inline-flex' }}><Fi i="check" size={13} color={p.cols[0]} /></span>}
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginBottom: 7 }}>
                      {p.cols.map((c, k) => <div key={k} style={{ width: 20, height: 20, borderRadius: 7, background: c, border: '1px solid rgba(255,255,255,.12)' }} />)}
                    </div>
                    <div style={{ fontSize: 10.5, color: 'var(--o-text3)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.desc}</div>
                  </button>
                );
              })}
            </div>
            {!notFollow && <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginTop: 12 }}>{tr('Thème suivi depuis Home Assistant — coupe « Suivre » pour choisir manuellement.')}</div>}
          </AppCard>
        </>);
      })()}</div><ParPreview themeMode={themeMode} loggiaTheme={loggiaTheme} hass={hass} userName={(users[userIdx] || {}).name || ''} look={look} /></div>
      </>)}

      {tab === 'connexion' && (<>
        <SecBar>
          <SecGroup label={<span>Bascule Nabu Casa<span className="o-bar-sub"><br /><span style={{ fontWeight: 600, color: 'var(--o-text3)' }}>{tr('hors du réseau local')}</span></span></span>}>
            <SecTgl on={!!haDraft.fallback} cb={toggleFallback} label={tr('Proposer la bascule Nabu Casa')} />
          </SecGroup>
        </SecBar>
        {panel && (
          <SecCard title="Serveur" tag={hass ? null : tr('HORS LIGNE')} tagCol="bad"
            sub="Loggia n'a pas de compte : il utilise votre session Home Assistant">
            <EnRow label="URL locale" desc={tr('Adresse utilisée sur le réseau domestique')}><EnVal v={(haDraft.local || '—').replace(/^https?:\/\//, '')} col="var(--o-text)" /></EnRow>
            <EnRow label="URL distante" desc="Nabu Casa"><EnVal v={(haDraft.remote || 'non renseignée').replace(/^https?:\/\//, '')} col={haDraft.remote ? 'var(--o-text)' : 'var(--o-text3)'} /></EnRow>
            <EnRow label="Latence" desc={tr('Mesurée sur le dernier appel')}><EnVal v={latBusy ? '…' : lat == null ? '—' : lat < 0 ? 'échec' : lat + ' ms'} col={(lat != null && lat >= 0 && lat < 120) ? 'var(--o-ok)' : (lat != null && lat >= 120) ? 'var(--o-warn2)' : 'var(--o-text3)'} /></EnRow>
            <EnRow label={tr('Entités synchronisées')} desc={'Rafraîchies toutes les ' + Math.round((haDraft.pollMs || 2000) / 1000) + ' s'}><EnVal v={hass && hass.states ? String(Object.keys(hass.states).length) : '—'} col={hass ? 'var(--o-ok)' : 'var(--o-text3)'} /></EnRow>
            <EnRow label="Utilisateur" desc="Session Home Assistant en cours"><EnVal v={(hass && hass.user && hass.user.name) || '—'} col="var(--o-text)" /></EnRow>
            {!hass && haDraft.fallback && haDraft.remote ? (
              <EnRow label={tr('Réseau local muet')} desc="Rouvrir Loggia par l'adresse Nabu Casa">
                <button onClick={() => { try { (window.top || window).location.href = haDraft.remote; } catch (e) { window.location.href = haDraft.remote; } }} style={{ padding: '7px 13px', borderRadius: 10, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Ouvrir via Nabu Casa</button>
              </EnRow>
            ) : null}
          </SecCard>
        )}

        <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', overflow: 'hidden', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 20px', background: 'var(--o-s4)', borderBottom: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
            <Fi i="settings" size={15} color="var(--o-text2)" />
            <span style={{ fontSize: 14.5, fontWeight: 700 }}>Adresses du serveur</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--o-text3)' }}>{tr("testées à l'enregistrement")}</span>
          </div>
          <div style={{ padding: '18px 20px 20px' }}>
            <div style={{ fontSize: 12.5, color: 'var(--o-accent-soft)', fontWeight: 600, lineHeight: 1.55, maxWidth: '62ch', marginBottom: 16 }}>
              Loggia n'a pas de compte : il emprunte la session Home Assistant ouverte dans ce navigateur. Si elle expire, c'est l'écran de connexion de Home Assistant qui s'affiche.
            </div>
            {[['local', 'URL LOCALE', 'http://homeassistant.local:8123', "Adresse du serveur sur le réseau domestique."],
              ['remote', 'URL DISTANTE · NABU CASA', 'https://xxxx.ui.nabu.casa', 'Utilisée quand le réseau local ne répond pas sous 2 s.']].map(([k, lb, ph, hint]) => {
              const r = testLine(k);
              return (
                <div key={k} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: 'var(--o-text3)', marginBottom: 6 }}>{lb}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={haDraft[k] || ''} onChange={e => setHaDraft(d => ({ ...d, [k]: e.target.value }))} placeholder={ph} spellCheck={false} autoComplete="off" style={{ ...entInp, flex: 1, minWidth: 0 }} />
                    <button onClick={() => testUrl(k)} style={{ padding: '9px 15px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', flexShrink: 0 }}>Tester</button>
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, marginTop: 6, color: r ? r.col : 'var(--o-text3)' }}>{r ? r.txt : hint}</div>
                </div>
              );
            })}
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.07em', color: 'var(--o-text3)', marginBottom: 6 }}>{tr('INTERVALLE DE RAFRAÎCHISSEMENT')}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {POLL_CHOICES.map(([ms, lb]) => (
                <button key={ms} onClick={() => setHaDraft(d => ({ ...d, pollMs: ms }))} style={{ padding: '8px 15px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: '1px solid ' + ((haDraft.pollMs || 2000) === ms ? 'var(--o-accent)' : 'var(--o-bd1)'), background: (haDraft.pollMs || 2000) === ms ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: (haDraft.pollMs || 2000) === ms ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>{lb}</button>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginTop: 6 }}>{tr('Plus court = plus de requêtes vers Home Assistant.')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={saveHaCfg} style={{ padding: '10px 18px', borderRadius: 11, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Enregistrer</button>
              <button onClick={resetHaCfg} style={{ padding: '10px 16px', borderRadius: 11, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{tr('Rétablir')}</button>
              <span style={{ flex: 1 }} />
              <button onClick={ping} disabled={latBusy} style={{ padding: '9px 14px', borderRadius: 10, background: 'transparent', border: 'none', color: 'var(--o-text3)', fontWeight: 600, fontSize: 11.5, cursor: 'pointer' }}>{latBusy ? 'Test…' : 'Tester la session'}</button>
            </div>
          </div>
        </div>

        <div style={cardSt}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>{tr('Bon à savoir')}</div>
          {PAR_HELPS().map(h => {
            const isOpen = !!open[h.id];
            return (
              <div key={h.id} style={{ border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 13, marginBottom: 10, overflow: 'hidden' }}>
                <button onClick={() => setOpen(o => ({ ...o, [h.id]: !o[h.id] }))} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', background: 'var(--o-s4)', border: 'none', cursor: 'pointer', color: 'var(--o-text)', textAlign: 'left' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 700 }}><Fi i="info" size={16} color="var(--o-accent-soft)" />{h.title}</span>
                  <span style={{ display: 'inline-flex', transition: 'transform .25s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}><Fi i="angle-small-down" size={16} color="var(--o-text2)" /></span>
                </button>
                <div style={{ maxHeight: isOpen ? 200 : 0, overflow: 'hidden', transition: 'max-height .3s ease' }}><div style={{ padding: '0 16px 15px', fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 500, lineHeight: 1.6 }}>{h.body}</div></div>
              </div>
            );
          })}
        </div>
      </>)}

      {tab === 'users' && (<>
        <SecBar>
          {isAdmin && <SecGroup label="Profils"><button onClick={() => setEditing({ i: null })} style={secBtn(false)}>{tr('Ajouter un profil')}</button></SecGroup>}
        </SecBar>
        {panel && (() => {
          const me = users[userIdx] || {};
          const nAdm = users.filter(u => u.role === 'Admin').length;
          return (
            <SecCard title={tr('Identité')} tag={String(me.role || '—').toUpperCase()} tagCol={me.role === 'Admin' ? 'warn' : 'ok'}
              sub={tr('Profil actif sur cet appareil — reconnu depuis la session Home Assistant')}>
              <EnRow label={tr('Nom affiché')} desc="Visible sur l'écran de profils et dans l'en-tête"><EnVal v={me.name || '—'} col="var(--o-text)" /></EnRow>
              <EnRow label="Rattachement" desc={tr('Ce que le profil affiche sous son nom')}><EnVal v={me.sub || '—'} col="var(--o-accent-soft)" /></EnRow>
              <EnRow label="Droits" desc={me.role === 'Admin' ? 'Réglages, alimentation et édition des vues' : 'Lecture et commandes courantes seulement'}><EnVal v={me.role === 'Admin' ? 'complets' : 'limités'} col={me.role === 'Admin' ? 'var(--o-warn2)' : 'var(--o-ok)'} /></EnRow>
              <EnRow label="Profils du foyer" desc={(nAdm > 1 ? tr('{n} administrateurs', { n: nAdm }) : tr('{n} administrateur', { n: nAdm })) + ' · ' + (users.length - nAdm) + ' famille'}><EnVal v={String(users.length)} col="var(--o-text)" /></EnRow>
            </SecCard>
          );
        })()}
        <div style={cardSt}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}><div style={{ fontSize: 16, fontWeight: 700 }}>Utilisateurs ({users.length})</div></div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '-12px 0 12px' }}>Profils locaux à cet appareil — l'utilisateur Home Assistant connecté est reconnu automatiquement.</div>
          {!isAdmin && <div style={{ fontSize: 12.5, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 14 }}>{tr('Seul un administrateur peut ajouter, modifier ou supprimer un utilisateur.')}</div>}
          <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column' }}>
            {users.map((u, i) => { const im = userImg(u); return (
              <div key={u._k || 'u' + i} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 0' }}>
                <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#fff', background: userBg(u) }}>{im ? '' : (u.name[0] || '?').toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 700 }}>{u.name}{i === userIdx && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--o-accent-soft)', background: 'rgba(var(--o-accent-rgb),.14)', padding: '2px 7px', borderRadius: 999, marginLeft: 7, verticalAlign: '1px', letterSpacing: '.04em' }}>{tr('VOUS')}</span>}</div><div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600 }}>{u.sub || u.role}</div></div>
                {(() => { const r = seenRel(u.name, i === userIdx); return r ? <span style={{ fontSize: 11, fontWeight: 600, color: i === userIdx ? 'var(--o-ok)' : 'var(--o-text3)', flexShrink: 0 }}>{r}</span> : null; })()}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, flexShrink: 0, background: u.role === 'Admin' ? 'rgba(255,179,71,.16)' : 'rgba(52,211,153,.16)', color: u.role === 'Admin' ? '#ffb347' : 'var(--o-ok)' }}>{u.role}</span>
                {isAdmin && <span onClick={() => setEditing({ i, u })} style={{ cursor: 'pointer', color: 'var(--o-text3)', display: 'flex' }}><Fi i="pencil" size={16} /></span>}
              </div>
            ); })}
          </div>
          {isAdmin && <AdminPinEditor />}
        </div>
      </>)}

      {tab === 'vues' && isAdmin && (() => {
        const BUILTIN_VIEWS = [
          ['accueil', tr('Accueil'), 'home', 'vue principale', true],
          ['pieces', tr('Pièces'), 'door-open', 'toutes les pièces', false],
          ['scenes', tr('Scènes'), 'sparkles', 'raccourcis', false],
          ['objets', tr('Objets'), 'apps', 'appareils par familles', false],
          ['energie', tr('Énergie'), 'bolt', 'production et consommation', false],
          ['securite', tr('Sécurité'), 'shield-check', 'alarme et caméras', false],
          ['systeme', tr('Système'), 'microchip', 'machines et maintenance', false],
        ];
        const cfg = readViewsCfg();
        const bump = () => setAutoOpen(o => ({ ...o }));
        const toggleMain = (vid) => { const c = readViewsCfg(); if (c.hidden.has(vid)) c.hidden.delete(vid); else c.hidden.add(vid); writeViewsCfg(c); bump(); };
        const toggleExtra = (vid) => { const c = readViewsCfg(); if (c.shown.has(vid)) c.shown.delete(vid); else c.shown.add(vid); writeViewsCfg(c); bump(); };
        const Row = ({ icon, c, name, sub, on, locked, onT }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0' }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--o-s1)', opacity: on ? 1 : .55 }}><Fi i={icon} size={15} color={c || 'var(--o-text2)'} /></span>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: on ? 'var(--o-text)' : 'var(--o-text3)' }}>{name}</div><div style={{ fontSize: 11, color: 'var(--o-text3)', fontWeight: 600 }}>{on ? sub: tr('masquée')}</div></div>
            <button onClick={() => setTab('entites')} style={{ padding: '6px 11px', borderRadius: 9, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>{tr('Entités')}</button>
            {locked
              ? <span style={{ width: 46, textAlign: 'center', flexShrink: 0 }}><Fi i="lock" size={13} color="var(--o-text3)" /></span>
              : <span onClick={onT} role="switch" aria-checked={on} aria-label={name} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onT(); } }} style={{ width: 46, height: 26, borderRadius: 13, background: on ? 'var(--o-accent)' : 'var(--o-bd1)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} /></span>}
          </div>
        );
        const hiddenNames = BUILTIN_VIEWS.filter(v => cfg.hidden.has(v[0])).map(v => v[1]);
        const nExtra = HIDDEN_VIEWS().filter(h => cfg.shown.has(h.vid)).length;
        return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <SecBar>
          <SecGroup label={tr('Vue personnalisée')}><button onClick={() => setCvEditing('new')} style={secBtn(false)}>{tr('Créer une vue')}</button></SecGroup>
        </SecBar>
        {panel && (
          <SecCard title="Organisation du menu" tag={hiddenNames.length ? hiddenNames.length + ' MASQUÉE' + (hiddenNames.length > 1 ? 'S' : '') : 'TOUTES VISIBLES'} tagCol={hiddenNames.length ? 'warn' : 'ok'}
            sub={tr('Ce qui apparaît dans le menu latéral, et ce que tu as créé toi-même')}>
            <EnRow label={tr('Vues intégrées')} desc={tr('Accueil, Pièces, Scènes, Objets, Énergie, Sécurité, Système')}>
              <EnGauge v={(BUILTIN_VIEWS.length - hiddenNames.length) + ' / ' + BUILTIN_VIEWS.length} pct={(BUILTIN_VIEWS.length - hiddenNames.length) / BUILTIN_VIEWS.length * 100} col="var(--o-accent)" />
            </EnRow>
            <EnRow label={tr('Vues secondaires')} desc={tr('Lumières, Climat, Volets, Aspirateur, Croquettes, Médias')}><EnVal v={nExtra + ' / ' + HIDDEN_VIEWS().length} col={nExtra ? 'var(--o-accent-soft)' : 'var(--o-text3)'} /></EnRow>
            <EnRow label={tr('Masquées')} desc={hiddenNames.length ? hiddenNames.join(' · ') : 'Aucune vue retirée du menu'}><EnVal v={String(hiddenNames.length)} col={hiddenNames.length ? 'var(--o-warn2)' : 'var(--o-text3)'} /></EnRow>
            <EnRow label="Mes vues" desc={tr('Créées avec tes entités, éditables à tout moment')}><EnVal v={customViews.length ? String(customViews.length) : 'aucune'} col={customViews.length ? 'var(--o-ok)' : 'var(--o-text3)'} /></EnRow>
          </SecCard>
        )}
        <div style={cardSt}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ fontSize: 16, fontWeight: 700 }}>{tr('Vues intégrées')}</div><span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.05em' }}>visibilité du menu latéral</span></div>
          <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 6px' }}>Masque celles que tu n'utilises pas, ou réactive une vue retirée. La barre mobile garde ses raccourcis.</div>
          <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column' }}>
            {BUILTIN_VIEWS.map(([vid, name, icon, sub, locked]) => { const why = viewReason(availViews, vid); return (
              <Row key={vid} icon={icon} name={name} sub={why || sub} locked={locked || !!why} on={!why && !cfg.hidden.has(vid)} onT={() => toggleMain(vid)} />
            ); })}
            {HIDDEN_VIEWS().map(h => { const why = viewReason(availViews, h.vid); return (
              <Row key={h.vid} icon={h.icon} c={h.c} name={h.label} sub={why || 'vue retirée, accessible par la recherche'} locked={!!why} on={!why && cfg.shown.has(h.vid)} onT={() => toggleExtra(h.vid)} />
            ); })}
          </div>
        </div>
        <div style={cardSt}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}><div><div style={{ fontSize: 16, fontWeight: 700 }}>{tr('Gestion des vues')}</div><div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600 }}>{tr('Crée tes propres vues avec tes entités — elles apparaissent dans le menu latéral.')}</div></div></div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', margin: '18px 0 10px' }}>MES VUES ({customViews.length})</div>
          <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column' }}>
            {customViews.map(cv => (
              <div key={cv.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0' }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)' }}><Fi i={cv.icon || 'sparkles'} size={15} /></span>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>{cv.name}</div><div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600 }}>{cv.ents.length > 1 ? tr('{n} entités', { n: cv.ents.length }) : tr('{n} entité', { n: cv.ents.length })}</div></div>
                <button onClick={() => setCvEditing(cv)} title="Modifier" style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Fi i="pencil" size={13} /></button>
                <button onClick={() => onSaveCustomViews(customViews.filter(x => x.id !== cv.id))} title="Supprimer" style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(var(--o-bad-rgb),.12)', border: 'none', color: 'var(--o-bad)', cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>×</button>
              </div>
            ))}
            {!customViews.length && <div style={{ padding: '16px 0', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Aucune vue personnalisée. « + Nouvelle vue » pour commencer.')}</div>}
          </div>
        </div>
        </div>
        );
      })()}
      {cvEditing && isAdmin && <CvEditor cv={cvEditing === 'new' ? null : cvEditing} hass={hass} onClose={() => setCvEditing(null)} onSave={(cv) => { onSaveCustomViews(cvEditing === 'new' ? [...customViews, cv] : customViews.map(x => x.id === cv.id ? cv : x)); setCvEditing(null); }} />}

      {tab === 'auto' && isAdmin && (() => {
        const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        const q = norm(autoQ.trim());
        const filtered = autos.filter(a => (!q || norm(a.name).indexOf(q) >= 0) && (autoFilter === 'all' || (autoFilter === 'on') === a.on));
        const grpOf = (a) => { const w = (a.name.trim().split(/[\s:–—-]+/)[0] || '').replace(/[^0-9A-Za-zÀ-ɏ]/g, ''); return w.length > 2 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : 'Divers'; };
        const groups = [];
        filtered.forEach(a => { const g = grpOf(a); let e = groups.find(x => x.g === g); if (!e) { e = { g, items: [] }; groups.push(e); } e.items.push(a); });
        groups.sort((x, y) => x.g.localeCompare(y.g));
        const onCount = autos.filter(a => a.on).length;
        const anyOpen = groups.some(gr => autoOpen[gr.g]);
        const line = (a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0' }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: a.on ? 'var(--o-text)' : 'var(--o-text2)' }}>{a.name}</div><div style={{ fontSize: 11.5, fontWeight: 600, color: a.on ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}>{a.on ? 'active' : 'inactive'}{a.last ? ' · dernière exécution ' + autoRel(a.last) : ''}</div></div>
            <button onClick={() => runAuto(a)} title={tr('Exécuter maintenant')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}><Fi i="play" size={12} />{tr('Exécuter')}</button>
            <span onClick={() => toggleAuto(a)} role="switch" aria-checked={a.on} aria-label={a.name} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleAuto(a); } }} style={{ width: 46, height: 26, borderRadius: 13, background: a.on ? 'var(--o-accent)' : 'var(--o-bd1)', position: 'relative', cursor: 'pointer', flexShrink: 0, transition: 'background .25s' }}><span style={{ position: 'absolute', top: 3, left: a.on ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left .32s cubic-bezier(.34,1.56,.64,1)', boxShadow: '0 2px 5px rgba(0,0,0,.3)' }} /></span>
          </div>
        );
        const lastRun = autos.map(a => a.last).filter(Boolean).sort().slice(-1)[0];
        return (
        <>
        <SecBar>
          <SecGroup label="Filtre">
            <div style={{ display: 'flex', gap: 4 }}>
              {[['all', tr('Toutes'), autos.length], ['on', 'Actives', onCount], ['off', 'Inactives', autos.length - onCount]].map(([k, lb, n]) => (
                <button key={k} onClick={() => setAutoFilter(k)} style={secBtn(autoFilter === k)}>{lb} <span style={{ opacity: .7, fontVariantNumeric: 'tabular-nums' }}>{n}</span></button>
              ))}
            </div>
          </SecGroup>
        </SecBar>
        {panel && (
          <SecCard title="Vue d'ensemble" tag={onCount ? onCount + ' ACTIVES' : 'TOUTES INACTIVES'} tagCol={onCount ? 'ok' : 'warn'}
            sub={tr('Les automatisations restent créées et modifiées dans Home Assistant')}>
            <EnRow label="En service" desc={tr('Part des automatisations activées')}>
              <EnGauge v={onCount + ' / ' + autos.length} pct={autos.length ? onCount / autos.length * 100 : 0} col="var(--o-accent)" />
            </EnRow>
            <EnRow label="Domaines" desc="Regroupement d'après le premier mot du nom"><EnVal v={String(groups.length)} col="var(--o-text)" /></EnRow>
            <EnRow label={tr('Dernière exécution')} desc={tr('Automatisation déclenchée le plus récemment')}><EnVal v={lastRun ? autoRel(lastRun) : '—'} col="var(--o-accent-soft)" /></EnRow>
          </SecCard>
        )}
        <div style={cardSt}>
          <div style={{ display: 'flex', gap: 8, margin: '10px 0 14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 200px', position: 'relative' }}>
              <input value={autoQ} onChange={e => setAutoQ(e.target.value)} placeholder={tr('Filtrer par nom…')} spellCheck={false} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 13px', borderRadius: 11, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text)', fontSize: 13, fontWeight: 600 }} />
            </div>
                        <button onClick={() => setAutoOpen(anyOpen ? {} : Object.fromEntries(groups.map(gr => [gr.g, true])))} style={{ padding: '8px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'var(--o-s2)', color: 'var(--o-text1)' }}>{anyOpen ? 'Tout replier' : 'Tout déplier'}</button>
          </div>
          {!groups.length && <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--o-text3)', fontWeight: 600 }}>{autos.length ? 'Aucune automatisation ne correspond au filtre.' : 'Aucune automatisation détectée.'}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map(gr => {
              const isOpen = !!autoOpen[gr.g] || !!q;
              const nOn = gr.items.filter(a => a.on).length;
              return (
                <div key={gr.g} style={{ border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 13, overflow: 'hidden' }}>
                  <button onClick={() => setAutoOpen(o => ({ ...o, [gr.g]: !o[gr.g] }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '12px 15px', background: 'var(--o-s4)', border: 'none', cursor: 'pointer', color: 'var(--o-text)', textAlign: 'left' }}>
                    <span style={{ display: 'inline-flex', transition: 'transform .22s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0)' }}><Fi i="angle-small-right" size={15} color="var(--o-text3)" /></span>
                    <span style={{ fontSize: 13.5, fontWeight: 800 }}>{gr.g}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)' }}>{gr.items.length > 1 ? tr('{n} automatisations', { n: gr.items.length }) : tr('{n} automatisation', { n: gr.items.length })}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: nOn ? 'rgba(var(--o-ok-rgb),.13)' : 'var(--o-s1)', color: nOn ? 'var(--o-ok)' : 'var(--o-text3)' }}>{nOn ? (nOn > 1 ? tr('{n} actives', { n: nOn }) : tr('{n} active', { n: nOn })) : tr('toutes inactives')}</span>
                  </button>
                  {isOpen && <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column', padding: '2px 15px 6px' }}>{gr.items.map(line)}</div>}
                </div>
              );
            })}
          </div>
        </div>
        </>
        );
      })()}

      {tab === 'entites' && isAdmin && (<>
        <SecBar>
          <SecGroup label="Configuration">
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={saveEnt} style={secBtn(true)}>Enregistrer et recharger</button>
              <button onClick={resetEnt} style={secBtn(false)}>{tr('Rétablir les défauts')}</button>
            </div>
          </SecGroup>
        </SecBar>
        {panel && (
          <SecCard title={tr('Liaison des capteurs')} tag={entMissing.length ? entMissing.length + ' INTROUVABLE' + (entMissing.length > 1 ? 'S' : '') : 'TOUTES RÉSOLUES'} tagCol={entMissing.length ? 'bad' : 'ok'}
            sub={tr('Une entité vide masque simplement la donnée sur les cartes concernées')}>
            <EnRow label={tr('Pièces')} desc={tr('Température, humidité et CO₂ par pièce')}><EnVal v={ent.rooms.length + ' pièces'} col="var(--o-text)" /></EnRow>
            <EnRow label={tr('Énergie')} desc="Consommation, production, surplus et batterie"><EnVal v={Object.keys(ent.energy).length + ' capteurs'} col="var(--o-text)" /></EnRow>
            <EnRow label={tr('Présence, caméras, médias')} desc={ent.people.length + ' personnes · ' + ent.cams.length + ' caméras · ' + ent.medias.length + ' lecteurs'}><EnVal v={(ent.people.length + ent.cams.length + ent.medias.length) + ' entités'} col="var(--o-text)" /></EnRow>
            <EnRow label="Introuvables" desc={entMissing.length ? 'Probablement renommées dans HA : ' + entMissing.slice(0, 3).join(' · ') + (entMissing.length > 3 ? '…' : '') : tr('Toutes les entités configurées répondent')}><EnVal v={String(entMissing.length)} col={entMissing.length ? 'var(--o-bad)' : 'var(--o-ok)'} /></EnRow>
          </SecCard>
        )}
        <div style={cardSt}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <button onClick={() => {
              // 1) La zone Home Assistant : c'est elle qui fait autorité, et la
              //    découverte a déjà relevé les capteurs d'ambiance de chacune.
              const parZone = {};
              const r0 = LOGGIA_RESOLVED && LOGGIA_RESOLVED.rooms;
              ((r0 && r0.suggested) || []).forEach(a => { parZone[String(a.name).toLowerCase()] = a; });
              // 2) Le nom, en second recours : pour qui n'a pas rangé ses
              //    entités dans des zones.
              const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_');
              const pool = dlists.sensor || [];
              const vivant = (id) => !!(id && hass && hass.states && hass.states[id]);
              let found = 0, parZoneN = 0;
              const next = ent.rooms.map(r => {
                if (!r.room) return r;
                const zone = parZone[String(r.room).toLowerCase()];
                const sl = slug(r.room);
                const pick = (cle, suffixes, cur) => {
                  if (vivant(cur)) return cur;              // ne jamais écraser un choix qui marche
                  if (zone && zone[cle]) { found++; parZoneN++; return zone[cle]; }
                  for (const sf of suffixes) {
                    const hit = pool.find(id => id.indexOf(sl) >= 0 && id.indexOf(sf) >= 0);
                    if (hit) { found++; return hit; }
                  }
                  return cur;
                };
                return {
                  ...r,
                  temp: pick('temp', ['temperature'], r.temp),
                  humidity: pick('hum', ['humidity', 'humidite'], r.humidity),
                  co2: pick('co2', ['co2', 'carbone'], r.co2),
                };
              });
              entSet('rooms')(next);
              alert(found
                ? (found > 1 ? tr('{n} capteurs détectés', { n: found }) : tr('{n} capteur détecté', { n: found }))
                  + (parZoneN ? ' (' + parZoneN + ' par la zone Home Assistant)' : ' par le nom')
                  + ' — vérifie puis « Enregistrer et recharger ».'
                : 'Aucun capteur supplémentaire trouvé. Range tes capteurs dans une zone Home Assistant : la détection s’appuie dessus en premier.');
            }} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, background: 'rgba(var(--o-ok-rgb),.13)', border: '1px solid rgba(var(--o-ok-rgb),.3)', color: 'var(--o-ok)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}><Fi i="magic-wand" size={13} />{tr('Détecter automatiquement')}</button>
          </div>
          <EntSections ent={ent} setEnt={setEnt} entSet={entSet} dlists={dlists} hass={hass} />
          <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', padding: '16px 0 4px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 3 }}>{tr('Synchronisation entre accès')}</div>
            <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>WiFi (IP locale) et 5G (Nabu Casa) = deux stockages séparés du navigateur : la config peut diverger entre les deux. Copie-la ici, puis importe-la sur l'autre accès. (Le code PIN admin n'est jamais inclus.)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={doExport} style={{ padding: '9px 14px', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', border: 'none', color: 'var(--o-accent-soft)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{tr('Copier la config')}</button>
              <button onClick={() => { setSyncTxt(''); setSyncMsg('Colle ici la config copiée depuis l\'autre accès, puis « Appliquer ».'); setSyncOpen(true); }} style={{ padding: '9px 14px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>{tr('Importer une config')}</button>
            </div>
            {syncOpen && (
              <div style={{ marginTop: 10 }}>
                {syncMsg && <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--o-accent-soft)', marginBottom: 7 }}>{syncMsg}</div>}
                <textarea value={syncTxt} onChange={e => setSyncTxt(e.target.value)} rows={4} spellCheck={false} style={{ ...entInp, fontFamily: 'monospace', fontSize: 10.5, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 7 }}>
                  <button onClick={() => { setSyncOpen(false); setSyncMsg(''); }} style={{ padding: '8px 13px', borderRadius: 9, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Fermer</button>
                  <button onClick={doImport} style={{ padding: '8px 15px', borderRadius: 9, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Appliquer et recharger</button>
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={resetEnt} style={{ padding: '10px 16px', borderRadius: 11, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>{tr('Rétablir les défauts')}</button>
            <button onClick={saveEnt} style={{ padding: '10px 18px', borderRadius: 11, background: 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Enregistrer et recharger</button>
          </div>
        </div>
      </>)}

      {tab === 'maj' && isAdmin && (<>
        <SecBar>
          <SecGroup label="Installer">
            <div style={{ display: 'flex', gap: 4 }}>
              {upsAvail > 1 && <button onClick={() => { if (!updAllConfirm) { setUpdAllConfirm(true); setTimeout(() => setUpdAllConfirm(false), 4000); return; } setUpdAllConfirm(false); ups.filter(u => u.avail && u.prog === false).forEach(u => { setUpdBusy(b => ({ ...b, [u.id]: Date.now() })); updCall('install', u.id); }); }} style={secBtn(!!updAllConfirm)}>{updAllConfirm ? 'Confirmer ?' : 'Tout installer (' + upsAvail + ')'}</button>}
              <button onClick={() => { try { if (hass && hass.callService && upsAll.length) hass.callService('homeassistant', 'update_entity', { entity_id: upsAll.map(u => u.id) }); } catch (e) {} setUpdCheckTs(new Date().toISOString()); }} style={secBtn(false)}>{tr('Vérifier')}</button>
            </div>
          </SecGroup>
        </SecBar>
        {panel && (
          <SecCard title={tr('État des mises à jour')} tag={upsAvail ? tr('{n} EN ATTENTE', { n: upsAvail }) : tr('TOUT EST À JOUR')} tagCol={upsAvail ? 'warn' : 'ok'}
            sub="Cœur, modules complémentaires et firmwares — l'installation peut redémarrer le service concerné">
            <EnRow label="En attente" desc={upsAvail ? ups.filter(u => u.avail).map(u => u.name).slice(0, 3).join(' · ') + (upsAvail > 3 ? '…' : '') : 'Aucune mise à jour disponible'}><EnVal v={String(upsAvail)} col={upsAvail ? 'var(--o-warn2)' : 'var(--o-ok)'} /></EnRow>
            <EnRow label={tr('À jour')} desc={tr('Modules suivis dont la version est la plus récente')}>
              <EnGauge v={(upsTotal - upsAvail) + ' / ' + upsTotal} pct={upsTotal ? (upsTotal - upsAvail) / upsTotal * 100 : 100} col="var(--o-ok)" />
            </EnRow>
            <EnRow label={tr('Dernière vérification')} desc={tr('Demande de rafraîchissement envoyée à Home Assistant')}><EnVal v={updCheckTs ? autoRel(updCheckTs) : '—'} col="var(--o-text3)" /></EnRow>
          </SecCard>
        )}
        <div style={cardSt}>
          {ups.length === 0
            ? <div style={{ padding: '26px 0 14px', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(var(--o-ok-rgb),.14)' }}><Fi i="check" size={22} color="var(--o-ok)" /></div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--o-ok)' }}>{tr('Tout est à jour')}</div>
                <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 3 }}>{upsTotal > 1 ? tr('{n} modules suivis', { n: upsTotal }) : tr('{n} module suivi', { n: upsTotal })}</div>
              </div>
            : <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column' }}>
                {ups.map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0' }}>
                    <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: u.avail ? 'rgba(var(--o-warn2-rgb),.16)' : 'var(--o-s1)', color: u.avail ? 'var(--o-warn2)' : 'var(--o-text3)' }}>
                      {u.pic ? <img src={u.pic} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={(e) => { e.currentTarget.remove(); }} /> : <Fi i="download" size={16} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600 }}>
                        {u.prog !== false
                          ? <span style={{ color: 'var(--o-accent-soft)' }}>Installation…{typeof u.prog === 'number' ? ' ' + Math.round(u.prog) + '%' : ''}</span>
                          : u.avail
                            ? <>{u.installed || '?'} <span style={{ opacity: .6 }}>→</span> <span style={{ color: 'var(--o-warn2)' }}>{u.latest || '?'}</span>{u.notes && <> · <a href={u.notes} target="_blank" rel="noreferrer" style={{ color: 'var(--o-accent-soft)', textDecoration: 'none' }}>Notes</a></>}</>
                            : <>À jour · {u.installed || '—'}</>}
                      </div>
                    </div>
                    {u.avail && u.prog === false && <>
                      <button onClick={() => updCall('skip', u.id)} title="Ignorer cette version" style={{ padding: '7px 11px', borderRadius: 10, background: 'var(--o-s1)', border: 'var(--o-bw,1px) solid var(--o-bd2)', color: 'var(--o-text2)', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>Ignorer</button>
                      <button onClick={() => askInstall(u)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 10, background: updConfirm === u.id ? 'var(--o-warn2)' : 'var(--o-accent)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexShrink: 0, transition: 'background .2s' }}><Fi i="download" size={12} />{updConfirm === u.id ? 'Confirmer ?' : 'Installer'}</button>
                    </>}
                    {u.prog !== false && <span style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--o-bd1)', borderTopColor: 'var(--o-accent)', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                  </div>
                ))}
              </div>}
        </div>
      </>)}

      {tab === 'about' && (() => {
        const cacheKb = (() => { try { let n = 0; for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); n += (localStorage.getItem(key) || '').length + key.length; } return Math.round(n / 1024 * 10) / 10; } catch (e) { return null; } })();
        const entCount = (hass && hass.states) ? Object.keys(hass.states).length : 0;
        return (
        <>
          <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,20px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>Configuration</span>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <button onClick={() => window.location.reload()} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text1)' }}>Recharger</button>
                {/* Sauvegarder et restaurer la configuration COMPLETE : celle
                    du serveur, partagee entre tous les appareils, et non le
                    seul stockage de ce navigateur. */}
                <button onClick={async () => {
                  const j = await exportConfigComplete();
                  telechargerConfig(j, 'loggia-config');
                }} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text)' }}>Exporter</button>
                {isAdmin && (
                  <>
                    <input type="file" accept="application/json,.json" style={{ display: 'none' }} id="o-import-cfg"
                      onChange={async (e) => {
                        const f = e.target.files && e.target.files[0];
                        if (!f) return;
                        try {
                          await importConfigComplete(await f.text());
                          window.location.reload();
                        } catch (err) {
                          alert('Import impossible : ' + ((err && err.message) || err));
                        } finally { e.target.value = ''; }
                      }} />
                    <button onClick={() => { const el = document.getElementById('o-import-cfg'); if (el) el.click(); }}
                      style={{ padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text)' }}>Importer</button>
                    <ResetLoggiaBtn compact />
                  </>
                )}
              </div>
            </div>
            <span style={{ flex: 1 }} />
            <button onClick={togglePanel} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 12, fontWeight: 700, border: panel ? 'var(--o-bw,1px) solid rgba(var(--o-accent-rgb),.44)' : 'var(--o-bw,1px) solid var(--o-bd1)', background: panel ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s2)', color: panel ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}><Fi i="sliders-v" size={13} /><span className="o-barlabel">{panel ? tr('Masquer les réglages') : tr('Réglages de la vue')}</span></button>
          </div>

          {panel && (
            <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,20px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Installation</div>
                {(() => {
                  const inst = installationReelle();
                  // Sans entite de suivi, aucun badge : mieux vaut ne rien dire
                  // que d'annoncer « a jour » sans l'avoir verifie.
                  if (inst.aJour === null) return null;
                  const bon = inst.aJour;
                  const col = bon ? 'var(--o-ok)' : 'var(--o-warn2)';
                  const rgb = bon ? 'var(--o-ok-rgb)' : 'var(--o-warn2-rgb)';
                  return (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, flexShrink: 0, whiteSpace: 'nowrap', fontSize: 11, fontWeight: 800, background: 'rgba(' + rgb + ',.14)', color: col }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: col }} />
                      {bon ? tr('À JOUR') : (inst.disponible ? 'v' + inst.disponible + ' DISPONIBLE' : 'MISE À JOUR')}
                    </span>
                  );
                })()}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, margin: '3px 0 8px' }}>{tr('Tableau de bord domotique auto-hébergé pour Home Assistant')}</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(() => {
                  const inst = installationReelle();
                  return (
                    <EnRow label="Version" desc={inst.suiviPar ? 'Suivie par ' + inst.suiviPar : 'Lue dans le composant installé'}>
                      <EnVal v={inst.version || '—'} col={inst.version ? 'var(--o-ok)' : 'var(--o-text3)'} />
                    </EnRow>
                  );
                })()}
                <EnRow label="Socle technique" desc="Construit et servi depuis Home Assistant"><EnVal v="React + Vite" col="var(--o-text)" /></EnRow>
                <EnRow label="Typographie" desc={tr('Auto-hébergée, sans CDN')}><EnVal v="Manrope / Newsreader" col="var(--o-text)" /></EnRow>
                <EnRow label={tr('Entités suivies')} desc={entIds.length + ' configurées sur ' + entCount + ' disponibles'}><EnVal v={String(entCount)} col="var(--o-accent-soft)" /></EnRow>
                <EnRow label="Cache local" desc={tr('États des entités et réglages de cet appareil')}>
                  <EnVal v={cacheKb != null ? (cacheKb >= 1024 ? (cacheKb / 1024).toFixed(1).replace('.', ',') + ' Mo' : cacheKb + ' Ko') : '—'} col="var(--o-text)" />
                </EnRow>
              </div>
            </div>
          )}
        </>
        );
      })()}
        </div>
      )}
    </div>
  );
}

const HA_CFG_DEF = { local: '', remote: '', pollMs: 2000, fallback: true };

// Hash 32 bits additif par entité — remplace la concat de grosses strings pour les clés-préfixes.
