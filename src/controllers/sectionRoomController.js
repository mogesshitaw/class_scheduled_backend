const pool = require("../db");

const getAllSectionRooms = async (req, res) => {
  try {
    const query = `
      SELECT 
        sr.id,
        sr.department_id,
        sr.batch_id,
        sr.section,
        sr.room_id,
        sr.created_at,
        sr.updated_at,
        d.department_name,
        b.batch_year,
        r.room_type,
        r.capacity,
        r.is_available,
        f.floor_id,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        bl.block_id,
        bl.block_name,
        bl.block_code,
        dr.status as department_room_status
      FROM section_rooms sr
      LEFT JOIN departments d ON sr.department_id = d.department_id
      LEFT JOIN batches b ON sr.batch_id = b.batch_id
      LEFT JOIN rooms r ON sr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks bl ON f.block_id = bl.block_id
      LEFT JOIN departments_rooms dr ON sr.room_id = dr.room_id AND sr.department_id = dr.department_id
      ORDER BY sr.created_at DESC
    `;

    const { rows } = await pool.query(query);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching section rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch section rooms"
    });
  }
};

const getSectionRoomById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        sr.*,
        d.department_name,
        b.batch_year,
        r.room_type,
        r.capacity,
        f.floor_id,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        bl.block_id,
        bl.block_name,
        bl.block_code
      FROM section_rooms sr
      LEFT JOIN departments d ON sr.department_id = d.department_id
      LEFT JOIN batches b ON sr.batch_id = b.batch_id
      LEFT JOIN rooms r ON sr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks bl ON f.block_id = bl.block_id
      WHERE sr.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Section room assignment not found"
      });
    }

    res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    console.error("Error fetching section room:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch section room"
    });
  }
};

/**
 * @desc    Create a new section room assignment
 * @route   POST /api/section-rooms
 */
const createSectionRoom = async (req, res) => {
  try {
    const { department_id, batch_id, section, room_id } = req.body;

    // Validate required fields
    if (!department_id || !batch_id || !section || !room_id) {
      return res.status(400).json({
        success: false,
        error: "All fields are required (department_id, batch_id, section, room_id)"
      });
    }

    // Check if room belongs to department in departments_rooms
    const roomCheck = await pool.query(
      `SELECT dr.*, 'G'|| f.floor_number || '-' || r.room_number AS room_number,
       r.room_type, r.is_available, 
              f.floor_id, bl.block_name
       FROM departments_rooms dr
       JOIN rooms r ON dr.room_id = r.room_id
       JOIN floors f ON r.floor_id = f.floor_id
       JOIN blocks bl ON f.block_id = bl.block_id
       WHERE dr.department_id = $1 AND dr.room_id = $2 AND dr.status = 'active'`,
      [department_id, room_id]
    );

    if (roomCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Room not available for this department or is inactive"
      });
    }

    // Check if room is available
    if (!roomCheck.rows[0].is_available) {
      return res.status(400).json({
        success: false,
        error: "Room is not available for assignment"
      });
    }
        
    // Check if section already has a room for this batch and department
    const sectionChecklab = await pool.query(
      `SELECT sr.id , r.room_type
        FROM section_rooms sr
        LEFT JOIN rooms r ON sr.room_id=r.room_id 
       WHERE sr.department_id = $1
       AND sr.batch_id = $2
       AND sr.section = $3
       AND r.room_type = 'lab'`,
      [department_id, batch_id, section]
    );
  
    // Check if section already has a room for this batch and department
    const sectionCheckclassroom = await pool.query(
      `SELECT sr.id , r.room_type
        FROM section_rooms sr
        LEFT JOIN rooms r ON sr.room_id=r.room_id 
       WHERE sr.department_id = $1
       AND sr.batch_id = $2
       AND sr.section = $3
       AND r.room_type = 'classroom'`,
      [department_id, batch_id, section]
    );
   
    const roomType = roomCheck.rows[0].room_type.toLowerCase();
    
    // Check if room is already assigned (unique constraint)
    if (roomType !== 'lab') {
      const duplicateCheck = await pool.query(
        `SELECT id FROM section_rooms WHERE room_id = $1`,
        [room_id]
      );
 
      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Room is already assigned to another section"
        });
      }
      
      if (sectionCheckclassroom.rows.length > 0 ){
        return res.status(409).json({
          success: false,
          error: "This section already has a Classroom assigned"
        });
      }
    }
    else if (sectionChecklab.rows.length > 0 ) {
      return res.status(409).json({
        success: false,
        error: "This section already has a Lab room assigned"
      });
    }
    
    // Create the assignment
    const query = `
      INSERT INTO section_rooms (department_id, batch_id, section, room_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [
      department_id, 
      batch_id, 
      section, 
      room_id,
    ]);

    // Get the full data with joins including floor info
    const fullDataQuery = `
      SELECT 
        sr.*,
        d.department_name,
        b.batch_year,
        r.room_type,
        r.capacity,
        f.floor_id,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        bl.block_id,
        bl.block_name,
        bl.block_code
      FROM section_rooms sr
      LEFT JOIN departments d ON sr.department_id = d.department_id
      LEFT JOIN batches b ON sr.batch_id = b.batch_id
      LEFT JOIN rooms r ON sr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks bl ON f.block_id = bl.block_id
      WHERE sr.id = $1
    `;

    const fullData = await pool.query(fullDataQuery, [rows[0].id]);

    res.status(201).json({
      success: true,
      message: "Section room assignment created successfully",
      data: fullData.rows[0]
    });
  } catch (error) {
    console.error("Error creating section room:", error);
    
    if (error.code === '23503') { // Foreign key violation
      if (error.constraint.includes('department_id')) {
        return res.status(404).json({
          success: false,
          error: "Department not found"
        });
      } else if (error.constraint.includes('room_id')) {
        return res.status(404).json({
          success: false,
          error: "Room not found"
        });
      } else if (error.constraint.includes('batch_id')) {
        return res.status(404).json({
          success: false,
          error: "Batch not found"
        });
      }
    } else if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: "Duplicate assignment exists"
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to create section room assignment"
    });
  }
};

/**
 * @desc    Update a section room assignment
 * @route   PUT /api/section-rooms/:id
 */
const updateSectionRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { department_id, batch_id, section, room_id } = req.body;

    // Check if assignment exists
    const checkQuery = await pool.query(
      "SELECT * FROM section_rooms WHERE id = $1",
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Section room assignment not found"
      });
    }

    // If room_id is being changed, check new room availability
    if (room_id && room_id !== checkQuery.rows[0].room_id) {
      const roomCheck = await pool.query(
        `SELECT dr.*,  'G'|| f.floor_number || '-' || r.room_number AS room_number,
