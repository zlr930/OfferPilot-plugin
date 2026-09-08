import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePublication } from '../extension/publication-model.js';

test('trailing et al does not obscure a second author; Conference identifies conference paper',()=>{
  const result=normalizePublication({venue:'IEEE Global Blockchain Conference (GBC)',authors:'Sun, S.; Ran, X. ; et al.',applicantAuthor:'Ran, X.',authorOrder:'',publicationType:'论文'});
  assert.equal(result.authorOrder,'二作');
  assert.equal(result.publicationType,'会议论文');
});
test('omitted preceding authors do not establish ordinal and unknown identity stays unknown',()=>{
  assert.equal(normalizePublication({authors:'Ju, C.; et al.; Ran, X.; et al.',applicantAuthor:'Ran, X.',authorOrder:''}).authorOrder,'');
  assert.equal(normalizePublication({authors:'Sun, S.; Ran, X.; et al.',applicantAuthor:'',authorOrder:''}).authorOrder,'');
});
test('journal classification is distinct from venue and equal contribution is preserved',()=>{
  const result=normalizePublication({venue:'Journal of Example Research',authors:'Sun, S.; Ran, X.; et al.',applicantAuthor:'Ran, X.',authorOrder:'共同一作',publicationType:''});
  assert.equal(result.publicationType,'期刊论文');
  assert.equal(result.authorOrder,'共同一作');
  assert.equal(result.venue,'Journal of Example Research');
});
