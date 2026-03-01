// src/routes/chatRoutes.js
const express = require("express");
const router = express.Router();
const {
  getUserContacts,
  createContact,
  updateContact,
  deleteContact,
  getDirectMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  getUnreadCount,
  markMessagesAsRead,
  searchContacts,
  respondToContactRequest,
  getDirectMessagesByUserId,
  getAllUsersWithContactStatus
} = require("../controllers/chatController");
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  req.user = req.session.user;
  next();
};

// Apply auth middleware to all chat routes
router.use(requireAuth);

// User contacts routes
router.get("/contacts", getUserContacts);
router.post("/contacts", createContact);
router.put("/contacts/:contactId", updateContact);
router.delete("/contacts/:contactId", deleteContact);
router.get("/contacts/search", searchContacts);
router.post("/contacts/:contactId/respond", respondToContactRequest); // New route for accept/reject

// Messages routes
router.get("/messages/:contactId", getDirectMessages);
router.get('/messages/user/:userId', getDirectMessagesByUserId);
router.post("/messages", sendMessage);
router.put("/messages/:messageId", updateMessage);
router.delete("/messages/:messageId", deleteMessage);

// Message status routes
router.get("/messages/unread/count", getUnreadCount);
router.put("/messages/read/:contactId", markMessagesAsRead);
router.get("/users/all", getAllUsersWithContactStatus);

module.exports = router;