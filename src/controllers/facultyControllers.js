const pool = require("../db");

// Get all faculties
const getAllFaculties = async (req, res) => {
  try {
    const query = `
     SELECT 
  f.faculity_id,
  f.faculity_name,
  f.created_at,
  f.updated_at,
  COUNT(DISTINCT d.department_id) as department_count,
  STRING_AGG(DISTINCT d.department_name, ', ') as department_names,
  COUNT(DISTINCT bf.block_id) as block_count,
  STRING_AGG(DISTINCT b.block_name, ', ') as block_names,
  STRING_AGG(DISTINCT b.block_code, ', ') as block_codes,
  -- Additional aggregated block information
  JSON_AGG(
    DISTINCT JSONB_BUILD_OBJECT(
      'block_id', b.block_id,
      'block_name', b.block_name,
      'block_code', b.block_code,
      'description', b.description,
      'status', bf.status,
      'assigned_at', bf.created_at
    )
  ) as blocks_info
FROM faculity f
LEFT JOIN departments d ON f.faculity_id = d.faculity_id
LEFT JOIN blocks_faculity bf ON f.faculity_id = bf.faculity_id
LEFT JOIN blocks b ON bf.block_id = b.block_id
GROUP BY f.faculity_id, f.faculity_name, f.created_at, f.updated_at
ORDER BY f.faculity_name;`;
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/faculties error:', err);
    res.status(500).json({ error: 'Failed to fetch faculties' });
  }
};

// Get single faculty by ID
const getFacultyById = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    const query = `
      SELECT 
        f.faculity_id,
        f.faculity_name,
        f.created_at,
        f.updated_at,
        json_agg(
          json_build_object(
            'department_id', d.department_id,
            'department_name', d.department_name,
            'head_name', u.full_name
          )
        ) as departments
      FROM faculity f
      LEFT JOIN departments d ON f.faculity_id = d.faculity_id
      LEFT JOIN users u ON d.head_id = u.id
      WHERE f.faculity_id = $1
      GROUP BY f.faculity_id, f.faculity_name, f.created_at, f.updated_at
    `;

    const { rows } = await pool.query(query, [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Faculty not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/faculties/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch faculty' });
  }
};

// Create new faculty
const createFaculty = async (req, res) => {
  try {
    const { faculity_name } = req.body;
    
    if (!faculity_name || !faculity_name.trim()) {
      return res.status(400).json({ error: 'Faculty name is required' });
    }

    const query = `
      INSERT INTO faculity (faculity_name) 
      VALUES ($1) 
      RETURNING faculity_id, faculity_name, created_at, updated_at
    `;

    const { rows } = await pool.query(query, [faculity_name.trim()]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/faculties error:', err);
    res.status(500).json({ error: 'Failed to create faculty' });
  }
};

// Update faculty
const updateFaculty = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { faculity_name } = req.body;
    
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }
    
    if (!faculity_name || !faculity_name.trim()) {
      return res.status(400).json({ error: 'Faculty name is required' });
    }

    const query = `
      UPDATE faculity 
      SET faculity_name = $1, updated_at = NOW() 
      WHERE faculity_id = $2 
      RETURNING faculity_id, faculity_name, created_at, updated_at
    `;

    const { rows, rowCount } = await pool.query(query, [faculity_name.trim(), id]);
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Faculty not found' });
    }
    
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/faculties/:id error:', err);
    res.status(500).json({ error: 'Failed to update faculty' });
  }
};

// Delete faculty
const deleteFaculty = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    // Check if faculty has departments
    const checkQuery = `
      SELECT COUNT(*) FROM departments 
      WHERE faculity_id = $1
    `;
    
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (parseInt(checkResult.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete faculty with associated departments. Please reassign or delete departments first.' 
      });
    }

    const deleteQuery = `
      DELETE FROM faculity 
      WHERE faculity_id = $1 
      RETURNING faculity_id
    `;

    const { rowCount } = await pool.query(deleteQuery, [id]);
    
    if (rowCount === 0) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    res.json({ success: true, message: 'Faculty deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/faculties/:id error:', err);
    res.status(500).json({ error: 'Failed to delete faculty' });
  }
};

