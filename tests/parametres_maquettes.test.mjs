// ─────────────────────────────────────────────────────────────────────────────
// Les Paramètres refaits sur les maquettes du 18/09/2026 (ADR 0050).
//
// Dix pages, une seule façon de parler : les briques de `parcommun.jsx`. Ce
// que les maquettes ne montraient pas est parti. Plusieurs phrases qu'elles
// portaient ne disaient pas ce que fait Loggia : elles ont été corrigées, et
// ce fichier relit chacune contre le code qui la rend vraie.
//
// La pastille Ko-fi d'« À propos » garde son dessin : « soutenir le projet ne
// change pas, il reste tel quel ». Depuis le retour suivant (« me soutenir en
// dessous »), elle ferme la page, sous la zone rouge.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// La langue avant l'import : `tr` lit celle du navigateur au premier appel.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fr-FR' }, configurable: true });
const { libelleGeste } = await import('../src/gestes.js');

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (...p) => readFileSync(join(RACINE, ...p), 'utf8');
const PAR = lire('src', 'views', 'parametres.jsx');
const INTER = lire('src', 'views', 'interrupteurs.jsx');
const COMMUN = lire('src', 'views', 'parcommun.jsx');
const APP = lire('src', 'App.jsx');
const DEMO = lire('src', 'demo.js');
const ALERTES_PY = lire('custom_components', 'loggia', 'alertes.py');

const entre = (texte, debut, fin) => {
  const i = texte.indexOf(debut);
  assert.notEqual(i, -1, 'introuvable : ' + debut);
  const j = texte.indexOf(fin, i + debut.length);
  assert.notEqual(j, -1, 'fin introuvable : ' + fin);
  return texte.slice(i, j);
};
const APROPOS = entre(PAR, "{tab === 'about' && (() => {", 'const HA_CFG_DEF');
const CONNEXION = entre(PAR, "{tab === 'connexion' && (", "{tab === 'users' && (");
const ALERTES = entre(PAR, 'const ALERTES_CLASSES', '/* ════════════ VUES PERSONNALISÉES');

// ── À propos ────────────────────────────────────────────────────────────────

test('la pastille Ko-fi d’« À propos » reste telle quelle', () => {
  assert.ok(APROPOS.includes('<a href="https://ko-fi.com/alardware" target="_blank" rel="noopener noreferrer"'), 'le lien a changé');
  assert.ok(APROPOS.includes("style={{ display: 'inline-flex', alignSelf: 'center', alignItems: 'center', gap: 10, padding: '13px 26px', borderRadius: 999, background: '#72a4f2', color: '#152744', fontSize: 14, fontWeight: 800, textDecoration: 'none', boxShadow: '0 10px 26px rgba(114,164,242,.26)' }}>"), 'son dessin a changé');
  assert.ok(APROPOS.includes("{tr('Me soutenir sur Ko-fi')}"), 'son texte a changé');
  assert.ok(!PAR.includes('Soutenir le projet'), 'la tuile de la maquette a remplacé la pastille');
  // Rien n'est chargé depuis ko-fi.com : la tasse est dessinée ici.
  assert.ok(APROPOS.includes('<path d="M3 6.6h13v6.6a6.5 6.5 0 0 1-13 0z" fill="#fff" />'), 'la tasse dessinée a disparu');
});

