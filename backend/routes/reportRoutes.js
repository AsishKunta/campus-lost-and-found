const express = require("express");
const router  = express.Router();
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
const { requireRole } = require("../middleware/authorize");
const authenticate = createAuthenticate(pool);

// Images are now uploaded directly to Supabase Storage from the frontend.
// The backend receives only JSON with an image_url string — no file handling needed.
const {
  getReports,
  getReportById,
  createReport,
  updateReportStatus,
  closeLostReport,
  getPotentialMatches,
  discoverFoundReports,
  getMyLostReports,
  getStudentLostReports,
  searchReports,
  getActiveFoundReports,
} = require("../controllers/reportController");

router.use(authenticate);
router.get("/",      getReports);
router.get("/discover", requireRole("student"), discoverFoundReports);
router.get("/mine", requireRole("student"), getMyLostReports);
router.get("/student-lost", requireRole("admin"), getStudentLostReports);
router.get("/active-found", requireRole("admin"), getActiveFoundReports);
router.get("/search", searchReports);
router.get("/:id/matches", requireRole("student"), getPotentialMatches);
router.post("/:id/close", requireRole("student"), closeLostReport);
router.get("/:id",   getReportById);
router.post("/",     upload.array("images", 5), createReport);
router.patch("/:id", updateReportStatus);

module.exports = router;
