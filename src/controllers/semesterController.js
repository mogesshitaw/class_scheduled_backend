
const pool = require("../db");

// Get all semesters
const getAllSemesters = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM semesters ORDER BY semester`
    );

    res.json({
      success: true,
      data: result.rows, // ALWAYS { id, semester }
    });
  } catch (err) {
    console.error("Error fetching semesters:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch semesters",
    });
  }
};

// Create semester
const createSemester = async (req, res) => {
  try {
    const { semester_name } = req.body;

    if (!semester_name?.trim()) {
      return res.status(400).json({
        success: false,
        error: "Semester name is required",
      });
    }

    const exists = await pool.query(
      `SELECT 1 FROM semesters WHERE semester = $1`,
      [semester_name.trim()]
    );

    if (exists.rowCount > 0) {
      return res.status(400).json({
        success: false,
        error: "Semester already exists",
      });
    }

    const result = await pool.query(
      `INSERT INTO semesters (semester)
       VALUES ($1)
       RETURNING id, semester`,
      [semester_name.trim()]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating semester:", err);
    res.status(500).json({
      success: false,
      error: "Failed to create semester",
    });
  }
};

module.exports = {

};

// Update semester
const updateSemester = async (req, res) => {
  try {
    const { id } = req.params;
    const { semester_name, description } = req.body;

    // Check if semester exists
    const semesterExists = await pool.query(
      "SELECT * FROM semesters WHERE id = $1",
      [id]
    );

    if (semesterExists.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Semester not found" 
      });
    }

    // Check for duplicate name
    if (semester_name) {
      const duplicate = await pool.query(
        "SELECT * FROM semesters WHERE semester = $1 AND id != $2",
        [semester_name.trim(), id]
      );

      if (duplicate.rows.length > 0) {
        return res.status(400).json({ 
          success: false, 
          error: "Semester with this name already exists" 
        });
      }
    }

    const result = await pool.query(
      `UPDATE semesters 
       SET 
         semester= COALESCE($1, semester),
         updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [
        semester_name ? semester_name.trim() : null,
        id
      ]
    );

    res.json({
      success: true,
      message: "Semester updated successfully",
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Error updating semester:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update semester" 
    });
  }
};

// Delete semester
const deleteSemester = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if semester is used in any academic year
    const usageCheck = await pool.query(
      "SELECT COUNT(*) FROM academic_year WHERE semester_id = $1",
      [id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Cannot delete semester. It is being used in academic years." 
      });
    }

    const result = await pool.query(
      "DELETE FROM semesters WHERE id = $1 RETURNING *",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Semester not found" 
      });
    }

    res.json({
      success: true,
      message: "Semester deleted successfully"
    });
  } catch (err) {
    console.error("Error deleting semester:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete semester" 
    });
  }
};

module.exports = {
    getAllSemesters,
    createSemester,
  createSemester,
  updateSemester,
  deleteSemester
};