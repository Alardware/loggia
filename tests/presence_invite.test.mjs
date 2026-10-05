/* Le mode invite est un input_boolean de Home Assistant (ADR 0016).
 *
 * La regle est testee en Python (tests/python/test_presence.py,
 * test_nuit.py) ; ici, l'onglet Presence : la designation, la bascule, les
 * mots. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('l’onglet Presence designe un input_boolean, et le bascule sans se l’approprier', () => {
  const v = lire('src/views/presence.jsx');
  assert.ok(v.includes("const invite = cfg.invite || {};") && v.includes("id.indexOf('input_boolean.') === 0"), 'la liste des interrupteurs de Home Assistant');
  assert.ok(v.includes("onChange={v => enregistrer({ invite: { entite: v } })}"), 'la designation');
  assert.ok(v.includes("hass.callService('input_boolean', inviteOn ? 'turn_off' : 'turn_on', { entity_id: invite.entite })"), 'la bascule passe par Home Assistant : l’interrupteur lui appartient');
  assert.ok(v.includes("{tr('Aucun interrupteur désigné : crée une entrée « Interrupteur » (input_boolean) nommée Invité dans Home Assistant, puis désigne-la ici.')}"), 'sans designation, la carte dit quoi creer');
  assert.ok(v.includes("etat.invite.coupure_prevue"), 'la coupure programmee se dit');
});

test('cote serveur : la maison n’est jamais vide, le coucher attend, et la coupure passe par le socle', () => {
  const p = lire('custom_components/loggia/presence.py');
  assert.ok(p.includes('"invite": {"entite": ""}') && p.includes('INVITE_COUPURE = 30 * 60'), 'la designation et la demi-heure');
  assert.ok(p.includes('vide = absents and not invite'), 'allume, la maison n’est jamais vide');
  assert.ok(p.includes('await self._async_service("input_boolean", "turn_off", [entite],'), 'la coupure passe par le socle : une main qui a rallume le gele');
  const n = lire('custom_components/loggia/nuit.py');
  assert.ok(n.includes('from .presence import CLE as CLE_PRESENCE, invite_present') && n.includes('await self.regles.noter("nuit", "coucher", "retenir", n=0, motif="mode invite")'), 'le coucher attend, et le dit');
});

test('le dernier indice se dit dans la langue de l’écran (audit du 03/10)', async () => {
  /* Le serveur nomme le genre en français — « mouvement », « ouverture »,
   * « main » — et l'onglet l'affichait tel quel : « Last clue : mouvement ». */
  const v = lire('src/views/presence.jsx');
  assert.ok(v.includes("b: tr(etat.indices.dernier.genre || '')"), 'le genre du dernier indice passe par tr (dans le gabarit « {a} : {b} »)');
  const p = lire('custom_components/loggia/presence.py');
  const debut = p.indexOf('INDICES = {');
  const genres = new Set([...p.slice(debut, p.indexOf('}', debut)).matchAll(/: "([a-z_]+)"/g)].map(m => m[1]));
  assert.ok(p.includes('self._indice(haid, "main")'), 'le geste manuel a changé de nom : le catalogue doit suivre');
  genres.add('main');
  assert.deepEqual([...genres].sort(), ['main', 'mouvement', 'ouverture']);
  const { CHARGEURS } = await import('../src/langues/index.js');
  for (const langue of Object.keys(CHARGEURS)) {
    const cat = (await CHARGEURS[langue]()).default;
    for (const g of genres) assert.equal(typeof cat[g], 'string', langue + ' : « ' + g + ' » manque au catalogue');
  }
});
