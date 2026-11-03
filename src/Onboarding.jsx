// ─────────────────────────────────────────────────────────────────────────────
// Premier lancement.
//
// Le dashboard fonctionne sans rien configurer : la decouverte suffit. Cet
// ecran ne demande donc RIEN d'obligatoire — il montre ce qui a ete trouve, et
// dit franchement ce qui restera masque et pourquoi.
//
// Il s'efface pour de bon des qu'on en sort, par n'importe quelle porte : la
// cle `loggia_onboarded` est ecrite aussi bien par « Passer » que par la fin du
// parcours. Un ecran d'accueil qui revient est une punition, pas un accueil.
//
// La maquette du 01/11 (handoff « Loggia Prototype ») : des points pour les
// etapes — bienvenue, ce que Loggia a trouve, le code administrateur (s'il
// n'existe pas encore), le type d'ecran, tout est pret. Ce qu'elle ne montre
// plus s'en va : le choix des pieces et des entites cles. Les zones proposees,
// l'alarme et la meteo trouvees s'enregistrent comme avant ; tout se change
// plus tard en mode edition, bouton « Entites de la vue ».
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { tr, trN } from './i18n.js';
// Fi vient de ui.jsx (lot 15 de l'audit du 03/10). La copie d'ici craignait un
// cycle avec App.jsx : Fi n'y vit plus, et ui.jsx n'importe rien d'ici.
import { Fi } from './ui.jsx';
import { cfgVal, getHass } from './state.js';
import { formatEcran } from './disposition.js';
import { useCoarse, useWide } from './app/ecran.jsx';

/* Le titre d'une vue, lu a l'affichage : la langue peut changer apres
 * l'import (listes_fonctions.test.mjs). */
const titreVue = (v) => ({
  pieces: tr('Pièces'), scenes: tr('Scénarios'), objets: tr('Objets'), energie: tr('Énergie'),
  securite: tr('Sécurité'), systeme: tr('Système'), lumieres: tr('Lumières'), climat: tr('Climat'),
  volets: tr('Volets'), aspirateur: tr('Aspirateur'), medias: tr('Médias'),
})[v] || null;

