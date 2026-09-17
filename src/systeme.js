/* ── La vue Système, sans React ─────────────────────────────────────────────
 *
 * Tout ce que la vue d'une machine Home Assistant OS calcule avant de dessiner :
 * les tuiles de mesure, les soixante barres de la dernière heure, les versions,
 * les modules complémentaires, le réseau, le journal.
 *
 * UNE RÈGLE : rien ne s'affiche sans source. Chaque fonction rend `null`, une
 * liste vide ou une ligne de moins quand sa donnée manque — jamais une valeur
 * de décor. Les sources sont celles de Home Assistant : les capteurs de
 * l'appareil qui publie la charge processeur (System Monitor, Glances…), les
 * entités `update.*`, et le Superviseur (`supervisor/api`), que seul un
 * administrateur peut interroger. Sans lui la vue se réduit, elle n'invente pas.
 *
 * Pur : pas de React, pas de Home Assistant, testable à sec
 * (tests/systeme_hoas.test.mjs).
 */
import { tr, locale, comparerTextes } from './i18n.js';

/* ── Les seuils ──────────────────────────────────────────────────────────────
 * [à surveiller, critique]. La mémoire et le disque reprennent les seuils des
 * alertes historiques de la vue (85 / 92) ; la température suit la plage où un
 * processeur commence à brider (70) puis s'y tient (80). */
export const SEUILS = { cpu: [70, 90], memoire: [85, 92], temperature: [70, 80], disque: [85, 92], swap: [60, 85] };

export function niveau(v, seuils) {
  if (v == null || isNaN(v) || !seuils) return 'ok';
  return v >= seuils[1] ? 'bad' : v >= seuils[0] ? 'warn' : 'ok';
}

/* ── Les tailles ─────────────────────────────────────────────────────────────
 * Les capteurs publient des Mio, le Superviseur des « GB » qui sont des Gio :
 * tout passe par l'octet, et s'affiche en puissances de 1024 sous les noms
 * courants (Go, Mo), comme le fait Home Assistant. */
const FACTEURS = { B: 1, kB: 1e3, KB: 1e3, KiB: 1024, MB: 1e6, MiB: 1024 ** 2, GB: 1e9, GiB: 1024 ** 3, TB: 1e12, TiB: 1024 ** 4 };
const PALIERS = [['To', 1024 ** 4], ['Go', 1024 ** 3], ['Mo', 1024 ** 2], ['Ko', 1024]];

export const estTaille = (unite) => Object.prototype.hasOwnProperty.call(FACTEURS, String(unite));

export function enOctets(valeur, unite) {
  const n = typeof valeur === 'number' ? valeur : parseFloat(valeur);
  if (isNaN(n) || !estTaille(unite)) return null;
  return n * FACTEURS[unite];
}

export function nombre(n, decimales = 0) {
  return Number(n).toLocaleString(locale(), { maximumFractionDigits: decimales, minimumFractionDigits: 0 });
}

export function uniteDe(octets) {
  for (const [u, k] of PALIERS) if (octets >= k) return u;
  return 'Ko';
}

/** « 1,9 Go », « 412 Mo ». Une décimale sous dix, aucune au-delà. */
export function tailleLisible(octets, unite = null) {
  if (octets == null || isNaN(octets) || octets < 0) return null;
  const u = unite || uniteDe(octets);
  const palier = PALIERS.find(p => p[0] === u);
  if (!palier) return null;
  const v = octets / palier[1];
  // Le nom de l'unité se traduit (« Go » se dit « GB ») : des littéraux, que le catalogue retrouve.
  const noms = { To: tr('To'), Go: tr('Go'), Mo: tr('Mo'), Ko: tr('Ko') };
  return nombre(v, v < 10 ? 1 : 0) + ' ' + noms[u];
}

/** « 2,5 Go / 8 Go » : l'utilisé se dit dans l'unité du total. */
export function paireTailles(utilise, total) {
  if (utilise == null || total == null || isNaN(utilise) || isNaN(total) || total <= 0) return null;
  return tailleLisible(utilise, uniteDe(total)) + ' / ' + tailleLisible(total);
}

/* ── La machine ──────────────────────────────────────────────────────────────
 * Le Superviseur nomme la carte par un code (`rpi5-64`). Un code inconnu
 * s'affiche tel quel : mieux vaut un nom brut qu'un nom deviné. */
