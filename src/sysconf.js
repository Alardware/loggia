/* ── Les trois emplacements de machine ──────────────────────────────────────
 *
 * Quelles entites decrivent les machines, et comment on les nomme. C'est de la
 * configuration, pas de l'interface : `App.jsx` en a besoin AVANT que la vue
 * Systeme ne se charge, pour savoir a quels capteurs s'abonner. Le laisser dans
 * la vue aurait force son chargement au demarrage, ce qui annulait la raison
 * meme de l'avoir sortie. */
import { LOGGIA_INDEX, LOGGIA_RESOLVED, loggiaEnt, getHass } from './state.js';
import { siblingsOf } from './discovery.js';
import { capteursHote } from './resolve.js';
import { tr } from './i18n.js';

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
const SYS_VIDE = () => ({ host: {}, nebula: {}, ucg: {} });

/* Ce que la table ne nomme pas se ramasse sur l'appareil du capteur de charge :
 * le swap, la mémoire en octets, les débits de l'interface branchée (vue
 * Système, ADR 0037). La table PRIME — un capteur choisi à la main n'est jamais
 * remplacé. Le ramassage balaie tout l'index : il se fait une fois par index et
 * par capteur de référence, pas à chaque rendu (`sysKeys` est lu à chaque tour
 * d'`App`). Tant que les états ne sont pas là, rien n'est retenu. */
let _freres = { index: null, cle: '', extra: null };
function freresDeLHote(host) {
  const refs = [host.cpu, host.cpuAlt].filter(Boolean);
  const cle = refs.join('|');
  if (!LOGGIA_INDEX || !cle) return {};
  if (_freres.index === LOGGIA_INDEX && _freres.cle === cle) return _freres.extra;
  const h = getHass();
  const S = h && h.states;
  if (!S || !refs.some(ref => S[ref])) return {};
  const extra = {};
  refs.forEach(ref => {
    const e = capteursHote(siblingsOf(LOGGIA_INDEX, ref), S);
    Object.keys(e).forEach(k => { if (!extra[k]) extra[k] = e[k]; });
  });
  _freres = { index: LOGGIA_INDEX, cle, extra };
  return extra;
}
const avecFreres = (table) => ({ ...table, host: { ...freresDeLHote(table.host || {}), ...(table.host || {}) } });

/**
 * Les capteurs des machines : LA DECOUVERTE, COMPLETEE PAR LA FICHE.
 *
 * La fiche faisait foi seule des qu'elle existait : remplir UN emplacement
 * faisait perdre les deux autres, que la decouverte connaissait pourtant
 * (07/10, « tout doit etre operationnel »).
 *
 * La granularite est l'EMPLACEMENT. Celui que la fiche declare lui appartient
 * — meme vide, c'est un choix, et on ne ressuscite pas une machine qu'on vient
 * d'en retirer. Les autres restent a la decouverte.
 */
export function sysSensors() {
  const cfg = loggiaEnt('system', null);
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.system;
  const out = SYS_VIDE();
  if (r && r.available && Array.isArray(r.hosts) && r.hosts.length) {
    SYS_SLOTS.forEach((k, i) => {
      const h = r.hosts[i];
      if (h) out[k] = { cpu: h.cpu, memPct: h.memPct, mem: h.memPct, disk: h.disk, temp: h.temp, uptime: h.uptime, online: h.online, clients: h.clients };
    });
  }
  if (cfg && typeof cfg === 'object') {
    SYS_SLOTS.forEach(k => {
      if (Object.prototype.hasOwnProperty.call(cfg, k)) out[k] = cfg[k] || {};
    });
  }
  return avecFreres(out);
}
// Nom affiché de chaque emplacement : celui de l'appareil Home Assistant quand
// c'est la découverte qui a rempli l'emplacement, sinon le libellé historique.
// Libellés d'attente : ils ne s'affichent que le temps de la découverte, ou
// pour un emplacement resté vide. Une fonction, dite au rendu dans la langue
// de l'écran (audit du 03/10) : « Machine 1 » restait en français partout.
const SYS_NAMES_DEF = () => ({ host: tr('Machine {n}', { n: 1 }), nebula: tr('Machine {n}', { n: 2 }), ucg: tr('Machine {n}', { n: 3 }) });
export function sysNames() {
  /* TROIS SOURCES, DANS CET ORDRE : le libelle d'attente, le nom que l'appareil
   * porte dans Home Assistant, puis celui qu'on a ecrit soi-meme.
   *
   * La decouverte etait coupee des qu'une fiche de capteurs existait, et elle
   * passait APRES le nom choisi, qu'elle ecrasait. Une machine designee a la
   * main restait donc « Machine 2 » (07/10). */
  const out = { ...SYS_NAMES_DEF() };
  const r = LOGGIA_RESOLVED && LOGGIA_RESOLVED.system;
  if (r && r.available && Array.isArray(r.hosts) && r.hosts.length) {
    SYS_SLOTS.forEach((k, i) => { if (r.hosts[i] && r.hosts[i].name) out[k] = r.hosts[i].name; });
  }
  const cfg = loggiaEnt('sysNames', null);
  if (cfg && typeof cfg === 'object') Object.keys(cfg).forEach(k => { if (cfg[k]) out[k] = cfg[k]; });
  return out;
}
