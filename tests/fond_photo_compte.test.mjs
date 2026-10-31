// ─────────────────────────────────────────────────────────────────────────────
// LA PHOTO DE FOND SUIT LE COMPTE (30/10, ADR 0289).
//
// « Le fond d'écran n'est pas synchronisé : j'ai mis une image en 5G depuis
// l'extérieur, et en Wi-Fi local je n'ai pas d'image. » Une adresse = une
// origine = un localStorage. La photo est rangée sur Home Assistant sous le
// compte ; le localStorage n'en garde qu'une copie.
// ─────────────────────────────────────────────────────────────────────────────
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composant } from './rendu.mjs';

const CLE = 'loggia-fond-photo';
const magasin = new Map();
let appels = [];
let serveur = null; // la photo rangée au serveur : null = rien

globalThis.window = globalThis.window || {};
Object.assign(globalThis.window, {
  localStorage: {
    getItem: (k) => (magasin.has(k) ? magasin.get(k) : null),
    setItem: (k, v) => magasin.set(k, String(v)),
    removeItem: (k) => magasin.delete(k),
  },
  dispatchEvent: () => true,
  addEventListener: () => {},
});
globalThis.document = { querySelector: () => ({ hass: { auth: { data: { access_token: 'jeton' } } } }) };
globalThis.FileReader = class { readAsDataURL(b) { this.result = 'data:image/jpeg;base64,' + b.contenu; this.onload(); } };
globalThis.fetch = async (url, o = {}) => {
  appels.push({ url, methode: o.method || 'GET', auth: o.headers && o.headers.Authorization });
  if (String(url).startsWith('data:')) return { blob: async () => ({ contenu: String(url).split(',')[1] }) };
  const m = o.method || 'GET';
  if (m === 'POST') { serveur = o.body.contenu; return { ok: true, status: 200, json: async () => ({ version: 'v-' + serveur }) }; }
  if (m === 'DELETE') { serveur = null; return { ok: true, status: 200 }; }
  if (serveur == null) return { ok: false, status: 404 };
  return { ok: true, status: 200, headers: { get: () => '"e"' }, blob: async () => ({ contenu: serveur }) };
};

const synchroniserFond = await composant('fondphoto.js', 'synchroniserFond');

beforeEach(() => { magasin.clear(); appels = []; serveur = null; });

test('en Wi-Fi local, l’écran sans copie reprend la photo du compte', async () => {
  serveur = 'PHOTO';
  await synchroniserFond('v-PHOTO');
  assert.equal(magasin.get(CLE), 'data:image/jpeg;base64,PHOTO');
  assert.equal(appels[0].auth, 'Bearer jeton', 'la photo passe par la route authentifiée');
});

test('le téléphone qui était seul à la connaître la range, une seule fois', async () => {
  magasin.set(CLE, 'data:image/jpeg;base64,ANCIENNE');
  let posee = null;
  await synchroniserFond(undefined, (v) => { posee = v; });
  assert.equal(serveur, 'ANCIENNE');
  assert.equal(posee, 'v-ANCIENNE', 'sa version part dans l’apparence : les autres écrans la reprennent');
});

test('retirée ailleurs, elle n’est pas renvoyée : la copie s’efface', async () => {
  magasin.set(CLE, 'data:image/jpeg;base64,ANCIENNE');
  await synchroniserFond(null, () => assert.fail('renvoyée'));
  assert.equal(serveur, null);
  assert.equal(magasin.has(CLE), false);
});

test('les Paramètres envoient la photo choisie, et la retirent du compte', () => {
  const P = readFileSync(new URL('../src/views/parametres.jsx', import.meta.url), 'utf8');
  assert.ok(P.includes("const v = await envoyerFond(data).catch(() => null);") && P.includes("onLook({ fond: 'photo', ...(v ? { fondV: v } : {}) });"));
  assert.ok(P.includes("retirerFond().catch(() => {}); onLook({ ...(actif ? { fond: 'aucun' } : {}), fondV: null });"));
  assert.ok(P.includes("fondV={look.fondV}"), 'un écran neuf active la photo du compte sans redemander de fichier');
  const H = readFileSync(new URL('../src/app/hooks.jsx', import.meta.url), 'utf8');
  assert.ok(H.includes('synchroniserFond(look.fondV,') && H.includes('}, [look.fond, look.fondV]);'), 'l’écran suit la version annoncée');
});
