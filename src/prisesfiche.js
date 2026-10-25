/* ── Ce que la fiche d'une prise calcule (chantier Prises, § 3.5 à 3.8, § 7) ──
 *
 * Chargé avec la fiche (`ficheprise.jsx`), jamais au démarrage. Pur : ni DOM,
 * ni React, ni lecture de l'état — la fiche lui passe ce qu'elle a lu. La
 * phrase d'état, le chiffre et la courbe de la carte vivent dans prises.js :
 * la fiche les reprend, elle ne les récrit pas.
 */
import { tr, locale } from './i18n.js';
import { nombre, fmtWatts } from './format.js';
import { NOMS_PRISE, estPontZigbee, cheminsCourbe, kwhPrise, dureePrise, insecable } from './prises.js';
import { prixParHeure } from './tarif.js';

const heure = (t) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/* ── La courbe des 24 heures (§ 3.6) ─────────────────────────────────────── */

/** Le plafond de l'échelle : le plus haut point arrondi à une valeur ronde — 10, 20, 25 ou 50 × 10ⁿ W —, 10 W au moins. */
export function maxRond(w) {
  const v = Math.max(10, Number(w) || 0);
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5]) if (m * p >= v) return m * p;
  return 10 * p;
}

/** L'étiquette d'une valeur ronde de l'échelle : « 200 W », « 2,5 kW ». */
export const etiquetteW = (w) => (w >= 1000 ? nombre(w / 1000, 1, 0) + ' kW' : nombre(w, 0) + ' W');

/**
 * La journée d'une prise dans une boîte de 400 × 110, de minuit au minuit
 * suivant : `ligne` et `aire` (null sans deux points), `max` — le plafond
 * rond —, et `x`, l'abscisse du trait de l'heure. `points` : les moyennes sur
 * 5 minutes ; `watts`, la puissance du moment, en dernier point (P8).
 */
export function courbeJournee(points, { watts = null, maintenant, minuit, lendemain }) {
  const pts = (Array.isArray(points) ? points : []).concat(watts == null ? [] : [{ t: maintenant, w: watts }]);
  const max = maxRond(Math.max(0, ...pts.map(p => Number(p.w) || 0)));
  const c = cheminsCourbe(pts, { largeur: 400, hauteur: 110, debut: minuit, fin: lendemain, max });
  const x = Math.round(Math.min(1, Math.max(0, (maintenant - minuit) / (lendemain - minuit))) * 4000) / 10;
  return { ligne: c ? c.ligne : null, aire: c ? c.aire : null, max, x };
}

/** Les bandes des cycles du jour, sur 400 : `[{ x, l }]`, du début à la fin — le cycle en cours jusqu'à maintenant. */
export function bandesCycles(cycles, cycle, { minuit, lendemain, maintenant }) {
  const x = (t) => Math.min(400, Math.max(0, (t - minuit) / (lendemain - minuit) * 400));
  const liste = (Array.isArray(cycles) ? cycles : []).filter(c => c && c.debut && c.fin).map(c => [Date.parse(c.debut), Date.parse(c.fin)]);
  if (cycle && cycle.debut) liste.push([Date.parse(cycle.debut), maintenant]);
  return liste.filter(([a, b]) => isFinite(a) && isFinite(b) && b > a && b > minuit && a < lendemain)
    .map(([a, b]) => ({ x: Math.round(x(a) * 10) / 10, l: Math.round((x(b) - x(a)) * 10) / 10 }));
}

/**
 * « Cycle de 13:40 à 16:14 · 1,08 kWh · 0,27 € » : le DERNIER cycle fini
 * aujourd'hui — `cycles` va du plus ancien au plus récent (le contrat du
 * plan 1) —, ou null. `euros(cycle)` : son coût écrit, ou null sans prix.
 */
export function ligneCycle(cycles, maintenant, euros = () => null) {
  const jour = new Date(maintenant).toDateString();
  const c = (Array.isArray(cycles) ? cycles : []).filter(x => x && x.fin && new Date(x.fin).toDateString() === jour).pop();
  if (!c) return null;
  return [tr('Cycle de {a} à {b}', { a: heure(c.debut), b: heure(c.fin) }), typeof c.kwh === 'number' ? insecable(kwhPrise(c.kwh)) : null, euros(c)].filter(Boolean).join(' · ');
}

