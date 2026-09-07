/* ── La vue Systeme ─────────────────────────────────────────────────────────
 *
 * Chargee a la demande : on l'ouvre pour regarder l'etat des machines, pas au
 * demarrage du tableau de bord. Elle ne partageait avec le reste que le journal
 * d'activite et les courbes, partis dans `historique.jsx`.
 *
 * `SystemeContent` est l'export par defaut, comme `views/meteo.jsx`. */
import { useState, useEffect, useRef } from 'react';
import { Fi } from '../ui.jsx';
import { tr } from '../i18n.js';
import { LOGGIA_RESOLVED, loggiaEnt } from '../state.js';
import { peut } from '../actions.js';
import { RoomActivityCard, SysArea, useSysHist } from '../historique.jsx';
import { sysKeys, sysSensors, sysNames, SYS_SLOTS } from '../sysconf.js';

const BRAND_ICONS = {
  haos: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 xml:space=%22preserve%22 viewBox=%220 0 512 512%22%3E%3Cpath d=%22M512 473.3c0 17.6-14.4 32-32 32H32c-17.6 0-32-14.4-32-32v-192c0-17.6 10.2-42.2 22.6-54.6L233.4 16c12.4-12.4 32.8-12.4 45.2 0l210.8 210.8c12.4 12.4 22.6 37 22.6 54.6z%22 style=%22fill:%23f2f4f9%22/%3E%3Cpath d=%22M489.4 226.7 278.6 16c-12.4-12.4-32.8-12.4-45.2 0L22.6 226.7C10.2 239.1 0 263.7 0 281.3v192c0 17.6 14.4 32 32 32h196.8l-86.7-86.7c-4.5 1.5-9.2 2.4-14.2 2.4-24.1 0-43.7-19.6-43.7-43.7s19.6-43.7 43.7-43.7 43.7 19.6 43.7 43.7c0 5-.9 9.7-2.4 14.2l67.5 67.5V211.8c-14.5-7.1-24.5-22-24.5-39.2 0-24.1 19.6-43.7 43.7-43.7s43.7 19.6 43.7 43.7c0 17.2-10 32.1-24.5 39.2v173.4l67.1-67.1c-1.3-4.2-2-8.6-2-13.2 0-24.1 19.6-43.7 43.7-43.7s43.7 19.6 43.7 43.7-19.6 43.7-43.7 43.7c-5.3 0-10.4-1-15.1-2.8l-93.7 93.7v65.9H480c17.6 0 32-14.4 32-32v-192c0-17.6-10.2-42.2-22.6-54.7%22 style=%22fill:%2318bcf2%22/%3E%3C/svg%3E",
  unraid: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 xml:space=%22preserve%22 viewBox=%220 108.3 512 295.4%22%3E%3ClinearGradient id=%22a%22 x1=%2291.058%22 x2=%22420.942%22 y1=%2293.45%22 y2=%22423.333%22 gradientTransform=%22matrix(1 0 0 -1 0 514.2)%22 gradientUnits=%22userSpaceOnUse%22%3E%3Cstop offset=%220%22 style=%22stop-color:%23e32929%22/%3E%3Cstop offset=%221%22 style=%22stop-color:%23ff8d30%22/%3E%3C/linearGradient%3E%3Cpath d=%22M243.3 181.9h24.9v147.8h-24.9zM24.9 329.7H0V181.9h24.9zm96.8 17.6h24.9v56.4h-24.9zM60.6 284h24.9v91.3H60.6zm121.7 0h24.9v91.3h-24.9zm304.8-102.1H512v147.8h-24.9zm-96.8-17.2h-24.9v-56.4h24.9zm61.1 62.9h-24.9v-91h24.9zm-122.1 0h-24.9v-91h24.9z%22 style=%22fill:url(%23a)%22/%3E%3C/svg%3E",
  unifi: "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1024 1024%22%3E%3Ccircle cx=%22512%22 cy=%22512%22 r=%22512%22 style=%22fill:%230559c9%22/%3E%3Cpath d=%22M588.6 385q0-31.49 20.72-58.54t107.68-27V518l-9.91 31.93a213 213 0 0 1-18.92 43.69 144.8 144.8 0 0 1-26.58 33.49 136.6 136.6 0 0 1-34.46 23.29A175.8 175.8 0 0 1 585 663.93a217.5 217.5 0 0 0 3.61-38.58zM384 324.2h25.69V349H384zm25.69 37.69h25.71v24.85h-25.67zM384 393.38h25.7v24.85H384zm-25.67 37.27H384v25.27h-25.64zM307 298.92h25.67v25.28H307zm128.4 326.43q0 32.37 11.94 56.33t26.37 39.91q14.4 16 26.35 23.74l11.94 7.75q-48.19 0-86.27-13.52t-64.44-37.7a163.2 163.2 0 0 1-40.32-57q-14-32.84-14-71V368.11h25.67V505.6h25.7v-24.83H384v55.43h25.69v-93.13h25.71zm94.6 51.89q35.6 1.32 65.34-5.33a163.2 163.2 0 0 0 53.38-22 148.9 148.9 0 0 0 40.78-39.48q17.12-24.15 27.48-57.87v21.34q0 36.37-12.39 67.64a159.6 159.6 0 0 1-36.28 55q-23.87 23.74-58.12 38.37t-77.92 17.29l-15.33-8q-1.79-1.32-29.73-23.29t-38.3-66.3a151.8 151.8 0 0 0 35.38 15.3q20.05 6 45.71 7.33M358.36 349.47h25.24v24.85h-25.24z%22 style=%22fill:%23fff%22/%3E%3C/svg%3E",
};
/* Duree de fonctionnement, quelle que soit la forme sous laquelle l'integration
 * la publie : « 5 days, 03:12 », un nombre de secondes, ou un horodatage de
 * demarrage.
 *
 * Le mot du jour se lit dans plusieurs langues — un capteur allemand ecrit
 * « Tag », un espagnol « dia ». Auparavant seuls `day` et `jour` etaient
 * reconnus : ailleurs, la duree tombait dans le dernier cas et s'affichait
 * telle quelle, brute. Et les unites de sortie passent par le catalogue : le
 * « j » de jour n'est un jour qu'en francais. */
