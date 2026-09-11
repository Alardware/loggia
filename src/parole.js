/* ── Ce que dit l'assistant : de quoi il parle, et où il en est ──────────────
 *
 * Deux lectures du texte d'une réponse, et rien d'autre que le texte :
 *
 *   • son SUJET, c'est-à-dire la teinte que prend l'orbe. Elle dit de quoi
 *     l'assistant parle avant qu'on ait lu la phrase : le chauffage en orangé,
 *     ce qui est fait en vert, l'alerte en rouge ;
 *   • le MOT qu'il prononce. Home Assistant rend un fichier audio, pas les
 *     frontières des mots : on ne les connaît pas, on les estime depuis la
 *     position de la lecture. Une syllabe prend du temps, une virgule respire,
 *     un point s'arrête.
 *
 * Module pur — ni React ni navigateur — pour que les tests l'exécutent pour de
 * vrai au lieu de relire son texte.
 */

/* L'alerte d'abord, et à part : c'est la seule teinte qui inquiète, donc la
 * seule qui doive savoir se retenir. « Aucune alerte », « pas de fuite »,
 * « no smoke » RASSURENT — les teindre en rouge dirait l'inverse de la phrase.
 *
 * La négation se cherche dans la MÊME phrase que le mot, et en mots entiers :
 * « Nouvelle alerte » commence par « No », et ce n'est pas un refus. */
const ALERTE = /alarme|alerte|fuite|fum[ée]e|intrusion|danger|alarm|alert|leak|smoke|intruder/i;
const NEGATION = /\b(aucune?|pas|sans|rien|jamais|ni|no|not|none|nothing|never|without)\b/i;

/* Les autres sujets, dans l'ordre où ils l'emportent.
 *
 * Français et anglais : l'assistant répond dans la langue qu'on lui parle.
 *
 * Ni « degré » ni « température » dans le chaud. Ce sont les mots de la météo
 * autant que du chauffage, et « il fait trois degrés dehors » aurait teinté
 * l'orbe en orangé. */
const SUJETS = [
  ['chaud', /chauffage|chauffe|radiateur|thermostat|chaudi[èe]re|chaud|heating|radiator|boiler|warm/i],
  ['froid', /climatis|\bclim\b|refroidi|ventilat|froid|fra[îi]ch|air.?condition|cooling|\bcold\b/i],
  ['bien', /allum|[ée]teint|lumi[èe]re|lampe|\bvolets?\b|\bstores?\b|sc[èe]ne|\blights?\b|\blamps?\b|shutter|\bblinds?\b|\bscenes?\b|turned (on|off)/i],
];

/** La teinte de ce dont parle `texte` : « chaud », « froid », « bien », « alerte » — ou « base ». */
export function teinteDe(texte) {
  const t = String(texte || '');
  if (!t.trim()) return 'base';
  if (t.split(/[.!?…]+/).some((p) => ALERTE.test(p) && !NEGATION.test(p))) return 'alerte';
  for (const [nom, re] of SUJETS) if (re.test(t)) return nom;
  return 'base';
}

/** Les mots d'un texte, dans l'ordre. Les blancs — retours à la ligne compris — ne comptent pas. */
export function mots(texte) {
  return String(texte || '').split(/\s+/).filter(Boolean);
}

const FIN_PHRASE = /[.!?…][»"”')\]]*$/;
const FIN_MEMBRE = /[,;:][»"”')\]]*$/;
const VOYELLES = /[aeiouyàâäéèêëïîôöùûüœæ]+/gi;

/**
 * Le temps que prend chaque mot à dire, en unités arbitraires.
 *
 * Ses syllabes — un groupe de voyelles, à peu près ce que la voix articule —,
 * plus la pause qui le suit. Un chiffre se dit en plusieurs syllabes (« 19 »,
 * dix-neuf) : il compte pour une et demie.
 */
export function poidsDesMots(liste) {
  return liste.map((m) => {
    const voyelles = (m.match(VOYELLES) || []).length;
    const chiffres = (m.match(/\d/g) || []).length;
    const syllabes = Math.max(1, voyelles + chiffres * 1.5);
    const pause = FIN_PHRASE.test(m) ? 2.2 : FIN_MEMBRE.test(m) ? 1.1 : 0;
    return syllabes + pause;
  });
}

/**
 * Le mot que la voix prononce quand la part `fraction` de la lecture s'est écoulée.
 *
 * Rend -1 sans mots. La fraction vient de la durée RÉELLE du fichier : l'écart
 * d'estimation ne s'accumule donc pas, et le dernier mot s'allume à la fin,
 * quelle que soit la vitesse de la voix.
 */
export function motAuTemps(poids, fraction) {
  if (!poids.length) return -1;
  const f = Math.min(1, Math.max(0, Number(fraction) || 0));
  const total = poids.reduce((a, b) => a + b, 0);
  let cumul = 0;
  for (let i = 0; i < poids.length; i += 1) {
    cumul += poids[i];
    if (cumul > f * total) return i;
  }
  return poids.length - 1;
}

/** Les bornes [début, fin] de la phrase qui contient le mot `i`. */
export function phraseAutour(liste, i) {
  if (!liste.length) return [0, -1];
  const k = Math.min(liste.length - 1, Math.max(0, i));
  let debut = k;
  let fin = k;
  while (debut > 0 && !FIN_PHRASE.test(liste[debut - 1])) debut -= 1;
  while (fin < liste.length - 1 && !FIN_PHRASE.test(liste[fin])) fin += 1;
  return [debut, fin];
}
