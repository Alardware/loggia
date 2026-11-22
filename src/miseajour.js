/* ── Installer une mise à jour, avec ou sans sauvegarde (chantier du 20/11, P13 ; ADR 0382) ──
 *
 * Pur, chargé avec les Paramètres. Une entité `update.*` qui sait sauvegarder
 * avant d'installer le dit par le bit 8 de `supported_features`
 * (`UpdateEntityFeature.BACKUP` de Home Assistant ; `capabilities.js` le nomme
 * `backup`). À celle-là seulement, et si la bascule est mise, l'ordre porte
 * `backup: true` ; aux autres, l'ordre reste ce qu'il était.
 */

/** L'entité `update.*` sait-elle sauvegarder avant d'installer ? */
export function accepteSauvegarde(st) {
  const f = Number(st && st.attributes && st.attributes.supported_features);
  return Number.isFinite(f) && (f & 8) === 8;
}

/** Les données de `update.install` pour une mise à jour `{ id, sauvegarde }`. */
export function donneesInstall(u, sauver) {
  return { entity_id: u.id, ...(sauver && u.sauvegarde ? { backup: true } : {}) };
}
