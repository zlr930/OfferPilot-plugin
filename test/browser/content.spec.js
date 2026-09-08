import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

async function load(page) {
  await page.setContent('<main><h1>Application</h1><form><label for="name">Name</label><input id="name" required><label for="email">Email</label><input id="email" type="email" required><button type="button" id="save">保存</button></form></main>');
  const css = await readFile('extension/content.css', 'utf8');
  await page.evaluate((css) => {
    window.saved = false;
    document.querySelector('#save').onclick = () => { window.saved = true; };
    window.chrome = { runtime: {
      getURL: () => `data:text/css;base64,${btoa(css)}`,
      onMessage: { addListener() {} },
      async sendMessage(message) {
        if (message.type === 'offerpilot:get-profile') return { ok: true, data: { profile: { basic: { fullName: 'Candidate' } } } };
        if (message.type === 'offerpilot:match') return { ok: true, data: {
          summary: 'Ready', meta: { acceptedMatchCount: 2, requestedFieldCount: 2 },
          matches: message.payload.fields.map((field) => ({ fieldId: field.id, value: field.label === 'Name' ? 'Candidate' : 'invalid-email', confidence: 1, requiresConfirmation: false, source: 'Profile', reason: 'Exact' })),
          actions: message.payload.actions.filter((action) => action.type === 'finish_record').map((action) => ({ actionId: action.id, type: action.type, label: action.label })),
        } };
      },
    } };
  }, css);
  await page.addScriptTag({ path: path.resolve('extension/control-adapters.js') });
  await page.addScriptTag({ path: path.resolve('extension/form-engine.js') });
  await page.addScriptTag({ path: path.resolve('extension/content.js') });
}

test('panel reports validated results, blocks save on failure, and offers retry', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: '分析当前页面', exact: true }).click();
  await page.getByRole('button', { name: '应用选中', exact: true }).click();
  await expect(page.getByText('网站校验未通过', { exact: true })).toBeVisible();
  await expect(page.getByText('已填写并通过读回校验', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.saved)).toBe(false);
  await expect(page.getByRole('button', { name: '重试Email', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '补充填写', exact: true })).toBeVisible();
});

test('unchecked suggestions cannot trigger record save', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: '分析当前页面', exact: true }).click();
  await page.locator('.agent-match-check').nth(1).uncheck();
  await page.getByRole('button', { name: '应用选中', exact: true }).click();
  await expect(page.getByText('未勾选，等待确认', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.saved)).toBe(false);
});

test('ARIA radio group is sent to the planner as one field with two choices', async ({ page }) => {
  await load(page);
  await page.evaluate(() => {
    document.querySelector('main').innerHTML = '<fieldset><legend>学历</legend><div role="radiogroup" aria-label="学历"><div role="radio" aria-checked="false" data-value="bachelor">本科</div><div role="radio" aria-checked="false" data-value="master">硕士</div></div></fieldset>';
    const send = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = async (message) => { if (message.type === 'offerpilot:match') window.scanned = message.payload.fields; return send(message); };
  });
  await page.getByRole('button', { name: '分析当前页面', exact: true }).click();
  const fields = await page.evaluate(() => window.scanned);
  expect(fields).toHaveLength(1);
  expect(fields[0].type).toBe('radio');
  expect(fields[0].options.map((option) => option.value)).toEqual(['bachelor', 'master']);
});

test('replanning receives prior execution failure observations', async ({ page }) => {
  await load(page);
  await page.getByRole('button', { name: '分析当前页面', exact: true }).click();
  await page.getByRole('button', { name: '应用选中', exact: true }).click();
  await expect(page.getByText('网站校验未通过', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    document.querySelector('#email').value = '';
    const send = chrome.runtime.sendMessage;
    chrome.runtime.sendMessage = async (message) => { if (message.type === 'offerpilot:match') window.feedback = message.payload.executionFeedback; return send(message); };
  });
  await page.getByRole('button', { name: '补充填写', exact: true }).click();
  expect(await page.evaluate(() => window.feedback.some((item) => item.label === 'Email' && item.code === 'validation_failed'))).toBe(true);
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`results fit viewport ${viewport.width}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await load(page);
    await page.getByRole('button', { name: '分析当前页面', exact: true }).click();
    await page.getByRole('button', { name: '应用选中', exact: true }).click();
    await expect(page.getByRole('button', { name: '补充填写', exact: true })).toBeVisible();
    const panel = page.locator('.agent-panel');
    const rect = await panel.boundingBox();
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(viewport.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewport.height);
    expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`results-${viewport.width}.png`) });
  });
}