const UPT_JOUR = /(\d+)\s*(?:days?|jours?|tage?|d[ií]as?|giorni?|dias?)/i;
function fmtUptime(raw) {
  if (raw == null || raw === '' || raw === 'unknown' || raw === 'unavailable') return '—';
  const s = String(raw);
  const jh = (d, h) => (d > 0 ? tr('{n} j', { n: d }) + ' ' + tr('{n} h', { n: String(h).padStart(2, '0') }) : tr('{n} h', { n: h }));
  const dm = s.match(UPT_JOUR), tm = s.match(/(\d+):(\d+)/);
  if (dm || tm) return jh(dm ? +dm[1] : 0, tm ? +tm[1] : 0);
  if (/^\s*[\d.]+\s*$/.test(s)) { const n = parseFloat(s); if (!isNaN(n) && n > 600) return jh(Math.floor(n / 86400), Math.floor((n % 86400) / 3600)); }
  const t = Date.parse(s); if (!isNaN(t)) { let sec = (Date.now() - t) / 1000; if (sec < 0) sec = 0; return jh(Math.floor(sec / 86400), Math.floor((sec % 86400) / 3600)); }
  return s;
}

// History HA pour la vue Système : points {t,v} par entité, période en heures, refresh manuel.

/* La machine hôte, au gabarit d'Atrium : logo et nom en tête, le chiffre qui
 * compte en très gros, le reste en deux lignes serrées, l'état en pied. Une
 * carte plutôt qu'un panneau repliable — elle tient dans un écran de mobile. */