const CARTES = {
  'rpi5-64': 'Raspberry Pi 5', 'rpi4-64': 'Raspberry Pi 4', rpi4: 'Raspberry Pi 4', 'rpi3-64': 'Raspberry Pi 3', rpi3: 'Raspberry Pi 3',
  rpi2: 'Raspberry Pi 2', yellow: 'Home Assistant Yellow', green: 'Home Assistant Green',
  'odroid-n2': 'ODROID-N2', 'odroid-c2': 'ODROID-C2', 'odroid-c4': 'ODROID-C4', 'odroid-m1': 'ODROID-M1', 'odroid-m1s': 'ODROID-M1S', 'odroid-xu4': 'ODROID-XU4',
  'generic-x86-64': 'PC x86-64', 'generic-aarch64': 'ARM 64 bits', 'khadas-vim3': 'Khadas VIM3', tinker: 'ASUS Tinker Board',
};

export function nomCarte(board) {
  if (!board) return null;
  if (board === 'ova') return tr('Machine virtuelle');
  return CARTES[board] || String(board);
}

/** « 12 j 6 h », « 6 h 12 min », « 12 min ». */
export function dureeLisible(secondes) {
  if (secondes == null || isNaN(secondes) || secondes < 0) return null;
  const j = Math.floor(secondes / 86400), h = Math.floor((secondes % 86400) / 3600), m = Math.floor((secondes % 3600) / 60);
  if (j > 0) return tr('{n} j', { n: j }) + ' ' + tr('{n} h', { n: h });
  if (h > 0) return tr('{n} h', { n: h }) + ' ' + tr('{n} min', { n: m });
  return tr('{n} min', { n: m });
}

/** Secondes écoulées depuis le démarrage. Le Superviseur compte en
 * MICROsecondes depuis 1970 ; d'autres sources en millisecondes, en secondes,
 * ou donnent une date. L'ordre de grandeur les départage. */
export function depuisDemarrage(demarrage, maintenant) {
  if (demarrage == null || demarrage === '') return null;
  let ms;
  if (typeof demarrage === 'number' || /^\s*\d+(\.\d+)?\s*$/.test(String(demarrage))) {
    const n = Number(demarrage);
    ms = n > 1e14 ? n / 1000 : n > 1e11 ? n : n * 1000;
  } else ms = Date.parse(String(demarrage));
  if (isNaN(ms) || ms <= 0) return null;
  const sec = (maintenant - ms) / 1000;
  return sec < 0 ? 0 : sec;
}

/* Durée de fonctionnement d'un CAPTEUR, quelle que soit la forme sous laquelle
 * l'intégration la publie : « 5 days, 03:12 », un nombre de secondes, ou un
 * horodatage de démarrage. Le mot du jour se lit dans plusieurs langues — un
 * capteur allemand écrit « Tag », un espagnol « dia ». */
const UPT_JOUR = /(\d+)\s*(?:days?|jours?|tage?|d[ií]as?|giorni?|dias?)/i;
export function dureeCapteur(brut, maintenant) {
  if (brut == null || brut === '' || brut === 'unknown' || brut === 'unavailable') return null;
  const s = String(brut);
  /* La date D'ABORD : « 2026-09-16T10:00:00 » contient « 10:00 », que le motif
   * des heures prenait pour dix heures de fonctionnement — le capteur « dernier
   * démarrage » de System Monitor affichait l'heure du démarrage, pas la durée. */
  if (/^\s*\d{4}-\d{2}-\d{2}[T ]/.test(s)) {
    const d = Date.parse(s);
    return isNaN(d) ? s : dureeLisible(Math.max(0, (maintenant - d) / 1000));
  }
  const dm = s.match(UPT_JOUR), tm = s.match(/(\d+):(\d+)/);
  if (dm || tm) return dureeLisible((dm ? +dm[1] : 0) * 86400 + (tm ? +tm[1] * 3600 + +tm[2] * 60 : 0));
  if (/^\s*[\d.]+\s*$/.test(s)) { const n = parseFloat(s); return !isNaN(n) && n > 600 ? dureeLisible(n) : s; }
  const t = Date.parse(s);
  if (!isNaN(t)) return dureeLisible(Math.max(0, (maintenant - t) / 1000));
  return s;
}

