/* L'icone d'une carte, choisie a la main (26/09).
 *
 * « La possibilite de modifier les icones sans que ca change de categorie, et
 * ce peu importe le type de carte : je veux pouvoir, si je le desire, modifier
 * l'icone par defaut. »
 *
 * Le piege est la : jusqu'ici, changer l'allure d'une prise passait par la
 * declarer « lumiere » — ce qui change AUSSI sa carte, sa famille et son
 * filtre. Un choix d'icone ne doit rien faire de tout cela. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(join(RACINE, 'src', 'App.jsx'), 'utf8');
const etat = readFileSync(join(RACINE, 'src', 'state.js'), 'utf8');

test('le choix se range dans la maison, et voyage avec elle', () => {
  assert.match(etat, /export const iconesCfg = \(\) => \{ const v = cfgVal\('loggia_icones', null\);/, 'la lecture de loggia_icones');
  assert.ok(etat.includes("(v && typeof v === 'object' && !Array.isArray(v)) ? v : {}"), 'une valeur abimee rend un objet vide, jamais une liste');
  assert.ok(etat.includes("'loggia_camdispo', 'loggia_icones',"), 'loggia_icones manque a LOGGIA_SYNC_KEYS : le choix ne suivrait pas la maison');
});

test('poser une icone, et la rendre', () => {
  const f = app.slice(app.indexOf('function declarerIcone('), app.indexOf('\n}', app.indexOf('function declarerIcone(')));
  assert.ok(f.includes("if (glyphe) m[id] = glyphe; else delete m[id];"), 'sans glyphe, l’entree s’efface — on revient au defaut');
  /* Une icone choisie est une CHAINE, et rien d'autre. Le style « Plein » du
   * 29/09 en faisait un objet `{ n, s }` ; il a ete retire le 30/09 — « tu as
   * laisse le bouton, enleve-le ». On n'ecrit donc plus que la chaine, mais on
   * relit encore l'objet : une installation en a peut-etre enregistre. */
  const lu = app.slice(app.indexOf('function iconeChoisie('), app.indexOf('\n}', app.indexOf('function iconeChoisie(')));
  assert.ok(lu.includes("if (typeof v === 'string' && v) return v;"), 'une icone deja choisie ne se relit plus');
  assert.ok(lu.includes("typeof v.n === 'string'"), 'le nouveau format ne se relit pas');
  assert.ok(f.includes('cfgSet({ loggia_icones: Object.keys(m).length ? m : null })'), 'une table vide s’efface, elle ne se garde pas');
  const l = app.slice(app.indexOf('function iconeChoisie('), app.indexOf('\n}', app.indexOf('function iconeChoisie(')));
  assert.ok(lu.includes("return (v && typeof v === 'object' && typeof v.n === 'string' && v.n) ? v.n : null;"), 'rien n’est devine ici : une valeur absente ou abimee rend null');
});

test('le choix passe devant la devinette, sur TOUTES les cartes', () => {
  // Le resolveur commun : tuile, compacte, fiche, chip passent par lui.
  const r = app.slice(app.indexOf('function cvIcoEntite('), app.indexOf('\n}', app.indexOf('function cvIcoEntite(')));
  assert.ok(r.indexOf('const mienne = iconeChoisie(id);') < r.indexOf("if (dom === 'light')"), 'le choix se lit AVANT toute deduction');
  assert.ok(r.includes('if (mienne) return mienne;'), 'le choix ne rend pas la main');
  // Les deux endroits qui court-circuitaient le resolveur.
  assert.ok(app.includes("const ico = dom === 'switch' ? (iconeChoisie(id) || (cvEstLumiere(id) ? 'bulb' : null))"), 'une prise gardait son dessin de prise malgre le choix');
  assert.ok(app.includes("const ico = iconeChoisie(id) || (dom === 'camera' ? 'camera' : carteDePrise ? tp.ico : cvIcoEntite(dom, id, st, nom));"),
    'la carte d’objet court-circuitait le choix — camera, ou glyphe de l’appareil au bout de la prise');
});

