import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Keeps the interface bilingual. Every piece of Mongolian text in the source must be the
 * Mongolian half of a `t('…', '…')` pair or of a `localized({ … })` table, and `t` must be
 * called while rendering, never when a module loads (the text would freeze in one language).
 */
const root = join(import.meta.dirname, '..');
const cyrillic = /[А-Яа-яӨөҮүЁё]/;
/** Mongolian that is data, not interface text, by file. */
const allowed: Record<string, (text: string) => boolean> = {
  // Sample wardrobe names are stored in Mongolian; English mode shows them through a name map.
  'src/lib/demo.ts': () => true,
  // Mongolian label tables behind the language-aware colorLabel / kindLabel / weekdayName.
  'src/lib/i18n.ts': () => true,
  // Mongolian grammar inside the Mongolian branch of phrase().
  'src/lib/oyu.ts': (text) => text === ' өнгийн',
  // Each language names itself in the language switch.
  'src/features/Settings.tsx': (text) => text.trim() === 'Монгол',
  // Not part of the app (the pitch try-on replaced it); kept for reference.
  'src/features/LiveTryOn.tsx': () => true,
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}
const isCall = (node: ts.Node, name: string) =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name;
const inFunction = (node: ts.Node) => {
  for (let up = node.parent; up; up = up.parent) if (ts.isFunctionLike(up)) return true;
  return false;
};

const untranslated: string[] = [];
const frozen: string[] = [];
for (const path of files(join(root, 'src'))) {
  const file = relative(root, path);
  const source = ts.createSourceFile(
    path,
    readFileSync(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const where = (node: ts.Node) =>
    `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    if (isCall(node, 't') && !inFunction(node)) frozen.push(where(node));
    const text = ts.isJsxText(node)
      ? node.text
      : ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : ts.isTemplateExpression(node)
          ? // Only the template's own text; strings inside ${…} are checked on their own.
            node.head.text + node.templateSpans.map((span) => span.literal.text).join('')
          : null;
    if (text !== null && cyrillic.test(text) && !allowed[file]?.(text)) {
      let ok = false;
      for (let up: ts.Node | undefined = node, child = node; up; child = up, up = up.parent) {
        if (isCall(up, 't') && (up as ts.CallExpression).arguments[0] === child) ok = true;
        if (isCall(up, 'localized')) ok = true;
        if (ok || ts.isFunctionLike(up)) break;
      }
      if (!ok) untranslated.push(`${where(node)}  ${text.trim().slice(0, 60)}`);
      if (!ts.isTemplateExpression(node)) return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

describe('bilingual interface', () => {
  it('has an English version of every Mongolian text', () => {
    expect(untranslated).toEqual([]);
  });
  it('never translates at module level', () => {
    expect(frozen).toEqual([]);
  });
});
