/* Volets : régler ce que Loggia fait tout seul.
 *
 * Trois règles, chacune débrayable, tenues par le composant serveur — pas par
 * cette page. Elles continuent donc de tourner dashboard fermé, ce qui est
 * bien le moins pour un volet qui doit descendre au coucher du soleil.
 *
 * L'orientation se donne par point cardinal plutôt qu'en degrés : personne ne
 * sait que sa façade regarde à 232°, tout le monde sait qu'elle donne au
 * sud-ouest. Le serveur, lui, travaille en degrés.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { BottomSheet, EntPicker, cvName } from '../ui.jsx';
import { tr } from '../i18n.js';

const CARDINAUX = () => [
  { deg: 0, court: 'N' },
  { deg: 45, court: 'NE' },
  { deg: 90, court: 'E' },
  { deg: 135, court: 'SE' },
  { deg: 180, court: 'S' },
  { deg: 225, court: 'SO' },
  { deg: 270, court: 'O' },
  { deg: 315, court: 'NO' },
];

// Nomme ainsi, et non `JOURS`, pour ne pas se confondre avec le tableau du
// meme nom dans meteo.jsx : l un s appelle, l autre s indexe.
const JOURS_COURTS = () => [tr('lun'), tr('mar'), tr('mer'), tr('jeu'), tr('ven'), tr('sam'), tr('dim')];

/* Le point cardinal le plus proche d'un azimut — pour relire ce que le serveur
 * a stocké en degrés sans imposer une valeur pile sur un axe. */
function cardinalDe(deg) {
  if (deg == null) return null;
  let meilleur = null;
  let ecart = 999;
  for (const c of CARDINAUX()) {
    const d = Math.abs(((c.deg - deg + 540) % 360) - 180);
    if (d < ecart) { ecart = d; meilleur = c; }
  }
  return meilleur;
}

/* Fusion locale, miroir de celle du serveur : une section reçoit un patch
 * partiel, le reste de la section survit. */
function fusion(cfg, patch) {
  const n = { ...cfg };
  for (const section of Object.keys(patch || {})) {
    n[section] = { ...(cfg[section] || {}), ...patch[section] };
  }
  return n;
}

