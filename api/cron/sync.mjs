import { connections, db, graph, graphPost, graphPages, resolveConnectionPages, send, requireAdmin, upsert, redactSecrets, yesterdayUTC, todayUTC } from "../_lib.mjs";

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
const orchestratorEnabled = () => String(process.env.ENABLE_SYNC_ORCHESTRATOR || "false").toLowerCase() === "true";
const dispatchBatchSize = () => Math.min(Math.max(Number.parseInt(process.env.SYNC_DISPATCH_BATCH || "1", 10) || 1, 1), 100);
const workerId = () => process.env.VERCEL_REGION ? `vercel:${process.env.VERCEL_REGION}:${process.env.VERCEL_FUNCTION_NAME || "sync"}` : `local:${process.pid}`;
const isSlotActive = async slotKey => {
  if (!slotKey || slotKey === "manual" || String(slotKey).startsWith("pilot")) return true;
  const rows = await db(`sync_schedule_slots?select=active&slot_key=eq.${encodeURIComponent(slotKey)}&limit=1`);
  return rows?.[0]?.active === true;
};

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

export async function saveInsights(kind, id, token, names, period, since, until, now) {
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
  return { rows: rows.length, records: rows, warnings, outcomes };
}

async function saveDailySnapshots(page, posts, pageResult, since, until, observedAt) {
  const snapshotDate = todayUTC();
  try {
    await upsert("page_daily_snapshots", [{
      page_id: String(page.id), snapshot_date: snapshotDate, window_start: since, window_end: until,
      status: pageResult.outcomes.some(item => item.status === "error") ? "warning" : (pageResult.rows ? "ok" : "empty"),
      posts_count: posts.length,
      metrics_json: { outcomes: pageResult.outcomes, records: pageResult.records || [] }, observed_at: observedAt
    }], "page_id,snapshot_date");
    const postRows = posts.map(post => {
      const raw = post.raw_json || post;
      const comments = raw.comments?.summary?.total_count;
      const reactions = raw.reactions?.summary?.total_count;
      const shares = raw.shares?.count;
      return { post_id: String(post.id), page_id: String(page.id), snapshot_date: snapshotDate, window_start: since, window_end: until,
        status: comments === undefined && reactions === undefined && shares === undefined ? "not_available" : "ok",
        comments_count: comments ?? null, reactions_count: reactions ?? null, shares_count: shares ?? null,
        metrics_json: { source: "page_posts", observed_at: observedAt }, observed_at: observedAt };
    });
    if (postRows.length) await upsert("post_daily_snapshots", postRows, "post_id,snapshot_date");
  } catch (error) {
    return errorText(error);
  }
  return null;
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
      const resolved = await resolveConnectionPages(connection, { pageIds: pageIds || undefined });
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
            fields: "id,message,created_time,permalink_url,attachments{media_type},comments.limit(0).summary(true),reactions.limit(0).summary(true),shares", since, until, limit: "100"
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
          const snapshotError = await saveDailySnapshots(page, posts, pageResult, since, until, now);
          if (snapshotError) report.warnings.push(`${page.name}: daily snapshot: ${snapshotError}`);
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

async function enqueueSyncJobs({ since, until, period = "day", slotKey = "manual", pageId = null } = {}) {
  const now = new Date().toISOString();
  const jobs = [];
  const warnings = [];
  const slotValue = String(slotKey || "manual");
  const persistedSlotKey = slotValue === "manual" || slotValue.startsWith("pilot") ? null : slotKey;
  for (const connection of await connections()) {
    let resolved;
    try {
      resolved = await resolveConnectionPages(connection, { pageIds: pageId ? [pageId] : undefined });
    } catch (error) {
      warnings.push(`${connection.label}: ${errorText(error)}`);
      continue;
    }
    warnings.push(...(resolved?.warnings || []).map(item => `${connection.label}: ${item}`));
    try {
      const registryRows = (resolved?.pages || []).map(page => ({
        id: String(page.id),
        name: page.name || String(page.id),
        category: page.category || null,
        meta_connection: connection.label,
        updated_at: now
      }));
      if (registryRows.length) await upsert("pages", registryRows, "id");
    } catch (error) {
      warnings.push(`${connection.label}: cập nhật registry trước khi xếp hàng thất bại: ${errorText(error)}`);
    }
    for (const page of (resolved?.pages || []).filter(item => !pageId || String(item.id) === String(pageId))) {
      const connectionKey = connection.id || connection.label;
      jobs.push({
        connection_id: connection.id || null,
        page_id: String(page.id),
        slot_key: persistedSlotKey,
        job_type: "page_sync",
        period,
        since_date: since,
        until_date: until,
        status: "pending",
        available_at: now,
        idempotency_key: `${slotKey}:${connectionKey}:${page.id}:${period}:${since}:${until}`,
        updated_at: now
      });
    }
  }
  try {
    if (jobs.length) await db("sync_jobs?on_conflict=idempotency_key", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(jobs)
    });
  } catch (error) {
    warnings.push(`Xếp hàng đồng bộ thất bại: ${errorText(error)}`);
  }
  return { queued: jobs.length, warnings };
}

