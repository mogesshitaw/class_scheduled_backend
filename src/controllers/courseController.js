const pool = require("../db");

// Get all courses with department info
const getCourse = async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM Course`);
    res.json(rows);
  } catch (err) {
    console.error("GET /api/courses error:", err);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
};

// Create a new course
const createCourse = async (req, res) => {
  try {
    const { course_code, course_name, credit_hour, lec_hr, lab_hr, tut_hr, category } = req.body;
    if (!course_code || !course_name.trim() || !credit_hour || !category) {
      return res.status(400).json({ error: "All course fields are required" });
    }

    // Insert course and return new ID
    const insertResult = await pool.query(
      `INSERT INTO Course (course_code, course_name, credit_hour, lec_hr, lab_hr, tut_hr, category) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING course_id`,
      [course_code, course_name, credit_hour, lec_hr || 0, lab_hr || 0, tut_hr || 0, category]
    );

    const newCourseId = insertResult.rows[0].course_id;

    // Fetch the newly created course with department info
    const { rows } = await pool.query(
      `SELECT * FROM Course  WHERE course_id = $1`,
      [newCourseId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /api/course error:", err);
    if (err.code === "23505") {
      // unique_violation
      return res.status(409).json({ error: "Course with this code already exists" });
    }
    res.status(500).json({ error: "Failed to create course" });
  }
};

// Update course
const updateCourse = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { course_code, course_name, credit_hour, lec_hr, lab_hr, tut_hr, category } = req.body;

    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Invalid id" });
    if (!course_code || !course_name || !credit_hour)
      return res.status(400).json({ error: "All fields are required" });

    const updateResult = await pool.query(
      `UPDATE Course 
       SET course_code = $1, course_name = $2, credit_hour = $3, lec_hr = $4, lab_hr = $5, tut_hr = $6, category = $7 
       WHERE course_id = $8 
       RETURNING *`,
      [course_code, course_name, credit_hour, lec_hr || 0, lab_hr || 0, tut_hr || 0, category, id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error("PUT /api/course/:id error:", err);
    if (err.code === "23505") {
      return res.status(409).json({ error: "Course with this code already exists" });
    }
    res.status(500).json({ error: "Failed to update course" });
  }
};

// Delete course
const deleteCourse = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Invalid id" });

    const deleteResult = await pool.query(
      "DELETE FROM Course WHERE course_id = $1",
      [id]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({ success: true, message: "Course deleted" });
  } catch (err) {
    console.error("DELETE /api/course/:id error:", err);
    res.status(500).json({ error: "Failed to delete course" });
  }
};

// Get all available instructors (users with role 'instructor')
const getAvailableInstructors = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        id as instructor_id,
        full_name,
        email,
        role,
        id_number,
        status,
        department_id
       FROM users 
       WHERE role = 'instructor' 
       AND status = 'Active'
       ORDER BY full_name`
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /api/instructors error:", err);
    res.status(500).json({ error: "Failed to fetch instructors" });
  }
};

// Get instructors assigned to a specific course
const getCourseInstructors = async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    const { rows } = await pool.query(
      `SELECT 
        cia.course_id,
        cia.instructor_id,
        cia.course_status,
        cia.created_at,
        cia.updated_at,
        u.full_name,
        u.email,
        u.role,
        u.id_number,
        u.status,
        u.department_id,
        d.department_name
       FROM Course_instructor_assign cia
       LEFT JOIN users u ON cia.instructor_id = u.id
       LEFT JOIN departments d ON u.department_id=d.department_id
       WHERE cia.course_id = $1
       ORDER BY u.full_name`,
      [courseId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /api/courses/:courseId/instructors error:", err);
    res.status(500).json({ error: "Failed to fetch course instructors" });
  }
};

