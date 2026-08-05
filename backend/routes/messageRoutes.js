const express = require("express");
const router  = express.Router();

const { getMessages, createMessage, getConversations } = require("../controllers/messageController");
const pool = require("../db");
const { createAuthenticate } = require("../middleware/authenticate");
const authenticate = createAuthenticate(pool);

router.use(authenticate);
router.get("/conversations", getConversations);
router.get("/:claim_id", getMessages);
router.post("/",         createMessage);

module.exports = router;
