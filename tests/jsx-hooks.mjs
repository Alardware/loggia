/* Les crochets de chargement des tests par RENDU (ADR 0069).
 *
 * Node ne lit pas le JSX. Ici, un fichier `.jsx` passe par esbuild — celui
 * que Vite embarque, aucune dependance de plus — et une image importee
 * devient simplement son chemin, comme Vite le ferait. Rien d'autre n'est
 * touche : `react`, `react-dom/server` et les modules `.js` se chargent tels
 * quels.
 *
 * S'enregistre par `module.register` depuis `tests/rendu.mjs` : seuls les
 * tests qui rendent un composant en ont besoin, `npm test` ne change pas. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const IMAGES = /\.(svg|webp|png|jpe?g|gif)$/;

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'esm', target: 'es2022', sourcefile: url });
    return { format: 'module', source: code, shortCircuit: true };
  }
  if (IMAGES.test(url)) {
    return { format: 'module', source: 'export default ' + JSON.stringify(url) + ';', shortCircuit: true };
  }
  if (url.endsWith('.css')) {
    return { format: 'module', source: 'export default "";', shortCircuit: true };
  }
  return nextLoad(url, context);
}
