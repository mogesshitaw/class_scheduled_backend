const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require('path');
const bodyParser = require("body-parser");
require("dotenv").config();
const app = express();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads', 'students');
// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Middlewares
app.use(cors({
  origin:"https://class-schedule-frontend.vercel.app", // Next.js frontend
  credentials: true,
}));
app.use(bodyParser.json());
app.use(express.json());

// Session setup
/* =====================================================
   5️⃣ SESSION STORE (MEMORY ONLY FOR LOCAL)
===================================================== */
app.use(session({
  secret: process.env.SESSION_SECRET || "keyboard cat",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,               // HTTP ላይ ስለሚሰራ  false ነው
    sameSite: "lax",             // frontend/backend different domains ስለማይኖረው
    maxAge: 24 * 60 * 60 * 1000, // 1 ቀን
  },
}));
app.use(express.json()); // ✅ parse JSON
app.use(express.urlencoded({ extended: true })); 
// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Health check route (add before other routes)
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    services: ["auth", "users", "departments", "courses", "schedules"]
  });
});

// routes
const authRoutes = require("./src/routes/authRoutes");
const userRoutes = require("./src/routes/userRoutes");
const depRoutes = require("./src/routes/depRoutes");
const courseRoutes = require("./src/routes/courseRoutes");
const scheduleRoutes = require("./src/routes/sheduleRoutes");
const feedbackRoutes = require("./src/routes/feedbackRoutes");
const announceRoute = require("./src/routes/announceRoutes");
const blockRoutes = require("./src/routes/blockRoute");
const floorRoutes = require("./src/routes/floorRoute");
const roomRoutes = require("./src/routes/roomRoutes");
const batchRoutes = require('./src/routes/batchRoutes');
const semesterRoutes = require('./src/routes/routeSemester');
const faculityRoutes = require('./src/routes/facultyRoutes');
const studentRoutes = require('./src/routes/studentRoutes');
const studentimportRoutes = require('./src/routes/studentImportRoutes');
const chatRoute = require("./src/routes/chatRoutes");
const courseBatches = require("./src/routes/courseBatchRoutes");
const timeSlote = require('./src/routes/timeSlotRoutes');
const section_rooms = require('./src/routes/sectionRoomRoutes');
const courseSectionRoutes = require('./src/routes/courseSection');
const security_setting = require('./src/routes/securitySettingRoutes');
const academic_year=require('./src/routes/academicYearRoutes')

app.use("/api/auth", authRoutes);  // /api/auth/login, /api/auth/forgot-password
app.use("/api/users", userRoutes); // /api/users
app.use("/api/departments", depRoutes); // /api/department
app.use("/api/courses", courseRoutes);  // /api/courses
app.use("/api/schedules", scheduleRoutes);  // /api/courses
app.use("/api/feedback", feedbackRoutes);  // /api/feedback
app.use("/api/announcements", announceRoute);  // /api/announcements
app.use("/api/blocks", blockRoutes); // /api/blocks
app.use("/api/floors", floorRoutes); // /api/floors
app.use("/api/rooms", roomRoutes); // /api/rooms
app.use('/api/batches', batchRoutes);
app.use('/api/semesters', semesterRoutes);
app.use("/api/faculties", faculityRoutes); //api/faculties
app.use("/api/students", studentRoutes); //
app.use("/api/importstudents", studentimportRoutes);
app.use("/api/chat", chatRoute) // /api/chat
app.use("/api/course-batches", courseBatches);
app.use("/api/time-slots", timeSlote); // api/time-slots
app.use("/api/section-rooms", section_rooms);
app.use('/api/course-sections', courseSectionRoutes);
app.use('/api/security-settings', security_setting);
app.use('/api/academic-years', academic_year);
// Root route
app.get("/", (_req, res) => {
    console.log("API running");
    res.json({ 
      message: "MizanTepi University API",
      version: "1.0.0",
      docs: "Available at /api/* endpoints",
      health: "/api/health"
    });
});

// 404 handler - ALWAYS return JSON, not text
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    success: false,
    error: "Route not found",
    path: req.url,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Frontend: http://localhost:3000`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
});