function SysCarteHote({ nom, logo, online, cpu, mem, disque, temp, uptime, courbe, courbeLbl, col }) {
  const pc = (v) => v == null ? null : Math.round(v) + ' %';
  const ligne1 = [pc(mem) && pc(mem) + ' ' + tr('ram'), pc(disque) && pc(disque) + ' ' + tr('disque')].filter(Boolean).join(' · ');
  const ligne2 = [temp != null && Math.round(temp) + ' °C ' + tr('température'), uptime && uptime !== '—' && uptime + ' ' + tr('uptime')].filter(Boolean).join(' · ');
  return (
    <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: '20px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))', maxWidth: 460 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ width: 42, height: 42, borderRadius: 14, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,169,244,.14)' }}>
          {logo ? <img src={logo} alt="" draggable={false} style={{ width: 28, height: 26, objectFit: 'contain' }} /> : <Fi i="home" size={20} color="var(--o-accent-soft)" />}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom}</div>
          <div style={{ fontSize: 12, color: 'var(--o-text2)', fontWeight: 600 }}>Home Assistant</div>
        </div>
        {/* L'etat se tient A COTE du nom, jamais dessous : sur telephone il
          * passait a la ligne et le texte venait buter sur la pastille
          * (retour 03/09). `flexShrink` le garde entier. */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, padding: '4px 11px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: online ? 'rgba(var(--o-ok-rgb),.14)' : 'rgba(var(--o-bad-rgb),.16)', color: online ? 'var(--o-ok)' : 'var(--o-bad)' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: online ? 'var(--o-ok)' : 'var(--o-bad)' }} />{online ? tr('en ligne') : tr('hors ligne')}
        </span>
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: col }}>{pc(cpu) || '—'}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--o-text2)' }}>{tr('cpu')}</span>
        </div>
        {ligne1 && <div style={{ marginTop: 9, fontSize: 12, fontWeight: 700, color: 'var(--o-text1)' }}>{ligne1}</div>}
        {ligne2 && <div style={{ marginTop: 3, fontSize: 12, fontWeight: 700, color: 'var(--o-text1)' }}>{ligne2}</div>}
        {courbe && courbe.length > 1 && (
          <div style={{ marginTop: 11 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', marginBottom: 3 }}>{courbeLbl}</div>
            <SysArea pts={courbe} color={col} fill="rgba(var(--o-ok-rgb),.08)" h={30} />
          </div>
        )}
      </div>
    </div>
  );
}

