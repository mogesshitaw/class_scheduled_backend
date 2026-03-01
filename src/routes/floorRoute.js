const express = require("express");
const router = express.Router();
const { 
  createFloor, 
  getFloors, 
  updateFloor, 
  deleteFloor,
  getFloorsByBlock 
} = require("../controllers/floorController");

// CRUD routes for floors
router.post("/", createFloor);
router.get("/", getFloors);
router.get("/block/:blockId", getFloorsByBlock);
router.put("/:id", updateFloor);
router.delete("/:id", deleteFloor);

module.exports = router;