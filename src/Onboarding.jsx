// ─────────────────────────────────────────────────────────────────────────────
// Premier lancement.
//
// Le dashboard fonctionne sans rien configurer : la decouverte suffit. Cet
// ecran ne demande donc RIEN d'obligatoire — il montre ce qui a ete trouve,
// laisse choisir les pieces, et dit franchement ce qui restera vide et pourquoi.
//
// Il s'efface pour de bon des qu'on en sort, par n'importe quelle porte : la
// cle `loggia_onboarded` est ecrite aussi bien par « Passer » que par la fin du
// parcours. Un ecran d'accueil qui revient est une punition, pas un accueil.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { tr } from './i18n.js';

// Meme rendu que dans App.jsx, redefini ici : trois lignes pures, contre un
// cycle d'import entre les deux fichiers.
function Fi({ i, size = 18, color, style }) {
  return <i aria-hidden="true" className={'fi fi-rr-' + i} style={{ fontSize: size, color, lineHeight: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', ...style }} />;
}

const VIEW_TITLES = {
  pieces: tr('Pièces'), scenes: tr('Scènes'), objets: tr('Objets'), energie: tr('Énergie'),
  securite: tr('Sécurité'), systeme: tr('Système'), lumieres: tr('Lumières'), climat: tr('Climat'),
  volets: tr('Volets'), aspirateur: tr('Aspirateur'), croquettes: tr('Croquettes'), medias: tr('Médias'),
};

const card = {
  background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)',
  borderRadius: 'var(--o-radius,18px)', boxShadow: 'var(--o-shadow)',
};
const primary = {
  padding: '11px 20px', borderRadius: 14, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 700, background: 'var(--o-accent-fond)', color: '#06121f',
};
const ghost = {
  padding: '11px 18px', borderRadius: 14, cursor: 'pointer', fontSize: 13,
  fontWeight: 700, background: 'transparent', border: 'var(--o-bw,1px) solid var(--o-bd2)',
  color: 'var(--o-text2)',
};
const title = {
  fontFamily: 'var(--o-serif, Newsreader, serif)', fontStyle: 'italic',
  fontWeight: 400, fontSize: 36, margin: 0, letterSpacing: '-.01em',
};
const lead = { fontSize: 13, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, lineHeight: 1.55 };

/** Chiffre et libelle, empiles. */
function Stat({ v, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 25, fontWeight: 800, letterSpacing: '-.02em' }}>{v}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)', letterSpacing: '.03em' }}>{label}</span>
    </div>
  );
}

function Check({ on, onT, name, sub }) {
  return (
    <div role="checkbox" aria-checked={on} tabIndex={0} onClick={onT}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onT(); } }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 14, cursor: 'pointer', border: '1px solid ' + (on ? 'rgba(var(--o-accent-rgb),.4)' : 'var(--o-bd3)'), background: on ? 'rgba(var(--o-accent-rgb),.1)' : 'var(--o-s2)' }}>
      <span style={{ width: 20, height: 20, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--o-accent-fond)' : 'transparent', border: on ? 'none' : '1.5px solid var(--o-bd1)' }}>
        {on && <Fi i="check" size={11} color="#06121f" />}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{sub}</div>
      </div>
    </div>
  );
}

