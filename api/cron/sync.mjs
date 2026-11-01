import { connections, db, graph, graphPost, graphPages, resolveConnectionPages, send, requireAdmin, upsert, yesterdayUTC, todayUTC } from "../_lib.mjs";

const pageMetricNames = () => (process.env.META_PAGE_METRICS || "page_post_engagements,page_follows,monetization_approximate_earnings,content_monetization_earnings").split(",").map(x => x.trim()).filter(Boolean);
const postMetricNames = () => (process.env.META_POST_METRICS || "").split(",").map(x => x.trim()).filter(Boolean);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const daysAgoUTC = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

function dateAttempts(since, until) {
  const today = todayUTC();
  const yesterday = yesterdayUTC();
  return [...new Map([
    [`${since}:${until}`, { since, until }],
    [`${today}:${today}`, { since: today, until: today }],
    [`${yesterday}:${yesterday}`, { since: yesterday, until: yesterday }]
  ].map(([key, value]) => [key, value])).values()];
}

function resultValues(result, metric) {
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.values)) return [{ name: metric, values: result.values }];
  if (result && typeof result === "object" && ("value" in result || "total" in result)) {
    return [{ name: metric, values: [{ end_time: "lifetime", value: result.value ?? result.total }] }];
  }
  return [];
}

function errorText(error) { return error?.message || String(error); }

async function requestMetric(id, token, metric, period, attempt) {
  const isEarnings = metric === "monetization_approximate_earnings" || metric === "content_monetization_earnings";
  let firstError = null;
  if (isEarnings) {
    try {
      return { result: await graphPost(`${id}/${metric}`, token, { period, since: attempt.since, until: attempt.until }), endpoint: `${id}/${metric}` };
    } catch (error) {
      firstError = error;
    }
  }
  try {
    return { result: await graph(`${id}/insights`, token, { metric, period, since: attempt.since, until: attempt.until }), endpoint: `${id}/insights` };
  } catch (error) {
    if (firstError) throw new Error(`${errorText(firstError)}; fallback ${errorText(error)}`);
    throw error;
  }
}

async function saveInsights(kind, id, token, names, period, since, until, now) {
  const rows = [], warnings = [], outcomes = [];
  for (const metric of names) {
    let metricRows = [];
    let requestSucceeded = false;
    const errors = [];
    let attemptsMade = 0;
    let endpoint = null;
    for (const attempt of dateAttempts(since, until)) {
      let responseReceived = false;
      for (let retry = 0; retry < 2; retry++) {
        attemptsMade++;
        try {
          const response = await requestMetric(id, token, metric, period, attempt);
          endpoint = response.endpoint;
          requestSucceeded = true;
          responseReceived = true;
          metricRows = resultValues(response.result, metric).flatMap(item => (item.values || []).map(value => ({
            entity_type: kind, entity_id: id, metric: item.name || metric, period,
            end_time: value.end_time || `${attempt.until}T23:59:59+0000`, value_json: value.value, synced_at: now
          })));
          if (metricRows.length) break;
        } catch (error) {
          errors.push(`${attempt.since}..${attempt.until}: ${errorText(error)}`);
          if (retry === 0) await sleep(250);
        }
      }
      if (metricRows.length) break;
      // A permission/HTTP error is not fixed by changing the date range.
      // Only try today/yesterday when Meta answered successfully with no rows.
      if (!responseReceived) break;
    }
    const status = metricRows.length ? "ok" : requestSucceeded ? "empty" : "error";
    const outcome = { metric, status, rows: metricRows.length, attempts: attemptsMade, endpoint, errors: errors.slice(-4) };
    outcomes.push(outcome);
    if (metricRows.length) rows.push(...metricRows);
    if (status === "error") warnings.push(`${metric}: ${errors.at(-1) || "Meta request thất bại"}`);
  }
  try {
    await upsert("metrics", rows, "entity_type,entity_id,metric,period,end_time");
  } catch (error) {
    warnings.push(`Lưu metrics thất bại: ${errorText(error)}`);
    for (const outcome of outcomes.filter(item => item.status === "ok")) outcome.persist_status = "error";
  }
  return { rows: rows.length, warnings, outcomes };
}

