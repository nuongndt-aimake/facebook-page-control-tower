import test from 'node:test';import assert from 'node:assert/strict';import {operationsService} from './operations-service.mjs';
test('operations API enforces delegated permissions, preview read-only and report visibility query',async()=>{
 const previous=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://operations.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-only'});
 const actor='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',context={user:{id:actor},profile:{role:'manager',permissions:{}},pageIds:[],visibleUserIds:[actor],paymentProfileIds:[]};let writes=[],queries=[];
 global.fetch=async(url,options={})=>{const u=new URL(url),name=u.pathname.split('/').pop();queries.push(u);if(options.method==='POST'){writes.push(JSON.parse(options.body));return new Response('{"ok":true}',{status:200})}return new Response('[]',{status:200})};
 const call=async(endpoint,body)=>{let status,payload;await operationsService({url:'/?day=2026-11-18&start=2026-11-18&end=2026-11-18',method:body?'POST':'GET',body},{setHeader(){},status(n){status=n;return this},json(v){payload=v}},context,endpoint);return {status,payload}};
 try{
  assert.equal((await call('inhouse_assets',{action:'save_payout'})).status,403);assert.equal((await call('content_reports',{action:'verify'})).status,403);assert.equal((await call('operations_permissions',{user_id:actor,permissions:['read_reports_all']})).status,403);assert.equal(writes.length,0);
  context.profile.permissions={sales_operations:['manage_payout']};assert.equal((await call('inhouse_assets',{action:'save_payout',p_actor:'forged'})).status,200);assert.equal(writes[0].p_actor,actor);
  context.preview={};assert.equal((await call('inhouse_assets',{action:'save_payout'})).status,403);delete context.preview;
  assert.equal((await call('content_reports')).status,200);assert.ok(queries.find(q=>q.pathname.endsWith('/content_assignment_daily_reports')).searchParams.get('reporter_user_id').includes(actor));
  queries=[];assert.equal((await call('inhouse_assets')).status,200);assert.ok(!queries.some(q=>/businesses|meta_connections|sync_runs/.test(q.pathname)));
 }finally{global.fetch=previous;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
});
