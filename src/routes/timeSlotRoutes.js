// src/routes/timeSlotRoutes.js
const express = require("express");
const router = express.Router();
const {
  getAllTimeSlots,
  getTimeSlotById,
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  getTimeSlotsByDepartment,
  getTimeSlotsByDay,
  createBulkTimeSlots
} = require("../controllers/timeSlotController");

// Get all time slots
router.get("/", getAllTimeSlots);

// Get time slot by ID
router.get("/:id", getTimeSlotById);

// Create new time slot
router.post("/", createTimeSlot);

// Update time slot
router.put("/:id", updateTimeSlot);

// Delete time slot
router.delete("/:id", deleteTimeSlot);

// Get time slots by department
router.get("/department/:department_id", getTimeSlotsByDepartment);

// Get time slots by day
router.get("/day/:day_of_week", getTimeSlotsByDay);


module.exports = router;