async function claimSyncJobs(worker, limit) {
  return db("rpc/claim_sync_jobs", {
    method: "POST",
    body: JSON.stringify({ p_worker: worker, p_limit: limit })
  });
}

async function recordAttempt(job, status, details = {}) {
  const attemptNo = Number(job.attempt_count || 1);
  const startedAt = details.started_at || new Date().toISOString();
  const completedAt = new Date().toISOString();
  await db("sync_attempts?on_conflict=job_id,attempt_no", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      job_id: job.id,
      attempt_no: attemptNo,
      status,
      request_kind: "page_sync",
      error_message: details.error_message || null,
      rows_written: Number(details.rows_written || 0),
      metadata: redactSecrets(details.metadata || {}),
      started_at: startedAt,
      completed_at: completedAt
    })
  });
}

async function finishJob(job, status, details = {}) {
  const retryable = status === "failed" && Number(job.attempt_count || 0) < 3;
  const nextStatus = retryable ? "pending" : status;
  const patch = {
    status: nextStatus,
    completed_at: nextStatus === "pending" ? null : new Date().toISOString(),
    available_at: retryable ? new Date(Date.now() + Number(job.attempt_count || 1) * 60000).toISOString() : new Date().toISOString(),
    locked_at: null,
    locked_by: null,
    last_error: redactSecrets(details.error || {}),
    updated_at: new Date().toISOString()
  };
  await db(`sync_jobs?id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(patch)
  });
  return nextStatus;
}

async function loadSlotConfig(slotKey) {
  if (!slotKey || slotKey === "manual" || String(slotKey).startsWith("pilot")) return { max_concurrency: 1, delay_ms: 900, jitter_ms: 300 };
  const rows = await db(`sync_schedule_slots?select=max_concurrency&slot_key=eq.${encodeURIComponent(slotKey)}&limit=1`).catch(() => []);
  const maxConcurrency = Math.min(Math.max(Number(rows?.[0]?.max_concurrency || 1), 1), 10);
  const delayMs = Math.min(Math.max(Number.parseInt(process.env.SYNC_JOB_DELAY_MS || "900", 10) || 900, 250), 10000);
  const jitterMs = Math.min(Math.max(Number.parseInt(process.env.SYNC_JOB_JITTER_MS || "300", 10) || 300, 0), 3000);
  return { max_concurrency: maxConcurrency, delay_ms: delayMs, jitter_ms: jitterMs };
}

async function processSyncJob(job) {
  const startedAt = new Date().toISOString();
  try {
    const report = await runSync({ since: job.since_date, until: job.until_date, force: true, pageIds: [String(job.page_id)] });
    const failed = Number(report.failed_requests || 0) > 0;
    await recordAttempt(job, failed ? "failed" : (report.metric_rows || report.posts ? "succeeded" : "empty"), {
      started_at: startedAt,
      rows_written: Number(report.metric_rows || 0) + Number(report.posts || 0),
      error_message: failed ? (report.warnings || []).slice(-1).join("; ") : null,
      metadata: { page_id: job.page_id, report }
    });
    const finalStatus = await finishJob(job, failed ? "failed" : "succeeded", { error: failed ? { warnings: report.warnings } : {} });
    return { job_id: job.id, page_id: job.page_id, status: finalStatus, report };
  } catch (error) {
    await recordAttempt(job, "failed", { started_at: startedAt, error_message: errorText(error), metadata: { page_id: job.page_id } }).catch(() => {});
    const finalStatus = await finishJob(job, "failed", { error: { message: errorText(error) } }).catch(() => "failed");
    return { job_id: job.id, page_id: job.page_id, status: finalStatus, error: errorText(error) };
  }
}

export async function runOrchestratedSync({ since = yesterdayUTC(), until = todayUTC(), period = "day", slotKey = "manual", limit = dispatchBatchSize(), pageId = null } = {}) {
  const queued = await enqueueSyncJobs({ since, until, period, slotKey, pageId });
  const slotConfig = await loadSlotConfig(slotKey);
  const effectiveLimit = Math.min(Math.max(Number(limit) || 1, 1), slotConfig.max_concurrency);
  let jobs = [];
  try {
    jobs = await claimSyncJobs(workerId(), effectiveLimit);
  } catch (error) {
    return { mode: "orchestrator", queued: queued.queued, claimed: 0, completed: 0, failed: 0, warnings: [...queued.warnings, `Nhận việc đồng bộ thất bại: ${errorText(error)}`] };
  }
  const results = [];
  const claimedJobs = Array.isArray(jobs) ? jobs : [];
  for (let offset = 0; offset < claimedJobs.length; offset += slotConfig.max_concurrency) {
    const batch = claimedJobs.slice(offset, offset + slotConfig.max_concurrency);
    const batchResults = await Promise.all(batch.map(async (job, index) => {
      if (index > 0) await sleep(slotConfig.delay_ms * index + Math.floor(Math.random() * slotConfig.jitter_ms));
      return processSyncJob(job);
    }));
    results.push(...batchResults);
  }
  return {
    mode: "orchestrator",
    queued: queued.queued,
    claimed: claimedJobs.length,
    completed: results.filter(item => ["succeeded", "empty"].includes(item.status)).length,
    failed: results.filter(item => item.status === "failed").length,
    warnings: queued.warnings,
    results,
    concurrency: slotConfig.max_concurrency,
    pacing: { delay_ms: slotConfig.delay_ms, jitter_ms: slotConfig.jitter_ms }
  };
}

// Post-metric worker is kept in this Function so the Hobby deployment remains
// within its production Function quota. The public /api/cron/post-sync route
// rewrites here with worker=post.
const postSyncEnabled = () => String(process.env.ENABLE_POST_SYNC_WORKER || "false").toLowerCase() === "true";
const postLimit = value => Math.min(Math.max(Number.parseInt(value || process.env.POST_SYNC_BATCH || "1", 10) || 1, 1), 100);
const postWorkerId = () => process.env.VERCEL_REGION ? `vercel:${process.env.VERCEL_REGION}:post-sync` : `local:${process.pid}:post-sync`;
const postRequestMetricNames = request => Array.isArray(request.metric_names) ? request.metric_names.map(value => String(value).trim()).filter(Boolean) : [];

async function findPostPageToken(pageId) {
  for (const connection of await connections()) {
    try {
      const resolved = await resolveConnectionPages(connection, { pageIds: [pageId] });
      const page = resolved.pages?.find(item => String(item.id) === String(pageId));
      if (page?.access_token) return page.access_token;
    } catch { /* try the next configured Meta connection */ }
  }
  return null;
}

async function recordPostAttempt(request, status, details = {}) {
  await db("post_sync_attempts?on_conflict=request_id,attempt_no", {
    method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ request_id: request.id, attempt_no: Number(request.attempt_count || 1), status,
      error_message: details.error_message || null, rows_written: Number(details.rows_written || 0), metadata: redactSecrets(details.metadata || {}),
      started_at: details.started_at || new Date().toISOString(), completed_at: new Date().toISOString() })
  });
}

async function finishPostRequest(request, status, error = {}) {
  const retryable = ["failed", "permission_error"].includes(status) && Number(request.attempt_count || 0) < 3;
  const finalStatus = retryable ? "pending" : status;
  await db(`post_sync_requests?id=eq.${encodeURIComponent(request.id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ status: finalStatus,
      available_at: retryable ? new Date(Date.now() + Number(request.attempt_count || 1) * 60000).toISOString() : new Date().toISOString(),
      completed_at: retryable ? null : new Date().toISOString(), last_error: redactSecrets(error), updated_at: new Date().toISOString() })
  });
  return finalStatus;
}