/* (Les capteurs frères — swap, mémoire en octets, débits — se ramassent dans
 * `resolve.js`, avec les autres motifs de la découverte : `capteursHote`.) */

/* ── Les tuiles de mesure ────────────────────────────────────────────────────
 * Une tuile par mesure CONNUE. La couleur est celle de la maquette, tuile par
 * tuile ; le niveau (seuils) la remplace quand la mesure demande un regard. */
export function tuilesMesures({ cpu = null, cpuMoyenne = null, memPct = null, memUtilise = null, memTotal = null, temp = null,
  disquePct = null, disqueUtilise = null, disqueTotal = null, swapPct = null, swapUtilise = null, swapTotal = null } = {}) {
  const pct = (v) => Math.max(0, Math.min(100, v));
  const out = [];
  // Ni cœurs ni fréquence : Home Assistant ne les publie pas. La moyenne de l'heure, si.
  if (cpu != null) out.push({ cle: 'cpu', icone: 'microchip', titre: tr('Processeur'), court: 'CPU', valeur: nombre(cpu) + ' %', sous: cpuMoyenne != null ? tr('moy. {n} % sur 1 h', { n: nombre(cpuMoyenne) }) : null, pct: pct(cpu), rgb: 'var(--o-accent-rgb)', couleur: 'var(--o-accent-soft)', niveau: niveau(cpu, SEUILS.cpu) });
  const mem = memPct != null ? memPct : (memUtilise != null && memTotal > 0 ? memUtilise / memTotal * 100 : null);
  // Le pourcentage en métrique, comme les autres tuiles ; les tailles dessous.
  if (mem != null) out.push({ cle: 'memoire', icone: 'memory', titre: tr('Mémoire'), court: 'RAM', valeur: nombre(mem) + ' %', sous: paireTailles(memUtilise, memTotal), pct: pct(mem), rgb: 'var(--o-purple-rgb)', couleur: 'var(--o-purple)', niveau: niveau(mem, SEUILS.memoire) });
  if (temp != null) out.push({ cle: 'temperature', icone: 'thermometer-half', titre: tr('Température CPU'), court: tr('Temp.'), valeur: nombre(temp) + ' °C', sous: tr('alerte à {n} °C', { n: SEUILS.temperature[1] }), pct: pct(temp), rgb: 'var(--o-warn2-rgb)', couleur: 'var(--o-warn2)', niveau: niveau(temp, SEUILS.temperature) });
  const disque = disquePct != null ? disquePct : (disqueUtilise != null && disqueTotal > 0 ? disqueUtilise / disqueTotal * 100 : null);
  if (disque != null) out.push({ cle: 'disque', icone: 'hdd', titre: tr('Disque'), court: tr('Disque'), valeur: nombre(disque) + ' %', sous: paireTailles(disqueUtilise, disqueTotal), pct: pct(disque), rgb: 'var(--o-ok-rgb)', couleur: 'var(--o-ok)', niveau: niveau(disque, SEUILS.disque) });
  const swap = swapPct != null ? swapPct : (swapUtilise != null && swapTotal > 0 ? swapUtilise / swapTotal * 100 : null);
  if (swap != null) out.push({ cle: 'swap', icone: 'exchange', titre: 'Swap', court: 'Swap', valeur: nombre(swap) + ' %', sous: paireTailles(swapUtilise, swapTotal), pct: pct(swap), rgb: 'var(--o-cyan-rgb)', couleur: 'var(--o-cyan)', niveau: niveau(swap, SEUILS.swap) });
  return out;
}

/* ── La charge, minute par minute ────────────────────────────────────────────
 * Home Assistant ne note que les CHANGEMENTS : une minute sans point n'est pas
 * une minute sans mesure, c'est une minute où la valeur n'a pas bougé. Elle
 * reprend donc la dernière valeur connue. Avant le tout premier point il n'y a
 * rien à reprendre : `null`, et la barre ne se dessine pas. */
export function seaux(points, fin, n = 60, pas = 60000) {
  const debut = fin - n * pas;
  const sommes = new Array(n).fill(0), comptes = new Array(n).fill(0), derniers = new Array(n).fill(null);
  let avant = null;
  [...(points || [])].filter(p => p && !isNaN(p.v) && !isNaN(p.t)).sort((a, b) => a.t - b.t).forEach(p => {
    if (p.t < debut) { avant = p.v; return; }
    if (p.t > fin) return;
    const i = Math.min(n - 1, Math.floor((p.t - debut) / pas));
    sommes[i] += p.v; comptes[i] += 1; derniers[i] = p.v;
  });
  const out = [];
  let courant = avant;
  for (let i = 0; i < n; i++) {
    if (comptes[i]) { out.push(sommes[i] / comptes[i]); courant = derniers[i]; }
    else out.push(courant);
  }
  return out;
}