/* ── La confirmation, l'encart d'une prise muette (§ 3.6) ─────────────────── */

/** Ce que dit la confirmation d'une prise protégée qu'on coupe : un serveur, ses disques ; le reste, l'arrêt net. La puissance ne se coupe pas de son unité en bout de ligne (« (4 » puis « W). », F7). */
export function texteConfirmation(type, nom, watts) {
  const etat = watts == null ? tr('{nom} est allumée.', { nom }) : tr('{nom} est en marche ({w}).', { nom, w: insecable(fmtWatts(watts)) });
  return etat + ' ' + (type === 'nas' ? tr('Le couper d’un coup peut abîmer ses disques.') : tr('L’appareil s’arrêtera net.'));
}

/** Une prise Zigbee — Zigbee2MQTT (son appareil passe par le pont) ou ZHA — : l'encart d'une prise muette nomme son réseau. */
export function estZigbee(index, id) {
  const e = index && index.entityMeta && index.entityMeta.get(id);
  const d = index && index.deviceMeta;
  const dev = e && e.deviceId && d ? d.get(e.deviceId) : null;
  if (!dev) return false;
  if (e.platform === 'zha' || dev.integration === 'zha') return true;
  const via = dev.via ? d.get(dev.via) : null;
  return !!via && estPontZigbee({ fabricant: via.manufacturer, modele: via.model });
}

/* ── La configuration : protéger, imposer le type, prévenir (P2, P4, P6) ──── */

/** Protéger, ou non : la liste des protégées part ENTIÈRE (le contrat du plan 1), triée, sans doublon. */
export function patchProtegee(config, id, oui) {
  const l = new Set(config && Array.isArray(config.protegees) ? config.protegees : []);
  if (oui) l.add(id); else l.delete(id);
  return { protegees: [...l].sort() };
}
/** Imposer un type ; `null` rend la prise à son nom (« Deviner d'après le nom »). */
export const patchType = (id, type) => ({ types: { [id]: type || null } });
export const patchPrevenir = (id, oui) => ({ prevenir: { [id]: !!oui } });

/** La configuration telle que le geste la laisse, miroir du serveur : `protegees` remplacée, un type `null` rendu au nom, un `prevenir` faux retiré. */
export function fusionPrises(config, patch) {
  const c = config || {};
  const n = { protegees: [...(c.protegees || [])], types: { ...(c.types || {}) }, prevenir: { ...(c.prevenir || {}) } };
  if (patch && Array.isArray(patch.protegees)) n.protegees = [...patch.protegees];
  for (const [id, t] of Object.entries((patch && patch.types) || {})) { if (t) n.types[id] = t; else delete n.types[id]; }
  for (const [id, v] of Object.entries((patch && patch.prevenir) || {})) { if (v) n.prevenir[id] = true; else delete n.prevenir[id]; }
  return n;
}

/** Les treize appareils qu'on peut imposer — jamais la sirène (P1) —, dans l'ordre du serveur. */
export const TYPES_IMPOSABLES = ['nas', 'pc', 'lv', 'll', 'sl', 'fer', 'frigo', 'tv', 'cafe', 'radia', 'box', 've', 'prise'];

/** « Ce qu'elle alimente » (P2) : les treize appareils (`NOMS_PRISE()`), puis « Deviner d'après le nom ». */
export function optionsType() {
  const noms = NOMS_PRISE();
  return [...TYPES_IMPOSABLES.map(t => ({ id: t, label: noms[t] })), { id: 'deviner', label: tr('Deviner d’après le nom') }];
}

/* ── L'énergie et son coût (§ 3.7, § 7, P7) ──────────────────────────────── */

const debutDe = (x) => (typeof x.start === 'number' ? x.start : Date.parse(x.start));

/**
 * Les kWh de chaque heure : ce que compte le compteur (`change`) — SI une de ses
 * lignes porte une somme numérique —, sinon la puissance moyenne de l'heure
 * (`mean`, en W). C'est la règle de `mesuresDe` (prisesetat.js) pour la journée :
 * un compteur sans `state_class` de somme n'a pas de statistiques, ou des
 * moyennes sans `change`, et ne dit pas « zéro kWh » pour autant (relecture finale,
 * B2). `[{ debut, kwh }]`.
 */
