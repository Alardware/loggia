/* Interrupteurs sans fil : voir les appuis, leur affecter un geste.
 *
 * Le principe tient en une phrase : on n'affiche pas un catalogue de modèles,
 * on montre ce que l'installation vient de dire. Appuyer sur un bouton le fait
 * apparaître dans le journal ci-dessous, avec le nom que lui donne
 * zigbee2mqtt (`on_press_release`, `up_hold`…). On affecte ce qu'on veut au
 * nom qu'on vient de voir. Une télécommande qu'aucun catalogue ne connaît se
 * règle donc comme les autres.
 *
 * Le serveur fait le reste : c'est `interrupteurs.py` qui écoute et qui
 * déclenche, pas cette page. Un bouton continue de marcher quand le dashboard
 * est fermé — c'est bien le moins pour un interrupteur.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { BottomSheet, EntPicker, cvName } from '../ui.jsx';
import { tr } from '../i18n.js';
import { entityCaps } from '../capabilities.js';

/* Les gestes proposés. `homeassistant.turn_on` et ses voisins marchent sur
 * TOUS les domaines — une lampe, une prise, un volet — là où `light.turn_on`
 * aurait limité le choix à l'éclairage. */
const GESTES = () => [
  { id: 'toggle', nom: tr('Basculer'), service: 'homeassistant.toggle',
    aide: tr('Allume si c’est éteint, éteint si c’est allumé') },
  { id: 'on', nom: tr('Allumer'), service: 'homeassistant.turn_on' },
  { id: 'off', nom: tr('Éteindre'), service: 'homeassistant.turn_off' },
  { id: 'plus', nom: tr('Monter la luminosité'), service: 'light.turn_on',
    extra: { brightness_step_pct: 10 }, domaines: ['light'],
    aide: tr('Par pas de 10 % — pour la molette d’un variateur') },
  { id: 'moins', nom: tr('Baisser la luminosité'), service: 'light.turn_on',
    extra: { brightness_step_pct: -10 }, domaines: ['light'],
    aide: tr('Par pas de 10 % — pour la molette d’un variateur') },
  { id: 'scene', nom: tr('Lancer une scène'), service: 'scene.turn_on', domaines: ['scene'] },
  { id: 'script', nom: tr('Lancer un script'), service: 'script.turn_on', domaines: ['script'] },
  { id: 'libre', nom: tr('Service libre'), service: '', libre: true,
    aide: tr('Pour tout le reste : écris le service et sa cible') },
];

/* Retrouve le geste d'une affectation déjà posée, pour rouvrir le formulaire
 * là où on l'avait laissé.
 *
 * Un même geste s'écrit de deux façons : « Allumer » vaut
 * `homeassistant.turn_on` en général, et `light.turn_on` dès qu'on lui a donné
 * une luminosité ou une couleur — que seul le domaine `light` sait recevoir.
 * Le pas de luminosité, lui, distingue « monter » de « allumer » sur le même
 * service. */
const PAR_ID = (id) => GESTES().find(g => g.id === id) || null;

function gesteDe(geste) {
  if (!geste || !geste.service) return null;
  const pas = (geste.data || {}).brightness_step_pct;
  if (pas === 10) return PAR_ID('plus');
  if (pas === -10) return PAR_ID('moins');
  const s = geste.service;
  if (s === 'homeassistant.toggle' || s === 'light.toggle') return PAR_ID('toggle');
  if (s === 'homeassistant.turn_on' || s === 'light.turn_on') return PAR_ID('on');
  if (s === 'homeassistant.turn_off' || s === 'light.turn_off') return PAR_ID('off');
  if (s === 'scene.turn_on') return PAR_ID('scene');
  if (s === 'script.turn_on') return PAR_ID('script');
  return null;   // service libre
}

/* Ce qu'un bouton déclenche, en français plutôt qu'en nom de service. */
function resume(gestes, hass) {
  return gestes.map(g => {
    const nom = (gesteDe(g) || {}).nom || g.service;
    const d = g.data || {};
    const bouts = [];
    if (d.entity_id) {
      const st = hass && hass.states && hass.states[d.entity_id];
      bouts.push(st ? cvName(st, d.entity_id) : d.entity_id);
    }
    if (d.brightness_pct != null) bouts.push(d.brightness_pct + ' %');
    if (Array.isArray(d.rgb_color)) bouts.push(tr('couleur'));
    if (d.color_temp_kelvin != null) bouts.push(d.color_temp_kelvin + ' K');
    return nom + (bouts.length ? ' → ' + bouts.join(' · ') : '');
  }).join(' · ');
}

