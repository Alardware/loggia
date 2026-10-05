/* La barre « Mode » des volets : un refus revenait en silence (audit du 03/10).
 *
 * Un compte ordinaire choisissait « Fermeture nuit ». `loggia/volets/config`
 * est réservé aux administrateurs : Home Assistant refusait. Le `catch` de la
 * barre recopiait l'état sur lui-même — `setModeLoggia(x => x)` — : le bouton
 * restait allumé jusqu'au sondage suivant, quinze secondes, puis revenait
 * seul, sans un mot. Et les volets se fermaient le soir selon l'ancien mode.
 *
 * Le refus remonte maintenant au toast global en NOMMANT la clé, et l'ancien
 * mode revient tout de suite. Voir `src/refus.js` : le rejeu passe par le vrai
 * module, et le dernier test vérifie le câblage dans la vue.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ecrireRegle, refusNomme } from '../src/refus.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');

/* La règle du toast global, recopiée telle quelle (App.jsx) : les clés sont ce
 * qui suit les deux-points. Le dernier test vérifie qu'elle n'a pas bougé. */
const clesDuToast = (r) => (String((r && r.message) || '').split(':')[1] || '').trim();

const PATCH = { planning: { mode: 'nuit' } };

/** Un Home Assistant qui répond ce qu'on lui dit, et un écran qui note tout. */
function essai(reponse) {
  const envoyes = [];
  const dits = [];
  const compte = { annule: 0 };
  const hass = {
    callWS: async (msg) => {
      envoyes.push(msg);
      if (reponse instanceof Error) throw reponse;
      return reponse;
    },
  };
  const options = { cle: 'loggia_volets', annuler: () => { compte.annule += 1; }, signaler: (e) => { dits.push(e); } };
  return { hass, envoyes, dits, compte, options };
}
const refusAdmin = () => Object.assign(new Error('Unauthorized'), { code: 'unauthorized' });

test('un compte ordinaire choisit un mode : l’écran le retire, et le refus NOMME la clé', async () => {
  const e = essai(refusAdmin());
  const r = await ecrireRegle(e.hass, 'loggia/volets/config', PATCH, e.options);
  assert.equal(r, null, 'un refus ne rend pas de configuration');
  assert.deepEqual(e.envoyes, [{ type: 'loggia/volets/config', patch: PATCH }]);
  assert.equal(e.compte.annule, 1, 'le mode demandé resterait allumé jusqu’au sondage suivant — quinze secondes');
  assert.equal(e.dits.length, 1, 'le refus ne remonte pas au toast global : il revient en silence');
  assert.equal(e.dits[0].code, 'not_admin', '« unauthorized » se lirait comme une commande d’appareil refusée');
  assert.equal(clesDuToast(e.dits[0]), 'loggia_volets', 'le toast ne nomme pas la clé refusée');
  assert.ok(!/code administrateur/i.test(e.dits[0].message), 'le toast le prendrait pour un passage de profil Admin');
});

test('une coupure retire l’affichage, sans rien annoncer', async () => {
  const e = essai(new Error('Connection lost'));
  assert.equal(await ecrireRegle(e.hass, 'loggia/volets/config', PATCH, e.options), null);
  assert.equal(e.compte.annule, 1, 'rien n’est sûr d’être arrivé : l’écran redit ce que le serveur dit');
  assert.equal(e.dits.length, 0, 'une coupure n’est pas un refus : le toast se tait, comme pour saveCfg');
});

test('un succès rend la configuration enregistrée, et ne retire rien', async () => {
  const config = { planning: { actif: true, mode: 'nuit' } };
  const e = essai({ config });
  assert.deepEqual(await ecrireRegle(e.hass, 'loggia/volets/config', PATCH, e.options), { config },
    'sans la réponse, le bouton reviendrait à l’ancien mode quand le filet expire');
  assert.equal(e.compte.annule, 0);
  assert.equal(e.dits.length, 0);
});

test('sans Home Assistant, rien ne part et l’écran ne promet rien', async () => {
  const e = essai(null);
  assert.equal(await ecrireRegle(null, 'loggia/volets/config', PATCH, e.options), null);
  assert.equal(e.compte.annule, 1);
  assert.equal(e.dits.length, 0);
});

test('un refus déjà nommé par le serveur garde SES clés ; un autre code passe tel quel', () => {
  const serveur = Object.assign(new Error('reglages reserves aux administrateurs Home Assistant : loggia_rooms'), { code: 'not_admin' });
  assert.equal(refusNomme(serveur, 'loggia_volets'), serveur, 'le serveur nomme mieux que nous');
  const gros = Object.assign(new Error('trop gros'), { code: 'payload_too_large' });
  assert.equal(refusNomme(gros, 'loggia_volets'), gros);
  assert.equal(refusNomme(new Error('Connection lost'), 'loggia_volets'), null, 'une coupure n’est pas un refus');
  assert.equal(refusNomme(null, 'loggia_volets'), null);
});

test('le câblage : la barre passe par le filet commun, et le refus par le canal du toast', () => {
  const app = lire('src', 'App.jsx');
  const i = app.indexOf('function VoletsContent(');
  assert.ok(i > 0, 'la vue Volets a changé de forme');
  const corps = app.slice(i, app.indexOf('\nfunction ', i + 1));
  assert.ok(!corps.includes('setModeLoggia(x => x)'), 'le catch qui ne faisait rien est revenu');
  assert.ok(!corps.includes('setModeLoggia(m);'), 'le choix s’écrit de nouveau dans l’état lu, sans filet');
  assert.ok(corps.includes('const [ovMode, poserMode] = useOptimiste(modeLoggia);'), 'le mode demandé ne passe plus par useOptimiste');
  assert.ok(corps.includes("cle: 'loggia_volets', annuler: () => poserMode(null)"), 'un refus ne remet plus l’ancien mode tout de suite');
  assert.ok(corps.includes('style={barBtn(modeAffiche === m.id)}'), 'la barre ne montre plus le mode demandé');
  assert.match(app, /import \{[^}]*\becrireRegle\b[^}]*\} from '\.\/refus\.js';/, 'App ne passe plus par le filet commun de refus.js');
  // Le canal par défaut : un rejet que personne ne reprend, que le toast écoute.
  assert.ok(lire('src', 'refus.js').includes('const relancer = (err) => { Promise.reject(err); };'),
    'le refus ne remonte plus à l’écoute globale');
  // La clé nommée est bien celle où le composant range ses règles de volets.
  assert.ok(lire('custom_components', 'loggia', 'volets.py').includes('CLE = "loggia_volets"'),
    'la clé des règles de volets a changé : le toast nommerait une clé qui n’existe pas');
  // Et la règle du toast que `clesDuToast` recopie n'a pas bougé.
  assert.ok(app.includes("const cles = (String((r && r.message) || '').split(':')[1] || '').trim();"),
    'le toast ne lit plus les clés après les deux-points');
  assert.ok(app.includes("r && r.code === 'not_admin'"));
});
