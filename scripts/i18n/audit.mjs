import ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { root } from './generate.mjs';

const displayProperties = new Set(['label', 'title', 'description', 'placeholder', 'tooltip', 'ariaLabel', 'accessibilityLabel', 'accessibilityHint', 'emptyText', 'help', 'message', 'summary', 'hint', 'saves', 'caption', 'subtitle', 'heading', 'detail', 'emptyLabel', 'buttonLabel']);
const calls = new Set(['notify', 'setTitle', 'showError', 'alert', 'confirm']);
const findings = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['i18n-generated', 'vendor', 'assets', 'node_modules'].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (!/\.(ts|tsx)$/.test(entry.name) || /^(preview|demo)[-.]|\.test\.|\.d\.ts$/.test(entry.name)) continue;
    const text = await readFile(path, 'utf8');
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, entry.name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const report = (node, value, kind) => {
      const content = value.trim();
      if (!/[A-Za-z]{3}/.test(content) || /[㐀-鿿]/.test(content) || /^https?:|^\.[/\\]|^[\w.-]+\.(ts|rs|json|md)$/.test(content)) return;
      findings.push({ file: relative(root, path).replaceAll('\\', '/'), line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, kind, text: content });
    };
    function visit(node) {
      if (ts.isTemplateExpression(node)) {
        const value = node.head.text + node.templateSpans.map(span => `{…}${span.literal.text}`).join('');
        const parent = node.parent;
        const displayCall = ts.isCallExpression(parent) && ['escape', 'escapeI18n', 'notify', 'setAttribute'].includes(ts.isPropertyAccessExpression(parent.expression) ? parent.expression.name.text : parent.expression.getText(file));
        const displayProperty = ts.isPropertyAssignment(parent) && displayProperties.has(parent.name.getText(file).replace(/^['"]|['"]$/g, ''));
        const displayAssignment = ts.isBinaryExpression(parent) && ts.isPropertyAccessExpression(parent.left) && ['textContent', 'title', 'placeholder'].includes(parent.left.name.text);
        if (!value.includes('<') && (displayCall || displayProperty || displayAssignment)) report(node, value, 'dynamic');
      }
      if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node)) {
        const value = node.text;
        for (const match of value.matchAll(/>\s*([^<>]+?)\s*</g)) {
          if (!match[1].includes('${')) report(node, match[1], 'html-text');
        }
        for (const match of value.matchAll(/(?:aria-label|placeholder|title)=["']([^"']+)["']/g)) {
          if (!match[1].includes('${')) report(node, match[1], 'html-attribute');
        }
      }
      if (ts.isJsxText(node)) report(node, node.text, 'jsx');
      if (ts.isPropertyAssignment(node) && displayProperties.has(node.name.getText(file).replace(/^['"]|['"]$/g, '')) && (ts.isStringLiteralLike(node.initializer))) {
        report(node, node.initializer.text, 'property');
      }
      if (ts.isJsxAttribute(node) && displayProperties.has(node.name.getText(file)) && node.initializer && ts.isStringLiteral(node.initializer)) {
        report(node, node.initializer.text, 'attribute');
      }
      if (ts.isCallExpression(node)) {
        const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(file);
        if (calls.has(name)) for (const argument of node.arguments) if (ts.isStringLiteralLike(argument)) report(argument, argument.text, 'call');
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
  }
}

await scan(join(root, 'src'));
await scan(join(root, 'mobile/src'));
console.log(JSON.stringify(findings, null, 2));
console.error(`${findings.length} candidate English UI literals. Review context: brands, examples and protocol text are not missing translations.`);