export function VoletsReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState('');
  const [picker, setPicker] = useState(null);   // { section, champ, domaines }
  const vivant = useRef(true);

  useEffect(() => {
    vivant.current = true;
    if (!h) { setErr(tr('Home Assistant n’est pas joignable.')); return undefined; }
    const lire = () => h.callWS({ type: 'loggia/volets/etat' })
      .then(r => { if (vivant.current) { setEtat(r); setErr(''); } })
      .catch(e => { if (vivant.current) setErr((e && (e.message || e.code)) || tr('Réglages indisponibles.')); });
    lire();
    const t = setInterval(lire, 5000);
    return () => { vivant.current = false; clearInterval(t); };
  }, [!!h]);

  const cfg = (etat && etat.config) || null;

  const enregistrer = async (patch) => {
    if (!h || !cfg) return;
    // On rend la main tout de suite : le sondage remettrait la vieille valeur
    // le temps de l'aller-retour, et la bascule reviendrait en arrière sous
    // le doigt.
    setEtat(e => (e ? { ...e, config: fusion(e.config, patch) } : e));
    try {
      const r = await h.callWS({ type: 'loggia/volets/config', patch });
      if (vivant.current && r && r.config) setEtat(e => (e ? { ...e, config: r.config } : e));
    } catch (e) {
      setErr((e && (e.message || e.code)) || tr('Enregistrement impossible.'));
    }
  };

  const covers = useMemo(() => {
    if (!hass || !hass.states) return [];
    return Object.keys(hass.states)
      .filter(id => id.indexOf('cover.') === 0)
      .map(id => ({ id, nom: cvName(hass.states[id], id) }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }, [hass]);

  if (!cfg) {
    return (
      <div style={cardSt}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{tr('Volets')}</div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: err ? 'var(--o-bad)' : 'var(--o-text3)' }}>
          {err || tr('Chargement…')}
        </div>
      </div>
    );
  }

  const plan = cfg.planning || {};
  const sol = cfg.soleil || {};
  const vent = cfg.vent || {};
  const titre = { fontSize: 16, fontWeight: 700 };
  const sous = { fontSize: 12.5, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 };
  const label = { fontSize: 12.5, fontWeight: 700, marginBottom: 6 };
  const ligne = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 };
  const puce = (on) => ({ padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, border: 'none', background: on ? 'var(--o-accent)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' });
  const champ = { padding: '9px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600 };

  const Bascule = ({ on, cb }) => (
    <button onClick={cb} style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0, padding: 3, background: on ? 'var(--o-accent)' : 'var(--o-s1)', display: 'flex', justifyContent: on ? 'flex-end' : 'flex-start' }}>
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

  const Nombre = ({ v, min, max, pas = 1, unite, cb }) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <input type="number" value={v} min={min} max={max} step={pas}
        onChange={e => cb(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
        style={{ ...champ, width: 78 }} />
      <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>{unite}</span>
    </span>
  );

  const choisirEntite = (section, champNom, domaines) => setPicker({ section, champ: champNom, domaines });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ── Le planning ── */}
      <div style={cardSt}>
        <Entete nom={tr('Lever et coucher du soleil')}
          desc={tr('Ouvrir le matin, fermer le soir, aux heures réelles du soleil chez toi.')}
          on={plan.actif} cb={() => enregistrer({ planning: { actif: !plan.actif } })} />
        {plan.actif && (
          <>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Ouverture')}</span>
              <Nombre v={(plan.ouverture || {}).decalage || 0} min={-120} max={120} unite={tr('min après le lever')}
                cb={n => enregistrer({ planning: { ouverture: { decalage: n } } })} />
            </div>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Fermeture')}</span>
              <Nombre v={(plan.fermeture || {}).decalage || 0} min={-120} max={120} unite={tr('min après le coucher')}
                cb={n => enregistrer({ planning: { fermeture: { decalage: n } } })} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginTop: 7 }}>
              {tr('Un nombre négatif avance l’heure : −30 ferme une demi-heure avant le coucher.')}
            </div>
            <div style={{ marginTop: 13 }}>
              <div style={label}>{tr('Les jours')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {JOURS_COURTS().map((j, i) => {
                  const actifs = Array.isArray(plan.jours) ? plan.jours : [0, 1, 2, 3, 4, 5, 6];
                  const on = actifs.indexOf(i) >= 0;
                  return (
                    <button key={j} onClick={() => enregistrer({ planning: { jours: on ? actifs.filter(x => x !== i) : [...actifs, i].sort() } })}
                      style={{ ...puce(on), minWidth: 46, textAlign: 'center' }}>{j}</button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── La protection solaire ── */}
      <div style={cardSt}>
        <Entete nom={tr('Protection solaire')}
          desc={tr('Quand le soleil frappe une façade et qu’il fait chaud, baisser ses volets — puis les rouvrir quand il est passé.')}
          on={sol.actif} cb={() => enregistrer({ soleil: { actif: !sol.actif } })} />
        {etat.soleil && etat.soleil.azimut != null && (
          <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginTop: 8 }}>
            {tr('En ce moment : soleil à {a}°, hauteur {e}°', { a: Math.round(etat.soleil.azimut), e: Math.round(etat.soleil.elevation) })}
            {etat.abaisses && etat.abaisses.length ? ' · ' + (etat.abaisses.length > 1 ? tr('{n} volets abaissés', { n: etat.abaisses.length }) : tr('{n} volet abaissé', { n: 1 })) : ''}
          </div>
        )}
        {sol.actif && (
          <>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Descendre à')}</span>
              <Nombre v={sol.position != null ? sol.position : 30} min={0} max={100} pas={5} unite="%"
                cb={n => enregistrer({ soleil: { position: n } })} />
            </div>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Au-dessus de')}</span>
              <Nombre v={sol.elevation_min != null ? sol.elevation_min : 15} min={0} max={60} pas={5} unite={tr('° de hauteur')}
                cb={n => enregistrer({ soleil: { elevation_min: n } })} />
            </div>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Et au-delà de')}</span>
              <Nombre v={sol.temp_min != null && sol.temp_min !== '' ? sol.temp_min : 25} min={0} max={45} unite={tr('°C dehors')}
                cb={n => enregistrer({ soleil: { temp_min: n } })} />
            </div>
            <div style={{ ...ligne, marginTop: 8 }}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Thermomètre')}</span>
              <button onClick={() => choisirEntite('soleil', 'temp_entite', ['sensor'])}
                style={{ ...champ, cursor: 'pointer', color: sol.temp_entite ? 'var(--o-text1)' : 'var(--o-text3)' }}>
                {sol.temp_entite || tr('Choisir un capteur…')}
              </button>
            </div>

            <div style={{ marginTop: 16, borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', paddingTop: 13 }}>
              <div style={label}>{tr('Où donne chaque volet')}</div>
              <div style={{ fontSize: 11.5, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 10 }}>
                {tr('Un volet sans orientation est laissé tranquille par cette règle.')}
              </div>
              {covers.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--o-text3)', fontWeight: 600 }}>{tr('Aucun volet trouvé dans Home Assistant.')}</div>
              )}
              {covers.map(c => {
                const reg = (sol.volets || {})[c.id] || null;
                const card = reg ? cardinalDe(reg.orientation) : null;
                return (
                  <div key={c.id} style={{ padding: '10px 0', borderTop: 'var(--o-bw,1px) solid var(--o-bd3)' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>{c.nom}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button onClick={() => { const v = { ...(sol.volets || {}) }; delete v[c.id]; enregistrer({ soleil: { volets: v } }); }}
                        style={puce(!reg)}>{tr('aucune')}</button>
                      {CARDINAUX().map(k => (
                        <button key={k.deg}
                          onClick={() => enregistrer({ soleil: { volets: { ...(sol.volets || {}), [c.id]: { orientation: k.deg, ouverture: (reg && reg.ouverture) || 90 } } } })}
                          style={{ ...puce(!!card && card.deg === k.deg), minWidth: 44, textAlign: 'center' }}>{k.court}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── La mise à l'abri ── */}
      <div style={cardSt}>
        <Entete nom={tr('Vent fort')}
          desc={tr('Au-delà d’un seuil, tout remonter. Un volet baissé dans une rafale est un volet plié — cette règle passe avant les deux autres.')}
          on={vent.actif} cb={() => enregistrer({ vent: { actif: !vent.actif } })} />
        {etat.a_l_abri && (
          <div style={{ marginTop: 9, fontSize: 12, fontWeight: 800, color: 'var(--o-warn2)' }}>{tr('Volets à l’abri en ce moment.')}</div>
        )}
        {vent.actif && (
          <>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('Anémomètre')}</span>
              <button onClick={() => choisirEntite('vent', 'entite', ['sensor'])}
                style={{ ...champ, cursor: 'pointer', color: vent.entite ? 'var(--o-text1)' : 'var(--o-text3)' }}>
                {vent.entite || tr('Choisir un capteur…')}
              </button>
            </div>
            <div style={ligne}>
              <span style={{ ...label, marginBottom: 0, minWidth: 92 }}>{tr('À partir de')}</span>
              <Nombre v={vent.seuil != null ? vent.seuil : 50} min={0} max={150} pas={5} unite={tr('dans l’unité du capteur')}
                cb={n => enregistrer({ vent: { seuil: n } })} />
            </div>
          </>
        )}
      </div>

      {/* ── Ce qui s'est passé ── */}
      {etat.journal && etat.journal.length > 0 && (
        <div style={cardSt}>
          <div style={titre}>{tr('Dernières manœuvres')}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
            {etat.journal.slice(0, 8).map((j, i) => (
              <div key={j.ts + '' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', fontSize: 12.5, fontWeight: 600 }}>
                <span>{j.quoi} · <span style={{ color: 'var(--o-text3)' }}>{j.regle}{j.detail ? ' · ' + j.detail : ''}</span></span>
                <span style={{ color: 'var(--o-text3)', flexShrink: 0 }}>{new Date(j.ts * 1000).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}

      {picker && (
        <BottomSheet onClose={() => setPicker(null)} title={tr('Choisir un capteur')}>
          <EntPicker hass={hass} autoFocus domaines={picker.domaines}
            onPick={(id) => { enregistrer({ [picker.section]: { [picker.champ]: id } }); setPicker(null); }} />
        </BottomSheet>
      )}
    </div>
  );
}

export default VoletsReglages;
