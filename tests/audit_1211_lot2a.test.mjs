// ─────────────────────────────────────────────────
// Ce qui trompe à l'usage, première moitié (audit du 12/11, lot 2a) : les onze
// points déjà vérifiés — B1 à B9, B13, B28.
//
// Trois d'entre eux sont joués là où leur harnais existe déjà : B2 (« Envoyé »
// et « Annoncé » à la réponse seulement) dans tests/medias_restants.test.mjs
// et tests/fiche_media.test.mjs, B7 (un garage qui s'ouvre le dit) dans
// tests/lot16_fiches_panne.test.mjs, B9 (une caméra lente) dans
// tests/requetes_qui_s_empilent.test.mjs.
// ─────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monter, parcourir, horlogeFausse } from './crochets.mjs';
import { consigneVoisine } from '../src/chauffageecran.js';
import { fenetreMoinsChere } from '../src/tarif.js';
import { GARDE_SERIE } from '../src/releve.js';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const { serieEncoreBonne, statsRelues } = await import('../src/stats.js');
const BRIQUES = await import('../src/cartes/briques.jsx');
const PRES = await import('../src/views/presence.jsx');
const COMMUNE = await import('../src/fichecommune.jsx');
const SWITCH = await import('../src/ficheswitch.jsx');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(join(RACINE, p), 'utf8').replace(/\r\n/g, '\n');
const fois = (texte, motif) => texte.split(motif).length - 1;
const tours = async (n = 8) => { for (let i = 0; i < n; i++) await Promise.resolve(); };

// ── B1 : vue personnalisée, « − » d'un thermostat réglé au degré ─────────────

test('B1 — un cran vaut le pas de l’appareil : « − » baisse un thermostat réglé au degré', () => {
  // À − 0,5, 21 devenait 20,5, que l'arrondi au pas remontait à 21 : la même consigne repartait.
  assert.equal(consigneVoisine(21, -1, { target_temp_step: 1 }, 'C'), 20);
  assert.equal(consigneVoisine(21, 1, { target_temp_step: 1 }, 'C'), 22);
  assert.equal(consigneVoisine(21, -1, { target_temp_step: 0.5 }, 'C'), 20.5, 'au demi-degré, rien ne change');
  assert.equal(consigneVoisine(70, -1, {}, 'F'), 69, 'en °F sans pas publié : un degré');
  const c = lire('src/cartescustom/cartes.jsx');
  assert.ok(c.includes('const vise = consigneVoisine(base, sens, a, uniteTemp(a, hass)) ?? base + sens * 0.5;'), 'la carte d’une vue perso ne suit plus le pas de l’appareil');
  assert.equal(fois(c, 'const v = bougerConsigne(hass, id, a, base, sens); if (v != null) poseT(v);'), 2, 'la compacte ET la standard');
  assert.ok(!c.includes('bouge(-0.5)') && !c.includes('a.temperature - .5') && !c.includes('a.temperature + .5'), 'un demi-degré en dur est revenu');
});

// ── B3 : le seuil de CO₂ se tape ────────────────────────────────────────────

test('B3 — le seuil de CO₂ se tape : rien ne part pendant la frappe, la valeur bornée part à la sortie', () => {
  const v = lire('src/views/veilles.jsx');
  assert.ok(v.includes("<ChampNombre nom={tr('Seuil de CO₂, en ppm')} valeur={co2.seuil != null ? co2.seuil : SEUIL_CO2} min={400} max={3000} pas={50}"), 'le seuil n’est plus un champ qui part à la sortie');
  assert.ok(!v.includes('Math.max(400, Math.min(3000, Number(e.target.value)'), 'le seuil est de nouveau borné à chaque frappe');
  const valides = [];
  const m = monter(PRES.ChampNombre, { valeur: 1000, min: 400, max: 3000, pas: 50, nom: 'Seuil', onValide: (n) => valides.push(n) });
  const champ = () => m.trouver(e => e.type === 'input')[0];
  const geste = (nom, ev) => { champ().props[nom](ev); m.rendre(); };
  // « 1200 », chiffre après chiffre : le champ garde ce qu'on tape (il disait 400, 4002, puis 3000).
  for (const t of ['1', '12', '120', '1200']) {
    geste('onChange', { target: { value: t } });
    assert.equal(champ().props.value, t, 'le champ a réécrit « ' + t + ' »');
  }
  assert.deepEqual(valides, [], 'rien ne part pendant la frappe');
  geste('onBlur', { target: { value: '1200' } });
  assert.deepEqual(valides, [1200], 'à la sortie, une fois');
  m.proprietes({ valeur: 1200 });
  // Hors bornes : ramené à la borne, par Entrée aussi.
  geste('onChange', { target: { value: '9000' } });
  geste('onKeyDown', { key: 'Enter', currentTarget: { value: '9000' } });
  assert.deepEqual(valides, [1200, 3000]);
  assert.equal(champ().props.value, '3000');
});

