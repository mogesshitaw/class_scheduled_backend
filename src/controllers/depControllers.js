const pool = require("../db");



const getDepHitory = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT d.department_id, d.department_name, d.head_id, u.full_name AS head_name, lastdate_at FROM departments_history d LEFT JOIN users u ON d.head_id = u.id"
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/departments/his error:', err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
}
const getDep = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT 
        d.department_id, 
        d.department_name, 
        d.head_id, 
        d.faculity_id,
        u.full_name AS head_name,
        f.faculity_name
      FROM departments d 
      LEFT JOIN users u ON d.head_id = u.id
      LEFT JOIN faculity f ON d.faculity_id = f.faculity_id
      ORDER BY d.department_name
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/departments error:', err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
}
const createDep = async (req, res) => {
  try {
    const { department_name, faculity_id } = req.body;
    
    if (!department_name || !department_name.trim()) {
      return res.status(400).json({ error: 'department_name is required' });
    }

    let query, params;
    
    if (faculity_id) {
      query = `
        INSERT INTO departments (department_name, faculity_id) 
        VALUES ($1, $2) 
        RETURNING department_id, department_name, faculity_id
      `;
      params = [department_name.trim(), faculity_id];
    } else {
      query = `
        INSERT INTO departments (department_name) 
        VALUES ($1) 
        RETURNING department_id, department_name, faculity_id
      `;
      params = [department_name.trim()];
    }

    const { rows } = await pool.query(query, params);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/departments error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Department with this name already exists' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid department ID' });
    }
    res.status(500).json({ error: 'Failed to create department' });
  }
}
const updateDep = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { department_name, faculity_id } = req.body;
    
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    
    if (!department_name || !department_name.trim()) {
      return res.status(400).json({ error: 'department_name is required' });
    }

    let query, params;
    
    if (faculity_id !== undefined) {
      query = `
        UPDATE departments 
        SET department_name = $1, faculity_id = $2, updated_at = NOW() 
        WHERE department_id = $3 
        RETURNING department_id, department_name, faculity_id
      `;
      params = [department_name.trim(), faculity_id, id];
    } else {
      query = `
        UPDATE departments 
        SET department_name = $1, updated_at = NOW() 
        WHERE department_id = $2 
        RETURNING department_id, department_name, faculity_id
      `;
      params = [department_name.trim(), id];
    }

    const { rows, rowCount } = await pool.query(query, params);

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/departments/:id error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Department with this name already exists' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid department ID' });
    }
    res.status(500).json({ error: 'Failed to update department' });
  }
}
const deleteDep = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const { rowCount } = await pool.query(
      'DELETE FROM departments WHERE department_id = $1',
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({ success: true, message: 'Department deleted' });
  } catch (err) {
    console.error('DELETE /api/departments/:id error:', err);
    res.status(500).json({ error: 'Failed to delete department' });
  }
}
const updateHeadId = async (req, res) => {
  const { id } = req.params;
  const { head_id } = req.body;
  try {
    // Validate input
    if (!head_id) {
      return res.status(400).json({ message: "head_id is required" });
    }
    // Fetch instructor and department in parallel for better performance
    const instructorQuery = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [head_id]
    );
    const departmentQuery = await pool.query(
      "SELECT * FROM departments WHERE department_id = $1",
      [id]
    );
    const FetchInstructor = instructorQuery.rows;
    const depOldFetch = departmentQuery.rows;
    // Check if instructor exists
    if (FetchInstructor.length === 0) {
      return res.status(404).json({ message: "Instructor not found" });
    }
    // Check if department exists
    if (depOldFetch.length === 0) {
      return res.status(404).json({ message: "Department not found" });
    }

    // FIXED: Proper validation - check if instructor belongs to this department
    if (FetchInstructor[0].department_id !== parseInt(id)) {
      return res.status(400).json({ 
        message: `Instructor ${FetchInstructor[0].full_name} is not assigned to ${depOldFetch[0].department_name} department` 
      });
    }
    // Handle previous department head if exists
    if (depOldFetch[0].head_id !== null) {
      // Archive previous department head
      await pool.query(
        'INSERT INTO departments_history (department_id, department_name, created_at, updated_at, head_id) VALUES ($1, $2, $3, $4, $5)',
        [
          depOldFetch[0].department_id,
          depOldFetch[0].department_name,
          depOldFetch[0].created_at,
          depOldFetch[0].updated_at,
          depOldFetch[0].head_id,
        ]
      );
      
      // Demote previous head to instructor
      const role = "instructor";
      const result = await pool.query(
        'UPDATE users SET role = $1 WHERE id = $2',
        [role, depOldFetch[0].head_id]
      );
      
      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Previous department head not found" });
      }
    }

    // Update department with new head
    await pool.query(
      "UPDATE departments SET head_id = $1, updated_at = NOW() WHERE department_id = $2", 
      [head_id, id]
    );

    // Promote new head
    const role1 = "department_head";
    const result1 = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [role1, head_id]
    );

    if (result1.rowCount === 0) {
      return res.status(404).json({ message: "New department head not found" });
    }

    // Fetch updated department with head information
    const updatedQuery = await pool.query(`
      SELECT d.department_id, d.department_name, d.head_id, u.full_name AS head_name
      FROM departments d
      LEFT JOIN users u ON d.head_id = u.id
      WHERE d.department_id = $1
    `, [id]);

    res.json(updatedQuery.rows[0]);

  } catch (error) {
    console.error("Error updating department head:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}// Get blocks assigned to a specific faculty
const getRoomByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    console.log(`Fetching rooms for department ID: ${departmentId}`);
    
    // Validate departmentId is a number
    if (isNaN(parseInt(departmentId))) {
      return res.status(400).json({ 
        error: 'Invalid department ID',
        message: 'Department ID must be a number' 
      });
    }
    
    // Check if department exists
    const departmentCheck = await pool.query(
      'SELECT department_id FROM departments WHERE department_id = $1',
      [departmentId]
    );
    
    if (departmentCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Department not found',
        message: `Department with ID ${departmentId} does not exist` 
      });
    }
    const result = await pool.query(`
      SELECT 
        dr.*,
        r.room_number,
        r.room_type,
        r.capacity,
        f.floor_number,
        b.block_name,
        b.block_code
      FROM departments_rooms dr
      JOIN rooms r ON dr.room_id = r.room_id
      JOIN floors f ON  r.floor_id=f.floor_id
      JOIN blocks b ON f.block_id = b.block_id
      WHERE dr.department_id = $1
      ORDER BY dr.created_at DESC
    `, [departmentId]);
    
    console.log(`Found ${result.rows.length} rooms for department ${departmentId}`);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching department rooms:', error);
    res.status(500).json({ 
      error: 'Failed to fetch department rooms',
      details: error.message 
    });
  }
};
const getRoomFromDepartment = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        dr.*,
        r.room_number,
        r.room_type,
        r.capacity,
        f.floor_number,
        b.block_name,
        b.block_code
      FROM departments_rooms dr
      JOIN rooms r ON dr.room_id = r.room_id
      JOIN floors f ON r.floor_id = f.floor_id
      JOIN blocks b ON f.block_id = b.block_id
      ORDER BY dr.created_at DESC
    `);

    res.status(200).json({
      success: true,
      rooms: result.rows
    });

  } catch (error) {
    console.error('Error fetching department rooms:', error);
    res.status(500).json({ 
      error: 'Failed to fetch department rooms',
      details: error.message 
    });
  }
};
// Assign multiple blocks to a department
const assignRoomTodepartment = async (req, res) => {
  try {
    const depId = parseInt(req.params.id);
    const { room_ids, status = 'active' } = req.body;
      
    console.log('Request body:', req.body);
    console.log('department ID:', depId);

    if (!Number.isInteger(depId) || depId <= 0) {
      return res.status(400).json({ error: 'Invalid department ID' });
    }

    // Check if department exists
    const departmentCheck = await pool.query(
      'SELECT department_id, department_name FROM departments WHERE department_id = $1',
      [depId]
    );

    if (departmentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'department not found' });
    }

    const department = departmentCheck.rows[0];
       let result;
        let action;
        let room;
    // Check if room exists
    for (const room_id of room_ids) {
      const roomResult = await pool.query(
        'SELECT room_id FROM rooms WHERE room_id = $1',
        [parseInt(room_id)]
      );

      if (roomResult.rows.length === 0) {
        return res.status(404).json({ error: `Room ID ${room_id} not found` });
      }

       room = roomResult.rows[0];

      // Check if room is already assigned to ANY department (not just this one)
      const existingAssignment = await pool.query(
        `SELECT dr.*, d.department_name 
       FROM departments_rooms dr
       JOIN departments d ON dr.department_id = d.department_id
       WHERE dr.room_id = $1`,
        [parseInt(room_id)]
      );
  
      // Use transaction to ensure data consistency
      try {
        await pool.query('BEGIN');

       
        if (existingAssignment.rows.length > 0) {
          // Room is already assigned to another department
          const assignedToDepartment = existingAssignment.rows[0];
        
          // If it's assigned to THIS department, update it
          if (assignedToDepartment.department_id === depId) {
            result = await pool.query(
              `UPDATE departments_rooms 
             SET status = $1, updated_at = NOW()
             WHERE department_id = $2 AND room_id = $3
             RETURNING *`,
              [status, depId, parseInt(room_ids)]
            );
            action = 'updated';
          } else {
            // Room is assigned to a DIFFERENT department
            await pool.query('ROLLBACK');
            return res.status(409).json({
              error: `Room ${room.room_name} (ID: ${room_id}) is already assigned to department: ${assignedToDepartment.department_name}`,
              current_assignment: {
                department_id: assignedToDepartment.department_id,
                department_name: assignedToDepartment.department_name,
                assignment_id: assignedToDepartment.assignment_id
              }
            });
          }
        } else {
          // Room is not assigned to any department, create new assignment
          result = await pool.query(
            `INSERT INTO departments_rooms 
           (department_id, room_id, status)
           VALUES ($1, $2, $3)
           RETURNING *`,
            [depId, parseInt(room_id), status]
          );
          action = 'created';
        }

        await pool.query('COMMIT');

      } catch (err) {
        await pool.query('ROLLBACK');
      
        if (err.code === '23505') {
          return res.status(409).json({
            error: 'Room is already assigned to another department',
            details: 'Each room can only be assigned to one department'
          });
        }
      
        console.error('Transaction error:', err);
        throw err;
      }
    }
    
        const assignment = {
          ...result.rows[0],
          room_name: room.room_name,
          department_name: department.department_name,
          action: action
        };

        res.status(201).json({
          success: true,
          message: `Room ${room.room_name} has been ${action} ${action === 'updated' ? 'for' : 'to'} department ${department.department_name}`,
          assignment: assignment
        });
  } catch (err) {
    console.error('POST /api/departments/:depId/rooms error:', err);
    res.status(500).json({ 
      error: "Failed to assign room to department",
      details: err.message 
    });
  }
};
// Assign multiple blocks to a department
const assignRoomTodepartmentByFloor = async (req, res) => {
  try {
    const depId = parseInt(req.params.id);
    const floorIds = parseInt(req.params.floorIds);
    const { min_capacity } = req.body;
      
    console.log('Request body:', req.body);
    console.log('department ID:', depId);

    if (!Number.isInteger(depId) || depId <= 0) {
      return res.status(400).json({ error: 'Invalid department ID' });
    }

    // Check if department exists
    const departmentCheck = await pool.query(
      'SELECT department_id, department_name FROM departments WHERE department_id = $1',
      [depId]
    );

    if (departmentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'department not found' });
    }

    const department = departmentCheck.rows[0];
    
       let result,  action, room, room_ids;
    
    // Check if room exists
    if (min_capacity) {
      room_ids = await pool.query(`SELECT 
       f.room_capacity,
      r.room_id FROM floors f
      JOIN rooms r ON f.floor_id=r.floor_id
      WHERE f.floor_id = $1 AND f.room_capacity >= $2`,
      [parseInt(floorIds), min_capacity]);
    }
    else {
      room_ids = await pool.query(`SELECT 
      f.room_capacity,
      r.room_id FROM floors f
      JOIN rooms r ON f.floor_id=r.floor_id
      WHERE f.floor_id = $1`,
      [parseInt(floorIds)]);
    }
    
    if (room_ids.rows.length === 0) {
        return res.status(404).json({ error: `floor not found` });
    }
    for (const room_id of room_ids.rows) {
      const roomResult = await pool.query(
        'SELECT room_id FROM rooms WHERE room_id = $1',
        [room_id.room_id]
      );

      if (roomResult.rows.length === 0) {
        return res.status(404).json({ error: `Room ID ${room_id} not found` });
      }
       room = roomResult.rows[0];
      // Check if room is already assigned to ANY department (not just this one)
      const existingAssignment = await pool.query(
       `SELECT dr.*, d.department_name 
       FROM departments_rooms dr
       JOIN departments d ON dr.department_id = d.department_id
       WHERE dr.room_id = $1`,
        [room_id.room_id]
      );
  
      // Use transaction to ensure data consistency
      try {
        await pool.query('BEGIN');
        if (existingAssignment.rows.length <=0) {
          // Room is not assigned to any department, create new assignment
          result = await pool.query(
            `INSERT INTO departments_rooms 
           (department_id, room_id)
           VALUES ($1, $2)
           RETURNING *`,
            [depId, room_id.room_id]
          );
          action = 'created';
        }
        await pool.query('COMMIT');

      } catch (err) {
        await pool.query('ROLLBACK');
      
        if (err.code === '23505') {
          return res.status(409).json({
            error: 'Room is already assigned to another department',
            details: 'Each room can only be assigned to one department'
          });
        }
      
        console.error('Transaction error:', err);
        throw err;
      }
    }
        res.status(201).json({
          success: true,
          message: `Room ${room.room_name} has been ${action} ${action === 'updated' ? 'for' : 'to'} department ${department.department_name}`,
        });
  } catch (err) {
    console.error('POST /api/departments/:depId/rooms error:', err);
    res.status(500).json({ 
      error: "Failed to assign room to department",
      details: err.message 
    });
  }
};
const removeRoomFromDepartment = async (req, res) => {
  try {
    const departmentId = parseInt(req.params.departmentId);
    const roomId = parseInt(req.params.roomId);

    if (!Number.isInteger(departmentId) || departmentId <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return res.status(400).json({ error: 'Invalid block ID' });
    }

    // Check if assignment exists
    const checkQuery = `
      SELECT dr.*,d.department_name
      FROM  departments_rooms  dr
      INNER JOIN rooms r ON dr.room_id = r.room_id
      INNER JOIN departments d ON dr.department_id = d.department_id
      WHERE dr.department_id = $1 AND dr.room_id = $2
    `;

    const checkResult = await pool.query(checkQuery, [departmentId, roomId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'room assignment not found' });
    }

    const assignment = checkResult.rows[0];

    // Remove the assignment
    const deleteQuery = `
      DELETE FROM departments_rooms 
      WHERE department_id = $1 AND room_id = $2
      RETURNING *
    `;

    await pool.query(deleteQuery, [departmentId, roomId]);

    res.json({
      success: true,
      message: 'Block removed from faculty successfully',
      removed_assignment: assignment
    });
  } catch (err) {
    console.error('DELETE /api/faculties/:departmentId/blocks/:roomId error:', err);
    res.status(500).json({ error: 'Failed to remove block from faculty' });
  }
};
const getDepStats = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ error: 'Invalid department ID' });
    }

    const depId = parseInt(id);

    // Run queries in parallel
    const [instructors, students, courses, announcements] = await Promise.all([
      // Instructors and Department Heads
      pool.query("SELECT count(*) FROM users WHERE department_id = $1 AND role IN ('instructor', 'department_head')", [depId]),
      // Students
      pool.query('SELECT count(*) FROM students WHERE department_id = $1', [depId]),
      // Courses (count unique courses scheduled for this department)
      pool.query(`
        SELECT count(DISTINCT dc.course_id) 
        FROM day_courses dc 
        JOIN day_schedules ds ON dc.day_schedule_id = ds.id 
        JOIN schedules s ON ds.schedule_id = s.id 
        WHERE s.department_id = $1
      `, [depId]),
      // Announcements (assuming all for now as per current dashboard)
      pool.query('SELECT count(*) FROM announcements WHERE department_id = $1', [depId])
    ]);

    res.json({
      instructors: parseInt(instructors.rows[0].count),
      students: parseInt(students.rows[0].count),
      courses: parseInt(courses.rows[0].count),
      announcements: parseInt(announcements.rows[0].count)
    });

  } catch (err) {
    console.error('GET /api/departments/:id/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch department stats' });
  }
};
module.exports = { getDep, getDepHitory, createDep, updateDep, deleteDep, updateHeadId, getRoomByDepartment, assignRoomTodepartment,assignRoomTodepartmentByFloor, removeRoomFromDepartment, getRoomFromDepartment, getDepStats }