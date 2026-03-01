// src/routes/courseBatchRoutes.js
const express = require("express");
const router = express.Router();
const {
  getAllCourseBatches,
  getCourseBatchById,
  createCourseBatch,
  createMultipleCourseBatches,
  updateCourseBatch,
  deleteCourseBatch,
  getCourseBatchesByFilter,
  getAvailableCourses
} = require("../controllers/courseBatchController");

// Get all course-batch assignments
router.get("/", getAllCourseBatches);

// Get specific course-batch assignment
router.get("/:id", getCourseBatchById);

// Create new course-batch assignment
router.post("/", createCourseBatch);

// Create multiple course-batch assignments (bulk)
router.post("/bulk", createMultipleCourseBatches);

// Update course-batch assignment
router.put("/:id", updateCourseBatch);

// Delete course-batch assignment
router.delete("/:id", deleteCourseBatch);

// Filter course-batch assignments
router.get("/filter/by", getCourseBatchesByFilter);

// Get available courses for assignment
router.get("/available-courses", getAvailableCourses);

module.exports = router;