async function alreadySynced(since, until) {
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  try {
    const rows = await db(`sync_runs?select=id,ran_at,since_date,until_date,status&since_date=eq.${encodeURIComponent(since)}&until_date=eq.${encodeURIComponent(until)}&status=eq.ok&ran_at=gte.${encodeURIComponent(cutoff)}&order=ran_at.desc&limit=1`);
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

export async function runSync({ since = daysAgoUTC(364), until = todayUTC(), force = false, pageIds = null } = {}) {
  if (!force) {
    const previous = await alreadySynced(since, until);
    if (previous) return { since, until, skipped: true, skipped_reason: "already_synced_today", previous_sync: previous, pages: 0, posts: 0, metric_rows: 0, warnings: [], page_statuses: [] };
  }
  const now = new Date().toISOString();
  const report = { since, until, skipped: false, pages: 0, posts: 0, metric_rows: 0, failed_requests: 0, empty_requests: 0, warnings: [], page_statuses: [] };
  for (const connection of await connections()) {
    try {
      const resolved = await resolveConnectionPages(connection);
      const readable = (Array.isArray(resolved?.pages) ? resolved.pages : []).filter(page => !Array.isArray(pageIds) || pageIds.includes(String(page.id)));
      report.warnings.push(...(resolved?.warnings || []).map(x => `${connection.label}: ${x}`));
      if (Array.isArray(resolved?.businesses) && resolved.businesses.length) {
        try {
          await upsert("businesses", resolved.businesses.map(business => ({ id: String(business.id), name: business.name, meta_connection: connection.label, managed: true, last_synced_at: now })), "id");
        } catch (error) { report.warnings.push(`${connection.label}: lưu danh sách BM thất bại: ${errorText(error)}`); }
      }
      try {
        await upsert("pages", readable.map(page => ({ id: page.id, name: page.name, category: page.category || null,
          tasks: page.tasks || [], meta_connection: connection.label, managed_by_connection: page.managed_by_connection || connection.label,
          asset_scope: page.asset_scope === "bm" ? "bm" : (page.asset_scope === "configured" ? "configured" : "personal"),
          custodian_business_id: page.custodian_business_id || null, custodian_business_name: page.custodian_business_name || null,
          last_synced_at: now, updated_at: now })), "id");
      } catch (error) {
        try {
          await upsert("pages", readable.map(page => ({ id: page.id, name: page.name, category: page.category || null, tasks: page.tasks || [], meta_connection: connection.label, custodian_business_id: page.custodian_business_id || null, updated_at: now })), "id");
          report.warnings.push(`${connection.label}: schema BM mở rộng chưa áp dụng, đã lưu tương thích cũ`);
        } catch (fallbackError) { report.warnings.push(`${connection.label}: lưu danh sách page thất bại: ${errorText(fallbackError)}`); }
      }
      // Keep an immutable first-seen identity and an auditable connection trail.
      // Existing page rows are never replaced or re-keyed when ownership/BM data changes.
      for (const page of readable) {
        try {
          await db(`pages?id=eq.${encodeURIComponent(page.id)}&first_connected_at=is.null`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ first_connected_at: now, first_connection_id: connection.id || null }) });
          if (connection.id) await db("page_connection_history?on_conflict=page_id,connection_id,business_id", {
            method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({ page_id: String(page.id), connection_id: connection.id, business_id: page.custodian_business_id || null,
              source: page.asset_scope === "bm" ? "bm" : (page.asset_scope === "configured" ? "configured" : "personal"),
              first_seen_at: now, last_seen_at: now, last_token_valid_at: now, status: "active", raw_json: { name: page.name, connection: connection.label } })
          });
          await db(`pages?id=eq.${encodeURIComponent(page.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_seen_at: now, current_status: "active" }) });
        } catch (error) { report.warnings.push(`${connection.label}: registry/history ${page.id}: ${errorText(error)}`); }
      }
      for (const page of readable) {
        report.pages++;
        const pageStatus = { id: page.id, name: page.name, asset_scope: page.asset_scope || (page.custodian_business_id ? "bm" : "personal"), posts: { status: "not_started", count: 0 }, metrics: [], status: "ok" };
        let posts = [];
        try {
          posts = await graphPages(`${page.id}/posts`, page.access_token, {
            fields: "id,message,created_time,permalink_url,attachments{media_type},comments.limit(0).summary(true),shares", since, until, limit: "100"
          });
          await upsert("posts", posts.map(post => ({ id: post.id, page_id: page.id, created_time: post.created_time || null,
            message: post.message || null, permalink_url: post.permalink_url || null,
            media_type: post.attachments?.data?.[0]?.media_type || null, raw_json: post, synced_at: now })), "id");
          report.posts += posts.length;
          pageStatus.posts = { status: "ok", count: posts.length };
        } catch (error) {
          pageStatus.posts = { status: "error", count: 0, error: errorText(error) };
          pageStatus.status = "warning";
          report.failed_requests++;
          report.warnings.push(`${page.name}: posts: ${errorText(error)}`);
        }
        try {
          const pageResult = await saveInsights("page", page.id, page.access_token, pageMetricNames(), "day", since, until, now);
          pageStatus.metrics = pageResult.outcomes;
          report.metric_rows += pageResult.rows;
          report.warnings.push(...pageResult.warnings.map(x => `${page.name}: ${x}`));
          report.failed_requests += pageResult.outcomes.filter(x => x.status === "error").length;
          report.empty_requests += pageResult.outcomes.filter(x => x.status === "empty").length;
          if (pageResult.outcomes.some(x => x.status === "error")) pageStatus.status = "warning";
        } catch (error) {
          pageStatus.status = "warning";
          report.failed_requests++;
          report.warnings.push(`${page.name}: page insights: ${errorText(error)}`);
        }
        for (const post of posts) {
          try {
            const postResult = await saveInsights("post", post.id, page.access_token, postMetricNames(), "lifetime", since, until, now);
            report.metric_rows += postResult.rows;
            report.warnings.push(...postResult.warnings.map(x => `${post.id}: ${x}`));
            report.failed_requests += postResult.outcomes.filter(x => x.status === "error").length;
            report.empty_requests += postResult.outcomes.filter(x => x.status === "empty").length;
          } catch (error) {
            report.failed_requests++;
            report.warnings.push(`${post.id}: post insights: ${errorText(error)}`);
          }
        }
        if (pageStatus.metrics.some(x => x.status === "error")) pageStatus.status = "warning";
        report.page_statuses.push({ ...pageStatus, connection: connection.label });
      }
    } catch (error) {
      report.warnings.push(`${connection.label}: ${errorText(error)}`);
    }
  }
  await db("sync_runs", { method: "POST", body: JSON.stringify({ ran_at: now, since_date: since, until_date: until,
    status: report.failed_requests || report.warnings.length ? "warning" : "ok", summary: report }) });
  return report;
}

export default async function handler(request, response) {
  try {
    requireAdmin(request, true);
    const url = new URL(request.url, `https://${request.headers.host}`);
    const since = url.searchParams.get("since") || yesterdayUTC();
    const until = url.searchParams.get("until") || todayUTC();
    const force = url.searchParams.get("force") === "1" || request.headers["x-admin-key"] === process.env.DASHBOARD_ADMIN_KEY;
    return send(response, 200, await runSync({ since, until, force }));
  } catch (error) {
    const status = error.message === "Unauthorized" ? 401 : 500;
    return send(response, status, { error: error.message });
  }
}