// ── B4 : l'agenda de l'Accueil ──────────────────────────────────────────────

test('B4 — l’agenda se relit après un geste ; supprimer se confirme, attend la réponse et dit un refus', () => {
  const d = lire('src/accueil/dashboard.jsx');
  assert.ok(d.includes('const relireAgenda = useCallback(() => setTourAgenda(t => t + 1), []);')
    && d.includes('const agenda = useAgenda(accueil && accueil.hass, null, plageAgenda, tourAgenda);')
    && d.includes('large={wide} onPlage={setPlageDemandee} onChange={relireAgenda} /></Suspense>'), 'l’Accueil ne relit plus son agenda après un geste');
  const f = lire('src/feuilleagenda.jsx');
  assert.equal(fois(f, 'onFait={() => { setNouveau(false); if (onChange) onChange(); }}'), 2, 'créé : les deux feuilles, ordinateur et téléphone, relisent');
  assert.ok(f.includes('if (!arme) { setArme(true); return; }'), 'supprimer part de nouveau d’un seul toucher');
  assert.ok(f.includes('.then(() => { if (onChange) onChange(); onFermer(); },'), 'la fiche se ferme avant la réponse, ou l’agenda ne se relit pas');
  assert.ok(f.includes("() => { setEnVol(false); setArme(false); setErreur(tr('Home Assistant a refusé.')); });") && f.includes('{erreur && <div role="alert"'), 'un refus n’est plus dit');
  assert.ok(!f.includes('le serveur dira non'), 'l’échec est de nouveau avalé');
});

// ── B5 : l'heure d'un repas ─────────────────────────────────────────────────

test('B5 — l’heure d’un repas ne part qu’en quittant le champ', () => {
  assert.ok(lire('src/fichedistributeur.jsx').includes("<ChampHeure valeur={heure} nom={tr('Heure')} aLaSortie onValide={(v) => poser({ ...r, heure: v })} />"), 'chaque frappe repart au serveur');
  // De 08:00 à 19:30 au clavier : quatre heures entières passent dans le champ, une seule part.
  const valides = [];
  const m = monter(COMMUNE.ChampHeure, { valeur: '08:00', nom: 'Heure', aLaSortie: true, onValide: (v) => { valides.push(v); } });
  const champ = () => m.trouver(e => e.type === 'input')[0];
  for (const t of ['01:00', '19:00', '19:03', '19:30']) { champ().props.onChange({ target: { value: t } }); m.rendre(); }
  assert.deepEqual(valides, [], '01:00, 19:00 ou 19:03 sont partis');
  champ().props.onBlur({ target: { value: '19:30' } }); m.rendre();
  assert.deepEqual(valides, ['19:30']);
});

// ── B6 : une période sans données ───────────────────────────────────────────