export default function Onboarding({ runtime, onDone, onSkip }) {
  const [step, setStep] = useState(0);
  const resolved = (runtime && runtime.resolved) || {};
  const rooms = resolved.rooms || {};
  const suggested = rooms.suggested || [];
  const technical = rooms.technical || [];
  const totals = ((runtime && runtime.caps) || {}).totals || {};
  const views = (runtime && runtime.views) || {};
  // Entites cles : l'alarme et la meteo se CHOISISSENT (une installation peut
  // en avoir plusieurs), l'energie se CONSTATE (elle vient du tableau de bord
  // Energie de Home Assistant, rien a designer).
  const alarm = resolved.alarm || {};
  const weather = resolved.weather || {};
  const energy = resolved.energy || {};
  const [alarme, setAlarme] = useState(alarm.available ? alarm.main : null);
  const [meteo, setMeteo] = useState(weather.available ? weather.main : null);
  const cles = !!((alarm.available && (alarm.choices || []).length) || (weather.available && (weather.choices || []).length) || energy.available);
  const totalEtapes = cles ? 4 : 3;
  const etapeAffichee = cles ? step + 1 : (step === 3 ? 3 : step + 1);

  // Zones proposees cochees d'office : c'est la lecture la plus probable, et
  // decocher est plus rapide que cocher sept fois. Si des pieces sont deja
  // enregistrees — reinstallation, configuration importee — ce sont celles-la
  // qui sont cochees : on ne fait pas refaire un choix deja fait.
  const known = rooms.rooms || [];
  const [picked, setPicked] = useState(() => {
    const o = {};
    if (known.length) {
      const noms = new Set(known.map(r => String(typeof r === 'string' ? r : r.room).toLowerCase()));
      [...suggested, ...technical].forEach(a => { if (noms.has(String(a.name).toLowerCase())) o[a.id] = true; });
      if (Object.keys(o).length) return o;
    }
    suggested.forEach(a => { o[a.id] = true; });
    return o;
  });
  const [showTech, setShowTech] = useState(false);
  const nPicked = Object.keys(picked).filter(k => picked[k]).length;

  const finish = () => {
    const chosen = [...suggested, ...technical]
      .filter(a => picked[a.id])
      .map(a => ({ room: a.name, haid: { temp: a.temp || null, humidity: a.hum || null, co2: a.co2 || null } }));
    // Les entites cles choisies partent avec les pieces. Une seule candidate,
    // c'est quand meme un choix : l'ecrire fige la decouverte du jour.
    const patch = {};
    if (alarm.available && alarme) patch.loggia_alarm = alarme;
    if (weather.available && meteo) patch.loggia_weather = meteo;
    // Rien à proposer et des pièces déjà enregistrées : on les garde telles
    // quelles. Un écran d'accueil ne doit jamais effacer une configuration.
    if (!chosen.length) { onDone(known.length ? { ...patch, loggia_rooms: known } : patch); return; }
    onDone({ ...patch, loggia_rooms: chosen });
  };

  const titre = (v) => !!VIEW_TITLES[v];
  const missing = Object.keys(views).filter(v => titre(v) && views[v] && views[v].ok === false);
  const present = Object.keys(views).filter(v => titre(v) && views[v] && views[v].ok !== false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, overflowY: 'auto', background: 'var(--o-bggrad, var(--o-bg))', color: 'var(--o-text)', fontFamily: 'var(--o-font)', padding: 'calc(28px + var(--o-safe-top,0px)) 22px calc(32px + var(--o-safe-bottom,0px))' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,var(--o-ok),var(--o-accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#06121f', fontSize: 19 }}>O</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Loggia</div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--o-text3)' }}>ÉTAPE {etapeAffichee} SUR {totalEtapes}</div>
          </div>
          <button onClick={onSkip} style={{ ...ghost, padding: '7px 13px', fontSize: 12 }}>Passer</button>
        </div>

        {step === 0 && (
          <>
            <div>
              <h1 style={title}>Bienvenue</h1>
              <div style={lead}>
                Loggia a lu votre installation Home Assistant. Rien n'est à saisir : les vues se remplissent avec ce qui existe déjà chez vous.
              </div>
            </div>
            <div style={{ ...card, padding: '20px 22px', display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <Stat v={totals.entities != null ? totals.entities : '—'} label={tr('ENTITÉS')} />
              <Stat v={totals.areasUsed != null ? totals.areasUsed : '—'} label={tr('ZONES UTILISÉES')} />
              <Stat v={totals.domains != null ? totals.domains : '—'} label="DOMAINES" />
              <Stat v={present.length} label="VUES DISPONIBLES" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={primary}>Commencer</button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <h1 style={title}>{tr('Vos pièces')}</h1>
              <div style={lead}>
                {suggested.length
                  ? 'Ces zones Home Assistant contiennent des équipements d’ambiance. Décochez celles qui ne sont pas des pièces.'
                  : 'Aucune zone Home Assistant ne ressemble à une pièce pour l’instant. Vous pourrez en désigner plus tard dans Paramètres → Entités.'}
              </div>
            </div>
            {suggested.length > 0 && (
              <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {suggested.map(a => (
                  <Check key={a.id} on={!!picked[a.id]} onT={() => setPicked(p => ({ ...p, [a.id]: !p[a.id] }))}
                    name={a.name}
                    sub={a.ambiance + ' équipement' + (a.ambiance > 1 ? 's' : '') + (a.temp ? ' · capteur de température' : '')} />
                ))}
              </div>
            )}
            {technical.length > 0 && (
              <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => setShowTech(v => !v)} style={{ ...ghost, alignSelf: 'flex-start', border: 'none', padding: '4px 2px' }}>
                  {showTech ? 'Masquer' : 'Afficher'} les {technical.length} zones techniques
                </button>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', padding: '0 2px' }}>
                  Sans équipement d’ambiance — réseau, énergie, serveurs. Rarement des pièces.
                </div>
                {showTech && technical.map(a => (
                  <Check key={a.id} on={!!picked[a.id]} onT={() => setPicked(p => ({ ...p, [a.id]: !p[a.id] }))}
                    name={a.name} sub={a.entities + ' entités'} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={() => setStep(cles ? 2 : 3)} style={primary}>Continuer</button>
              <button onClick={() => setStep(0)} style={ghost}>Retour</button>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text3)' }}>{nPicked} pièce{nPicked > 1 ? 's' : ''}</span>
            </div>
          </>
        )}

        {step === 2 && cles && (
          <>
            <div>
              <h1 style={title}>{tr('Les entités clés')}</h1>
              <div style={lead}>
                {tr('Trois repères que le dashboard utilise partout. Tout se change plus tard dans Paramètres → Entités.')}
              </div>
            </div>
            {alarm.available && (alarm.choices || []).length > 0 && (
              <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', padding: '2px 2px 0' }}>{tr('ALARME')}</div>
                {alarm.choices.map(c => (
                  <Check key={c.id} on={alarme === c.id} onT={() => setAlarme(c.id)} name={c.name} sub={c.id} />
                ))}
              </div>
            )}
            {weather.available && (weather.choices || []).length > 0 && (
              <div style={{ ...card, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)', padding: '2px 2px 0' }}>{tr('MÉTÉO')}</div>
                {weather.choices.map(c => (
                  <Check key={c.id} on={meteo === c.id} onT={() => setMeteo(c.id)} name={c.name} sub={c.id} />
                ))}
              </div>
            )}
            <div style={{ ...card, padding: '15px 17px' }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>{tr('ÉNERGIE')}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text2)', marginTop: 6, lineHeight: 1.5 }}>
                {energy.available
                  ? tr('Suivie via le {src}', { src: energy.source }) + ((energy.devices || []).length ? ' · ' + tr('{n} appareils mesurés', { n: energy.devices.length }) : '') + '. ' + tr('Rien à désigner.')
                  : tr("Rien de détecté — configure le tableau de bord Énergie de Home Assistant, Loggia s'en servira tout seul.")}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(3)} style={primary}>Continuer</button>
              <button onClick={() => setStep(1)} style={ghost}>Retour</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <h1 style={title}>{tr("C'est prêt")}</h1>
              <div style={lead}>
                {present.length} vue{present.length > 1 ? 's' : ''} se remplissent avec votre installation.
                {missing.length > 0 && ' Les autres restent masquées tant qu’il n’y a rien à y montrer — elles réapparaîtront d’elles-mêmes.'}
              </div>
            </div>
            {missing.length > 0 && (
              <div style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--o-text3)' }}>{tr("MASQUÉES POUR L'INSTANT")}</div>
                {missing.map(v => (
                  <div key={v} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 96, flexShrink: 0 }}>{VIEW_TITLES[v]}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', lineHeight: 1.45, flex: 1, minWidth: 200 }}>{views[v].reason}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={finish} style={primary}>Ouvrir mon dashboard</button>
              <button onClick={() => setStep(cles ? 2 : 1)} style={ghost}>Retour</button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
