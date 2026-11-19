import test from 'node:test';import assert from 'node:assert/strict';import handler from './api/admin/access.mjs';
test('order API filters foreign invoices and forbids buyer writes; delegated staff reads all',async()=>{
 const oldFetch=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://access-test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-only'});
 const uid='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';let permissions={},role='viewer';
 const orders=[{id:'11111111-1111-1111-1111-111111111111',buyer_user_id:uid,payment_status:'pending_payment',gift_download_url:'https://example.com/not-paid'},{id:'22222222-2222-2222-2222-222222222222',buyer_user_id:'other',payment_status:'pending_payment'}];
 global.fetch=async(url)=>{const u=new URL(url),table=u.pathname.split('/').pop();let data=[];
 if(table==='user')data={id:uid,email:'buyer@example.com'};
 else if(table==='profiles')data=[{id:uid,role,status:'active',permissions}];
 else if(table==='sales_orders')data=orders;
 else if(table==='sales_invoice_records')data=orders.map(x=>({order_id:x.id,invoice_type:'daily_aggregate',invoice_status:'pending_payment'}));
 return new Response(JSON.stringify(data),{status:200})};
 const call=async(method='GET',auth=true)=>{let status,body;await handler({url:'/?endpoint=sales-orders',method,headers:auth?{authorization:'Bearer test-user'}:{},body:{action:'set_payment_status',order_id:orders[0].id,payment_status:'paid'}},{status(n){status=n;return this},json(x){body=x}});return {status,body}};
 try{const own=await call();assert.equal(own.status,200);assert.equal(own.body.orders.length,1);assert.equal(own.body.invoice_records.length,1);assert.equal(own.body.orders[0].gift_download_url,undefined);assert.equal(own.body.invoice_aggregate_groups.length,0);assert.equal((await call('POST')).status,403);assert.equal((await call('GET',false)).status,401);
 role='operator';permissions={sales_orders:['read_all']};const all=await call();assert.equal(all.body.orders.length,2);assert.equal(all.body.access.read_all,true);assert.equal(all.body.access.manage,false);assert.equal((await call('POST')).status,403);
 }finally{global.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
});