test('la grille suit la catégorie de la carte', () => {
  /* « Je ne retrouve pas mon catalogue éclairage. Pour chaque catégorie, il
   * faudrait filtrer et mettre en avant d'abord les icônes liées à sa
   * catégorie, puis passer aux autres » (27/09). Une grille de deux cent
   * cinquante icônes où la bonne est en page six ne sert à rien. */
  const bloc = app.match(/const GROUPES_ICONES = \{([\s\S]*?)\n\};/);
  assert.ok(bloc, 'GROUPES_ICONES introuvable');
  const dessins = readFileSync(join(RACINE, 'src', 'dessins.js'), 'utf8');
  const groupesDessin = new Set([...dessins.slice(dessins.indexOf('DESSINS_CAT'), dessins.indexOf('FONTE_CAT')).matchAll(/^  ([a-z]+): \[/gm)].map(m => m[1]));
  const groupesFonte = new Set([...dessins.slice(dessins.indexOf('FONTE_CAT')).matchAll(/^  ([a-z]+): \[/gm)].map(m => m[1]));

  // Ce que l'utilisateur a demandé, domaine par domaine.
  const attendu = { lumiere: 'eclairage', volet: 'ouvrants', chauffage: 'climat', prise: 'electro', multimedia: 'multimedia', capteur: 'securite', aspirateur: 'iot' };
  for (const [dom, cat] of Object.entries(attendu)) {
    const m = bloc[1].match(new RegExp('\\n  ' + dom + ': \\{ dessins: \\[([^\\]]*)\\]'));
    assert.ok(m, dom + ' : aucun groupe d’icônes');
    assert.ok(m[1].indexOf("'" + cat + "'") === 0, dom + ' ne propose plus ' + cat + ' en premier');
  }
  // Chaque groupe cité existe vraiment.
  for (const m of bloc[1].matchAll(/dessins: \[([^\]]*)\], fonte: \[([^\]]*)\]/g)) {
    for (const g of [...m[1].matchAll(/'([a-z]+)'/g)].map(x => x[1])) assert.ok(groupesDessin.has(g), 'groupe dessiné inconnu : ' + g);
    for (const g of [...m[2].matchAll(/'([a-z]+)'/g)].map(x => x[1])) assert.ok(groupesFonte.has(g), 'groupe de police inconnu : ' + g);
  }
  /* Les SUGGÉRÉES ne montrent QUE les familles du domaine (29/09). Tant que la
   * grille était l'unique entrée, il fallait bien faire suivre le reste
   * derrière ; depuis qu'une bande de familles et une recherche existent, ce
   * reste ne fait plus que noyer les vingt icônes qu'on est venu chercher. */
  const f = app.slice(app.indexOf('function iconesSuggerees('), app.indexOf('\n}', app.indexOf('function iconesSuggerees(')));
  assert.ok(f.includes('g.dessins.forEach(c => pousser(DESSINS_CAT[c]));') && f.includes('g.fonte.forEach(c => pousser(FONTE_CAT[c]));'), 'les suggérées ne suivent plus le domaine');
  assert.ok(!f.includes('Object.values(DESSINS_CAT)'), 'les suggérées font encore suivre toute la bibliothèque');
  assert.ok(f.includes('if (!vues.has(n))'), 'une icône peut désormais figurer deux fois');
  // Rien ne se perd : la bibliothèque entière reste là, sous « Tout ».
  assert.ok(app.includes("if (cle === 'tout') return toutesLesIcones();"), 'la bibliothèque entière n’est plus joignable');
  const t = app.slice(app.indexOf('function toutesLesIcones('), app.indexOf('\n}', app.indexOf('function toutesLesIcones(')));
  assert.ok(t.includes('Object.values(DESSINS_CAT).forEach(pousser);') && t.includes('Object.values(FONTE_CAT).forEach(pousser);'), '« Tout » ne montre plus tout');
  // Et la grille se refait quand une prise se déclare lumière.
  /* Une ZONE — un radiateur en fil pilote — n'a pas d'`entity_id` : sa carte
   * porte une clé `zone:…`. Elle avait donc perdu la section entière, qui
   * vivait sous la condition du domaine : « les radiateurs, impossible de
   * changer l'icône, je n'ai pas l'option » (27/09). Elle part du chauffage. */
  assert.ok(app.includes("const domIcone = estZone ? 'chauffage' : domaineChoisi;"), 'la grille ne suit plus le domaine choisi');
  assert.ok(app.includes('const listeSuggerees = useMemo(() => iconesSuggerees(domIcone), [domIcone]);')
    && app.includes('<ChoixIcone valeur={monIcone} onChoisir={choisirIcone} suggerees={listeSuggerees}'), '« Suggérées » ne suit plus la carte');
  assert.ok(app.includes("const estZone = brut.indexOf('zone:') === 0;") && app.includes('const peutChoisirIcone = estEntite || estZone;'), 'une carte de zone ne peut plus choisir son icône');
  assert.ok(app.includes('{peutChoisirIcone && ('), 'la section ICÔNE est repassée sous la condition des seules entités');
  assert.ok(app.includes("<GlypheCarte id={'zone:' + zone.id} size={17}>"), 'la carte du fil pilote ignore l’icône choisie');
  /* Vingt-cinq points ne se visent pas. On avait d'abord remplacé les points
   * par un compte au-delà de huit pages ; le 29/09, la pagination de cette
   * fiche disparaît tout court — voir « la fiche cherche, range par famille ».
   * Reste un compte, mais d'icônes, pas de pages. */
  assert.ok(app.includes("trN(liste.length, '{n} icône', '{n} icônes')"), 'la grille ne dit plus combien elle montre');

  // L'électroménager reste dessiné, et chaque nom cité a bien son tracé.
  for (const n of ['washer', 'dryer', 'dishwasher', 'fridge', 'oven', 'microwave']) {
    assert.ok(dessins.includes("\n  '" + n + "':"), n + ' : nommé, mais jamais dessiné');
  }
  // La grille rend `Ico` : elle seule connaît les trois sources. Et le dessin
  // s'anime sous le curseur, au focus, ou une fois choisi.
  assert.ok(app.includes('<Ico name={ic} size={20} anime={on || apercu === ic} />'), 'la grille ne dessine plus les icônes maison, ou n’en montre plus le mouvement');
  assert.ok(app.includes('onMouseEnter={() => setApercu(ic)} onMouseLeave={() => setApercu(null)}'), 'l’aperçu au survol a disparu');
  // Toucher l'icône allumée la rend au défaut — et la choisir la note parmi
  // les dernières, ce qui fait de `choisirIcone` un passage obligé (29/09).
  assert.ok(app.includes('const choisirIcone = (ic) => setMonIcone(ic === monIcone ? null : ic);'), 'on ne peut plus revenir au defaut d’un second appui');
  /* Les dernières choisies sont notées par le sélecteur lui-même : les trois
   * fiches en profitent sans avoir à y penser. */
  assert.ok(app.includes('const poser = (ic) => { onChoisir(ic); if (ic) setRecentes(noterIconeRecente(ic)); };'), 'un choix ne rejoint plus les dernières');
  assert.ok(app.includes("background: on ? 'var(--o-accent-fond)' : 'var(--o-s1)', color: on ? '#fff' : 'var(--o-text1)' }}>"), 'la puce choisie n’est plus en bleu plein');
  assert.ok(app.includes('if (peutChoisirIcone && monIcone !== iconeChoisie(brut)) { declarerIcone(brut, monIcone);'), 'la fiche n’enregistre plus le choix');
});

