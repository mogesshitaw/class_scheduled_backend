const express = require('express');
const router = express.Router();
const {
  getAllSectionRooms,
  getSectionRoomById,
  createSectionRoom,
  updateSectionRoom,
  deleteSectionRoom,
  getAvailableRooms,
  getSectionRoomsByFilter
} = require('../controllers/sectionRoomController');

// Get all section rooms
router.get('/', getAllSectionRooms);

// Get available rooms for department
router.get('/available-rooms', getAvailableRooms);

// Filter section rooms
router.get('/filter', getSectionRoomsByFilter);

// Get single section room
router.get('/:id', getSectionRoomById);

// Create new section room
router.post('/', createSectionRoom);

// Update section room
router.put('/:id', updateSectionRoom);

// Delete section room
router.delete('/:id', deleteSectionRoom);

module.exports = router;