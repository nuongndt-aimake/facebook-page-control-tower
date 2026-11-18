import { db, readBody, requirePlatformAdmin, send } from "../_lib.mjs";
const states=new Set(["pending_payment","paid","reconciliation_required","expired","cancelled","refunded"]);
export default async function handler(request,response){
 try{
  const context=await requirePlatformAdmin(request);
  if(request.method==="GET"){
   const [products,orders,assignments]=await Promise.all([
    db("sales_products?select=*&order=created_at.desc"),
    db("sales_orders?select=*,product:sales_products(id,sku,name,product_type)&order=created_at.desc&limit=500"),
    db("sales_order_assignments?select=*")
   ]);
   return send(response,200,{products,orders,assignments});
  }
  if(request.method!=="POST")return send(response,405,{error:"Method not allowed"});
  const input=await readBody(request);
  if(input.action==="assign_order"){
   if(!input.order_id||!input.assignee_user_id)return send(response,400,{error:"order_id và assignee_user_id là bắt buộc"});
   const assignees=await db(`profiles?select=id,status&id=eq.${encodeURIComponent(input.assignee_user_id)}&limit=1`);
   if(!assignees[0]||assignees[0].status!=="active")return send(response,400,{error:"Người nhận đơn không hoạt động hoặc không tồn tại"});
   if(input.manager_user_id){const managers=await db(`profiles?select=id,status&id=eq.${encodeURIComponent(input.manager_user_id)}&limit=1`);if(!managers[0]||managers[0].status!=="active")return send(response,400,{error:"Quản lý nhận bàn giao không hoạt động hoặc không tồn tại"});}
   const rows=await db("sales_order_assignments?on_conflict=order_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify({order_id:input.order_id,assignee_user_id:input.assignee_user_id,manager_user_id:input.manager_user_id||null,assigned_by:context.user.id,handover_note:input.handover_note||null})});
   await db("sales_orders?id=eq."+encodeURIComponent(input.order_id),{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({fulfillment_status:"assigned",updated_at:new Date().toISOString()})});
   await db("admin_audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({actor_user_id:context.user.id,action:"assign_sales_order",target_type:"sales_order",target_id:input.order_id,details:{assignee_user_id:input.assignee_user_id,manager_user_id:input.manager_user_id||null,handover_note:input.handover_note||null}})});
   return send(response,200,rows[0]);
  }
  if(input.action==="set_payment_status"){
   if(!input.order_id||!states.has(input.payment_status))return send(response,400,{error:"Trạng thái thanh toán không hợp lệ"});
   await db("sales_orders?id=eq."+encodeURIComponent(input.order_id),{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({payment_status:input.payment_status,updated_at:new Date().toISOString()})});
   await db("admin_audit_logs",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({actor_user_id:context.user.id,action:"set_sales_payment_status",target_type:"sales_order",target_id:input.order_id,details:{payment_status:input.payment_status,source:"manual_admin"}})});
   return send(response,200,{ok:true});
  }
  return send(response,400,{error:"Action không hỗ trợ"});
 }catch(error){return send(response,error.message==="Unauthorized"?401:error.message==="Forbidden"?403:500,{error:error.message});}
}
