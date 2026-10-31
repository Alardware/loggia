/* La fiche d'une prise, rendue (chantier Prises, § 3.5 à 3.8 ; ADR 0193, 0195,
 * 0196).
 *
 * La fiche est son propre module (src/ficheprise.jsx), chargé à la demande :
 * on le rend tel quel, avec ce que la coquille lui passe (la règle, la pièce,
 * une bascule de la maison doublée). L'état du serveur est posé dans le cache
 * partagé, les mesures du jour lues d'un serveur doublé, un tarif déclaré par
 * le tableau de bord Énergie. Les heures sont celles d'aujourd'hui, à Paris.
 * Ce qui est garanti ici :
 *  - allumée : le grand chiffre, la phrase longue, la courbe des 24 heures,
 *    l'énergie du jour en kWh et en euros, le compteur total et le tarif ;
 *  - protégée : le cadenas, « · protégée », la rangée Protéger allumée ; la
 *    bascule demande, la confirmation dit ses mots et « Couper quand même » ;
 *  - l'électroménager : Prévenir à la fin du cycle, l'appel d'Alertes sans
 *    téléphone, la bande du cycle et sa ligne, ses euros ;
 *  - muette, coupée : leurs mots, l'encart, le minuteur indisponible ;
 *  - un compte ordinaire lit tout et n'écrit rien : le refus nomme la clé ;
 *  - la coquille : une feuille sans onglets, la route d'une PRISE ; la feuille
 *    d'un switch qui ne mesure pas perd la puissance de la maison. */
process.env.TZ = 'Europe/Paris';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { MONOLITHE } from './monolithe.mjs'; // App.jsx et ce qui en sort (ADR 0282)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR', languages: ['fr-FR'] }, configurable: true });
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}
register('./jsx-hooks.mjs', import.meta.url);
const Fiche = (await import(new URL('../src/ficheprise.jsx', import.meta.url).href)).default;
const E = await import('../src/prisesetat.js');
const { setLoggiaState } = await import('../src/state.js');
const lire = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = MONOLITHE, FICHE = lire('src/ficheprise.jsx');

const a = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const NAS = 'switch.prise_nas', PC = 'switch.prise_pc', LV = 'switch.prise_lv';
const st = (id, state, nom, depuis, extra = {}) => [id, { entity_id: id, state, last_changed: depuis, attributes: { friendly_name: nom, ...extra } }];
const W = (id, w) => [id, { entity_id: id, state: String(w), attributes: { device_class: 'power', unit_of_measurement: 'W' } }];
const KWH = (id, k) => [id, { entity_id: id, state: String(k), attributes: { device_class: 'energy', unit_of_measurement: 'kWh' } }];
function maison({ pc = 'on', depuis = a(8, 50) } = {}) {
  return Object.fromEntries([st(NAS, 'on', 'Prise NAS (Zephyr)', a(2, 0)), W(NAS + '_power', 23), KWH(NAS + '_energy', 212.6),
    st(PC, pc, 'Prise PC Bureau (Atlas)', depuis), W(PC + '_power', 146), KWH(PC + '_energy', 846.1),
    st(LV, 'on', 'Prise lave-vaisselle', a(13, 40)), W(LV + '_power', 0.5), KWH(LV + '_energy', 507.3)]);
}
const capteurs = (id) => ({ prise: true, puissance: id + '_power', energie: id + '_energy' });
const entree = (o = {}) => ({ type: 'prise', impose: false, protegee: false, prevenir: false, cycle: null, cycles: [], ...o });
const ETAT = (o = {}) => ({ maintenant: a(20, 40), notifier: true, config: { protegees: [NAS], types: {}, prevenir: { [LV]: true } },
  prises: { [NAS]: entree({ type: 'nas', protegee: true }), [PC]: entree({ type: 'pc' }), [LV]: entree({ type: 'lv', prevenir: true, cycles: [{ debut: a(13, 40), fin: a(16, 14), kwh: 1.08 }] }) }, ...o });

/* L'état du serveur dans son cache, les mesures du jour du PC (deux moyennes et
 * 0,42 kWh comptés), un tarif unique du tableau de bord Énergie. */
