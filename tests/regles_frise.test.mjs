// ─────────────────────────────────────────────────────────────────────────────
// « Aujourd'hui » dans Règles (maquette v3, 03/11 ; son choix « Passé et à venir »).
//
// Le passé : le journal du jour, seulement ce que les RÈGLES ont fait. L'avenir :
// ce que le serveur annonce — les manœuvres à venir des volets, l'extinction du
// soir les jours cochés. Rien d'autre n'est deviné.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
// Le JSX passe par le chargeur des tests de rendu (ADR 0069).
const { composant } = await import('./rendu.mjs');
const momentsDuJour = await composant('views/reglesjour.jsx', 'momentsDuJour');

// Un mardi, 10:00 à l'horloge de l'écran.
const MAINTENANT = new Date(2026, 10, 3, 10, 0);
const ts = (h, m, jour = 3) => new Date(2026, 10, jour, h, m).getTime() / 1000;

test('le passé : le journal du jour, et les règles seulement', () => {
  const journal = [
    { module: 'volets', quoi: 'ouvrir', n: 3, ts: ts(8, 2) },
    { module: 'interrupteurs', quoi: 'bouton', n: 1, ts: ts(9, 0) },
    { module: 'prises', quoi: 'cycle terminé', n: 1, ts: ts(9, 30) },
    { module: 'fenetres', quoi: 'couper', n: 1, ts: ts(7, 0, 2) },
  ];
  const m = momentsDuJour({ journal, maintenant: MAINTENANT });
  assert.equal(m.length, 1, 'un bouton, une prise ou la veille ne sont pas sur la frise');
  assert.equal(m[0].k, 'purple');
  assert.equal(m[0].ico, 'blinds-open');
  assert.ok(m[0].t.endsWith(' 3 · Volets'), m[0].t);
});

test('l’avenir : les volets à venir du jour, comptés par minute ; demain ne compte pas', () => {
  const v = (heure, sens = 'fermeture') => ({ a_venir: [{ sens, heure }] });
  const volets = {
    a: v(new Date(2026, 10, 3, 17, 54).toISOString()), b: v(new Date(2026, 10, 3, 17, 54).toISOString()),
    c: v(new Date(2026, 10, 4, 8, 0).toISOString(), 'ouverture'),
  };
  const m = momentsDuJour({ volets, maintenant: MAINTENANT });
  assert.equal(m.length, 1);
  assert.equal(Math.round(m[0].h * 60), 17 * 60 + 54);
  assert.ok(m[0].t.endsWith(' 2 · Volets'), m[0].t);
});

test('l’extinction du soir : à son heure, les jours cochés seulement', () => {
  const nuit = (jours) => ({ config: { coucher: { actif: true, heure: '23:30', jours } } });
  assert.equal(momentsDuJour({ nuit: nuit([1]), maintenant: MAINTENANT }).length, 1, 'mardi vaut 1');
  assert.equal(momentsDuJour({ nuit: nuit([0, 2]), maintenant: MAINTENANT }).length, 0, 'pas un mardi coché');
  assert.equal(momentsDuJour({ nuit: { config: { coucher: { actif: false, heure: '23:30' } } }, maintenant: MAINTENANT }).length, 0, 'coupée');
});

test('deux moments à moins de 36 min se lisent ensemble : le premier, puis « +n »', () => {
  const journal = [
    { module: 'volets', quoi: 'ouvrir', n: 1, ts: ts(8, 0) },
    { module: 'nuit', quoi: 'eteindre', n: 1, ts: ts(8, 20) },
    { module: 'veilles', quoi: 'prevenir', n: 1, ts: ts(8, 30) },
  ];
  const m = momentsDuJour({ journal, maintenant: MAINTENANT });
  assert.equal(m.length, 1);
  assert.ok(m[0].t.endsWith(' · +2'), m[0].t);
});
