const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require('path');
const bodyParser = require("body-parser");
require("dotenv").config();

// Import PostgreSQL session store
const pgSession = require('connect-pg-simple')(session);
const { pool } = require('./src/db'); // Make sure this exports your pool
const app = express();

// Determine environment
const isProduction = process.env.NODE_ENV === 'production';
const frontendUrl = isProduction 
  ? 'https://classschedule-mtu.vercel.app' // Replace with your actual frontend URL
  : 'http://localhost:3000';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads', 'students');
// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ CORS Configuration - FIXED for production
app.use(cors({
  origin: frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsers
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Session Store - FIXED for production
const sessionStore = new pgSession({
  pool: pool,
  tableName: 'session', // Will create this table automatically
  createTableIfMissing: true,
});

// ✅ Session Configuration - FIXED for production
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || "mysecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // HTTPS only in production
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    sameSite: isProduction ? 'none' : 'lax', // 'none' for cross-site requests
    domain: isProduction ? '.onrender.com' : undefined, // Adjust if using custom domain
  },
  name: 'sessionId', // Custom name for security
  proxy: isProduction, // Trust the reverse proxy (Render)
}));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    timestamp: new Date().toISOString(),
    environment: isProduction ? 'production' : 'development',
    sessionConfigured: true,
    services: ["auth", "users", "departments", "courses", "schedules"]
  });
});

// ✅ Session Debug Route (optional - remove in production)
if (!isProduction) {
  app.get("/api/session-debug", (req, res) => {
    res.json({
      sessionID: req.sessionID,
      session: req.session,
      cookies: req.cookies,
      signedCookies: req.signedCookies,
      headers: req.headers['cookie'],
    });
  });
}

// Routes
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
const academic_year = require('./src/routes/academicYearRoutes');

// Apply routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/departments", depRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/announcements", announceRoute);
app.use("/api/blocks", blockRoutes);
app.use("/api/floors", floorRoutes);
app.use("/api/rooms", roomRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/semesters', semesterRoutes);
app.use("/api/faculties", faculityRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/importstudents", studentimportRoutes);
app.use("/api/chat", chatRoute);
app.use("/api/course-batches", courseBatches);
app.use("/api/time-slots", timeSlote);
app.use("/api/section-rooms", section_rooms);
app.use('/api/course-sections', courseSectionRoutes);
app.use('/api/security-settings', security_setting);
app.use('/api/academic-years', academic_year);

// Root route
app.get("/", (_req, res) => {
  console.log("API running");
  res.json({ 
    message: "Woldia University API",
    version: "1.0.0",
    docs: "Available at /api/* endpoints",
    health: "/api/health",
    environment: isProduction ? 'production' : 'development'
  });
});

// 404 handler
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
  console.log(`🌐 Environment: ${isProduction ? 'production' : 'development'}`);
  console.log(`🔗 Frontend URL: ${frontendUrl}`);
  console.log(`❤️  Health: ${isProduction ? `https://class-scheduled-backend1.onrender.com/api/health` : `http://localhost:${PORT}/api/health`}`);
});