, r.is_available,
                f.floor_id, bl.block_name
         FROM departments_rooms dr
         JOIN rooms r ON dr.room_id = r.room_id
         JOIN floors f ON r.floor_id = f.floor_id
         JOIN blocks bl ON f.block_id = bl.block_id
         WHERE dr.department_id = $1 AND dr.room_id = $2 AND dr.status = 'active'`,
        [department_id || checkQuery.rows[0].department_id, room_id]
      );

      if (roomCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Room not available for this department or is inactive"
        });
      }

      if (!roomCheck.rows[0].is_available) {
        return res.status(400).json({
          success: false,
          error: "Room is not available for assignment"
        });
      }

      // Check if new room is already assigned
      const duplicateRoomCheck = await pool.query(
        `SELECT id FROM section_rooms WHERE room_id = $1 AND id != $2`,
        [room_id, id]
      );

      if (duplicateRoomCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "Room is already assigned to another section"
        });
      }
    }

    // Check if section already exists for different assignment
    if (section || batch_id || department_id) {
      const sectionCheck = await pool.query(
        `SELECT id FROM section_rooms 
         WHERE department_id = $1 AND batch_id = $2 AND section = $3 AND id != $4`,
        [
          department_id || checkQuery.rows[0].department_id,
          batch_id || checkQuery.rows[0].batch_id,
          section || checkQuery.rows[0].section,
          id
        ]
      );

      if (sectionCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: "This section already has a room assigned"
        });
      }
    }

    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (department_id !== undefined) {
      updateFields.push(`department_id = $${paramCount}`);
      values.push(department_id);
      paramCount++;
    }

    if (batch_id !== undefined) {
      updateFields.push(`batch_id = $${paramCount}`);
      values.push(batch_id);
      paramCount++;
    }

    if (section !== undefined) {
      updateFields.push(`section = $${paramCount}`);
      values.push(section);
      paramCount++;
    }

    if (room_id !== undefined) {
      updateFields.push(`room_id = $${paramCount}`);
      values.push(room_id);
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
      UPDATE section_rooms 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    // Get the full updated data with joins including floor info
    const fullDataQuery = `
      SELECT 
        sr.*,
        d.department_name,
        b.batch_year,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        f.floor_id,
        f.floor_number,
        bl.block_id,
        bl.block_name,
        bl.block_code
      FROM section_rooms sr
      LEFT JOIN departments d ON sr.department_id = d.department_id
      LEFT JOIN batches b ON sr.batch_id = b.batch_id
      LEFT JOIN rooms r ON sr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks bl ON f.block_id = bl.block_id
      WHERE sr.id = $1
    `;

    const fullData = await pool.query(fullDataQuery, [rows[0].id]);

    res.status(200).json({
      success: true,
      message: "Section room assignment updated successfully",
      data: fullData.rows[0]
    });
  } catch (error) {
    console.error("Error updating section room:", error);
    
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
      error: "Failed to update section room assignment"
    });
  }
};

/**
 * @desc    Delete a section room assignment
 * @route   DELETE /api/section-rooms/:id
 */
const deleteSectionRoom = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if assignment exists
    const checkQuery = await pool.query(
      "SELECT * FROM section_rooms WHERE id = $1",
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Section room assignment not found"
      });
    }

    // Delete the assignment
    await pool.query("DELETE FROM section_rooms WHERE id = $1", [id]);

    res.status(200).json({
      success: true,
      message: "Section room assignment deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting section room:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete section room assignment"
    });
  }
};

const getAvailableRooms = async (req, res) => {
  try {
    const { department_id } = req.query;

    if (!department_id) {
      return res.status(400).json({
        success: false,
        error: "Department ID is required"
      });
    }

    const query = `
      SELECT 
        r.room_id,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        f.floor_id,
        f.floor_number,
        bl.block_id,
        bl.block_name,
        bl.block_code,
        dr.status as department_room_status
      FROM rooms r
      JOIN departments_rooms dr ON r.room_id = dr.room_id
      JOIN floors f ON r.floor_id = f.floor_id
      JOIN blocks bl ON f.block_id = bl.block_id
      WHERE dr.department_id = $1 
        AND dr.status = 'active'
        AND r.is_available = true
        AND r.room_id NOT IN (
          SELECT room_id FROM section_rooms
        )
      ORDER BY bl.block_name, f.floor_number, r.room_number
    `;

    const { rows } = await pool.query(query, [department_id]);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching available rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch available rooms"
    });
  }
};

/**
 * @desc    Get section rooms by filters
 * @route   GET /api/section-rooms/filter
 */
const getSectionRoomsByFilter = async (req, res) => {
  try {
    const { department_id, batch_id, section, room_id } = req.query;

    let query = `
      SELECT 
        sr.*,
        d.department_name,
        b.batch_year,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        f.floor_id,
        f.floor_number,
        bl.block_id,
        bl.block_name,
        bl.block_code
      FROM section_rooms sr
      LEFT JOIN departments d ON sr.department_id = d.department_id
      LEFT JOIN batches b ON sr.batch_id = b.batch_id
      LEFT JOIN rooms r ON sr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks bl ON f.block_id = bl.block_id
      WHERE 1=1
    `;
    
    const values = [];
    let paramCount = 1;

    if (department_id) {
      query += ` AND sr.department_id = $${paramCount}`;
      values.push(department_id);
      paramCount++;
    }

    if (batch_id) {
      query += ` AND sr.batch_id = $${paramCount}`;
      values.push(batch_id);
      paramCount++;
    }

    if (section) {
      query += ` AND sr.section = $${paramCount}`;
      values.push(section);
      paramCount++;
    }

    if (room_id) {
      query += ` AND sr.room_id = $${paramCount}`;
      values.push(room_id);
      paramCount++;
    }

    query += ` ORDER BY sr.created_at DESC`;

    const { rows } = await pool.query(query, values);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error filtering section rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to filter section rooms"
    });
  }
};

module.exports = {
  getAllSectionRooms,
  getSectionRoomById,
  createSectionRoom,
  updateSectionRoom,
  deleteSectionRoom,
  getAvailableRooms,
  getSectionRoomsByFilter
};