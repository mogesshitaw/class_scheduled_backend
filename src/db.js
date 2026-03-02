const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Required for Supabase
  },
});

pool.connect()
  .then(client => {
    console.log("✅ PostgreSQL connected");
    client.release();
  })
  .catch(err => {
    console.error("❌ PostgreSQL connection error:", err);
  });

module.exports = pool;