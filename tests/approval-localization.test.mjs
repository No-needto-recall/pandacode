import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalModes } from '../src/approval-modes.ts';
import { setLocale } from '../src/i18n.ts';

const providers = ['claude', 'codex', 'kimi', 'opencode', 'glm', 'mimo', 'github-copilot', 'antigravity', 'grok', 'deepseek', 'commandcode', 'cline', 'kilo', 'devin', 'hermes', 'zcode', 'pi', 'omp', 'muse'];
const policies = modes => modes.map(({ id, icon, disabled }) => ({ id, icon, disabled }));

test('translation preserves every harness permission mode and disabled state', async () => {
  try {
    for (const provider of providers) {
      for (const current of [undefined, 'ask', 'auto', 'plan', 'full', 'review']) {
        await setLocale('en');
        const english = approvalModes(provider, current);
        await setLocale('zh-CN');
        const chinese = approvalModes(provider, current);
        assert.deepEqual(policies(chinese), policies(english), `${provider}/${current}`);
        for (const mode of chinese) {
          assert.match(mode.label, /[㐀-鿿]/, `${provider}/${mode.id}: label`);
          assert.match(mode.description, /[㐀-鿿]/, `${provider}/${mode.id}: description`);
        }
      }
    }
  } finally { await setLocale('en'); }
});

test('Chinese permission explanations preserve meaningful sandbox differences', async () => {
  try {
    await setLocale('zh-CN');
    const description = (provider, id) => approvalModes(provider).find(mode => mode.id === id)?.description;
    assert.match(description('codex', 'auto'), /保留.*沙箱/);
    assert.match(description('codex', 'full'), /跳过.*审批.*沙箱/);
    assert.match(description('deepseek', 'auto'), /项目外.*编辑/);
    assert.match(description('devin', 'full'), /组织.*审批/);
    assert.match(description('opencode', 'plan'), /项目外.*询问/);
    assert.match(description('claude', 'plan'), /项目外.*读取/);
    assert.ok(!approvalModes('devin').some(mode => mode.id === 'auto'));
  } finally { await setLocale('en'); }
});
