const express = require("express");
const router = express.Router();
const { 
  createBlock, 
  getBlocks, 
  updateBlock, 
  deleteBlock,
  getBlockById 
} = require("../controllers/blockController");

// CRUD routes for blocks
router.post("/", createBlock);
router.get("/", getBlocks);
router.get("/:id", getBlockById);
router.put("/:id", updateBlock);
router.delete("/:id", deleteBlock);

module.exports = router;