// Get departments by faculty
const getDepartmentsByFaculty = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    const query = `
      SELECT 
        d.department_id,
        d.department_name,
        d.head_id,
        u.full_name as head_name,
        d.created_at,
        d.updated_at
      FROM departments d
      LEFT JOIN users u ON d.head_id = u.id
      WHERE d.faculity_id = $1
      ORDER BY d.department_name
    `;

    const { rows } = await pool.query(query, [id]);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/faculties/:id/departments error:', err);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
};
// Get all blocks with faculty info
const getAllBlocksWithFaculty = async (req, res) => {
  try {
    const query = `
      SELECT 
        b.block_id,
        b.block_name,
        b.block_code,
        b.description,
        b.building_name,
        b.location,
        b.status as block_status,
        b.created_at as block_created_at,
        b.updated_at as block_updated_at,
        bf.faculity_id,
        f.faculity_name,
        bf.status as assignment_status,
        bf.created_at as assigned_at,
        bf.updated_at as assignment_updated_at
      FROM blocks b
      LEFT JOIN blocks_faculity bf ON b.block_id = bf.block_id
      LEFT JOIN faculity f ON bf.faculity_id = f.faculity_id
      ORDER BY b.block_name
    `;
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/blocks/with-faculty error:', err);
    res.status(500).json({ error: 'Failed to fetch blocks with faculty info' });
  }
};

