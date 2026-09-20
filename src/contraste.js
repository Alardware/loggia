/* La garde de contraste des thèmes (audit du 19/09, ADR 0060).
 *
 * Chaque thème apporte ses couleurs : un gris « muted », un accent, des teintes
 * d'état. Beaucoup viennent d'une palette pensée ailleurs — un éditeur de code,
 * iOS, Material — et ne tiennent pas le contraste sur les cartes de Loggia :
 * un gris secondaire à 3,4:1, un texte blanc sur un accent turquoise à 2,4:1.
 *
 * La garde relit les couleurs RÉELLES une fois le thème posé — les surfaces
 * composées sur le fond — et ne retouche que celles qui manquent leur seuil,
 * du plus petit pas qui suffit, en gardant leur teinte : seule la luminosité
 * bouge. Un thème qui tient déjà ses seuils n'est pas touché.
 *
 * Module pur : ni DOM ni React — `applyLook` (App.jsx) lit les jetons et pose
 * ce qu'elle rend. */

/** « #rgb », « #rrggbb(aa) », « rgb() », « rgba() », « color(srgb …) » → [r, g, b, a], ou null. */
export function lireCouleur(s) {
  const t = String(s || '').trim();
  let m = t.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map(x => x + x).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return [n[0], n[1], n[2], h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = t.match(/^rgba?\(([^)]*)\)$/i);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    if (p.length < 3) return null;
    const v = p.slice(0, 3).map(x => (x.endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x)));
    const a = p.length > 3 ? (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    return v.some(isNaN) || isNaN(a) ? null : [v[0], v[1], v[2], a];
  }
  m = t.match(/^color\(srgb\s+([^)]*)\)$/i);
  if (m) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.some(isNaN)) return null;
    return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
  }
  return null;
}

/** Toutes les couleurs d'une valeur composée (un dégradé, par exemple). */
export function couleursDe(s) {
  const out = [];
  const re = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|color\(srgb[^)]*\)/gi;
  let m;
  while ((m = re.exec(String(s || '')))) { const c = lireCouleur(m[0]); if (c) out.push(c); }
  return out;
}

