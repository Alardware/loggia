// ─────────────────────────────────────────────────────────────────────────────
// La garantie centrale : ce code doit marcher chez quelqu'un d'autre.
//
// Loggia est écrit sur une installation, et destiné à toutes. Rien de ce qui
// n'existe que chez son auteur n'a le droit de figurer dans le code : ni
// identifiant d'entité, ni nom de personne, ni adresse, ni marque citée comme
// s'il n'en existait qu'une.
//
// Ces tests lisent les fichiers source eux-mêmes. Ils sont lents et grossiers,
// mais ils tiennent une promesse qu'aucun test de comportement ne peut tenir :
// celle de ce qui n'est PAS écrit.
// ─────────────────────────────────────────────────────────────────────────────

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(RACINE, 'src');

/**
 * Les fichiers source, avec leur contenu — `src/` ENTIER, sous-dossiers compris.
 *
 * Lot 15 de l'audit du 03/10 : la lecture s'arrêtait à la racine, et les onze
 * vues de `src/views/` (Paramètres, Interrupteurs, Volets…) comme les
 * catalogues de `src/langues/` échappaient à tout ce fichier — un identifiant
 * d'entité ou une adresse écrits là passaient. Le nom est le chemin depuis
 * `src/` (« views/volets.jsx ») : les listes de moteurs plus bas ne nomment
 * que la racine, elles n'en changent pas.
 */
function sources(dossier = SRC) {
  const out = [];
  for (const f of readdirSync(dossier)) {
    const p = join(dossier, f);
    if (statSync(p).isDirectory()) { out.push(...sources(p)); continue; }
    if (!/\.(js|jsx)$/.test(f)) continue;
    const nom = relative(SRC, p).split(sep).join('/');
    // demo.js est la maison de démonstration : ses identifiants sont INVENTÉS
    // et publics par construction — c'est tout son objet. L'exempter ici ne
    // troue pas le filet : il ne s'exécute que derrière `?demo`.
    if (nom === 'demo.js') continue;
    out.push({ nom, texte: readFileSync(p, 'utf8') });
  }
  return out;
}

/**
 * Retire commentaires et documentation.
 *
 * Un commentaire a le droit de citer un exemple — « ex. cover.volet_salon » est
 * une explication, pas une dépendance. Ce qui compte est ce que le code
 * EXÉCUTE.
 */
