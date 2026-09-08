import {test,expect} from '@playwright/test';
import path from 'node:path';
async function load(page,opens){
  await page.setContent('<main><button id="edit">编辑简历</button><div id="view">工作/实习经历</div></main>');
  await page.evaluate(opens=>{
    window.editClicks=0;window.inventoryCalls=0;window.matchCalls=0;
    document.querySelector('#edit').onclick=()=>{
      window.editClicks++;
      if(opens)setTimeout(()=>{document.querySelector('main').innerHTML='<form><label for="company">公司名称</label><input id="company"></form>';},180);
    };
    window.chrome={runtime:{getURL:()=>'',onMessage:{addListener(){}},async sendMessage(message){
      if(message.type==='offerpilot:get-profile')return {ok:true,data:{profile:{basic:{fullName:'Test'}}}};
      if(message.type==='offerpilot:inventory-page'){window.inventoryCalls++;return {ok:true,data:{summary:'inventory'}};}
      if(message.type==='offerpilot:match'){window.matchCalls++;return {ok:true,data:{matches:[],actions:[],summary:'matched'}};}
      return {ok:true,data:[]};
    }}};
  },opens);
  for(const file of ['control-adapters.js','form-engine.js','content.js'])await page.addScriptTag({path:path.resolve('extension',file)});
}
test('view mode automatically opens global editor and confirms fields before matching',async({page})=>{
  await load(page,true);
  await page.getByRole('button',{name:'分析当前页面',exact:true}).click();
  await expect(page.locator('#company')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.matchCalls)).toBe(1);
  expect(await page.evaluate(()=>[window.editClicks,window.inventoryCalls])).toEqual([1,0]);
  expect(await page.locator('.agent-trace').textContent()).toContain('编辑态已确认');
});
test('no-op editor stops and is not clicked again or sent to inventory',async({page})=>{
  await load(page,false);
  await page.getByRole('button',{name:'分析当前页面',exact:true}).click();
  await expect(page.locator('.agent-status')).toContainText('没有出现新的编辑字段',{timeout:12000});
  await page.getByRole('button',{name:'重试',exact:true}).click();
  await expect(page.locator('.agent-status')).toContainText('未进入编辑态');
  expect(await page.evaluate(()=>[window.editClicks,window.inventoryCalls,window.matchCalls])).toEqual([1,0,0]);
});
