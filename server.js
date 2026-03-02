require("dotenv").config();

const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");
const pool = require("./src/db"); // your Pool using DATABASE_URL


const app = express();

/* =====================================================
   1️⃣ DATABASE CONNECTION (Render PostgreSQL)
===================================================== */

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not defined in environment variables");
  process.exit(1);
}



// Test database connection
pool.connect()
  .then(client => {
    console.log("✅ Connected to PostgreSQL");
    client.release();
  })
  .catch(err => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });


/* =====================================================
   3️⃣ CORS CONFIGURATION
===================================================== */

const allowedOrigins = [
  "http://localhost:3000",
  "https://classschedule-mtu.vercel.app", // your real frontend
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(new Error("CORS error: origin missing"));

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error(`CORS error: ${origin} not allowed`));
    }
  },
  credentials: true,
}));

/* =====================================================
   4️⃣ BODY PARSER
===================================================== */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =====================================================
   5️⃣ SESSION STORE (PostgreSQL)
===================================================== */
app.set("trust proxy", 1); // important for Render / behind proxy

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production", // HTTPS only
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", // cross-site cookies
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  },
}));
/* =====================================================
   6️⃣ STATIC FILES (WARNING: TEMPORARY ON RENDER)
===================================================== */

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"))
);

/* =====================================================
   7️⃣ REQUEST LOGGER
===================================================== */

app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

/* =====================================================
   8️⃣ HEALTH CHECK
===================================================== */

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

/* =====================================================
   9️⃣ ROUTES
===================================================== */

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

/* =====================================================
   1️⃣1️⃣ 404 HANDLER
===================================================== */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.originalUrl,
  });
});

/* =====================================================
   1️⃣2️⃣ ERROR HANDLER
===================================================== */

app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
});

/* =====================================================
   🚀 START SERVER
===================================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});