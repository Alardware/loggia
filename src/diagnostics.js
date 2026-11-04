/* Télécharger les diagnostics de Loggia depuis l'écran (04/11, ADR 0325).
 *
 * Le même fichier que Home Assistant › Appareils et services › Loggia › ⋮ ›
 * « Télécharger les diagnostics », sans quitter Loggia : l'entrée de Loggia
 * (`config_entries/get`), puis une adresse signée (`auth/sign_path`), que le
 * navigateur télécharge. Home Assistant ne le sert qu'à un administrateur. */

/** L'adresse des diagnostics de l'entrée `id`. */
const cheminDiagnostics = (id) => '/api/diagnostics/config_entry/' + encodeURIComponent(String(id));

export async function telechargerDiagnostics(hass, doc = document) {
  const entrees = await hass.callWS({ type: 'config_entries/get', domain: 'loggia' });
  const entree = Array.isArray(entrees) ? entrees.find(e => e && e.entry_id) : null;
  // Des erreurs SANS code : l'écran les dit par une phrase traduite (`motifEchec`), jamais par ce texte.
  if (!entree) throw new Error('no config entry');
  const signe = await hass.callWS({ type: 'auth/sign_path', path: cheminDiagnostics(entree.entry_id) });
  if (!signe || !signe.path) throw new Error('unsigned path');
  const a = doc.createElement('a');
  a.href = signe.path;
  a.download = '';
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  return signe.path;
}
