const lockSession = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ locked: true });
  }

  req.session.user.is_locked = true;

  res.json({
    success: true,
    locked: true,
  });
};
const profile = (req, res) => {
  if (!req.session.user) {
    return res.json({
      success: true,
      loggedIn: false,
      locked: true,
    });
  }

  return res.json({
    success: true,
    loggedIn: true,
    locked: req.session.user.is_locked === true,
    user: req.session.user,
  });
};




const pool = require("../db");

// Helper function to automatically update expired semesters
const updateExpiredSemesters = async (client) => {
  try {
    const currentDate = new Date().toISOString().split('T')[0];
    
    const updateQuery = `
      UPDATE semesters 
      SET status = 'completed', updated_at = NOW()
      WHERE status IN ('active', 'inactive')
        AND end_date < $1
        AND status != 'completed'
      RETURNING id, semester, academic_year, end_date
    `;

    const currentStudent = await client.query(`
       SELECT s.*,st.* FROM students st 
        JOIN semesters s ON st.semester_id=s.id 
        WHERE s.status='completed' AND st.status='Active'
    `);
    
    for (const stud of currentStudent.rows) {
      await client.query(`
      UPDATE students 
      SET status = 'Suspended', updated_at = NOW()
      WHERE status ='Active'
        AND student_id=$1`, [stud.student_id]);
    }
    
    const result = await client.query(updateQuery, [currentDate]);
    if (result.rows.length > 0) {
      console.log(`Automatically updated ${result.rows.length} expired semesters to 'completed' status`);
    }
    
    return result.rows;
  } catch (err) {
    console.error("Error updating expired semesters:", err);
    throw err;
  }
};

// Get all semesters with automatic status update
const getAllSemesters = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First, update any expired semesters
    await updateExpiredSemesters(client);
    
    // Then fetch all semesters
    const query = `
      SELECT 
        s.*,
        b.batch_year
      FROM semesters s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      ORDER BY 
        CASE 
          WHEN s.status = 'active' THEN 1
          WHEN s.status = 'upcoming' THEN 2
          WHEN s.status = 'completed' THEN 3
          ELSE 4
        END,
        s.academic_year DESC, 
        s.start_date DESC
    `;

    const result = await client.query(query);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error fetching semesters:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch semesters" 
    });
  } finally {
    client.release();
  }
};

// Get semester by ID
const getSemesterById = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;    
    
    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);
    
    const query = `
      SELECT 
        s.*,
        b.batch_year
      FROM semesters s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE s.id = $1 
    `;

    const result = await client.query(query, [id]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Semester not found" 
      });
    }

    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error fetching semester:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch semester" 
    });
  } finally {
    client.release();
  }
};

// Create new semester with status validation
const createSemester = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { semester, batch_id, academic_year, start_date, end_date, status } = req.body;

    // Validation
    if (!semester || !batch_id || !academic_year || !start_date || !end_date) {
      return res.status(400).json({ 
        success: false, 
        error: "All fields are required" 
      });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const currentDate = new Date();
    
    if (startDate >= endDate) {
      return res.status(400).json({ 
        success: false, 
        error: "End date must be after start date" 
      });
    }

    // Validate academic year format (YYYY-YYYY)
    const academicYearRegex = /^\d{4}-\d{4}$/;
    if (!academicYearRegex.test(academic_year)) {
      return res.status(400).json({ 
        success: false, 
        error: "Academic year must be in format: YYYY-YYYY (e.g., 2023-2024)" 
      });
    }

    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);

    // Check if semester already exists
    const existingSemester = await client.query(
      `SELECT * FROM semesters 
       WHERE semester = $1 AND academic_year = $2 AND batch_id = $3`,
      [semester, academic_year, batch_id]
    );

    if (existingSemester.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Semester with this name, academic year, and batch already exists" 
      });
    }

    // Verify batch exists
    const batchExists = await client.query(
      "SELECT * FROM batches WHERE batch_id = $1",
      [batch_id]
    );

    if (batchExists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Selected batch does not exist" 
      });
    }

    // Determine status based on dates if not provided
    let finalStatus = status || 'inactive';
    
    if (endDate < currentDate) {
      // Semester has already ended
      finalStatus = 'completed';
    } else if (startDate <= currentDate && currentDate <= endDate) {
      // Semester is currently running
      finalStatus = 'active';
    } else if (startDate > currentDate) {
      // Semester is in the future
      finalStatus = 'upcoming';
    }

    // Create semester
    const result = await client.query(
      `INSERT INTO semesters (semester, batch_id, academic_year, start_date, end_date, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *,
         (SELECT batch_year FROM batches WHERE batch_id = $2) as batch_year`,
      [semester, batch_id, academic_year, start_date, end_date, finalStatus]
    );

    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: "Semester created successfully",
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error creating semester:", err);
    
    if (err.code === '23505') {
      return res.status(400).json({ 
        success: false, 
        error: "Semester with this name and academic year already exists" 
      });
    }
    
    if (err.code === '23503') {
      if (err.constraint === 'semesters_batch_id_fkey') {
        return res.status(400).json({ 
          success: false, 
          error: "Selected batch does not exist" 
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to create semester" 
    });
  } finally {
    client.release();
  }
};