const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
/** Luminance relative (WCAG 2). */
export const luminance = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
/** Rapport de contraste WCAG entre deux couleurs opaques. */
export function contraste(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Une couleur (avec son alpha) posée sur une autre, opaque. */
export function composer(dessous, dessus) {
  const a = dessus.length > 3 ? Math.max(0, Math.min(1, dessus[3])) : 1;
  return [0, 1, 2].map(i => dessous[i] * (1 - a) + dessus[i] * a);
}
export const versHex = (c) => '#' + [0, 1, 2].map(i => Math.round(Math.max(0, Math.min(255, c[i]))).toString(16).padStart(2, '0')).join('');
export const versRgb = (c) => [0, 1, 2].map(i => Math.round(Math.max(0, Math.min(255, c[i])))).join(',');

function versHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function depuisHsl([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/**
 * La couleur la plus proche de `c`, de même teinte, qui tient `cible` contre
 * chacun des `fonds` : on éclaircit (`sens` > 0) ou on assombrit (`sens` < 0)
 * par petits pas. `c` telle quelle si elle tient déjà.
 */
export function ajuster(c, fonds, cible, sens) {
  return ajusterTous(c, [[fonds, cible]], sens);
}

/**
 * Plusieurs exigences à la fois : `[[fonds, cible], …]`. Utile parce qu'un gris
 * doit tenir un seuil confortable sur une carte unie ET le seuil WCAG sur une
 * carte teintée — le lavis d'un scénario, la couleur d'une pièce.
 * `sur` (facultatif) recalcule des fonds à partir de la couleur en cours : une
 * teinte écrit souvent sur son PROPRE lavis.
 */
export function ajusterTous(c, contraintes, sens, sur = null) {
  const tient = (x) => contraintes.every(([fonds, cible]) => fonds.every(f => contraste(x, f) >= cible))
    && (!sur || sur.fonds(x).every(f => contraste(x, f) >= sur.cible));
  if (tient(c)) return c;
  const [h, s, l] = versHsl(c);
  for (let k = 1; k <= 60; k++) {
    const l2 = sens > 0 ? l + (1 - l) * k / 60 : l * (1 - k / 60);
    const x = depuisHsl([h, s, l2]);
    if (tient(x)) return x;
  }
  return sens > 0 ? [255, 255, 255] : [0, 0, 0];
}

/* Les seuils. Le texte secondaire vise au-dessus de 4,5:1 : il est aussi
 * posé sur des cartes teintées (le lavis d'un scénario, la couleur d'une
 * pièce), qui lui retirent un peu de contraste. */
export const SEUILS = { texte: 7, text2: 5.4, text3: 5.0, teinte: 4.6, wcag: 4.5, surLavis: 4.5, surLavisVif: 4.2, text2Lavis: 4.85, accent: 3, surAccent: 4.7, surIcone: 3.4, carte: 1.13, puits: 1.08 };
/* Le lavis d'une carte teintée : un scénario, une pièce, un état. C'est la
 * valeur que les cartes posent (`lav(.22)`), réglage « Douce ». */
export const LAVIS = 0.2;
/* Les teintes qui servent aussi de TEXTE : ajustées vers la lisibilité. */
export const TEINTES = ['--o-accent-soft', '--o-ok', '--o-warn', '--o-warn2', '--o-bad', '--o-cold', '--o-cyan', '--o-purple', '--o-gold',
  '--o-lampe', '--o-orange', '--o-rose', '--o-piece-ambre', '--o-piece-tendre', '--o-piece-chambre', '--o-piece-bain', '--o-piece-vert'];
/* Leur compagnon « r,g,b », qui sert aux lavis et aux icônes. */
const AVEC_RGB = new Set(['--o-accent-soft', '--o-ok', '--o-warn', '--o-warn2', '--o-bad', '--o-cold', '--o-cyan', '--o-purple', '--o-gold',
  '--o-lampe', '--o-orange', '--o-rose', '--o-piece-ambre', '--o-piece-tendre', '--o-piece-chambre', '--o-piece-bain', '--o-piece-vert']);
/* Deux teintes gardent l'ancien seuil sur leur propre lavis (4,2:1) : le rouge
 * d'alerte et le rose des médias. Les tenir à 4,5 les délavait (#ef4444 →
 * #f37373) — or le rouge DIT « action nécessaire », et il ne le dit jamais
 * seul : une icône et un mot l'accompagnent toujours. */
const VIFS = new Set(['--o-bad', '--o-rose']);
/** Tous les jetons que la garde peut poser — à purger au changement de thème. */
export const JETONS_GARDE = ['--o-text', '--o-text2', '--o-text3', '--o-text3-rgb', '--o-text2-lavis', '--o-text3-lavis', '--o-text3-lavis-rgb', '--o-accent', '--o-accent-rgb', '--o-accent-fond',
  '--o-rose-fond', '--o-purple-fond', '--o-surfA', '--o-surfB', '--o-well', '--o-well0',
  ...TEINTES, ...TEINTES.filter(t => AVEC_RGB.has(t)).map(t => t + '-rgb')];

/**
 * La couleur d'un APPAREIL (l'ampoule allumée, sa teinte réelle) rendue
 * lisible sur le lavis qu'elle pose elle-même : une ampoule ambrée sur un
 * thème clair devenait invisible sur sa propre carte. La carte garde la
 * couleur vraie ; l'icône et la jauge prennent celle-ci.
 */
export function lisibleSurLavis(couleur, clair, alpha = 0.3) {
  const c = lireCouleur(couleur);
  if (!c) return couleur;
  // La carte d'un thème clair n'est pas blanche : elle tire vers son fond.
  const base = clair ? [242, 244, 247] : [18, 24, 36];
  // Le lavis garde la couleur VRAIE de l'appareil : c'est contre celui-là que
  // l'icône doit se lire, pas contre un lavis de la couleur déjà corrigée.
  const fondTeinte = composer(base, [c[0], c[1], c[2], alpha]);
  return versHex(ajuster(c.slice(0, 3), [fondTeinte], SEUILS.surLavis, clair ? -1 : 1));
}

/**
 * La garde. `lire(jeton)` rend la valeur calculée d'un jeton (une chaîne).
 * Rend { jeton: valeur } : seulement ce qui doit changer.
 */
export function garde(lire) {
  const fond = lireCouleur(lire('--o-bg'));
  if (!fond) return {};
  const clair = luminance(fond) > 0.4;
  // Les fonds sur lesquels on lit : la page (et les arrêts de son dégradé),
  // les deux surfaces des cartes composées dessus.
  const page = [fond.slice(0, 3), ...couleursDe(lire('--o-bggrad')).map(c => composer(fond, c))];
  const surfaces = ['--o-surfA', '--o-surfB'].map(t => lireCouleur(lire(t))).filter(Boolean);
  const fonds = [...page];
  for (const p of page) for (const s of surfaces) fonds.push(composer(p, s));
  /* Les remplissages neutres (`--o-s1`, `--o-s2`) : une puce, une pastille, un
   * petit fond. Un thème les donne parfois clairs (GitHub, Frosted Glass les
   * tirent de leur couleur de bord) : ce qui s'écrit dessus compte aussi — au
   * seuil WCAG simple, la marge des surfaces unies n'a pas à s'y appliquer. */
  const remplis = [];
  for (const t of ['--o-s1', '--o-s2']) {
    const f = lireCouleur(lire(t)); if (!f) continue;
    for (const b of fonds) remplis.push(composer(b, f));
  }
  const sens = clair ? -1 : 1;
  const out = {};
  /* UNE CARTE SE VOIT. Un thème sans ombre ni filet (Neumorphix, iOS et
   * Frosted Glass mettent `borderWidth` à 0) laissait ses cartes plates se
   * confondre avec la page — 1,06:1 (audit du 19/09). On écarte la surface du
   * fond, du plus petit pas qui suffit ; l'opacité du verre ne bouge pas.
   * `separer` rend la couleur à poser pour obtenir le composé visé. */
  const separer = (couleur, dessous, cible) => {
    const compose = composer(dessous, couleur);
    if (contraste(compose, dessous) >= cible) return null;
    const versClair = luminance(dessous) < 0.85;
    const vise = ajuster(compose, [dessous], cible, versClair ? 1 : -1);
    let a = couleur.length > 3 ? couleur[3] : 1;
    if (a <= 0.02) return null;
    const rendu = (alpha) => [0, 1, 2].map(i => Math.max(0, Math.min(255, (vise[i] - dessous[i] * (1 - alpha)) / alpha)));
    /* Une surface translucide plafonne : même poussée au blanc, elle reste
     * proche du fond. On la rend alors un peu plus opaque — pas plus qu'il ne
     * faut, le verre garde son flou. */
    while (a < 0.95 && contraste(composer(dessous, [...rendu(a), a]), dessous) < cible) a = Math.min(0.95, a + 0.04);
    return 'rgba(' + versRgb(rendu(a)) + ',' + Math.round(a * 100) / 100 + ')';
  };
  /* Seulement quand le thème n'a PAS de filet : avec un trait d'un pixel
   * (Loggia, GitHub, The Projekt…) la carte se voit déjà, et son ombre fait le
   * reste. Sans filet ni ombre, il ne reste que la clarté. */
  const filet = parseFloat(lire('--o-bw') || '1') > 0;
  if (!filet) {
    for (const t of ['--o-surfA', '--o-surfB']) {
      const c = lireCouleur(lire(t)); if (!c) continue;
      const v = separer(c, page[0], SEUILS.carte);
      if (v) { out[t] = v; surfaces[['--o-surfA', '--o-surfB'].indexOf(t)] = lireCouleur(v); }
    }
  }
  /* Un puits — une tuile DANS une carte : l'heure, une mesure de confort — se
   * voit sur sa carte, filet ou non : ces tuiles-là n'en portent pas. */
  const carte = surfaces.length ? composer(page[0], surfaces[0]) : page[0];
  for (const t of ['--o-well', '--o-well0']) {
    const c = lireCouleur(lire(t)); if (!c) continue;
    const v = separer(c, carte, SEUILS.puits);
    if (v) out[t] = v;
  }
  // Les fonds tiennent compte des surfaces écartées.
  fonds.length = 0;
  fonds.push(...page);
  for (const p of page) for (const s of surfaces) fonds.push(composer(p, s));
  const poser = (jeton, avant, apres) => {
    if (versHex(avant) === versHex(apres)) return;
    out[jeton] = versHex(apres);
    if (AVEC_RGB.has(jeton)) out[jeton + '-rgb'] = versRgb(apres);
  };
  /* Le texte principal : une palette d'éditeur de code le donne parfois terne
   * (#abb2bf) — il tombe alors sous 4,5:1 dès qu'une carte est teintée. */
  const txt = lireCouleur(lire('--o-text'));
  if (txt) { const x = ajuster(txt.slice(0, 3), fonds, SEUILS.texte, clair ? -1 : 1); if (versHex(x) !== versHex(txt)) out['--o-text'] = versHex(x); }
  // Les teintes qui écrivent — y compris sur LEUR PROPRE lavis : l'icône d'un
  // scénario sur son disque, l'état d'un volet sur sa carte violette.
  for (const jeton of TEINTES) {
    const c = lireCouleur(lire(jeton)); if (!c) continue;
    const surSoi = { cible: VIFS.has(jeton) ? SEUILS.surLavisVif : SEUILS.surLavis, fonds: (x) => { const out2 = []; for (const p of page) for (const s of surfaces) out2.push(composer(composer(p, s), [x[0], x[1], x[2], LAVIS])); return out2; } };
    const x = ajusterTous(c.slice(0, 3), [[fonds, SEUILS.teinte], [remplis, SEUILS.wcag]], sens, surSoi);
    poser(jeton, c, x);
    /* Leur compagnon « r,g,b » écrit aussi (`rgb(var(--o-ok-rgb))` : un badge,
     * une étiquette). Un thème peut le garder vif pour ses points et ses
     * jauges (Atrium) ou le rendre invalide (une référence à lui-même) : s'il
     * n'est pas lisible en texte, il rejoint la teinte ajustée. */
    const rc = lireCouleur('rgb(' + lire(jeton + '-rgb') + ')');
    if (AVEC_RGB.has(jeton) && !out[jeton + '-rgb'] && (!rc || fonds.some(f => contraste(rc, f) < SEUILS.teinte))) out[jeton + '-rgb'] = versRgb(x);
  }
  /* Les gris, APRÈS les teintes : ils s'écrivent aussi sur les cartes teintées
   * — « 612 ppm » sur la pièce bleue, « Tout est éteint » sur la carte ambrée.
   * L'audit du 20/09 (13 528 textes, 15 thèmes × clair et sombre) n'a trouvé
   * QUE cela sous 4,5:1 : 303 textes sur 306, entre 3,3 et 4,4, tous au pied
   * d'une carte teintée, là où le lavis est le plus dense.
   *
   * Tenir 4,5:1 sur la carte la plus teintée demande un gris nettement plus
   * clair (#8c98b2 → #a9b2c5 en Loggia sombre) : posé PARTOUT, il changerait le
   * visage du thème. Il ne vaut donc que LÀ : deux jetons « sur lavis », que
   * les cartes teintées substituent aux gris ordinaires (index.css). Ailleurs,
   * rien ne bouge. Le secondaire garde une marche d'avance sur le tertiaire,
   * pour que la hiérarchie se lise encore. */
  const fondsTeintes = [];
  for (const jeton of TEINTES) {
    const t = lireCouleur('rgb(' + (out[jeton + '-rgb'] || lire(jeton + '-rgb')) + ')') || lireCouleur(out[jeton] || lire(jeton));
    if (!t) continue;
    for (const p of page) for (const s of surfaces) fondsTeintes.push(composer(composer(p, s), [t[0], t[1], t[2], LAVIS]));
  }
  // On les rend plus lisibles en gardant leur teinte froide ou chaude.
  for (const [jeton, cible, surTeinte] of [['--o-text2', SEUILS.text2, SEUILS.text2Lavis], ['--o-text3', SEUILS.text3, SEUILS.wcag]]) {
    const c = lireCouleur(lire(jeton)); if (!c) continue;
    const opaque = composer(fonds[fonds.length - 1], c);
    const x = ajusterTous(opaque, [[fonds, cible], [remplis, SEUILS.wcag]], sens);
    poser(jeton, opaque, x);
    if (jeton === '--o-text3' && out['--o-text3']) out['--o-text3-rgb'] = versRgb(x);
    // La variante « sur lavis » part du gris déjà ajusté, et ne s'en écarte que
    // s'il le faut. Toujours posée : un thème qui n'en a pas besoin la purge.
    const l = ajusterTous(x, [[fondsTeintes, surTeinte]], sens);
    out[jeton + '-lavis'] = versHex(l);
    if (jeton === '--o-text3') out['--o-text3-lavis-rgb'] = versRgb(l);
  }
  // L'accent : une icône, un interrupteur, un trait — 3:1.
  const accent = lireCouleur(lire('--o-accent'));
  if (accent) {
    // L'accent habille aussi des disques de sa propre couleur (l'icône d'un
    // scénario) : il doit s'y lire.
    const surDisque = { cible: SEUILS.surLavis, fonds: () => { const o2 = []; for (const p of page) for (const s of surfaces) o2.push(composer(composer(p, s), [accent[0], accent[1], accent[2], 0.22])); return o2; } };
    const a = ajusterTous(accent.slice(0, 3), [[fonds, SEUILS.accent]], sens, surDisque);
    if (versHex(a) !== versHex(accent)) { out['--o-accent'] = versHex(a); out['--o-accent-rgb'] = versRgb(a); }
    // Le fond d'accent PORTE du texte blanc (puce choisie, bouton plein) : la
    // teinte a 82 %, assombrie encore s'il le faut pour tenir le seuil.
    const base = [0, 1, 2].map(i => a[i] * 0.82);
    out['--o-accent-fond'] = versHex(ajuster(base, [[255, 255, 255]], SEUILS.surAccent, -1));
  }
  /* Le bouton de l'assistant porte une icône BLANCHE sur son dégradé rose →
   * violet. En thème sombre, ces deux teintes sont claires — et la garde les
   * éclaircit encore pour le texte : l'icône y tombait à 2,3:1. Deux jetons
   * de FOND, assombris juste assez pour elle. */
  for (const [jeton, source] of [['--o-rose-fond', '--o-rose'], ['--o-purple-fond', '--o-purple']]) {
    const c = lireCouleur(out[source] || lire(source)); if (!c) continue;
    out[jeton] = versHex(ajuster(c.slice(0, 3), [[255, 255, 255]], SEUILS.surIcone, -1));
  }
  return out;
}