const enHex = (rgb) => '#' + rgb.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
const enRgb = (hex) => {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function depuis(ts) {
  const s = Math.max(0, Math.round(Date.now() / 1000 - (ts || 0)));
  if (s < 60) return tr('il y a {n} s', { n: s });
  if (s < 3600) return tr('il y a {n} min', { n: Math.round(s / 60) });
  return tr('il y a {n} h', { n: Math.round(s / 3600) });
}

const SOURCES = { z2m: 'Zigbee2MQTT', zha: 'ZHA', deconz: 'deCONZ' };

export function InterrupteursSection({ hass, cardSt }) {
  const h = hass && typeof hass.callWS === 'function' ? hass : null;
  const [etat, setEtat] = useState(null);
  const [err, setErr] = useState('');
  const [cible, setCible] = useState(null);   // { cle, nom, action }
  const vivant = useRef(true);

  /* Sondage régulier plutôt qu'un abonnement : le journal ne vit qu'en mémoire
   * du serveur, et une page de réglages ouverte quelques minutes ne justifie
   * pas d'ouvrir un canal à elle. Une seconde et demie suffit pour qu'un appui
   * paraisse instantané. */
  useEffect(() => {
    vivant.current = true;
    if (!h) { setErr(tr('Home Assistant n’est pas joignable.')); return undefined; }
    const lire = () => h.callWS({ type: 'loggia/interrupteurs/etat' })
      .then(r => { if (vivant.current) { setEtat(r); setErr(''); } })
      .catch(e => { if (vivant.current) setErr((e && (e.message || e.code)) || tr('Écoute indisponible.')); });
    lire();
    const t = setInterval(lire, 1500);
    return () => { vivant.current = false; clearInterval(t); };
  }, [!!h]);

  const affecter = async (cle, action, gestes, nom) => {
    if (!h) return;
    try {
      const r = await h.callWS({ type: 'loggia/interrupteurs/affecter', cle, action, gestes, nom: nom || '' });
      setEtat(e => (e ? { ...e, affectations: (r && r.affectations) || {} } : e));
      setCible(null);
    } catch (e) {
      setErr((e && (e.message || e.code)) || tr('Enregistrement impossible.'));
    }
  };

  const appareils = (etat && etat.appareils) || [];
  const affectations = (etat && etat.affectations) || {};
  const journal = (etat && etat.journal) || [];
  const sources = (etat && etat.sources) || null;

  const titre = { fontSize: 15, fontWeight: 700, marginBottom: 3 };
  const sous = { fontSize: 12, color: 'var(--o-text2)', fontWeight: 600 };
  const btnDoux = { padding: '6px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text1)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Apprentissage : la page ne sait rien tant qu'on n'a pas appuyé. */}
      <div style={cardSt}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={titre}>{tr('Appuie sur un bouton')}</div>
            <div style={sous}>{tr('Loggia écoute Zigbee2MQTT, ZHA et deCONZ. Chaque appui apparaît ici avec le nom de son bouton — c’est ce nom qu’on affecte.')}</div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: err ? 'rgba(var(--o-bad-rgb),.16)' : 'rgba(var(--o-ok-rgb),.14)', color: err ? 'var(--o-bad)' : 'var(--o-ok)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: err ? 'var(--o-bad)' : 'var(--o-ok)' }} />
            {err ? tr('HORS D’ÉCOUTE') : tr('À L’ÉCOUTE')}
          </span>
        </div>
        {err && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: 'var(--o-bad)' }}>{err}</div>}
        {/* Ce qui est reellement branche. Une page muette ne disait pas si
          * personne n'appuyait ou si personne n'ecoutait (retour 03/09). */}
        {sources && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
            {[
              ['Zigbee2MQTT', sources.z2m, sources.mqtt_present ? tr('MQTT est là, mais l’abonnement a échoué — regarde le journal de Home Assistant') : tr('Pas d’intégration MQTT sur cette installation')],
              ['ZHA', sources.zha, ''],
              ['deCONZ', sources.deconz, ''],
            ].map(([nom, ok, pourquoi]) => (
              <span key={nom} title={ok ? '' : pourquoi}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: ok ? 'rgba(var(--o-ok-rgb),.12)' : 'var(--o-s1)', color: ok ? 'var(--o-ok)' : 'var(--o-text3)' }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: ok ? 'var(--o-ok)' : 'var(--o-text3)' }} />
                {nom}
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column' }}>
          {journal.length === 0 && !err && (
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, padding: '8px 0' }}>
              {tr('Rien encore. Appuie sur un bouton de ta télécommande : il se montrera ici.')}
            </div>
          )}
          {journal.slice(0, 8).map((v, i) => (
            <div key={v.cle + v.action + v.ts + i}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '9px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nom}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--o-text3)', fontWeight: 600 }}>{SOURCES[v.source] || v.source} · {depuis(v.ts)}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <code style={{ fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)' }}>{v.action}</code>
                <button onClick={() => setCible({ cle: v.cle, nom: v.nom, action: v.action })} style={btnDoux}>
                  {((affectations[v.cle] || {}).actions || {})[v.action] ? tr('Modifier') : tr('Affecter')}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Les appareils connus : ceux qu'on a entendus, et ceux qu'on a réglés. */}
      {appareils.map(ap => {
        const posees = (affectations[ap.cle] || {}).actions || {};
        const boutons = Array.from(new Set([...(ap.affectees || []), ...(ap.vues || [])])).sort();
        return (
          <div key={ap.cle} style={cardSt}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ap.nom}</div>
                <div style={sous}>{SOURCES[ap.source] || ap.source}</div>
              </div>
              <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: 'var(--o-text3)', whiteSpace: 'nowrap' }}>
                {tr('{n} boutons', { n: boutons.length })}
              </span>
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
              {boutons.map((btn, i) => {
                const gestes = posees[btn] || [];
                return (
                  <div key={btn}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', padding: '10px 0', borderTop: i ? 'var(--o-bw,1px) solid var(--o-bd3)' : 'none' }}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <code style={{ fontSize: 12, fontWeight: 700 }}>{btn}</code>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, marginTop: 3, color: gestes.length ? 'var(--o-accent-soft)' : 'var(--o-text3)' }}>
                        {gestes.length ? resume(gestes, hass) : tr('rien pour l’instant')}
                      </span>
                    </span>
                    <span style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {gestes.length > 0 && (
                        <button onClick={() => affecter(ap.cle, btn, [], ap.nom)}
                          style={{ ...btnDoux, background: 'rgba(var(--o-bad-rgb),.14)', color: 'var(--o-bad)' }}>
                          {tr('Retirer')}
                        </button>
                      )}
                      <button onClick={() => setCible({ cle: ap.cle, nom: ap.nom, action: btn })} style={btnDoux}>
                        {gestes.length ? tr('Modifier') : tr('Affecter')}
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {cible && (
        <FeuilleAffectation
          hass={hass}
          cible={cible}
          existant={((affectations[cible.cle] || {}).actions || {})[cible.action] || []}
          onFermer={() => setCible(null)}
          onValider={(gestes) => affecter(cible.cle, cible.action, gestes, cible.nom)}
        />
      )}
    </div>
  );
}

/* Le formulaire : un geste, une cible, et ce qu'on veut en plus.
 *
 * Un seul geste par bouton — le format de stockage en accepte plusieurs (c'est
 * une liste), mais rien ne les demande encore, et un formulaire à plusieurs
 * lignes coûterait plus qu'il ne rapporte.
 *
 * La luminosité et la couleur ne s'affichent que si la lampe visée sait les
 * recevoir : `entityCaps` lit ses `supported_color_modes` plutôt que de le
 * déduire du domaine. Une ampoule blanche ne se verra donc pas proposer une
 * couleur qu'elle ne peut pas prendre.
 */
function FeuilleAffectation({ hass, cible, existant, onFermer, onValider }) {
  const dejaLa = existant[0] || null;
  const d0 = (dejaLa && dejaLa.data) || {};
  const [geste, setGeste] = useState(() => (gesteDe(dejaLa) || GESTES()[0]).id);
  const [entite, setEntite] = useState(d0.entity_id || '');
  const [libre, setLibre] = useState(() => (gesteDe(dejaLa) ? '' : ((dejaLa && dejaLa.service) || '')));
  const [choisir, setChoisir] = useState(false);
  const [lum, setLum] = useState(d0.brightness_pct != null ? d0.brightness_pct : null);
  const [coul, setCoul] = useState(() => {
    if (Array.isArray(d0.rgb_color)) return { rgb: d0.rgb_color.slice(0, 3) };
    if (d0.color_temp_kelvin != null) return { k: d0.color_temp_kelvin };
    return null;
  });

  const g = GESTES().find(x => x.id === geste) || GESTES()[0];
  const etat = (hass && hass.states && hass.states[entite]) || null;
  const nomEntite = useMemo(() => (entite ? (etat ? cvName(etat, entite) : entite) : ''), [etat, entite]);

  /* Ce que la lampe sait faire, d'après elle — pas d'après son domaine. */
  const caps = useMemo(() => (etat && entite.indexOf('light.') === 0 ? entityCaps(entite, etat) : null), [etat, entite]);
  const peutLum = !!(caps && caps.can.has('set_brightness'));
  const peutCoul = !!(caps && caps.can.has('set_color'));
  const peutTemp = !!(caps && caps.can.has('set_color_temp'));
  const enPlus = (geste === 'on' || geste === 'toggle') && (peutLum || peutCoul || peutTemp);
  const at = (etat && etat.attributes) || {};
  const kMin = at.min_color_temp_kelvin || 2000;
  const kMax = at.max_color_temp_kelvin || 6500;

  const pret = g.libre
    ? (libre.trim().split('.').length === 2 && libre.trim().split('.').every(Boolean))
    : !!entite;

  const valider = () => {
    let service = g.libre ? libre.trim() : g.service;
    const data = { ...(g.extra || {}) };
    if (entite) data.entity_id = entite;
    if (enPlus) {
      if (peutLum && lum != null) data.brightness_pct = lum;
      if (coul && Array.isArray(coul.rgb) && peutCoul) data.rgb_color = coul.rgb;
      else if (coul && coul.k != null && peutTemp) data.color_temp_kelvin = coul.k;
      /* `homeassistant.turn_on` ne sait rien de la luminosité ni de la
       * couleur : dès qu'on en pose une, le geste passe par le domaine
       * `light`, seul à les comprendre. */
      if (data.brightness_pct != null || data.rgb_color || data.color_temp_kelvin != null) {
        service = geste === 'toggle' ? 'light.toggle' : 'light.turn_on';
      }
    }
    onValider([Object.keys(data).length ? { service, data } : { service }]);
  };

  const champ = { width: '100%', padding: '10px 12px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', background: 'var(--o-s2)', color: 'var(--o-text1)', fontSize: 13, fontWeight: 600, boxSizing: 'border-box' };
  const puce = (on) => ({ padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: 'none', background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' });
  const label = { fontSize: 12, fontWeight: 700, marginBottom: 6 };

  return (
    <BottomSheet onClose={onFermer} title={cible.nom}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '2px 0 8px' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600 }}>{tr('Quand ce bouton est actionné')}</div>
          <code style={{ display: 'inline-block', marginTop: 5, fontSize: 13, fontWeight: 800, padding: '5px 11px', borderRadius: 10, background: 'rgba(var(--o-accent-rgb),.14)', color: 'var(--o-accent-soft)' }}>{cible.action}</code>
        </div>

        <div>
          <div style={label}>{tr('Faire')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {GESTES().map(x => (
              <button key={x.id} onClick={() => setGeste(x.id)} style={puce(x.id === geste)}>{x.nom}</button>
            ))}
          </div>
          {g.aide && <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginTop: 7 }}>{g.aide}</div>}
        </div>

        {g.libre && (
          <div>
            <div style={label}>{tr('Service')}</div>
            <input value={libre} onChange={e => setLibre(e.target.value)} placeholder="script.turn_on" spellCheck={false} style={champ} />
          </div>
        )}

        <div>
          <div style={label}>{g.libre ? tr('Sur (facultatif)') : tr('Sur')}</div>
          <button onClick={() => setChoisir(true)} style={{ ...champ, textAlign: 'left', cursor: 'pointer', color: entite ? 'var(--o-text1)' : 'var(--o-text3)' }}>
            {entite ? nomEntite : tr('Choisir une entité…')}
          </button>
          {entite && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 5 }}>
              <code style={{ fontSize: 11, color: 'var(--o-text3)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entite}</code>
              <button onClick={() => setEntite('')} style={{ flexShrink: 0, padding: '4px 9px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text2)' }}>{tr('Effacer')}</button>
            </div>
          )}
        </div>

        {/* Luminosité et couleur : seulement si la lampe sait les recevoir. */}
        {enPlus && (
          <div style={{ borderTop: 'var(--o-bw,1px) solid var(--o-bd3)', paddingTop: 13 }}>
            <div style={label}>{tr('À l’allumage')}</div>
            <div style={{ fontSize: 12, color: 'var(--o-text3)', fontWeight: 600, marginBottom: 9 }}>
              {tr('Facultatif. Sans rien ici, la lampe reprend son dernier état.')}
            </div>
            {peutLum && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => setLum(v => (v == null ? 70 : null))} style={puce(lum != null)}>{tr('Luminosité')}</button>
                {lum != null && (
                  <>
                    <input type="range" min={1} max={100} value={lum} onChange={e => setLum(Number(e.target.value))}
                      style={{ flex: 1, minWidth: 120, accentColor: 'var(--o-accent)' }} />
                    <span style={{ width: 46, textAlign: 'right', fontSize: 12, fontWeight: 800 }}>{lum} %</span>
                  </>
                )}
              </div>
            )}
            {(peutCoul || peutTemp) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button onClick={() => setCoul(null)} style={puce(!coul)}>{tr('Couleur inchangée')}</button>
                  {peutCoul && (
                    <button onClick={() => setCoul(c => (c && c.rgb ? c : { rgb: [255, 170, 60] }))} style={puce(!!(coul && coul.rgb))}>
                      {tr('Une couleur')}
                    </button>
                  )}
                  {peutTemp && (
                    <button onClick={() => setCoul(c => (c && c.k != null ? c : { k: Math.round((kMin + kMax) / 2) }))} style={puce(!!(coul && coul.k != null))}>
                      {tr('Un blanc')}
                    </button>
                  )}
                </div>
                {coul && coul.rgb && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 9 }}>
                    <input type="color" value={enHex(coul.rgb)} onChange={e => setCoul({ rgb: enRgb(e.target.value) })}
                      style={{ width: 54, height: 34, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }} />
                    <code style={{ fontSize: 12, color: 'var(--o-text3)' }}>{enHex(coul.rgb)}</code>
                  </div>
                )}
                {coul && coul.k != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9, flexWrap: 'wrap' }}>
                    <input type="range" min={kMin} max={kMax} step={50} value={coul.k} onChange={e => setCoul({ k: Number(e.target.value) })}
                      style={{ flex: 1, minWidth: 120, accentColor: 'var(--o-accent)' }} />
                    <span style={{ width: 60, textAlign: 'right', fontSize: 12, fontWeight: 800 }}>{coul.k} K</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 2 }}>
          <button onClick={onFermer} style={{ padding: '10px 16px', borderRadius: 10, border: 'var(--o-bw,1px) solid var(--o-bd2)', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: 'var(--o-s1)', color: 'var(--o-text2)' }}>{tr('Annuler')}</button>
          <button onClick={valider} disabled={!pret}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', cursor: pret ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 700, background: pret ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: pret ? '#fff' : 'var(--o-text3)' }}>
            {tr('Enregistrer')}
          </button>
        </div>
      </div>

      {choisir && (
        <BottomSheet onClose={() => setChoisir(false)} title={tr('Choisir une entité')}>
          <EntPicker hass={hass} autoFocus domaines={g.domaines || null}
            onPick={(id) => { setEntite(id); setChoisir(false); }} />
        </BottomSheet>
      )}
    </BottomSheet>
  );
}

export default InterrupteursSection;