// Assign multiple instructors to a course
const assignInstructorsToCourse = async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const { instructor_ids, course_status = 'active' } = req.body;

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    if (!Array.isArray(instructor_ids) || instructor_ids.length === 0) {
      return res.status(400).json({ error: "Instructor IDs array is required" });
    }

    // Check if course exists
    const courseCheck = await pool.query(
      "SELECT course_id FROM Course WHERE course_id = $1",
      [courseId]
    );

    if (courseCheck.rowCount === 0) {
      return res.status(404).json({ error: "Course not found" });
    }

    const assignments = [];
    const errors = [];

    // Assign each instructor to the course
    for (const instructorId of instructor_ids) {
      try {
        // Check if instructor exists and is an instructor
        const instructorCheck = await pool.query(
          `SELECT id FROM users 
           WHERE id = $1 AND role = 'instructor' AND status = 'Active'`,
          [instructorId]
        );

        if (instructorCheck.rowCount === 0) {
          errors.push(`Instructor ID ${instructorId} not found or not active`);
          continue;
        }

        // Check if assignment already exists
        const existingAssignment = await pool.query(
          `SELECT * FROM Course_instructor_assign 
           WHERE course_id = $1 AND instructor_id = $2`,
          [courseId, instructorId]
        );

        if (existingAssignment.rowCount > 0) {
          // Update existing assignment
          const result = await pool.query(
            `UPDATE Course_instructor_assign 
             SET course_status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE course_id = $2 AND instructor_id = $3
             RETURNING *`,
            [course_status, courseId, instructorId]
          );
          assignments.push(result.rows[0]);
        } else {
          // Create new assignment
          const result = await pool.query(
            `INSERT INTO Course_instructor_assign 
             (course_id, instructor_id, course_status)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [courseId, instructorId, course_status]
          );
          assignments.push(result.rows[0]);
        }
      } catch (err) {
        errors.push(`Error assigning instructor ${instructorId}: ${err.message}`);
      }
    }

    if (assignments.length === 0 && errors.length > 0) {
      return res.status(400).json({
        error: "Failed to assign instructors",
        details: errors
      });
    }

    res.status(201).json({
      success: true,
      message: `Successfully assigned ${assignments.length} instructor(s)`,
      assignments,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (err) {
    console.error("POST /api/courses/:courseId/instructors error:", err);
    res.status(500).json({ error: "Failed to assign instructors" });
  }
};

// Remove an instructor assignment
const removeInstructorAssignment = async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const instructorId = Number(req.params.instructorId);

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    if (!Number.isInteger(instructorId) || instructorId <= 0) {
      return res.status(400).json({ error: "Invalid instructor ID" });
    }

    const deleteResult = await pool.query(
      `DELETE FROM Course_instructor_assign 
       WHERE course_id = $1 AND instructor_id = $2`,
      [courseId, instructorId]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    res.json({
      success: true,
      message: "Instructor assignment removed successfully"
    });
  } catch (err) {
    console.error("DELETE /api/courses/:courseId/instructors/:instructorId error:", err);
    res.status(500).json({ error: "Failed to remove instructor assignment" });
  }
};

// Update instructor assignment status
const updateAssignmentStatus = async (req, res) => {
  try {
    const courseId = Number(req.params.courseId);
    const instructorId = Number(req.params.instructorId);
    const { course_status } = req.body;

    if (!Number.isInteger(courseId) || courseId <= 0) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    if (!Number.isInteger(instructorId) || instructorId <= 0) {
      return res.status(400).json({ error: "Invalid instructor ID" });
    }

    if (!course_status) {
      return res.status(400).json({ error: "Course status is required" });
    }

    const updateResult = await pool.query(
      `UPDATE Course_instructor_assign 
       SET course_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE course_id = $2 AND instructor_id = $3
       RETURNING *`,
      [course_status, courseId, instructorId]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error("PUT /api/courses/:courseId/instructors/:instructorId/status error:", err);
    res.status(500).json({ error: "Failed to update assignment status" });
  }
};

// Get all assignments (for admin view)
const getAllAssignments = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        cia.course_id,
        cia.instructor_id,
        cia.course_status,
        cia.created_at,
        cia.updated_at,
        u.full_name as instructor_name,
        u.email as instructor_email,
        c.course_code,
        c.course_name,
        c.credit_hour,
        c.category
       FROM Course_instructor_assign cia
       LEFT JOIN users u ON cia.instructor_id = u.id
       LEFT JOIN Course c ON cia.course_id = c.course_id
       ORDER BY cia.created_at DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /api/course-instructor-assign error:", err);
    res.status(500).json({ error: "Failed to fetch all assignments" });
  }
};

module.exports = {
  getCourse,
  createCourse,
  updateCourse,
  deleteCourse,
  getAvailableInstructors,
  getCourseInstructors,
  assignInstructorsToCourse,
  removeInstructorAssignment,
  updateAssignmentStatus,
  getAllAssignments
};