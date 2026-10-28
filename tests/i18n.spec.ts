import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

async function changeLanguage(page: Page, locale: 'zh-CN' | 'en') {
  await page.evaluate(async value => {
    const module = await import('/src/i18n.ts');
    await module.setLocale(value);
  }, locale);
}

test('localization starts in Chinese and switches settings without losing the draft', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /language|Language/.test(message.text())) errors.push(message.text());
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  const prompt = page.locator('#prompt');
  await expect(prompt).toBeEnabled();
  await expect(prompt).toHaveAttribute('aria-label', /[㐀-鿿]/);
  const draft = '请检查 src/文件.ts，并保留 <script> 和 --help 原文。';
  await prompt.fill(draft);
  const selected = await page.locator('.task-item.selected').getAttribute('data-id');
  await page.keyboard.press('Meta+,');
  const settings = page.getByRole('region', { name: '设置', exact: true });
  await expect(settings).toBeVisible();
  const language = page.locator('#settings-language');
  await expect(language).toHaveValue('zh-CN');
  await language.selectOption('en');
  await expect(page.getByRole('region', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(prompt).toHaveValue(draft);
  await expect(page.locator('.task-item.selected')).toHaveAttribute('data-id', selected!);
  await language.selectOption('zh-CN');
  await expect(settings).toBeVisible();
  await expect(prompt).toHaveValue(draft);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(errors).toEqual([]);
});

test('localization preserves the focused draft and selection and keeps user messages untouched', async ({ page }) => {
  await page.goto('/');
  const prompt = page.locator('#prompt');
  await expect(prompt).toBeEnabled();
  await prompt.fill('中文草稿 English --flag={value}');
  await prompt.focus();
  await prompt.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 4));
  const userText = await page.locator('.user-message .message-content').allTextContents();
  expect(userText.length).toBeGreaterThan(0);
  await changeLanguage(page, 'en');
  await expect(prompt).toHaveValue('中文草稿 English --flag={value}');
  await expect(prompt).toBeFocused();
  expect(await prompt.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([2, 4]);
  expect(await page.locator('.user-message .message-content').allTextContents()).toEqual(userText);
  await changeLanguage(page, 'zh-CN');
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue('中文草稿 English --flag={value}');
});

test('localization reaches the independent tray and launcher windows', async ({ page, context }) => {
  await page.goto('/?view=tray');
  await expect(page.locator('.tray-section h2').first()).toHaveText(/[㐀-鿿]/);
  const other = await context.newPage();
  await other.goto('/?view=launcher');
  await expect(other.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await changeLanguage(other, 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('.tray-section h2').first()).toHaveText('Running');
  await changeLanguage(other, 'zh-CN');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.tray-section h2').first()).toHaveText(/[㐀-鿿]/);
  await other.close();
});

test('localization keeps Chinese language controls usable in a narrow enlarged window', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await page.addInitScript(() => localStorage.setItem('pandacode.uiScale', '1.4'));
  await page.goto('/');
  await expect(page.locator('#prompt')).toBeEnabled();
  await page.keyboard.press('Meta+,');
  const language = page.locator('#settings-language');
  await language.scrollIntoViewIfNeeded();
  await expect(language).toBeVisible();
  const box = await language.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(900);
  expect(box!.width).toBeGreaterThan(50);
  await language.selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('localization restores English after restart and rejects an invalid saved language', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#prompt')).toBeEnabled();
  await changeLanguage(page, 'en');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#prompt')).toHaveAttribute('aria-label', 'Message your coding agent');
  await page.evaluate(() => localStorage.setItem('pandacode.locale', 'unsupported'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('#prompt')).toHaveAttribute('aria-label', /[㐀-鿿]/);
});

test('localization refreshes an already visited provider panel without clearing an unsaved environment value', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pandacode.locale', 'en'));
  await page.goto('/');
  await expect(page.locator('#prompt')).toBeEnabled();
  await page.keyboard.press('Meta+,');
  await page.getByRole('tab', { name: 'Providers', exact: true }).click();
  const value = page.locator('#global-environment .connection-env-value');
  await value.fill('preserve-localization-draft');
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await page.locator('#settings-language').selectOption('zh-CN');
  await page.getByRole('tab', { name: '服务提供方', exact: true }).click();
  const panel = page.getByRole('tabpanel', { name: '服务提供方', exact: true });
  await expect(value).toHaveValue('preserve-localization-draft');
  await expect(panel).not.toContainText('Added to every agent harness PandaCode starts');
  await expect(panel).toContainText(/[㐀-鿿]/);
});

test('localization preserves bot form fields and escapes user content during a switch', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pandacode.locale', 'en'));
  await page.goto('/');
  await page.locator('.sidebar-bots-bar').click();
  const sidebar = page.getByRole('region', { name: 'Bots', exact: true });
  await sidebar.getByRole('button', { name: 'Add bot or channel' }).click();
  await sidebar.getByRole('menuitem', { name: 'New bot', exact: true }).click();
  const form = page.locator('.bc-form');
  await form.locator('[name="name"]').fill('中文 <script>name</script>');
  const purpose = form.locator('[name="purpose"]');
  await purpose.fill('保留这段说明 --flag={value}');
  await purpose.focus();
  await purpose.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 9));
  const before = await form.evaluate(element => Object.fromEntries(new FormData(element as HTMLFormElement)));
  await changeLanguage(page, 'zh-CN');
  await expect(form).toHaveAttribute('aria-label', /[㐀-鿿]/);
  expect(await form.evaluate(element => Object.fromEntries(new FormData(element as HTMLFormElement)))).toEqual(before);
  await expect(form.locator('script')).toHaveCount(0);
  await expect(purpose).toBeFocused();
  expect(await purpose.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd])).toEqual([2, 9]);
});

test('localization initializes the detached agents window and survives unavailable storage', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await page.goto('/agents-dock.html');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page.locator('.agents-dock-orb')).toHaveAttribute('aria-label', /[㐀-鿿]/);
  await changeLanguage(page, 'en');
  await expect(page.locator('.agents-dock-orb')).toHaveAttribute('aria-label', /Running agents/);
  await expect(page).toHaveTitle('Running agents');
});
