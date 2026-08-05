const pool = require("../db");
const { getWorkflowConfig } = require("../config/workflow");
const { hasRole } = require("../middleware/authorize");
const { createNotification } = require("../services/notificationService");
const { studentClaimView } = require("../services/claimPolicy");
const { assertTransition, statusLabel } = require("../services/claimLifecycleService");
const { logError } = require("../utils/safeLogger");

const MANUAL_REJECTION_REASON = "Ownership could not be verified.";
const AUTOMATIC_REJECTION_REASON =
  "This claim was automatically closed because the item has already been returned to another verified claimant.";
const ACTIVE_CLAIM_STATUSES = ["pending", "under_review", "action_required", "approved", "returned"];

function sendClaimError(res, error, fallbackMessage, logContext) {
  if (Number.isInteger(error?.status) && error.status < 500) {
    return res.status(error.status).json({
      error: error.message || fallbackMessage,
      code: error.code,
    });
  }
  logError(logContext, error);
  return res.status(500).json({ error: fallbackMessage });
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function notifyAdmins(client, values) {
  const admins = await client.query("SELECT user_id FROM user_roles WHERE role = 'admin'");
  for (const admin of admins.rows) {
    await createNotification(client, { ...values, userId: admin.user_id });
  }
}

function claimSelect(includeNotes = false) {
  return `SELECT
    c.*, COALESCE(r.item_name, c.item_name) AS found_item_name,
    COALESCE(r.location, c.location) AS found_location,
    COALESCE(r.item_category, c.item_category) AS found_item_category,
    COALESCE(r.description, c.description) AS found_description,
    COALESCE(r.date_found, c.item_date) AS found_date,
    COALESCE(r.image_url, c.image_url) AS found_image_url,
    r.lifecycle_status AS found_lifecycle_status,
    lr.item_name AS lost_item_name, lr.user_id AS lost_report_owner_id,
    u.name AS student_name, u.email AS authenticated_student_email,
    u.student_id AS authenticated_student_id,
    COALESCE((SELECT JSON_AGG(JSON_BUILD_OBJECT(
      'id', h.id, 'eventType', h.event_type, 'fromStatus', h.from_status,
      'toStatus', h.to_status, 'reason', h.reason, 'metadata', h.metadata,
      'createdAt', h.created_at
    ) ORDER BY h.created_at) FROM claim_history h WHERE h.claim_id = c.id), '[]'::json) AS timeline
    ${includeNotes ? `, COALESCE((
      SELECT JSON_AGG(JSON_BUILD_OBJECT(
        'id', n.id, 'note', n.note, 'adminId', n.admin_id, 'createdAt', n.created_at
      ) ORDER BY n.created_at)
      FROM claim_admin_notes n WHERE n.claim_id = c.id
    ), '[]'::json) AS admin_notes` : ""}
    FROM claims c
    LEFT JOIN reports r ON r.id = c.report_id
    LEFT JOIN reports lr ON lr.id = c.lost_report_id
    LEFT JOIN users u ON u.id = c.user_id`;
}

exports.getClaims = async (req, res) => {
  try {
    const admin = hasRole(req.user, "admin");
    const result = await pool.query(
      `${claimSelect(admin)}
       ${admin ? "" : "WHERE c.user_id = $1"}
       ORDER BY c.created_at DESC`,
      admin ? [] : [req.user.id]
    );
    return res.json(admin ? result.rows : result.rows.map(studentClaimView));
  } catch (error) {
    logError("claims.list_failed", error);
    return res.status(500).json({ error: "Failed to fetch claims." });
  }
};

exports.createClaim = async (req, res) => {
  const {
    report_id: foundReportId,
    lost_report_id: lostReportId,
    ownership_verification: ownershipVerificationRaw,
    supporting_information: supportingInformation,
    student_comments: studentComments,
    item_name: manualItemNameRaw,
    item_category: manualItemCategoryRaw,
    location: manualLocationRaw,
    item_date: manualItemDateRaw,
    item_description: manualDescriptionRaw,
  } = req.body || {};
  const manualEntry = req.body?.manual_entry === true || req.body?.manual_entry === "true";
  const ownershipVerification = String(ownershipVerificationRaw || req.body?.description || "").trim();
  const manualItem = {
    item_name: String(manualItemNameRaw || "").trim(),
    item_category: String(manualItemCategoryRaw || "").trim(),
    location: String(manualLocationRaw || "").trim(),
    item_date: String(manualItemDateRaw || "").trim(),
    description: String(manualDescriptionRaw || "").trim(),
  };
  const allowedCategories = new Set([
    "Accessories", "Bags", "Clothing", "Documents", "Electronics", "Keys", "Other",
  ]);
  if (!ownershipVerification) {
    return res.status(400).json({
      error: "Ownership verification is required.",
    });
  }
  if (manualEntry && (foundReportId || lostReportId)) {
    return res.status(400).json({ error: "A manual claim cannot include a report identifier." });
  }
  if (manualEntry && (!manualItem.item_name || !allowedCategories.has(manualItem.item_category)
      || !manualItem.location || !isValidIsoDate(manualItem.item_date) || !manualItem.description
      || manualItem.item_name.length > 200 || manualItem.location.length > 300
      || manualItem.description.length > 5000)) {
    return res.status(400).json({
      error: "Item name, category, location, date, and description are required for a manual claim.",
    });
  }
  if (!manualEntry && !foundReportId) {
    return res.status(400).json({ error: "A Found Report is required for this claim." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const reportResult = manualEntry ? { rows: [manualItem] } : await client.query(
      `SELECT fr.id AS found_id, fr.lifecycle_status AS found_status,
              fr.item_name, fr.location, fr.description, fr.image_url,
              lr.id AS lost_id, lr.user_id AS owner_id, lr.lifecycle_status AS lost_status
       FROM reports fr
       LEFT JOIN reports lr ON lr.id = $1 AND lr.category = 'Lost'
       WHERE fr.id = $2 AND fr.category = 'Found'
       FOR UPDATE OF fr`,
      [lostReportId || null, foundReportId]
    );
    const reports = reportResult.rows[0];
    if (!reports || (!manualEntry && lostReportId && reports.owner_id !== req.user.id)) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Eligible Found Report or owned Lost Report not found." });
    }
    if (!manualEntry && ((lostReportId && reports.lost_status !== "active") || reports.found_status !== "active")) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "This match is no longer active." });
    }

    if (!manualEntry && lostReportId) {
      const matchResult = await client.query(
        `SELECT 1 FROM report_matches WHERE lost_report_id = $1 AND found_report_id = $2`,
        [lostReportId, foundReportId]
      );
      if (!matchResult.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(403).json({ error: "The selected Lost Report is not a suggested match." });
      }
    }

    const activeResult = await client.query(
      `SELECT COUNT(*)::int AS count FROM claims
       WHERE lost_report_id = $1
         AND status = ANY($2::text[])`,
      [lostReportId, ACTIVE_CLAIM_STATUSES]
    );
    if (lostReportId && activeResult.rows[0].count >= 3) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "This Lost Report already has three active claims.",
        code: "ACTIVE_CLAIM_LIMIT",
      });
    }

    const expiryDays = getWorkflowConfig().claimExpiryDays;
    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : req.body.image_url || req.body.image || null;
    const result = await client.query(
      `INSERT INTO claims
        (lost_report_id, report_id, student_id, student_email, item_name,
         location, description, user_id, image_url, status, expires_at,
         ownership_verification, supporting_information, student_comments,
         item_category, item_date, manual_entry)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending',
               NOW() + ($10 * INTERVAL '1 day'), $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        lostReportId ? Number(lostReportId) : null,
        manualEntry ? null : Number(foundReportId),
        req.user.studentId,
        req.user.email,
        reports.item_name,
        reports.location,
        reports.description || ownershipVerification,
        req.user.id,
        imageUrl,
        expiryDays,
        ownershipVerification,
        String(supportingInformation || "").trim() || null,
        String(studentComments || "").trim() || null,
        manualEntry ? manualItem.item_category : null,
        manualEntry ? manualItem.item_date : null,
        manualEntry,
      ]
    );
    await client.query(
      `INSERT INTO claim_history
         (claim_id, actor_id, event_type, to_status)
       VALUES ($1, $2, 'created', 'pending')`,
      [result.rows[0].id, req.user.id]
    );
    await createNotification(client, {
      userId: req.user.id,
      type: "claim_submitted",
      title: "Claim submitted",
      message: "Your claim is pending administrator review.",
      claimId: result.rows[0].id,
      reportId: manualEntry ? null : Number(foundReportId),
    });
    await notifyAdmins(client, {
      type: "new_claim_submitted",
      title: "New claim submitted",
      message: `${req.user.name} submitted a claim for ${reports.item_name}.`,
      claimId: result.rows[0].id,
      reportId: manualEntry ? null : Number(foundReportId),
    });
    await client.query("COMMIT");
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({
        error: "You already have an active claim for this Found Item.",
        code: "DUPLICATE_CLAIM",
      });
    }
    logError("claims.creation_failed", error);
    return res.status(500).json({ error: "Failed to submit claim." });
  } finally {
    client.release();
  }
};

exports.cancelClaim = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE claims
       SET status = 'cancelled', closed_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'pending' AND reviewed_at IS NULL
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(409).json({
        error: "Only your own unreviewed pending claim can be cancelled.",
        code: "CLAIM_NOT_CANCELLABLE",
      });
    }
    await pool.query(
      `INSERT INTO claim_history
         (claim_id, actor_id, event_type, from_status, to_status)
       VALUES ($1, $2, 'student_cancelled', 'pending', 'cancelled')`,
      [req.params.id, req.user.id]
    );
    return res.json(result.rows[0]);
  } catch (error) {
    logError("claims.cancel_failed", error);
    return res.status(500).json({ error: "Failed to cancel claim." });
  }
};

exports.beginReview = async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE claims
       SET status = 'under_review', reviewed_at = COALESCE(reviewed_at, NOW()),
           reviewed_by = $2
       WHERE id = $1 AND status IN ('pending', 'under_review')
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(409).json({ error: "Claim cannot enter review." });
    }
    if (result.rows[0].status === "under_review") {
      await pool.query(
        `INSERT INTO claim_history (claim_id, actor_id, event_type, from_status, to_status)
         SELECT $1, $2, 'admin_reviewing', 'pending', 'under_review'
         WHERE NOT EXISTS (SELECT 1 FROM claim_history WHERE claim_id = $1 AND event_type = 'admin_reviewing')`,
        [req.params.id, req.user.id]
      );
    }
    return res.json(result.rows[0]);
  } catch (error) {
    logError("claims.review_failed", error);
    return res.status(500).json({ error: "Failed to begin claim review." });
  }
};

exports.getRelatedClaims = async (req, res) => {
  try {
    const target = await pool.query(
      "SELECT id, lost_report_id FROM claims WHERE id = $1",
      [req.params.id]
    );
    if (!target.rows[0]) return res.status(404).json({ error: "Claim not found." });
    const result = await pool.query(
      `${claimSelect(false)}
       WHERE c.lost_report_id = $1
         AND c.id <> $2
         AND c.status IN ('pending', 'under_review')
       ORDER BY c.created_at`,
      [target.rows[0].lost_report_id, req.params.id]
    );
    return res.json(result.rows.map((claim) => ({ ...claim, suggested: true })));
  } catch (error) {
    logError("claims.related_failed", error);
    return res.status(500).json({ error: "Failed to fetch related claims." });
  }
};

exports.decideClaim = async (req, res) => {
  const decision = String(req.body?.decision || "").toLowerCase();
  const closeClaimIds = Array.isArray(req.body?.closeClaimIds)
    ? [...new Set(req.body.closeClaimIds.map(Number).filter(Number.isSafeInteger))]
    : [];
  const adminNotes = String(req.body?.adminNotes || "").trim();
  const suppliedReason = String(req.body?.reason || "").trim();
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ error: "Decision must be approve or reject." });
  }
  if (decision === "reject" && !suppliedReason) {
    return res.status(400).json({ error: "A rejection reason is required." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const claimResult = await client.query(
      "SELECT * FROM claims WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    const claim = claimResult.rows[0];
    if (!claim || !["pending", "under_review"].includes(claim.status)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Claim is not available for a decision." });
    }

    const nextStatus = decision === "approve" ? "approved" : "rejected";
    assertTransition(claim.status, nextStatus);
    const rejectionType = decision === "reject" ? "manual" : null;
    const rejectionReason = decision === "reject" ? suppliedReason : null;
    const updated = await client.query(
      `UPDATE claims
       SET status = $2, reviewed_at = COALESCE(reviewed_at, NOW()),
           reviewed_by = $3, rejection_type = $4, rejection_reason = $5,
           approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END,
           closed_at = CASE WHEN $2 = 'rejected' THEN NOW() ELSE closed_at END,
           verification_request = NULL
       WHERE id = $1
       RETURNING *`,
      [claim.id, nextStatus, req.user.id, rejectionType, rejectionReason]
    );

    if (adminNotes) {
      await client.query(
        `INSERT INTO claim_admin_notes (claim_id, admin_id, note)
         VALUES ($1, $2, $3)`,
        [claim.id, req.user.id, adminNotes]
      );
    }
    await client.query(
      `INSERT INTO claim_history
         (claim_id, actor_id, event_type, from_status, to_status, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        claim.id,
        req.user.id,
        decision === "approve" ? "approved" : "manual_rejected",
        claim.status,
        nextStatus,
        rejectionReason,
      ]
    );

    let closedRelated = [];
    if (decision === "approve") {
      await client.query(
        `UPDATE reports
         SET lifecycle_status = 'claimed', claim_status = 'approved', status = 'Claimed — Awaiting Return'
         WHERE id = ANY($1::int[])`,
        [[claim.report_id, claim.lost_report_id].filter(Boolean)]
      );
      if (closeClaimIds.length) {
        const related = await client.query(
          `UPDATE claims
           SET status = 'automatically_rejected',
               rejection_type = 'automatic',
               rejection_reason = $4,
               reviewed_at = COALESCE(reviewed_at, NOW()),
               reviewed_by = $3,
               closed_at = NOW()
           WHERE id = ANY($1::int[])
             AND lost_report_id = $2
             AND id <> $5
             AND status IN ('pending', 'under_review')
           RETURNING id, user_id`,
          [
            closeClaimIds,
            claim.lost_report_id,
            req.user.id,
            AUTOMATIC_REJECTION_REASON,
            claim.id,
          ]
        );
        closedRelated = related.rows;
        for (const relatedClaim of closedRelated) {
          await client.query(
            `INSERT INTO claim_history
               (claim_id, actor_id, event_type, from_status, to_status, reason)
             VALUES ($1, $2, 'automatic_rejected', 'pending',
                     'automatically_rejected', $3)`,
            [relatedClaim.id, req.user.id, AUTOMATIC_REJECTION_REASON]
          );
          await createNotification(client, {
            userId: relatedClaim.user_id,
            type: "claim_automatically_rejected",
            title: "Claim closed",
            message: AUTOMATIC_REJECTION_REASON,
            claimId: relatedClaim.id,
          });
        }
      }
    }
    await createNotification(client, {
      userId: claim.user_id,
      type: decision === "approve" ? "claim_approved" : "claim_rejected",
      title: decision === "approve" ? "Claim approved" : "Claim rejected",
      message: decision === "approve"
        ? "Your ownership claim was approved. The item is ready for collection."
        : rejectionReason,
      claimId: claim.id,
      reportId: claim.report_id,
    });
    await client.query("COMMIT");
    return res.json({
      claim: updated.rows[0],
      closedRelatedClaimIds: closedRelated.map((row) => row.id),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ error: "This item already has an approved claim." });
    }
    logError("claims.decision_failed", error);
    return res.status(500).json({ error: "Failed to decide claim." });
  } finally {
    client.release();
  }
};

