import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

let reactBundle, vueBundle;
test.beforeAll(async () => {
  const compile = async (contents) => (await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text;
  reactBundle = await compile(`
    import React from 'react'; import {createRoot} from 'react-dom/client'; import {Select,DatePicker,Input,Form} from 'antd';
    function App(){const [values,setValues]=React.useState({}); window.model=values; const update=(key,value)=>setValues(old=>({...old,[key]:value}));
      return <Form><Form.Item label="School"><Select id="school" showSearch value={values.school} onChange={v=>update('school',v)} options={[{value:'uni-123',label:'Example University'}]}/></Form.Item>
      <Form.Item label="Skills"><Select id="skills" mode="multiple" value={values.skills} onChange={v=>update('skills',v)} options={[{value:'go',label:'Go'},{value:'java',label:'Java'}]}/></Form.Item>
      <Form.Item label="Name"><Input id="name" value={values.name||''} onChange={e=>update('name',e.target.value)}/></Form.Item>
      <Form.Item label="Date"><DatePicker id="date" value={values.date} onChange={v=>update('date',v)}/></Form.Item>
      <Form.Item label="Period"><DatePicker.RangePicker id={{start:'start',end:'end'}} value={values.period} onChange={v=>update('period',v)}/></Form.Item></Form>}
    createRoot(document.getElementById('app')).render(<App/>);
  `);
  vueBundle = await compile(`
    import {createApp,h,reactive} from 'vue'; import {ElSelect,ElOption,ElInput,ElDatePicker,ElForm,ElFormItem} from 'element-plus';
    const state=reactive({}); window.model=state;
    createApp({render(){return h(ElForm,{},()=>[
      h(ElFormItem,{label:'School'},()=>h(ElSelect,{id:'school',filterable:true,modelValue:state.school,'onUpdate:modelValue':v=>state.school=v},()=>h(ElOption,{value:'uni-123',label:'Example University'}))),
      h(ElFormItem,{label:'Skills'},()=>h(ElSelect,{id:'skills',multiple:true,modelValue:state.skills||[],'onUpdate:modelValue':v=>state.skills=v},()=>[h(ElOption,{value:'go',label:'Go'}),h(ElOption,{value:'java',label:'Java'})])),
      h(ElFormItem,{label:'Name'},()=>h(ElInput,{id:'name',modelValue:state.name||'','onUpdate:modelValue':v=>state.name=v})),
      h(ElFormItem,{label:'Date'},()=>h(ElDatePicker,{id:'date',type:'date',valueFormat:'YYYY-MM-DD',modelValue:state.date,'onUpdate:modelValue':v=>state.date=v})),
      h(ElFormItem,{label:'Period'},()=>h(ElDatePicker,{id:['start','end'],type:'daterange',valueFormat:'YYYY-MM-DD',modelValue:state.period,'onUpdate:modelValue':v=>state.period=v}))]);}}).mount('#app');
  `);
});

async function setup(page, family) {
  await page.setContent('<div id="app" style="padding:30px;width:600px"></div>');
  if (family === 'element') await page.addStyleTag({ content: await readFile('node_modules/element-plus/dist/index.css', 'utf8') });
  await page.addScriptTag({ content: family === 'ant' ? reactBundle : vueBundle });
  await page.locator('#school').waitFor();
  for (const file of ['control-adapters.js','form-engine.js']) await page.addScriptTag({path:path.resolve('extension',file)});
}
async function fill(page,id,value){return page.evaluate(async ({id,value})=>{
  const engine=window.__OFFERPILOT_FORM__; try{return {value:(await engine.apply(engine.snapshot([document.getElementById(id)]),value)).value};}catch(error){return {error:error.message};}
},{id,value});}

for(const family of ['ant','element']) {
  test(`${family} scanner exposes visible selectable wrappers and ignores placeholders`,async({page})=>{
    await setup(page,family);
    const scanned=await page.evaluate(()=>{
      const engine=window.__OFFERPILOT_FORM__;
      return engine.candidates().filter(e=>['combobox','cascader'].includes(engine.kind(e))).map(e=>({type:engine.kind(e),value:engine.read([e]),multiple:engine.multiple(e)}));
    });
    expect(scanned).toHaveLength(2);
    expect(scanned.every(field=>field.value==='')).toBe(true);
    expect(scanned.filter(field=>field.multiple)).toHaveLength(1);
  });
  test(`${family} actual date commits the requested date to framework state`,async({page})=>{
    await setup(page,family);
    expect(await fill(page,'date','2024-03-15')).toEqual({value:'2024-03-15'});
    expect(await page.evaluate(()=>typeof window.model.date === 'string' ? window.model.date : window.model.date?.format('YYYY-MM-DD'))).toBe('2024-03-15');
  });
  test(`${family} actual range commits both endpoints to framework state`,async({page})=>{
    await setup(page,family);
    expect(await fill(page,'start','2020-01-01 / 2024-01-01')).toEqual({value:'2020-01-01 / 2024-01-01'});
    expect(await page.evaluate(()=>window.model.period?.map(v=>typeof v === 'string' ? v : v.format('YYYY-MM-DD')))).toEqual(['2020-01-01','2024-01-01']);
  });
  test(`${family} actual component commits school ID to framework state`,async({page})=>{
    await setup(page,family);
    expect(await fill(page,'school','Example University')).toEqual({value:'Example University'});
    expect(await page.evaluate(()=>window.model.school)).toBe('uni-123');
  });
  test(`${family} actual multi-select commits both IDs to framework state`,async({page})=>{
    await setup(page,family);
    expect(await fill(page,'skills','Go,Java')).toEqual({value:'Go,Java'});
    expect(await page.evaluate(()=>[...window.model.skills].sort())).toEqual(['go','java']);
  });
  test(`${family} actual controlled text persists in framework state`,async({page})=>{
    await setup(page,family);
    expect(await fill(page,'name','Candidate')).toEqual({value:'Candidate'});
    expect(await page.evaluate(()=>window.model.name)).toBe('Candidate');
  });
}
