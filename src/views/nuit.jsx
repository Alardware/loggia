/* La nuit : une veilleuse qui s'éteint seule, et les lampes oubliées.
 *
 * Le serveur (`nuit.py`) tient les deux règles. Une note d'interface : la page
 * dit quelles lampes savent vraiment faire un fondu. Promettre à l'écran un
 * fondu que la lampe ne tiendra pas est pire que de ne pas le proposer.
 */
import {
  useMemo
} from 'react';
import { cvName, RegleEntete, usePli , useEtatServeur } from '../ui.jsx';
import { tr } from '../i18n.js';

// Le bit TRANSITION de Home Assistant : une lampe qui ne l'a pas ne sait pas
// s'éteindre en fondu.
const LIGHT_TRANSITION = 32;

const JOURS_NUIT = () => [tr('lun'), tr('mar'), tr('mer'), tr('jeu'), tr('ven'), tr('sam'), tr('dim')];

export function NuitReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const { etat, setEtat, err, setErr, vivant } =
    useEtatServeur(hass, 'loggia/nuit/etat', 5000, tr('Réglages indisponibles.'));
  /* Un pli par regle — avec les autres etats : un hook ne vit pas apres
   * un retour conditionnel. */
  const [pliVeilleuse, plierVeilleuse] = usePli('nuit:veilleuse');
  const [pliCoucher, plierCoucher] = usePli('nuit:coucher');


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
      const r = await h.callWS({ type: 'loggia/nuit/config', patch });
      if (vivant.current && r && r.config) setEtat(e => (e ? { ...e, config: r.config } : e));
    } catch (e) {
      setErr((e && (e.message || e.code)) || tr('Enregistrement impossible.'));
    }
  };

  const lampes = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states)
      .filter(id => id.indexOf('light.') === 0)
      .map(id => {
        const st = hass.states[id];
        const f = ((st && st.attributes) || {}).supported_features || 0;
        return { id, nom: cvName(st, id), fondu: !!(Number(f) & LIGHT_TRANSITION) };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [hass]);

  if (!cfg) {
    return (
      <div style={cardSt}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{tr('La nuit')}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {err || tr('Chargement…')}
        </div>
      </div>
    );
  }

  const v = cfg.veilleuse || {};
  const c = cfg.coucher || {};
  const mesLampes = v.lampes || [];
  const epargnees = c.sauf || [];

  const titre = { fontSize: 15, fontWeight: 700 };
  const label = { fontSize: 12, fontWeight: 700 };
  const ligne = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 };
  const puce = (on) => ({ padding: '6px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text2)' });
  const champ = { padding: '8px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 };


  // Le fondu ne tient que si la lampe sait le faire : on le dit plutôt que de
  // laisser croire à un réglage sans effet.
  const choisies = lampes.filter(l => mesLampes.indexOf(l.id) >= 0);
  const sansFondu = choisies.filter(l => !l.fondu);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── La veilleuse ── */}
      <div style={cardSt}>
        <RegleEntete nom={tr('Veilleuse')}
          desc={tr('Allumée le soir, elle s’éteint toute seule après le délai réglé.')}
          on={v.actif} cb={() => enregistrer({ veilleuse: { actif: !v.actif } })} plie={pliVeilleuse} onPlier={plierVeilleuse} zone="nuit-veilleuse" />
        {etat.en_cours && etat.en_cours.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: 'var(--o-warn2)' }}>
            {tr('Décompte en cours.')}
          </div>
        )}
        {v.actif && !pliVeilleuse && (
          <div id="nuit-veilleuse">
            <div style={ligne}>
              <span style={{ ...label, minWidth: 78 }}>{tr('S’éteint après')}</span>
              <input aria-label={tr('Extinction après, en minutes')} type="number" value={v.duree != null ? v.duree : 30} min={0} max={240}
                onChange={e => enregistrer({ veilleuse: { duree: Math.max(0, Math.min(240, Number(e.target.value) || 0)) } })}
                style={{ ...champ, width: 74 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>{tr('min')}</span>
            </div>
            <div style={ligne}>
              <span style={{ ...label, minWidth: 78 }}>{tr('En fondu sur')}</span>
              <input aria-label={tr('Durée du fondu, en minutes')} type="number" value={v.fondu != null ? v.fondu : 5} min={0} max={30}
                onChange={e => enregistrer({ veilleuse: { fondu: Math.max(0, Math.min(30, Number(e.target.value) || 0)) } })}
                style={{ ...champ, width: 74 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>{tr('min — 0 pour une extinction franche')}</span>
            </div>
            {v.fondu > 0 && sansFondu.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--o-warn2)' }}>
                {sansFondu.length > 1
                  ? tr('{n} de ces lampes ne savent pas faire de fondu : elles s’éteindront franchement.', { n: sansFondu.length })
                  : tr('Une de ces lampes ne sait pas faire de fondu : elle s’éteindra franchement.')}
              </div>
            )}
            <div style={ligne}>
              <span style={{ ...label, minWidth: 78 }}>{tr('À partir de')}</span>
              <input aria-label={tr('Veilleuse active à partir de')} type="time" value={v.depuis || '19:00'}
                onChange={e => enregistrer({ veilleuse: { depuis: e.target.value } })}
                style={{ ...champ, width: 116 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>
                {tr('la règle ne s’applique pas en journée')}
              </span>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ ...label, marginBottom: 7 }}>{tr('Quelles lampes')}</div>
              {lampes.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Aucune lampe trouvée.')}</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {lampes.map(l => {
                  const on = mesLampes.indexOf(l.id) >= 0;
                  return (
                    <button key={l.id} title={l.fondu ? tr('Sait faire un fondu') : tr('Ne sait pas faire de fondu')}
                      onClick={() => enregistrer({ veilleuse: { lampes: on ? mesLampes.filter(x => x !== l.id) : [...mesLampes, l.id] } })}
                      style={puce(on)}>{l.nom}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Les lampes oubliées ── */}
      <div style={cardSt}>
        <RegleEntete nom={tr('Extinction du soir')}
          desc={tr('À l’heure dite, ce qui traîne encore allumé s’éteint.')}
          on={c.actif} cb={() => enregistrer({ coucher: { actif: !c.actif } })} plie={pliCoucher} onPlier={plierCoucher} zone="nuit-coucher" />
        {c.actif && !pliCoucher && (
          <div id="nuit-coucher">
            <div style={ligne}>
              <span style={{ ...label, minWidth: 78 }}>{tr('À')}</span>
              <input aria-label={tr('Heure d’extinction')} type="time" value={c.heure || '23:30'}
                onChange={e => enregistrer({ coucher: { heure: e.target.value } })}
                style={{ ...champ, width: 116 }} />
            </div>
            <div style={{ marginTop: 13 }}>
              <div style={{ ...label, marginBottom: 7 }}>{tr('Les jours')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {JOURS_NUIT().map((j, i) => {
                  const actifs = Array.isArray(c.jours) ? c.jours : [0, 1, 2, 3, 4, 5, 6];
                  const on = actifs.indexOf(i) >= 0;
                  return (
                    <button key={j} onClick={() => enregistrer({ coucher: { jours: on ? actifs.filter(x => x !== i) : [...actifs, i].sort() } })}
                      style={{ ...puce(on), minWidth: 44, textAlign: 'center' }}>{j}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ ...label, marginBottom: 4 }}>{tr('Sauf celles-ci')}</div>
              <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 8 }}>
                {tr('La veilleuse d’une chambre a rarement sa place ici.')}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {lampes.map(l => {
                  const on = epargnees.indexOf(l.id) >= 0;
                  return (
                    <button key={l.id}
                      onClick={() => enregistrer({ coucher: { sauf: on ? epargnees.filter(x => x !== l.id) : [...epargnees, l.id] } })}
                      style={puce(on)}>{l.nom}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {etat.journal && etat.journal.length > 0 && (
        <div style={cardSt}>
          <div style={titre}>{tr('Dernières extinctions')}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
            {etat.journal.slice(0, 8).map((j, i) => (
              <div key={j.ts + '' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', fontSize: 12, fontWeight: 600 }}>
                <span>{j.quoi === 'veilleuse' ? tr('veilleuse') : tr('extinction du soir')} · <span style={{ color: 'var(--o-text3)' }}>{(j.entites || []).length}</span></span>
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

export default NuitReglages;