export function resumeSerie(valeurs) {
  const v = (valeurs || []).filter(x => x != null && !isNaN(x));
  if (!v.length) return null;
  return { dernier: v[v.length - 1], moyenne: v.reduce((a, x) => a + x, 0) / v.length, pic: Math.max(...v) };
}

/* ── Les versions ────────────────────────────────────────────────────────────
 * Les entités `update.*` du Superviseur font foi (elles vivent dans les états,
 * sans droit particulier) ; à défaut, ce que le Superviseur répond. La quatrième
 * ligne est l'interface que l'on regarde : Loggia. Sans entité de mise à jour
 * pour elle, la version s'affiche SANS pastille — on ne sait pas, on ne dit pas. */
/* Les entités se reconnaissent à leur attribut `title`, que l'intégration pose
 * en dur et ne traduit pas — jamais à leur identifiant, qui change avec la
 * langue de l'installation (`…_mise_a_jour` chez un module français). */
const TITRES_MAJ = { core: 'Home Assistant Core', supervisor: 'Home Assistant Supervisor', os: 'Home Assistant Operating System' };

function entiteMaj(S, cle) {
  if (!S) return null;
  const id = Object.keys(S).find(k => k.indexOf('update.') === 0 && S[k].attributes && S[k].attributes.title === TITRES_MAJ[cle]);
  return id ? S[id] : null;
}

function ligneVersion(cle, nom, st, info, repli = null) {
  const a = (st && st.attributes) || {};
  const vivant = !!st && st.state !== 'unavailable' && st.state !== 'unknown';
  const version = (vivant && a.installed_version) || (info && info.version) || repli;
  if (!version) return null;
  let etat = null, cible = null;
  if (vivant) { etat = st.state === 'on' ? 'dispo' : 'ajour'; cible = st.state === 'on' ? (a.latest_version || null) : null; }
  else if (info && info.version && typeof info.update_available === 'boolean') { etat = info.update_available ? 'dispo' : 'ajour'; cible = info.update_available ? (info.version_latest || null) : null; }
  return { cle, nom, version: String(version), etat, cible: cible ? String(cible) : null };
}

export function lignesVersions({ S = null, core = null, supervisor = null, os = null, versionCore = null, versionLoggia = null } = {}) {
  const loggiaId = S ? Object.keys(S).find(k => k.indexOf('update.') === 0 && /loggia/i.test(k + ' ' + ((S[k].attributes && (S[k].attributes.title || S[k].attributes.friendly_name)) || ''))) : null;
  return [
    ligneVersion('core', 'Home Assistant Core', entiteMaj(S, 'core'), core, versionCore),
    ligneVersion('supervisor', tr('Superviseur'), entiteMaj(S, 'supervisor'), supervisor),
    ligneVersion('os', tr('Système d’exploitation'), entiteMaj(S, 'os'), os),
    ligneVersion('interface', tr('Interface'), loggiaId ? S[loggiaId] : null, null, versionLoggia),
  ].filter(Boolean);
}

/* ── La dernière sauvegarde ──────────────────────────────────────────────────
 * La plus RÉCENTE, et l'on dit si elle est complète. Remonter à la dernière
 * complète ferait passer une sauvegarde de trois mois pour la dernière. */
export function derniereSauvegarde(sauvegardes) {
  let mieux = null;
  (sauvegardes || []).forEach(b => {
    const t = b && b.date ? Date.parse(b.date) : NaN;
    if (isNaN(t)) return;
    if (!mieux || t > mieux.t) {
      const octets = b.size_bytes != null ? Number(b.size_bytes) : b.size != null ? Number(b.size) * 1024 ** 2 : null;
      mieux = { t, octets: octets != null && !isNaN(octets) ? octets : null, complete: b.type === 'full' };
    }
  });
  return mieux;
}

