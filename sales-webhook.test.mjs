import test from 'node:test';import assert from 'node:assert/strict';import handler from './api/admin/access.mjs';
test('webhook delegates concurrent events to atomic RPC; auth and replay',async()=>{
 const oldFetch=global.fetch,env={...process.env};Object.assign(process.env,{SUPABASE_URL:'https://webhook-test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test-only',SEPAY_WEBHOOK_API_KEY:'test-webhook'});
 let paid=false,writes=0;const events=new Set();
 global.fetch=async(url,opt)=>{assert.ok(url.endsWith('/rpc/sales_process_payment_event'));assert.equal(opt.method,'POST');const p=JSON.parse(opt.body);let result;
   if(events.has(p.p_provider_event_id))result={success:true,duplicate:true,processing_status:'duplicate'};
   else{events.add(p.p_provider_event_id);const status=p.p_transfer_type!=='in'?'rejected':paid?'duplicate':p.p_amount!==2850000?'amount_mismatch':'processed';if(status==='processed'){paid=true;writes++}result={success:true,duplicate:status==='duplicate',processing_status:status}}
   return new Response(JSON.stringify(result),{status:200});};
 const call=async(id,amount=2850000,key='test-webhook',type='in')=>{let status,payload;await handler({url:'/?endpoint=sepay-webhook',method:'POST',headers:{authorization:'Apikey '+key},body:{id,transferAmount:amount,transferType:type,content:'PAY FS1234567890'}},{status(n){status=n;return this},json(x){payload=x}});return {status,payload}};
 try{
   assert.equal((await call('bad',2850000,'wrong')).status,401);assert.equal(events.size,0);
   const same=await Promise.all(Array.from({length:20},()=>call('same-event')));assert.equal(same.filter(x=>x.payload.processing_status==='processed').length,1);assert.equal(same.filter(x=>x.payload.duplicate).length,19);assert.equal(writes,1);
   const distinct=await Promise.all(Array.from({length:20},(_,i)=>call('new-'+i)));assert.ok(distinct.every(x=>x.payload.duplicate));assert.equal(writes,1);
   await call('out',1,'test-webhook','out');assert.equal(paid,true);
   assert.equal((await call('nan','not-a-number')).status,400);
 }finally{global.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
});
