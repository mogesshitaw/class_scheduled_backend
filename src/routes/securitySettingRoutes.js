const express = require('express');
const router = express.Router(); 
const {
  getSecuritySetting,
  upsertSecuritySetting,
  getCurrentSecuritySetting,
  getAllSecuritySetting
} = require('../controllers/securitySettingController');
const { sessionAuth } = require('../middleware/sessionAuth'); // Use session auth

router.get('/', getAllSecuritySetting);
router.get('/:id_number', getSecuritySetting);
router.post('/', upsertSecuritySetting);
router.get('/current', sessionAuth, getCurrentSecuritySetting);

module.exports = router;