/** « aujourd’hui, 03:00 », « hier, 03:00 », « 14 sept., 03:00 ». */
export function momentLisible(t, maintenant) {
  const d = new Date(t), n = new Date(maintenant);
  if (isNaN(d.getTime())) return null;
  const heure = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const jour = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ecart = Math.round((jour(n) - jour(d)) / 86400000);
  const quand = ecart === 0 ? tr('aujourd’hui') : ecart === 1 ? tr('hier') : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
  return quand + ', ' + heure;
}

/* ── Les modules complémentaires ─────────────────────────────────────────────
 * Ceux qui tournent d'abord, puis l'alphabet. Les mesures ne viennent que des
 * modules démarrés : un module arrêté n'a ni processeur ni mémoire à montrer. */
export function modulesComplementaires(addons, stats) {
  const liste = (addons || []).filter(a => a && a.slug).map(a => {
    const demarre = a.state === 'started';
    const s = (demarre && stats && stats[a.slug]) || null;
    const cpu = s && s.cpu_percent != null && !isNaN(s.cpu_percent) ? Number(s.cpu_percent) : null;
    const ram = s && s.memory_usage != null && !isNaN(s.memory_usage) ? Number(s.memory_usage) : null;
    const ramPct = s && s.memory_percent != null && !isNaN(s.memory_percent) ? Number(s.memory_percent)
      : (ram != null && s.memory_limit > 0 ? ram / s.memory_limit * 100 : null);
    return { slug: a.slug, nom: a.name || a.slug, version: a.version != null ? String(a.version) : null,
      cible: a.update_available && a.version_latest ? String(a.version_latest) : null,
      demarre, erreur: a.state === 'error', icone: !!a.icon, cpu, ram, ramPct };
  });
  liste.sort((a, b) => (a.demarre === b.demarre ? comparerTextes(a.nom, b.nom) : a.demarre ? -1 : 1));
  return { liste, enCours: liste.filter(m => m.demarre).length, total: liste.length };
}

/* ── Le réseau et le stockage ────────────────────────────────────────────── */
export function interfaceReseau(reseau) {
  const liste = (reseau && reseau.interfaces) || [];
  const i = liste.find(x => x && x.primary) || liste.find(x => x && x.connected && x.ipv4 && (x.ipv4.address || []).length);
  if (!i) return null;
  const adr = i.ipv4 && Array.isArray(i.ipv4.address) && i.ipv4.address[0] ? String(i.ipv4.address[0]).split('/')[0] : null;
  if (!adr) return null;
  return { ip: adr, nom: i.interface || null, type: i.type === 'ethernet' ? 'Ethernet' : i.type === 'wireless' ? 'Wi-Fi' : null };
}

/** Le débit d'un capteur, avec SON unité : « 4,2 Mbit/s ». */
export function debitLisible(st) {
  if (!st) return null;
  const n = parseFloat(st.state);
  if (isNaN(n)) return null;
  const u = (st.attributes && st.attributes.unit_of_measurement) || '';
  return (nombre(n, n < 10 ? 1 : 0) + ' ' + u).trim();
}

const MOTEURS = { sqlite: 'SQLite', mysql: 'MySQL', postgresql: 'PostgreSQL' };
/** Ce que l'enregistreur dit de sa base (`system_health/info`) : « 1423.5 MiB », « mysql ». */
export function baseDeDonnees(info) {
  if (!info) return null;
  const m = String(info.estimated_db_size == null ? '' : info.estimated_db_size).match(/([\d.]+)\s*([A-Za-z]+)/);
  const octets = m ? enOctets(m[1], m[2]) : null;
  const brut = info.database_engine ? String(info.database_engine).toLowerCase() : '';
  const moteur = brut === 'mysql' && /mariadb/i.test(String(info.database_version || '')) ? 'MariaDB' : (MOTEURS[brut] || (brut || null));
  if (octets == null && !moteur) return null;
  return { octets, moteur };
}

/** Nabu Casa : une ligne seulement si un compte est connecté à cette instance. */
export function etatCloud(statut) {
  if (!statut || !statut.logged_in) return null;
  return statut.cloud === 'connected' ? 'connecte' : statut.cloud === 'connecting' ? 'connexion' : 'deconnecte';
}

/* ── Le journal ──────────────────────────────────────────────────────────────
 * Deux sources, un seul fil : le journal d'erreurs de Home Assistant
 * (`system_log/list` — avertissements et erreurs) et le logbook des entités
 * système (mises à jour, machine en ligne). Vingt-quatre heures, le plus récent
 * d'abord. */
