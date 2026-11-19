import {db,readBody,send,assertMutableContext} from './api/_lib.mjs';
import {normalizeSheetUrl,normalizeResourceKinds} from './page-resource-policy.mjs';
export async function pageResourceService(request,response,context){
 response.setHeader('Cache-Control','no-store');
 try{const params=new URL(request.url,'http://localhost').searchParams;let action,input;
  if(request.method==='GET'){input={page_id:params.get('page_id')};action=input.page_id?'get':'list'}
  else if(request.method==='POST'){assertMutableContext(context);input=await readBody(request);action=input.action;if(!['configure','grant'].includes(action))return send(response,400,{error:'Thao tác không hợp lệ'});if(action==='configure'){if(!input.sources||Array.isArray(input.sources)||Object.keys(input.sources).some(k=>!['image','video'].includes(k)))throw Error('Invalid sources');input.sources=Object.fromEntries(Object.entries(input.sources).map(([k,v])=>[k,normalizeSheetUrl(v)]))}else input.resource_kinds=normalizeResourceKinds(input.resource_kinds)}
  else return send(response,405,{error:'Method not allowed'});
  const result=await db('rpc/page_resource_command',{method:'POST',body:JSON.stringify({p_action:action,p_actor:context.user.id,p_input:input})});return send(response,200,result);
 }catch(error){if(String(error.message).includes('Forbidden')||String(error.message).includes('Chế độ xem trước'))return send(response,403,{error:'Bạn không được cấp quyền cho kho tài nguyên này'});return send(response,400,{error:'Không thể thực hiện. Kiểm tra liên kết Google Sheet, phân công và loại kho.'})}
}
