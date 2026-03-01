const express = require("express");
const { upload }= require("../controllers/extercontroller.js");
const  { uploadExcel }= require( "../middleware/upload.js");

const router = express.Router();

// multer MUST be before controller
router.post("/", uploadExcel, upload);

module.exports = router;
