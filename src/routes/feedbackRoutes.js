// routes/feedback.js
const express = require('express');
const router = express.Router();
const { 
  createFeedback, 
  listFeedback, 
  updateFeedbackStatus, 
  deleteFeedback 
} = require('../controllers/feedbackController');

router.post('/', createFeedback);
router.get('/', listFeedback);
router.patch('/:id/status', updateFeedbackStatus);
router.delete('/:id', deleteFeedback);

module.exports = router;