async function poser({ etat = ETAT(), minuteurs = {} } = {}) {
  setLoggiaState({ index: null, resolved: { energy: { haids: {}, prix: [{ valeur: 0.2516, entite: null, compteur: null }] } } });
  const appels = [];
  const minuit = new Date(); minuit.setHours(0, 0, 0, 0);
  const t = (h) => minuit.getTime() + h * 3600000;
  const stats = { [PC + '_power']: [{ start: t(8), end: t(8) + 300000, mean: 120 }, { start: t(9), end: t(9) + 300000, mean: 160 }],
    [PC + '_energy']: [{ start: t(8), end: t(8) + 300000, change: 0.25 }, { start: t(9), end: t(9) + 300000, change: 0.17 }] };
  E.reglerPrisesEtat({ hass: { callWS: () => Promise.resolve(stats) }, horloge: { repeter: () => 0, arreter: () => {}, plusTard: (f) => { appels.push(f); return appels.length; }, annuler: () => {}, maintenant: () => Date.now() } });
  E.poserEtatPrises(etat);
  E.poserMinuteurs({ minuteurs, maintenant: Date.now() / 1000 });
  E.suivreMesures(Object.keys(stats));
  appels.forEach(f => f());
  await new Promise(r => setImmediate(r));
}
const Interrupteur = ({ on, nom, inerte }) => createElement('span', { role: 'switch', 'aria-checked': !!on, 'aria-disabled': inerte || undefined, 'aria-label': nom });
const fiche = (S, id, o = {}) => renderToStaticMarkup(createElement(Fiche, { hass: { states: S, callWS: () => Promise.resolve({}), config: { currency: 'EUR' }, ...(o.hass || {}) },
  id, prise: capteurs(id), piece: 'Bureau', bascule: Interrupteur, onFiche: () => {}, ...o.props }));

test('allumée : le grand chiffre, la phrase longue, la courbe, l’énergie du jour en kWh et en euros, le tarif', async () => {
  await poser();
  const html = fiche(maison(), PC);
  assert.ok(html.includes('>Prise PC Bureau (Atlas)<') && html.includes('>Bureau · ordinateur<'), 'le nom, et « pièce · type »');
  assert.ok(/<span style="font-size:48px;font-weight:800;letter-spacing:-.03em;line-height:1">146<\/span><span style="font-size:22px;font-weight:800">W<\/span>/.test(html), '« 146 » en 48 px, « W » en 22');
  assert.ok(html.includes('>En marche depuis 08:50<'), 'la phrase longue du § 4');
  assert.ok(!html.includes('aria-label="Protégée"') && html.includes('role="switch" aria-checked="true" aria-label="Prise PC Bureau (Atlas)"'), 'pas de cadenas ; la bascule de la maison');
  assert.ok(html.includes('class="o-prise-journee"') && html.includes('>200 W<') && html.includes('>24 h<'), 'la courbe des 24 heures, son plafond rond, son échelle');
  assert.ok(html.includes('stroke-dasharray:3 3'), 'le trait de l’heure');
  assert.ok(html.includes('>Aujourd’hui<') && html.includes('>0,42<span style="font-size:12px;font-weight:700;color:var(--o-text2)"> kWh</span>') && /0,11\s€/.test(html), 'aujourd’hui : les kWh de la carte, au prix du tarif');
  assert.ok(html.includes('>Ce mois-ci<'), 'le mois, à lire');
  assert.ok(html.includes('Compteur total : 846,1\u00A0kWh · tarif 0,2516\u00A0€/kWh (vue Énergie)'), 'le nombre et son unité ne se séparent pas en bout de ligne (F7)');
  assert.ok(!html.includes('Prévenir à la fin du cycle'), 'un ordinateur n’a pas de cycle');
  assert.ok(html.includes('>Ordinateur (deviné)<'), 'ce qu’elle alimente, deviné');
  for (const d of ['15 min', '30 min', '1 h', '2 h']) assert.ok(new RegExp('<button type="button" style="[^"]*opacity:1[^"]*">' + d + '</button>').test(html), d);
  assert.ok(html.includes('>Coupe la prise au bout du temps choisi.<'));
  assert.ok(html.includes('>L’appareil<') && html.includes('>L’épingle, les commandes et toutes ses entités<'));
});