const NIVEAUX = { CRITICAL: 'erreur', FATAL: 'erreur', ERROR: 'erreur', WARNING: 'avert', WARN: 'avert' };

export function origineJournal(nom) {
  const p = String(nom || '').split('.');
  const i = p.indexOf('components');
  if (i >= 0 && p[i + 1]) return p[i + 1];
  if (p[0] === 'custom_components' && p[1]) return p[1];
  return p[p.length - 1] || null;
}

export function journalSysteme({ erreurs = null, logbook = null, maintenant, max = 8 } = {}) {
  const seuil = maintenant - 24 * 3600 * 1000;
  const lignes = [];
  (erreurs || []).forEach(e => {
    if (!e) return;
    const t = Number(e.timestamp) * 1000;
    if (isNaN(t) || t < seuil) return;
    const msg = Array.isArray(e.message) ? e.message[0] : e.message;
    const detail = String(msg == null ? '' : msg).split(String.fromCharCode(10))[0].slice(0, 160);
    lignes.push({ t, niveau: NIVEAUX[String(e.level || '').toUpperCase()] || 'info', titre: origineJournal(e.name) || 'Home Assistant',
      detail: detail + (e.count > 1 ? ' (×' + e.count + ')' : '') });
  });
  (logbook || []).forEach(e => {
    if (!e) return;
    const t = Date.parse(e.when || e.last_changed || '');
    if (isNaN(t) || t < seuil) return;
    const id = String(e.entity_id || '');
    const etat = e.state;
    if (etat === 'unavailable' || etat === 'unknown') return;
    const nom = e.name || id;
    if (id.indexOf('update.') === 0) {
      if (etat !== 'on' && etat !== 'off') return;
      lignes.push({ t, niveau: 'info', titre: etat === 'on' ? tr('Mise à jour disponible') : tr('Plus de mise à jour en attente'), detail: nom });
    } else if (id.indexOf('binary_sensor.') === 0 && (etat === 'on' || etat === 'off')) {
      lignes.push({ t, niveau: etat === 'on' ? 'info' : 'avert', titre: etat === 'on' ? tr('Machine en ligne') : tr('Machine hors ligne'), detail: nom });
    } else lignes.push({ t, niveau: 'info', titre: nom, detail: e.message ? String(e.message) : etat != null ? String(etat) : '' });
  });
  lignes.sort((a, b) => b.t - a.t);
  return { total: lignes.length, lignes: lignes.slice(0, max) };
}

/* ── Ce qui demande un regard ────────────────────────────────────────────────
 * Rare et actionnable : la mémoire et le disque qui débordent, le processeur qui
 * chauffe, la machine injoignable, un module en erreur. Une mise à jour en
 * attente n'en fait pas partie — elle se lit dans le panneau Versions. */
export function alertesSysteme({ memPct = null, memTexte = null, disquePct = null, temp = null, enLigne = true, modules = [] } = {}) {
  const out = [];
  if (!enLigne) out.push({ cle: 'horsligne', niveau: 'bad', texte: tr('Machine hors ligne — dernier état inconnu.') });
  if (memPct != null && memPct >= SEUILS.memoire[0]) out.push({ cle: 'memoire', niveau: niveau(memPct, SEUILS.memoire), texte: tr('Mémoire à {n} %', { n: Math.round(memPct) }) + (memTexte ? ' (' + memTexte + ')' : '') + ' ' + tr('— le cœur risque un redémarrage forcé.') });
  if (disquePct != null && disquePct >= SEUILS.disque[0]) out.push({ cle: 'disque', niveau: niveau(disquePct, SEUILS.disque), texte: tr('Partition /data à {n} % — prévoir une purge de la base ou des sauvegardes.', { n: Math.round(disquePct) }) });
  if (temp != null && temp >= SEUILS.temperature[0]) out.push({ cle: 'temperature', niveau: niveau(temp, SEUILS.temperature), texte: tr('Processeur à {n} °C — vérifier la ventilation.', { n: Math.round(temp) }) });
  (modules || []).filter(m => m && m.erreur).forEach(m => out.push({ cle: 'module:' + m.slug, niveau: 'bad', texte: tr('{nom} est en erreur.', { nom: m.nom }) }));
  return out;
}
