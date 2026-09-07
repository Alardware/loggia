/* ── La vue Aspirateur ──────────────────────────────────────────────────────
 *
 * Chargee a la demande. Elle emporte avec elle le plan du logement, deja
 * differe : `vacplan.jsx` n'est demande que si l'on ouvre cette vue, et
 * seulement si un plan existe. */
import { useState, useEffect, lazy, Suspense } from 'react';
import { tr } from '../i18n.js';
import { cl_hexRgb } from '../ui.jsx';
import { loggiaEnt, vacRooms } from '../state.js';
import { VACUUM_STATE_FR } from '../resolve.js';
import { commanderService } from '../actions.js';
import { useLoggia, useEntities } from '../runtime.js';
import { CamLive } from '../camera.jsx';

// Le plan du robot : charge a la demande, il embarque son analyse d'image.
const VacPlan = lazy(() => import('../vacplan.jsx'));

function AspirateurContent({ hass }) {
  const S = (hass && hass.states) || null;
  const stTxt = (id) => { const e = S && S[id]; return (e && e.state != null && e.state !== 'unknown' && e.state !== 'unavailable') ? e.state : null; };
  const num = (id, def = null) => { const e = S && S[id]; if (!e) return def; const n = parseFloat(e.state); return isNaN(n) ? def : n; };

  // ── Resolution (etape 3) : plus aucun entity_id impose ──
  // `legacy(id)` ne rend l'identifiant que si l'entite existe REELLEMENT chez
  // l'utilisateur courant. C'est ce qui permet de garder l'affichage d'origine
  // ici sans imposer ces entites a qui ne les a pas.
  const { resolved } = useLoggia();
  const vac = (resolved && resolved.vacuum && resolved.vacuum.available) ? resolved.vacuum : null;
  // Identifiants maison : configuration utilisateur (loggia_entities.vacuum),
  // repli sur la constante le temps de la transition.
  const entVac = useEntities('vacuum', null) || {};
  const entRooms = useEntities('vacuumRooms', null) || [];
  const legacy = (id) => (id && S && S[id]) ? id : null;
  const idBat = (vac && vac.battery) || legacy(entVac.battery);
  const idSurf = (vac && vac.area_cleaned) || legacy(entVac.surface);
  const idMap = (vac && vac.map) || legacy(entVac.map);
  // Camera de surveillance du passage, optionnelle : le robot n'en fournit pas.
  const idCam = legacy(entVac.camera);
  // L'entite vacuum elle-meme : c'est elle qui publie la liste des pieces.
  const idVac = (vac && vac.main) || legacy(entVac.main) || legacy(entVac.vacuum);

  // L'etat vient de l'entite `vacuum` (garanti partout) ; le capteur maison,
  // deja traduit, reste prioritaire chez qui le possede.
  const raw = vac ? vac.state : null;
  const idEtat = legacy(entVac.etat);
  const etat = (idEtat && stTxt(idEtat)) || (raw && tr(VACUUM_STATE_FR[raw])) || tr("À la station d'accueil");
  const cleaning = raw ? raw === 'cleaning' : stTxt(entVac.cleaning) === 'on';
  const paused = raw ? raw === 'paused' : /pause/i.test(etat);
  // batterie : attribut de l'entite d'abord, capteur ensuite
  const batteryRaw = (vac && vac.batteryLevel != null) ? vac.batteryLevel : num(idBat, null); // indispo → « — », jamais un faux 100 %
  const battery = batteryRaw != null ? Math.round(batteryRaw) : null;
  const surfRaw = num(idSurf, null);
  const surface = surfRaw != null ? String(Math.round(surfRaw)) : null;
  const sOn = (id) => stTxt(id) === 'on';
  // Pieces reelles du robot, rattachees aux zones configurees (couleur, icone,
  // interrupteur). La liste des boutons et les zones cliquables du plan sortent
  // toutes deux d'ICI : un clic sur la carte fait donc exactement ce que fait
  // le bouton correspondant.
  const rooms = vacRooms(hass, idVac, entRooms);
  const ssig = rooms.map(r => sOn(r.toggle) ? 1 : 0).join('') + '|' + rooms.map(r => r.id).join(',');
  const [sel, setSel] = useState(() => Object.fromEntries(rooms.map(r => [r.id, sOn(r.toggle)])));
  // `ssig` resume l'etat des interrupteurs ET la liste des pieces : se caler
  // dessus evite de resynchroniser a chaque rendu, `rooms` etant reconstruit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSel(Object.fromEntries(rooms.map(r => [r.id, sOn(r.toggle)]))); }, [ssig]);
  const call = (d, s, data) => commanderService(hass, (data || {}).entity_id, d, s, data || {});
  const runScript = (id) => call('script', 'turn_on', { entity_id: id });
  // Un script maison fait souvent plus que le service standard (selection de
  // pieces, sequence). On le garde donc quand il existe, et on retombe sinon
  // sur le service du domaine `vacuum`, disponible chez tout le monde.
  const vacScript = (k) => { const c = loggiaEnt('vacuumScripts', null); return (c && c[k]) || null; };
  const runOr = (scriptId, svc) => {
    if (S && S[scriptId]) runScript(scriptId);
    else if (vac) call('vacuum', svc, { entity_id: vac.main });
  };
  // Une piece que le robot connait mais qu'aucun interrupteur ne pilote reste
  // affichee ; la basculer n'aurait rien a envoyer, on s'abstient plutot que
  // d'appeler le service a vide.
  const toggleRoom = (r) => {
    if (!r || !r.toggle) return;
    const on = !sel[r.id];
    setSel(s => ({ ...s, [r.id]: on }));
    call('input_boolean', on ? 'turn_on' : 'turn_off', { entity_id: r.toggle });
  };
  const picked = rooms.filter(r => sel[r.id]);
  const mainAction = () => paused ? runOr(vacScript('reprendre'), 'start') : cleaning ? runOr(vacScript('pause'), 'pause') : runOr(vacScript('nettoyer_tout'), 'start');
  const mainLabel = paused ? tr('Reprendre') : cleaning ? tr('Mettre en pause') : tr('Démarrer le nettoyage');
  const onBlue = cleaning && !paused;
  const onBase = raw ? raw === 'docked' : stTxt(entVac.onBase) === 'on';
  // Bandeau + carte de synthese repliables (patron Atrium)
  const stateTag = onBlue ? tr('NETTOYAGE EN COURS') : paused ? tr('EN PAUSE') : onBase ? tr('SUR LA BASE') : tr('AU REPOS');
  const stateCol = onBlue ? 'var(--o-accent)' : paused ? '#ffb347' : 'var(--o-ok)';
  const stateRgb = onBlue ? 'var(--o-accent-rgb)' : paused ? '255,179,71' : 'var(--o-ok-rgb)';
  const barBtn = { padding: '5px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--o-s1)', color: 'var(--o-text1)' };

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="o-obj-head" style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>Aspirateur</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{etat} · {tr('batterie')} {battery != null ? battery + ' %' : '—'}{surface ? ' · ' + surface + ' m² aujourd’hui' : ''}{picked.length ? ' · ' + (picked.length > 1 ? tr('{n} zones ciblées', { n: picked.length }) : tr('{n} zone ciblée', { n: picked.length })) : ''}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: `rgba(${stateRgb},.14)`, color: stateCol }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: stateCol, animation: onBlue ? 'pulse 1.4s infinite' : 'none' }} />{stateTag}</span>
      </div>

      {/* réglages rapides : marche/arrêt, retour à la base, localisation */}
      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,18px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>Robot</span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={mainAction} style={{ ...barBtn, background: onBlue ? 'rgba(var(--o-accent-rgb),.18)' : 'rgba(var(--o-ok-rgb),.18)', color: onBlue ? 'var(--o-accent-soft)' : 'var(--o-ok)' }}>{mainLabel}</button>
            <button onClick={() => runOr(vacScript('retour_base'), 'return_to_base')} style={barBtn}>Base</button>
            <button onClick={() => runOr(vacScript('localiser'), 'locate')} style={barBtn}>Localiser</button>
          </div>
        </div>
        <span style={{ flex: 1 }} />
      </div>

      <div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: 18, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}><div style={{ fontSize: 15, fontWeight: 700 }}>{tr('Carte du logement')}</div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-accent-soft)', background: 'rgba(var(--o-accent-rgb),.14)', padding: '4px 11px', borderRadius: 999 }}>Live · 10s</span></div>
        <Suspense fallback={<div style={{ aspectRatio: '16/10', borderRadius: 'var(--o-radius,18px)', background: 'var(--o-well2)' }} />}>
          <VacPlan hass={hass} haid={idMap} zones={rooms} selection={sel} onToggle={toggleRoom} />
        </Suspense>
      </div>

      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Nettoyage ciblé')}</div>
      <div className="grid-vac-map" style={{ display: 'grid', gridTemplateColumns: idCam ? 'minmax(0,1.3fr) minmax(260px,1fr)' : '1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: 20, boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.36))' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{tr('Zones à nettoyer')}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>
              {picked.length ? (picked.length > 1 ? tr('{n} pièces sélectionnées', { n: picked.length }) : tr('{n} pièce sélectionnée', { n: picked.length })) : tr('passage complet')}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginBottom: 16 }}>{tr('Sur la carte ou dans la liste — laisse vide pour un passage complet')}</div>
          <div className="grid-vac-rooms" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
            {rooms.map(r => {
              const on = !!sel[r.id];
              const sans = !r.toggle;
              return (
                <button key={r.id} onClick={() => toggleRoom(r)} aria-pressed={on} disabled={sans}
                  title={sans ? 'Aucun interrupteur ne pilote cette pièce' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 14px', borderRadius: 14,
                    border: '1px solid ' + (on ? r.color + '66' : 'var(--o-bd2)'), cursor: sans ? 'default' : 'pointer',
                    fontWeight: 700, fontSize: 13, textAlign: 'left', transition: 'all .2s', opacity: sans ? .5 : 1,
                    background: on ? `rgba(${cl_hexRgb(r.color)},.14)` : 'var(--o-s2)',
                    color: on ? r.color : 'var(--o-text2)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 4, flexShrink: 0, background: on ? r.color : 'var(--o-text3)' }} />
                  {r.name}
                </button>
              );
            })}
          </div>
          <button onClick={() => { const sc = vacScript('pieces_selectionnees'); if (picked.length && sc) runScript(sc); }} style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 14, border: 'none', cursor: picked.length ? 'pointer' : 'default', fontWeight: 800, fontSize: 13, transition: 'all .2s', background: picked.length ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: picked.length ? '#fff' : 'var(--o-text3)', boxShadow: picked.length ? '0 8px 20px rgba(var(--o-accent-rgb),.35)' : 'none' }}>{picked.length ? (picked.length > 1 ? tr('Nettoyer {n} pièces', { n: picked.length }) : tr('Nettoyer {n} pièce', { n: picked.length })) : tr('Sélectionne des pièces')}</button>
        </div>
        {idCam && (
          <div style={{ background: 'linear-gradient(180deg,var(--o-surfA),var(--o-surfB))', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{tr('Caméra')}</div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: 'rgba(var(--o-ok-rgb),.14)', color: 'var(--o-ok)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-ok)' }} />EN DIRECT
              </span>
            </div>
            <div style={{ position: 'relative', borderRadius: 'var(--o-radius,18px)', overflow: 'hidden', aspectRatio: '16/10', background: 'var(--o-well2)' }}>
              <CamLive hass={hass} haid={idCam} />
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--o-text3)', marginTop: 10, lineHeight: 1.5 }}>
              Suit le passage du robot. Choisis la caméra dans Paramètres → Entités.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AspirateurContent;
