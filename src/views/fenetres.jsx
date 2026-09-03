/* Fenêtre ouverte, chauffage coupé : le réglage, pièce par pièce.
 *
 * Rien à saisir : les pièces viennent des zones de Home Assistant, les
 * ouvrants de leur `device_class`, les chauffages de leur domaine. Activer une
 * pièce la remplit toute seule ; les cases servent à retrancher, pas à
 * construire.
 *
 * Le travail est fait par le serveur (`fenetres.py`) : la règle tient dashboard
 * fermé, ce qui est le minimum pour un radiateur.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { LOGGIA_INDEX } from '../state.js';
import { cvName } from '../ui.jsx';
import { tr } from '../i18n.js';

/* Ce qui compte comme ouvrant : Home Assistant le dit lui-même dans la
 * `device_class`, plutôt que de le deviner sur le nom de l'entité. */
const CLASSES_OUVRANT = ['window', 'door', 'garage_door', 'opening'];

const estOuvrant = (id, st) => id.indexOf('binary_sensor.') === 0
  && CLASSES_OUVRANT.indexOf(((st && st.attributes) || {}).device_class) >= 0;

/* Ce qui peut chauffer : un thermostat, ou une prise commandée. On propose,
 * l'utilisateur tranche — une prise peut aussi bien piloter une lampe. */
const estChauffage = (id) => id.indexOf('climate.') === 0 || id.indexOf('switch.') === 0;

/* Ce qu'on coche TOUT SEUL en activant une pièce. Un thermostat ne fait aucun
 * doute. Une prise, si : elle peut piloter une lampe. On ne retient donc que
 * celles dont le nom l'annonce — beaucoup d'installations chauffent au fil
 * pilote, et n'ont que des `switch`. Le choix reste corrigeable d'un clic. */
const MOTS_CHAUFFAGE = /radiateur|chauffage|chauffe|convecteur|s[ée]che[- ]serviette|heater|radiator/i;

const chauffeSurement = (id, nom) => id.indexOf('climate.') === 0 || MOTS_CHAUFFAGE.test(nom || id);

