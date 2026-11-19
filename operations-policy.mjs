export const operationScopes=['manage_payout','verify_reports','read_reports_all'];
export const isOperationsAdmin=context=>['platform_admin','super_admin'].includes(context?.profile?.role);
export function canOperate(context,scope){
 if(!operationScopes.includes(scope))return false;if(isOperationsAdmin(context))return true;
 const grants=context?.profile?.permissions?.sales_operations;
 return grants===true||grants==='*'||Array.isArray(grants)&&(grants.includes(scope)||grants.includes('*'));
}
export function summarizeReports(reports){
 const valid=reports.filter(row=>row.status!=='rejected'),latest=new Map();
 for(const row of valid){const previous=latest.get(row.assignment_id);if(!previous||row.report_date>previous.report_date)latest.set(row.assignment_id,row)}
 const total=rows=>({posts:rows.reduce((n,r)=>n+Number(r.published_post_count||0),0),revenue_vnd:rows.reduce((n,r)=>n+Number(r.revenue_vnd||0),0),reports:rows.length});
 const group=field=>{const map=new Map();for(const row of valid){const key=row[field];if(!map.has(key))map.set(key,[]);map.get(key).push(row)}return [...map].map(([id,rows])=>({id,...total(rows),verified:total(rows.filter(r=>r.status==='verified')),cumulative_revenue_vnd:[...latest.values()].filter(r=>r[field]===id).reduce((n,r)=>n+Number(r.cumulative_revenue_vnd||0),0)}))};
 return {reported:total(valid),verified:total(valid.filter(r=>r.status==='verified')),cumulative_revenue_vnd:[...latest.values()].reduce((n,r)=>n+Number(r.cumulative_revenue_vnd||0),0),by_person:group('reporter_user_id'),by_page:group('page_id')};
}
