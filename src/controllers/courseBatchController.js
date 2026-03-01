// src/controllers/courseBatchController.js
const pool = require("../db");

/**
 * @desc    Get all course-batch assignments with details
 * @route   GET /api/course-batches
 */
const getAllCourseBatches = async (req, res) => {
  try {
const query = `
  SELECT 
    cb.id,
    cb.course_id,
    cb.semester_id,
    cb.department_id,
    cb.batch,  -- This is batch_id from Course_Batch table
    cb.created_at,
    cb.updated_at,
    c.course_code,
    c.course_name,
    c.credit_hour,
    d.department_name,
    b.batch_year,  -- Keep this for display
    s.semester AS semester_name
  FROM Course_Batch cb
  LEFT JOIN Course c ON cb.course_id = c.course_id
  LEFT JOIN departments d ON cb.department_id = d.department_id
  LEFT JOIN batches b ON cb.batch = b.batch_id  -- Join on batch_id
  LEFT JOIN semesters s ON cb.semester_id = s.id
  ORDER BY cb.created_at DESC
`;

    const { rows } = await pool.query(query);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching course batches:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch course batches"
    });
  }
};

/**
 * @desc    Get course-batch assignment by ID
 * @route   GET /api/course-batches/:id
 */
const getCourseBatchById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        cb.*,
        c.course_code,
        c.course_name,
        d.department_name,
        b.batch_year,
        s.semester AS semester_name
      FROM Course_Batch cb
      LEFT JOIN Course c ON cb.course_id = c.course_id
      LEFT JOIN departments d ON cb.department_id = d.department_id
      LEFT JOIN batches b ON cb.batch = b.batch_id
      LEFT JOIN semesters s ON cb.semester_id = s.id
      WHERE cb.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Course batch assignment not found"
      });
    }

    res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error("Error fetching course batch:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch course batch"
    });
  }
};

/**
 * @desc    Create a new course-batch assignment
 * @route   POST /api/course-batches
 */
