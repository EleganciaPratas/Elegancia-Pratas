import test from 'node:test';
import assert from 'node:assert/strict';
import {readSets,fieldValue} from '../app/security/read-only-catalog.ts';
test('all management sections have explicit read datasets without credential or Auth tables',()=>{
 const routes=['/admin','/admin/joias','/admin/colecoes','/admin/colecoes/campanhas','/admin/estoque','/admin/precificacao','/admin/catalogo','/admin/financeiro','/admin/financeiro/cadastros','/admin/integracoes','/admin/integracoes/frete'];
 for(const route of routes){const sets=readSets(route);assert.ok(sets.length);for(const set of sets){assert.ok(set.columns.length);assert.doesNotMatch(set.table,/oauth|admin_users|management_readers|auth/);assert.doesNotMatch(set.fields,/access_token|refresh_token|password|secret/)}}
});
test('read-only fields preserve cents, percentages and joined names as source values',()=>{
 const row={approved_price_cents:11599,estimated_margin_bps:3340,products:{name:'Joia'},jewelry_intake:[{identification_image_path:'private.webp'}]};
 assert.equal(fieldValue(row,'approved_price_cents'),11599);
 assert.equal(fieldValue(row,'products.name'),'Joia');
 assert.deepEqual(fieldValue(row,'jewelry_intake.identification_image_path'),['private.webp']);
 assert.equal(fieldValue(row,'absent'),undefined);
});
test('financial datasets keep received sales, cash entries and closed payouts separate',()=>{
 const sets=readSets('/admin/financeiro');
 assert.equal(sets.find(s=>s.key==='vendas')?.table,'finance_sales');
 assert.equal(sets.find(s=>s.key==='movimentos')?.table,'finance_entries');
 assert.equal(sets.find(s=>s.key==='repasses')?.monthField,'month');
 assert.ok(sets.find(s=>s.key==='socios')?.fields.includes('share_bps'));
});