export function FenetresReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState('');
  const vivant = useRef(true);

  useEffect(() => {
    vivant.current = true;
    if (!h) { setErr(tr('Home Assistant n’est pas joignable.')); return undefined; }
    const lire = () => h.callWS({ type: 'loggia/fenetres/etat' })
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
      const n = { ...e.config, ...patch };
      if (patch.pieces) {
        n.pieces = { ...(e.config.pieces || {}) };
        for (const nom of Object.keys(patch.pieces)) {
          if (patch.pieces[nom] === null) delete n.pieces[nom];
          else n.pieces[nom] = { ...(n.pieces[nom] || {}), ...patch.pieces[nom] };
        }
      }
      return { ...e, config: n };
    });
    try {
      const r = await h.callWS({ type: 'loggia/fenetres/config', patch });
      if (vivant.current && r && r.config) setEtat(e => (e ? { ...e, config: r.config } : e));
    } catch (e) {
      setErr((e && (e.message || e.code)) || tr('Enregistrement impossible.'));
    }
  };

  /* Les pièces candidates : celles qui ont au moins un ouvrant. Une pièce sans
   * capteur d'ouverture n'a rien à offrir à cette règle. */
  const pieces = useMemo(() => {
    const S = (hass && hass.states) || {};
    const zones = (LOGGIA_INDEX && LOGGIA_INDEX.areaList) || [];
    return zones.map(z => ({
      nom: z.name,
      ouvrants: (z.entities || []).filter(id => estOuvrant(id, S[id])),
      chauffages: (z.entities || []).filter(id => estChauffage(id) && S[id]),
    })).filter(z => z.ouvrants.length > 0);
  }, [hass]);

  if (!cfg) {
    return (
      <div style={cardSt}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{tr('Fenêtre ouverte')}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {err || tr('Chargement…')}
        </div>
      </div>
    );
  }

  const reglees = cfg.pieces || {};
  const titre = { fontSize: 16, fontWeight: 700 };
  const sous = { fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 };
  const label = { fontSize: 12.5, fontWeight: 700 };
  const puce = (on) => ({ padding: '6px 11px', borderRadius: 9, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: on ? 'var(--o-accent)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text2)' });

  const Bascule = ({ on, cb }) => (
    <button onClick={cb} style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 3, background: on ? 'var(--o-accent)' : 'var(--o-s1)', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', background: on ? '#fff' : 'var(--o-text3)' }} />
    </button>
  );

  /* Deux nombres dans une meme phrase, chacun avec son accord : une seule cle
   * aurait donne « 1 ouvrants ». */
  const compte = (n, un, plusieurs) => (n > 1 ? tr(plusieurs, { n }) : tr(un, { n }));

  const nomDe = (id) => {
    const st = hass && hass.states && hass.states[id];
    return st ? cvName(st, id) : id;
  };

  /* Activer une pièce la remplit : tous ses ouvrants, et ses thermostats s'il
   * y en a — sinon rien, pour ne pas couper une prise au hasard. */
  const basculerPiece = (p) => {
    const dejaLa = reglees[p.nom];
    if (dejaLa && dejaLa.actif) {
      enregistrer({ pieces: { [p.nom]: { actif: false } } });
      return;
    }
    const surs = p.chauffages.filter(id => chauffeSurement(id, nomDe(id)));
    enregistrer({ pieces: { [p.nom]: {
      actif: true,
      ouvrants: (dejaLa && dejaLa.ouvrants && dejaLa.ouvrants.length) ? dejaLa.ouvrants : p.ouvrants,
      chauffages: (dejaLa && dejaLa.chauffages && dejaLa.chauffages.length) ? dejaLa.chauffages : surs,
    } } });
  };

  const basculerEntite = (nomPiece, champ, id, liste) => {
    const dedans = liste.indexOf(id) >= 0;
    enregistrer({ pieces: { [nomPiece]: { [champ]: dedans ? liste.filter(x => x !== id) : [...liste, id] } } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={cardSt}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={titre}>{tr('Fenêtre ouverte, chauffage coupé')}</div>
            <div style={sous}>{tr('Chauffer une pièce dont la fenêtre est ouverte, c’est chauffer la rue.')}</div>
          </div>
          <Bascule on={!!cfg.actif} cb={() => enregistrer({ actif: !cfg.actif })} />
        </div>
        {cfg.actif && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
            <span style={{ ...label, minWidth: 92 }}>{tr('Après')}</span>
            <input type="number" value={cfg.delai != null ? cfg.delai : 3} min={0} max={60}
              onChange={e => enregistrer({ delai: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })}
              style={{ width: 78, padding: '9px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 }} />
            <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>
              {tr('min d’ouverture — le temps d’aérer sans que le radiateur s’arrête pour rien')}
            </span>
          </div>
        )}
        {etat.en_attente && etat.en_attente.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--o-warn2)' }}>
            {tr('Décompte en cours : {p}', { p: etat.en_attente.join(', ') })}
          </div>
        )}
        {Object.keys(etat.coupes || {}).length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: 'var(--o-accent-soft)' }}>
            {tr('Chauffage coupé : {p}', { p: Object.keys(etat.coupes).join(', ') })}
          </div>
        )}
      </div>

      {cfg.actif && pieces.length === 0 && (
        <div style={cardSt}>
          <div style={{ fontSize: 12.5, color: 'var(--o-text3)', fontWeight: 600 }}>
            {tr('Aucune pièce avec un capteur d’ouverture. Range tes capteurs dans une zone Home Assistant : la détection s’appuie dessus.')}
          </div>
        </div>
      )}

      {cfg.actif && pieces.map(p => {
        const reg = reglees[p.nom] || null;
        const on = !!(reg && reg.actif);
        const mesOuvrants = (reg && reg.ouvrants) || [];
        const mesChauffages = (reg && reg.chauffages) || [];
        return (
          <div key={p.nom} style={cardSt}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 800 }}>{p.nom}</div>
                <div style={sous}>
                  {compte(p.ouvrants.length, '{n} ouvrant', '{n} ouvrants')}
                  {' · '}
                  {compte(p.chauffages.length, '{n} chauffage possible', '{n} chauffages possibles')}
                </div>
              </div>
              <Bascule on={on} cb={() => basculerPiece(p)} />
            </div>
            {on && (
              <>
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...label, marginBottom: 7 }}>{tr('Surveiller')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {p.ouvrants.map(id => (
                      <button key={id} onClick={() => basculerEntite(p.nom, 'ouvrants', id, mesOuvrants)}
                        style={puce(mesOuvrants.indexOf(id) >= 0)}>{nomDe(id)}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: 13 }}>
                  <div style={{ ...label, marginBottom: 7 }}>{tr('Couper')}</div>
                  {p.chauffages.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
                      {tr('Aucun thermostat ni prise dans cette zone.')}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {p.chauffages.map(id => (
                      <button key={id} onClick={() => basculerEntite(p.nom, 'chauffages', id, mesChauffages)}
                        style={puce(mesChauffages.indexOf(id) >= 0)}>{nomDe(id)}</button>
                    ))}
                  </div>
                  {mesChauffages.length === 0 && (
                    <div style={{ fontSize: 11.5, color: 'var(--o-warn2)', fontWeight: 700, marginTop: 7 }}>
                      {tr('Rien à couper : choisis au moins un appareil.')}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {etat.journal && etat.journal.length > 0 && (
        <div style={cardSt}>
          <div style={titre}>{tr('Dernières coupures')}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
            {etat.journal.slice(0, 8).map((j, i) => (
              <div key={j.ts + '' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', fontSize: 12.5, fontWeight: 600 }}>
                <span>{j.quoi === 'couper' ? tr('coupé') : tr('rendu')} · <span style={{ color: 'var(--o-text3)' }}>{j.piece}</span></span>
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

export default FenetresReglages;
