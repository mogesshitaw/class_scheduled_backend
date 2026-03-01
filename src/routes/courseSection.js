const express = require('express');
const router = express.Router();
const {
  getAllSectionAssignments,
  getSectionAssignmentsByCourseBatch,
  createSectionAssignment,
  updateSectionAssignment,
  deleteSectionAssignment,
  getAvailableSections,
  getAvailableInstructors,
  createMultipleSectionAssignments
} = require('../controllers/corsessectionController');

// Import middleware
// const requireAuth = (req, res, next) => {
//   if (!req.session || !req.session.user) {
//     return res.status(401).json({ error: 'Authentication required' });
//   }
//   req.user = req.session.user;
//   next();
// };
// router.use(requireAuth);

router.get('/', getAllSectionAssignments);


router.get('/course-batch/:courseBatchId', getSectionAssignmentsByCourseBatch);

router.get('/available-sections/:courseBatchId', getAvailableSections);


router.get('/available-instructors/:courseBatchId', getAvailableInstructors);


router.post('/', createSectionAssignment);

router.post('/bulk', createMultipleSectionAssignments);

router.put('/:id', updateSectionAssignment);


router.delete('/:id', deleteSectionAssignment);

module.exports = router;