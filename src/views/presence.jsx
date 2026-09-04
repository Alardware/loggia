/* Départ et retour : régler ce que fait la maison quand elle se vide.
 *
 * Le serveur (`presence.py`) tient la règle — elle marche dashboard fermé, ce
 * qui est le minimum pour une maison qu'on quitte.
 *
 * Un parti pris d'interface : le désarmement au retour est présenté à part,
 * avec son avertissement. Armer parce que la maison se vide est sans risque ;
 * la désarmer parce qu'un téléphone approche en est un, et cette case ne doit
 * pas se cocher distraitement au milieu des autres.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { cvName } from '../ui.jsx';
import { tr } from '../i18n.js';

export function PresenceReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState('');
  const vivant = useRef(true);

  useEffect(() => {
    vivant.current = true;
    if (!h) { setErr(tr('Home Assistant n’est pas joignable.')); return undefined; }
    const lire = () => h.callWS({ type: 'loggia/presence/etat' })
      .then(r => { if (vivant.current) { setEtat(r); setErr(''); } })
      .catch(e => { if (vivant.current) setErr((e && (e.message || e.code)) || tr('Réglages indisponibles.')); });
    lire();
    const t = setInterval(lire, 5000);
    return () => { vivant.current = false; clearInterval(t); };
  }, [!!h]);

  const cfg = (etat && etat.config) || null;

  const enregistrer = async (patch) => {
    if (!h || !cfg) return;
    setEtat(e => {
      if (!e) return e;
      const objet = (x) => x && typeof x === 'object' && !Array.isArray(x);
      const n = { ...e.config };
      for (const k of Object.keys(patch)) {
        if (objet(n[k]) && objet(patch[k])) {
          n[k] = { ...n[k] };
          for (const kk of Object.keys(patch[k])) {
            n[k][kk] = (objet(n[k][kk]) && objet(patch[k][kk]))
              ? { ...n[k][kk], ...patch[k][kk] } : patch[k][kk];
          }
        } else n[k] = patch[k];
      }
      return { ...e, config: n };
    });
    try {
      const r = await h.callWS({ type: 'loggia/presence/config', patch });
      if (vivant.current && r && r.config) setEtat(e => (e ? { ...e, config: r.config } : e));
    } catch (e) {
      setErr((e && (e.message || e.code)) || tr('Enregistrement impossible.'));
    }
  };

  const gens = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states).filter(id => id.indexOf('person.') === 0)
      .map(id => ({ id, nom: cvName(hass.states[id], id) }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [hass]);
  const alarmes = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states).filter(id => id.indexOf('alarm_control_panel.') === 0)
      .map(id => ({ id, nom: cvName(hass.states[id], id) }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [hass]);

  if (!cfg) {
    return (
      <div style={cardSt}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{tr('Départ et retour')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {err || tr('Chargement…')}
        </div>
      </div>
    );
  }

  const dep = cfg.depart || {};
  const ret = cfg.retour || {};
  const chauf = dep.chauffage || {};
  const alarme = dep.alarme || {};
  const suivies = cfg.personnes || [];

  const titre = { fontSize: 15, fontWeight: 700 };
  const sous = { fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 };
  const label = { fontSize: 12, fontWeight: 700 };
  const ligne = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 };
  const puce = (on) => ({ padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text2)' });
  const champ = { padding: '8px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 };

  const Bascule = ({ on, cb }) => (
    <button onClick={cb} style={{ width: 46, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 2, background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--o-text3)' }} />
    </button>
  );

  const Rangee = ({ nom, desc, on, cb }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{nom}</span>
        {desc ? <span style={{ display: 'block', fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 2 }}>{desc}</span> : null}
      </span>
      <Bascule on={on} cb={cb} />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardSt}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={titre}>{tr('Départ et retour')}</div>
            <div style={sous}>{tr('Quand la dernière personne s’en va, la maison se met en veille. Elle se réveille au retour.')}</div>
          </div>
          <Bascule on={!!cfg.actif} cb={() => enregistrer({ actif: !cfg.actif })} />
        </div>
        {etat.dehors && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: 'var(--o-accent-soft)' }}>{tr('Maison en veille en ce moment.')}</div>
        )}
        {etat.en_attente && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: 'var(--o-warn2)' }}>{tr('Décompte de départ en cours.')}</div>
        )}
        {cfg.actif && (
          <>
            <div style={ligne}>
              <span style={{ ...label, minWidth: 88 }}>{tr('Attendre')}</span>
              <input type="number" value={cfg.delai_depart != null ? cfg.delai_depart : 5} min={0} max={60}
                onChange={e => enregistrer({ delai_depart: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
                style={{ ...champ, width: 74 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>
                {tr('min — un téléphone qui accroche une autre antenne ne doit pas vider la maison')}
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ ...label, marginBottom: 7 }}>{tr('Qui compte')}</div>
              {gens.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
                  {tr('Aucune personne dans Home Assistant. Sans personne suivie, la règle ne se déclenche jamais.')}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {gens.map(g => {
                  const on = suivies.indexOf(g.id) >= 0;
                  return (
                    <button key={g.id} onClick={() => enregistrer({ personnes: on ? suivies.filter(x => x !== g.id) : [...suivies, g.id] })}
                      style={puce(on)}>{g.nom}</button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {cfg.actif && (
        <div style={cardSt}>
          <div style={titre}>{tr('En partant')}</div>
          <div style={{ marginTop: 8 }}>
            <Rangee nom={tr('Éteindre les lumières')} desc={tr('Celles qui étaient déjà éteintes ne se rallumeront pas au retour.')}
              on={!!dep.lumieres} cb={() => enregistrer({ depart: { lumieres: !dep.lumieres } })} />
            <Rangee nom={tr('Baisser le chauffage')} desc={chauf.actif ? tr('Consigne d’absence, puis retour au confort.') : ''}
              on={!!chauf.actif} cb={() => enregistrer({ depart: { chauffage: { actif: !chauf.actif } } })} />
            {chauf.actif && (
              <div style={{ ...ligne, marginTop: 4, paddingBottom: 8 }}>
                <span style={{ ...label, minWidth: 88 }}>{tr('Absence')}</span>
                <input type="number" value={chauf.consigne != null ? chauf.consigne : 17} min={5} max={25} step={0.5}
                  onChange={e => enregistrer({ depart: { chauffage: { consigne: Number(e.target.value) || 17 } } })}
                  style={{ ...champ, width: 74 }} />
                <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>°C</span>
                <span style={{ ...label, minWidth: 56, marginLeft: 8 }}>{tr('Confort')}</span>
                <input type="number" value={chauf.confort != null ? chauf.confort : 20} min={10} max={28} step={0.5}
                  onChange={e => enregistrer({ depart: { chauffage: { confort: Number(e.target.value) || 20 } } })}
                  style={{ ...champ, width: 74 }} />
                <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>°C</span>
              </div>
            )}
            <Rangee nom={tr('Armer l’alarme')} desc={alarmes.length === 0 ? tr('Aucune alarme trouvée.') : ''}
              on={!!alarme.actif} cb={() => enregistrer({ depart: { alarme: { actif: !alarme.actif, entite: alarme.entite || (alarmes[0] && alarmes[0].id) || '' } } })} />
            {alarme.actif && alarmes.length > 0 && (
              <div style={{ ...ligne, marginTop: 4, paddingBottom: 8 }}>
                <select value={alarme.entite || ''} onChange={e => enregistrer({ depart: { alarme: { entite: e.target.value } } })} style={champ}>
                  {alarmes.map(a => <option key={a.id} value={a.id}>{a.nom}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[['away', tr('Absent')], ['home', tr('Présent')], ['night', tr('Nuit')]].map(([id, nom]) => (
                    <button key={id} onClick={() => enregistrer({ depart: { alarme: { mode: id } } })}
                      style={puce((alarme.mode || 'away') === id)}>{nom}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {cfg.actif && (
        <div style={cardSt}>
          <div style={titre}>{tr('Au retour')}</div>
          <div style={{ marginTop: 8 }}>
            <Rangee nom={tr('Rallumer les lumières')} desc={tr('Seulement celles que Loggia a éteintes en partant.')}
              on={!!ret.lumieres} cb={() => enregistrer({ retour: { lumieres: !ret.lumieres } })} />
            {ret.lumieres && (
              <Rangee nom={tr('Seulement s’il fait nuit')} desc={tr('Rentrer à quinze heures ne doit pas rallumer le salon.')}
                on={ret.seulement_la_nuit !== false} cb={() => enregistrer({ retour: { seulement_la_nuit: ret.seulement_la_nuit === false } })} />
            )}
            <Rangee nom={tr('Remettre le chauffage')} desc={tr('À la consigne de confort réglée plus haut.')}
              on={!!ret.chauffage} cb={() => enregistrer({ retour: { chauffage: !ret.chauffage } })} />
          </div>
          {/* Le désarmement à part, avec son avertissement : cette case ne
            * doit pas se cocher distraitement au milieu des autres. */}
          {alarme.actif && (
            <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: 'rgba(var(--o-warn2-rgb),.10)', border: 'var(--o-bw,1px) solid rgba(var(--o-warn2-rgb),.30)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--o-warn2)' }}>{tr('Désarmer l’alarme au retour')}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 3 }}>
                    {tr('Armer parce que la maison se vide est sans risque. La désarmer parce qu’un téléphone approche en est un : qui tient ce téléphone entre dans une maison ouverte.')}
                  </span>
                </span>
                <Bascule on={!!ret.desarmer} cb={() => enregistrer({ retour: { desarmer: !ret.desarmer } })} />
              </div>
            </div>
          )}
        </div>
      )}

      {etat.journal && etat.journal.length > 0 && (
        <div style={cardSt}>
          <div style={titre}>{tr('Derniers passages')}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
            {etat.journal.slice(0, 8).map((j, i) => (
              <div key={j.ts + '' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', fontSize: 12, fontWeight: 600 }}>
                <span>{j.quoi === 'depart' ? tr('départ') : tr('retour')} · <span style={{ color: 'var(--o-text3)' }}>{(j.detail || []).join(', ')}</span></span>
                <span style={{ color: 'var(--o-text3)', flexShrink: 0 }}>{new Date(j.ts * 1000).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
    </div>
  );
}

export default PresenceReglages;
