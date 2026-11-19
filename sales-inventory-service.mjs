import {db,readBody,send,assertMutableContext,canManageSalesInventory} from './api/_lib.mjs';
import {canReadAllSalesOrders} from './sales-order-policy.mjs';
export const inventoryScopes=['read','intake','publish','reserve','release','finalize','assign_inhouse','writeoff','warranty'];
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
export function inventoryFailure(response,error){
 const message=String(error.message||'');
 if(message==='Unauthorized')return send(response,401,{error:'Vui lòng đăng nhập lại'});
 if(message.includes('Chế độ xem trước chỉ đọc'))return send(response,403,{error:message});
 if(message.includes('Cannot write off'))return send(response,409,{error:'Chỉ ghi hỏng hàng nháp, sẵn bán hoặc Inhouse. Hàng đang giữ cần trả mã trước; hàng đã bán ngoài cần đối soát.'});
 if(message.includes('Access handover confirmation required'))return send(response,409,{error:'Cần xác nhận đã cấp quyền Page bên ngoài hệ thống trước khi hoàn tất đơn.'});
 if(message.includes('Forbidden'))return send(response,403,{error:'Tài khoản chưa được cấp quyền hoặc đơn không trong phạm vi phụ trách'});
 const labels=[['duplicate key','ID Page hoặc mã kho đã tồn tại; không tạo thêm bản ghi'],['Insufficient available inventory','Không đủ Page sẵn sàng bán. Vui lòng giảm số lượng hoặc liên hệ hỗ trợ.'],['Price changed','Giá vừa thay đổi, vui lòng kiểm tra lại và tạo đơn.'],['Inventory exceeds','Số mã kho vượt số lượng trên đơn'],['not available','Mã kho đã được giữ hoặc đã bán'],['payment or verification incomplete','Đơn chưa thanh toán hoặc chưa xác minh 0 đồng'],['already exists','Page đã có trong hệ thống; cần đối soát trước khi chuyển Inhouse'],['Reserve exactly','Cần giữ đủ số mã theo số lượng đơn trước khi bàn giao'],['does not match','Mã kho không khớp đơn hoặc sản phẩm'],['reason required','Vui lòng nhập lý do trả mã'],['Target user','Người nhận chưa hoạt động hoặc không tồn tại']];
 const matched=labels.find(([key])=>message.includes(key));if(matched)return send(response,409,{error:matched[1]});
 if(message.includes('P0001')||message.includes('23505')||message.includes('23503'))return send(response,409,{error:'Trạng thái hoặc dữ liệu không hợp lệ cho thao tác này. Vui lòng làm mới và kiểm tra lại.'});
 if(message.includes('22P02')||message.includes('Invalid'))return send(response,400,{error:'Thông tin hoặc định dạng không hợp lệ'});
 console.error('sales_inventory_operation_failed',message.slice(0,180));return send(response,500,{error:'Không thể hoàn tất thao tác kho. Vui lòng thử lại.'});
}
export async function inventoryService(request,response,context,endpoint){
 const params=new URL(request.url,'http://localhost').searchParams;
 const allow=scope=>{if(!canManageSalesInventory(context,scope))throw Error('Forbidden')};
 const caps=inventoryScopes.filter(scope=>canManageSalesInventory(context,scope));
 try{
  if(request.method==='GET'){
   allow('read');response.setHeader('Cache-Control','no-store');
   if(endpoint==='sales_fulfillment'){
    const id=params.get('order_id');if(!uuid(id))return send(response,400,{error:'Thiếu mã đơn hợp lệ'});
    const [orders,assignments]=await Promise.all([db(`sales_orders?select=id,order_code,product_id,quantity,payment_status,expected_amount_vnd,zero_value_verification_status,fulfillment_status,fulfillment_destination&id=eq.${id}&limit=1`),db(`sales_order_assignments?select=*&order_id=eq.${id}`)]);
    const order=orders[0];if(!order)return send(response,404,{error:'Không tìm thấy đơn'});
    if(!canReadAllSalesOrders(context)&&!assignments.some(row=>row.assignee_user_id===context.user.id))throw Error('Forbidden');
    const [items,orderItems,details]=await Promise.all([db(`sales_inventory_items?select=*&product_id=eq.${order.product_id}&or=(status.eq.available,reserved_order_ref.eq.${order.order_code})&order=created_at.asc&limit=1000`),db(`sales_order_inventory_items?select=*&order_id=eq.${id}`),db('fanpage_inventory_details?select=inventory_item_id,page_name,facebook_page_id,page_link&limit=5000')]);
    const users=['platform_admin','super_admin'].includes(context.profile.role)?await db('profiles?select=id,display_name,role&status=eq.active&limit=5000'):[];
    const itemIds=new Set([...items.map(item=>item.id),...orderItems.map(item=>item.inventory_item_id)]);
    const [orderInventory,warranties]=await Promise.all([orderItems.length?db(`sales_inventory_items?select=id,purchase_cost_vnd,status&id=in.(${orderItems.map(r=>r.inventory_item_id).join(',')})`):[],db(`sales_order_warranties?select=*&order_id=eq.${id}&order=created_at.desc`)]);
    return send(response,200,{order,items,order_inventory:orderInventory,warranties,order_items:orderItems,assignments,details:details.filter(item=>itemIds.has(item.inventory_item_id)),users,permissions:caps,manage:['platform_admin','super_admin'].includes(context.profile.role)});
   }
   const [items,details,inhouse,products]=await Promise.all([db('sales_inventory_items?select=*&order=created_at.desc&limit=1000'),db('fanpage_inventory_details?select=*&limit=1000'),db('inhouse_page_inventory?select=*&limit=1000'),db('sales_products?select=id,sku,name,status,product_group,sellable&order=name.asc&limit=100')]);
   if(endpoint==='sales_inhouse'){
    const ids=new Set(inhouse.map(row=>row.inventory_item_id)),pageIds=inhouse.map(row=>row.page_id).filter(Boolean);
    const assignments=pageIds.length?await db(`page_assignments?select=*&page_id=in.(${pageIds.map(encodeURIComponent).join(',')})&status=eq.active`):[];
    const users=caps.includes('assign_inhouse')||caps.includes('finalize')?await db('profiles?select=id,display_name,role&status=eq.active&limit=5000'):[];
    const writeoffs=await db('sales_inventory_writeoffs?select=inventory_item_id,cost_vnd,revenue_vnd,reason,created_at&limit=5000');
    return send(response,200,{items:items.filter(row=>ids.has(row.id)),details:details.filter(row=>ids.has(row.inventory_item_id)),inhouse,products,assignments,users,writeoffs:writeoffs.filter(row=>ids.has(row.inventory_item_id)),permissions:caps,can_create:['operator','manager','platform_admin','super_admin'].includes(context.profile.role)&&caps.includes('finalize')});
   }
   const item=params.get('inventory_item_id');if(item&&!uuid(item))return send(response,400,{error:'Mã kho không hợp lệ'});
   const [ledger,writeoffs]=await Promise.all([db(`sales_inventory_ledger?select=*&order=created_at.desc&limit=200${item?'&inventory_item_id=eq.'+item:''}`),db('sales_inventory_writeoffs?select=inventory_item_id,cost_vnd,revenue_vnd,reason,created_at&limit=5000')]);
   return send(response,200,{items,details,inhouse,products,ledger,writeoffs,permissions:caps});
  }
  if(request.method!=='POST')return send(response,405,{error:'Method not allowed'});
  assertMutableContext(context);const input=await readBody(request),action=String(input.action||'');
  const scope={update_page_name:'intake',release_order:'release',cancel_order:'release',create_inhouse_order:'finalize',verify_zero:'finalize',allocate:'reserve',start_handover:'finalize'}[action]||action;
  allow(scope);
  if(!['intake','publish','update_page_name','reserve','release','release_order','cancel_order','finalize','assign_inhouse','create_inhouse_order','verify_zero','writeoff','allocate','start_handover','warranty'].includes(action))return send(response,400,{error:'Thao tác không hợp lệ'});
  if(['intake','writeoff'].includes(action)&&input.purchase_cost_vnd!=null&&(!Number.isSafeInteger(Number(input.purchase_cost_vnd))||Number(input.purchase_cost_vnd)<0))return send(response,400,{error:'Giá nhập phải là số nguyên không âm'});
  const rpc={writeoff:'sales_inventory_writeoff',allocate:'sales_order_allocate',finalize:'sales_order_finish',start_handover:'sales_order_finish',warranty:'sales_order_warranty'}[action];
  const result=await db('rpc/'+(rpc||'sales_inventory_command'),{method:'POST',body:JSON.stringify({...(rpc?{}:{p_action:action}),p_actor:context.user.id,p_input:input})});
  return send(response,action==='intake'||action==='create_inhouse_order'?201:200,result);
 }catch(error){return inventoryFailure(response,error)}
}
