import { test, expect } from '@playwright/test';
import path from 'node:path';

async function setup(page, html) {
  await page.setContent(html);
  for (const file of ['control-adapters.js', 'form-engine.js']) await page.addScriptTag({ path: path.resolve('extension', file) });
  await page.evaluate(() => { window.plan = window.__OFFERPILOT_FORM__.snapshot([document.querySelector('#target')]); });
}
async function run(page, value) {
  return page.evaluate(async (value) => { try { return (await window.__OFFERPILOT_FORM__.apply(window.plan, value)).value; } catch (error) { return error.message; } }, value);
}
test('same plan resumes a partially committed multi-select without duplicate chips', async ({ page }) => {
  await setup(page, '<div class="ant-select ant-select-multiple"><input id="target" aria-controls="popup"></div><div id="popup" role="listbox" hidden><div role="option">Go</div></div>');
  await page.evaluate(() => {
    const input = document.querySelector('input'); const popup = document.querySelector('#popup');
    input.parentElement.onclick = () => { popup.hidden = false; };
    window.bind = () => { for (const option of popup.children) option.onclick = () => { const chip = document.createElement('span'); chip.dataset.selectedLabel = option.textContent; chip.textContent = option.textContent; input.parentElement.append(chip); input.value = ''; }; };
    window.bind(); input.onkeydown = (event) => { if (event.key === 'Escape') popup.hidden = true; };
  });
  expect(await run(page, 'Go,Java')).toBe('option_not_found');
  await page.evaluate(() => { document.querySelector('#popup').innerHTML = '<div role="option">Go</div><div role="option">Java</div>'; window.bind(); });
  expect(await run(page, 'Go,Java')).toBe('Go,Java');
  await expect(page.locator('[data-selected-label]')).toHaveCount(2);
});
test('same plan resumes a date range with one endpoint rejected by the framework', async ({ page }) => {
  await setup(page, '<div class="el-range-editor el-date-editor--monthrange"><input id="target"><input id="end"></div>');
  await page.evaluate(() => { window.rejectEnd = (event) => { event.target.value = ''; }; document.querySelector('#end').addEventListener('input', window.rejectEnd); });
  expect(await run(page, '2020-01 / 2024-01')).toBe('write_not_persisted');
  await page.evaluate(() => document.querySelector('#end').removeEventListener('input', window.rejectEnd));
  expect(await run(page, '2020-01 / 2024-01')).toBe('2020-01 / 2024-01');
});
test('manual edits after a partial range failure block recovery', async ({ page }) => {
  await setup(page, '<div class="el-range-editor el-date-editor--monthrange"><input id="target"><input id="end"></div>');
  await page.evaluate(() => document.querySelector('#end').oninput = (event) => { event.target.value = ''; });
  expect(await run(page, '2020-01 / 2024-01')).toBe('write_not_persisted');
  await page.locator('#target').fill('2021-01');
  expect(await run(page, '2020-01 / 2024-01')).toBe('value_changed');
  await expect(page.locator('#target')).toHaveValue('2021-01');
});
