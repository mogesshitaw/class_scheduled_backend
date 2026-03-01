const express = require("express");
const router = express.Router();
const {
  getAllFaculties,
  getFacultyById,
  createFaculty,
  updateFaculty,
  deleteFaculty,
  getDepartmentsByFaculty,
  assignDepartmentToFaculty,
   getBlocksByFaculty,
  assignBlocksToFaculty,
  removeBlockFromFaculty
} = require("../controllers/facultyControllers");

// Existing faculty routes
router.get("/", getAllFaculties);
router.get("/:id", getFacultyById);
router.post("/", createFaculty);
router.put("/:id", updateFaculty);
router.delete("/:id", deleteFaculty);

// Department routes
router.get("/:id/departments", getDepartmentsByFaculty);
// Block routes
router.get("/:id/blocks", getBlocksByFaculty); // Get blocks for a faculty
router.post("/:id/blocks", assignBlocksToFaculty); // Assign blocks to faculty
router.delete("/:id/blocks/:blockId", removeBlockFromFaculty); // Remove block from faculty

module.exports = router;