test('toutes les familles de cartes demandent l’icône choisie', () => {
  /* « Si j'en choisis un, ça ne le change pas, l'ancien reste » (27/09).
   *
   * Chaque famille dessinait SON glyphe — une ampoule pour la lumière, un
   * volet pour le volet, une flamme pour le climat — sans jamais demander si
   * l'utilisateur en avait choisi un autre. Le choix se rangeait bien, et ne
   * se voyait nulle part. */
  const g = app.slice(app.indexOf('const GlypheCarte = '), app.indexOf('\n};', app.indexOf('const GlypheCarte = ')));
  assert.ok(g.includes('const mien = iconeChoisie(id);'), 'le glyphe commun ne lit plus le choix');
  assert.ok(g.includes('return mien ? <Ico name={mien} size={size} anime={anime} /> : children;'), 'le dessin d’origine n’est plus un simple défaut');
  // Les cinq familles qui dessinaient le leur.
  for (const [quoi, bout] of [
    ['la lumière', '<GlypheCarte id={id} size={19}><LightIcon'],
    ['l’aspirateur et la tondeuse', "<GlypheCarte id={id} size={17}><Ico name={dom === 'vacuum'"],
    ['le climat', "<GlypheCarte id={id} size={17}><Fi i={heating ?"],
    ['le volet', "<GlypheCarte id={id} size={18}><Ico name={(a.device_class === 'garage'"],
    ['le média', "<GlypheCarte id={id} size={17}><Fi i={a.device_class === 'tv'"],
  ]) assert.ok(app.includes(bout), quoi + ' : la carte ignore de nouveau l’icône choisie');
  // Et l'écran se redessine : le choix ne passe par aucun état de React.
  assert.ok(app.includes('{ declarerIcone(brut, monIcone); if (ed.rafraichir) ed.rafraichir(); }'), 'le choix reste invisible jusqu’au rechargement');
});

