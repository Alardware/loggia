/* Le monolithe, tel que les tests le lisent (ADR 0274, ADR 0282).
 *
 * Beaucoup de tests cherchent une fonction dans le TEXTE d'`App.jsx`. Quand du
 * code en sort — le découpage du lot 5 de l'audit du 28/10 —, il garde son
 * texte tel quel, ailleurs : un test qui lisait `App.jsx` seul ne le
 * trouverait plus, et casserait sans que rien ne soit cassé pour personne.
 *
 * `MONOLITHE` est donc `App.jsx` PUIS tout ce qui en est sorti, en un seul
 * texte : chaque fichier des dossiers de `DOSSIERS_SORTIS`, dans l'ordre
 * alphabétique de son chemin, et chaque fichier de `FICHIERS_SORTIS`. Tant que
 * rien n'est sorti, c'est exactement `App.jsx` : les positions, les tranches
 * entre deux repères, tout reste où c'était.
 *
 * Un module sorti d'App.jsx ? S'il vit dans un de ces dossiers, il est déjà
 * lu. Sinon, son chemin s'ajoute à `FICHIERS_SORTIS`, une seule fois.
 *
 * `VUES_SORTIES` (ADR 0274) reste à part, tel qu'il était : ces vues sont
 * sorties AVANT ce helper, et les tests qui les veulent le disent en
 * l'ajoutant.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const lire = (chemin) => readFileSync(new URL('../src/' + chemin, import.meta.url), 'utf8');

/* Les dossiers où le lot 5 range ce qui sort d'App.jsx (rapport du 28/10). */
export const DOSSIERS_SORTIS = ['app', 'cartes', 'edition', 'appareils', 'vues', 'cartescustom', 'accueil', 'chrome'];

/* Les modules sortis d'App.jsx qui vivent ailleurs que dans ces dossiers. */
export const FICHIERS_SORTIS = [];

function fichiersDe(dossier) {
  const racine = join(SRC, dossier);
  if (!existsSync(racine)) return [];
  const out = [];
  const marcher = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) marcher(p);
      else if (/\.(js|jsx)$/.test(f)) out.push(relative(SRC, p).split('\\').join('/'));
    }
  };
  marcher(racine);
  return out.sort();
}

/** Les chemins (relatifs à src/) qui composent le monolithe, App.jsx en tête. */
export const PIECES_DU_MONOLITHE = ['App.jsx', ...DOSSIERS_SORTIS.flatMap(fichiersDe), ...FICHIERS_SORTIS];

/* Un module sorti vit dans un dossier : il importe `'../theme.js'` là où
 * App.jsx écrivait `'./theme.js'`, et charge `import('../ficheprise.jsx')`.
 * Le monolithe le relit comme s'il était resté dans `src/` (ADR 0283) : ses
 * chemins relatifs sont recalés sur `src/`, et un test qui cherche
 * `from './theme.js'` ou `import('./ficheprise.jsx')` le trouve où que le code
 * soit rangé. Le reste du texte ne bouge pas. */
function recale(chemin, texte) {
  const dossier = posix.dirname(chemin);
  if (dossier === '.') return texte;
  return texte.replace(/(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,
    (_, avant, q, rel) => avant + q + './' + posix.normalize(posix.join(dossier, rel)) + q);
}

/** Le texte d'App.jsx et de tout ce qui en est sorti, en un seul. Tel que le
 *  disque le porte, aux chemins relatifs près (`recale`) : un test qui
 *  uniformise les fins de ligne le fait lui-même. */
export const MONOLITHE = PIECES_DU_MONOLITHE.map((p) => recale(p, lire(p))).join('\n');

/** L'Accueil entier : `Dashboard`, ses hooks et ses sous-composants, posés
 *  devant lui dans `accueil/dashboard.jsx` (étape d du lot 5, ADR 0283). Un test
 *  qui découpait `function Dashboard(` jusqu'à la fonction suivante n'en
 *  verrait plus que le corps : il lit ce texte-ci. */
export const DASHBOARD = recale('accueil/dashboard.jsx', lire('accueil/dashboard.jsx'));

/** Les noms qu'un texte importe d'une source (`'./attention.js'`), toutes
 *  lignes d'import réunies (ADR 0283). Un module sorti n'importe que ce qu'il
 *  lit : la ligne d'App.jsx qu'un test recopiait se répartit alors entre
 *  App.jsx et ses modules, et ce sont ses NOMS qui se vérifient. Les alias se
 *  lisent sous leur nom local (`pilesDeLaMaison as pilesCarte` → `pilesCarte`). */
export function importsDe(texte, source) {
  const noms = new Set();
  const esc = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const m of texte.matchAll(new RegExp("import \\{([^}]*)\\} from '" + esc + "';", 'g'))) {
    for (const s of m[1].split(',')) { const n = s.trim().split(/\s+as\s+/).pop(); if (n) noms.add(n); }
  }
  return noms;
}

export const VUES_SORTIES =['views/energie.jsx', 'views/securite.jsx'].map((f) => '\n' + lire(f)).join('');
