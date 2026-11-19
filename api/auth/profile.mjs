import { accessContext, assertMutableContext, db, readBody, send } from "../_lib.mjs";
import {validateProfileContacts} from '../../profile-contact-policy.mjs';
export default async function handler(request, response) {
  try { const context=await accessContext(request);response.setHeader('Cache-Control','no-store');
    if(request.method==='GET'){if(new URL(request.url||'/','http://localhost').searchParams.get('include')==='account_assets')context.account_assets=await db('rpc/operations_account_assets',{method:'POST',body:JSON.stringify({p_actor:context.user.id})});return send(response,200,context)}
    if(request.method!=='PATCH')return send(response,405,{error:'Method not allowed'});
    assertMutableContext(context);let input;try{input=validateProfileContacts(await readBody(request))}catch(error){return send(response,400,{error:error.message})}
    const result=await db('rpc/profile_contacts_save',{method:'POST',body:JSON.stringify({p_actor:context.user.id,p_input:input})});return send(response,200,result);
  }
  catch (error) {const message=String(error.message||'');return send(response,message==='Unauthorized'?401:/Forbidden|Chế độ xem trước/.test(message)?403:500,{error:/Unauthorized|Forbidden|Chế độ xem trước/.test(message)?'Không có quyền cập nhật hồ sơ trong phiên này':'Không thể tải hoặc cập nhật hồ sơ. Vui lòng thử lại.'}); }
}