test('un dessin ne bouge que là où quelque chose travaille', () => {
  const ico = readFileSync(join(RACINE, 'src', 'icones.jsx'), 'utf8');
  assert.ok(ico.includes("className={anime ? undefined : 'o-ico-fige'}"), 'un dessin s’anime désormais partout, y compris dans la grille de choix');
  assert.ok(ico.includes('anime = false'), 'le défaut n’est plus le repos');
  // Le trace est AGRANDI dans sa boite : un appareil du catalogue tient dans
  // 16 a 19 unites sur 24, la ou un glyphe de la fonte remplit son cadratin.
  assert.ok(ico.includes('const ECHELLE_DESSIN = 1.18;'), 'les dessins reviennent a la taille ou ils paraissaient trop petits');
  assert.ok(ico.includes("OUVRE_GRANDI + DESSINS[name] + '</g>'"), 'le tracé n’est plus agrandi dans sa boîte');
  assert.ok(app.includes('<Ico name={ico} size={17} anime={priseVive} />'), 'la carte de prise n’anime plus son appareil quand il travaille');
  const css = readFileSync(join(RACINE, 'src', 'index.css'), 'utf8');
  assert.ok(css.includes('.o-ico-fige svg *, .o-ico-fige * { animation: none !important; }'), 'la règle qui fige un dessin a disparu');
  assert.ok(css.includes('[style*="animation:o-ic-"] { animation: none !important; }'), 'les dessins ignorent prefers-reduced-motion');
});

test('les deux phrases de la section ont leur traduction', () => {
  const en = readFileSync(join(RACINE, 'src', 'langues', 'en.js'), 'utf8');
  for (const k of ['Seul le dessin change : la famille, le filtre et la carte restent les mêmes.', 'Aucune icône choisie : Loggia garde celle qu’il devine.']) {
    assert.ok(en.includes("  '" + k + "':"), k + ' manque dans en.js');
  }
});

test('les cartes d’Énergie et de Sécurité aussi', () => {
  /* « Le changement d’icône ne se fait pas partout : dans Énergie il y a des
   * cartes où je le change mais rien, dans Sécurité pareil » (28/09).
   *
   * La fiche PROPOSE la grille dès que la carte porte un `entity_id` — un
   * poste de consommation (`dev:sensor.…`), l’alarme, la sirène. Le choix se
   * rangeait bien, et ces trois-là continuaient à dessiner le leur. */
  for (const [quoi, bout] of [
    ['le poste de consommation', '<GlypheCarte id={d.power} size={15}><Fi i={d.icon}'],
    ['l’alarme', '<GlypheCarte id={id} size={15}><Fi i="shield-check"'],
    ['la sirène', '<GlypheCarte id={id} size={16}><Fi i="bell-ring"'],
  ]) assert.ok(app.includes(bout), quoi + ' : la carte dessine le sien sans demander l’icône choisie');
  /* Un dessin maison prend la couleur du parent (`currentColor`) : la pastille
   * du poste ne donnait que son fond, le tracé serait sorti noir. */
  assert.ok(app.includes("background: hx(d.c, 0.14), display: 'flex', alignItems: 'center', justifyContent: 'center', color: d.c }}>"),
    'la pastille du poste ne donne plus sa couleur au dessin choisi');
});

