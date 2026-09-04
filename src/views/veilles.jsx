/* Trois veilles : l'air, les piles, le tarif.
 *
 * Elles n'ont qu'une chose à dire, et une seule façon de la dire : le service
 * de notification déjà choisi dans Paramètres › Alertes. La page le vérifie et
 * le signale en tête plutôt que de laisser régler des seuils qui ne
 * préviendront personne.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { cvName } from '../ui.jsx';
import { tr } from '../i18n.js';

export function VeillesReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState('');
  const vivant = useRef(true);

  useEffect(() => {
    vivant.current = true;
    if (!h) { setErr(tr('Home Assistant n’est pas joignable.')); return undefined; }
    const lire = () => h.callWS({ type: 'loggia/veilles/etat' })
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
      const n = { ...e.config };
      for (const k of Object.keys(patch)) n[k] = { ...(n[k] || {}), ...patch[k] };
      return { ...e, config: n };
    });
    try {
      const r = await h.callWS({ type: 'loggia/veilles/config', patch });
      if (vivant.current && r && r.config) setEtat(e => (e ? { ...e, config: r.config } : e));
    } catch (e) {
      setErr((e && (e.message || e.code)) || tr('Enregistrement impossible.'));
    }
  };

  const nomDe = (id) => {
    const st = hass && hass.states && hass.states[id];
    return st ? cvName(st, id) : id;
  };

  const commandables = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states)
      .filter(id => id.indexOf('switch.') === 0 || id.indexOf('fan.') === 0)
      .map(id => ({ id, nom: cvName(hass.states[id], id) }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [hass]);

  const tarifs = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states)
      .filter(id => id.indexOf('sensor.') === 0 || id.indexOf('binary_sensor.') === 0
        || id.indexOf('select.') === 0)
      .map(id => ({ id, nom: cvName(hass.states[id], id) }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [hass]);

  if (!cfg) {
    return (
      <div style={cardSt}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{tr('Veilles')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {err || tr('Chargement…')}
        </div>
      </div>
    );
  }

  const co2 = cfg.co2 || {};
  const bat = cfg.batterie || {};
  const cr = cfg.creuses || {};

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

  const Entete = ({ nom, desc, on, cb }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={titre}>{nom}</div>
        <div style={sous}>{desc}</div>
      </div>
      <Bascule on={!!on} cb={cb} />
    </div>
  );

  const Choix = ({ liste, retenues, champNom, section }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {liste.map(x => {
        const on = (retenues || []).indexOf(x.id) >= 0;
        return (
          <button key={x.id}
            onClick={() => enregistrer({ [section]: { [champNom]: on ? retenues.filter(y => y !== x.id) : [...(retenues || []), x.id] } })}
            style={puce(on)}>{x.nom}</button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Sans service de notification, ces trois veilles n'ont personne à qui
        * parler : autant le dire avant de faire régler des seuils. */}
      {etat.notification === false && (
        <div style={{ ...cardSt, background: 'rgba(var(--o-warn2-rgb),.10)', border: 'var(--o-bw,1px) solid rgba(var(--o-warn2-rgb),.30)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--o-warn2)' }}>{tr('Personne n’écoute')}</div>
          <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 3 }}>
            {tr('Ces veilles préviennent par le service choisi dans Paramètres › Alertes. Tant qu’aucun n’est choisi, elles ne diront rien à personne.')}
          </div>
        </div>
      )}

      {/* ── L'air ── */}
      <div style={cardSt}>
        <Entete nom={tr('Air vicié')}
          desc={tr('Au-delà de 1000 à 1200 ppm on dort mal et on pense moins bien. Personne ne consulte un capteur de CO2 : il faut qu’il vienne le dire.')}
          on={co2.actif} cb={() => enregistrer({ co2: { actif: !co2.actif } })} />
        {co2.actif && (
          <>
            <div style={ligne}>
              <span style={{ ...label, minWidth: 68 }}>{tr('Au-delà de')}</span>
              <input type="number" value={co2.seuil != null ? co2.seuil : 1200} min={400} max={3000} step={50}
                onChange={e => enregistrer({ co2: { seuil: Math.max(400, Math.min(3000, Number(e.target.value) || 1200)) } })}
                style={{ ...champ, width: 88 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>ppm</span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ ...label, marginBottom: 4 }}>{tr('Quels capteurs')}</div>
              <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 8 }}>
                {(etat.capteurs_co2 || []).length === 0
                  ? tr('Aucun capteur de CO2 trouvé.')
                  : tr('Sans choix, tous les capteurs de CO2 sont surveillés.')}
              </div>
              <Choix liste={(etat.capteurs_co2 || []).map(id => ({ id, nom: nomDe(id) }))}
                retenues={co2.capteurs} champNom="capteurs" section="co2" />
            </div>
            {commandables.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ ...label, marginBottom: 8 }}>{tr('Et lancer, si tu veux')}</div>
                <Choix liste={commandables} retenues={co2.ventilation} champNom="ventilation" section="co2" />
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Les piles ── */}
      <div style={cardSt}>
        <Entete nom={tr('Piles faibles')}
          desc={tr('Un détecteur à plat ne prévient pas qu’il est à plat : il se tait, et on croit la porte fermée.')}
          on={bat.actif} cb={() => enregistrer({ batterie: { actif: !bat.actif } })} />
        {bat.actif && (
          <>
            <div style={ligne}>
              <span style={{ ...label, minWidth: 68 }}>{tr('En dessous de')}</span>
              <input type="number" value={bat.seuil != null ? bat.seuil : 15} min={1} max={50}
                onChange={e => enregistrer({ batterie: { seuil: Math.max(1, Math.min(50, Number(e.target.value) || 15)) } })}
                style={{ ...champ, width: 74 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>%</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 10 }}>
              {(etat.capteurs_batterie || []).length > 1
                ? tr('{n} capteurs de batterie surveillés, vérifiés une fois par heure.', { n: etat.capteurs_batterie.length })
                : tr('{n} capteur de batterie surveillé, vérifié une fois par heure.', { n: (etat.capteurs_batterie || []).length })}
            </div>
          </>
        )}
      </div>

      {/* ── Le tarif ── */}
      <div style={cardSt}>
        <Entete nom={tr('Heures creuses')}
          desc={tr('Le lave-vaisselle attend souvent qu’on y pense.')}
          on={cr.actif} cb={() => enregistrer({ creuses: { actif: !cr.actif } })} />
        {cr.actif && (
          <>
            <div style={ligne}>
              <span style={{ ...label, minWidth: 68 }}>{tr('L’entité')}</span>
              <select value={cr.entite || ''} onChange={e => enregistrer({ creuses: { entite: e.target.value } })}
                style={{ ...champ, maxWidth: 300 }}>
                <option value="">{tr('Choisir…')}</option>
                {tarifs.map(t => <option key={t.id} value={t.id}>{t.nom}</option>)}
              </select>
            </div>
            <div style={ligne}>
              <span style={{ ...label, minWidth: 68 }}>{tr('Vaut')}</span>
              <input type="text" value={cr.valeur || ''} placeholder="HC"
                onChange={e => enregistrer({ creuses: { valeur: e.target.value } })}
                style={{ ...champ, width: 120 }} spellCheck={false} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>
                {cr.entite && hass && hass.states && hass.states[cr.entite]
                  ? tr('en ce moment : {v}', { v: hass.states[cr.entite].state })
                  : tr('l’état qui signifie « heures creuses »')}
              </span>
            </div>
            {commandables.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ ...label, marginBottom: 4 }}>{tr('Et allumer, si tu veux')}</div>
                <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 8 }}>
                  {tr('Une prise n’est pas une machine chargée : la notification reste le plus sûr.')}
                </div>
                <Choix liste={commandables} retenues={cr.prises} champNom="prises" section="creuses" />
              </div>
            )}
          </>
        )}
      </div>

      {etat.journal && etat.journal.length > 0 && (
        <div style={cardSt}>
          <div style={titre}>{tr('Derniers signalements')}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
            {etat.journal.slice(0, 8).map((j, i) => (
              <div key={j.ts + '' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', fontSize: 12, fontWeight: 600 }}>
                <span>{nomDe(j.entite)} <span style={{ color: 'var(--o-text3)' }}>{j.valeur != null ? '· ' + Math.round(j.valeur) : ''}</span></span>
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

export default VeillesReglages;
