const pool = require("../db");

/**
 * @desc    Get all department room assignments with details
 * @route   GET /api/departments-rooms
 */
const getAllDepartmentsRooms = async (req, res) => {
  try {
    const query = `
      SELECT 
        dr.id,
        dr.department_id,
        dr.room_id,
        dr.status,
        dr.created_at,
        dr.updated_at,
        d.department_name,
        d.department_code,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        b.block_name,
        b.block_code
      FROM departments_rooms dr
      LEFT JOIN departments d ON dr.department_id = d.department_id
      LEFT JOIN rooms r ON dr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      ORDER BY dr.created_at DESC
    `;

    const { rows } = await pool.query(query);

    // Parse facilities array from string if needed
    const formattedRows = rows.map(row => ({
      ...row,
      facilities: typeof row.facilities === 'string' 
        ? JSON.parse(row.facilities || '[]')
        : row.facilities || []
    }));

    res.status(200).json({
      success: true,
      count: rows.length,
      data: formattedRows
    });
  } catch (error) {
    console.error("Error fetching departments rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch departments rooms",
      details: error.message
    });
  }
};

/**
 * @desc    Get department room by ID
 * @route   GET /api/departments-rooms/:id
 */
const getDepartmentRoomById = async (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        dr.*,
        d.department_name,
        d.department_code,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        b.block_name,
        b.block_code
      FROM departments_rooms dr
      LEFT JOIN departments d ON dr.department_id = d.department_id
      LEFT JOIN rooms r ON dr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      WHERE dr.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Department room assignment not found"
      });
    }

    // Parse facilities
    const row = rows[0];
    row.facilities = typeof row.facilities === 'string' 
      ? JSON.parse(row.facilities || '[]')
      : row.facilities || [];

    res.status(200).json({
      success: true,
      data: row
    });
  } catch (error) {
    console.error("Error fetching department room:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch department room",
      details: error.message
    });
  }
};

/**
 * @desc    Get available rooms for a specific department
 * @route   GET /api/departments-rooms/available
 */
const getAvailableRoomsForDepartment = async (req, res) => {
  try {
    const { department_id } = req.query;

    if (!department_id) {
      return res.status(400).json({
        success: false,
        error: "Department ID is required"
      });
    }

    // First, get all rooms that belong to this department and are active
    const query = `
      SELECT 
        dr.id as department_room_id,
        dr.status as department_room_status,
        dr.created_at as assigned_at,
        r.room_id,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        f.floor_number,
        b.block_name,
        b.block_code
      FROM departments_rooms dr
      JOIN rooms r ON dr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      WHERE dr.department_id = $1 
        AND dr.status = 'active'
        AND r.is_available = true
      ORDER BY r.room_number
    `;

    const { rows } = await pool.query(query, [department_id]);

    // Parse facilities
    const formattedRows = rows.map(row => ({
      ...row,
      facilities: typeof row.facilities === 'string' 
        ? JSON.parse(row.facilities || '[]')
        : row.facilities || []
    }));

    res.status(200).json({
      success: true,
      count: rows.length,
      data: formattedRows
    });
  } catch (error) {
    console.error("Error fetching available rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch available rooms",
      details: error.message
    });
  }
};

/**
 * @desc    Get rooms by department ID (with optional filters)
 * @route   GET /api/departments/:departmentId/rooms
 */
