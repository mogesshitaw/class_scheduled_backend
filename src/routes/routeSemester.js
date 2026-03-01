const express = require('express');
const router = express.Router();
const semesterController = require('../controllers/semesterController');

// Semester name routes
router.get('/', semesterController.getAllSemesters);
router.post('/', semesterController.createSemester);
router.put('/:id', semesterController.updateSemester);
router.delete('/:id', semesterController.deleteSemester);

module.exports = router;