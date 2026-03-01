const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentStatistics,
  updateStudentFirst,
  updateStudentStatus,
  exportStudents,
  updateStatusByBatch,
  getStudentStatusHistory
} = require('../controllers/studentController');
const { sessionAuth } = require('../middleware/sessionAuth');

// Make sure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads', 'students');

// Debug: Check if directory exists
console.log('Uploads directory path:', uploadsDir);
console.log('Directory exists?', fs.existsSync(uploadsDir));

if (!fs.existsSync(uploadsDir)) {
  console.log('Creating uploads directory...');
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Directory created successfully');
}

// Configure multer for profile image uploads
const profileImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log('Multer destination called for file:', file.originalname);
    
    // Double-check directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = 'profile-' + uniqueSuffix + ext;
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

const uploadProfile = multer({
  storage: profileImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    console.log('File filter called:', {
      originalname: file.originalname,
      mimetype: file.mimetype
    });
    
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      console.log('File accepted:', file.originalname);
      return cb(null, true);
    } else {
      console.log('File rejected - invalid type:', file.originalname);
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
    }
  }
});

// Configure multer for form data (no files)
const upload = multer();

// Public routes
router.get('/statistics', getStudentStatistics);

// Student routes - IMPORTANT: Static routes BEFORE dynamic routes
router.get('/', getAllStudents);
router.get('/export', exportStudents); // Static route - MUST come before :id
router.get('/:id', getStudentById); // Dynamic route - AFTER static routes
router.get('/:id/status-history', getStudentStatusHistory);
router.post('/', upload.none(), createStudent);
router.put('/:id', upload.none(), updateStudent);
router.put('/:id/status', upload.none(), updateStudentStatus);
router.put('/batch/status/:department_id', upload.none(), updateStatusByBatch);

router.put('/:id/first-login', upload.none(), updateStudentFirst);
router.delete('/:id', deleteStudent);

// Profile image upload route for specific student
router.post('/:id/profile-image', uploadProfile.single('profile_image'), async (req, res) => {
  try {
    console.log('\n=== PROFILE IMAGE UPLOAD START ===');
    console.log('Student ID:', req.params.id);
    console.log('File received:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      destination: req.file.destination,
      filename: req.file.filename,
      path: req.file.path
    } : 'NO FILE RECEIVED');
    console.log('Request body:', req.body);
    console.log('=== PROFILE IMAGE UPLOAD END ===\n');

    const studentId = req.params.id;
    
    if (!req.file) {
      return res.status(400).json({ 
        success: false,
        error: 'No file uploaded or file validation failed',
        details: 'Please upload a valid image file (jpeg, jpg, png, gif) under 5MB'
      });
    }

    // Check if file was actually saved
    const filePath = path.join(uploadsDir, req.file.filename);
    console.log('Checking if file exists at:', filePath);
    console.log('File exists?', fs.existsSync(filePath));
    
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({ 
        success: false,
        error: 'File was not saved to disk',
        details: 'Please check server permissions'
      });
    }

    // Check file size
    const stats = fs.statSync(filePath);
    console.log('File saved successfully. Size:', stats.size, 'bytes');

    // Generate public URL for the image
    const imageUrl = `/uploads/students/${req.file.filename}`;
    
    // Update student record with image URL
    const result = await pool.query(
      `UPDATE students SET profile_image_url = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE student_id = $2 
       RETURNING student_id, full_name, email, profile_image_url`,
      [imageUrl, studentId]
    );

    if (result.rows.length === 0) {
      // Delete the uploaded file if student doesn't exist
      fs.unlinkSync(filePath);
      return res.status(404).json({ 
        success: false,
        error: 'Student not found' 
      });
    }

    console.log('Profile image uploaded and saved to database:', {
      studentId,
      imageUrl,
      student: result.rows[0]
    });

    res.json({ 
      success: true, 
      message: 'Profile image uploaded successfully',
      data: {
        imageUrl,
        student: result.rows[0]
      }
    });

  } catch (error) {
    console.error('Error uploading profile image:', error);
    console.error('Error stack:', error.stack);
    
    // Clean up uploaded file if error occurred
    if (req.file && req.file.filename) {
      const filePath = path.join(uploadsDir, req.file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('Cleaned up file after error:', filePath);
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Failed to upload profile image',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Error handling middleware for multer
router.use((err, req, res, next) => {
  console.error('Multer error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        success: false,
        error: 'File too large. Maximum size is 5MB' 
      });
    }
    return res.status(400).json({ 
      success: false,
      error: `File upload error: ${err.message}` 
    });
  } else if (err) {
    return res.status(400).json({ 
      success: false,
      error: err.message 
    });
  }
  next();
});

module.exports = router;