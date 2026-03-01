const pool = require("../db");
const bcrypt = require("bcryptjs");
// GET /api/users
const listUsers = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name AS name, u.email, u.role, u.id_number AS "idNumber", u.department_id, d.department_name, u.status
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id 
       ORDER BY u.id DESC`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("listUsers error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const instructor = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT u.id, u.full_name, d.department_name FROM users u LEFT JOIN departments d ON u.department_id = d.department_id WHERE role = 'instructor'"
    );
    res.json(rows);
  } catch (err) {
    console.error("instructor error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const instructor_head = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT u.id, u.full_name, d.department_name FROM users u LEFT JOIN departments d ON u.department_id = d.department_id WHERE role IN ('instructor', 'department_head')"
    );
    res.json(rows);
  } catch (err) {
    console.error("instructor_head error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
const generateUniqueIdNumber = async (entityType = "USER") => {
  const check = await pool.query("SELECT id_number FROM id_number_registry");
  const existingIds = check.rows.map(row => row.id_number);
  
  let counter = 1;
  let unique = false;
  
  while (!unique) {
    const idNumber = `${entityType}${counter.toString().padStart(4, "0")}`;
    
    if (!existingIds.includes(idNumber)) {
      return idNumber;
    }
    
    counter++;
    
    // Safety check to prevent infinite loop
    if (counter > 9999) {
      throw new Error("ID number space exhausted");
    }
  }
};


// POST /api/users
const createUser = async (req, res) => {
  try {
    const { name, email, role, department } = req.body;
      const idNumber = await generateUniqueIdNumber("STAF/");
      console.log(idNumber);
    if (!name || !email  || !role || !idNumber )
      return res.status(400).json({ message: "All fields are required" });
    // Check for existing user
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1  OR id_number = $2',
      [email, idNumber]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }
// Register ID number
    await pool.query(
      `INSERT INTO id_number_registry (id_number, entity_type)
       VALUES ($1, 'USER')`,
      [idNumber]
    );
    if (role !== 'admin') {
      const result = await pool.query(
        `INSERT INTO users (full_name, email, department_id, role, id_number, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [name, email, department || null, role, idNumber, "Active"]
      );

      // Get the newly created user
      const newUserId = result.rows[0].id;

      const { rows } = await pool.query(
        `SELECT u.id, u.full_name AS name, u.email, u.role, u.id_number AS "idNumber", d.department_name, u.status
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.department_id 
         WHERE u.id = $1`,
        [newUserId]
      );

      res.status(201).json(rows[0]);
    } else {
   
      const result = await pool.query(
        `INSERT INTO users (full_name, email, role, id_number, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [name, email, role, idNumber, "Active"]
      );

 
      const newUserId = result.rows[0].id;

      const { rows } = await pool.query(
        `SELECT u.id, u.full_name AS name, u.email, u.role, u.id_number AS "idNumber", d.department_name, u.status
         FROM users u
         LEFT JOIN departments d ON u.department_id = d.department_id 
         WHERE u.id = $1`,
        [newUserId]
      );

      res.status(201).json(rows[0]);
    }

  } catch (err) {
    console.error("createUser error:", err);
    // Handle PostgreSQL duplicate entry error
    if (err.code === "23505") { // PostgreSQL unique violation error code
      return res.status(409).json({ message: "Email or username already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

// PUT /api/users/:id
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, idNumber, department } = req.body;

    const updateResult = await pool.query(
      `UPDATE users
       SET full_name = $1, email = $2, role = $3, id_number = $4, department_id = $5
       WHERE id = $6
       RETURNING id, full_name AS name, email, role, id_number AS "idNumber", department_id, status`,
      [name, email, role, idNumber, department || null, id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.full_name AS name, u.email, u.role, u.id_number AS "idNumber", d.department_name, u.status
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id 
       WHERE u.id = $1`,
      [id]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("updateUser error:", err);
    // Handle PostgreSQL duplicate entry error
    if (err.code === "23505") {
      return res.status(409).json({ message: "Email or username already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};
// PATCH /api/users/:id/status
const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["Active", "Deactivated"].includes(status))
      return res.status(400).json({ message: "Status must be Active or Deactivated" });

    const result = await pool.query(
      `UPDATE users
       SET status = $1
       WHERE id = $2`,
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    // Get the updated user
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name AS name, u.email, u.role, u.id_number AS "idNumber", d.department_name, u.status
       FROM users u
       LEFT JOIN departments d ON u.department_id = d.department_id 
       WHERE u.id = $1`,
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error("updateStatus error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { listUsers, createUser, updateUser, updateStatus, instructor, instructor_head };