test('protégée : le cadenas, « · protégée », Protéger allumé ; la confirmation, ses mots', async () => {
  await poser();
  const html = fiche(maison(), NAS);
  assert.ok(/<span role="img" aria-label="Protégée" title="Protégée"[^>]*><i[^>]*fi-rr-lock/.test(html));
  assert.ok(html.includes(' · protégée<'), 'la phrase dit la protection');
  assert.ok(/<button type="button" role="switch" aria-checked="true" aria-label="Protéger"/.test(html) && html.includes('>Demande avant de couper depuis Loggia<'));   // la portée dite honnêtement (audit du 19/10, point 11a)
  assert.ok(html.includes('>Serveur NAS (deviné)<') || html.includes('>Serveur NAS<'));
  // La confirmation (P5) : la bascule demande ; l'encart dit ses mots, « Couper quand même » en rouge.
  // La garde (B1) : protégée, OU protection pas encore lue — tests/fiche_prise_gestes.test.mjs joue les deux.
  assert.ok(FICHE.includes('const toucher = () => { if (on && garde) setDemande(true); else commanderPrise(!on); };'));
  assert.ok(FICHE.includes('const garde = protegee || g.inconnu;') && FICHE.includes("gardeDePrise(etat, id)") && !/from '\.\/App\.jsx'/.test(FICHE), 'la règle de la carte, lue dans prisesetat.js — la fiche n’importe jamais App.jsx');
  assert.ok(FICHE.includes("background: 'rgba(var(--o-bad-rgb),.08)', border: '1px solid rgba(var(--o-bad-rgb),.35)'"));
  assert.ok(FICHE.includes('{texteConfirmation(type, nom, watts)}') && FICHE.includes("lineHeight: '14px', color: 'var(--o-bad)' }}>{tr('Couper quand même')}</button>"));
  assert.ok(FICHE.includes("const b = racine.current && racine.current.querySelector('[data-annuler]');"), 'la demande prend le focus');
});

test('l’électroménager : Prévenir, l’appel d’Alertes sans téléphone, la bande du cycle et sa ligne avec ses euros', async () => {
  await poser({ etat: ETAT({ notifier: false }) });
  const html = fiche(maison(), LV);
  assert.ok(html.includes('>Prévenir à la fin du cycle<') && html.includes('>Une notification quand il a fini<'));
  assert.ok(/<button type="button" role="switch" aria-checked="true" aria-label="Prévenir à la fin du cycle"/.test(html), 'allumé : le serveur le dit');
  // ASSERTION MODIFIÉE (vouvoiement, 19/10) : le français vouvoie.
  assert.ok(html.includes('>Choisissez le téléphone dans Paramètres › Alertes<') && html.includes('color:var(--o-warn)'));
  assert.ok(/Cycle de 13:40 à 16:14 · 1,08\u00A0kWh · 0,27\s€/.test(html), 'la ligne du dernier cycle, et ce qu’il a coûté');
  assert.ok(html.includes('<rect ') && html.includes('fill:rgba(var(--o-cyan-rgb),.12)'), 'sa bande, dans la teinte du lave-vaisselle');
  assert.ok(html.includes('>Terminé à 16:14 · 1,08\u00A0kWh<'));
});

