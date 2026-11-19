import test from 'node:test';import assert from 'node:assert/strict';import {canOperate,summarizeReports} from './operations-policy.mjs';
test('operations permissions are explicit and manager does not inherit verification',()=>{
 const context={profile:{role:'manager',permissions:{}}};assert.equal(canOperate(context,'verify_reports'),false);
 context.profile.permissions={sales_operations:['read_reports_all']};assert.equal(canOperate(context,'read_reports_all'),true);assert.equal(canOperate(context,'manage_payout'),false);
 context.profile.permissions={sales_operations:'verify_reports'};assert.equal(canOperate(context,'verify_reports'),false);
 context.profile.role='super_admin';assert.equal(canOperate(context,'verify_reports'),true);assert.equal(canOperate(context,'unknown'),false);
});
test('two people on one page aggregate independently; cumulative uses latest assignment only',()=>{
 const summary=summarizeReports([
  {assignment_id:'a',page_id:'page',reporter_user_id:'one',report_date:'2026-11-17',published_post_count:2,revenue_vnd:100,cumulative_revenue_vnd:200,status:'verified'},
  {assignment_id:'a',page_id:'page',reporter_user_id:'one',report_date:'2026-11-18',published_post_count:3,revenue_vnd:200,cumulative_revenue_vnd:400,status:'submitted'},
  {assignment_id:'b',page_id:'page',reporter_user_id:'two',report_date:'2026-11-18',published_post_count:4,revenue_vnd:300,cumulative_revenue_vnd:600,status:'verified'},
  {assignment_id:'c',page_id:'page',reporter_user_id:'three',report_date:'2026-11-18',published_post_count:99,revenue_vnd:999,cumulative_revenue_vnd:999,status:'rejected'}]);
 assert.equal(summary.reported.posts,9);assert.equal(summary.reported.revenue_vnd,600);assert.equal(summary.verified.revenue_vnd,400);assert.equal(summary.cumulative_revenue_vnd,1000);assert.equal(summary.by_person.length,2);assert.equal(summary.by_page[0].revenue_vnd,600);assert.equal(summary.by_page[0].cumulative_revenue_vnd,1000);
});
