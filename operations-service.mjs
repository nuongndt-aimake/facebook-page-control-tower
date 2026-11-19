import {db,readBody,send,assertMutableContext,canManageSalesInventory} from './api/_lib.mjs';
import {canOperate,isOperationsAdmin,operationScopes,summarizeReports} from './operations-policy.mjs';
const uuid=value=>/^[0-9a-f-]{36}$/i.test(String(value||''));
const shift=(date,days)=>new Date(new Date(date+'T12:00:00Z').getTime()+days*86400000).toISOString().slice(0,10);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const list=ids=>ids.map(encodeURIComponent).join(',');
function failure(response,error){const message=String(error.message||'');if(message==='Unauthorized')return send(response,401,{error:'Vui lòng đăng nhập'});if(message.includes('Forbidden')||message.includes('Chế độ xem trước'))return send(response,403,{error:'Tài khoản không có quyền thực hiện thao tác này'});
 const labels=[['Verified report is locked','Báo cáo đã duyệt không thể sửa trực tiếp'],['Page is not active Inhouse','Page chưa hoạt động hoặc đã hỏng; không nhận báo cáo mới'],['Payout identifier exists','Mã payout đã tồn tại. Hãy chọn đính kèm hồ sơ đã có.'],['Invalid report date','Ngày báo cáo phải từ ngày được phân công đến hôm nay'],['duplicate key','Dữ liệu đã tồn tại, vui lòng làm mới']];const found=labels.find(([key])=>message.includes(key));if(found)return send(response,409,{error:found[1]});if(/Invalid|22P02|2200|23514/.test(message))return send(response,400,{error:'Thông tin chưa hợp lệ. Kiểm tra ngày, số liệu và các trường bắt buộc.'});console.error('operations_failed',message.slice(0,140));return send(response,500,{error:'Không thể hoàn tất thao tác. Vui lòng thử lại.'})}