const getRoomsByDepartmentId = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { status, available_only } = req.query;

    console.log(`Fetching rooms for department ID: ${departmentId}`);

    let query = `
      SELECT 
        dr.id,
        dr.department_id,
        dr.room_id,
        dr.status,
        dr.created_at,
        dr.updated_at,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        b.block_name,
        b.block_code
      FROM departments_rooms dr
      JOIN rooms r ON dr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      WHERE dr.department_id = $1
    `;

    const values = [departmentId];
    let paramCount = 2;

    if (status) {
      query += ` AND dr.status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    if (available_only === 'true') {
      query += ` AND r.is_available = true`;
    }

    query += ` ORDER BY b.block_name, f.floor_number, r.room_number`;

    const { rows } = await pool.query(query, values);

    console.log(`Found ${rows.length} rooms for department ${departmentId}`);

    // Parse facilities
    const formattedRows = rows.map(row => ({
      ...row,
      facilities: typeof row.facilities === 'string' 
        ? JSON.parse(row.facilities || '[]')
        : row.facilities || []
    }));

    res.status(200).json(formattedRows);
  } catch (error) {
    console.error("Error fetching department rooms:", error);
    res.status(500).json({ 
      error: "Failed to fetch department rooms",
      details: error.message 
    });
  }
};

/**
 * @desc    Get departments by room ID
 * @route   GET /api/departments-rooms/room/:room_id
 */
const getDepartmentsByRoomId = async (req, res) => {
  try {
    const { room_id } = req.params;

    const query = `
      SELECT 
        dr.id,
        dr.department_id,
        dr.room_id,
        dr.status,
        dr.created_at,
        dr.updated_at,
        d.department_name,
        d.department_code,
        r.room_number,
      
        f.floor_number,
        b.block_name
      FROM departments_rooms dr
      JOIN departments d ON dr.department_id = d.department_id
      JOIN rooms r ON dr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      WHERE dr.room_id = $1
      ORDER BY dr.created_at DESC
    `;

    const { rows } = await pool.query(query, [room_id]);

    res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error("Error fetching departments for room:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch departments for room",
      details: error.message
    });
  }
};

/**
 * @desc    Get unassigned rooms (rooms not assigned to any department)
 * @route   GET /api/departments-rooms/unassigned
 */
const getUnassignedRooms = async (req, res) => {
  try {
    const query = `
      SELECT 
        r.room_id,
       'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        f.floor_number,
        b.block_name,
        b.block_code
      FROM rooms r
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      WHERE r.room_id NOT IN (
        SELECT room_id FROM departments_rooms
      )
      AND r.is_available = true
      ORDER BY r.room_number
    `;

    const { rows } = await pool.query(query);

    // Parse facilities
    const formattedRows = rows.map(row => ({
      ...row,
      facilities: typeof row.facilities === 'string' 
        ? JSON.parse(row.facilities || '[]')
        : row.facilities || []
    }));

    res.status(200).json({
      success: true,
      count: rows.length,
      data: formattedRows
    });
  } catch (error) {
    console.error("Error fetching unassigned rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch unassigned rooms",
      details: error.message
    });
  }
};

/**
 * @desc    Get department room statistics
 * @route   GET /api/departments-rooms/statistics
 */
const getDepartmentRoomStatistics = async (req, res) => {
  try {
    // Get total assignments
    const totalQuery = await pool.query(
      "SELECT COUNT(*) as total FROM departments_rooms"
    );

    // Get assignments by status
    const statusQuery = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM departments_rooms 
      GROUP BY status
    `);

    // Get assignments by department
    const deptQuery = await pool.query(`
      SELECT 
        d.department_id,
        d.department_name,
        COUNT(dr.id) as room_count
      FROM departments d
      LEFT JOIN departments_rooms dr ON d.department_id = dr.department_id
      GROUP BY d.department_id, d.department_name
      ORDER BY room_count DESC
    `);

    // Get available vs assigned rooms
    const roomStatsQuery = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM rooms WHERE is_available = true) as total_available_rooms,
        (SELECT COUNT(DISTINCT room_id) FROM departments_rooms) as assigned_rooms,
        (SELECT COUNT(DISTINCT room_id) FROM departments_rooms WHERE status = 'active') as active_assigned_rooms
    `);

    res.status(200).json({
      success: true,
      data: {
        total_assignments: parseInt(totalQuery.rows[0].total),
        by_status: statusQuery.rows,
        by_department: deptQuery.rows,
        room_statistics: roomStatsQuery.rows[0]
      }
    });
  } catch (error) {
    console.error("Error fetching department room statistics:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch department room statistics",
      details: error.message
    });
  }
};

/**
 * @desc    Search department rooms
 * @route   GET /api/departments-rooms/search
 */
const searchDepartmentRooms = async (req, res) => {
  try {
    const { q, department_id, room_type, status } = req.query;

    let query = `
      SELECT 
        dr.id,
        dr.department_id,
        dr.room_id,
        dr.status,
        dr.created_at,
        dr.updated_at,
        d.department_name,
        d.department_code,
       'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        b.block_name
      FROM departments_rooms dr
      LEFT JOIN departments d ON dr.department_id = d.department_id
      LEFT JOIN rooms r ON dr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    if (q) {
      query += ` AND (
        d.department_name ILIKE $${paramCount} OR
        d.department_code ILIKE $${paramCount} OR
        r.room_number ILIKE $${paramCount} OR
        r.room_name ILIKE $${paramCount} OR
        b.block_name ILIKE $${paramCount}
      )`;
      values.push(`%${q}%`);
      paramCount++;
    }

    if (department_id) {
      query += ` AND dr.department_id = $${paramCount}`;
      values.push(department_id);
      paramCount++;
    }

    if (room_type) {
      query += ` AND r.room_type = $${paramCount}`;
      values.push(room_type);
      paramCount++;
    }

    if (status) {
      query += ` AND dr.status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }

    query += ` ORDER BY dr.created_at DESC LIMIT 50`;

    const { rows } = await pool.query(query, values);

    // Parse facilities
    const formattedRows = rows.map(row => ({
      ...row,
      facilities: typeof row.facilities === 'string' 
        ? JSON.parse(row.facilities || '[]')
        : row.facilities || []
    }));

    res.status(200).json({
      success: true,
      count: rows.length,
      data: formattedRows
    });
  } catch (error) {
    console.error("Error searching department rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to search department rooms",
      details: error.message
    });
  }
};

/**
 * @desc    Get paginated department rooms
 * @route   GET /api/departments-rooms/paginated
 */
const getPaginatedDepartmentsRooms = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      sort_by = 'created_at', 
      order = 'desc',
      department_id,
      status 
    } = req.query;

    const offset = (page - 1) * limit;

    // Build WHERE clause
    let whereClause = '';
    const values = [];
    let paramCount = 1;

    if (department_id) {
      whereClause += `WHERE dr.department_id = $${paramCount}`;
      values.push(department_id);
      paramCount++;
    }

    if (status) {
      if (whereClause) {
        whereClause += ` AND dr.status = $${paramCount}`;
      } else {
        whereClause += `WHERE dr.status = $${paramCount}`;
      }
      values.push(status);
      paramCount++;
    }

    // Count query
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM departments_rooms dr
      ${whereClause}
    `;

    // Data query
    const dataQuery = `
      SELECT 
        dr.id,
        dr.department_id,
        dr.room_id,
        dr.status,
        dr.created_at,
        dr.updated_at,
        d.department_name,
        d.department_code,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        b.block_name
      FROM departments_rooms dr
      LEFT JOIN departments d ON dr.department_id = d.department_id
      LEFT JOIN rooms r ON dr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      ${whereClause}
      ORDER BY dr.${sort_by} ${order.toUpperCase()}
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    values.push(parseInt(limit), offset);

    // Execute queries
    const [countResult, dataResult] = await Promise.all([
      pool.query(countQuery, values.slice(0, values.length - 2)),
      pool.query(dataQuery, values)
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    // Parse facilities
    const formattedRows = dataResult.rows.map(row => ({
      ...row,
      facilities: typeof row.facilities === 'string' 
        ? JSON.parse(row.facilities || '[]')
        : row.facilities || []
    }));

    res.status(200).json({
      success: true,
      data: {
        items: formattedRows,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error("Error fetching paginated department rooms:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch paginated department rooms",
      details: error.message
    });
  }
};

const addRoomToDepartment = async (req, res) => {
  try {
    const { department_id, room_id, status = 'active' } = req.body;

    // Validate required fields
    if (!department_id || !room_id) {
      return res.status(400).json({
        success: false,
        error: "Department ID and Room ID are required"
      });
    }

    // Check if department exists
    const departmentCheck = await pool.query(
      "SELECT department_id, department_name FROM departments WHERE department_id = $1",
      [department_id]
    );

    if (departmentCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Department not found"
      });
    }

    // Check if room exists
    const roomCheck = await pool.query(
      "SELECT room_id, room_number, room_name, is_available FROM rooms WHERE room_id = $1",
      [room_id]
    );

    if (roomCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Room not found"
      });
    }

    // Check if room is available
    if (!roomCheck.rows[0].is_available) {
      return res.status(400).json({
        success: false,
        error: "Room is not available for assignment"
      });
    }

    // Check if room is already assigned to any department
    const duplicateCheck = await pool.query(
      `SELECT id, department_id FROM departments_rooms WHERE room_id = $1`,
      [room_id]
    );

    if (duplicateCheck.rows.length > 0) {
      const existingDept = duplicateCheck.rows[0].department_id;
      return res.status(409).json({
        success: false,
        error: `Room is already assigned to department ID: ${existingDept}`
      });
    }

    // Add room to department
    const query = `
      INSERT INTO departments_rooms (department_id, room_id, status)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const { rows } = await pool.query(query, [
      department_id, 
      room_id, 
      status
    ]);

    // Get the full data with joins
    const fullDataQuery = `
      SELECT 
        dr.*,
        d.department_name,
        d.department_code,
       'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        f.floor_number,
        b.block_name
      FROM departments_rooms dr
      LEFT JOIN departments d ON dr.department_id = d.department_id
      LEFT JOIN rooms r ON dr.room_id = r.room_id
      LEFT JOIN floors f ON r.floor_id = f.floor_id
      LEFT JOIN blocks b ON f.block_id = b.block_id
      WHERE dr.id = $1
    `;

    const fullData = await pool.query(fullDataQuery, [rows[0].id]);

    // Parse facilities
    const row = fullData.rows[0];
    row.facilities = typeof row.facilities === 'string' 
      ? JSON.parse(row.facilities || '[]')
      : row.facilities || [];

    res.status(201).json({
      success: true,
      message: "Room added to department successfully",
      data: row
    });
  } catch (error) {
    console.error("Error adding room to department:", error);
    
    if (error.code === '23503') { // Foreign key violation
      return res.status(404).json({
        success: false,
        error: "Department or Room not found"
      });
    } else if (error.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: "Room is already assigned to a department"
      });
    }

    res.status(500).json({
      success: false,
      error: "Failed to add room to department",
      details: error.message
    });
  }
};

const updateDepartmentRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, room_id, department_id } = req.body;

    // Check if assignment exists
    const checkQuery = await pool.query(
      "SELECT * FROM departments_rooms WHERE id = $1",
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Department room assignment not found"
      });
    }

    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (status !== undefined) {
      updateFields.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }

    if (room_id !== undefined) {
      // Check if new room exists and is available
      const roomCheck = await pool.query(
        "SELECT room_id, is_available FROM rooms WHERE room_id = $1",
        [room_id]
      );

      if (roomCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Room not found"
        });
      }

      if (!roomCheck.rows[0].is_available) {
        return res.status(400).json({
          success: false,
          error: "Room is not available"
        });
      }

      updateFields.push(`room_id = $${paramCount}`);
      values.push(room_id);
      paramCount++;
    }

    if (department_id !== undefined) {
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
    values.push(id);

    const query = `
      UPDATE departments_rooms 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    res.status(200).json({
      success: true,
      message: "Department room assignment updated successfully",
      data: rows[0]
    });
  } catch (error) {
    console.error("Error updating department room:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update department room assignment",
      details: error.message
    });
  }
};

const removeRoomFromDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if assignment exists
    const checkQuery = await pool.query(
      "SELECT * FROM departments_rooms WHERE id = $1",
      [id]
    );

    if (checkQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Department room assignment not found"
      });
    }

    const assignment = checkQuery.rows[0];

    // Check if room is used in section_rooms
    const sectionRoomCheck = await pool.query(
      "SELECT id FROM section_rooms WHERE room_id = $1",
      [assignment.room_id]
    );

    if (sectionRoomCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot remove room that is currently assigned to a section"
      });
    }

    // Remove the assignment
    await pool.query("DELETE FROM departments_rooms WHERE id = $1", [id]);

    res.status(200).json({
      success: true,
      message: "Room removed from department successfully"
    });
  } catch (error) {
    console.error("Error removing room from department:", error);
    res.status(500).json({
      success: false,
      error: "Failed to remove room from department",
      details: error.message
    });
  }
};

const getRoomsByFloorId = async (req, res) => {
  try {
    const { floorId } = req.params;
    
    const query = `
      SELECT 
        r.room_id,
        r.floor_id,
       'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        b.block_id,
        b.block_name,
        b.block_code
      FROM rooms r
      JOIN floors f ON r.floor_id = f.floor_id
      JOIN blocks b ON f.block_id = b.block_id
      WHERE r.floor_id = $1
      ORDER BY r.room_number
    `;
    
    const { rows } = await pool.query(query, [floorId]);
    
    // Parse facilities
    const formattedRows = rows.map(row => ({
      ...row,
      facilities: typeof row.facilities === 'string' 
        ? JSON.parse(row.facilities || '[]')
        : row.facilities || []
    }));
    
    res.status(200).json(formattedRows);
  } catch (error) {
    console.error("Error fetching floor rooms:", error);
    res.status(500).json({ 
      error: "Failed to fetch floor rooms",
      details: error.message 
    });
  }
};

const assignFloorRoomsToDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { floor_id, status = 'active' } = req.body;
    
    if (!floor_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Floor ID is required' 
      });
    }
    
    // Check if department exists
    const departmentCheck = await pool.query(
      'SELECT department_id FROM departments WHERE department_id = $1',
      [departmentId]
    );
    
    if (departmentCheck.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Department not found' 
      });
    }
    
    // Get all available rooms on the floor that are not assigned to any department
    const availableRooms = await pool.query(`
      SELECT r.room_id 
      FROM rooms r
      LEFT JOIN departments_rooms dr ON r.room_id = dr.room_id
      WHERE r.floor_id = $1 
        AND r.is_available = true 
        AND dr.room_id IS NULL
    `, [floor_id]);
    
    if (availableRooms.rows.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No available rooms on this floor',
        available_count: 0 
      });
    }
    
    // Assign each available room to the department
    const assignedRooms = [];
    const errors = [];
    
    for (const room of availableRooms.rows) {
      try {
        const result = await pool.query(
          `INSERT INTO departments_rooms (department_id, room_id, status) 
           VALUES ($1, $2, $3) 
           RETURNING *`,
          [departmentId, room.room_id, status]
        );
        
        assignedRooms.push(result.rows[0]);
      } catch (roomError) {
        // If room is already assigned (unique constraint violation)
        if (roomError.code === '23505') {
          errors.push({
            room_id: room.room_id,
            error: 'Room already assigned to another department'
          });
        } else {
          errors.push({
            room_id: room.room_id,
            error: roomError.message
          });
        }
      }
    }
    
    const response = {
      success: true,
      message: `Assigned ${assignedRooms.length} rooms from floor`,
      assigned_count: assignedRooms.length,
      assigned_rooms: assignedRooms,
    };
    
    if (errors.length > 0) {
      response.errors = errors;
      response.warning = `${errors.length} rooms failed to assign`;
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('Error assigning floor rooms:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error',
      details: error.message 
    });
  }
};

module.exports = {
  getAllDepartmentsRooms,
  getDepartmentRoomById,
  getAvailableRoomsForDepartment,
  getRoomsByDepartmentId,
  getDepartmentsByRoomId,
  getUnassignedRooms,
  getDepartmentRoomStatistics,
  searchDepartmentRooms,
  getPaginatedDepartmentsRooms,
  addRoomToDepartment,
  updateDepartmentRoom,
  removeRoomFromDepartment,
  getRoomsByFloorId,
  assignFloorRoomsToDepartment
};