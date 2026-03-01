// src/controllers/timeSlotController.js
const pool = require("../db");
 
const getAllTimeSlots = async (req, res) => {
  try {
    const query = `
      SELECT 
        ts.*,
        d.department_name,
        TO_CHAR(ts.start_time, 'HH24:MI') as formatted_start_time,
        TO_CHAR(ts.end_time, 'HH24:MI') as formatted_end_time,
        EXTRACT(EPOCH FROM (ts.end_time - ts.start_time))/60 as Lecture_duration_minutes
      FROM time_slots ts
      LEFT JOIN departments d ON ts.department_id = d.department_id
      ORDER BY ts.start_time
    `;

    const { rows } = await pool.query(query);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching time slots:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch time slots"
    });
  }
};
const getTimeSlotById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        ts.*,
        d.department_name
      FROM time_slots ts
      LEFT JOIN departments d ON ts.department_id = d.department_id
      WHERE ts.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Time slot not found"
      });
    }

    res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error("Error fetching time slot:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch time slot"
    });
  }
};
const createTimeSlot = async (req, res) => {
  try {
    const { 
      start_time, 
      end_time, 
      department_id, 
      lecture_duration,
      labratory_duration
    } = req.body;
       console.log("request", req.body);
    // Validate required fields
    if ( !start_time || !end_time || !department_id|| lecture_duration === null || labratory_duration === null) {
      return res.status(400).json({
        success: false,
        error: "All fields are required ( start_time, end_time, department_id, Lecture_duration, labratory_duration)"
      });
    }

    // Validate time format and logic
    const start = new Date(`1970-01-01T${start_time}:00`);
    const end = new Date(`1970-01-01T${end_time}:00`);
    
    if (start >= end) {
      return res.status(400).json({
        success: false,
        error: "End time must be after start time"
      });
    }

    // Check for overlapping time slots
    const overlapCheck = await pool.query(`
      SELECT id FROM time_slots 
      WHERE  department_id = $1
      AND (
        ($2::time, $3::time) OVERLAPS (start_time, end_time)
        AND id != COALESCE($4, 0)
      )
    `, [department_id, start_time, end_time, null]);

    if (overlapCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: "Time slot overlaps with existing time slot for this department"
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

    // Create time slot
    const query = `
      INSERT INTO time_slots 
        (start_time, end_time, department_id, Lecture_duration, labratory_duration)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [
      start_time, 
      end_time, 
      department_id, 
      Number(lecture_duration),
      Number(labratory_duration)
    ]);

    // Get full data with joins
    const fullData = await pool.query(`
      SELECT 
        ts.*,
        d.department_name
      FROM time_slots ts
      LEFT JOIN departments d ON ts.department_id = d.department_id
      WHERE ts.id = $1
    `, [rows[0].id]);

    res.status(201).json({
      success: true,
      message: "Time slot created successfully",
      data: fullData.rows[0]
    });
  } catch (error) {
    console.error("Error creating time slot:", error);
    
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: "Time slot with same day and time already exists"
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to create time slot"
    });
  }
};
const updateTimeSlot = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // 🔍 Check if time slot exists
    const checkQuery = await pool.query(
      "SELECT * FROM time_slots WHERE id = $1",
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Time slot not found"
      });
    }
      // Check if time slot is used in schedules
    const scheduleCheck = await pool.query(`
      SELECT 1 FROM day_courses dc
      JOIN day_schedules ds ON dc.day_schedule_id = ds.id
      JOIN schedules s ON ds.schedule_id = s.id
      WHERE s.department_id = (SELECT department_id FROM time_slots WHERE id = $1) and s.status='published'
      LIMIT 1
    `, [id]);

    if (scheduleCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot update time slot that is being used in schedules. please unpublish current schedule"
      });
    }

    // ✅ Allowed fields (MATCH DB COLUMN NAMES)
    const allowedFields = [
      "start_time",
      "end_time",
      "lecture_duration",
      "labratory_duration"
    ];

    const updateFields = [];
    const values = [];
    let paramCount = 1;

    for (const [field, value] of Object.entries(updates)) {
      if (allowedFields.includes(field) && value !== undefined) {
        updateFields.push(`${field} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    //  Nothing to update
    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid fields to update"
      });
    }

    // ⏱ Auto update timestamp
    updateFields.push(`updated_at = NOW()`);

    values.push(id);

    const query = `
      UPDATE time_slots
      SET ${updateFields.join(", ")}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    res.status(200).json({
      success: true,
      message: "Time slot updated successfully",
      data: rows[0]
    });

  } catch (error) {
    console.error("Error updating time slot:", error);

    // 🔁 Duplicate (department_id, start_time, end_time)
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        error: "Duplicate time slot for this department"
      });
    }

    // ❗ NOT NULL violation
    if (error.code === "23502") {
      return res.status(400).json({
        success: false,
        error: "Lecture and laboratory duration cannot be null"
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to update time slot"
    });
  }
};
const deleteTimeSlot = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if time slot exists
    const checkQuery = await pool.query(
      "SELECT * FROM time_slots WHERE id = $1",
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Time slot not found"
      });
    }

    // Check if time slot is used in schedules
    const scheduleCheck = await pool.query(`
      SELECT 1 FROM day_courses dc
      JOIN day_schedules ds ON dc.day_schedule_id = ds.id
      JOIN schedules s ON ds.schedule_id = s.id
      WHERE s.department_id = (SELECT department_id FROM time_slots WHERE id = $1)
      LIMIT 1
    `, [id]);

    if (scheduleCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete time slot that is being used in schedules. you can edit."
      });
    }

    // Delete the time slot
    await pool.query("DELETE FROM time_slots WHERE id = $1", [id]);

    res.status(200).json({
      success: true,
      message: "Time slot deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting time slot:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete time slot"
    });
  }
};
const getTimeSlotsByDepartment = async (req, res) => {
  try {
    const { department_id } = req.params;
    let query = `
      SELECT 
        ts.*,
        d.department_name
        TO_CHAR(ts.start_time, 'HH24:MI') as formatted_start_time,
        TO_CHAR(ts.end_time, 'HH24:MI') as formatted_end_time
      FROM time_slots ts
      LEFT JOIN departments d ON ts.department_id = d.department_id
      WHERE ts.department_id = $1
    `;

    const values = [department_id];
    

    query += ` ORDER BY  ts.start_time`;

    const { rows } = await pool.query(query, values);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching department time slots:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch department time slots"
    });
  }
};
const getTimeSlotsByDay = async (req, res) => {
  try {
    const { day_of_week } = req.params;

    const query = `
      SELECT 
        ts.*,
        d.department_name,
        TO_CHAR(ts.start_time, 'HH24:MI') as formatted_start_time,
        TO_CHAR(ts.end_time, 'HH24:MI') as formatted_end_time
      FROM time_slots ts
      LEFT JOIN departments d ON ts.department_id = d.department_id
      ORDER BY ts.start_time
    `;

    const { rows } = await pool.query(query, [day_of_week]);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching day time slots:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch day time slots"
    });
  }
};
module.exports = {
  getAllTimeSlots,
  getTimeSlotById,
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  getTimeSlotsByDepartment,
  getTimeSlotsByDay,
};