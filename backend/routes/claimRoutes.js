const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { imageUploadOptions } = require("../config/upload");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "..", "uploads")),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext || ".png"}`);
  },
});

const upload = multer(imageUploadOptions(storage));
const pool = require("../db");
const { createAuthenticate } = require("../middleware/authenticate");
const authenticate = createAuthenticate(pool);
const { requireRole } = require("../middleware/authorize");

const {
  getClaims,
  createClaim,
  cancelClaim,
  beginReview,
  getRelatedClaims,
  decideClaim,
  addAdminNote,
  requestMoreVerification,
  resubmitVerification,
  markReturned,
  closeClaimCase,
} = require("../controllers/claimController");

router.use(authenticate);
router.get("/", getClaims);
router.post("/", requireRole("student"), upload.single("image"), createClaim);
router.post("/:id/cancel", requireRole("student"), cancelClaim);
router.post("/:id/review", requireRole("admin"), beginReview);
router.get("/:id/related", requireRole("admin"), getRelatedClaims);
router.post("/:id/decision", requireRole("admin"), decideClaim);
router.post("/:id/request-verification", requireRole("admin"), requestMoreVerification);
router.patch("/:id/verification", requireRole("student"), resubmitVerification);
router.post("/:id/return", requireRole("admin"), markReturned);
router.post("/:id/close", requireRole("admin"), closeClaimCase);
router.post("/:id/admin-notes", requireRole("admin"), addAdminNote);

module.exports = router;
