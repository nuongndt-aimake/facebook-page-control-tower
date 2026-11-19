import {summarizeReports} from './operations-policy.mjs';
export function overviewReportModel(data){
 const reports=data.reports||[],assignments=(data.assignments||[]).filter(a=>a.status==='active'),summary=summarizeReports(reports),days=new Map();
 for(const report of reports){if(report.status==='rejected')continue;if(!days.has(report.report_date))days.set(report.report_date,[]);days.get(report.report_date).push(report)}
 const users=new Map((data.users||[]).map(u=>[u.id,u])),pages=new Map((data.pages||[]).map(p=>[p.id,p.name]));
 return {summary,page_count:new Set(assignments.map(a=>a.page_id)).size,assignment_count:assignments.length,report_count:summary.reported.reports,
  by_day:[...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({date,...summarizeReports(rows)})),
  by_person:summary.by_person.map(row=>({...row,name:users.get(row.id)?.display_name||'Nhân sự được phân công',relationship:users.get(row.id)?.relationship||''})),
  by_page:summary.by_page.map(row=>({...row,name:pages.get(row.id)||row.id})),
  missing:(data.missing||[]).map(a=>({...a,person_name:users.get(a.user_id)?.display_name||'Nhân sự được phân công',page_name:pages.get(a.page_id)||a.page_id}))};
}
export function overviewDateRange(period,today){const shift=(day,n)=>new Date(new Date(day+'T12:00:00Z').getTime()+n*86400000).toISOString().slice(0,10);if(period==='yesterday'){const day=shift(today,-1);return {start:day,end:day}}if(period==='today')return {start:today,end:today};if(period==='month')return {start:today.slice(0,8)+'01',end:today};return {start:shift(today,-6),end:today}}