const createCourseBatch = async (req, res) => {
  try {
    const { course_id, batch, semester_id, department_id } = req.body;

    // Validate required fields
    if (!course_id || !batch || !semester_id || !department_id) {
      return res.status(400).json({
        success: false,
        error: "All fields are required (course_id, batch, semester_id, department_id)"
      });
    }

    // Check if course exists
    const courseCheck = await pool.query(
      "SELECT course_id FROM Course WHERE course_id = $1",
      [course_id]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Course not found"
      });
    }

    // Check if department exists
    const deptCheck = await pool.query(
      "SELECT department_id FROM departments WHERE department_id = $1",
      [department_id]
    );

    if (deptCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Department not found"
      });
    }

    // Check for duplicate assignment
    const duplicateCheck = await pool.query(
      `SELECT id FROM Course_Batch 
       WHERE course_id = $1 AND batch = $2 AND semester_id = $3 AND department_id=$4`,
      [course_id, batch, semester_id,department_id]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "This course is already assigned to this batch and semester"
      });
    }

    // Create the assignment
    const query = `
      INSERT INTO Course_Batch (course_id, batch, semester_id, department_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [
      course_id, 
      batch, 
      semester_id, 
      department_id
    ]);

    // Get the full data with joins
    const fullDataQuery = `
      SELECT 
        cb.*,
        c.course_code,
        c.course_name,
        d.department_name,
        b.batch_year,
        s.semester AS semester_name
      FROM Course_Batch cb
      LEFT JOIN Course c ON cb.course_id = c.course_id
      LEFT JOIN departments d ON cb.department_id = d.department_id
      LEFT JOIN batches b ON cb.batch = b.batch_id
      LEFT JOIN semesters s ON cb.semester_id = s.id
      WHERE cb.id = $1
    `;

    const fullData = await pool.query(fullDataQuery, [rows[0].id]);

    res.status(201).json({
      success: true,
      message: "Course batch assignment created successfully",
      data: fullData.rows[0]
    });
  } catch (error) {
    console.error("Error creating course batch:", error);
    
    if (error.code === '23503') { // Foreign key violation
      if (error.constraint.includes('course_id')) {
        return res.status(404).json({
          success: false,
          error: "Course not found"
        });
      } else if (error.constraint.includes('department_id')) {
        return res.status(404).json({
          success: false,
          error: "Department not found"
        });
      }
    }

    res.status(500).json({
      success: false,
      error: "Failed to create course batch assignment"
    });
  }
};

/**
 * @desc    Create multiple course-batch assignments
 * @route   POST /api/course-batches/bulk
 */
const createMultipleCourseBatches = async (req, res) => {
  try {
    const { assignments } = req.body;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Assignments array is required"
      });
    }

    // Validate all assignments
    for (const assignment of assignments) {
      const { course_id, batch, semester_id, department_id } = assignment;
      
      if (!course_id || !batch || !semester_id || !department_id) {
        return res.status(400).json({
          success: false,
          error: "All fields are required for each assignment (course_id, batch, semester_id, department_id)"
        });
      }
    }

    const results = [];
    const errors = [];

    // Process each assignment
    for (const assignment of assignments) {
      const { course_id, batch, semester_id, department_id } = assignment;

      try {
        // Check for duplicate
        const duplicateCheck = await pool.query(
          `SELECT id FROM Course_Batch 
           WHERE course_id = $1 AND batch = $2 AND semester_id = $3`,
          [course_id, batch, semester_id]
        );

        if (duplicateCheck.rows.length > 0) {
          errors.push({
            course_id,
            batch,
            semester_id,
            error: "Duplicate assignment"
          });
          continue;
        }

        // Insert assignment
        const query = `
          INSERT INTO Course_Batch (course_id, batch, semester_id, department_id)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `;

        const { rows } = await pool.query(query, [
          course_id, 
          batch, 
          semester_id, 
          department_id
        ]);

        results.push({
          id: rows[0].id,
          course_id,
          batch,
          semester_id,
          department_id,
          success: true
        });
      } catch (error) {
        errors.push({
          course_id,
          batch,
          semester_id,
          error: error.code === '23503' ? "Invalid foreign key reference" : "Insert failed"
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Processed ${assignments.length} assignments`,
      created: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error("Error creating multiple course batches:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create course batch assignments"
    });
  }
};


const updateCourseBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { course_id, batch, semester_id, department_id } = req.body;

    // Check if assignment exists
    const checkQuery = await pool.query(
      "SELECT * FROM Course_Batch WHERE id = $1",
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Course batch assignment not found"
      });
    }

    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (course_id !== undefined) {
      updateFields.push(`course_id = $${paramCount}`);
      values.push(course_id);
      paramCount++;
    }

    if (batch !== undefined) {
      updateFields.push(`batch = $${paramCount}`);
      values.push(batch);
      paramCount++;
    }

    if (semester_id !== undefined) {
      updateFields.push(`semester_id = $${paramCount}`);
      values.push(semester_id);
      paramCount++;
    }

    if (department_id !== undefined) {
      updateFields.push(`department_id = $${paramCount}`);
      values.push(department_id);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No fields to update"
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id); // For WHERE clause

    const query = `
      UPDATE Course_Batch 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    // Get the full updated data with joins
    const fullDataQuery = `
      SELECT 
        cb.*,
        c.course_code,
        c.course_name,
        d.department_name,
        b.batch_year,
        s.semester AS semester_name
      FROM Course_Batch cb
      LEFT JOIN Course c ON cb.course_id = c.course_id
      LEFT JOIN departments d ON cb.department_id = d.department_id
      LEFT JOIN batches b ON cb.batch = b.batch_id
      LEFT JOIN semesters s ON cb.semester_id = s.id
      WHERE cb.id = $1
    `;

    const fullData = await pool.query(fullDataQuery, [rows[0].id]);

    res.status(200).json({
      success: true,
      message: "Course batch assignment updated successfully",
      data: fullData.rows[0]
    });
  } catch (error) {
    console.error("Error updating course batch:", error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: "Duplicate assignment exists"
      });
    } else if (error.code === '23503') { // Foreign key violation
      return res.status(404).json({
        success: false,
        error: "Referenced entity not found"
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update course batch assignment"
    });
  }
};


const deleteCourseBatch = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if assignment exists
    const checkQuery = await pool.query(
      "SELECT * FROM Course_Batch WHERE id = $1",
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Course batch assignment not found"
      });
    }

    // Delete the assignment
    await pool.query("DELETE FROM Course_Batch WHERE id = $1", [id]);

    res.status(200).json({
      success: true,
      message: "Course batch assignment deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting course batch:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete course batch assignment"
    });
  }
};

/**
 * @desc    Get course batches by filters
 * @route   GET /api/course-batches/filter
 */
const getCourseBatchesByFilter = async (req, res) => {
  try {
    const { department_id, batch, semester_id, course_id } = req.query;

    let query = `
      SELECT 
        cb.*,
        c.course_code,
        c.course_name,
        d.department_name,
        b.batch_year,
        s.semester AS semester_name
      FROM Course_Batch cb
      LEFT JOIN Course c ON cb.course_id = c.course_id
      LEFT JOIN departments d ON cb.department_id = d.department_id
      LEFT JOIN batches b ON cb.batch = b.batch_id
      LEFT JOIN semesters s ON cb.semester_id = s.id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

    if (department_id) {
      query += ` AND cb.department_id = $${paramCount}`;
      values.push(department_id);
      paramCount++;
    }

    if (batch) {
      query += ` AND cb.batch = $${paramCount}`;
      values.push(batch);
      paramCount++;
    }

    if (semester_id) {
      query += ` AND cb.semester_id = $${paramCount}`;
      values.push(semester_id);
      paramCount++;
    }

    if (course_id) {
      query += ` AND cb.course_id = $${paramCount}`;
      values.push(course_id);
      paramCount++;
    }

    query += ` ORDER BY cb.created_at DESC`;

    const { rows } = await pool.query(query, values);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error filtering course batches:", error);
    res.status(500).json({
      success: false,
      error: "Failed to filter course batches"
    });
  }
};

/**
 * @desc    Get courses available for batch assignment
 * @route   GET /api/course-batches/available-courses
 */
const getAvailableCourses = async (req, res) => {
  try {
    const { department_id, semester_id } = req.query;

    let query = `
      SELECT 
        c.course_id,
        c.course_code,
        c.course_name,
        c.credits,
        c.semester,
        c.department_id,
        d.department_name
      FROM Course c
      LEFT JOIN departments d ON c.department_id = d.department_id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

    if (department_id) {
      query += ` AND c.department_id = $${paramCount}`;
      values.push(department_id);
      paramCount++;
    }

    if (semester_id) {
      query += ` AND c.semester = (SELECT semester FROM semesters WHERE id = $${paramCount})`;
      values.push(semester_id);
      paramCount++;
    }

    // Optional: Exclude already assigned courses
    const { exclude_batch, exclude_semester } = req.query;
    if (exclude_batch && exclude_semester) {
      query += ` AND c.course_id NOT IN (
        SELECT course_id FROM Course_Batch 
        WHERE batch = $${paramCount} AND semester_id = $${paramCount + 1}
      )`;
      values.push(exclude_batch, exclude_semester);
    }

    const { rows } = await pool.query(query, values);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching available courses:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch available courses"
    });
  }
};

module.exports = {
  getAllCourseBatches,
  getCourseBatchById,
  createCourseBatch,
  createMultipleCourseBatches,
  updateCourseBatch,
  deleteCourseBatch,
  getCourseBatchesByFilter,
  getAvailableCourses
};