export function kwhParHeure(stats, energie, puissance) {
  const lignes = (id) => (id && stats && Array.isArray(stats[id]) ? stats[id] : []);
  const somme = lignes(energie).filter(x => x && typeof x.change === 'number' && isFinite(x.change));
  if (somme.length) return somme.map(x => ({ debut: debutDe(x), kwh: x.change }));
  return lignes(puissance).filter(x => x && typeof x.mean === 'number').map(x => ({ debut: debutDe(x), kwh: x.mean / 1000 }));
}

/**
 * Aujourd'hui, heure par heure : les heures finies que disent les statistiques
 * horaires, et — à l'heure en cours — ce qui manque pour faire le total du
 * jour que la carte affiche (`kwhJour`, les mesures sur 5 minutes) : le jour se
 * paie au prix de ses heures, et la tuile dit le même chiffre que la carte.
 */
export function heuresAujourdhui(heures, kwhJour, { minuit, maintenant }) {
  if (kwhJour == null) return [];
  const faites = (heures || []).filter(h => h.debut >= minuit);
  const reste = Math.max(0, kwhJour - faites.reduce((s, h) => s + h.kwh, 0));
  return [...faites, { debut: Math.floor(maintenant / 3600000) * 3600000, kwh: reste }];
}

const CINQ_MIN_MS = 300000;

/**
 * Les kWh d'un cycle, heure par heure (relecture finale, B9) : ce que ses
 * moyennes sur 5 minutes (`points`, `[{ t, w }]` — le début de la tranche et sa
 * puissance moyenne en W) ont compté DANS le cycle, tranche rognée à ses bornes,
 * puis mis à l'échelle pour que la somme fasse les kWh que dit le serveur
 * (`c.kwh`, lu sur le compteur) : la forme vient de la courbe, le total du
 * compteur. `[{ debut, kwh }]`, ou `null` quand elles ne disent pas le cycle :
 *  - pas de points, ou aucun watt dedans ;
 *  - ils n'en couvrent pas 90 % — un cycle commencé AVANT minuit n'a, aujourd'hui,
 *    que sa fin : toute l'énergie tomberait dans les heures d'après minuit.
 * L'appelant garde alors la pondération par le temps.
 */
export function kwhCycleParHeure(c, points) {
  const a = Date.parse(c && c.debut), b = Date.parse(c && c.fin);
  if (!Array.isArray(points) || !(b > a) || !(c.kwh > 0)) return null;
  const parHeure = new Map();
  let couvert = 0, total = 0;
  for (const p of points) {
    if (!p || !isFinite(p.t) || !isFinite(p.w)) continue;
    const dans = Math.min(b, p.t + CINQ_MIN_MS) - Math.max(a, p.t);
    if (!(dans > 0)) continue;
    const kwh = Math.max(0, p.w) * dans / 3600000 / 1000;
    couvert += dans;
    total += kwh;
    // L'heure de Home Assistant : alignée sur l'heure pleine (UTC), comme `start` des statistiques horaires.
    const h = Math.floor(p.t / 3600000) * 3600000;
    parHeure.set(h, (parHeure.get(h) || 0) + kwh);
  }
  if (!(total > 0) || couvert < 0.9 * (b - a)) return null;
  const echelle = c.kwh / total;
  return [...parHeure].sort((x, y) => x[0] - y[0]).map(([debut, kwh]) => ({ debut, kwh: kwh * echelle }));
}

/**
 * Ce que coûte un cycle (§ 3.6, P7) : ses kWh, heure par heure, au prix de
 * chaque heure — comme la tuile « Aujourd'hui » (`coutHoraire`, tarif.js) : à
 * quantité d'énergie égale, l'euro du cycle égale celui du jour. Les kWh de
 * chaque heure viennent des moyennes sur 5 minutes (`points`, `kwhCycleParHeure`).
 * Sans points qui disent le cycle (passé minuit, pas de statistiques), les kWh
 * se répartissent au prorata du temps passé dans chaque heure — un cycle de
 * 13:40 à 16:14 se paie aux heures creuses s'il les a eues. `null` sans prix,
 * ou sans kWh.
 */