test('muette : « Indisponible », depuis quand, l’encart ; le minuteur attend la prise', async () => {
  await poser();
  const html = fiche(maison({ pc: 'unavailable', depuis: a(14, 20) }), PC);
  assert.ok(/<span style="font-size:clamp\(20px, calc\(100cqi \/ \(0\.64 \* 12\)\), 34px\);font-weight:800;color:var\(--o-bad\)">Indisponible<\/span>/.test(html), '34 px, moins quand la place manque');
  assert.ok(html.includes('>Depuis 14:20 · la prise ne répond plus<'));
  assert.ok(html.includes('Vérifiez qu’elle est branchée et à portée du réseau. Loggia la reprendra dès qu’elle répond.'), 'pas Zigbee : « du réseau »');
  assert.ok(html.includes('fi-rr-signal-alt-slash'));
  assert.ok(html.includes('>Disponible une fois la prise allumée.<'));
  // Les PUCES du minuteur sont inertes — `aria-disabled` et la teinte à .4 sur chacune des quatre durées, pas seulement sur la bascule
  // (relecture finale, B7 : l'ancienne assertion cherchait `aria-disabled` dans toute la page, et la bascule la contentait seule).
  for (const d of ['15 min', '30 min', '1 h', '2 h']) assert.ok(new RegExp('<button type="button" aria-disabled="true" style="[^"]*opacity:0[.]4[^"]*">' + d + '</button>').test(html), 'la puce ' + d + ' est inerte');
  assert.ok(!/<button type="button" style="[^"]*opacity:1[^"]*">(15 min|30 min|1 h|2 h)<\/button>/.test(html), 'aucune durée active');
  assert.ok(html.includes('role="switch" aria-checked="false" aria-disabled="true"'), 'la bascule, inerte');
});

