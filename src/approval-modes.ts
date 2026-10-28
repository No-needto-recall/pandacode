import { t } from './i18n.ts';
import type { Mode, ProviderId } from './types';

export interface ApprovalMode { id: Mode; label: string; description: string; icon: string; disabled?: boolean; }

const CLAUDE_FAMILY: ProviderId[] = ['claude', 'glm', 'mimo'];

/** Labels describe the native policy for each harness, not a simulated approval layer. */
export function approvalModes(provider: ProviderId, current?: Mode): ApprovalMode[] {
  // omp is a Pi fork driven through the same bridge, so it shares Pi's policy.
  const pi = provider === 'pi' || provider === 'omp' ? (provider === 'omp' ? 'omp' : 'Pi') : '';
  const standard: ApprovalMode = { id: 'ask', label: t('shell.approval.label.standard'), icon: 'check', description: provider === 'codex'
    ? t('shell.approval.standard.codex')
    : provider === 'github-copilot'
    ? t('shell.approval.standard.copilot')
    : provider === 'grok'
    ? t('shell.approval.standard.grok')
    : provider === 'devin'
    ? t('shell.approval.standard.devin')
    : pi
    ? t('shell.approval.standard.pi', { name: pi })
    : provider === 'deepseek'
    ? t('shell.approval.standard.deepseek')
    : provider === 'cline'
    ? t('shell.approval.standard.cline')
    : provider === 'kilo'
    ? t('shell.approval.standard.kilo')
    : provider === 'muse'
    ? t('shell.approval.standard.muse')
    : provider === 'zcode'
    ? t('shell.approval.standard.zcode')
    : provider === 'hermes'
    ? t('shell.approval.standard.hermes')
    : t('shell.approval.standard.default') };
  const full: ApprovalMode = { id: 'full', label: t('shell.approval.label.full'), icon: 'unlock', description: provider === 'antigravity'
    ? t('shell.approval.full.antigravity')
    : provider === 'codex'
    ? t('shell.approval.full.codex')
    : provider === 'grok'
    ? t('shell.approval.full.grok')
    : pi
    ? t('shell.approval.full.pi', { name: pi })
    : provider === 'deepseek'
    ? t('shell.approval.full.deepseek')
    : provider === 'cline'
    ? t('shell.approval.full.cline')
    : provider === 'muse'
    ? t('shell.approval.full.muse')
    : provider === 'devin'
    ? t('shell.approval.full.devin')
    : provider === 'hermes'
    ? t('shell.approval.full.hermes')
    : provider === 'github-copilot'
    ? t('shell.approval.full.copilot')
    : provider === 'zcode'
    ? t('shell.approval.full.zcode')
    : t('shell.approval.full.default') };
  // Agent-reviewed approvals, as bots offer. Codex's own is its Approve for me (`auto`).
  const review: ApprovalMode[] = CLAUDE_FAMILY.includes(provider)
    ? [{ id: 'review', label: t('shell.approval.label.review'), icon: 'spark', description: t('shell.approval.review.claude') }]
    // A task switched here keeps its mode; show why it cannot run rather than another policy.
    : current !== 'review' ? []
    : [{ id: 'review', label: t('shell.approval.label.review'), icon: 'spark', disabled: true, description: t('shell.approval.review.unsupported') }];
  if (provider === 'github-copilot') return [standard,
    { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.copilot') },
    ...review, full];
  // Devin's Code mode already accepts edits, so it has no separate Accept edits choice.
  if (provider === 'devin') return [standard,
    { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.devin') },
    ...review, full];
  return [standard, provider === 'muse'
    ? { id: 'auto', label: t('shell.approval.label.edits'), icon: 'edit', description: t('shell.approval.auto.muse') }
    : provider === 'deepseek'
    ? { id: 'auto', label: t('shell.approval.label.edits'), icon: 'edit', description: t('shell.approval.auto.deepseek') }
    : ['claude', 'glm', 'mimo', 'opencode', 'grok', 'pi', 'omp', 'commandcode', 'cline', 'kilo', 'zcode', 'hermes'].includes(provider)
    ? { id: 'auto', label: t('shell.approval.label.edits'), icon: 'edit', description: t('shell.approval.auto.edits') }
    : provider === 'kimi'
    ? { id: 'auto', label: t('shell.approval.label.needed'), icon: 'spark', description: t('shell.approval.auto.kimi') }
    : provider === 'codex' ? { id: 'auto', label: t('shell.approval.label.review'), icon: 'spark', description: t('shell.approval.auto.codex') }
    : { id: 'auto', label: t('shell.approval.label.edits'), icon: 'edit', description: t('shell.approval.auto.default') },
  ...review,
  provider === 'codex'
    ? { id: 'plan', label: t('shell.approval.label.readonly'), icon: 'plan', description: t('shell.approval.plan.codex') }
    : provider === 'grok'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.grok') }
    : pi
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.pi', { name: pi }) }
    : provider === 'deepseek'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.deepseek') }
    : provider === 'cline'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.cline') }
    : provider === 'kilo'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.kilo') }
    : provider === 'muse'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.muse') }
    : provider === 'commandcode'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.commandcode') }
    : provider === 'zcode'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.zcode') }
    : provider === 'hermes'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.hermes') }
    : CLAUDE_FAMILY.includes(provider)
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.claude') }
    : provider === 'opencode'
    ? { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.opencode') }
    : { id: 'plan', label: t('shell.approval.label.plan'), icon: 'plan', description: t('shell.approval.plan.default') }, full];
}

export function approvalMode(provider: ProviderId, mode: Mode): ApprovalMode {
  const modes = approvalModes(provider, mode);
  return modes.find(item => item.id === mode) ?? modes[0];
}