export function coutCycle(c, connexions, points = null) {
  const prix = prixParHeure(connexions);
  if (!prix || !c || typeof c.kwh !== 'number') return null;
  const parHeure = kwhCycleParHeure(c, points);
  if (parHeure) return parHeure.reduce((s, x) => s + x.kwh * prix(x.debut), 0);
  const a = Date.parse(c.debut), b = Date.parse(c.fin);
  let duree = 0, somme = 0;
  for (let h = Math.floor(a / 3600000) * 3600000; h < b; h += 3600000) {
    const d = Math.min(b, h + 3600000) - Math.max(a, h);
    if (d > 0) { duree += d; somme += d * prix(h); }
  }
  return duree > 0 ? c.kwh * somme / duree : c.kwh * prix(a);
}

/**
 * Les tarifs de la maison (ADR 0173) : `[{ prix, compteur }]` — les deux prix
 * que nomme la fiche Énergie de Loggia, avec ses deux compteurs ; sinon ceux
 * que déclare le tableau de bord Énergie (`enPrix`) ; sinon le seul prix que
 * la fiche nomme. `num(id)` lit le nombre d'une entité.
 */
export function tarifsMaison(EN, prixHa, num) {
  const hc = num(EN && EN.hcPrice), hp = num(EN && EN.hpPrice);
  if (hc != null && hp != null) return [{ prix: hc, compteur: EN.consoJourHc || null }, { prix: hp, compteur: EN.consoJourHp || null }];
  const tableau = (prixHa || []).map(p => ({ prix: p && p.valeur != null ? p.valeur : num(p && p.entite), compteur: (p && p.compteur) || null }))
    .filter(c => typeof c.prix === 'number' && isFinite(c.prix));
  if (tableau.length) return tableau;
  const seul = hc != null ? hc : hp;
  return seul != null ? [{ prix: seul, compteur: null }] : [];
}

/** Les connexions de `prixParHeure` (tarif.js) : chaque tarif, et ce que son compteur a compté heure par heure. */
export function connexionsHeures(tarifs, stats) {
  return tarifs.map(t => ({ prix: t.prix, heures: Object.fromEntries(kwhParHeure(stats, t.compteur, null).map(h => [h.debut, h.kwh])) }));
}

/** Une somme dans la devise de la maison (`hass.config.currency`, un code ISO) : « 0,27 € ». */
export function enDevise(v, devise) {
  try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: devise || 'EUR' }).format(v); } catch { return nombre(v, 2) + ' ' + (devise || '€'); }
}

/** Le prix d'un kilowattheure : « 0,2516 €/kWh », quatre décimales au plus, deux au moins. */
export function prixKwh(p, devise) {
  let symbole = devise || '€';
  try { symbole = new Intl.NumberFormat(locale(), { style: 'currency', currency: devise || 'EUR' }).formatToParts(0).find(x => x.type === 'currency').value; } catch { /* un code qu'Intl ne connaît pas : tel quel */ }
  return nombre(p, 4, 2) + ' ' + symbole + '/kWh';
}

/**
 * La ligne sous les tuiles (§ 3.7) : « Compteur total : 212,6 kWh · tarif
 * 0,2516 €/kWh (vue Énergie) » ; « … · au tarif de chaque heure (vue Énergie) »
 * à plusieurs tarifs — la vue s'appelle « Énergie » dans le menu ; « celui de
 * L'énergie » mettait une majuscule au milieu de la phrase, et l'anglais lisait
 * « as set in The energy » (audit du 19/10, point 11c) ; « estimés d'après la puissance » quand les
 * kWh du jour viennent de la courbe — pas de compteur, ou un compteur sans
 * statistiques (F6) —, sans compteur total. `tarifs` : ceux de la maison. Les kWh
 * et le prix ne se coupent pas de leur unité en bout de ligne (F7).
 */
export function ligneCompteur({ total = null, estime = false, tarifs = [], devise }) {
  const prix = [...new Set((tarifs || []).map(t => t.prix))];
  return [estime ? tr('estimés d’après la puissance') : total != null ? tr('Compteur total : {k}', { k: insecable(kwhPrise(total)) }) : null,
    !prix.length ? null : prix.length === 1 ? tr('tarif {p} (vue Énergie)', { p: insecable(prixKwh(prix[0], devise)) }) : tr('au tarif de chaque heure (vue Énergie)')]
    .filter(Boolean).join(' · ');
}

/* ── Le minuteur (§ 3.8) ──────────────────────────────────────────────────── */

/** Les durées qu'on pose d'un appui, en minutes : 15 min, 30 min, 1 h, 2 h ; et ce qu'on ajoute à un minuteur qui tourne. */
export const DUREES_MINUTEUR = [15, 30, 60, 120];
export const AJOUTS_MINUTEUR = [15, 60];

