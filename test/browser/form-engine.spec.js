import { test, expect } from '@playwright/test';
import path from 'node:path';

async function setup(page, html) {
  await page.setContent(html);
  await page.addScriptTag({ path: path.resolve('extension/control-adapters.js') });
  await page.addScriptTag({ path: path.resolve('extension/form-engine.js') });
}
async function apply(page, selector, value) {
  return page.evaluate(async ({ selector, value }) => {
    const engine = window.__OFFERPILOT_FORM__;
    try {
      const result = await engine.apply(engine.snapshot([...document.querySelectorAll(selector)]), value);
      return { value: result.value };
    } catch (error) { return { error: error.message }; }
  }, { selector, value });
}

test('native values persist and invalid or incomplete dates are rejected', async ({ page }) => {
  await setup(page, '<input id="name"><input id="date" type="date"><input id="month" type="month">');
  expect(await apply(page, '#name', 'Test Candidate')).toEqual({ value: 'Test Candidate' });
  expect(await apply(page, '#date', '2024-02')).toEqual({ error: 'date_precision' });
  expect(await apply(page, '#date', '2024-02-31')).toEqual({ error: 'date_format' });
  expect(await apply(page, '#date', '2024-02-29')).toEqual({ value: '2024-02-29' });
  expect(await apply(page, '#month', '2024年2月')).toEqual({ value: '2024-02' });
});

test('protects edits made after scanning and rejects ambiguous replacements', async ({ page }) => {
  await setup(page, '<fieldset><input name="name"></fieldset>');
  expect(await page.evaluate(async () => {
    const engine = window.__OFFERPILOT_FORM__;
    const input = document.querySelector('input');
    const snapshot = engine.snapshot([input]);
    input.value = 'User edit';
    try { await engine.apply(snapshot, 'Agent'); } catch (error) { return [error.message, input.value]; }
  })).toEqual(['value_changed', 'User edit']);
  expect(await page.evaluate(async () => {
    const engine = window.__OFFERPILOT_FORM__;
    const snapshot = engine.snapshot([document.querySelector('input')]);
    document.querySelector('fieldset').innerHTML = '<input name="name"><input name="name">';
    try { await engine.apply(snapshot, 'Agent'); } catch (error) { return error.message; }
  })).toBe('field_changed');
});

test('detects delayed framework resets and validation errors', async ({ page }) => {
  await setup(page, '<input id="reset"><input id="invalid">');
  await page.evaluate(() => {
    document.querySelector('#reset').addEventListener('input', (event) => setTimeout(() => { event.target.value = ''; }, 200));
    document.querySelector('#invalid').addEventListener('change', (event) => setTimeout(() => event.target.setAttribute('aria-invalid', 'true'), 200));
  });
  expect(await apply(page, '#reset', 'Test')).toEqual({ error: 'write_not_persisted' });
  expect(await apply(page, '#invalid', 'Test')).toEqual({ error: 'validation_failed' });
});

test('reads a uniquely replaced controlled input after rendering', async ({ page }) => {
  await setup(page, '<input id="controlled">');
  await page.evaluate(() => document.querySelector('input').addEventListener('input', (event) => {
    const next = event.target.cloneNode();
    next.value = event.target.value;
    event.target.replaceWith(next);
  }, { once: true }));
  expect(await apply(page, '#controlled', 'Persisted')).toEqual({ value: 'Persisted' });
});

for (const wrapper of ['ant-select', 'el-select', 'phoenix-select', 'sd-Select']) {
  test(`${wrapper} selects an asynchronous exact option from its own portal`, async ({ page }) => {
    await setup(page, `<div class="${wrapper}"><input id="school" role="combobox" aria-controls="choices"></div><div role="listbox"><div role="option">Example University</div></div><div id="choices" role="listbox" hidden></div>`);
    await page.evaluate(() => {
      const input = document.querySelector('#school');
      input.parentElement.addEventListener('click', () => { document.querySelector('#choices').hidden = false; input.setAttribute('aria-expanded', 'true'); });
      input.addEventListener('input', () => setTimeout(() => {
        const panel = document.querySelector('#choices');
        panel.innerHTML = '<div role="option">Example University</div>';
        panel.firstChild.addEventListener('click', () => {
          input.value = 'Example University';
          input.dataset.schoolId = '123';
          input.setAttribute('aria-expanded', 'false');
          panel.hidden = true;
        });
      }, 300));
    });
    expect(await apply(page, '#school', 'Example University')).toEqual({ value: 'Example University' });
    await expect(page.locator('#school')).toHaveAttribute('data-school-id', '123');
  });
}

