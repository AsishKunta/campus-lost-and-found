const express = require("express");
const router  = express.Router();

const {
  signup,
  login,
  logout,
  me,
  setWorkspace,
  developmentStatus,
  getProfile,
  forgotPassword,
  completePasswordReset,
} = require("../controllers/authController");
const pool = require("../db");
const { createAuthenticate } = require("../middleware/authenticate");
const authenticate = createAuthenticate(pool);

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

// POST /auth/signup
router.post("/signup", signup);

// POST /auth/login
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", completePasswordReset);

// POST /auth/logout
router.post("/logout", logout);
router.get("/development-status", developmentStatus);

// GET /auth/me
router.get("/me", authenticate, me);

// GET /auth/profile/:email
router.get("/profile/:email", authenticate, getProfile);
router.patch("/workspace", authenticate, setWorkspace);

module.exports = router;