test('l’installation tient en cinq lignes, la configuration en pied de panneau', () => {
  for (const t of ['Version', 'Socle technique', 'Typographie', 'Entités suivies', 'Cache local']) {
    assert.ok(APROPOS.includes(`<Ligne titre={tr('${t}')}`), 'ligne absente : ' + t);
  }
  assert.ok(APROPOS.includes("{tr('La configuration Loggia s’exporte en un fichier JSON.')}"));
  assert.ok(APROPOS.includes("telechargerConfig(j, 'loggia-config')"), 'l’export complet a disparu');
  assert.ok(APROPOS.includes('await importConfigComplete(await f.text());'), 'l’import complet a disparu');
  // L'import reste un geste d'administrateur.
  assert.ok(/\{isAdmin && \(\s*<>\s*<input aria-label=\{tr\('Importer un fichier de configuration'\)\}/.test(APROPOS), 'l’import s’offre à tous');
  // Sans entité de suivi, pas de pastille « à jour » : on ne l'a pas vérifié.
  assert.ok(PAR.includes('const droite = inst.aJour === null ? null : inst.aJour'), 'la pastille rassurerait sans savoir');
});

test('la remise à zéro dit ce qu’elle efface : la configuration de toute la maison', () => {
  // La maquette disait « de cet appareil ». `resetLoggiaComplet` vide la
  // partie commune du serveur — vues, profils, règles, scénarios.
  assert.ok(APROPOS.includes('pour toute la maison — une sauvegarde part d’abord. Les automatisations Home Assistant ne sont pas touchées.'));
  assert.ok(!PAR.includes('les réglages de cet appareil. Les automatisations'), 'la phrase fausse de la maquette est revenue');
  const etat = lire('src', 'state.js');
  assert.ok(entre(etat, 'export async function resetLoggiaComplet()', '\n}\n').includes("type: 'loggia/config/set', config: patch"), 'la remise à zéro ne touche plus le serveur : la phrase deviendrait fausse');
  assert.ok(/\{isAdmin && \(\s*<Panneau niveau="danger">/.test(APROPOS), 'la zone rouge s’offre à tous');
});

// ── Connexion ───────────────────────────────────────────────────────────────

test('Connexion : ce que la page affirme, le code le fait', () => {
  assert.ok(!PAR.includes('PAR_HELPS') && !PAR.includes("tr('Bon à savoir')") && !PAR.includes('Tester la session'), 'ce que la maquette ne montrait pas est revenu');
  // « Les deux adresses sont testées à l'enregistrement » : faux, Enregistrer
  // écrit puis recharge.
  assert.ok(!PAR.includes('testées à l’enregistrement') && !PAR.includes("testées à l'enregistrement"));
  assert.ok(CONNEXION.includes("{tr('Enregistrer recharge Loggia avec ces réglages.')}"));
  assert.ok(PAR.includes('const saveHaCfg = () => { writeHaCfg(haDraft); location.reload(); };'), 'Enregistrer ne recharge plus : la phrase deviendrait fausse');
  // La bascule regarde si Home Assistant a répondu, pas le réseau.
  assert.ok(CONNEXION.includes("tr('Passer par Nabu Casa quand Home Assistant ne répond pas sous 2 s.')"));
  assert.ok(APP.includes('if (getHass()) return; // Home Assistant a repondu'), 'la bascule ne regarde plus Home Assistant');
  // L'assistant répond à l'orbe, pas à la recherche.
  assert.ok(CONNEXION.includes('qui répond à l’orbe, en haut de l’écran et dans la barre du bas.'));
  assert.ok(APP.includes('onAssistant: assistantNs ? () => setAssistantOuvert(true) : null'), 'l’orbe n’ouvre plus l’assistant');
  // La pastille de session vient d'un vrai appel, pas d'une supposition.
  assert.ok(PAR.includes(": lat === -1 ? <Pastille niveau=\"danger\" point>{tr('Home Assistant ne répond pas')}</Pastille>"));
});

// ── Alertes ─────────────────────────────────────────────────────────────────

test('les familles de capteurs se comptent avec les classes du composant', () => {
  // Le composant (alertes.py) reconnaît chaque danger à sa classe ; l'écran
  // compte avec la même table, sinon il annoncerait des détecteurs qui
  // n'alertent pas.
  const serveur = {};
  for (const m of entre(ALERTES_PY, 'BINAIRES: dict[str, tuple[str, str]] = {', '}').matchAll(/"(\w+)": \("(\w+)"/g)) {
    (serveur[m[2]] = serveur[m[2]] || []).push(m[1]);
  }
  const ecran = {};
  for (const m of entre(PAR, 'const ALERTES_CLASSES = {', '};').matchAll(/(\w+): \[([^\]]*)\]/g)) {
    ecran[m[1]] = [...m[2].matchAll(/'(\w+)'/g)].map(x => x[1]);
  }
  for (const k of Object.keys(serveur)) serveur[k].sort();
  for (const k of Object.keys(ecran)) ecran[k].sort();
  assert.deepEqual(ecran, serveur);
});

test('couper le téléphone ne coupe pas la maison, et le bandeau le dit', () => {
  // `_reagir` ne lit que les actions : l'interrupteur des alertes téléphone
  // n'y est pour rien. La maquette disait « rien ne partira » — vrai pour le
  // téléphone, faux pour la maison.
  const reagir = entre(ALERTES_PY, 'async def _reagir(', 'async def _danger_passe(');
  assert.ok(reagir.includes('if not actions.get("actif"):') && !reagir.includes('cfg.get("actif")'), 'la maison dépend maintenant du téléphone : le bandeau deviendrait faux');
  assert.ok(ALERTES.includes("{cfg.actions.actif ? ' ' + tr('La maison réagit quand même aux dangers.') : ''}"));
  // Les réglages coupés restent lisibles et modifiables.
  assert.ok(ALERTES.includes('opacity: cfg.actif ? 1 : .5'));
});

test('la vanne automatique est celle du composant, et l’écran la nomme', () => {
  assert.ok(entre(ALERTES_PY, 'def _vanne(', 'async def _reagir(').includes('== "water"'), 'le composant a changé de règle');
  assert.ok(ALERTES.includes("vannes.find(id => (S[id].attributes || {}).device_class === 'water')"));
  assert.ok(ALERTES.includes("tr('Vide : la première vanne d’eau que Home Assistant connaît. Une prise commandée vaut aussi.')"));
});

test('une lecture ratée se dit, au lieu de charger pour toujours', () => {
  assert.ok(ALERTES.includes("{msg || tr('Chargement…')}"), 'l’écran resterait sur « Chargement… »');
  // Un test d'envoi refusé par Home Assistant se dit aussi : l'appel est une
  // promesse, un `try` synchrone ne voyait rien.
  assert.ok(ALERTES.includes(".catch(() => setMsg(tr('Envoi impossible — Home Assistant a refusé ce service.')))"));
  // L'anti-rafale affiché est celui réglé, pas un chiffre écrit en dur.
  assert.ok(ALERTES.includes('{ n: cfg.cooldown_min || 5 }'));
});

// ── Mises à jour, automatisations ───────────────────────────────────────────

test('les mises à jour se rangent par intégration, firmwares d’abord', () => {
  assert.ok(PAR.includes("if (p === 'mqtt') return { g: tr('Firmwares · Zigbee2MQTT'), icone: 'terminal', rang: 0 };"));
  assert.ok(PAR.includes("if (p === 'hacs') return { g: tr('Modules · HACS'), icone: 'apps', rang: 2 };"));
  assert.ok(PAR.includes('groupes.sort((a, b) => a.rang - b.rang);'));
  // « Tout installer » garde sa confirmation en deux temps.
  assert.ok(PAR.includes('if (!updAllConfirm) { setUpdAllConfirm(true); setTimeout(() => setUpdAllConfirm(false), 4000); return; }'));
  // « Vérifié il y a » ne s'écrit qu'après une vraie demande à Home Assistant.
  const verifier = entre(PAR, 'const verifier = () => {', '};');
  assert.ok(verifier.indexOf("'update_entity'") >= 0 && verifier.indexOf("'update_entity'") < verifier.indexOf("localStorage.setItem('loggia-maj-verifie'"));
});

test('les automatisations : une recherche, trois filtres, pas de lien vers nulle part', () => {
  assert.ok(!PAR.includes('Tout déplier') && !PAR.includes('Tout replier'), 'ce que la maquette ne montrait pas est revenu');
  assert.ok(PAR.includes("opts={[['all', tr('Toutes')], ['on', tr('Actives')], ['off', tr('Inactives')]]} onPick={setAutoFilter}"));
  assert.ok(PAR.includes("droite: window.__loggiaDemo ? null : <a href={accessOrigin + '/config/automation/dashboard'}"), 'la démo pointerait vers un Home Assistant qui n’existe pas');
  assert.ok(PAR.includes("(autos.length ? ' · ' + tr('{a} actives sur {n}'"), 'l’en-tête compterait « 0 actives sur 0 »');
});

// ── Interrupteurs ───────────────────────────────────────────────────────────

test('un geste se lit en français, et un code inconnu n’invente rien', () => {
  const attendus = {
    on_press: 'Haut · appui', off_hold: 'Bas · maintien', off_press_release: 'Bas · relâché',
    on_hold_release: 'Haut · fin de maintien', up_press_release: 'Plus · relâché', identify: 'Appairage',
    brightness_move_up: 'Plus · maintien', single_left: 'Gauche · appui simple', button_2_hold: 'Bouton 2 · maintien',
    on: 'Haut', single: 'Appui simple',
  };
  for (const [code, lib] of Object.entries(attendus)) assert.equal(libelleGeste(code), lib, code);
  for (const inconnu of ['', 'scene_3', 'rotate_left_fast']) assert.equal(libelleGeste(inconnu), null, inconnu);
});

test('le code reste à côté du libellé, et chaque télécommande n’apparaît qu’une fois', () => {
  assert.ok(INTER.includes("{lib && <div style={{ ...MONO, fontSize: 11, color: 'var(--o-text3)', marginTop: 1 }}>{code}</div>}"), 'le code disparaîtrait derrière le libellé');
  assert.ok(INTER.includes('journal.forEach(v => { if (!derniers.some(x => x.cle === v.cle)) derniers.push(v); });'));
  // Un bouton compte quand il déclenche quelque chose — une liste vide, non.
  assert.ok(INTER.includes('filter(g => Array.isArray(g) && g.length > 0)'));
  assert.ok(PAR.includes("tr('Boutons sans fil Zigbee') + (c ? ' · ' + t + ', ' + g : '')"));
});

// ── Le reste ────────────────────────────────────────────────────────────────

test('le sommaire ne prétend plus que tout est propre à l’appareil', () => {
  assert.ok(!PAR.includes("tr('Réglages propres à cet appareil')"));
  assert.ok(PAR.includes("{tr('Réglages de Loggia')} · {users.length > 1 ? tr('{n} profils du foyer'"));
});

test('une pastille garde sa police, même posée dans un titre en italique', () => {
  assert.ok(COMMUN.includes("fontFamily: 'var(--o-font)', fontStyle: 'normal'"));
});

test('la démo a de quoi montrer ces pages, sans composant serveur', () => {
  assert.ok((DEMO.match(/'automation\.[a-z_]+': s\(/g) || []).length >= 8, 'la page des automatisations serait vide');
  assert.ok(DEMO.includes("['update.interrupteur_couloir_firmware', 'mqtt']") && DEMO.includes("['update.carte_meteo_animee_update', 'hacs']"), 'les mises à jour n’auraient pas d’intégration');
  assert.ok(DEMO.includes("if (msg && msg.type === 'get_services')"), 'aucun téléphone à choisir');
  assert.ok(DEMO.includes("'device_tracker.telephone_de_camille'"), 'le téléphone n’aurait pas de nom');
  assert.ok(DEMO.includes('loggia_alertes: { actif: true'), 'les alertes n’auraient pas de réglages');
  // Sans composant, les alertes se règlent dans la configuration de la démo,
  // et le bouton d'essai ne prétend pas avoir envoyé quoi que ce soit.
  assert.ok(ALERTES.includes('if (typeof window !== \'undefined\' && window.__loggiaDemo) { setLocal(true);'));
  assert.ok(ALERTES.includes("if (local) { setMsg(tr('Démonstration : rien ne part vers un vrai téléphone.')); return; }"));
});

// ── Retour du 18/09, après la v3.51.0 ───────────────────────────────────────

test('la pastille Ko-fi passe sous la zone rouge, sans changer de dessin', () => {
  // « me soutenir en dessous » : la fin de la page, sous « Réinitialiser Loggia ».
  const danger = APROPOS.indexOf('<Panneau niveau="danger">');
  const kofi = APROPOS.indexOf('<a href="https://ko-fi.com/alardware"');
  assert.ok(danger > 0 && kofi > danger, 'la pastille est remontée au-dessus de la zone rouge');
});

test('l’écoute des interrupteurs se coupe, et s’ouvre pour un temps compté', () => {
  // Comme l'appairage de zigbee2mqtt : un bouton, puis un compte à rebours.
  const serveur = lire('custom_components', 'loggia', 'interrupteurs.py');
  const s = Number((serveur.match(/^ECOUTE_S = (\d+)$/m) || [])[1]);
  assert.ok(INTER.includes('const ECOUTE_S = ' + s + ';'), 'la page et le serveur ne comptent plus la même durée');
  assert.ok(INTER.includes("h.callWS({ type: 'loggia/interrupteurs/ecouter', duree })"));
  assert.ok(INTER.includes("<button onClick={() => ecouter(ECOUTE_S)} style={btnPrimaire}>") && INTER.includes("{tr('Écouter 5 min')}"));
  assert.ok(INTER.includes("<button onClick={() => ecouter(0)}") && INTER.includes("{tr('Arrêter l’écoute')}<span style={{ ...MONO, fontWeight: 700 }}>{mmss(reste)}</span>"));
  // Coupée : ni derniers appuis, ni télécommandes qui n'ont rien de réglé.
  assert.ok(INTER.includes('{ecoute && <>'), 'les derniers appuis restent affichés écoute coupée');
  assert.ok(INTER.includes('return (appareils || []).filter(a => ecoute || ((a && a.affectees) || []).length > 0);'));
  // Seul un administrateur ouvre l'écoute — le serveur le vérifie aussi.
  assert.ok(INTER.includes('const admin = !!(hass && hass.user && hass.user.is_admin);'));
  assert.ok(DEMO.includes("if (msg && msg.type === 'loggia/interrupteurs/ecouter')"), 'la démo ne sait pas ouvrir l’écoute');
});

test('les puces de navigation choisies sont en bleu plein, texte blanc', () => {
  // La référence : les puces des règles (« Séjour »). Les teintes pâles des
  // filtres, pièces et onglets sont parties.
  const sites = [
    [APP, "border: 'var(--o-bw,1px) solid ' + (on ? 'transparent' : 'var(--o-bd2)'), background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>", 'filtres d’Objets'],
    [APP, "background: on ? 'var(--o-accent-fond)' : 'var(--o-s2)', color: on ? '#fff' : 'var(--o-text1)' }}>", 'pièces'],
    [APP, "const miniBtn = (on) => ({ padding: '5px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: on ? 'var(--o-accent-fond)'", 'pièces Hue'],
    [APP, "background: actif ? 'var(--o-accent-fond)' : 'transparent', color: actif ? '#fff' : 'var(--o-text2)' });", 'modes des volets'],
    [APP, "background: actif === id ? 'var(--o-accent-fond)' : 'transparent', color: actif === id ? '#fff' : 'var(--o-text2)' }}>{lb}</button>", 'Puissance / Consommation'],
    [APP, "background: onglet === id ? 'var(--o-accent-fond)' : 'transparent', color: onglet === id ? '#fff' : 'var(--o-text2)' }}>{lbl}</button>", 'onglets de la bibliothèque'],
    [lire('src', 'ficherobot.jsx'), "style={{ background: actuel === id ? 'var(--o-accent-fond)' : 'transparent', color: actuel === id ? '#fff' : 'var(--o-text2)' }}>", 'onglets d’un robot'],
    [lire('src', 'views', 'systeme.jsx'), "background: x.cle === s.cle ? 'var(--o-accent-fond)' : 'transparent', color: x.cle === s.cle ? '#fff' : 'var(--o-text2)' }}>{x.nom}</button>", 'séries du Système'],
  ];
  for (const [src, bout, nom] of sites) assert.ok(src.includes(bout), nom + ' : la puce choisie n’est plus en bleu plein');
  assert.ok(!APP.includes("background: on ? 'rgba(var(--o-accent-rgb),.14)' : 'var(--o-s1)', color: on ? 'var(--o-accent-soft)' : 'var(--o-text1)' }}>"), 'un filtre pâle est revenu');
});

test('la consigne se lit entre les deux boutons des cartes climat', () => {
  // Carte du thermostat et carte du fil pilote : « − 19 °C + ».
  assert.equal((APP.match(/<span aria-label=\{tr\('Consigne'\)\}/g) || []).length, 2);
  assert.equal((APP.match(/const consigne = \(Number\.isInteger\(Number\(target\)\)/g) || []).length, 2);
  // Le sous-titre dit l'état ; il ne répète plus la valeur.
  assert.ok(!APP.includes("tr('Chauffe') + ' · ' + consigne"), 'la consigne est dite deux fois');
});