/* ── Le journal du jour, et qui (§ 3.9, § 8, P9) ────────────────────────────── */

/** Les pastilles de « qui » : le mot et le glyphe (§ 8 ; l'interrupteur d'une lumière, chantier Lumières, § 8). « Loggia » est un nom : il ne se traduit pas.
 *  `personne` (audit du 19/10, B5) : un geste porté par un compte Home Assistant, hors de Loggia — la ligne porte le NOM de la personne
 *  (`quiNom`), ou ce mot générique quand aucune `person.*` ne répond de ce compte. */
export const PASTILLES_QUI = () => ({
  reseau: [tr('Réseau'), 'signal-alt-slash'], mesure: [tr('Mesure'), 'chart-histogram'], loggia: ['Loggia', 'home'],
  automatisme: [tr('Automatisme'), 'magic-wand'], bouton: [tr('Bouton de la prise'), 'hand'], interrupteur: [tr('Interrupteur'), 'hand'],
  personne: [tr('Un compte'), 'user'],
});
/** Le mot de la pastille d'une ligne : le nom de la personne quand la ligne en porte un, sinon celui de sa famille. */
export const motQui = (l, pastilles) => (l && l.quiNom) || pastilles[l.qui][0];

/**
 * Les personnes par compte Home Assistant (B5) : `{ [user_id]: nom }`, lu dans les entités `person.*` du relevé — leur
 * `attributes.user_id` dit le compte, leur `friendly_name` la personne. Un nom venu de Home Assistant ne se traduit pas.
 */
export function personnesDe(S) {
  const out = {};
  for (const id in (S || {})) {
    if (id.indexOf('person.') !== 0) continue;
    const a = (S[id] && S[id].attributes) || {};
    if (typeof a.user_id === 'string' && a.user_id) out[a.user_id] = a.friendly_name || id.slice('person.'.length);
  }
  return out;
}
// Les lignes du journal de Loggia qui n'AGISSENT pas sur l'appareil : elles n'attribuent pas un geste (« retenir » : le coucher garde une lampe sous la main).
const SANS_GESTE = ['poser', 'cycle démarré', 'cycle terminé', 'cycle interrompu', 'prevenir', 'retenir'];
// Les lignes de cycle du serveur, et ce que le journal du jour en dit (« cycle interrompu » : six heures sans retomber, une veille).
const CYCLES = () => ({ 'cycle démarré': tr('Cycle démarré'), 'cycle terminé': tr('Cycle terminé'), 'cycle interrompu': tr('Cycle interrompu') });

/**
 * De combien d'avance le logbook se lit : 24 heures avant minuit (relecture finale,
 * F1). Rien d'hier ne s'affiche — le journal ne montre que les lignes d'aujourd'hui —,
 * mais le dernier état d'hier se SAIT. Lu depuis minuit seulement, il laissait trois
 * défauts : une prise muette depuis 23:00 qui revenait à 07:00 faisait « Allumée ·
 * Bouton de la prise » au lieu de « De retour » ; un `unknown` en tête du jour faisait
 * « De retour » sans changement ; et le logbook de Home Assistant omettant le premier
 * état d'une entité après un redémarrage (sa ligne n'a pas d'`old_state_id`), la prise
 * qui reprenait `on` paraissait passer de `on` à `on` : « Allumée · Bouton de la prise »
 * à chaque redémarrage.
 */
export const VEILLE_MS = 24 * 3600000;

