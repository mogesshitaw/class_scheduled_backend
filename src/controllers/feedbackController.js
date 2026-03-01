const pool = require("../db");

// POST /api/feedback - Submit feedback
const createFeedback = async (req, res) => {
  try {
    const { id_number, category, message, role } = req.body;

    const trimmedCategory = category?.trim();
    const trimmedMessage = message?.trim();

    if (!trimmedCategory || !trimmedMessage || !id_number) {
      return res.status(400).json({
        message: "id_number, message, and category are required",
      });
    }

    console.log("📩 Feedback received:", { id_number, category: trimmedCategory, message: trimmedMessage, role:role  });

    // Check if instructor/student exists by ID only
    if (id_number) {
      const instructorStudCheck = await pool.query(
        `SELECT id_number, full_name, role 
         FROM users 
         WHERE id_number = $1 AND role = 'instructor'`,
        [id_number]
      );

      if (instructorStudCheck.rows.length === 0) {
        const instructorStudCheck1 = await pool.query(
          `SELECT student_number, full_name, role 
         FROM students 
         WHERE student_number = $1 AND role = 'Student'`,
          [id_number]
        );
        if (instructorStudCheck1.rows.length === 0) {
          console.log("❌ Instructor/student not found (ID check failed):", { id_number });
          return res.status(404).json({ message: "Instructor/student account not found" });
        }
      }
      else {
              console.log("✅ Instructor exists with ID:", id_number);
      }
    }

    // Insert feedback
    const insertResult = await pool.query(
      `INSERT INTO feedback (id_number, mes_category, message, role, status)
       VALUES ($1, $2, $3,$4, 'pending') 
       RETURNING *`,
      [id_number, trimmedCategory, trimmedMessage, role]
    );

    console.log("✅ Feedback inserted successfully:", insertResult.rows[0]);
    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error("❌ createFeedback error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /api/feedback - List all feedback
const listFeedback = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        f.*, COALESCE(s.full_name, u.full_name) AS name,
        COALESCE(s.department_id, u.department_id) AS department_id,
        CASE 
          WHEN f.role = 'Student' THEN 'Student'
          ELSE u.role
        END AS role_type

      FROM feedback f
      LEFT JOIN students s 
        ON f.id_number = s.student_number 
       AND f.role = 'Student'

      LEFT JOIN users u 
        ON f.id_number = u.id_number 
       AND f.role <> 'student'

      ORDER BY f.created_at DESC
    `);

    res.status(200).json(rows);
  } catch (err) {
    console.error("❌ listFeedback error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// PATCH /api/feedback/:id/status - Update feedback status
const updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const result = await pool.query(
      `UPDATE feedback 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    // Get updated feedback with user info
    const updatedFeedback = await pool.query(
      `SELECT f.*, u.full_name as name, u.role as role_type
       FROM feedback f
       LEFT JOIN users u ON f.id_number = u.id_number
       WHERE f.id = $1`,
      [id]
    );

    res.status(200).json(updatedFeedback.rows[0]);
  } catch (err) {
    console.error("❌ updateFeedbackStatus error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/feedback/:id - Delete feedback
const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM feedback WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    res.status(200).json({ message: "Feedback deleted successfully" });
  } catch (err) {
    console.error("❌ deleteFeedback error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { 
  createFeedback, 
  listFeedback, 
  updateFeedbackStatus, 
  deleteFeedback 
};