test('la fiche cherche, range par famille, et se souvient des dernières', () => {
  /* Maquette du 29/09. La grille tenait en pages de dix : deux cents icônes
   * faisaient vingt pages, et l'on feuilletait au lieu de chercher. Trois
   * entrées la remplacent — une recherche, une bande de familles, les
   * dernières choisies — et la pagination s'en va de cette fiche (les pièces
   * et les scénarios, eux, gardent leur trentaine et leurs points). */
  /* Le selecteur est un composant partage depuis le 29/09 : la fiche d'une
   * entite, celle d'une piece et celle d'un scenario le posent toutes les
   * trois — « sauf par l'accueil, c'est toujours l'ancien systeme ». */
  const f = app.slice(app.indexOf('function ChoixIcone('), app.indexOf('\nfunction ', app.indexOf('function ChoixIcone(') + 10));
  assert.ok(!app.includes('ICONES_PAR_PAGE'), 'une grille d’icônes pagine encore');
  assert.ok(f.includes("tr('Rechercher : lave, lampe, volet…')"), 'pas de champ de recherche');
  assert.ok(f.includes("tr('Familles précédentes')") && f.includes("tr('Familles suivantes')"), 'la bande des familles n’a pas ses deux flèches');
  assert.ok(f.includes("gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))'"), 'la grille ne remplit plus la largeur qu’elle a');
  assert.ok(f.includes('maxHeight: 244, overflowY: \'auto\''), 'la grille ne défile plus chez elle : elle pousse la fiche hors de l’écran');
  for (const [quoi, bout] of [
    ['une pièce', '<ChoixIcone valeur={icone} onChoisir={setIcone} suggerees={ICONES_PIECE}'],
    ['un scénario', '<ChoixIcone valeur={s.icone} onChoisir={(ic) => maj({ icone: ic })} suggerees={ICONES_SCENARIO} />'],
  ]) assert.ok(app.includes(bout), 'la fiche d’' + quoi + ' garde l’ancienne grille');

  /* La recherche cherche dans TOUTE la bibliothèque, et passe devant la
   * famille ouverte : on tape « lave » sans se demander sous quel onglet le
   * lave-vaisselle a été rangé. */
  assert.ok(f.includes('if (cherche) return chercherIcones(q);'), 'la recherche ne passe pas devant la famille');
  const c = app.slice(app.indexOf('function chercherIcones('), app.indexOf('\n}', app.indexOf('function chercherIcones(')));
  assert.ok(c.includes('sansAccents(nomIcone(c))') && c.includes('sansAccents(legendeIcone(c))'),
    'la recherche ignore le nom du dessin : « lave » ne trouverait pas `dishwasher`');

  /* Les dernières choisies vivent dans le NAVIGATEUR : c'est la commodité de
   * celui qui règle, pas un réglage de la maison — elles n'ont donc rien à
   * faire dans la configuration partagée. */
  assert.ok(app.includes("const CLE_RECENTES = 'loggia_icorecents';"), 'les dernières choisies n’ont pas de rangement');
  assert.ok(!readFileSync(join(RACINE, 'src', 'state.js'), 'utf8').includes('loggia_icorecents'),
    'les dernières choisies sont passées dans la configuration de la maison');
  const r = app.slice(app.indexOf('function noterIconeRecente('), app.indexOf('\n}', app.indexOf('function noterIconeRecente(')));
  assert.ok(r.includes('.slice(0, 12)') && r.includes('try {'), 'la liste n’est pas bornée, ou un navigateur sans stockage casserait la fiche');
});

test('l’aperçu de la fiche montre le dessin en mouvement, et ne commande rien', () => {
  /* Un appareil dessiné porte son mouvement, mais la grille le fige : sans
   * aperçu, on choisit une icône sans jamais voir ce qu'elle fait. La bascule
   * n'allume que l'aperçu — elle ne touche pas à la maison. */
  const f = app.slice(app.indexOf('function CardEditSheet('), app.indexOf('\nfunction ', app.indexOf('function CardEditSheet(') + 10));
  assert.ok(f.includes("tr('L’aperçu ne commande rien : il montre le dessin en mouvement.')"), 'l’aperçu ne dit pas qu’il ne commande rien');
  assert.ok(f.includes('<Ico name={icoApercu} size={24} anime={apercuAllume} />'), 'l’aperçu ne s’anime pas');
  assert.ok(f.includes('const icoApercu = monIcone || (domActuel && domActuel.ico) || null;'), 'sans icône choisie, l’aperçu ne retombe pas sur celle du domaine');
  assert.ok(!f.includes('onToggle={() => setApercuAllume') || !f.includes('hass.callService'), 'l’aperçu commande la maison');
});