// Get blocks assigned to a specific faculty
const getBlocksByFaculty = async (req, res) => {
  try {
    const facultyId = parseInt(req.params.id);
    
    if (!Number.isInteger(facultyId) || facultyId <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    const query = `
      SELECT 
        b.block_id,
        b.block_name,
        b.block_code,
        b.description,
        b.created_at as block_created_at,
        b.updated_at as block_updated_at,
        bf.faculity_id,
        f.faculity_name,
        bf.status as assignment_status,
        bf.created_at as assigned_at,
        bf.updated_at as assignment_updated_at
      FROM blocks_faculity bf
      INNER JOIN blocks b ON bf.block_id = b.block_id
      INNER JOIN faculity f ON bf.faculity_id = f.faculity_id
      WHERE bf.faculity_id = $1
      ORDER BY b.block_name
    `;

    const { rows } = await pool.query(query, [facultyId]);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/faculties/:facultyId/blocks error:', err);
    res.status(500).json({ error: 'Failed to fetch faculty blocks' });
  }
};

// Get all available blocks (not assigned to any faculty)
const getAvailableBlocks = async (req, res) => {
  try {
    const query = `
      SELECT 
        b.*
      FROM blocks b
      WHERE NOT EXISTS (
        SELECT 1 FROM blocks_faculity bf 
        WHERE bf.block_id = b.block_id
      )
      ORDER BY b.block_name
    `;
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/blocks/available error:', err);
    res.status(500).json({ error: 'Failed to fetch available blocks' });
  }
};

// Assign multiple blocks to a faculty
const assignBlocksToFaculty = async (req, res) => {
  const client = await pool.connect();

  try {
    const facultyId = parseInt(req.params.id);
    const { block_ids, status = "active" } = req.body;

    if (!Number.isInteger(facultyId) || facultyId <= 0) {
      return res.status(400).json({ message: "Invalid faculty ID" });
    }

    if (!Array.isArray(block_ids) || block_ids.length === 0) {
      return res.status(400).json({ message: "block_ids must be a non-empty array" });
    }

    await client.query("BEGIN");

    const assigned = [];
    const rejected = [];

    for (const blockId of block_ids) {
      // 🔍 Check if block already assigned
      const exists = await client.query(
        `SELECT faculity_id FROM blocks_faculity WHERE block_id = $1`,
        [blockId]
      );

      if (exists.rowCount > 0) {
          return res.status(400).json({ message: 'Block already assigned to another faculty' });
    }
      // ✅ Safe insert
      await client.query(
        `
        INSERT INTO blocks_faculity (faculity_id, block_id, status, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        `,
        [facultyId, blockId, status]
      );

      assigned.push(blockId);
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Block assignment completed",
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error assigning blocks:", error);

    res.status(500).json({
      message: "Failed to assign blocks to faculty",
    });
  } finally {
    client.release();
  }
};

// Remove a block from faculty
const removeBlockFromFaculty = async (req, res) => {
  try {
    const facultyId = parseInt(req.params.id);
    const blockId = parseInt(req.params.blockId);

    if (!Number.isInteger(facultyId) || facultyId <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    if (!Number.isInteger(blockId) || blockId <= 0) {
      return res.status(400).json({ error: 'Invalid block ID' });
    }

    // Check if assignment exists
    const checkQuery = `
      SELECT bf.*, b.block_name, f.faculity_name
      FROM blocks_faculity bf
      INNER JOIN blocks b ON bf.block_id = b.block_id
      INNER JOIN faculity f ON bf.faculity_id = f.faculity_id
      WHERE bf.faculity_id = $1 AND bf.block_id = $2
    `;

    const checkResult = await pool.query(checkQuery, [facultyId, blockId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Block assignment not found' });
    }

    const assignment = checkResult.rows[0];

    // Remove the assignment
    const deleteQuery = `
      DELETE FROM blocks_faculity 
      WHERE faculity_id = $1 AND block_id = $2
      RETURNING *
    `;

    const deleteResult = await pool.query(deleteQuery, [facultyId, blockId]);

    res.json({
      success: true,
      message: 'Block removed from faculty successfully',
      removed_assignment: assignment
    });
  } catch (err) {
    console.error('DELETE /api/faculties/:facultyId/blocks/:blockId error:', err);
    res.status(500).json({ error: 'Failed to remove block from faculty' });
  }
};

// Update block assignment status
const updateBlockAssignmentStatus = async (req, res) => {
  try {
    const facultyId = parseInt(req.params.facultyId);
    const blockId = parseInt(req.params.blockId);
    const { status } = req.body;

    if (!Number.isInteger(facultyId) || facultyId <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    if (!Number.isInteger(blockId) || blockId <= 0) {
      return res.status(400).json({ error: 'Invalid block ID' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    // Check if assignment exists
    const checkQuery = `
      SELECT * FROM blocks_faculity 
      WHERE faculity_id = $1 AND block_id = $2
    `;

    const checkResult = await pool.query(checkQuery, [facultyId, blockId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Block assignment not found' });
    }

    // Update the assignment status
    const updateQuery = `
      UPDATE blocks_faculity 
      SET status = $1, updated_at = NOW()
      WHERE faculity_id = $2 AND block_id = $3
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, [status, facultyId, blockId]);

    res.json({
      success: true,
      message: 'Block assignment status updated successfully',
      assignment: updateResult.rows[0]
    });
  } catch (err) {
    console.error('PUT /api/faculties/:facultyId/blocks/:blockId/status error:', err);
    res.status(500).json({ error: 'Failed to update block assignment status' });
  }
};

// Get faculty statistics (departments count, blocks count)
const getFacultyStatistics = async (req, res) => {
  try {
    const facultyId = parseInt(req.params.facultyId);
    
    if (!Number.isInteger(facultyId) || facultyId <= 0) {
      return res.status(400).json({ error: 'Invalid faculty ID' });
    }

    const query = `
      SELECT 
        f.faculity_id,
        f.faculity_name,
        COALESCE(dept_count.department_count, 0) as department_count,
        COALESCE(block_count.block_count, 0) as block_count,
        COALESCE(dept_list.department_names, '') as department_names
      FROM faculity f
      LEFT JOIN (
        SELECT faculity_id, COUNT(*) as department_count
        FROM departments
        WHERE faculity_id = $1
        GROUP BY faculity_id
      ) dept_count ON f.faculity_id = dept_count.faculity_id
      LEFT JOIN (
        SELECT faculity_id, COUNT(*) as block_count
        FROM blocks_faculity
        WHERE faculity_id = $1
        GROUP BY faculity_id
      ) block_count ON f.faculity_id = block_count.faculity_id
      LEFT JOIN (
        SELECT faculity_id, 
               STRING_AGG(department_name, ', ') as department_names
        FROM departments
        WHERE faculity_id = $1
        GROUP BY faculity_id
      ) dept_list ON f.faculity_id = dept_list.faculity_id
      WHERE f.faculity_id = $1
    `;

    const { rows } = await pool.query(query, [facultyId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Faculty not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/faculties/:facultyId/statistics error:', err);
    res.status(500).json({ error: 'Failed to fetch faculty statistics' });
  }
};

// Get all faculties with statistics
const getAllFacultiesWithStatistics = async (req, res) => {
  try {
    const query = `
      SELECT 
        f.faculity_id,
        f.faculity_name,
        f.created_at,
        f.updated_at,
        COALESCE(dept_count.department_count, 0) as department_count,
        COALESCE(block_count.block_count, 0) as block_count,
        COALESCE(dept_list.department_names, '') as department_names
      FROM faculity f
      LEFT JOIN (
        SELECT faculity_id, COUNT(*) as department_count
        FROM departments
        GROUP BY faculity_id
      ) dept_count ON f.faculity_id = dept_count.faculity_id
      LEFT JOIN (
        SELECT faculity_id, COUNT(*) as block_count
        FROM blocks_faculity
        GROUP BY faculity_id
      ) block_count ON f.faculity_id = block_count.faculity_id
      LEFT JOIN (
        SELECT faculity_id, 
               STRING_AGG(department_name, ', ') as department_names
        FROM departments
        GROUP BY faculity_id
      ) dept_list ON f.faculity_id = dept_list.faculity_id
      ORDER BY f.faculity_name
    `;
    
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/faculties/with-statistics error:', err);
    res.status(500).json({ error: 'Failed to fetch faculties with statistics' });
  }
};

module.exports = {
  getAllFaculties,
  getFacultyById,
  createFaculty,
  updateFaculty,
  deleteFaculty,
  getDepartmentsByFaculty,
  getAllBlocksWithFaculty,
  getBlocksByFaculty,
  getAvailableBlocks,
  assignBlocksToFaculty,
  removeBlockFromFaculty,
  updateBlockAssignmentStatus,
  getFacultyStatistics,
  getAllFacultiesWithStatistics
};
