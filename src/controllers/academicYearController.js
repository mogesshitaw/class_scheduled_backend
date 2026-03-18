const pool = require("../db");

// Helper function to auto-update expired academic years
const updateExpiredAcademicYears = async (client) => {
  try {
    const currentDate = new Date().toISOString().split('T')[0];
    
    const updateQuery = `
      UPDATE academic_year 
      SET status = 'completed', updated_at = NOW()
      WHERE status IN ('active', 'inactive', 'upcoming')
        AND end_date < $1
        AND status != 'completed'
      RETURNING id, academic_year, end_date
    `;

    const result = await client.query(updateQuery, [currentDate]);
    if (result.rows.length > 0) {
      console.log(`Auto-updated ${result.rows.length} expired academic years`);
    }
    
    return result.rows;
  } catch (err) {
    console.error("Error updating expired academic years:", err);
    throw err;
  }
};

// Get all academic years with semester and batch info
const getAllAcademicYears = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ay.id,
        ay.academic_year,
        ay.start_date,
        ay.end_date,
        ay.status,
        ay.semester_id,
        ay.batch_id,
        s.semester,
        b.batch_year
      FROM academic_year ay
      JOIN semesters s ON s.id = ay.semester_id
      JOIN batches b ON b.batch_id = ay.batch_id
      ORDER BY ay.academic_year DESC, ay.start_date DESC
    `);

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch academic years",
    });
  }
};

// Create new academic year
const createAcademicYear = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { semester_id, batch_id, academic_year, start_date, end_date, status } = req.body;

    // Validation
    if (!semester_id || !batch_id || !academic_year || !start_date || !end_date) {
      return res.status(400).json({  
        success: false, 
        error: "All fields are required" 
      });
    }

    await client.query('BEGIN');
    await updateExpiredAcademicYears(client);

    // Check if semester exists
    const semesterExists = await client.query(
      "SELECT * FROM semesters WHERE id = $1",
      [semester_id]
    );

    if (semesterExists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Selected semester does not exist" 
      });
    }

    // Check if batch exists
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

    // Check for duplicate academic year entry
    const existingAcademicYear = await client.query(
      `SELECT * FROM academic_year 
       WHERE batch_id = $1 AND semester_id = $2 AND academic_year = $3`,
      [batch_id, semester_id, academic_year]
    );

    if (existingAcademicYear.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Academic year for this semester and batch already exists" 
      });
    }

    // Validate dates
    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    const currentDate = new Date();
    
    if (startDate >= endDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "End date must be after start date" 
      });
    }

    // Determine status based on dates
    let finalStatus = status || 'inactive';
    
    if (endDate < currentDate) {
      finalStatus = 'completed';
    } else if (startDate <= currentDate && currentDate <= endDate) {
      finalStatus = 'active';
    } else if (startDate > currentDate) {
      finalStatus = 'upcoming';
    }

    // Create academic year
    const result = await client.query(
      `INSERT INTO academic_year 
       (batch_id, semester_id, academic_year, start_date, end_date, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *,
         (SELECT semester FROM semesters WHERE id = $2) as semester_name,
         (SELECT batch_year FROM batches WHERE batch_id = $1) as batch_year`,
      [batch_id, semester_id, academic_year, start_date, end_date, finalStatus]
    );

    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      message: "Academic year created successfully",
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error creating academic year:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to create academic year" 
    });
  } finally {
    client.release();
  }
};

// Update academic year
const updateAcademicYear = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { semester_id, batch_id, academic_year, start_date, end_date, status } = req.body;

    await client.query('BEGIN');
    await updateExpiredAcademicYears(client);

    // Get current academic year
    const currentAcademicYear = await client.query(
      `SELECT * FROM academic_year WHERE id = $1`,
      [id]
    );

    if (currentAcademicYear.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Academic year not found" 
      });
    }

    const current = currentAcademicYear.rows[0];
    
    // Check if academic year is completed (cannot edit completed years)
    if (current.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Cannot edit completed academic years" 
      });
    }

    // Validate semester if changing
    if (semester_id && semester_id !== current.semester_id) {
      const semesterExists = await client.query(
        "SELECT * FROM semesters WHERE id = $1",
        [semester_id]
      );
      
      if (semesterExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: "Selected semester does not exist" 
        });
      }
    }

    // Validate batch if changing
    if (batch_id && batch_id !== current.batch_id) {
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

    // Check for duplicates
    const duplicateCheck = await client.query(
      `SELECT * FROM academic_year 
       WHERE batch_id = $1 AND semester_id = $2 AND academic_year = $3 AND id != $4`,
      [
        batch_id || current.batch_id,
        semester_id || current.semester_id,
        academic_year || current.academic_year,
        id
      ]
    );

    if (duplicateCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Academic year for this semester and batch already exists" 
      });
    }

    // Validate dates
    const startDate = new Date(start_date || current.start_date);
    const endDate = new Date(end_date || current.end_date);
    
    if (startDate >= endDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "End date must be after start date" 
      });
    }

    // Determine status based on dates if status is not provided
    let finalStatus = status || current.status;
    const currentDate = new Date();
    
    if (!status) {
      if (endDate < currentDate) {
        finalStatus = 'completed';
      } else if (startDate <= currentDate && currentDate <= endDate) {
        finalStatus = 'active';
      } else if (startDate > currentDate) {
        finalStatus = 'upcoming';
      }
    }

    // Update academic year
    const result = await client.query(
      `UPDATE academic_year 
       SET 
         batch_id = COALESCE($1, batch_id),
         semester_id = COALESCE($2, semester_id),
         academic_year = COALESCE($3, academic_year),
         start_date = COALESCE($4, start_date),
         end_date = COALESCE($5, end_date),
         status = $6,
         updated_at = NOW()
       WHERE id = $7
       RETURNING *,
         (SELECT semester FROM semesters WHERE id = COALESCE($2, semester_id)) as semester_name,
         (SELECT batch_year FROM batches WHERE batch_id = COALESCE($1, batch_id)) as batch_year`,
      [
        batch_id || null,
        semester_id || null,
        academic_year || null,
        start_date || null,
        end_date || null,
        finalStatus,
        id
      ]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: "Academic year updated successfully",
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating academic year:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update academic year" 
    });
  } finally {
    client.release();
  }
};

// Delete academic year
const deleteAcademicYear = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Get current academic year
    const currentAcademicYear = await client.query(
      `SELECT * FROM academic_year WHERE id = $1`,
      [id]
    );

    if (currentAcademicYear.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Academic year not found" 
      });
    }

    const academicYear = currentAcademicYear.rows[0];
    
    // Check if academic year is completed (cannot delete completed years)
    if (academicYear.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Cannot delete completed academic years" 
      });
    }

    // // Check if academic year has associated schedules
    // const hasSchedules = await client.query(
    //   `SELECT EXISTS(SELECT 1 FROM schedules WHERE id = $1)`,
    //   [id]
    // );

    // if (hasSchedules.rows[0].exists) {
    //   await client.query('ROLLBACK');
    //   return res.status(400).json({ 
    //     success: false, 
    //     error: "Cannot delete academic year that has associated schedules" 
    //   });
    // }

    // Delete academic year
    await client.query(
      `DELETE FROM academic_year WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: "Academic year deleted successfully"
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error deleting academic year:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete academic year" 
    });
  } finally {
    client.release();
  }
};
// Update academic year status
const updateAcademicYearStatus = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive', 'completed', 'upcoming'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: "Valid status is required" 
      });
    }

    await client.query('BEGIN');
    await updateExpiredAcademicYears(client);

    // Get current academic year
    const currentAcademicYear = await client.query(
      `SELECT * FROM academic_year WHERE id = $1`,
      [id]
    );

    if (currentAcademicYear.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Academic year not found" 
      });
    }

    const academicYear = currentAcademicYear.rows[0];
    
    // Check if trying to update a completed academic year
    if (academicYear.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Cannot update status of completed academic years" 
      });
    }

    // Validate date logic for status changes
    const currentDate = new Date();
    const startDate = new Date(academicYear.start_date);
    const endDate = new Date(academicYear.end_date);

    // Additional validation for specific status changes
    if (status === 'completed' && endDate > currentDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Cannot mark as completed before end date" 
      });
    }

    if (status === 'active' && startDate > currentDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Cannot set as active before start date" 
      });
    }

    if (status === 'upcoming' && startDate <= currentDate) {
      await client.query('ROLLBACK');
      return res.status(400).json({  
        success: false, 
        error: "Cannot set as upcoming when start date has passed" 
      });
    }

    // Update status - ተስተካክሏል!
    const result = await client.query(
      `UPDATE academic_year 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *,
         (SELECT semester FROM semesters WHERE id = academic_year.semester_id) as semester_name,
         (SELECT batch_year FROM batches WHERE batch_id = academic_year.batch_id) as batch_year`,
      [status, id]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: "Academic year status updated successfully",
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating academic year status:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update academic year status" 
    });
  } finally {
    client.release();
  }
};
// Get academic year by ID
const getAcademicYearById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT 
        ay.*,
        s.semester,
        b.batch_year
       FROM academic_year ay
       JOIN semesters s ON s.id = ay.semester_id
       JOIN batches b ON b.batch_id = ay.batch_id
       WHERE ay.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Academic year not found" 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Error fetching academic year:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch academic year" 
    });
  }
};

// Get current academic year (based on current date)
const getCurrentAcademicYear = async (req, res) => {
  try {
    const { date } = req.query;
    const currentDate = date || new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT 
        ay.*,
        s.semester,
        b.batch_year
       FROM academic_year ay
       JOIN semesters s ON s.id = ay.semester_id
       JOIN batches b ON b.batch_id = ay.batch_id
       WHERE ay.start_date <= $1 
         AND ay.end_date >= $1
         AND ay.status = 'active'
       ORDER BY ay.start_date DESC
       LIMIT 1`,
      [currentDate]
    );

    res.json({
      success: true,
      data: result.rows[0] || null
    });
  } catch (err) {
    console.error("Error fetching current academic year:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch current academic year" 
    });
  }
};

module.exports = {
  getAllAcademicYears,
  createAcademicYear,
  updateAcademicYear,
  deleteAcademicYear,
  updateAcademicYearStatus,
  getAcademicYearById,
  getCurrentAcademicYear,
  updateExpiredAcademicYears: async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await updateExpiredAcademicYears(client);
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: "Expired academic years updated successfully",
        data: updated
      });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ 
        success: false, 
        error: "Failed to update expired academic years" 
      });
    } finally {
      client.release();
    }
  }
};