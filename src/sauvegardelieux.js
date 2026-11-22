/* ── La dernière sauvegarde, emplacement par emplacement (chantier du 20/11, P10 ; ADR 0383) ──
 *
 * Pur, chargé avec la vue Système. Le cas silencieux : la sauvegarde « réussit » sur la machine, mais sa copie chez Nabu Casa n'est
 * pas partie. Home Assistant le garde pour chaque sauvegarde (`backup/info`, réservé aux administrateurs, lu dans sa source) :
 * `agents` les emplacements où elle est, `failed_agent_ids` ceux où la copie a échoué, `failed_addons` / `failed_folders` ce qui
 * manque dedans. Les noms viennent de `backup/agents/info` ; la machine et Nabu Casa ont le leur.
 */
import { tr } from './i18n.js';

const NOMS = { 'hassio.local': () => tr('Cette machine'), 'backup.local': () => tr('Cette machine'), 'cloud.cloud': () => 'Nabu Casa' };

function nomLieu(id, agents) {
  if (NOMS[id]) return NOMS[id]();
  const a = (Array.isArray(agents) ? agents : []).find(x => x && x.agent_id === id);
  return (a && a.name) || String(id).split('.').pop();
}

/** `{ t, lieux: [{ id, nom, ok }], manques, echec }` pour la sauvegarde la plus récente ; null sans sauvegarde lisible. */
export function lieuxSauvegarde(info, agents = []) {
  const liste = info && Array.isArray(info.backups) ? info.backups.filter(b => b && Number.isFinite(Date.parse(b.date))) : [];
  if (!liste.length) return null;
  const b = liste.reduce((x, y) => (Date.parse(y.date) > Date.parse(x.date) ? y : x));
  const ok = Object.keys(b.agents && typeof b.agents === 'object' ? b.agents : {});
  const ko = (Array.isArray(b.failed_agent_ids) ? b.failed_agent_ids : []).filter(id => ok.indexOf(id) < 0);
  const lieux = [...ok.map(id => ({ id, ok: true })), ...ko.map(id => ({ id, ok: false }))].map(l => ({ ...l, nom: nomLieu(l.id, agents) }));
  const manques = (Array.isArray(b.failed_addons) ? b.failed_addons.length : 0) + (Array.isArray(b.failed_folders) ? b.failed_folders.length : 0);
  return { t: Date.parse(b.date), lieux, manques, echec: ko.length > 0 || manques > 0 };
}

/** Faut-il le dire ? Seulement quand il y a plusieurs emplacements, ou un échec : une seule copie réussie ne dit rien de plus. */
export const aDireLieux = (l) => !!l && (l.echec || l.lieux.length > 1);
