/* Rendre un composant dans un test (ADR 0069).
 *
 * `composant(chemin, nom)` charge un module `.jsx` de `src/` (les crochets de
 * `jsx-hooks.mjs` s'enregistrent ici, avant le premier import) ; `rendre`
 * donne le HTML statique de React — sans navigateur, sans effets : ce qu'un
 * premier rendu montre, et rien d'autre. Assez pour affirmer sur un role, un
 * nom, un texte ou une classe, au lieu d'epingler du JSX. */
import { register } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

/* Le strict minimum de navigateur que des modules touchent au CHARGEMENT :
 * une image par seconde de plus n'a aucun sens ici, la doublure ne fait
 * qu'exister. Tout le reste (`window`, `localStorage`, `matchMedia`) est
 * deja garde dans les sources. */
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
}

register('./jsx-hooks.mjs', import.meta.url);

export async function composant(chemin, nom = null) {
  const m = await import(new URL('../src/' + chemin, import.meta.url));
  return nom ? m[nom] : m.default;
}

export function rendre(Comp, props = {}) {
  return renderToStaticMarkup(createElement(Comp, props));
}
