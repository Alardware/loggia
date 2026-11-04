// ─────────────────────────────────────────────────────────────────────────────
// Télécharger les diagnostics depuis À propos (04/11, ADR 0325).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const D = await import('../src/diagnostics.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

function faux() {
  const clics = [];
  const doc = {
    body: { appendChild: () => {} },
    createElement: () => ({ click() { clics.push(this.href); }, remove() {} }),
  };
  return { clics, doc };
}

test('l’entrée de Loggia, une adresse signée, et le navigateur télécharge', async () => {
  const { clics, doc } = faux();
  const appels = [];
  const hass = { callWS: async (m) => { appels.push(m); return m.type === 'config_entries/get' ? [{ entry_id: 'abc 1' }] : { path: '/api/diagnostics/config_entry/abc%201?authSig=x' }; } };
  const chemin = await D.telechargerDiagnostics(hass, doc);
  assert.deepEqual(appels, [
    { type: 'config_entries/get', domain: 'loggia' },
    { type: 'auth/sign_path', path: '/api/diagnostics/config_entry/abc%201' },
  ]);
  assert.equal(chemin, '/api/diagnostics/config_entry/abc%201?authSig=x');
  assert.deepEqual(clics, [chemin]);
});

test('sans entrée, ou sans signature : une erreur sans code, que l’écran traduit', async () => {
  const { doc } = faux();
  await assert.rejects(D.telechargerDiagnostics({ callWS: async () => [] }, doc), (e) => !e.code);
  await assert.rejects(D.telechargerDiagnostics({ callWS: async (m) => (m.type === 'config_entries/get' ? [{ entry_id: 'x' }] : {}) }, doc), (e) => !e.code);
});

test('À propos le propose dans les deux formats, à un administrateur, hors démonstration', () => {
  const P = lire('src/views/parametres.jsx');
  assert.ok(P.includes("import { telechargerDiagnostics } from '../diagnostics.js';"));
  assert.ok(P.includes("const peutDiag = isAdmin && !!hass && typeof hass.callWS === 'function' && !(typeof window !== 'undefined' && window.__loggiaDemo);"));
  assert.equal((P.match(/\{peutDiag && <Ligne(Tel)? ico="download" titre=\{tr\('Diagnostics'\)\}/g) || []).length, 2, 'la ligne manque à l’un des formats');
});