/**
 * Le journal du jour d'une prise (§ 3.9) : `[{ t, quoi, note, qui }]`, les plus
 * récentes d'abord, 6 au plus, depuis `minuit`. `evenements` : le logbook de
 * Home Assistant pour le switch (`when` en secondes, `state`, `context_*`), lu
 * depuis la veille (`VEILLE_MS`) : les lignes d'avant `minuit` ne s'affichent pas,
 * elles disent le dernier état connu ; `lignes` : celles du journal de Loggia qui
 * le nomment (`loggia/volets/manoeuvres`, le contrat du plan 1). Qui, dans l'ordre
 * du § 8 :
 *  1. Réseau : un passage à `unavailable`, et le retour qui le suit ; de même
 *     le retour d'un `unknown` — mais seulement si la prise n'est plus dans
 *     l'état où elle était (voir plus bas) ;
 *  2. Mesure : une ligne de cycle — démarré, terminé, interrompu — à
 *     l'instant RÉEL (`g.motif[0][1].ts`), pas à celui où le serveur a
 *     conclu ;
 *  3. Loggia : la pose d'un minuteur, ou un geste à ± 60 s d'une ligne de
 *     Loggia qui AGIT sur la prise — pas une ligne simulée (« Observer sans
 *     agir » : Loggia l'aurait fait, il n'a rien fait) ;
 *  4. Automatisme : `automation_triggered` ou `script_started`, la note dit
 *     son nom ;
 *  5. Une personne : un compte (`context_user_id`) que Loggia n'a pas porté —
 *     l'application Home Assistant, un assistant vocal — : la pastille dit son
 *     NOM (`personnes`, B5 de l'audit du 19/10), « Un compte » si aucune
 *     `person.*` ne répond de lui. Loggia ne se dit plus pour ce qu'elle n'a
 *     pas fait ;
 *  6. Bouton de la prise : rien de tout cela.
 *
 * Un geste CHANGE l'état : un on/off identique au dernier état connu n'en est pas
 * un. C'est une REPRISE, et elle ne fait pas de ligne — que le logbook ait gardé
 * l'`unknown` qui la précède (Home Assistant le publie au redémarrage, avant que la
 * prise ne réponde : il ne fait pas de ligne à lui seul) ou l'ait omis (« Allumée ·
 * Bouton de la prise » à l'heure du redémarrage disait un geste qui n'a pas eu lieu).
 * Après un `unknown`, le retour dit « De retour » s'il a changé l'état, rien sinon.
 * Après un `unavailable` — suivi ou non d'un `unknown` : une seule indisponibilité —,
 * il dit « De retour » dans tous les cas : c'est la fin de la panne que « Ne répond
 * plus » a ouverte, qu'elle revienne dans l'état d'avant ou non. Sans état connu avant
 * (rien dans la veille non plus), on ne peut pas dire que c'est le même.
 *
 * `vocabulaire` : `'prise'` (par défaut) ou `'lumiere'` — la même règle, d'autres mots
 * (chantier Lumières, § 8, L12). Pour une lumière, `evenements` vient du carnet du
 * serveur (`loggia/lumieres/journal`, la note d'avant la fenêtre en tête), avec le
 * niveau (`bri`) et les réglages (`reglage`) : « Allumée à 45 % » (« Allumée » sans
 * variateur), « Éteinte », « Réglée à 60 % » ; « Interrupteur » remplace « Bouton de
 * la prise », et une règle `interrupteurs/<nom>` — une télécommande — se dit
 * « Interrupteur », la note dit son nom. `fondu` : le fondu de la veilleuse de la
 * règle Nuit, en minutes. Home Assistant ne garde le contexte d'un ordre que quelques
 * secondes : l'extinction, au bout du fondu, et ses paliers arrivent sans lui. Une
 * ligne `nuit/veilleuse` couvre donc, après elle, ce fondu plus 60 s : l'extinction est
 * à elle (« Loggia », note « Veilleuse »), et ses paliers ne font pas de ligne « Réglée ».
 * `personnes` : `{ [user_id]: nom }` (`personnesDe`), pour nommer qui a fait le geste (règle 5).
 */