exports.requestMoreVerification = async (req, res) => {
  const explanation = String(req.body?.explanation || "").trim();
  if (!explanation) return res.status(400).json({ error: "Explain what additional proof is required." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM claims WHERE id = $1 FOR UPDATE", [req.params.id]);
    const claim = current.rows[0];
    if (!claim) {
      const error = new Error("Claim not found."); error.status = 404; throw error;
    }
    assertTransition(claim.status, "action_required");
    const updated = await client.query(
      `UPDATE claims SET status = 'action_required', verification_request = $2,
       reviewed_at = COALESCE(reviewed_at, NOW()), reviewed_by = $3
       WHERE id = $1 RETURNING *`,
      [claim.id, explanation, req.user.id]
    );
    await client.query(
      `INSERT INTO claim_history (claim_id, actor_id, event_type, from_status, to_status, reason)
       VALUES ($1, $2, 'additional_verification_requested', $3, 'action_required', $4)`,
      [claim.id, req.user.id, claim.status, explanation]
    );
    await createNotification(client, { userId: claim.user_id, type: "verification_requested",
      title: "More information requested", message: explanation, claimId: claim.id, reportId: claim.report_id });
    await client.query("COMMIT");
    return res.json({ claim: updated.rows[0], statusLabel: statusLabel("action_required", "student") });
  } catch (error) {
    await client.query("ROLLBACK");
    return sendClaimError(res, error, "Verification request failed.", "claims.verification_request_failed");
  } finally { client.release(); }
};

exports.resubmitVerification = async (req, res) => {
  const ownershipVerification = String(req.body?.ownershipVerification || "").trim();
  const supportingInformation = String(req.body?.supportingInformation || "").trim();
  const studentComments = String(req.body?.studentComments || "").trim();
  if (!ownershipVerification) return res.status(400).json({ error: "Ownership verification is required." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM claims WHERE id = $1 AND user_id = $2 FOR UPDATE", [req.params.id, req.user.id]);
    const claim = current.rows[0];
    if (!claim) {
      const error = new Error("Claim not found."); error.status = 404; throw error;
    }
    assertTransition(claim.status, "pending");
    const updated = await client.query(
      `UPDATE claims SET status = 'pending', ownership_verification = $3,
       supporting_information = $4, student_comments = $5,
       verification_request = NULL, verification_version = verification_version + 1,
       resubmitted_at = NOW(), reviewed_at = NULL, reviewed_by = NULL
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [claim.id, req.user.id, ownershipVerification, supportingInformation || null, studentComments || null]
    );
    await client.query(
      `INSERT INTO claim_history (claim_id, actor_id, event_type, from_status, to_status, metadata)
       VALUES ($1, $2, 'student_resubmitted', 'action_required', 'pending', JSONB_BUILD_OBJECT('verificationVersion', $3::int))`,
      [claim.id, req.user.id, claim.verification_version + 1]
    );
    await notifyAdmins(client, { type: "verification_resubmitted", title: "Student resubmitted verification",
      message: `${req.user.name} updated claim #${claim.id}.`, claimId: claim.id, reportId: claim.report_id });
    await client.query("COMMIT");
    return res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendClaimError(res, error, "Verification update failed.", "claims.verification_update_failed");
  } finally { client.release(); }
};

async function transitionResolution(req, res, targetStatus) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query("SELECT * FROM claims WHERE id = $1 FOR UPDATE", [req.params.id]);
    const claim = current.rows[0];
    if (!claim) {
      const error = new Error("Claim not found."); error.status = 404; throw error;
    }
    assertTransition(claim.status, targetStatus);
    const eventType = targetStatus === "returned" ? "item_returned" : "case_closed";
    const updated = await client.query(
      `UPDATE claims SET status = $2,
       returned_at = CASE WHEN $2 = 'returned' THEN NOW() ELSE returned_at END,
       archived_at = CASE WHEN $2 = 'closed' THEN NOW() ELSE archived_at END,
       closed_at = CASE WHEN $2 = 'closed' THEN NOW() ELSE closed_at END
       WHERE id = $1 RETURNING *`, [claim.id, targetStatus]
    );
    await client.query(
      `INSERT INTO claim_history (claim_id, actor_id, event_type, from_status, to_status)
       VALUES ($1, $2, $3, $4, $5)`, [claim.id, req.user.id, eventType, claim.status, targetStatus]
    );
    await client.query(
      `UPDATE reports SET lifecycle_status = $2,
       status = $3, claim_status = $4 WHERE id = ANY($1::int[])`,
      [[claim.report_id, claim.lost_report_id].filter(Boolean),
       targetStatus === "returned" ? "returned" : "archived",
       targetStatus === "returned" ? "Returned" : "Closed",
       targetStatus]
    );
    await createNotification(client, { userId: claim.user_id,
      type: targetStatus === "returned" ? "item_returned" : "case_closed",
      title: targetStatus === "returned" ? "Item returned" : "Recovery case closed",
      message: targetStatus === "returned" ? "The item return was confirmed." : "Your recovery case is now closed.",
      claimId: claim.id, reportId: claim.report_id });
    await client.query("COMMIT");
    return res.json(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    return sendClaimError(res, error, "Claim transition failed.", "claims.transition_failed");
  } finally { client.release(); }
}

exports.markReturned = (req, res) => transitionResolution(req, res, "returned");
exports.closeClaimCase = (req, res) => transitionResolution(req, res, "closed");

exports.addAdminNote = async (req, res) => {
  const note = String(req.body?.note || "").trim();
  if (!note) return res.status(400).json({ error: "Note cannot be empty." });
  try {
    const exists = await pool.query("SELECT id FROM claims WHERE id = $1", [req.params.id]);
    if (!exists.rows[0]) return res.status(404).json({ error: "Claim not found." });
    const result = await pool.query(
      `INSERT INTO claim_admin_notes (claim_id, admin_id, note)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, req.user.id, note]
    );
    return res.status(201).json(result.rows[0]);
  } catch (error) {
    logError("claims.admin_note_failed", error);
    return res.status(500).json({ error: "Failed to save Admin Notes." });
  }
};

exports.MANUAL_REJECTION_REASON = MANUAL_REJECTION_REASON;
exports.AUTOMATIC_REJECTION_REASON = AUTOMATIC_REJECTION_REASON;