test('B6 — une période sans données ne garde pas les chiffres de la précédente', () => {
  const t = 1.7e12;
  assert.equal(serieEncoreBonne({ quand: t, repere: 'jour|0' }, 'jour|0', t + 60e3), true, 'même période, lue il y a une minute : un hoquet du réseau ne vide pas le graphe');
  assert.equal(serieEncoreBonne({ quand: t, repere: 'jour|0' }, 'jour|-40', t + 60e3), false, 'une autre période : ses chiffres ne sont pas ceux-là');
  assert.equal(serieEncoreBonne({ quand: t, repere: 'jour|0' }, 'mois|0', t + 60e3), false);
  assert.equal(serieEncoreBonne({ quand: t, repere: 'jour|0' }, 'jour|0', t + GARDE_SERIE), false, 'au-delà d’une demi-heure, plus rien ne se garde');
  assert.equal(serieEncoreBonne(undefined, 'jour|0', t), false);
  // Ce que la vue en fait : la série d'avant survit sur la même période, pas en remontant l'historique.
  const avant = { 'sensor.conso': [1, 2, 3] };
  const lus = { 'sensor.conso': { quand: t, repere: 'jour|0' } };
  const garder = (repere) => (id) => serieEncoreBonne(lus[id], repere, t + 1000);
  assert.deepEqual(statsRelues(avant, [{ id: 'sensor.conso', arr: null }], garder('jour|0')), avant);
  assert.deepEqual(statsRelues(avant, [{ id: 'sensor.conso', arr: null }], garder('jour|-40')), {}, 'la période vide montre les chiffres d’avant');
  const s = lire('src/stats.js');
  assert.ok(s.includes("const repere = periode + '|' + decalage;") && s.includes('lus.current[id] = { quand: maintenant, repere };')
    && s.includes('(id) => serieEncoreBonne(lus.current[id], repere, maintenant)'), '`useStats` ne retient plus la période de chaque lecture');
});

// ── B7 : un ouvrant en mouvement (le rendu : tests/lot16_fiches_panne.test.mjs) ──

test('B7 — la fiche d’un ouvrant lit son mouvement avant sa position', () => {
  const f = lire('src/appareils/fiches.jsx');
  assert.ok(f.includes("const mouvement = st && (st.state === 'opening' || st.state === 'closing') ? st.state : null;"));
  assert.ok(f.includes("const etatTxt = mouvement === 'opening' ? tr('Ouverture…') : mouvement === 'closing' ? tr('Fermeture…') : ferme ? tr('Fermé')"), 'en mouvement, la fiche redit « Fermé »');
  assert.ok(f.includes("const chip = mouvement === 'opening' ? 'ouvert' : mouvement === 'closing' ? 'ferme' : ferme ? 'ferme'"), 'la puce « Fermé » s’allume pendant l’ouverture');
});

// ── B8 : la bascule et le clavier ───────────────────────────────────────────

test('B8 — la bascule n’arrête que ses touches : Échap et Tab remontent jusqu’à la fiche', () => {
  let bascules = 0;
  const m = monter(BRIQUES.RmBascule, { on: false, nom: 'Lampe', onToggle: () => { bascules += 1; } });
  const touche = (el, key) => {
    const ev = { key, arretee: false, avalee: false, stopPropagation() { this.arretee = true; }, preventDefault() { this.avalee = true; } };
    el.props.onKeyDown(ev);
    return ev;
  };
  for (const k of ['Escape', 'Tab', 'ArrowDown', 'a']) {
    const ev = touche(m.arbre, k);
    assert.deepEqual([ev.arretee, ev.avalee], [false, false], '« ' + k + ' » est arrêtée par la bascule : la fiche ne la reçoit plus');
  }
  assert.equal(bascules, 0);
  for (const k of ['Enter', ' ']) {
    const ev = touche(m.arbre, k);
    assert.deepEqual([ev.arretee, ev.avalee], [true, true], 'Entrée et Espace restent à la bascule : la carte ne s’ouvre pas');
  }
  assert.equal(bascules, 2);
  // Inerte, elle garde ses deux touches pour elle, et ne bascule rien.
  const morte = monter(BRIQUES.RmBascule, { on: false, nom: 'Lampe', inerte: true, onToggle: () => { bascules += 1; } });
  assert.deepEqual([touche(morte.arbre, 'Enter').arretee, touche(morte.arbre, 'Escape').arretee], [true, false]);
  assert.equal(bascules, 2);
});

// ── B13 : le moment le moins cher (ADR 0355) ────────────────────────────────

