const express = require("express");
const router = express.Router();
const { 
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  getAvailableInstructors,
  getCourseInstructors,
  assignInstructorsToCourse,
  removeInstructorAssignment,
  updateAssignmentStatus,
  getAllAssignments
} = require("../controllers/courseController");

// CRUD routes for courses
router.post("/", createCourse);
router.get("/", getCourse);
router.put("/:id", updateCourse);
router.delete("/:id", deleteCourse);

// Instructor assignment routes
router.get("/instructors", getAvailableInstructors); // Get all available instructors
router.get("/:courseId/instructors", getCourseInstructors); // Get instructors for a course
router.post("/:courseId/instructors", assignInstructorsToCourse); // Assign instructors to a course
router.delete("/:courseId/instructors/:instructorId", removeInstructorAssignment); // Remove instructor assignment
router.put("/:courseId/instructors/:instructorId/status", updateAssignmentStatus); // Update assignment status

// Additional route for all assignments
router.get("/all/assignments", getAllAssignments);

module.exports = router;