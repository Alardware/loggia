/* ── Les trois emplacements de machine ──────────────────────────────────────
 *
 * Quelles entites decrivent les machines, et comment on les nomme. C'est de la
 * configuration, pas de l'interface : `App.jsx` en a besoin AVANT que la vue
 * Systeme ne se charge, pour savoir a quels capteurs s'abonner. Le laisser dans
 * la vue aurait force son chargement au demarrage, ce qui annulait la raison
 * meme de l'avoir sortie. */
import { LOGGIA_RESOLVED, loggiaEnt } from './state.js';

export const sysKeys = () => Object.values(sysSensors()).flatMap(o => Object.values(o || {})).filter(Boolean);
export const SYS_SLOTS = ['host', 'nebula', 'ucg'];
// Trois emplacements de machine, remplis par la configuration, sinon par ce que
// la découverte a trouvé, sinon par les constantes. Un emplacement sans machine
// reste vide : la vue affiche alors « — » partout et la carte se dit hors ligne.
/* Les trois emplacements existent TOUJOURS, meme vides.
 *
 * On renvoyait `{}` quand rien n'etait connu, et `SYS.host.cpu` levait alors
 * une exception qui emportait la vue entiere. Le defaut ne se voyait pas tant
 * qu'on ouvrait forcement sur l'Accueil : le temps d'atteindre Systeme, la
 * decouverte avait repondu. Depuis que la vue courante survit au rechargement,
 * on peut arriver ici avant elle — et l'ecran d'erreur remplacait le dashboard.
 *
 * Un emplacement vide se lit tres bien : chaque valeur vaut alors `undefined`,
 * `num()` rend `null`, et la carte affiche des tirets en se disant hors ligne.
 * C'est exactement ce que le commentaire de `SYS_SLOTS` promet. */
export const SYS_VIDE = () => ({ host: {}, nebula: {}, ucg: {} });

export function sysSensors() {
  const cfg = loggiaEnt('system', null);
  if (cfg && typeof cfg === 'object') return { ...SYS_VIDE(), ...cfg };
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.system;
  if (r && r.available && r.hosts.length) {
    const out = SYS_VIDE();
    SYS_SLOTS.forEach((k, i) => {
      const h = r.hosts[i];
      out[k] = h ? { cpu: h.cpu, memPct: h.memPct, mem: h.memPct, disk: h.disk, temp: h.temp, uptime: h.uptime, online: h.online, clients: h.clients } : {};
    });
    return out;
  }
  return SYS_VIDE();
}
// Nom affiché de chaque emplacement : celui de l'appareil Home Assistant quand
// c'est la découverte qui a rempli l'emplacement, sinon le libellé historique.
// Libellés d'attente : ils ne s'affichent que le temps de la découverte, ou
// pour un emplacement resté vide.
export const SYS_NAMES_DEF = { host: 'Machine 1', nebula: 'Machine 2', ucg: 'Machine 3' };
export function sysNames() {
  const cfg = loggiaEnt('sysNames', null);
  const out = { ...SYS_NAMES_DEF, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.system;
  if (r && r.available && r.hosts.length && !loggiaEnt('system', null)) {
    SYS_SLOTS.forEach((k, i) => { if (r.hosts[i]) out[k] = r.hosts[i].name; });
  }
  return out;
}
