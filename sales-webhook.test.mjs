import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './api/admin/access.mjs';
test('webhook: authentication, exact amount, replay and invoice transition with isolated fake storage',async()=>{
  const oldFetch=global.fetch, env={...process.env};
  process.env.SUPABASE_URL='https://unit-test.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='unit-test-only';process.env.SEPAY_WEBHOOK_API_KEY='unit-webhook-only';
  const events=[],order={id:'order-test',expected_amount_vnd:2850000,payment_status:'pending_payment',payment_expires_at:new Date(Date.now()+60000).toISOString()},invoice={id:'invoice-test',invoice_type:'daily_aggregate',invoice_status:'pending_payment'};
  global.fetch=async(url,opt={})=>{const parsed=new URL(url),table=parsed.pathname.split('/').pop(),method=opt.method||'GET';let result=[];
    if(table==='sales_payment_events'){if(method==='POST')events.push(JSON.parse(opt.body));else result=events.filter(x=>x.provider_event_id===parsed.searchParams.get('provider_event_id')?.slice(3)).map(x=>({id:x.provider_event_id}))}
    else if(table==='sales_orders'){if(method==='PATCH')Object.assign(order,JSON.parse(opt.body));else result=[order]}
    else if(table==='sales_invoice_records'){if(method==='PATCH')Object.assign(invoice,JSON.parse(opt.body));else result=[invoice]}
    else throw Error('Unexpected network call '+url);
    return new Response(JSON.stringify(result),{status:200});};
  const call=async(body,key='unit-webhook-only')=>{let status,payload;await handler({url:'/?endpoint=sepay-webhook',method:'POST',headers:{authorization:'Apikey '+key},body},{status(value){status=value;return this},json(value){payload=value}});return {status,payload}};
  try{
    assert.equal((await call({id:'bad-auth'},'wrong')).status,401);assert.equal(events.length,0);
    const good=await call({id:'event-good',transferType:'in',transferAmount:2850000,code:'FS1234567890'});assert.equal(good.status,200);assert.equal(order.payment_status,'paid');assert.equal(invoice.invoice_status,'aggregate_pending');
    assert.equal((await call({id:'event-good',transferType:'in',transferAmount:2850000,code:'FS1234567890'})).payload.duplicate,true);assert.equal(events.length,1);
    order.payment_status='pending_payment';invoice.invoice_status='pending_payment';
    assert.equal((await call({id:'event-short',transferType:'in',transferAmount:1000,code:'FS1234567890'})).payload.processing_status,'amount_mismatch');assert.equal(order.payment_status,'reconciliation_required');assert.equal(invoice.invoice_status,'pending_payment');
  }finally{global.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];Object.assign(process.env,env)}
});