test('search text without a matching option never counts as filled', async ({ page }) => {
  await setup(page, '<div class="ant-select"><input id="school" role="combobox" aria-controls="choices"></div><div id="choices" role="listbox" hidden></div>');
  await page.evaluate(() => document.querySelector('input').parentElement.addEventListener('click', () => { document.querySelector('#choices').hidden = false; }));
  expect(await apply(page, '#school', 'Missing University')).toEqual({ error: 'option_not_found' });
});

test('cascader waits for each level and checks the complete selected path', async ({ page }) => {
  await setup(page, '<div class="el-cascader"><input id="region" readonly aria-controls="regions"></div><div id="regions" role="tree" hidden></div>');
  await page.evaluate(() => {
    const input = document.querySelector('input');
    const panel = document.querySelector('#regions');
    const levels = ['Province', 'City', 'District'];
    function show(level) {
      panel.innerHTML = `<div role="treeitem">${levels[level]}</div>`;
      panel.firstChild.addEventListener('click', () => {
        if (level < 2) setTimeout(() => show(level + 1), 200);
        else { input.value = levels.join(' / '); panel.hidden = true; }
      });
    }
    input.parentElement.addEventListener('click', () => { panel.hidden = false; show(0); });
  });
  expect(await apply(page, '#region', 'Province / City / District')).toEqual({ value: 'Province / City / District' });
});

test('platform metadata identifies form labels and deduplicates combobox inputs', async ({ page }) => {
  await setup(page, '<section class="apply-block-1"><h2>Education</h2><div class="apply-fields-1"><div class="apply-field-1"><label>School</label><div role="combobox"><input></div></div></div></section>');
  expect(await page.evaluate(() => {
    const engine = window.__OFFERPILOT_FORM__;
    const input = document.querySelector('input');
    return [engine.platform().id, engine.label(input), engine.candidates().length, !!engine.group(input)];
  })).toEqual(['moka', 'School', 1, true]);
  await setup(page, '<form class="ux-standard-form"><div class="form-item"><span class="form-item__text">Company</span><input></div></form>');
  expect(await page.evaluate(() => [window.__OFFERPILOT_FORM__.platform().id, window.__OFFERPILOT_FORM__.label(document.querySelector('input'))])).toEqual(['beisen', 'Company']);
});

test('native checkbox groups and multi-select preserve all requested values', async ({ page }) => {
  await setup(page, '<input type="checkbox" value="a"><input type="checkbox" value="b"><select multiple><option value="a">A</option><option value="b">B</option></select>');
  expect(await apply(page, 'input', 'a,b')).toEqual({ value: 'a,b' });
  expect(await apply(page, 'select', 'a,b')).toEqual({ value: 'a,b' });
});

test('readonly calendar navigates months and selects an explicit date', async ({ page }) => {
  await setup(page, '<div class="ant-picker"><input id="date" readonly placeholder="YYYY-MM-DD"></div><div class="ant-picker-dropdown" hidden><div class="ant-picker-header-view"></div><button class="ant-picker-header-prev-btn">Previous</button><button class="ant-picker-header-next-btn">Next</button><div id="days"></div></div>');
  await page.evaluate(() => {
    let month = 6;
    const panel = document.querySelector('.ant-picker-dropdown');
    const input = document.querySelector('input');
    function render() {
      panel.querySelector('.ant-picker-header-view').textContent = `2024年 ${month}月`;
      panel.querySelector('#days').innerHTML = `<button title="2024-${String(month).padStart(2, '0')}-15">15</button>`;
      panel.querySelector('#days button').onclick = (event) => { input.value = event.target.title; panel.hidden = true; };
    }
    panel.querySelector('.ant-picker-header-prev-btn').onclick = () => { month--; render(); };
    panel.querySelector('.ant-picker-header-next-btn').onclick = () => { month++; render(); };
    input.onclick = () => { panel.hidden = false; render(); };
  });
  expect(await apply(page, '#date', '2024-04-15')).toEqual({ value: '2024-04-15' });
});

test('a no-op option click does not turn search text into success', async ({ page }) => {
  await setup(page, '<div class="ant-select"><input id="school" aria-controls="choices"></div><div id="choices" role="listbox" hidden><div role="option">University</div></div>');
  await page.evaluate(() => document.querySelector('input').parentElement.onclick = () => { document.querySelector('#choices').hidden = false; });
  expect(await apply(page, '#school', 'University')).toEqual({ error: 'option_not_found' });
  await expect(page.locator('#school')).toHaveValue('');
});