test('B13 — l’heure entamée ne compte que pour ce qu’il en reste', () => {
  const H = 3600e3, MIN = 60e3;
  const jour = Date.UTC(2026, 10, 12, 0, 0, 0);
  const prix = { 13: 0.09, 14: 0.02, 15: 0.087, 16: 0.06, 17: 0.06, 18: 0.09 };
  const pts = Object.entries(prix).map(([h, p]) => ({ debut: jour + h * H, fin: jour + (Number(h) + 1) * H, prix: p }));
  // À 14 h pile, 14 h – 16 h est la moins chère : (0,02 + 0,087) / 2 = 0,0535, devant 16 h – 18 h à 0,06.
  const pile = fenetreMoinsChere(pts, jour + 14 * H);
  assert.deepEqual([pile.debut, pile.fin], [jour + 14 * H, jour + 16 * H]);
  assert.ok(Math.abs(pile.prix - 0.0535) < 1e-9);
  // À 14 h 50, il ne reste que dix minutes à 0,02 : deux heures à partir de maintenant coûtent 0,0702. 16 h – 18 h passe devant.
  const entamee = fenetreMoinsChere(pts, jour + 14 * H + 50 * MIN);
  assert.deepEqual([entamee.debut, entamee.fin], [jour + 16 * H, jour + 18 * H], 'à 14 h 50, « 14 h – 16 h » est encore annoncé pour dix minutes de prix bas');
  assert.ok(Math.abs(entamee.prix - 0.06) < 1e-9);
  // Quand maintenant reste le meilleur moment, la fenêtre part de MAINTENANT et dure deux heures au juste.
  const creux = [{ debut: jour, fin: jour + H, prix: 0.01 }, { debut: jour + H, fin: jour + 2 * H, prix: 0.01 }, { debut: jour + 2 * H, fin: jour + 3 * H, prix: 0.02 },
    { debut: jour + 3 * H, fin: jour + 4 * H, prix: 0.5 }, { debut: jour + 4 * H, fin: jour + 5 * H, prix: 0.5 }];
  const maintenant = fenetreMoinsChere(creux, jour + 20 * MIN);
  assert.deepEqual([maintenant.debut, maintenant.fin], [jour + 20 * MIN, jour + 2 * H + 20 * MIN]);
  assert.ok(Math.abs(maintenant.prix - (100 * 0.01 + 20 * 0.02) / 120) < 1e-9, 'la dernière tranche est coupée où la fenêtre s’arrête');
  // Moins de deux heures de prévision devant soi : rien à désigner.
  assert.equal(fenetreMoinsChere(creux, jour + 3 * H + 30 * MIN), null);
});

// ── B28 : « +30 min » d'un interrupteur ─────────────────────────────────────

test('B28 — « +30 min » : deux appuis rapides ne posent qu’une demi-heure', async () => {
  const h = horlogeFausse();
  h.installer();
  try {
    const ID = 'switch.poele';
    const poses = [];
    let repondre = null;
    const hass = {
      states: { [ID]: { entity_id: ID, state: 'on', attributes: { friendly_name: 'Poêle' } } },
      callWS: (msg) => {
        if (msg.type === 'loggia/minuteurs/etat') return Promise.resolve({ maintenant: Date.now() / 1000, minuteurs: {} });
        poses.push(msg);
        return new Promise((ok) => { repondre = ok; });
      },
    };
    const FicheBouton = () => null;
    const briques = { FicheRangee: () => null, FicheValeur: () => null, FicheBouton, useSeconde: () => {} };
    const m = monter(SWITCH.RangeeMinuteur, { hass, id: ID, briques });
    await tours(); m.rendre();
    /* ASSERTION MODIFIÉE (audit du 12/11, lot 4, I5) : « +30 min » est devenu les durées de la fiche d'une lumière, des puces
     * sous le titre ; « 30 min » d'abord, puis, une fois le minuteur posé, « +15 min » — le même ordre à la fois. */
    const plus = () => {
      const trouves = [];
      parcourir(m.arbre, (e) => { if (e.type === 'button' && (e.props.children === '30 min' || e.props.children === '+15 min')) trouves.push(e); });
      assert.equal(trouves.length, 1, 'la puce d’une durée manque');
      return trouves[0];
    };
    plus().props.onClick();
    plus().props.onClick();
    assert.deepEqual(poses, [{ type: 'loggia/minuteurs/poser', entity_id: ID, minutes: 30 }], 'le second appui est parti avant la réponse du premier : une heure posée');
    // Répondu : un appui voulu en ajoute de nouveau.
    repondre({ maintenant: Date.now() / 1000, minuteurs: { [ID]: { fin: Date.now() / 1000 + 1800, duree: 30 } } });
    await tours(); m.rendre();
    plus().props.onClick();
    assert.equal(poses.length, 2, 'après la réponse, « +30 min » ne répond plus');
    m.demonter();
  } finally { h.restaurer(); }
});
