const pool = require("../db");
const { findPotentialMatches } = require("../services/reportMatchingService");
const { hasRole } = require("../middleware/authorize");
const { persistMatchesAndNotify } = require("../services/matchingWorkflowService");
const { canCreateReportType } = require("../services/reportPolicy");
const { logError, logInfo } = require("../utils/safeLogger");
const { searchReports } = require("../services/reportSearchService");

// Format a PostgreSQL DATE value to YYYY-MM-DD string
function formatDate(d) {
  if (!d) return "";
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch (_) {
    return String(d).slice(0, 10);
  }
}

// Map a PostgreSQL row (snake_case) → camelCase for the frontend
function rowToReport(row) {
  const imageUrls = Array.isArray(row.image_urls)
    ? row.image_urls.filter(Boolean)
    : (row.image_url ? [row.image_url] : []);
  return {
    id:          row.id,
    itemName:    row.item_name    || "",
    category:    row.category     || "",
    itemCategory: row.item_category || "",
    location:    row.location     || "",
    dateFound:   formatDate(row.date_found),
    timeFound:   row.time_found   || "",
    name:        row.name         || "",
    email:       row.email        || "",
    phone:       row.phone        || "",
    description: row.description  || "",
    status:      row.status       || "Pending",
    claimStatus: row.claim_status || "pending",
    imageUrl:    row.image_url    || null,
    imageUrls,
    createdAt:   row.created_at,
    userId:      row.user_id,
    lifecycleStatus: row.lifecycle_status || "active",
    closedAt: row.closed_at || null,
    closedReason: row.closed_reason || null,
  };
}

exports.getReports = async (req, res) => {
  try {
    const isAdmin = hasRole(req.user, "admin");
    const result = await pool.query(
      isAdmin
        ? `SELECT r.*, ARRAY(SELECT ri.image_url FROM report_images ri WHERE ri.report_id = r.id ORDER BY ri.sort_order, ri.id) AS image_urls
           FROM reports r ORDER BY r.created_at DESC`
        : `SELECT r.*, ARRAY(SELECT ri.image_url FROM report_images ri WHERE ri.report_id = r.id ORDER BY ri.sort_order, ri.id) AS image_urls
           FROM reports r WHERE r.user_id = $1 AND r.category = 'Lost' ORDER BY r.created_at DESC`,
      isAdmin ? [] : [req.user.id]
    );
    res.json(result.rows.map(rowToReport));
  } catch (err) {
    logError("reports.list_failed", err);
    res.status(500).json({ error: "Failed to fetch reports" });
  }
};

function reportWorkflowStatus(row) {
  const lifecycle = String(row.lifecycle_status || "active").toLowerCase();
  const claimStatus = String(row.latest_claim_status || "").toLowerCase();
  if (lifecycle === "closed_by_student") return "Closed";
  if (["returned", "archived"].includes(lifecycle) || ["approved", "returned", "closed"].includes(claimStatus)) {
    return "Recovered";
  }
  if (claimStatus === "action_required") return "Waiting for Student";
  if (["pending", "under_review"].includes(claimStatus)) return "Under Review";
  if (row.has_potential_match) return "Potential Match Found";
  return "Submitted";
}

async function listLostReports(ownerId = null) {
  const values = ownerId ? [ownerId] : [];
  const result = await pool.query(
    `SELECT r.*,
            ARRAY(SELECT ri.image_url FROM report_images ri WHERE ri.report_id = r.id ORDER BY ri.sort_order, ri.id) AS image_urls,
            EXISTS (SELECT 1 FROM report_matches rm WHERE rm.lost_report_id = r.id) AS has_potential_match,
            (SELECT c.status FROM claims c WHERE c.lost_report_id = r.id
             ORDER BY c.created_at DESC LIMIT 1) AS latest_claim_status
     FROM reports r
     WHERE r.category = 'Lost' ${ownerId ? "AND r.user_id = $1" : ""}
     ORDER BY r.created_at DESC`,
    values
  );
  return result.rows.map((row) => ({
    ...rowToReport(row),
    workflowStatus: reportWorkflowStatus(row),
    hasPotentialMatch: Boolean(row.has_potential_match),
    latestClaimStatus: row.latest_claim_status || null,
  }));
}

