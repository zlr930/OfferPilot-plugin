import {test,expect} from '@playwright/test';
import path from 'node:path';
test('Meituan labels, selected values and separate experience forms stay aligned',async({page})=>{
  await page.setContent(`<div class="resume_detail_edit"><div class="project_experience_edit model_edit"><div class="model_title">项目经历</div>
  <div class="model_list"><div class="mtd-form modal_form"><div class="mtd-form-item"><div class="mtd-form-item-label"></div><div class="mtd-form-item-body"><div class="label">项目角色</div><div class="mtd-select"><div class="mtd-select-filter"><input id="first"><span class="mtd-select-filter-label">开发者</span></div></div></div></div></div></div>
  <div class="model_list"><div class="mtd-form modal_form"><div class="mtd-form-item"><div class="label">项目角色</div><input id="second"></div></div></div></div></div>`);
  for(const file of ['control-adapters.js','form-engine.js']) await page.addScriptTag({path:path.resolve('extension',file)});
  expect(await page.evaluate(()=>{const e=window.__OFFERPILOT_FORM__,a=document.querySelector('#first'),b=document.querySelector('#second');return {platform:e.platform().id,label:e.label(a),value:e.read([a]),different:e.group(a)!==e.group(b),heading:e.heading(a)};})).toEqual({platform:'meituan',label:'项目角色',value:'开发者',different:true,heading:'项目经历'});
  expect(await page.evaluate(async()=>{const e=window.__OFFERPILOT_FORM__;try{await e.apply(e.snapshot([document.querySelector('#first')]),'其他');}catch(error){return error.message;}})).toBe('value_changed');
});

test('Meituan publication placeholders are empty while actual venue remains protected',async({page})=>{
  await page.setContent('<div class="resume_detail_edit"><div class="model_edit"><div class="model_title">论文</div><div class="mtd-form modal_form"><div class="mtd-form-item"><div class="label">发表渠道*</div><div class="mtd-select"><input id="first"><span class="mtd-select-filter-label">IEEE VIS</span></div></div></div><div class="mtd-form modal_form"><div class="mtd-form-item"><div class="label">发表渠道*</div><div class="mtd-select"><input id="second"><span class="mtd-select-filter-label">请选择</span></div></div></div></div></div>');
  for(const file of ['control-adapters.js','form-engine.js'])await page.addScriptTag({path:path.resolve('extension',file)});
  expect(await page.evaluate(()=>{const e=window.__OFFERPILOT_FORM__;return [e.read([document.querySelector('#first')]),e.read([document.querySelector('#second')]),e.heading(document.querySelector('#second'))];})).toEqual(['IEEE VIS','','论文']);
});
test('Meituan readonly month picker retains slash format without inventing a day',async({page})=>{
  await page.setContent('<div class="resume_detail_edit"><div class="mtd-form"><div class="mtd-date-picker"><input id="date" readonly placeholder="入学时间"></div></div></div><div class="mtd-datepicker-pop" hidden><span class="mtd-month-calendar-year-btn">2024年</span></div>');
  await page.evaluate(()=>{
    const popup=document.querySelector('.mtd-datepicker-pop'),input=document.querySelector('input');
    input.onclick=()=>{popup.hidden=false;};
    popup.firstChild.onclick=()=>{popup.innerHTML='<div class="mtd-year-panel-list-data">2020</div>';popup.firstChild.onclick=()=>{popup.innerHTML='<div class="mtd-month-panel-list-data">9月</div>';popup.firstChild.onclick=()=>{input.value='2020/09';popup.hidden=true;};};};
  });
  for(const file of ['control-adapters.js','form-engine.js']) await page.addScriptTag({path:path.resolve('extension',file)});
  expect(await page.evaluate(async()=>{const e=window.__OFFERPILOT_FORM__;return (await e.apply(e.snapshot([document.querySelector('input')]),'2020-09')).value;})).toBe('2020/09');
});