function sansCommentaires(texte) {
  return texte
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** Les lignes d'un texte qui contiennent un motif, avec leur numéro. */
function lignes(texte, motif) {
  const out = [];
  texte.split('\n').forEach((l, i) => {
    if (motif.test(l)) out.push(`${i + 1}: ${l.trim().slice(0, 120)}`);
  });
  return out;
}

// Les domaines dont un identifiant complet désignerait une entité précise.
const DOMAINES = ['light', 'switch', 'sensor', 'binary_sensor', 'climate', 'cover',
  'vacuum', 'camera', 'media_player', 'lock', 'fan', 'scene', 'script', 'automation',
  'input_boolean', 'input_number', 'input_select', 'person', 'alarm_control_panel',
  'lawn_mower', 'water_heater', 'humidifier', 'siren', 'valve', 'todo', 'update'];

/**
 * Un identifiant d'entité DANS UNE CHAÎNE littérale.
 *
 * On ne cherche que les chaînes : `light.turn_on` écrit dans du code est un
 * accès à une propriété, et `states[id]` ne cite rien. Un `'light.salon'` entre
 * guillemets, en revanche, ne peut être qu'une entité de l'installation de son
 * auteur.
 */
const ENTITE_LITTERALE = new RegExp(
  `['"\`](?:${DOMAINES.join('|')})\\.[a-z0-9_]{3,}['"\`]`, 'g');

test('aucun identifiant d’entité n’est écrit en dur dans le code exécuté', () => {
  const fautes = [];
  sources().forEach(({ nom, texte }) => {
    /* Un nom de SERVICE n'est pas une entité (lot 15 de l'audit du 03/10) :
     * `'light.turn_on'`, que la vue des Interrupteurs écrit pour ses gestes,
     * vaut chez tout le monde. Les trois verbes de bascule seulement, les seuls
     * écrits en chaîne aujourd'hui : un autre service s'ajoutera ici sciemment,
     * et `'light.salon_turn_on'` reste une entité. */
    const trouves = (sansCommentaires(texte).match(ENTITE_LITTERALE) || [])
      .filter(s => !/^['"`][a-z_]+\.(?:turn_on|turn_off|toggle)['"`]$/.test(s));
    // Un domaine seul suivi d'un point (`'light.'`) est un préfixe de filtre,
    // pas une entité : il vaut pour toutes les lampes de n'importe qui.
    // `*.biblio*` est le préfixe RÉSERVÉ aux entités fictives de la
    // Bibliothèque de cartes : elles n'existent sur aucune installation.
    const vrais = [...new Set(trouves.filter(s => !/^['"`][a-z_]+\.['"`]$/.test(s) && !/\.biblio(_[a-z0-9_]+)?['"`]$/.test(s)))];
    if (vrais.length) fautes.push(`${nom} : ${vrais.join(', ')}`);
  });
  assert.deepEqual(fautes, [],
    'ces identifiants n’existent que sur une installation :\n  ' + fautes.join('\n  '));
});

test('aucun prénom ni nom de personne dans le code exécuté', () => {
  // Une installation nomme ses pièces et ses appareils d'après ses habitants.
  // Ces noms ne doivent pas voyager avec le code — c'est une question de
  // confidentialité autant que de portabilité.
  // « Sam. » abrège samedi et « Alex » est un prénom de fixture : trop ambigus
  // pour être cherchés dans du texte libre. Les autres sont sans équivoque.
  const interdits = /\b(guillaume|alard|liam|luna)\b/i;
  const fautes = [];
  sources().forEach(({ nom, texte }) => {
    const l = lignes(sansCommentaires(texte), interdits);
    if (l.length) fautes.push(`${nom}\n    ` + l.join('\n    '));
  });
  assert.deepEqual(fautes, [], 'noms propres trouvés :\n  ' + fautes.join('\n  '));
});

test('aucune adresse d’installation ni jeton', () => {
  // Une adresse IP fixe, un jeton, un mot de passe : autant de choses qui font
  // marcher le dashboard chez une seule personne, ou qui ne devraient jamais
  // sortir de chez elle.
  const motifs = [
    // Un chemin SVG est plein de nombres pointés : seule une adresse écrite
    // dans une chaîne, éventuellement précédée d'un schéma, en est vraiment une.
    { quoi: 'adresse IP', re: /['"`](?:https?:\/\/)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?[/'"`]/ },
    { quoi: 'jeton', re: /\b(?:eyJ[A-Za-z0-9_-]{20,}|[A-Fa-f0-9]{64})\b/ },
    { quoi: 'mot de passe', re: /\b(password|passwd|api_key|secret)\s*[:=]\s*['"`][^'"`]+['"`]/i },
  ];
  const fautes = [];
  sources().forEach(({ nom, texte }) => {
    const code = sansCommentaires(texte);
    motifs.forEach(({ quoi, re }) => {
      lignes(code, re).forEach(l => fautes.push(`${nom} (${quoi}) ${l}`));
    });
  });
  assert.deepEqual(fautes, [], 'à retirer :\n  ' + fautes.join('\n  '));
});

test('les moteurs génériques ne citent aucune marque', () => {
  // Les moteurs doivent raisonner sur ce que Home Assistant publie. Une marque
  // citée y serait une dépendance à un catalogue qui vieillit — sauf dans les
  // profils, dont c'est précisément le rôle, et qui la déclarent alors comme
  // une donnée et non comme une condition écrite dans la logique.
  const moteurs = ['devices.js', 'capabilities.js', 'actions.js', 'present.js', 'health.js'];
  const marques = /\b(philips|hue|ikea|tradfri|sonos|xiaomi|aqara|shelly|tuya|netatmo|ecovacs|roborock|unifi|ubiquiti|alexa|samsung)\b/i;
  const fautes = [];
  sources().filter(s => moteurs.indexOf(s.nom) >= 0).forEach(({ nom, texte }) => {
    lignes(sansCommentaires(texte), marques).forEach(l => fautes.push(`${nom} ${l}`));
  });
  assert.deepEqual(fautes, [], 'marques citées :\n  ' + fautes.join('\n  '));
});

test('les moteurs sont indépendants de React et du navigateur', () => {
  // Ils doivent pouvoir tourner dans un test, dans un script, ailleurs. Un
  // import de React ou un accès à `window` les enchaînerait à l'interface.
  const moteurs = ['devices.js', 'capabilities.js', 'actions.js', 'profiles.js',
    'present.js', 'health.js'];
  const fautes = [];
  sources().filter(s => moteurs.indexOf(s.nom) >= 0).forEach(({ nom, texte }) => {
    const code = sansCommentaires(texte);
    if (/from ['"]react['"]/.test(code)) fautes.push(`${nom} importe React`);
    lignes(code, /\b(window|document|localStorage)\./).forEach(l => fautes.push(`${nom} ${l}`));
  });
  assert.deepEqual(fautes, [], 'dépendances à l’interface :\n  ' + fautes.join('\n  '));
});

test('le filet lit src/ en entier, sous-dossiers compris', () => {
  // Lot 15 de l'audit du 03/10. Sans ce compte, une lecture redevenue plate
  // laisserait les tests ci-dessus verts en ne regardant plus les vues.
  const noms = sources().map(s => s.nom);
  for (const n of ['App.jsx', 'views/parametres.jsx', 'views/interrupteurs.jsx', 'langues/en.js']) {
    assert.ok(noms.includes(n), n + ' échappe au filet');
  }
  assert.ok(!noms.includes('demo.js'), 'la maison de démonstration, inventée par construction, est relue');
  const vues = readdirSync(join(SRC, 'views')).filter(f => /\.(js|jsx)$/.test(f));
  assert.equal(noms.filter(n => n.startsWith('views/')).length, vues.length, 'une vue échappe au filet');
});

test('le paquet livre ne traine pas les bundles des compilations passees', () => {
  // Chaque compilation depose des bundles au hash different. La retenue de
  // `pack_frontend.py` ne portait que sur la famille `index-*` ; toutes les
  // autres — boot, meteo, parametres, vacplan, wx3d, Onboarding, en, demo —
  // s'empilaient sans fin. (`dist` est vide a chaque build depuis le 23/09 ;
  // la retenue, elle, vit toujours dans le paquet.)
  //
  // Mesure du 06/09 avant correction : 1 302 fichiers pour 158 Mo, dont 215
  // copies de `meteo-*` et 185 de `boot-*`. Tout cela partait chez chaque
  // utilisateur par HACS, et grossissait le depot a chaque version. Apres : 40
  // fichiers, 4,3 Mo.
  //
  // Rien ne le signalait : le paquet restait valide, l'application marchait, et
  // le poids ne se voit ni au lint ni aux tests.
  const dossier = join(RACINE, 'custom_components', 'loggia', 'frontend', 'assets');
  const fichiers = readdirSync(dossier).filter(f => /\.(js|css)$/.test(f));
  const parFamille = {};
  for (const f of fichiers) {
    const ext = f.slice(f.lastIndexOf('.'));
    const base = f.slice(0, f.lastIndexOf('.'));
    if (!base.includes('-')) continue;
    // La famille inclut l'extension : `retenir()` traite `index-*.js` et
    // `index-*.css` separement, et les melanger fausserait le compte.
    const famille = base.slice(0, base.lastIndexOf('-')) + ext;
    parFamille[famille] = (parFamille[famille] || 0) + 1;
  }
  /* La borne est `GARDE` de pack_frontend.py, lue ici meme : le chiffre est
   * passe de 3 a 2 le 23/09 (plan, point M2) et ce test le suivra sans qu'on y
   * pense. `retenir()` compte les proteges dans le quota, donc une famille ne
   * depasse jamais `GARDE` — le bundle du jour est l'un des deux. */
  const pack = readFileSync(join(RACINE, 'scripts', 'pack_frontend.py'), 'utf8');
  const garde = Number((pack.match(/^GARDE\s*=\s*(\d+)/m) || [])[1]);
  assert.ok(garde >= 1 && garde <= 3, 'GARDE illisible ou hors de propos dans pack_frontend.py');
  const trop = Object.entries(parFamille).filter(([, n]) => n > garde);
  assert.deepEqual(trop, [],
    `des familles de bundles s’accumulent dans le paquet livré (GARDE = ${garde}) : ` +
    trop.map(([f, n]) => `${f} (${n} copies)`).join(', '));
});

test('le paquet livre ne traine pas les bundles d’un module disparu', () => {
  // Le test au-dessus borne les familles VIVANTES. Une famille MORTE lui
  // échappe : elle compte exactement `GARDE` fichiers depuis le jour où Vite a
  // cessé de la produire, et ne redescend jamais en dessous — la retenue garde
  // « les deux derniers » d’un module qui n’existe plus.
  //
  // Mesure du 27/09 avant correction : `aspirateur-*.js`, `meteo-*.js`,
  // `robot-*.js` (devenu `ficherobot-*`) et `boot-*.css` (renommé
  // `index-*.css`) — 7 fichiers, 160 Ko dans CHAQUE installation, cités par
  // aucun fichier du paquet. Pire que du poids : ils importaient eux-mêmes six
  // chunks absents du dossier (`vacplan-DqhCZQ5k.js`, `wx3d-Bu1khYey.js`…),
  // donc 404 garantis pour le client au cache périmé qu’ils prétendaient
  // servir. `pack_frontend.py` les balaie depuis (règle 3) ; ce test dit si le
  // balayage cesse un jour de faire son travail.
  const dossier = join(RACINE, 'custom_components', 'loggia', 'frontend', 'assets');
  const html = join(RACINE, 'custom_components', 'loggia', 'frontend', 'index.html');
  const fichiers = readdirSync(dossier);

  /* Ce que l’index.html du paquet finit par demander, de proche en proche —
   * même parcours que `parcourir()` dans pack_frontend.py.
   *
   * Puis ce que demande la page d’AVANT (audit du 03/10) : son entrée est
   * l’autre `index-*.js` du paquet, celui que la page du jour n’atteint pas.
   * `pack_frontend.py` la protège entière, y compris un module que le build
   * du jour ne produit plus — il n’est pas mort tant qu’elle le réclame. */
  const vus = new Set();
  const fermer = depart => {
    const aVoir = [...depart];
    while (aVoir.length) {
      const f = aVoir.pop();
      if (vus.has(f)) continue;
      vus.add(f);
      const p = join(dossier, f);
      if (!/\.(js|css)$/.test(f) || !existsSync(p)) continue;
      aVoir.push(...[...readFileSync(p, 'utf8')
        .matchAll(/["'/]([A-Za-z0-9._-]+\.(?:js|css|jpg|jpeg|png|webp|svg|woff2?))/g)].map(m => m[1]));
    }
  };
  fermer([...readFileSync(html, 'utf8').matchAll(/assets\/([A-Za-z0-9._-]+)/g)].map(m => m[1]));
  const precedente = fichiers.filter(f => /^index-.+\.js$/.test(f) && !vus.has(f));
  fermer(precedente);

  /* Un fichier hors des deux pages n’est le reste d’un module DISPARU que si
   * AUCUN fichier vu de même extension ne partage son début de nom — c’est le
   * message le plus utile quand le balayage de la règle 3 cesse de marcher.
   *
   * Toutes les coupures du nom sont essayées, pas la seule dernière : un hash
   * Vite peut contenir un tiret. `demo-B6-lYSYp.js` (vivant) et
   * `demo-DpsM1nrN.js` (la génération d’avant) tombent sinon dans deux
   * familles différentes, et la seconde passe pour morte — c’est arrivé. */
  const morts = fichiers.filter(f => {
    if (vus.has(f)) return false;
    const suf = f.endsWith('.js') ? '.js' : f.endsWith('.css') ? '.css' : null;
    if (!suf) return false;
    const base = f.slice(0, -suf.length);
    const coupures = [...base].map((c, i) => (c === '-' ? base.slice(0, i + 1) : null)).filter(Boolean);
    if (!coupures.length) return false;
    return ![...vus].some(v => v.endsWith(suf) && coupures.some(p => v.startsWith(p)));
  });
  assert.deepEqual(morts, [],
    'des bundles d’un module que le build ne produit plus restent dans le paquet livré : ' +
    morts.join(', ') + ' — relancer `python scripts/pack_frontend.py`');

  /* Et l’autre moitié du défaut : un fichier du paquet qui en réclame un
   * absent. C’est ce qui transforme du poids mort en écran cassé. */
  const pendantes = new Set();
  for (const f of fichiers) {
    if (!/\.(js|css)$/.test(f)) continue;
    for (const m of readFileSync(join(dossier, f), 'utf8').matchAll(/\.\/([A-Za-z0-9._-]+\.(?:js|css))/g)) {
      if (m[1] !== f && !existsSync(join(dossier, m[1]))) pendantes.add(`${f} → ${m[1]}`);
    }
  }
  assert.deepEqual([...pendantes], [],
    'des fichiers du paquet livré en réclament d’autres qui n’y sont pas (404 chez l’utilisateur) : ' +
    [...pendantes].join(', '));

  /* Le filet N-1 lui-même (audit du 03/10). Sur les huit derniers passages
   * d’une release à la suivante, sept avaient fait perdre à la page d’avant
   * 10 à 17 de ses 28 fichiers, dont son `boot` et son entrée : la retenue
   * tirait au sort entre générations à dates égales, et la règle 4 rasait le
   * reste. Le paquet porte donc la page d’avant, ENTIÈRE (les renvois
   * ci-dessus), et rien que les deux pages : ce qu’aucune n’atteint ne sert
   * personne. */
  assert.equal(precedente.length, 1,
    'le paquet livré devrait porter UNE page d’avant (une seconde entrée index-*.js), il en porte ' +
    precedente.length + ' — relancer `python scripts/pack_frontend.py` dans un clone qui a les tags (`git fetch --tags`)');
  const orphelins = fichiers.filter(f => !vus.has(f));
  assert.deepEqual(orphelins, [],
    'des fichiers du paquet livré ne sont atteints ni par la page du jour ni par celle d’avant : ' + orphelins.join(', '));

  /* Et le mécanisme qui le tient, pas seulement le résultat du jour.
   *
   * La règle 2 garde les `GARDE` dernières générations DE CHAQUE FAMILLE, en
   * supposant qu'elles tournent ensemble. Elles ne le font pas : un `wx3d-*`
   * inchangé garde son empreinte pendant que `boot-*`, qui embarque l'écran,
   * en change à chaque compilation. Au bout de quelques versions, le `boot`
   * gardé réclame un `wx3d` que la rotation a emporté — 36 renvois morts dans
   * le paquet de la v3.76.0 publiée, que ce test a trouvés le 27/09.
   *
   * Une génération N-1 trouée ne sert personne : elle donne des 404 au client
   * au cache périmé qu'elle prétend servir. */
  const pack4 = readFileSync(join(RACINE, 'scripts', 'pack_frontend.py'), 'utf8');
  assert.ok(pack4.includes('def renvois_morts(dossier, proteges):'),
    'la règle 4 a disparu de pack_frontend.py : les renvois morts reviendront à la prochaine rotation');
  assert.match(pack4.slice(pack4.indexOf('def renvois_morts')), /while True:/,
    'la règle 4 ne boucle plus jusqu’au point fixe : retirer un fichier peut en condamner un autre');
  assert.ok(pack4.includes('troues = renvois_morts(assets_dst, gardes)'),
    'la règle 4 n’est plus appelée, ou plus avec les deux pages protégées');
  /* La page N-1 est NOMMÉE (audit du 03/10), et ce qu’elle atteint est
   * protégé de toutes les règles : sans cela, la 2 la tire au sort à dates
   * égales et la 4 rase ce que le sort a troué. */
  assert.ok(pack4.includes('origine, precedents = generation_precedente('),
    'la page N-1 n’est plus cherchée : le filet de l’ADR 0072 redevient un tirage au sort');
  assert.ok(pack4.indexOf('troues = renvois_morts') > pack4.indexOf('efface += retenir('),
    'la règle 4 doit passer APRÈS la rétention, qui vient peut-être de retirer ce qu’une génération gardée réclamait');
});

test('la documentation ne promet pas de garde-fou inexistant', () => {
  // Le README annoncait publiquement une route `/api/loggia/call` protegee par
  // une « liste blanche fermee par defaut », et nommait les domaines refuses.
  // Cette route n'a jamais existe dans le code. `info.md` — le texte que HACS
  // affiche dans son magasin — reprenait la meme promesse.
  //
  // Une barriere de securite qu'on croit avoir est pire que pas de barriere :
  // un administrateur qui ouvre des comptes a sa famille en s'y fiant n'est
  // protege par rien.
  const readme = readFileSync(join(RACINE, 'README.md'), 'utf8');
  const info = readFileSync(join(RACINE, 'info.md'), 'utf8');
  const init = readFileSync(join(RACINE, 'custom_components', 'loggia', '__init__.py'), 'utf8');
  const py = readdirSync(join(RACINE, 'custom_components', 'loggia'))
    .filter(f => f.endsWith('.py'))
    .map(f => readFileSync(join(RACINE, 'custom_components', 'loggia', f), 'utf8')).join('\n');

  // On cherche la DECLARATION de la route, pas la chaine : le texte qui
  // corrige le mensonge cite forcement le chemin, et suffisait a neutraliser
  // ce garde-fou.
  const routeExiste = /url\s*=\s*["'][^"']*loggia\/call/.test(py);
  for (const [nom, texte] of [['README.md', readme], ['info.md', info], ['__init__.py', init]]) {
    const promet = /liste blanche|allow-list/i.test(texte) && !/n'a jamais existe|jamais existé/i.test(texte);
    assert.ok(!promet || routeExiste,
      `${nom} annonce une liste blanche d’appels de service que le code n’implémente pas`);
  }
});

test('une URL venue d’une entité ne devient pas un lien sans contrôle', () => {
  // `release_url` vient de l'intégration qui publie l'entité `update.*`, pas de
  // Loggia. React ne filtre pas le schéma d'un href : `javascript:...` s'y
  // exécuterait, dans l'origine du dashboard — le panneau n'est pas en iframe
  // isolée — avec l'objet `hass` authentifié sous la main.
  const src = readFileSync(join(RACINE, 'src', 'views', 'parametres.jsx'), 'utf8');
  const m = src.match(/function lienSur\(url\)[\s\S]*?\n\}/);
  assert.ok(m, 'le filtre d’URL a disparu');
  const lienSur = new Function('url', m[0].replace(/^function lienSur\(url\)\s*\{/, '').replace(/\}$/, ''));

  for (const mauvais of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'vbscript:x', '', null]) {
    assert.equal(lienSur(mauvais), null, `« ${mauvais} » passe encore en href`);
  }
  assert.equal(lienSur('https://github.com/x'), 'https://github.com/x', 'une URL légitime est rejetée');
  assert.equal(lienSur('  http://a.b  '), 'http://a.b', 'les espaces autour ne sont plus retirés');

  // Et la valeur doit passer par le filtre à la SOURCE, pas au rendu : une
  // seule ligne à garder juste plutôt qu'un href à ne pas oublier.
  assert.match(src, /notes: lienSur\(at\.release_url\)/,
    'l’URL de notes n’est plus filtrée là où elle entre');
});

test('aucun test ne prétend vérifier quelque chose sans rien vérifier', () => {
  // Audit du 27/09. Quatre tests portaient un nom — « les mots ont leur
  // traduction », « les mots de la liste existent en anglais » — et un corps
  // qui lisait un fichier sans jamais rien en conclure. Ils passaient TOUJOURS,
  // et comptaient dans le total.
  //
  // Un test vert qui ne vérifie rien est pire qu'un test absent : il donne
  // l'impression que la question est gardée.
  //
  // Les aides qui assertent pour le compte d'un test sont nommées ici. Une
  // nouvelle aide fera échouer ce test, qui la réclamera — c'est voulu.
  const AIDES = /assert|\bok\(|\bko\(|expect\(|\.throws|\.rejects/;
  const muets = [];
  let total = 0;
  for (const f of readdirSync(join(RACINE, 'tests')).filter(n => n.endsWith('.test.mjs'))) {
    const s = readFileSync(join(RACINE, 'tests', f), 'utf8');
    const depart = [...s.matchAll(/\btest\(\s*(['"`])([^'"`]*)\1\s*,/g)].map(m => ({ nom: m[2], i: m.index }));
    total += depart.length;
    depart.forEach((t, k) => {
      const fin = k + 1 < depart.length ? depart[k + 1].i : s.length;
      if (!AIDES.test(s.slice(t.i, fin))) muets.push(f + ' :: ' + t.nom);
    });
  }
  assert.ok(total > 900, 'le repérage des tests ne trouve plus rien : le motif a dû changer');
  assert.deepEqual(muets, [], 'des tests ne vérifient rien : ' + muets.join(', '));
});

test('ce qui a été retiré ne revient pas', () => {
  // Audit du 27/09, point 8.
  const pkg = JSON.parse(readFileSync(join(RACINE, 'package.json'), 'utf8'));
  // `@bybas/weather-icons` était une dépendance de PRODUCTION qu'aucun fichier
  // n'importait : ses dix-sept dessins ont été recopiés dans `src/assets/wx/`
  // (voir `wxutil.jsx`). HACS la téléchargeait pour rien.
  assert.ok(!Object.keys(pkg.dependencies || {}).includes('@bybas/weather-icons'),
    'la dépendance des icônes météo est revenue : rien ne l’importe');
  // Mais l'ATTRIBUTION reste due : les dessins sont toujours là, sous licence
  // MIT. Retirer le crédit avec le paquet aurait été une faute.
  assert.match(readFileSync(join(RACINE, 'site', 'legal', 'mentions-legales.html'), 'utf8'), /@bybas\/weather-icons/,
    'le crédit des icônes météo a disparu des mentions légales, alors que les dessins sont toujours livrés');
  assert.ok(readdirSync(join(RACINE, 'src', 'assets', 'wx')).length >= 17, 'les dessins météo ont disparu');
  const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
  // `stag` rendait `undefined`, et son commentaire prétendait la garder « pour
  // les ~200 appels existants ». Il en restait UN.
  assert.ok(!/const stag = \(\) => undefined;/.test(app), '`stag` est revenue : elle ne rend rien');
  assert.ok(!/\.\.\.stag\(/.test(app), 'un étalement de `stag` est revenu : il étale `undefined`');
  // La durée de cycle du lave-vaisselle était ÉCRITE EN DUR, et la barre de
  // progression comme le « ~X min restant » en découlaient — faux dès que le
  // cycle ne fait pas cette durée. Choix de l'utilisateur : les deux partent,
  // le mesuré reste (phase, durée écoulée, watts).
  assert.ok(!/totalMin = 80/.test(app), 'la durée de cycle inventée du lave-vaisselle est revenue');
  const i = app.indexOf("machines.lv = {");
  assert.notEqual(i, -1, 'la carte du lave-vaisselle a disparu');
  assert.match(app.slice(i, i + 420), /bar: null/, 'la barre de progression du lave-vaisselle est revenue');
  assert.match(app.slice(i, i + 420), /extra: active \? \(Math\.round\(power\) \+ 'W'\) : null/,
    'le « ~X min restant » est revenu : il se calculait sur une durée inventée');
});
