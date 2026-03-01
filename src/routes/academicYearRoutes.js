const express = require('express');
const router = express.Router();
const academicYearController = require('../controllers/academicYearController');

// Academic year routes
router.get('/', academicYearController.getAllAcademicYears);
router.post('/', academicYearController.createAcademicYear);
router.put('/:id', academicYearController.updateAcademicYear);
router.patch('/:id/status', academicYearController.updateAcademicYearStatus);
router.delete('/:id', academicYearController.deleteAcademicYear);
router.post('/update-expired', academicYearController.updateExpiredAcademicYears);

module.exports = router;