function SystemeContent({ hass }) {
  const S = (hass && hass.states) || {};
  const num = id => { const s = S[id]; if (!s) return null; const v = parseFloat(s.state); return isNaN(v) ? null : v; };
  const unitOf = id => { const s = S[id]; return (s && s.attributes && s.attributes.unit_of_measurement) || ''; };
  const onl = id => { const s = S[id]; return s ? ['on', 'home', 'online', 'connected'].indexOf(String(s.state).toLowerCase()) >= 0 : false; };
  const has = id => !!S[id];
  const stateRaw = id => S[id] ? S[id].state : null;
  const [armed, setArmed] = useState(null);
  const armRef = useRef(null);
  const power = (id, domain, service) => {
    if (armed === id) { if (hass && hass.callService) hass.callService(domain, service, {}); setArmed(null); if (armRef.current) clearTimeout(armRef.current); }
    else { setArmed(id); if (armRef.current) clearTimeout(armRef.current); armRef.current = setTimeout(() => setArmed(null), 4000); }
  };
  useEffect(() => () => { if (armRef.current) clearTimeout(armRef.current); }, []);
  // Hote principal (Glances ou System Monitor)
  const SYS = sysSensors();
  const SYSN = sysNames();
  const hCpu = num(SYS.host.cpu) != null ? num(SYS.host.cpu) : num(SYS.host.cpuAlt);
  const hTemp = num(SYS.host.temp);
  const hUsed = num(SYS.host.memUsed), hFree = num(SYS.host.memFree);
  // % mémoire : capteur Glances, sinon System Monitor. Le rapport utilisée/(utilisée+libre)
  // n'est utilisé qu'en tout dernier recours car il ignore le cache et surestime fortement.
  const hMemPct = num(SYS.host.memPct) != null ? Math.round(num(SYS.host.memPct))
    : num(SYS.host.memPctAlt) != null ? Math.round(num(SYS.host.memPctAlt))
      : ((hUsed != null && hFree != null && (hUsed + hFree) > 0) ? Math.round(hUsed / (hUsed + hFree) * 100) : null);
  // L'unite vient du capteur ; sans capteur il n'y a pas de valeur a habiller,
  // et un repli « Go » francais s'afficherait a cote de chiffres anglais.
  const hMemUnit = unitOf(SYS.host.memUsed) || '';
  const hDisk = num(SYS.host.disk) != null ? num(SYS.host.disk) : num(SYS.host.diskAlt);
  const hUp = fmtUptime(stateRaw(SYS.host.uptime));
  const hOnline = onl(SYS.host.online) || has(SYS.host.cpu);
  /* Une seule machine : celle qui porte Home Assistant (retour 02/09). Le NAS
   * et la passerelle ont leur propre tableau de bord ailleurs ; les suivre ici
   * ne faisait que rallonger la page. */
  const machinesOnline = hOnline ? 1 : 0;
  // ── v6 (design Claude Design 21/08) : période, refresh, machine détaillée, history réel, journal ──
  const [period, setPeriod] = useState(1); // heures : 1 | 24 | 168
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastFetch, setLastFetch] = useState(() => new Date());
  const doRefresh = () => { setRefreshKey(k => k + 1); setLastFetch(new Date()); };
  const HIST_IDS = [SYS.host.cpu, SYS.host.memUsed];
  const hist = useSysHist(hass, HIST_IDS, period, refreshKey);
  const perLbl = period === 1 ? tr('{n} h', { n: 1 }) : period === 24 ? tr('{n} h', { n: 24 }) : tr('{n} j', { n: 7 });
  // Alertes calculées sur les seuils réels
  const alerts = [];
  if (hMemPct != null && hMemPct >= 85) alerts.push({ key: 'hmem', m: sysNames().host, target: 'host', sev: hMemPct >= 92 ? 'bad' : 'warn', txt: tr('Mémoire à {n} %', { n: hMemPct }) + (hUsed != null && hFree != null ? ` (${Math.round(hUsed)} / ${Math.round(hUsed + hFree)} ${hMemUnit})` : '') + ' ' + tr('— le cœur risque un redémarrage forcé.') });
  if (hDisk != null && hDisk >= 85) alerts.push({ key: 'hdisk', m: sysNames().host, target: 'host', sev: hDisk >= 92 ? 'bad' : 'warn', txt: tr('Partition /data à {n} % — prévoir une purge de la base ou des sauvegardes.', { n: Math.round(hDisk) }) });
  if (!hOnline) alerts.push({ key: 'offhost', m: sysNames().host, target: 'host', sev: 'bad', txt: tr('Machine hors ligne — dernier état inconnu.') });
  // Journal : logbook HA sur les entités système suivies (24 h), meilleur effort
  const [logbook, setLogbook] = useState(null);
  const connecte = hass ? 1 : 0;
  useEffect(() => {
    let alive = true;
    if (!hass || !hass.callApi) { setLogbook(null); return undefined; }
    const ids = [...HIST_IDS, SYS.host.online, ...Object.keys((hass.states || {})).filter(id => id.indexOf('update.') === 0)].filter(Boolean);
    const start = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    hass.callApi('GET', 'logbook/' + start + '?entity=' + encodeURIComponent(ids.slice(0, 30).join(',')))
      .then(res => { if (alive) setLogbook(Array.isArray(res) ? res.slice(-8).reverse() : null); })
      .catch(() => { if (alive) setLogbook(null); });
    return () => { alive = false; };
  }, [connecte, refreshKey]);

  // ── Patron Atrium (22/08) : bandeau Alimentation, machine HAOS, journaux ──
  const relFetch = (() => { const sec = Math.round((Date.now() - lastFetch.getTime()) / 1000); if (sec < 60) return tr('il y a {n} s', { n: sec }); const mn = Math.round(sec / 60); return mn < 60 ? tr('il y a {n} min', { n: mn }) : tr('il y a {n} h', { n: Math.round(mn / 60) }); })();
  const lvlCol = (v, warn = 70, bad = 86) => v == null ? 'var(--o-text3)' : v >= bad ? 'var(--o-bad)' : v >= warn ? 'var(--o-warn2)' : 'var(--o-ok)';
  const powerActions = [
    { id: 'ha', label: tr('Redémarrer HA'), desc: tr('Relance le cœur sans toucher à la machine · ~40 s'), col: '255,179,71', run: () => power('ha', 'homeassistant', 'restart') },
    { id: 'reboot', label: tr('Redémarrer'), desc: tr('Redémarrage complet de la machine · 2 à 3 min hors ligne'), col: '255,179,71', run: () => power('reboot', 'hassio', 'host_reboot') },
    { id: 'shutdown', label: tr('Éteindre'), desc: tr('Arrêt complet · rallumage physique requis'), col: '248,113,113', run: () => power('shutdown', 'hassio', 'host_shutdown') },
  ];

  return (
    <div className="loggia-content" style={{ padding: '26px 28px 56px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 36, fontWeight: 500 }}>{tr('Système')}</h1>
          <div style={{ fontSize: 13, color: 'var(--o-text2)', fontWeight: 600, marginTop: 5 }}>{machinesOnline > 1 ? tr('{n} machines en ligne', { n: machinesOnline }) : tr('{n} machine en ligne', { n: machinesOnline })} · {tr('relevé')} {relFetch}</div>
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, padding: '6px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', background: alerts.length ? 'rgba(var(--o-warn2-rgb),.14)' : 'rgba(var(--o-ok-rgb),.14)', color: alerts.length ? 'var(--o-warn2)' : 'var(--o-ok)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: alerts.length ? 'var(--o-warn2)' : 'var(--o-ok)' }} />{alerts.length ? tr('{n} À SURVEILLER', { n: alerts.length }) : tr('TOUT VA BIEN')}</span>
      </div>

      {/* reglages rapides : alimentation (2 temps), periode d'historique, rafraichir */}
      <div className="o-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 'var(--o-radius,18px)', background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Alimentation')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {powerActions.map(ac => (
              <button key={ac.id} onClick={ac.run} title={ac.desc} style={{ padding: '5px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', border: armed === ac.id ? '1px solid rgba(' + ac.col + ',.65)' : (ac.id === 'shutdown' ? '1px solid rgba(' + ac.col + ',.3)' : 'none'), background: armed === ac.id ? 'rgba(' + ac.col + ',.24)' : (ac.id === 'shutdown' ? 'rgba(' + ac.col + ',.08)' : 'var(--o-s1)'), color: (ac.id === 'shutdown' || armed === ac.id) ? 'rgb(' + ac.col + ')' : 'var(--o-text1)' }}>{armed === ac.id ? tr('Confirmer ?') : ac.label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 8px 5px 11px', borderRadius: 10, background: 'var(--o-s2)' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text2)', whiteSpace: 'nowrap' }}>{tr('Historique')}</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[[1, tr('{n} h', { n: 1 })], [24, tr('{n} h', { n: 24 })], [168, tr('{n} j', { n: 7 })]].map(([h, lb]) => (
              <button key={h} onClick={() => { setPeriod(h); setLastFetch(new Date()); }} style={{ padding: '5px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: period === h ? 'rgba(var(--o-accent-rgb),.18)' : 'transparent', color: period === h ? 'var(--o-accent-soft)' : 'var(--o-text2)' }}>{lb}</button>
            ))}
          </div>
        </div>
        <button onClick={doRefresh} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 10, background: 'var(--o-s2)', border: 'var(--o-bw,1px) solid var(--o-bd1)', color: 'var(--o-text1)', fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}><Fi i="refresh" size={13} />{tr('Rafraîchir')}</button>
        <span style={{ flex: 1 }} />
      </div>

      {/* La machine qui porte Home Assistant, dans le gabarit d'Atrium : le
        * chiffre qui compte en grand, le reste en une ligne, l'état en pied.
        * Le détail repliable a disparu avec les panneaux de réglages. */}
      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Machine')}</div>
      <SysCarteHote nom={SYSN.host} logo={BRAND_ICONS.haos} online={hOnline}
        cpu={hCpu} mem={hMemPct} disque={hDisk} temp={hTemp} uptime={hUp}
        courbe={hist[SYS.host.memUsed]} courbeLbl={tr('Mémoire') + ' · ' + perLbl} col={lvlCol(hMemPct)} />

      <div style={{ fontFamily: "'Newsreader',serif", fontStyle: 'italic', fontSize: 19, color: 'var(--o-text2)' }}>{tr('Journal système')}</div>
      <div style={{ background: 'var(--o-surfA)', border: 'var(--o-bw,1px) solid var(--o-bd2)', borderRadius: 'var(--o-radius,18px)', padding: '18px 22px', boxShadow: 'var(--o-shadow,0 14px 36px rgba(0,0,0,.34))' }}>
        {logbook && logbook.length
          ? <div className="o-optlist" style={{ display: 'flex', flexDirection: 'column' }}>
              {logbook.map((e, li) => {
                const dt = new Date(e.when || e.last_changed || 0);
                const hm = isNaN(dt.getTime()) ? '' : String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
                return (
                  <div key={li} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--o-text3)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, marginTop: 1 }}>{hm}</span>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--o-ok)', flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{e.name || e.entity_id}{e.message ? ' ' + e.message : e.state ? ' → ' + e.state : ''}</div>
                  </div>
                );
              })}
            </div>
          : <div style={{ padding: '6px 0', fontSize: 12, fontWeight: 600, color: 'var(--o-text3)' }}>{logbook === null ? tr('Journal indisponible sur cet accès.') : tr('Aucun événement système sur 24 h.')}</div>}
      </div>
      {/* Le journal de TOUTE la maison — le pendant global du journal système
          ci-dessus, poussé en direct par le logbook. */}
      <RoomActivityCard hass={hass} ids={null} max={14} titre={tr('Journal de la maison')} sous={tr('Tout ce qui a bougé, pièces confondues — 24 h, en direct')} />
    </div>
  );
}

export default SystemeContent;