exports.getMyLostReports = async (req, res) => {
  try {
    return res.json(await listLostReports(req.user.id));
  } catch (error) {
    logError("reports.mine_failed", error);
    return res.status(500).json({ error: "Your Lost Reports could not be loaded." });
  }
};

exports.getStudentLostReports = async (_req, res) => {
  try {
    return res.json(await listLostReports());
  } catch (error) {
    logError("reports.student_lost_failed", error);
    return res.status(500).json({ error: "Student Lost Reports could not be loaded." });
  }
};

exports.discoverFoundReports = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
              ARRAY(SELECT ri.image_url FROM report_images ri WHERE ri.report_id = r.id ORDER BY ri.sort_order, ri.id) AS image_urls,
              matched.lost_report_id AS related_lost_report_id,
              matched.score AS match_score,
              matched.evidence AS match_evidence
       FROM reports r
       LEFT JOIN LATERAL (
         SELECT rm.lost_report_id, rm.score, rm.evidence
         FROM report_matches rm
         INNER JOIN reports lr ON lr.id = rm.lost_report_id
         WHERE rm.found_report_id = r.id
           AND lr.user_id = $1
           AND lr.lifecycle_status = 'active'
         ORDER BY rm.score DESC
         LIMIT 1
       ) matched ON TRUE
       WHERE r.category = 'Found'
         AND r.lifecycle_status = 'active'
         AND (
           r.user_id = $1
           OR matched.lost_report_id IS NOT NULL
           OR EXISTS (
             SELECT 1 FROM claims c
             WHERE c.report_id = r.id AND c.user_id = $1
           )
         )
       ORDER BY (matched.score IS NOT NULL) DESC,
                matched.score DESC NULLS LAST,
                r.created_at DESC`,
      [req.user.id]
    );
    return res.json(result.rows.map((row) => ({
      ...rowToReport(row),
      name: "",
      email: "",
      phone: "",
      relatedLostReportId: row.related_lost_report_id || null,
      matchScore: row.match_score || null,
      matchEvidence: row.match_evidence || [],
    })));
  } catch (error) {
    logError("reports.discovery_failed", error);
    return res.status(500).json({ error: "Found items could not be loaded." });
  }
};

exports.getActiveFoundReports = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*,
              ARRAY(SELECT ri.image_url FROM report_images ri WHERE ri.report_id = r.id ORDER BY ri.sort_order, ri.id) AS image_urls
       FROM reports r
       WHERE r.category = 'Found' AND r.lifecycle_status = 'active'
       ORDER BY r.created_at DESC`
    );
    return res.json(result.rows.map(rowToReport));
  } catch (error) {
    logError("reports.active_found_failed", error);
    return res.status(500).json({ error: "Active Found Reports could not be loaded." });
  }
};

exports.searchReports = async (req, res) => {
  const query = String(req.query?.q || "").trim();
  if (!query) {
    return res.json({ query: "", signals: {}, results: [], candidateCount: 0 });
  }
  if (query.length > 500) {
    return res.status(400).json({
      error: "Search text must be 500 characters or fewer.",
      code: "SEARCH_QUERY_TOO_LONG",
    });
  }

  const isAdmin = hasRole(req.user, "admin");
  const startedAt = Date.now();
  try {
    const result = await pool.query(
      isAdmin
        ? `SELECT r.*, ARRAY(SELECT ri.image_url FROM report_images ri WHERE ri.report_id = r.id ORDER BY ri.sort_order, ri.id) AS image_urls
           FROM reports r ORDER BY r.created_at DESC LIMIT 5000`
        : `SELECT r.*, ARRAY(SELECT ri.image_url FROM report_images ri WHERE ri.report_id = r.id ORDER BY ri.sort_order, ri.id) AS image_urls
           FROM reports r
           WHERE (r.category = 'Found' AND r.lifecycle_status = 'active')
              OR (r.user_id = $1)
           ORDER BY r.created_at DESC LIMIT 5000`,
      isAdmin ? [] : [req.user.id]
    );
    const candidates = result.rows.map(rowToReport);
    const search = searchReports(query, candidates);
    const results = search.results.map((report) => ({
      ...report,
      ...(isAdmin ? {} : { name: "", email: "", phone: "", userId: null }),
    }));
    logInfo("reports.search_completed", {
      userId: req.user.id,
      workspace: isAdmin ? "admin" : "student",
      candidateCount: candidates.length,
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
    });
    return res.json({
      query,
      signals: {
        reportType: search.parsed.reportType,
        category: search.parsed.category,
        dateRange: search.parsed.dateRange ? search.parsed.dateRange.label : null,
      },
      candidateCount: candidates.length,
      results,
    });
  } catch (error) {
    logError("reports.search_failed", error, { userId: req.user.id });
    return res.status(500).json({ error: "Reports could not be searched." });
  }
};

