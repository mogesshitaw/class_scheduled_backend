// server.js
"use strict";

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require("path");
const bodyParser = require("body-parser");
const fs = require("fs");
require("dotenv").config();
const { Pool } = require("pg");

const app = express();

// =====================
// PostgreSQL Setup
// =====================
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch(err => console.error("❌ PostgreSQL connection error:", err.message));

// =====================
// Uploads directory
// =====================
const uploadsDir = path.join(__dirname, "uploads", "students");
if (!fs.existsSync(uploadsDir)) {
  console.log("Directory exists? false\nCreating uploads directory...");
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("Directory created successfully");
} else {
  console.log("Directory exists? true");
}

// =====================
// CORS setup
// =====================
const allowedOrigins = [
  "http://localhost:3000", // local frontend
  "https://classschedule-mtu.vercel.app", // production frontend
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server or Postman requests
    if (allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`Blocked CORS request from ${origin}`);
    return callback(null, false); // block everything else
  },
  credentials: true, // allow cookies
}));

// =====================
// Middlewares
// =====================
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// =====================
// Session setup
// =====================
app.use(session({
  secret: process.env.SESSION_SECRET || "mysecretkey",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production", // HTTPS only in production
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  },
}));

// =====================
// Logging
// =====================
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// =====================
// Health Check
// =====================
app.get("/api/health", (_req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: ["auth", "users", "departments", "courses", "schedules"]
  });
});

// =====================
// Routes (example)
// =====================
app.use("/api/auth", require("./src/routes/authRoutes"));
app.use("/api/users", require("./src/routes/userRoutes"));
app.use("/api/departments", require("./src/routes/depRoutes"));
app.use("/api/courses", require("./src/routes/courseRoutes"));
app.use("/api/schedules", require("./src/routes/sheduleRoutes"));
app.use("/api/feedback", require("./src/routes/feedbackRoutes"));
app.use("/api/announcements", require("./src/routes/announceRoutes"));
app.use("/api/blocks", require("./src/routes/blockRoute"));
app.use("/api/floors", require("./src/routes/floorRoute"));
app.use("/api/rooms", require("./src/routes/roomRoutes"));
app.use("/api/batches", require("./src/routes/batchRoutes"));
app.use("/api/semesters", require("./src/routes/routeSemester"));
app.use("/api/faculties", require("./src/routes/facultyRoutes"));
app.use("/api/students", require("./src/routes/studentRoutes"));
app.use("/api/importstudents", require("./src/routes/studentImportRoutes"));
app.use("/api/chat", require("./src/routes/chatRoutes"));
app.use("/api/course-batches", require("./src/routes/courseBatchRoutes"));
app.use("/api/time-slots", require("./src/routes/timeSlotRoutes"));
app.use("/api/section-rooms", require("./src/routes/sectionRoomRoutes"));
app.use("/api/course-sections", require("./src/routes/courseSection"));
app.use("/api/security-settings", require("./src/routes/securitySettingRoutes"));
app.use("/api/academic-years", require("./src/routes/academicYearRoutes"));

/* =====================================================
   🔟 ROOT ROUTE
===================================================== */

app.get("/", (req, res) => {
  res.json({
    message: "Woldia University API",
    version: "1.0.0",
    health: "/api/health",
  });
});

// =====================
// Root route
// =====================
app.get("/", (_req, res) => {
  res.json({
    message: "Woldia University API",
    version: "1.0.0",
    docs: "Available at /api/* endpoints",
    health: "/api/health"
  });
});

// =====================
// 404 handler
// =====================
app.use((req, res) => {
  console.log(`404: ${req.method} ${req.url}`);
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.url,
    method: req.method
  });
});

// =====================
// Error handler
// =====================
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// =====================
// Start server
// =====================
const PORT = parseInt(process.env.PORT, 10) || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Frontend: http://localhost:3000`);
  console.log(`🔗 API: http://localhost:${PORT}/api`);
  console.log(`❤️  Health: http://localhost:${PORT}/api/health`);
});