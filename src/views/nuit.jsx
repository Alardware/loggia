/* La nuit : une veilleuse qui s'éteint seule, et les lampes oubliées.
 *
 * Le serveur (`nuit.py`) tient les deux règles. Une note d'interface : la page
 * dit quelles lampes savent vraiment faire un fondu. Promettre à l'écran un
 * fondu que la lampe ne tiendra pas est pire que de ne pas le proposer.
 */
import {
  useMemo
} from 'react';
import { LOGGIA_INDEX } from '../state.js';
import { cvName, RegleEntete, usePli , useEtatServeur, Bascule } from '../ui.jsx';
import { tr } from '../i18n.js';

// Le bit TRANSITION de Home Assistant : une lampe qui ne l'a pas ne sait pas
// s'éteindre en fondu.
const LIGHT_TRANSITION = 32;

const JOURS_NUIT = () => [tr('lun'), tr('mar'), tr('mer'), tr('jeu'), tr('ven'), tr('sam'), tr('dim')];

/* Ce qui compte comme capteur de mouvement : Home Assistant le dit dans la
 * `device_class`, jamais le nom de l'entité. */
const CLASSES_MOUVEMENT = ['motion', 'occupancy', 'presence'];

export function NuitReglages({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const { etat, setEtat, err, setErr, vivant } =
    useEtatServeur(hass, 'loggia/nuit/etat', 5000, tr('Réglages indisponibles.'));
  /* Un pli par regle — avec les autres etats : un hook ne vit pas apres
   * un retour conditionnel. */
  const [pliVeilleuse, plierVeilleuse] = usePli('nuit:veilleuse');
  const [pliCoucher, plierCoucher] = usePli('nuit:coucher');
  const [pliEclairage, plierEclairage] = usePli('nuit:eclairage');


  const cfg = (etat && etat.config) || null;

  const enregistrer = async (patch) => {
    if (!h || !cfg) return;
    setEtat(e => {
      if (!e) return e;
      const n = { ...e.config };
      for (const k of Object.keys(patch)) n[k] = { ...(n[k] || {}), ...patch[k] };
      // Les pièces de l'éclairage nocturne arrivent une à la fois : on fusionne
      // au lieu de remplacer, sinon les autres disparaîtraient le temps de
      // l'aller-retour.
      if (patch.eclairage && patch.eclairage.pieces) {
        const avant = (e.config.eclairage || {}).pieces || {};
        const pieces = { ...avant };
        for (const nom of Object.keys(patch.eclairage.pieces)) {
          if (patch.eclairage.pieces[nom] === null) delete pieces[nom];
          else pieces[nom] = { ...(avant[nom] || {}), ...patch.eclairage.pieces[nom] };
        }
        n.eclairage = { ...n.eclairage, pieces };
      }
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
  /* Les pièces candidates à l'éclairage nocturne : une zone Home Assistant
   * avec au moins un capteur de mouvement et une lampe. Rien à saisir. */
  const piecesMouvement = useMemo(() => {
    const S = (hass && hass.states) || {};
    const zones = (LOGGIA_INDEX && LOGGIA_INDEX.areaList) || [];
    return zones.map(z => ({
      nom: z.name,
      capteurs: (z.entities || []).filter(id => id.indexOf('binary_sensor.') === 0
        && CLASSES_MOUVEMENT.indexOf(((S[id] && S[id].attributes) || {}).device_class) >= 0),
      lampes: (z.entities || []).filter(id => id.indexOf('light.') === 0 && S[id]),
    })).filter(z => z.capteurs.length > 0 && z.lampes.length > 0);
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
  const ecl = cfg.eclairage || {};

  const titre = { fontSize: 15, fontWeight: 700 };
  const simu = cfg.simulation || {};
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
      {/* La simulation se dit EN HAUT, pas seulement dans son réglage : sinon
        * on cherche pourquoi rien ne bouge. */}
      {simu.actif && (
        <div role="status" style={{ ...cardSt, border: 'var(--o-bw,1px) solid var(--o-warn2)', fontSize: 12.5, fontWeight: 700, color: 'var(--o-warn2)' }}>
          {tr('Simulation : rien ne bouge, tout est noté.')}
        </div>
      )}
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

      {/* ── L'éclairage nocturne (§14) ── */}
      {/* Un mouvement la nuit allume la pièce à faible intensité ; sans
        * mouvement, elle s'éteint seule. Une lampe montée à la main reste
        * allumée : la main l'emporte, la règle lâche (ADR 0012). */}
      <div style={cardSt}>
        <RegleEntete nom={tr('Éclairage nocturne')}
          desc={tr('La nuit, un mouvement dans une pièce allume ses lampes à faible intensité ; sans mouvement, elles s’éteignent seules.')}
          on={ecl.actif} cb={() => enregistrer({ eclairage: { actif: !ecl.actif } })} plie={pliEclairage} onPlier={plierEclairage} zone="nuit-eclairage" />
        {etat.eclairees && Object.keys(etat.eclairees).length > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: 'var(--o-warn2)' }}>
            {tr('Allumé par la règle : {p}', { p: Object.keys(etat.eclairees).join(', ') })}
          </div>
        )}
        {ecl.actif && !pliEclairage && (
          <div id="nuit-eclairage">
            <div style={ligne}>
              <span style={{ ...label, minWidth: 78 }}>{tr('Intensité')}</span>
              <input aria-label={tr('Intensité de l’éclairage nocturne, en pourcentage')} type="number" value={ecl.luminosite != null ? ecl.luminosite : 10} min={1} max={100}
                onChange={e => enregistrer({ eclairage: { luminosite: Math.max(1, Math.min(100, Number(e.target.value) || 10)) } })}
                style={{ ...champ, width: 74 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>%</span>
            </div>
            <div style={ligne}>
              <span style={{ ...label, minWidth: 78 }}>{tr('S’éteint après')}</span>
              <input aria-label={tr('Extinction après le dernier mouvement, en minutes')} type="number" value={ecl.duree != null ? ecl.duree : 3} min={0} max={60}
                onChange={e => enregistrer({ eclairage: { duree: Math.max(0, Math.min(60, Number(e.target.value) || 0)) } })}
                style={{ ...champ, width: 74 }} />
              <span style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 700 }}>{tr('min sans mouvement')}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 8 }}>
              {tr('Une lampe déjà allumée n’est pas touchée. Une lampe montée à la main reste allumée : la règle lâche.')}
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ ...label, marginBottom: 7 }}>{tr('Quelles pièces')}</div>
              {piecesMouvement.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>
                  {tr('Aucune pièce avec un capteur de mouvement et une lampe. Range-les dans une zone Home Assistant : la règle s’appuie dessus.')}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {piecesMouvement.map(p => {
                  const reg = (ecl.pieces || {})[p.nom] || null;
                  const on = !!(reg && reg.actif);
                  return (
                    <button key={p.nom} onClick={() => enregistrer({ eclairage: { pieces: { [p.nom]: on ? { actif: false } : { actif: true, capteurs: p.capteurs, lampes: p.lampes } } } })}
                      style={puce(on)}>{p.nom}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Observer sans agir ── */}
      {/* Un MODE, pas une règle : il ne commande rien et n'a rien à replier. */}
      <div style={cardSt}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={titre}>{tr('Observer sans agir')}</div>
            <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600, marginTop: 2 }}>{tr('Les règles notent ce qu’elles auraient fait, sans toucher aux lumières.')}</div>
          </div>
          <Bascule nom={tr('Observer sans agir')} on={!!simu.actif} cb={() => enregistrer({ simulation: { actif: !simu.actif } })} />
        </div>
      </div>

      {etat.journal && etat.journal.length > 0 && (
        <div style={cardSt}>
          <div style={titre}>{tr('Dernières extinctions')}</div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column' }}>
            {etat.journal.slice(0, 8).map((j, i) => (
              <div key={j.ts + '' + i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none', fontSize: 12, fontWeight: 600 }}>
                {/* Les champs du journal COMMUN : ce qui a été fait, par quelle
                  * règle, pourquoi — et ce qui a manqué. */}
                <span style={{ minWidth: 0 }}>
                  {j.simule && <span style={{ marginRight: 6, padding: '1px 6px', borderRadius: 6, fontSize: 10.5, fontWeight: 800, background: 'var(--o-s2)', color: 'var(--o-warn2)' }}>{tr('simulé')}</span>}
                  {j.quoi} · <span style={{ color: 'var(--o-text3)' }}>{j.regle}{j.motif ? ' · ' + j.motif : ''}{j.detail ? ' · ' + j.detail : ''}</span>
                </span>
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