export function journalDuJour({ evenements = [], lignes = [], minuit, vocabulaire = 'prise', fondu = 0, personnes = null }) {
  const lumiere = vocabulaire === 'lumiere';
  const loggia = (Array.isArray(lignes) ? lignes : []).filter(l => l && typeof l.ts === 'number');
  const partie = (l, i) => (l.g && Array.isArray(l.g.motif) && Array.isArray(l.g.motif[i]) && l.g.motif[i][1]) || {};
  const out = [];
  const cycles = CYCLES();
  for (const l of loggia) {
    if (l.module === 'prises' && cycles[l.quoi]) {
      const kwh = l.quoi === 'cycle terminé' ? partie(l, 1).kwh : null;
      out.push({ t: (Number(partie(l, 0).ts) || l.ts) * 1000, qui: 'mesure', note: null,
        quoi: [cycles[l.quoi], typeof kwh === 'number' ? insecable(kwhPrise(kwh)) : null].filter(Boolean).join(' · ') });
    } else if (l.module === 'minuteurs' && l.quoi === 'poser') {
      const n = Number(partie(l, 0).n);
      out.push({ t: l.ts * 1000, qui: 'loggia', note: null, quoi: [tr('Minuteur'), n > 0 ? insecable(dureePrise(n)) : null].filter(Boolean).join(' · ') });
    }
  }
  const actes = loggia.filter(l => !SANS_GESTE.includes(l.quoi) && !l.simule);
  // Les lignes de la veilleuse et la fenêtre de leur fondu (une lumière seulement).
  const veilleuses = lumiere ? actes.filter(l => l.module === 'nuit' && l.regle === 'veilleuse') : [];
  const dansFondu = (e) => veilleuses.some(l => e.when >= l.ts && e.when <= l.ts + Math.max(0, Number(fondu) || 0) * 60 + 60);
  const pct = (b) => insecable(b + ' %');
  const evts = (Array.isArray(evenements) ? evenements : []).filter(e => e && typeof e.when === 'number').sort((a, b) => a.when - b.when);
  // Toute la fenêtre lue passe ici, la veille comprise : ses lignes sont écartées plus bas (`t >= minuit`), mais `dernier` en vient.
  let dernier = null;   // le dernier état on/off connu
  let panne = null;     // 'unavailable' ou 'unknown' tant que la prise est muette
  for (const e of evts) {
    const t = e.when * 1000;
    if (e.state === 'unavailable') {
      // Une seule indisponibilité, même si un `unknown` (un redémarrage) s'y glisse.
      if (panne !== 'unavailable') out.push({ t, qui: 'reseau', note: null, quoi: tr('Ne répond plus') });
      panne = 'unavailable';
    } else if (e.state === 'unknown') {
      if (panne == null) panne = 'unknown';
    } else if (e.state === 'on' || e.state === 'off') {
      // Un réglage de niveau seul, d'une lumière allumée : une ligne, même sans changement d'état.
      const reglage = lumiere && e.reglage === true && e.state === 'on';
      if (panne === 'unavailable' || (panne === 'unknown' && e.state !== dernier)) out.push({ t, qui: 'reseau', note: null, quoi: tr('De retour') });
      else if (panne == null && lumiere && (reglage || e.state === 'off') && dansFondu(e)) {
        // Le fondu d'une veilleuse : l'extinction est à elle ; ses paliers ne font pas de ligne.
        if (!reglage) out.push({ t, qui: 'loggia', note: tr('Veilleuse'), quoi: tr('Éteinte') });
      } else if (panne == null && (reglage || e.state !== dernier)) {
        const acte = actes.find(l => Math.abs(l.ts - e.when) <= 60);
        const auto = e.context_event_type === 'automation_triggered' || e.context_event_type === 'script_started';
        // Une télécommande passe par une règle de Loggia (`interrupteurs/<nom>`) : pour une lumière, c'est un interrupteur, et il a un nom.
        const telecommande = lumiere && !!acte && acte.module === 'interrupteurs';
        const quoi = !lumiere ? (e.state === 'on' ? tr('Allumée') : tr('Coupée'))
          : reglage ? tr('Réglée à {p}', { p: pct(e.bri) }) : e.state === 'off' ? tr('Éteinte')
            : typeof e.bri === 'number' ? tr('Allumée à {p}', { p: pct(e.bri) }) : tr('Allumée');
        const compte = !telecommande && !acte && !auto && e.context_user_id ? String(e.context_user_id) : null;
        out.push({ t, quoi, qui: telecommande ? 'interrupteur' : acte ? 'loggia' : auto ? 'automatisme' : compte ? 'personne' : lumiere ? 'interrupteur' : 'bouton',
          note: telecommande ? tr('« {nom} »', { nom: acte.regle }) : !acte && auto && e.context_name ? tr('« {nom} »', { nom: e.context_name }) : null,
          // Le nom de la personne derrière le compte, s'il se lit ; sinon la pastille dit « Un compte ».
          quiNom: compte && personnes && typeof personnes[compte] === 'string' && personnes[compte] ? personnes[compte] : null });
      }
      // Sinon, une reprise au même état : un geste change l'état, ceci n'en est pas un — pas de ligne.
      panne = null;
      dernier = e.state;
    }
  }
  return out.filter(x => x.t >= minuit).sort((a, b) => b.t - a.t).slice(0, 6);
}