export async function operationsService(request,response,context,endpoint){
 try{
 const params=new URL(request.url,'http://localhost').searchParams,actor=context.user.id,admin=isOperationsAdmin(context);
 response.setHeader('Cache-Control','no-store');
 if(endpoint==='operations_permissions'){
  assertMutableContext(context);if(!admin)throw Error('Forbidden');if(request.method!=='POST')return send(response,405,{error:'Method not allowed'});
  const input=await readBody(request);if(!uuid(input.user_id))return send(response,400,{error:'Tài khoản không hợp lệ'});
  if(!Array.isArray(input.permissions))return send(response,400,{error:'Danh sách quyền không hợp lệ'});
  const grants=[...new Set(input.permissions)].filter(scope=>operationScopes.includes(scope)),rows=await db(`profiles?select=permissions&id=eq.${input.user_id}&limit=1`);if(!rows.length)return send(response,404,{error:'Không tìm thấy tài khoản'});
  await db(`profiles?id=eq.${input.user_id}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({permissions:{...rows[0].permissions,sales_operations:grants},updated_at:new Date().toISOString()})});
  await db('admin_audit_logs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_user_id:actor,action:'set_operations_permissions',target_type:'profile',target_id:input.user_id,details:{permissions:grants}})});return send(response,200,{ok:true});
 }
 if(request.method==='POST'){
  assertMutableContext(context);const input=await readBody(request);
  if(endpoint==='inhouse_assets'){
   if(input.action==='assign'){if(!canManageSalesInventory(context,'assign_inhouse'))throw Error('Forbidden');const result=await db('rpc/sales_inventory_command',{method:'POST',body:JSON.stringify({p_action:'assign_inhouse',p_actor:actor,p_input:input})});return send(response,200,result)}
   if(input.action==='save_payout'){if(!canOperate(context,'manage_payout'))throw Error('Forbidden');const result=await db('rpc/inhouse_payout_save',{method:'POST',body:JSON.stringify({p_actor:actor,p_input:input})});return send(response,200,result)}
   return send(response,400,{error:'Thao tác không hợp lệ'});
  }
  if(!['submit','verify','reject'].includes(input.action))return send(response,400,{error:'Thao tác không hợp lệ'});
  if(input.action!=='submit'&&!canOperate(context,'verify_reports'))throw Error('Forbidden');
  if(input.action==='submit'&&(!Number.isSafeInteger(Number(input.published_post_count))||Number(input.published_post_count)<0))return send(response,400,{error:'Số bài đăng phải là số nguyên không âm'});
  const result=await db('rpc/content_report_command',{method:'POST',body:JSON.stringify({p_action:input.action,p_actor:actor,p_input:input})});return send(response,200,result);
 }
 if(request.method!=='GET')return send(response,405,{error:'Method not allowed'});
 if(endpoint==='inhouse_assets'){
  const global=admin||canManageSalesInventory(context,'read')||canManageSalesInventory(context,'assign_inhouse')||canOperate(context,'manage_payout');
  const warehouse=await db(`inhouse_page_inventory?select=inventory_item_id,page_id,status,transferred_at${global?'':`&page_id=in.(${list(context.pageIds?.length?context.pageIds:['__none__'])})`}&limit=5000`);
  const ids=warehouse.map(row=>row.page_id),query=ids.length?`&id=in.(${list(ids)})`:'&id=eq.__none__';
  const [pages,assignments,links]=await Promise.all([db('pages?select=id,name,current_status'+query+'&order=name.asc&limit=5000'),db(`page_assignments?select=id,page_id,user_id,assignment_role,status&status=eq.active&page_id=in.(${list(ids.length?ids:['__none__'])})&limit=10000`),db(`page_payment_profiles?select=page_id,payment_profile_id&page_id=in.(${list(ids.length?ids:['__none__'])})&limit=10000`)]);
  const manage=canOperate(context,'manage_payout'),allowedPayouts=manage?null:new Set(context.paymentProfileIds||[]),payoutIds=[...new Set(links.map(row=>row.payment_profile_id))].filter(id=>manage||allowedPayouts?.has(id));
  const payouts=manage?await db('payment_profiles?select=id,external_id,profile_name,recipient_name,recipient_account,currency,status,source&order=profile_name.asc&limit=5000'):payoutIds.length?await db(`payment_profiles?select=id,external_id,profile_name,recipient_name,recipient_account,currency,status,source&id=in.(${list(payoutIds)})`):[];
  const userIds=[...new Set(assignments.map(row=>row.user_id).filter(Boolean))],canAssign=canManageSalesInventory(context,'assign_inhouse');
  const users=canAssign?await db('profiles?select=id,display_name,role&status=eq.active&limit=5000'):userIds.length?await db(`profiles?select=id,display_name&id=in.(${list(userIds)})`):[];
  return send(response,200,{pages,warehouse,assignments,users,links:links.filter(row=>payouts.some(p=>p.id===row.payment_profile_id)),payouts,permissions:{assign:canAssign,manage_payout:manage}});
 }
 const day=params.get('day')||shift(today(),-1),start=params.get('start')||shift(day,-6),end=params.get('end')||day;
 if(![day,start,end].every(v=>/^\d{4}-\d{2}-\d{2}$/.test(v))||start>end||end>today())return send(response,400,{error:'Khoảng ngày không hợp lệ'});
 const all=canOperate(context,'read_reports_all'),visible=[...new Set([actor,...context.visibleUserIds||[]])],scope=all?'':`&user_id=in.(${list(visible)})`;
 const [assignments,warehouse,reports,users,lines]=await Promise.all([
  db(`page_assignments?select=id,page_id,user_id,assignment_role,status,assigned_at${scope}&limit=10000`),db('inhouse_page_inventory?select=page_id,status&limit=10000'),
  db(`content_assignment_daily_reports?select=*&report_date=gte.${start}&report_date=lte.${end}${all?'':`&reporter_user_id=in.(${list(visible)})`}&order=report_date.desc,submitted_at.desc&limit=10000`),
  db(`profiles?select=id,display_name,role${all?'':`&id=in.(${list(visible)})`}&limit=10000`),db(`user_reporting_lines?select=employee_user_id,manager_user_id&status=eq.active&manager_user_id=eq.${actor}`)
 ]);
 const allowedPageIds=[...new Set([...assignments.map(r=>r.page_id),...reports.map(r=>r.page_id)])];const pages=allowedPageIds.length?await db(`pages?select=id,name&id=in.(${list(allowedPageIds)})&limit=10000`):[];
 if(reports.length>=10000)return send(response,400,{error:'Kỳ báo cáo quá lớn. Vui lòng chọn khoảng ngày ngắn hơn.'});
 const active=assignments.filter(a=>a.user_id&&a.status==='active'&&warehouse.some(h=>h.page_id===a.page_id&&h.status==='active'));
 const localDay=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 const missing=active.filter(a=>localDay(a.assigned_at)<=day&&!reports.some(r=>r.assignment_id===a.id&&r.report_date===day&&r.status!=='rejected'));
 const result={day,start,end,today:today(),assignments:active.filter(a=>a.user_id===actor),missing,users:users.map(user=>({...user,relationship:user.id===actor?'own':lines.some(line=>line.employee_user_id===user.id)?'direct':all?'authorized':'inherited'})),pages,reports,summary:summarizeReports(reports),permissions:{verify:canOperate(context,'verify_reports'),read_all:all}};
 if(params.get('report_id')){const report=reports.find(row=>row.id===params.get('report_id'));if(!report)throw Error('Forbidden');result.revisions=await db(`content_report_revisions?select=action,previous_data,new_data,created_at&report_id=eq.${report.id}&order=created_at.desc&limit=100`)}
 return send(response,200,result);
 }catch(error){return failure(response,error)}
}
