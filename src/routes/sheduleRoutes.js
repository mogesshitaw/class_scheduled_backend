// src/routes/authRoutes.js
const express = require("express");
const router = express.Router();
const { sessionAuth } = require('../middleware/sessionAuth');
const { 
  getInstructorSchedule,
  getInstructorInfo,
  getMySchedule,
  getTodaySchedule,
  getAllInstructors,
  create,
  getAll,
  Delete,
  permission,
  Batch,
  update,
  getAvailableRooms,
  getRoomHierarchy,
  autoGenerateSchedule
} = require("../controllers/scheduleController");
// Schedule CRUD routes
router.post("/", create);
router.get("/", getAll);
router.delete("/:id", Delete);
router.patch("/:id", permission);
router.put("/:id", update);
router.get("/batch", Batch); // Changed from /:batch to avoid conflict

// Room management routes
router.get("/rooms/available", getAvailableRooms);
router.get("/rooms/hierarchy", getRoomHierarchy);
router.post("/autogenerate", autoGenerateSchedule);

// Today's schedule routes
router.get("/today", getTodaySchedule); // Default today's schedule
router.get("/today/:day", getTodaySchedule); // Specific day schedule

// Instructor routes
router.get("/instructors", getAllInstructors); // Get all instructors
router.get("/instructors/:id", getInstructorInfo); // Get specific instructor info
router.get("/instructors/:id/schedule", getInstructorSchedule); // Get instructor's schedule

// Protected routes - require instructor session
router.get("/me/schedule", sessionAuth, getMySchedule);
router.get("/me/today", sessionAuth, (req, res) => {
  // This will use the instructor's ID from session
  getTodaySchedule(req, res);
});

module.exports = router;