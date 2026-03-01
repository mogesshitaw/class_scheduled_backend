const express = require('express');
const router = express.Router();
const { sessionAuth } = require('../middleware/sessionAuth'); // Use session auth
const {
  getAnnouncements,
  getAnnouncementById,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  togglePublish
} = require('../controllers/announcementController');

// Public routes
router.get('/', getAnnouncements);
router.get('/:id', getAnnouncementById);

// Protected routes - use sessionAuth instead of token auth
router.post('/', sessionAuth, createAnnouncement);
router.put('/:id', sessionAuth, updateAnnouncement);
router.delete('/:id', sessionAuth, deleteAnnouncement);
router.patch('/:id/toggle-publish', sessionAuth, togglePublish);

module.exports = router;