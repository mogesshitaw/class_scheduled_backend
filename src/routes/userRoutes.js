const express = require("express");
const router = express.Router();
const {
  listUsers,
  createUser,
  instructor,
  updateUser,
  updateStatus,
  instructor_head,
  
} = require("../controllers/userController");

router.get("/", listUsers);
router.post("/", createUser);
router.put("/:id", updateUser);
router.get("/instructors", instructor);
router.get("/ad_in",instructor_head);
router.patch("/:id/status", updateStatus);

module.exports = router;