// Update semester status
const updateStatus = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive', 'completed', 'upcoming'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);

    // Check if semester exists
    const semesterCheck = await client.query(
      "SELECT * FROM semesters WHERE id = $1",
      [id]
    );

    if (semesterCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Semester not found' });
    }

    const semester = semesterCheck.rows[0];
    const currentDate = new Date();
    const endDate = new Date(semester.end_date);

    // Prevent manual status change if semester has ended
    if (endDate < currentDate && status !== 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Cannot change status of completed semester. Semester end date has passed.' 
      });
    }

    const result = await client.query(
      `UPDATE semesters
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *,
         (SELECT batch_year FROM batches WHERE batch_id = $3) as batch_year`,
      [status, id, semester.batch_id]
    );

    await client.query('COMMIT');

    res.json({ 
      success: true,
      message: "Semester status updated successfully",
      data: result.rows[0] 
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating semester status:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// Update semester
const updateSemester = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { semester, batch_id, academic_year, start_date, end_date, status } = req.body;
    const currentDate = new Date();

    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);

    // Check if semester exists
    const existingSemester = await client.query(
      "SELECT * FROM semesters WHERE id = $1",
      [id]
    );

    if (existingSemester.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Semester not found" 
      });
    }

    const currentSemester = existingSemester.rows[0];

    // Check for duplicate semester
    const duplicateSemester = await client.query(
      `SELECT * FROM semesters 
       WHERE semester = $1 AND academic_year = $2 AND batch_id = $3 AND id != $4`,
      [
        semester || currentSemester.semester,
        academic_year || currentSemester.academic_year,
        batch_id || currentSemester.batch_id,
        id
      ]
    );

    if (duplicateSemester.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Semester with this name, academic year, and batch already exists" 
      });
    }

    // Validate academic year format
    if (academic_year) {
      const academicYearRegex = /^\d{4}-\d{4}$/;
      if (!academicYearRegex.test(academic_year)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: "Academic year must be in format: YYYY-YYYY (e.g., 2023-2024)" 
        });
      }
    }

    // Validate dates
    const startDate = start_date ? new Date(start_date) : new Date(currentSemester.start_date);
    const endDate = end_date ? new Date(end_date) : new Date(currentSemester.end_date);
    
    if (startDate >= endDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "End date must be after start date" 
      });
    }

    // Verify batch exists if changing
    if (batch_id && batch_id !== currentSemester.batch_id) {
      const batchExists = await client.query(
        "SELECT * FROM batches WHERE batch_id = $1",
        [batch_id]
      );

      if (batchExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: "Selected batch does not exist" 
        });
      }
    }

    // Determine status based on dates
    let finalStatus = status || currentSemester.status;
    
    // Auto-update status based on dates if not manually specified
    if (!status) {
      if (endDate < currentDate) {
        finalStatus = 'completed';
      } else if (startDate <= currentDate && currentDate <= endDate) {
        finalStatus = 'active';
      } else if (startDate > currentDate) {
        finalStatus = 'upcoming';
      }
    } else if (endDate < currentDate && status !== 'completed') {
      // If trying to set a non-completed status for expired semester
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Cannot set non-completed status for expired semester" 
      });
    }

    // Update semester
    const result = await client.query(
      `UPDATE semesters 
       SET 
         semester = $1,
         batch_id = $2,
         academic_year = $3,
         start_date = $4,
         end_date = $5,
         status = $6,
         updated_at = NOW() 
       WHERE id = $7  
       RETURNING *,
         (SELECT batch_year FROM batches WHERE batch_id = $2) as batch_year`,
      [
        semester || currentSemester.semester,
        batch_id || currentSemester.batch_id,
        academic_year || currentSemester.academic_year,
        start_date || currentSemester.start_date,
        end_date || currentSemester.end_date,
        finalStatus,
        id
      ]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: "Semester updated successfully",
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating semester:", err);
    
    if (err.code === '23505') {
      return res.status(400).json({ 
        success: false, 
        error: "Semester with this name, academic year, and batch already exists" 
      });
    }
    
    if (err.code === '23503') {
      if (err.constraint === 'semesters_batch_id_fkey') {
        return res.status(400).json({ 
          success: false, 
          error: "Selected batch does not exist" 
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to update semester" 
    });
  } finally {
    client.release();
  }
};

// Delete semester
const deleteSemester = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);

    // Check if semester exists
    const semester = await client.query(
      "SELECT * FROM semesters WHERE id = $1",
      [id]
    );

    if (semester.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Semester not found" 
      });
    }

    // Check if semester is used in any schedules
    const scheduleCount = await client.query(
      "SELECT COUNT(*) FROM schedules WHERE semester_id = $1",
      [semester.semester]
    );

    if (parseInt(scheduleCount.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Cannot delete semester. It is being used in existing schedules." 
      });
    }

    // Delete semester
    await client.query(
      "DELETE FROM semesters WHERE id = $1",
      [id]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: "Semester deleted successfully"
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error deleting semester:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete semester" 
    });
  } finally {
    client.release();
  }
};

