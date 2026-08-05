const express = require("express");
const pool = require("../db");
const { createAuthenticate } = require("../middleware/authenticate");
const {
  getNotifications,
  markRead,
} = require("../controllers/notificationController");

const router = express.Router();
router.use(createAuthenticate(pool));
router.get("/", getNotifications);
router.patch("/:id/read", markRead);

module.exports = router;
