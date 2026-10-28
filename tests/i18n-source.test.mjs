import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ts from 'typescript';
import { messages as desktop } from '../src/i18n-generated/messages.ts';
import { messages as mobile } from '../mobile/src/i18n-generated/messages.ts';

async function files(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (['i18n-generated', 'vendor', 'assets', 'node_modules'].includes(item.name)) continue;
    const path = join(directory, item.name);
    if (item.isDirectory()) result.push(...await files(path));
    else if (/\.(ts|tsx)$/.test(item.name) && !/\.test\.|\.d\.ts$/.test(item.name)) result.push(path);
  }
  return result;
}

test('literal translation calls supply all required sentence parameters', async () => {
  const failures = [];
  for (const [directory, messages] of [['src', desktop], ['mobile/src', mobile]]) {
    for (const path of await files(directory)) {
      const source = await readFile(path, 'utf8');
      const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = node => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['t', 'tr', 'msg'].includes(node.expression.text)) {
          const [key, parameters] = node.arguments;
          if (key && ts.isStringLiteralLike(key) && Object.hasOwn(messages, key.text)) {
            const expected = [...messages[key.text].en.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)].map(match => match[1]);
            const explicit = !parameters || ts.isObjectLiteralExpression(parameters) && parameters.properties.every(property => !ts.isSpreadAssignment(property));
            if (explicit && expected.length) {
              const supplied = new Set(parameters ? parameters.properties.map(property => property.name?.getText(file).replace(/^['"]|['"]$/g, '')) : []);
              for (const name of expected) if (!supplied.has(name)) failures.push(`${path}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1} ${key.text} missing {${name}}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
  }
  assert.deepEqual(failures, []);
});