// Other functions with automatic status update
const getSemestersByBatch = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { batch_id } = req.params;
    
    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);
    
    const query = `
      SELECT 
        s.*,
        b.batch_year
      FROM semesters s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE s.batch_id = $1
      ORDER BY 
        CASE 
          WHEN s.status = 'active' THEN 1
          WHEN s.status = 'upcoming' THEN 2
          WHEN s.status = 'completed' THEN 3
          ELSE 4
        END,
        s.academic_year DESC,
        s.start_date DESC
    `;

    const result = await client.query(query, [batch_id]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error fetching semesters by batch:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch semesters" 
    });
  } finally {
    client.release();
  }
};

// Get active semesters
const getActiveSemesters = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);
    
    const query = `
      SELECT 
        s.*,
        b.batch_year
      FROM semesters s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE  s.status = 'upcoming'
      ORDER BY s.academic_year DESC, s.start_date DESC
    `;

    const result = await client.query(query);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error fetching active semesters:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch active semesters" 
    });
  } finally {
    client.release();
  }
};

// Get completed semesters
const getCompletedSemesters = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);
    
    const query = `
      SELECT 
        s.*,
        b.batch_year
      FROM semesters s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE s.status = 'completed'
      ORDER BY s.end_date DESC, s.academic_year DESC
    `;

    const result = await client.query(query);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error fetching completed semesters:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch completed semesters" 
    });
  } finally {
    client.release();
  }
};

// Get current semester
const getCurrentSemester = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Update expired semesters first
    await updateExpiredSemesters(client);
    
    const currentDate = new Date().toISOString().split('T')[0];
    const query = `
      SELECT 
        s.*,
        b.batch_year
      FROM semesters s
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      WHERE s.status = 'active'
        AND $1 BETWEEN s.start_date AND s.end_date
      ORDER BY s.start_date DESC
      LIMIT 1
    `;

    const result = await client.query(query, [currentDate]);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: result.rows[0] || null
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error fetching current semester:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch current semester" 
    });
  } finally {
    client.release();
  }
};

// Standalone endpoint to update expired semesters
const autoUpdateExpiredSemesters = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const updatedSemesters = await updateExpiredSemesters(client);
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: "Expired semesters updated successfully",
      data: updatedSemesters
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error in auto-update:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update expired semesters" 
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllSemesters,
  getSemesterById,
  createSemester,
  updateSemester,
  updateStatus,
  deleteSemester,
  getSemestersByBatch,
  getActiveSemesters,
  getCompletedSemesters,
  getCurrentSemester,
  autoUpdateExpiredSemesters
};