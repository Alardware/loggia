/* ── Le capteur qui dit si l'on est en heures creuses ───────────────────────
 *
 * Home Assistant ne normalise rien ici : pas de `device_class` pour « créneau
 * tarifaire en cours », pas de rôle dans le tableau de bord Énergie. Le
 * capteur n'existait donc QUE s'il était désigné à la main dans les
 * Paramètres — en France comme ailleurs. Sans lui : ni barre des vingt-quatre
 * heures, ni « heures pleines à partir de… », et à deux tarifs le prix ne
 * s'affichait pas, faute de savoir dans quel créneau on se trouve.
 *
 * CE QUI NE MARCHE PAS : LA PARENTÉ. Premier essai, par analogie avec la
 * batterie et le distributeur : chercher le capteur auprès des compteurs
 * déclarés, même appareil. Mesuré sur une installation réelle, c'est FAUX —
 * les compteurs venaient d'une intégration (une passerelle de téléinformation)
 * et le créneau d'une autre (le fournisseur). Ni le même appareil, ni la même
 * entrée de configuration. Rien ne lie structurellement les deux, et rien ne
 * le garantira jamais : le créneau décrit le CONTRAT, les compteurs décrivent
 * le COMPTEUR.
 *
 * CE QUI MARCHE : LE SENS, ET L'UNICITÉ.
 *
 *   LE SENS. La clé de traduction porte un marqueur tarifaire. Une clé de
 *   traduction est un identifiant d'intégration, stable et non traduit — pas
 *   un nom que l'utilisateur choisit et renomme. C'est la règle du
 *   distributeur (ADR 0164), appliquée telle quelle.
 *
 *   L'UNICITÉ. S'il y a plus d'un candidat dans la maison, on ne choisit pas.
 *   Un créneau faux vaut moins que pas de créneau : il ferait afficher un prix
 *   qui n'a pas cours. Mesure sur une installation réelle : un seul candidat
 *   sur cent quarante-trois capteurs binaires.
 *
 * On ne lit jamais le `friendly_name`, et on ne tient aucune liste
 * d'intégrations : une table de noms de greffons serait fausse le jour où une
 * nouvelle paraît.
 */

/* Les racines, dans les langues des intégrations. Elles ne disent qu'une
 * chose : « le tarif réduit est en cours ».
 *
 *   hc / creuse                 français
 *   off peak / economy 7 / low rate / low tariff   anglais
 *   niedertarif                 allemand, suisse
 *   daltarief / daluren         néerlandais
 *   valle                       espagnol
 *   fascia F1..F3               italien
 *   nocna                       polonais
 *   tempo                       le contrat à couleurs
 *
 * `hc` est un SIGLE : exigé comme mot entier, sinon « technical » suffirait à
 * le contenir. `fascia` seul veut aussi dire « bandeau » : on exige le numéro
 * de tranche. Écartés pour la même raison : `nt` (trop court pour être sûr) et
 * `strefa`, « zone » en polonais, que n'importe quel détecteur peut porter. */
const RACINES = /(^|[^a-z])hc([^a-z]|$)|creuse|off[_-]?peak|economy[_-]?\d|low[_-]?(rate|tariff)|niedertarif|dal[_-]?tarief|daluren|valle|fascia[_-]?f\d|nocna|tempo/;

/** Le domaine d'une entité, tel que Home Assistant l'écrit dans son
 * identifiant. C'est une structure, pas un nom : `binary_sensor.n_importe_quoi`. */
const estBinaire = (id) => String(id || '').indexOf('binary_sensor.') === 0;

/**
 * Le capteur de créneau de la maison, ou `null`.
 *
 * `entites` : `[{ id, cle, desactive }]` — l'identifiant, la clé de traduction
 * (vide si l'intégration n'en publie pas), et si l'entité est désactivée.
 *
 * Rend `null` dès qu'il y a un doute : aucun candidat, ou plus d'un.
 */
export function trouverCreneau(entites) {
  const bons = (Array.isArray(entites) ? entites : [])
    .filter(e => e && e.id && !e.desactive && estBinaire(e.id))
    .filter(e => RACINES.test(String(e.cle || '').toLowerCase()))
    .map(e => e.id);
  // Deux candidats, c'est deux contrats ou un faux positif : on se tait.
  return bons.length === 1 ? bons[0] : null;
}