async function processPostRequest(request) {
  const startedAt = new Date().toISOString();
  const posts = await db(`posts?select=id,page_id&id=eq.${encodeURIComponent(request.post_id)}&limit=1`);
  if (!posts[0]) throw new Error("Không tìm thấy bài viết");
  const token = await findPostPageToken(posts[0].page_id);
  if (!token) {
    await recordPostAttempt(request, "permission_error", { started_at: startedAt, error_message: "Không lấy được Page token", metadata: { post_id: request.post_id } });
    return { status: await finishPostRequest(request, "permission_error", { code: "page_token_unavailable" }) };
  }
  const raw = await graph(request.post_id, token, { fields: "id,comments.limit(0).summary(true),shares" });
  let reactionError = null;
  try { raw.reactions = await graph(request.post_id, token, { fields: "id,reactions.limit(0).summary(true)" }).then(result => result.reactions); }
  catch (error) { reactionError = errorText(error); }
  const comments = raw.comments?.summary?.total_count;
  const reactions = raw.reactions?.summary?.total_count;
  const shares = raw.shares?.count;
  await db(`posts?id=eq.${encodeURIComponent(request.post_id)}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ raw_json: raw, synced_at: new Date().toISOString() })
  });
  const names = postRequestMetricNames(request);
  const metricResult = names.length ? await saveInsights("post", request.post_id, token, names, "day", request.window_start, request.window_end, new Date().toISOString()) : { rows: 0, warnings: [], outcomes: [] };
  const status = metricResult.outcomes.some(item => item.status === "error") ? "failed" : (comments === undefined && reactions === undefined && shares === undefined && !metricResult.rows ? "empty" : "succeeded");
  await db("post_metric_snapshots", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
    post_id: request.post_id, request_id: request.id, observed_at: new Date().toISOString(), window_start: request.window_start, window_end: request.window_end,
    status, comments_count: comments ?? null, reactions_count: reactions ?? null, shares_count: shares ?? null,
    metrics_json: { outcomes: metricResult.outcomes, warnings: metricResult.warnings, reaction_error: reactionError }, raw_json: raw
  }) });
  await recordPostAttempt(request, status, { started_at: startedAt, rows_written: metricResult.rows ? metricResult.rows + 1 : 1, metadata: { post_id: request.post_id, metric_names: names } });
  return { status: await finishPostRequest(request, status, status === "failed" ? { warnings: metricResult.warnings } : {}) };
}

export async function runPostSync({ limit = postLimit() } = {}) {
  const requests = await db("rpc/claim_post_sync_requests", { method: "POST", body: JSON.stringify({ p_worker: postWorkerId(), p_limit: limit }) });
  const results = [];
  for (const request of Array.isArray(requests) ? requests : []) {
    try { results.push({ request_id: request.id, post_id: request.post_id, ...(await processPostRequest(request)) }); }
    catch (error) {
      await recordPostAttempt(request, "failed", { error_message: errorText(error), metadata: { post_id: request.post_id } }).catch(() => {});
      results.push({ request_id: request.id, post_id: request.post_id, status: await finishPostRequest(request, "failed", { message: errorText(error) }).catch(() => "failed"), error: errorText(error) });
    }
  }
  return { claimed: Array.isArray(requests) ? requests.length : 0, completed: results.filter(item => ["succeeded", "empty"].includes(item.status)).length, failed: results.filter(item => ["failed", "permission_error"].includes(item.status)).length, results };
}

export default async function handler(request, response) {
  try {
    requireAdmin(request, true);
    const url = new URL(request.url, `https://${request.headers.host}`);
    if (url.searchParams.get("worker") === "post") {
      if (!postSyncEnabled()) return send(response, 409, { error: "Post sync worker đang tắt", code: "POST_SYNC_WORKER_DISABLED" });
      return send(response, 200, await runPostSync({ limit: postLimit(url.searchParams.get("limit")) }));
    }
    const since = url.searchParams.get("since") || yesterdayUTC();
    const until = url.searchParams.get("until") || todayUTC();
    const force = url.searchParams.get("force") === "1" || request.headers["x-admin-key"] === process.env.DASHBOARD_ADMIN_KEY;
    if (orchestratorEnabled()) {
      const period = url.searchParams.get("period") || "day";
      const slotKey = url.searchParams.get("slot") || "manual";
      const pageId = url.searchParams.get("page_id") || null;
      const limit = Number.parseInt(url.searchParams.get("limit") || String(dispatchBatchSize()), 10);
      if (!(await isSlotActive(slotKey))) return send(response, 200, { mode: "orchestrator", skipped: true, skipped_reason: "slot_inactive", slot: slotKey });
      return send(response, 200, await runOrchestratedSync({ since, until, period, slotKey, limit, pageId }));
    }
    return send(response, 200, await runSync({ since, until, force }));
  } catch (error) {
    const status = error.message === "Unauthorized" ? 401 : 500;
    return send(response, status, { error: error.message });
  }
}
