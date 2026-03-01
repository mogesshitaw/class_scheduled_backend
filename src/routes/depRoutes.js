// src/routes/depRoutes.js
const express = require("express");
const router = express.Router();
const {
     getDep,
    createDep,
    updateDep,
    deleteDep ,
    updateHeadId,
    getRoomByDepartment,
    assignRoomTodepartment,
  removeRoomFromDepartment,
  getRoomFromDepartment,
  assignRoomTodepartmentByFloor,
getDepStats} = require("../controllers/depControllers");
const {
  getAllDepartmentsRooms,
  getDepartmentRoomById,
  getAvailableRoomsForDepartment,
  getRoomsByDepartmentId,
  getDepartmentsByRoomId,
  getUnassignedRooms,
  getDepartmentRoomStatistics,
  searchDepartmentRooms,
  getPaginatedDepartmentsRooms,
  addRoomToDepartment,
  updateDepartmentRoom,
} = require('../controllers/departmentsRoomsController');

router.get("/", getDep);
router.post("/", createDep);
router.put("/:id", updateDep);
router.put("/:id/head", updateHeadId);
router.get("/:departmentId/rooms", getRoomByDepartment);
router.get("/roomstodep",getRoomFromDepartment)
router.delete("/:departmentId/rooms/:roomId", removeRoomFromDepartment); // Remove block from faculty
router.get("/:id/stats", getDepStats);

router.post("/:id/rooms", assignRoomTodepartment);
router.post("/:id/assign-floor/:floorIds/rooms", assignRoomTodepartmentByFloor);

router.delete("/:id", deleteDep);

// Get all department rooms
router.get('/rooms', getAllDepartmentsRooms);

// Get paginated department rooms
router.get('/paginated', getPaginatedDepartmentsRooms);

// Get available rooms for department
router.get('/available', getAvailableRoomsForDepartment);

// Get unassigned rooms
router.get('/unassigned', getUnassignedRooms);

// Get statistics
router.get('/statistics', getDepartmentRoomStatistics);

// Search department rooms
router.get('/search', searchDepartmentRooms);

// Get rooms by department ID
router.get('/department/:department_id', getRoomsByDepartmentId);

// Get departments by room ID
router.get('/room/:room_id', getDepartmentsByRoomId);

// Get single department room
router.get('/rooms:id', getDepartmentRoomById);

// Add room to department
router.post('/', addRoomToDepartment);

// Update department room
router.put('/:id', updateDepartmentRoom);

// Remove room from department
// router.delete('/:id', removeRoomFromDepartment);


module.exports = router;