const h1 = { margin: 0, fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic', fontWeight: 500, lineHeight: 1.1, letterSpacing: '-.01em' };
const lead = { margin: '6px 0 0', fontSize: 13.5, fontWeight: 600, color: 'var(--o-text2)', lineHeight: 1.55, textWrap: 'pretty' };
const entree = 'o-viewIn .35s ease-out';
/* Blanc sur le fond d'accent, comme partout (lot 15 de l’audit du 03/10) :
 * ce fond est calculé pour le blanc. */
const primary = {
  padding: '12px 22px', borderRadius: 13, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 800, background: 'var(--o-accent-fond)', color: '#fff',
};
const ghost = {
  padding: '12px 18px', borderRadius: 13, cursor: 'pointer', fontSize: 13, fontWeight: 800,
  background: 'transparent', border: 'var(--o-bw,1px) solid var(--o-bd1)', color: 'var(--o-text1)',
};

/** Ce que la lecture a trouvé, une ligne par famille présente — jamais une
 *  famille vide. Chaque ligne : icône, teinte (un jeton), titre, détail. */
export function trouvailles(runtime) {
  const resolved = (runtime && runtime.resolved) || {};
  const caps = (runtime && runtime.caps) || {};
  const counts = caps.counts || {};
  const devices = caps.devices || {};
  const noms = (l, n = 4) => { const x = (l || []).map(d => d && d.name).filter(Boolean); return x.length > n ? x.slice(0, n).join(', ') + '…' : x.join(', '); };
  const out = [];
  const pieces = ((resolved.rooms || {}).suggested) || [];
  if (pieces.length) out.push({ cle: 'pieces', icone: 'door-open', ton: 'piece-ambre', titre: trN(pieces.length, '{n} pièce', '{n} pièces'), detail: noms(pieces, 6) });
  if (counts.light > 0) out.push({ cle: 'lumieres', icone: 'bulb', ton: 'lampe', titre: trN(counts.light, '{n} lumière', '{n} lumières'), detail: tr('Chacune a sa carte') });
  const volets = devices.cover || [];
  if (volets.length) out.push({ cle: 'volets', icone: 'blinds', ton: 'purple', titre: trN(volets.length, '{n} volet', '{n} volets'), detail: noms(volets) });
  const chauffage = devices.climate || [];
  if (chauffage.length) out.push({ cle: 'chauffage', icone: 'flame', ton: 'orange', titre: trN(chauffage.length, '{n} thermostat', '{n} thermostats'), detail: noms(chauffage) });
  const cameras = devices.camera || [];
  if (cameras.length) out.push({ cle: 'cameras', icone: 'video-camera', ton: 'cyan', titre: trN(cameras.length, '{n} caméra', '{n} caméras'), detail: noms(cameras) });
  const energie = resolved.energy || {};
  if (energie.available) {
    const source = energie.source === 'utilisateur' ? tr('Suivie via les capteurs désignés dans Loggia') : tr('Suivie via le tableau de bord Énergie de Home Assistant');
    out.push({ cle: 'energie', icone: 'bolt', ton: 'gold', titre: tr('Énergie'), detail: source + ((energie.devices || []).length ? ' · ' + tr('{n} appareils mesurés', { n: energie.devices.length }) : '') });
  }
  const alarme = resolved.alarm || {};
  if (alarme.available) out.push({ cle: 'alarme', icone: 'shield-check', ton: 'ok', titre: tr('Alarme'), detail: alarme.name || '' });
  return out;
}

/** Les étapes, dans l'ordre : le code n'est demandé que s'il n'existe pas. */
export function etapesPremierLancement(codeDefini) {
  return ['bienvenue', 'trouve', ...(codeDefini ? [] : ['code']), 'ecran', 'pret'];
}

export default function Onboarding({ runtime, onDone, onSkip }) {
  const [codeDefini, setCodeDefini] = useState(() => cfgVal('loggia_admin_pin_defini', false) === true);
  const etapes = etapesPremierLancement(codeDefini);
  const [step, setStep] = useState(0);
  const etape = etapes[Math.min(step, etapes.length - 1)];
  const [pin, setPin] = useState('');
  const [pinErreur, setPinErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const telephone = !useWide(640);
  const format = formatEcran(useCoarse(), useWide(1180));

  const resolved = (runtime && runtime.resolved) || {};
  const rooms = resolved.rooms || {};
  const suggested = rooms.suggested || [];
  const technical = rooms.technical || [];
  const views = (runtime && runtime.views) || {};
  const alarm = resolved.alarm || {};
  const weather = resolved.weather || {};
  const known = rooms.rooms || [];
  const missing = Object.keys(views).filter(v => titreVue(v) && views[v] && views[v].ok === false);
  const present = Object.keys(views).filter(v => titreVue(v) && views[v] && views[v].ok !== false);
  const trouve = trouvailles(runtime);

  /* Les pieces : celles deja enregistrees — reinstallation, configuration
   * importee — sinon les zones proposees. Un ecran d'accueil ne doit jamais
   * effacer une configuration. Les entites cles trouvees partent avec : une
   * seule candidate, c'est quand meme un choix, l'ecrire fige la decouverte. */
  const finish = () => {
    const noms = new Set(known.map(r => String(typeof r === 'string' ? r : r.room).toLowerCase()));
    const deja = [...suggested, ...technical].filter(a => noms.has(String(a.name).toLowerCase()));
    const chosen = (deja.length ? deja : suggested)
      .map(a => ({ room: a.name, haid: { temp: a.temp || null, humidity: a.hum || null, co2: a.co2 || null } }));
    const patch = {};
    if (alarm.available && alarm.main) patch.loggia_alarm = alarm.main;
    if (weather.available && weather.main) patch.loggia_weather = weather.main;
    if (!chosen.length) { onDone(known.length ? { ...patch, loggia_rooms: known } : patch); return; }
    onDone({ ...patch, loggia_rooms: chosen });
  };

  /* Le code administrateur : haché par le composant, jamais renvoyé à un
   * écran — la même commande que Paramètres, réservée aux administrateurs. */
  const enregistrerCode = async () => {
    const h = getHass();
    if (!h || typeof h.callWS !== 'function') { setPinErreur(tr('Home Assistant n’est pas joignable.')); return false; }
    setEnCours(true);
    try {
      await h.callWS({ type: 'loggia/pin/definir', pin });
      return true;
    } catch (e) {
      setPinErreur(e && e.code === 'unauthorized' ? tr('Réservé aux administrateurs.') : ((e && (e.message || e.code)) || tr('Enregistrement impossible.')));
      return false;
    } finally { setEnCours(false); }
  };

  const suivant = async () => {
    if (etape === 'code' && pin.length > 0) {
      if (pin.length < 4) { setPinErreur(tr('Le code fait de 4 à 8 chiffres.')); return; }
      if (!(await enregistrerCode())) return;
      // Le code existe : l'étape sort de la liste, la suivante prend sa place.
      setCodeDefini(true); setPin('');
      return;
    }
    if (etape === 'pret') { finish(); return; }
    setStep(s => s + 1);
  };
  const touche = (k) => { setPinErreur(null); setPin(p => (k === 'del' ? p.slice(0, -1) : (p + k).slice(0, 8))); };

  // Le clavier de l'ordinateur tape le code aussi.
  useEffect(() => {
    if (etape !== 'code') return undefined;
    const ecoute = (e) => {
      if (/^[0-9]$/.test(e.key)) touche(e.key);
      else if (e.key === 'Backspace') touche('del');
    };
    window.addEventListener('keydown', ecoute);
    return () => window.removeEventListener('keydown', ecoute);
  }, [etape]);

  const texteSuivant = etape === 'bienvenue' ? tr('Commencer') : etape === 'pret' ? tr('Ouvrir l’Accueil') : etape === 'code' && !pin ? tr('Plus tard') : tr('Continuer');
  const messagePin = pinErreur || (pin.length === 0 ? tr('De 4 à 8 chiffres. Il protège le profil administrateur et le mode enfant.')
    : pin.length < 4 ? trN(4 - pin.length, 'Encore {n} chiffre au moins', 'Encore {n} chiffres au moins')
      : tr('Code prêt · {n} chiffres', { n: pin.length }));
  const couleurPin = pinErreur ? 'var(--o-bad)' : pin.length >= 4 ? 'var(--o-ok)' : 'var(--o-text2)';
  const ECRANS = [
    ['pc', tr('Ordinateur'), 'computer', tr('La barre latérale, tout l’écran')],
    ['tablette', tr('Tablette murale'), 'mode-landscape', tr('Au doigt, sur un grand écran')],
    ['mobile', tr('Téléphone'), 'portrait', tr('Au doigt, d’une main')],
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, overflowY: 'auto', background: 'var(--o-bggrad, var(--o-bg))', color: 'var(--o-text)', fontFamily: 'var(--o-font)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', padding: telephone ? 'calc(70px + var(--o-safe-top,0px)) 22px calc(30px + var(--o-safe-bottom,0px))' : 40, animation: 'o-fadeIn .3s ease-out' }}>
      {/* Le ciel de la maquette : un lavis d'accent qui descend du haut et s'éteint. */}
      <div aria-hidden="true" style={{ position: 'fixed', left: 0, right: 0, top: 0, height: '60%', background: 'linear-gradient(180deg, rgba(var(--o-accent-rgb),.16), transparent)', pointerEvents: 'none' }} />
      <button onClick={onSkip} style={{ position: 'fixed', top: 'calc(18px + var(--o-safe-top,0px))', right: 18, zIndex: 2, padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--o-s1)', fontSize: 12, fontWeight: 700, color: 'var(--o-text1)' }}>{tr('Passer')}</button>
      <div style={{ position: 'relative', width: telephone ? '100%' : 560, maxWidth: '100%', margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
          {etapes.map((e, i) => (
            <span key={e} style={{ height: 7, width: i === step ? 22 : 7, borderRadius: 4, background: i <= step ? 'var(--o-accent)' : 'var(--o-bd1)', transition: 'width .3s, background .3s' }} />
          ))}
        </div>
        <span className="o-vh">{tr('ÉTAPE {a} SUR {b}', { a: step + 1, b: etapes.length })}</span>

        {etape === 'bienvenue' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: entree }}>
            <img src="./logo.png" alt="" width={64} height={64} style={{ width: 64, height: 64, borderRadius: 17, display: 'block' }} />
            <h1 style={{ ...h1, fontSize: telephone ? 36 : 42, lineHeight: 1.05 }}>{tr('Bienvenue dans Loggia')}</h1>
            <p style={{ ...lead, margin: 0, fontSize: 15, color: 'var(--o-text1)', lineHeight: 1.6 }}>
              {tr('Loggia lit ce que Home Assistant sait déjà de votre maison — zones, appareils, entités — et compose le tableau de bord. Rien à écrire. Ce qui n’existe pas chez vous n’apparaît pas ; ce que vous ajouterez plus tard apparaîtra seul.')}
            </p>
          </div>
        )}

        {etape === 'trouve' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <h1 style={{ ...h1, fontSize: 34 }}>{tr('Ce que Loggia a trouvé')}</h1>
              <p style={lead}>{tr('Lu dans vos registres, sans un seul identifiant d’entité.')}</p>
            </div>
            {trouve.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {trouve.map((d, n) => (
                  <div key={d.cle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 14, background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', opacity: 0, animation: 'o-viewIn .4s ease-out forwards', animationDelay: (n * 0.28 + 0.15).toFixed(2) + 's' }}>
                    <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 11, background: `rgba(var(--o-${d.ton}-rgb),.16)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Fi i={d.icone} size={15} color={`var(--o-${d.ton})`} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{d.titre}</div>
                      {d.detail && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.detail}</div>}
                    </div>
                    <Fi i="check" size={13} color="var(--o-ok)" />
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ ...lead, margin: 0 }}>{tr('Rien pour l’instant : ce que vous ajouterez dans Home Assistant apparaîtra seul.')}</p>
            )}
            <p style={{ ...lead, margin: 0, fontSize: 12 }}>{tr('Tout se change plus tard en mode édition, bouton « Entités de la vue ».')}</p>
            {missing.map(v => (
              <div key={v} style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
                {tr('Masquée pour l’instant : {v}', { v: titreVue(v) })} — {tr(views[v].reason)}
              </div>
            ))}
          </div>
        )}

        {etape === 'code' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, textAlign: 'center', animation: entree }}>
            <div>
              <h1 style={{ ...h1, fontSize: 34 }}>{tr('Le code administrateur')}</h1>
              <p role="status" style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 700, color: couleurPin }}>{messagePin}</p>
            </div>
            <div aria-hidden="true" style={{ display: 'flex', gap: 10, height: 16, alignItems: 'center' }}>
              {Array.from({ length: Math.max(6, pin.length) }, (_, i) => (
                <span key={i} style={{ width: 14, height: 14, borderRadius: '50%', boxSizing: 'border-box', background: i < pin.length ? 'var(--o-accent)' : 'transparent', border: '2px solid ' + (i < pin.length ? 'var(--o-accent)' : 'var(--o-bd1)'), transition: 'background .15s' }} />
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 10 }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => (k === ''
                ? <span key={i} />
                : <button key={i} onClick={() => touche(k)} aria-label={k === 'del' ? tr('Effacer') : k}
                  style={{ height: 56, borderRadius: 16, border: 'var(--o-bw,1px) solid var(--o-bd2)', cursor: 'pointer', background: 'var(--o-surfA)', color: 'var(--o-text)', fontSize: 20, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {k === 'del' ? <Fi i="delete" size={18} color="var(--o-text2)" /> : k}
                </button>))}
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--o-text3)', maxWidth: 360 }}>{tr('Haché par l’intégration, jamais renvoyé à un écran. Les essais ratés sont limités.')}</div>
          </div>
        )}

        {etape === 'ecran' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: entree }}>
            <div>
              <h1 style={{ ...h1, fontSize: 34 }}>{tr('Cet écran est…')}</h1>
              <p style={lead}>{tr('Loggia l’a reconnu tout seul, au toucher et à la taille de l’écran. Chaque type garde son rangement ; le contenu, lui, se synchronise.')}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ECRANS.map(([id, nom, icone, detail]) => {
                const on = id === format;
                return (
                  <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, background: on ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s1)', border: '1.5px solid ' + (on ? 'var(--o-accent)' : 'var(--o-bd2)') }}>
                    <span style={{ width: 42, height: 42, flex: 'none', borderRadius: 13, background: 'var(--o-s1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Fi i={icone} size={18} color={on ? 'var(--o-accent)' : 'var(--o-text2)'} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 800 }}>{nom}</span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--o-text2)' }}>{detail}</span>
                    </span>
                    {on && <Fi i="check" size={14} color="var(--o-accent)" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {etape === 'pret' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: entree }}>
            <span style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(var(--o-ok-rgb),.16)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Fi i="check" size={24} color="var(--o-ok)" />
            </span>
            <h1 style={{ ...h1, fontSize: 40 }}>{tr('Tout est prêt')}</h1>
            <p style={{ ...lead, margin: 0, fontSize: 14.5, color: 'var(--o-text1)', lineHeight: 1.6 }}>
              {trN(present.length, '{n} vue composée d’après votre maison.', '{n} vues composées d’après votre maison.')}
              {' ' + tr('Chaque appareil a sa carte ; sa fiche s’ouvre d’un toucher. Le reste se règle plus tard, en mode édition, bouton « Entités de la vue ».')}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {step > 0 && <button onClick={() => { setPinErreur(null); setStep(s => Math.max(0, s - 1)); }} style={ghost}>{tr('Retour')}</button>}
          <span style={{ flex: 1 }} />
          <button onClick={suivant} disabled={enCours} style={{ ...primary, opacity: enCours ? .6 : 1 }}>{texteSuivant}</button>
        </div>
      </div>
    </div>
  );
}
