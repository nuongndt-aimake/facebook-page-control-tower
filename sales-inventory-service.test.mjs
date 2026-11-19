import test from 'node:test';import assert from 'node:assert/strict';
import {inventoryService} from './sales-inventory-service.mjs';
test('inventory RBAC denies ungranted roles, preview writes and foreign orders; commands use actor context',async()=>{
 const previousFetch=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://inventory-test.invalid',SUPABASE_SERVICE_ROLE_KEY:'unit-only'});
 const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',order='11111111-1111-1111-1111-111111111111';let writes=[],assigned=false,fail=false;
 global.fetch=async(url,opt={})=>{const table=new URL(url).pathname.split('/').pop();let rows=[];
  if(opt.method==='POST'){writes.push(JSON.parse(opt.body));if(fail)return new Response(JSON.stringify({code:'23505',message:'duplicate key violates unique constraint'}),{status:409});rows={ok:true}}
  else if(table==='sales_orders')rows=[{id:order,order_code:'FS1234567890',product_id:order}];
  else if(table==='sales_order_assignments')rows=assigned?[{assignee_user_id:uid}]:[];
  return new Response(JSON.stringify(rows),{status:200})};
 const context={user:{id:uid},profile:{role:'manager',permissions:{}}};
 const call=async(method='POST',body={action:'intake'},endpoint='sales_inventory')=>{let status,payload;await inventoryService({url:'/?order_id='+order,method,body},{setHeader(){},status(n){status=n;return this},json(value){payload=value}},context,endpoint);return {status,payload}};
 try{
  assert.equal((await call()).status,403);assert.equal(writes.length,0);
  context.profile.permissions={sales_inventory:['read','intake']};
  assert.equal((await call('POST',{action:'finalize',order_id:order})).status,403);
  assert.equal((await call('GET',null,'sales_fulfillment')).status,403,'ownership or read scope alone cannot operate foreign orders');
  assigned=true;assert.equal((await call('GET',null,'sales_fulfillment')).status,200);
  context.preview={};assert.equal((await call()).status,403);delete context.preview;
  assert.equal((await call('POST',{action:'intake',p_actor:'forged',purchase_cost_vnd:-1})).status,400);assert.equal(writes.length,0);
  assert.equal((await call('POST',{action:'intake',p_actor:'forged',purchase_cost_vnd:1000})).status,201);assert.equal(writes[0].p_actor,uid);
  fail=true;assert.equal((await call()).status,409);
 }finally{global.fetch=previousFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
});
