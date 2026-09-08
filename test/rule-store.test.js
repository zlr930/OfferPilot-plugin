import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRules,ruleScope,RULE_TTL} from '../extension/rule-store.js';
test('rules are isolated by the browser sender origin',()=>{
  assert.equal(ruleScope({url:'https://jobs.example.com/apply/1'}),'formRules:https://jobs.example.com');
  assert.equal(ruleScope({url:'file:///tmp/test'}),null);
  assert.equal(ruleScope({}),null);
});
test('rules reject broad selectors, stale entries and future timestamps',()=>{
  const now=RULE_TTL+100;
  const rule={key:'field',selector:'#school-popup',updatedAt:now};
  assert.deepEqual(normalizeRules([rule,{...rule,key:'bad',selector:'body, input'},{...rule,key:'old',updatedAt:0},{...rule,key:'future',updatedAt:now+1}],now),[rule]);
});
