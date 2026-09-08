import test from 'node:test';
import assert from 'node:assert/strict';
import { runResumeTask } from '../extension/resume-task.js';

test('document parse completes without a runtime message channel and forwards progress', async () => {
  const progress = [];
  let complete;
  const pending = new Promise(resolve => { complete = resolve; });
  const result = runResumeTask({text:'resume'}, {apiKey:'test'}, event=>progress.push(event), {
    fetchImpl: async () => new Response('STAR rules'),
    parse: async (request, config, fetchImpl, onProgress) => {
      assert.equal(request.experienceSkill,'STAR rules');
      assert.equal(config.apiKey,'test');
      onProgress({percent:50});
      await pending;
      onProgress({percent:90});
      return {profile:{},summary:'done'};
    },
  });
  complete();
  assert.equal((await result).summary,'done');
  assert.deepEqual(progress,[{percent:50},{percent:90}]);
});

test('parse preserves provider timeout errors and rejects missing bundled skill', async()=>{
  await assert.rejects(runResumeTask({}, {}, ()=>{}, {fetchImpl:async()=>new Response('',{status:404})}),/内置简历处理规则/);
  await assert.rejects(runResumeTask({}, {}, ()=>{}, {fetchImpl:async()=>new Response('rules'),parse:async()=>{throw new Error('请求超时');}}),/请求超时/);
});