exports.getReportById = async (req, res) => {
  try {
    const isAdmin = hasRole(req.user, "admin");
    const result = await pool.query(
      isAdmin
        ? "SELECT * FROM reports WHERE id = $1"
        : "SELECT * FROM reports WHERE id = $1 AND user_id = $2 AND category = 'Lost'",
      isAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }
    res.json(rowToReport(result.rows[0]));
  } catch (err) {
    logError("reports.detail_failed", err);
    res.status(500).json({ error: "Failed to fetch report" });
  }
};

exports.updateReportStatus = async (req, res) => {
  try {
    const { status } = req.body;
    // Only allow Pending or Claimed — never "matched" or anything else
    const safeStatus = status === "Claimed" ? "Claimed" : "Pending";
    if (!hasRole(req.user, "admin")) {
      return res.status(403).json({ error: "Admin role required.", code: "ADMIN_REQUIRED" });
    }
    const result = await pool.query(
      "UPDATE reports SET status = $1 WHERE id = $2 RETURNING *",
      [safeStatus, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Report not found" });
    }
    res.json(rowToReport(result.rows[0]));
  } catch (err) {
    logError("reports.status_update_failed", err);
    res.status(500).json({ error: "Failed to update report" });
  }
};

exports.createReport = async (req, res) => {
  const body = req.body || {};
  const uploadedFiles = Array.isArray(req.files) ? req.files : [];

  const imageUrls = uploadedFiles.length
    ? uploadedFiles.map((file) => `/uploads/${file.filename}`)
    : [body.imageUrl || body.image_url].filter(Boolean);
  const imageUrl = imageUrls[0]
    ? imageUrls[0]
    : (body.imageUrl || body.image_url || null);

  const {
    itemName,
    category,
    itemCategory,
    location,
    dateFound,
    timeFound,
    phone,
    description,
    status,
  } = body;

  const allowedReportTypes = new Set(["Lost", "Found"]);
  const allowedItemCategories = new Set([
    "Accessories",
    "Bags",
    "Clothing",
    "Documents",
    "Electronics",
    "Keys",
    "Other",
  ]);

  if (!itemName || !itemName.trim() || !category || !itemCategory || !location) {
    return res
      .status(400)
      .json({ error: "Item name, report type, item category, and location are required." });
  }
  if (!allowedReportTypes.has(category)) {
    return res.status(400).json({ error: "Report type must be Lost or Found." });
  }
  if (!canCreateReportType(req.user, category)) {
    return res.status(403).json({
      error: "An active Student or Admin workspace is required to submit a report.",
    });
  }

  logInfo("reports.creation_requested", {
    userId: req.user.id,
    reportType: category,
    imageCount: imageUrls.length,
  });
  if (!allowedItemCategories.has(itemCategory)) {
    return res.status(400).json({ error: "Select a valid item category." });
  }

  // Map camelCase → snake_case, apply safe defaults for optional fields
  const values = [
    itemName.trim(),              // $1  item_name
    category.trim(),              // $2  category
    location.trim(),              // $3  location
    dateFound    || null,         // $4  date_found
    timeFound    || null,         // $5  time_found
    req.user.name,                // $6  name
    req.user.email,               // $7  email
    phone        || null,         // $8  phone
    description  || null,        // $9  description
    status       || "Pending",   // $10 status
    imageUrl,                    // $11 image_url
    itemCategory.trim(),         // $12 item_category
    req.user.id,                 // $13 user_id
  ];


  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const insertResult = await client.query(
      `INSERT INTO reports
         (item_name, category, location, date_found, time_found, name, email, phone, description, status, image_url, item_category, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      values
    );

    const newReport = rowToReport(insertResult.rows[0]);
    if (imageUrls.length) {
      await client.query(
        `INSERT INTO report_images (report_id, image_url, sort_order)
         SELECT $1, image_url, ordinal - 1
         FROM UNNEST($2::text[]) WITH ORDINALITY AS images(image_url, ordinal)
         ON CONFLICT DO NOTHING`,
        [newReport.id, imageUrls]
      );
      newReport.imageUrls = imageUrls;
      newReport.imageUrl = imageUrls[0];
    }
    logInfo("reports.created", { reportId: newReport.id, reportType: newReport.category });

    let matches = [];
    if (newReport.category === "Lost") {
      const candidateResult = await client.query(
        `SELECT * FROM reports
         WHERE id <> $1
           AND category = 'Found'
           AND lifecycle_status = 'active'
         ORDER BY created_at DESC`,
        [newReport.id]
      );
      const foundCandidates = candidateResult.rows.map(rowToReport);

      logInfo("matching.comparison_started", {
        reportId: newReport.id,
        candidateCount: foundCandidates.length,
      });
      matches = await persistMatchesAndNotify(client, newReport, foundCandidates);

      logInfo("matching.comparison_completed", {
        reportId: newReport.id,
        matchCount: matches.length,
      });
    }

    await client.query("COMMIT");
    res.status(201).json({ report: newReport, matches });
  } catch (err) {
    await client.query("ROLLBACK");
    logError("reports.creation_failed", err);
    res.status(500).json({ error: "Failed to create report" });
  } finally {
    client.release();
  }
};

exports.closeLostReport = async (req, res) => {
  const reason = String(req.body?.reason || "").toLowerCase();
  if (!["found_item", "no_longer_searching"].includes(reason)) {
    return res.status(400).json({
      error: "Reason must be found_item or no_longer_searching.",
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reportResult = await client.query(
      `SELECT * FROM reports
       WHERE id = $1 AND user_id = $2 AND category = 'Lost'
       FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    const report = reportResult.rows[0];
    if (!report) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lost Report not found." });
    }
    if (report.lifecycle_status !== "active") {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Lost Report is already closed." });
    }

    await client.query(
      `UPDATE reports
       SET lifecycle_status = 'closed_by_student',
           status = 'Closed by Student',
           closed_at = NOW(),
           closed_reason = $3
       WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id, reason]
    );
    const cancelled = await client.query(
      `UPDATE claims
       SET status = 'cancelled', closed_at = NOW()
       WHERE lost_report_id = $1 AND status IN ('pending', 'under_review')
       RETURNING id`,
      [req.params.id]
    );
    for (const claim of cancelled.rows) {
      await client.query(
        `INSERT INTO claim_history
           (claim_id, actor_id, event_type, from_status, to_status, reason)
         VALUES ($1, $2, 'report_closed', 'pending', 'cancelled', $3)`,
        [claim.id, req.user.id, reason]
      );
    }
    await client.query("COMMIT");
    return res.json({
      id: Number(req.params.id),
      status: "Closed by Student",
      lifecycleStatus: "closed_by_student",
      cancelledClaimIds: cancelled.rows.map((row) => row.id),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logError("reports.close_failed", error);
    return res.status(500).json({ error: "Failed to close Lost Report." });
  } finally {
    client.release();
  }
};

exports.getPotentialMatches = async (req, res) => {
  try {
    const reportResult = await pool.query(
      `SELECT * FROM reports
       WHERE id = $1 AND user_id = $2 AND category = 'Lost'`,
      [req.params.id, req.user.id]
    );
    if (!reportResult.rows[0]) {
      return res.status(404).json({ error: "Lost Report not found." });
    }
    const result = await pool.query(
      `SELECT r.*, rm.score AS match_score, rm.evidence AS match_evidence
       FROM report_matches rm
       INNER JOIN reports r ON r.id = rm.found_report_id
       WHERE rm.lost_report_id = $1
         AND r.lifecycle_status = 'active'
       ORDER BY rm.score DESC`,
      [req.params.id]
    );
    return res.json(result.rows.map((row) => ({
      ...rowToReport(row),
      matchScore: row.match_score,
      matchEvidence: row.match_evidence,
    })));
  } catch (error) {
    logError("reports.matches_failed", error);
    return res.status(500).json({ error: "Failed to fetch potential matches." });
  }
};

exports.rowToReport = rowToReport;