test('coupée : « Coupée », depuis quand ; un minuteur qui tourne : sa fin, +15 min, +1 h, Annuler', async () => {
  await poser();
  const coupee = fiche(maison({ pc: 'off', depuis: a(20, 40) }), PC);
  assert.ok(/<span style="font-size:clamp\(20px, calc\(100cqi \/ \(0\.64 \* 6\)\), 34px\);font-weight:800;color:var\(--o-text2\)">Coupée<\/span>/.test(coupee) && coupee.includes('>Depuis 20:40<'));
  const fin = Math.floor(Date.now() / 1000) + 30 * 60;   // à la seconde : « dans 30 min », pas 31
  await poser({ minuteurs: { [PC]: { fin, duree: 30 } } });
  // Coupée, le minuteur que le sondage tient encore est périmé (B3) : « Disponible… », les durées inertes, ni « Se coupe à » ni « +1 h ».
  const fantome = fiche(maison({ pc: 'off', depuis: a(20, 40) }), PC);
  assert.ok(fantome.includes('>Disponible une fois la prise allumée.<') && !fantome.includes('>Se coupe à') && !fantome.includes('>+1 h</button>') && !fantome.includes('>+15 min</button>'));
  for (const d of ['15 min', '30 min', '1 h', '2 h']) assert.ok(new RegExp('<button type="button" aria-disabled="true" style="[^"]*opacity:0[.]4[^"]*">' + d + '</button>').test(fantome), 'la puce ' + d + ' est inerte');
  const html = fiche(maison(), PC);
  const h = new Date(fin * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  assert.ok(html.includes('>Se coupe à ' + h + ' · dans 30\u00A0min<'), 'la fin, et le temps qu’il reste — « 30 » et « min » ne se séparent pas (F7)');
  assert.ok(html.includes('>+15 min</button>') && html.includes('>+1 h</button>') && html.includes('>Annuler</button>'));
  assert.ok(FICHE.includes("minuteur({ type: 'loggia/minuteurs/poser', entity_id: id, minutes: n })") && FICHE.includes("minuteur({ type: 'loggia/minuteurs/annuler', entity_id: id })"));
});

test('un compte ordinaire lit tout et n’écrit rien : le refus nomme la clé (P4)', async () => {
  await poser();
  const html = fiche(maison(), PC, { hass: { user: { is_admin: false } } });
  assert.ok(/<button type="button" aria-disabled="true" style="[^"]*">.*Ce qu’elle alimente/.test(html), 'la rangée se lit, inerte');
  assert.ok(FICHE.includes("raisonEchec(Object.assign(new Error('Unauthorized'), { code: 'unauthorized' }), 'loggia_prises')"));
  assert.ok(FICHE.includes("if (ordinaire) { setErr({ ou, texte: refusLecture() }); return; }"));
  // Un administrateur écrit dans la file de la fiche, `protegees` ENTIÈRE ; la réponse porte l'état entier.
  assert.ok(FICHE.includes("const [file] = useState(() => fileEcritures(relireConfig));"));
  assert.ok(FICHE.includes("ecrireRegle(hass, 'loggia/prises/config', patch, { cle: 'loggia_prises',") && FICHE.includes('.then((r) => { if (r && r.etat) poserEtatPrises(r.etat); },'));
  // Une relecture qui échoue n'écrit rien (B6) : la promesse rejetée est reprise — l'avance s'annule, la rangée dit l'échec.
  assert.ok(FICHE.includes("(x) => { poserOvCfg(null); if (vivant.current) setErr({ ou, texte: raisonEchec(x, 'loggia_prises') }); });"));
  assert.ok(FICHE.includes("throw new Error('loggia/prises/etat : la configuration n’a pas pu être relue');"));
});

test('la coquille : une feuille sans onglets, chargée à la demande ; la route d’une PRISE ; la feuille d’un switch qui ne mesure pas', () => {
  assert.ok(APP.includes("const FichePriseContent = lazyRecharge(() => import('./ficheprise.jsx'));"));
  const i = APP.indexOf('\nfunction FichePrise(');
  const coquille = APP.slice(i, APP.indexOf('\n}\n', i));
  assert.ok(coquille.includes('<BottomSheet onClose={onClose}>') && !coquille.includes('onglets'), 'sa hauteur suit son contenu');
  assert.ok(coquille.includes('bascule={RmBascule}') && coquille.includes('{defaut || <PlugIcon size={18} />}'));
  // Une prise — ou un switch que l'index ne classe pas encore et que la règle commune garde (F2, choisi à l'ouverture : `prisePop.fiche`) — ouvre la fiche.
  assert.ok(APP.includes('{prisePop && (priseDe(S, prisePop.id).prise || prisePop.fiche ? <FichePrise id={prisePop.id} hass={hass} onClose={() => setPrisePop(null)} />'));
  assert.ok(APP.includes("setPrisePop({ id, fiche: gardeDeSwitch(lireEtatPrises(), id, { reconnue: priseDe(S, id).prise, indexLu: indexLu() }) });"));
  // ASSERTION MODIFIÉE (audit des prises, 19/10) : le contenu de la feuille d'un switch vit dans ficheswitch.jsx.
  const SW = readFileSync(new URL('../src/ficheswitch.jsx', import.meta.url), 'utf8');
  const j = SW.indexOf('function FicheSwitchContent(');
  assert.ok(j >= 0, 'la feuille d’un switch existe');
  const feuille = SW.slice(j, SW.indexOf('\n}\n', j));
  for (const mot of ['pickSibling', 'Puissance instantanée', 'Compteur de l’appareil']) assert.ok(!feuille.includes(mot), 'la feuille d’un switch qui ne mesure pas lit encore ' + mot);
});

test('le Journal du jour (tâche 11) : le logbook et le journal de Loggia, depuis minuit ; à lire, puis « Rien depuis minuit. »', async () => {
  await poser();
  const html = fiche(maison(), PC);
  assert.ok(html.includes('class="o-prise-journal"') && html.includes('>Journal du jour<'), 'son titre en petites capitales');
  assert.ok(html.includes('>Chargement…<'), 'avant la première lecture');
  // Le logbook se lit depuis la VEILLE, 24 h avant minuit (F1) : le dernier état d'hier fait « De retour », et d'une reprise après un redémarrage, pas un geste.
  assert.ok(FICHE.includes("appeler({ type: 'logbook/get_events', start_time: new Date(minuit - VEILLE_MS).toISOString(), entity_ids: [id] })"));
  assert.ok(readFileSync(new URL('../src/prisesfiche.js', import.meta.url), 'utf8').includes('export const VEILLE_MS = 24 * 3600000;'));
  assert.ok(FICHE.includes("appeler({ type: 'loggia/volets/manoeuvres', entity_id: id, depuis: Math.floor(minuit / 1000) })"), 'la commande des volets, réutilisée telle quelle (le contrat du plan 1)');
  assert.ok(FICHE.includes('const journal = useJournalDuJour(hass, id, minuitLocal(t), st ? st.last_changed : null);'), 'relu quand la prise change');
  assert.ok(FICHE.includes("tr('Rien depuis minuit.')") && FICHE.includes("tr('Le journal n’a pas pu être lu.')"), 'et, quand le logbook n’a pas pu être lu, le dit (B4 : tests/fiche_prise_gestes.test.mjs)');
});
