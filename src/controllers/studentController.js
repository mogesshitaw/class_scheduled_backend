const pool = require("../db");
const fs = require('fs').promises;
const path = require('path');
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Parser } = require('json2csv');

// Get all students with pagination and filtering
const getAllStudents = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      department,
      batch,
      semester,
      status
    } = req.query;

    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        s.*,
        d.department_name,
        b.batch_year,
        sem.semester as semester_name
      FROM students s
      LEFT JOIN departments d ON s.department_id = d.department_id
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      LEFT JOIN semesters sem ON s.semester_id = sem.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 1;

    // Search filter
    if (search) {
      query += ` AND (
        s.full_name ILIKE $${paramCount} OR 
        s.email ILIKE $${paramCount} OR 
        s.student_number ILIKE $${paramCount}
      )`;
      queryParams.push(`%${search}%`);
      paramCount++;
    }

    // Department filter
    if (department) {
      query += ` AND s.department_id = $${paramCount}`;
      queryParams.push(department);
      paramCount++;
    }

    // Batch filter
    if (batch) {
      query += ` AND s.batch_id = $${paramCount}`;
      queryParams.push(batch);
      paramCount++;
    }

    // Semester filter
    if (semester) {
      query += ` AND s.semester_id = $${paramCount}`;
      queryParams.push(semester);
      paramCount++;
    }

    // Status filter
    if (status) {
      query += ` AND s.status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    // Count total records
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    // Add pagination and ordering
    query += ` ORDER BY s.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    queryParams.push(limit, offset);

    // Execute main query
    const result = await pool.query(query, queryParams);

    res.json({
      success: true,
      data: result.rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error("Error fetching students:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch students" 
    });
  }
};

// Export students to CSV
const exportStudents = async (req, res) => {
  try {
    const {
      department,
      batch,
      semester,
      status
    } = req.query;

    let query = `
      SELECT 
        s.student_number,
        s.full_name,
        s.email,
        s.phone,
        s.date_of_birth,
        s.gender,
        s.address,
        d.department_name,
        b.batch_year,
        sem.semester as semester_name,
        s.section,
        s.status,
        s.enrollment_date,
        s.created_at
      FROM students s
      LEFT JOIN departments d ON s.department_id = d.department_id
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      LEFT JOIN semesters sem ON s.semester_id = sem.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramCount = 1;

    // Department filter
    if (department) {
      query += ` AND s.department_id = $${paramCount}`;
      queryParams.push(department);
      paramCount++;
    }

    // Batch filter
    if (batch) {
      query += ` AND s.batch_id = $${paramCount}`;
      queryParams.push(batch);
      paramCount++;
    }

    // Semester filter
    if (semester) {
      query += ` AND s.semester_id = $${paramCount}`;
      queryParams.push(semester);
      paramCount++;
    }

    // Status filter
    if (status) {
      query += ` AND s.status = $${paramCount}`;
      queryParams.push(status);
      paramCount++;
    }

    // Add ordering
    query += ` ORDER BY s.created_at DESC`;

    // Execute query
    const result = await pool.query(query, queryParams);

    // Convert to CSV
    const fields = [
      'Student Number',
      'Full Name',
      'Email',
      'Phone',
      'Date of Birth',
      'Gender',
      'Address',
      'Department',
      'Batch',
      'Semester',
      'Section',
      'Status',
      'Enrollment Date',
      'Created At'
    ];

    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(result.rows);

    // Set headers for file download
    res.header('Content-Type', 'text/csv');
    res.attachment(`students_${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (err) {
    console.error("Error exporting students:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to export students" 
    });
  }
};

// Update student status
const updateStudentStatus = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    // Validate status
    const validStatuses = ['Active', 'Inactive', 'Graduated', 'Suspended'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid status. Must be one of: Active, Inactive, Graduated, Suspended" 
      });
    }

    await client.query('BEGIN');

    // Check if student exists
    const existingStudent = await client.query(
      "SELECT * FROM students WHERE student_id = $1",
      [id]
    );

    if (existingStudent.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Student not found" 
      });
    }

    // // Create status history record if reason is provided
    // if (reason && reason.trim()) {
    //   await client.query(
    //     `INSERT INTO student_status_history 
    //      (student_id, previous_status, new_status, changed_by, reason) 
    //      VALUES ($1, $2, $3, $4, $5)`,
    //     [
    //       id,
    //       existingStudent.rows[0].status,
    //       status,
    //       req.user?.id || 'system', // Assuming you have user authentication
    //       reason.trim()
    //     ]
    //   );
    // }

    // Update student status
    const result = await client.query(
      `UPDATE students 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE student_id = $2 
       RETURNING *,
         (SELECT department_name FROM departments WHERE department_id = students.department_id) as department_name,
         (SELECT batch_year FROM batches WHERE batch_id = students.batch_id) as batch_year,
         (SELECT semester FROM semesters WHERE id = students.semester_id) as semester_name`,
      [status, id]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: `Student status updated to ${status}`,
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating student status:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to update student status" 
    });
  } finally {
    client.release();
  }
};
// Get student by ID
const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        s.*,
        d.department_name,
        b.batch_year,
        sem.semester as semester_name
      FROM students s
      LEFT JOIN departments d ON s.department_id = d.department_id
      LEFT JOIN batches b ON s.batch_id = b.batch_id
      LEFT JOIN semesters sem ON s.semester_id = sem.id
      WHERE s.student_id = $1
    `;

    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: "Student not found" 
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Error fetching student:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch student" 
    });
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


// Create new student
const createStudent = async (req, res) => {
  console.log('Creating student with data:', req.body);
  
  const client = await pool.connect();
  
  try {
     // Check if req.body exists
    if (!req.body) {
      return res.status(400).json({ 
        success: false,
        error: "Request body is missing" 
      });
    }

    const {
      full_name,
      email,
      phone,
      date_of_birth,
      gender,
      address,
      department_id,
      batch_id,
      semester_id,
      section,
      status = 'Active'
    } = req.body;

    // Validation
    if (!full_name || !email || !department_id || !batch_id || !semester_id) {
      return res.status(400).json({ 
        success: false, 
        error: "Required fields: full_name, email, department_id, batch_id, semester_id" 
      });
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid email format" 
      });
    }

    await client.query('BEGIN');

    // Generate student number
    const year = new Date().getFullYear();
    const departmentResult = await client.query(
      "SELECT department_name FROM departments WHERE department_id = $1",
      [department_id]
    );
    
    const departmentCode = departmentResult.rows[0]?.department_code || 'STU';
    const studentCount = await client.query(
      "SELECT COUNT(*) FROM students WHERE EXTRACT(YEAR FROM created_at) = $1",
      [year]
    );
    
    const student_number = await generateUniqueIdNumber("WDU/");
   console.log(student_number);

    // Check if email already exists
    const existingEmail = await client.query(
      "SELECT * FROM students WHERE email = $1",
      [email]
    );

    if (existingEmail.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Email already registered" 
      });
    }

    // Verify department exists
    const departmentExists = await client.query(
      "SELECT * FROM departments WHERE department_id = $1",
      [department_id]
    );

    if (departmentExists.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Selected department does not exist" 
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

    // Verify semester exists
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

    // Create student - profile_image_url will be null initially
    const result = await client.query(
      `INSERT INTO students (
        student_number, full_name, email, phone, date_of_birth, 
        gender, address, department_id, batch_id, semester_id, 
        section, profile_image_url, enrollment_date, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_DATE, $13)
      RETURNING *,
        (SELECT department_name FROM departments WHERE department_id = $8) as department_name,
        (SELECT batch_year FROM batches WHERE batch_id = $9) as batch_year,
        (SELECT semester FROM semesters WHERE id = $10) as semester_name`,
      [
        student_number,
        full_name,
        email,
        phone || null,
        date_of_birth || null,
        gender || 'Other',
        address || null,
        department_id,
        batch_id,
        semester_id,
        section || null,
        null, // profile_image_url will be uploaded separately
        status
      ]
    );
   await client.query(
      `INSERT INTO id_number_registry (id_number, entity_type)
       VALUES ($1, 'USER')`,
      [student_number]
    );
    await client.query('COMMIT');
    
    console.log('Student created successfully:', result.rows[0].student_id);
    
    res.status(201).json({
      success: true,
      message: "Student created successfully",
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error creating student:", err);
    
    // Handle unique constraint violation
    if (err.code === '23505') {
      if (err.constraint === 'students_email_key') {
        return res.status(400).json({ 
          success: false, 
          error: "Email already registered" 
        });
      }
      if (err.constraint === 'students_student_number_key') {
        return res.status(400).json({ 
          success: false, 
          error: "Student number already exists" 
        });
      }
    }
    
    // Handle foreign key violations
    if (err.code === '23503') {
      if (err.constraint === 'students_department_id_fkey') {
        return res.status(400).json({ 
          success: false, 
          error: "Selected department does not exist" 
        });
      }
      if (err.constraint === 'students_batch_id_fkey') {
        return res.status(400).json({ 
          success: false, 
          error: "Selected batch does not exist" 
        });
      }
      if (err.constraint === 'students_semester_id_fkey') {
        return res.status(400).json({ 
          success: false, 
          error: "Selected semester does not exist" 
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to create student",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    client.release();
  }
};
// Update student
const updateStudent = async (req, res) => {
  console.log('Updating student with data:', req.body);
  
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const {
      full_name,
      email,
      phone,
      date_of_birth,
      gender,
      address,
      department_id,
      batch_id,
      semester_id,
      section,
      status
    } = req.body;

    await client.query('BEGIN');

    // Check if student exists
    const existingStudent = await client.query(
      "SELECT * FROM students WHERE student_id = $1",
      [id]
    );

    if (existingStudent.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: "Student not found"
      });
    }

    // Check for duplicate email
    if (email && email !== existingStudent.rows[0].email) {
      const duplicateEmail = await client.query(
        "SELECT * FROM students WHERE email = $1 AND student_id != $2",
        [email, id]
      );

      if (duplicateEmail.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: "Email already registered to another student"
        });
      }
    }

    // Verify department exists if changing
    if (department_id && department_id !== existingStudent.rows[0].department_id) {
      const departmentExists = await client.query(
        "SELECT * FROM departments WHERE department_id = $1",
        [department_id]
      );

      if (departmentExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: "Selected department does not exist"
        });
      }
    }

    // Verify batch exists if changing
    if (batch_id && batch_id !== existingStudent.rows[0].batch_id) {
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

    // Verify semester exists if changing
    if (semester_id && semester_id !== existingStudent.rows[0].semester_id) {
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

    // Update student
    const result = await client.query(
      `UPDATE students SET
        full_name = COALESCE($1, full_name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        date_of_birth = COALESCE($4, date_of_birth),
        gender = COALESCE($5, gender),
        address = COALESCE($6, address),
        department_id = COALESCE($7, department_id),
        batch_id = COALESCE($8, batch_id),
        semester_id = COALESCE($9, semester_id),
        section = COALESCE($10, section),
        status = COALESCE($11, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE student_id = $12
      RETURNING *,
        (SELECT department_name FROM departments WHERE department_id = COALESCE($7, department_id)) as department_name,
        (SELECT batch_year FROM batches WHERE batch_id = COALESCE($8, batch_id)) as batch_year,
        (SELECT semester FROM semesters WHERE id = COALESCE($9, id)) as semester_name`,
      [
        full_name,
        email,
        phone,
        date_of_birth,
        gender,
        address,
        department_id,
        batch_id,
        semester_id,
        section,
        status,
        id
      ]
    );

    await client.query('COMMIT');
    
    console.log('Student updated successfully:', result.rows[0].student_id);
    
    res.json({
      success: true,
      message: "Student updated successfully",
      data: result.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating student:", err);
    
    // Handle unique constraint violation
    if (err.code === '23505') {
      if (err.constraint === 'students_email_key') {
        return res.status(400).json({
          success: false,
          error: "Email already registered"
        });
      }
    }
    
    // Handle foreign key violations
    if (err.code === '23503') {
      if (err.constraint === 'students_department_id_fkey') {
        return res.status(400).json({
          success: false,
          error: "Selected department does not exist"
        });
      }
      if (err.constraint === 'students_batch_id_fkey') {
        return res.status(400).json({
          success: false,
          error: "Selected batch does not exist"
        });
      }
    
      res.status(500).json({
        success: false,
        error: "Failed to update student",
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  }
    
    finally {
      client.release();
    }
};
const updateStudentFirst = async (req, res) => {
   console.log('Updating student with data:', req.body);
  
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const {
      newPassword,
      department_id,
      batch_id,
      semester_id,
      section,
    } = req.body;

    await client.query('BEGIN');

    // Check if student exists
    const existingStudent = await client.query(
      "SELECT * FROM students WHERE student_id = $1",
      [id]
    );

    if (existingStudent.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Student not found" 
      });
    }

    // Verify department exists if changing
    if (department_id && department_id !== existingStudent.rows[0].department_id) {
      const departmentExists = await client.query(
        "SELECT * FROM departments WHERE department_id = $1",
        [department_id]
      );

      if (departmentExists.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: "Selected department does not exist" 
        });
      }
    }

    // Verify batch exists if changing
    if (batch_id && batch_id !== existingStudent.rows[0].batch_id) {
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

    // Verify semester exists if changing
    if (semester_id && semester_id !== existingStudent.rows[0].semester_id) {
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
     // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update student
    const result = await client.query(
      `UPDATE students SET
        department_id =$1, 
        batch_id =$2, 
        semester_id = $3,
        section = $4, 
        password_hash=$5,
        is_first_login = FALSE,
        updated_at = CURRENT_TIMESTAMP,
        status='Active'
      WHERE student_id = $6
      RETURNING *,
        (SELECT department_name FROM departments WHERE department_id = $1) as department_name,
        (SELECT batch_year FROM batches WHERE batch_id = $2) as batch_year,
        (SELECT semester FROM semesters WHERE id =$3) as semester `,
      [
       
        department_id,
        batch_id,
        semester_id,
        section,
        hashedPassword,
        id
      ]
    );

    await client.query('COMMIT');
    
    console.log('Your info updated successfully:', result.rows[0].student_id);
    
    res.json({
      success: true,
      message: " updated your info: ",
      data: result.rows[0]
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating student:", err);
    
    // Handle unique constraint violation
    if (err.code === '23505') {
      if (err.constraint === 'students_email_key') {
        return res.status(400).json({ 
          success: false, 
          error: "Email already registered" 
        });
      }
    }
    
    // Handle foreign key violations
    if (err.code === '23503') {
      if (err.constraint === 'students_department_id_fkey') {
        return res.status(400).json({ 
          success: false, 
          error: "Selected department does not exist" 
        });
      }
      if (err.constraint === 'students_batch_id_fkey') {
        return res.status(400).json({ 
          success: false, 
          error: "Selected batch does not exist" 
        });
      }
      if (err.constraint === 'students_semester_id_fkey') {
        return res.status(400).json({ 
          success: false, 
          error: "Selected semester does not exist" 
        });
      }
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to register student",
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  } finally {
    client.release();
  }
};
// Delete student
const deleteStudent = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if student exists
    const student = await client.query(
      "SELECT * FROM students WHERE student_id = $1",
      [id]
    );

    if (student.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Student not found" 
      });
    }

    // Check if student has any related records (attendance, grades, etc.)
    const hasAttendance = await client.query(
      "SELECT COUNT(*) FROM student_attendance WHERE student_id = $1",
      [id]
    );

    if (parseInt(hasAttendance.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Cannot delete student with attendance records. Update status to 'Inactive' instead." 
      });
    }

    // Delete profile image if exists
    const profileImage = student.rows[0].profile_image_url;
    if (profileImage) {
      const imagePath = path.join(__dirname, '..', profileImage);
      // Use fs.unlink with callback for async operation
      fs.unlink(imagePath, (err) => {
        if (err) console.error('Error deleting profile image:', err);
      });
    }

    // Delete student
    await client.query(
      "DELETE FROM students WHERE student_id = $1",
      [id]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: "Student deleted successfully"
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error deleting student:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete student" 
    });
  } finally {
    client.release();
  }
};

// Get student statistics
const getStudentStatistics = async (req, res) => {
  try {
    const queries = await Promise.all([
      pool.query("SELECT COUNT(*) FROM students WHERE status = 'Active'"),
      pool.query("SELECT COUNT(*) FROM students WHERE status = 'Inactive'"),
      pool.query("SELECT COUNT(*) FROM students WHERE status = 'Graduated'"),
      pool.query("SELECT COUNT(*) FROM students WHERE status = 'Suspended'"),
      pool.query("SELECT COUNT(*) FROM students WHERE gender = 'Male'"),
      pool.query("SELECT COUNT(*) FROM students WHERE gender = 'Female'"),
      pool.query("SELECT COUNT(*) FROM students WHERE gender = 'Other'"),
      pool.query(`
        SELECT d.department_name, COUNT(s.student_id) as student_count
        FROM students s
        JOIN departments d ON s.department_id = d.department_id
        WHERE s.status = 'Active'
        GROUP BY d.department_id, d.department_name
        ORDER BY student_count DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT b.batch_year, COUNT(s.student_id) as student_count
        FROM students s
        JOIN batches b ON s.batch_id = b.batch_id
        WHERE s.status = 'Active'
        GROUP BY b.batch_id, b.batch_year
        ORDER BY b.batch_year DESC
      `)
    ]);

    res.json({
      success: true,
      data: {
        totalActive: parseInt(queries[0].rows[0].count),
        totalInactive: parseInt(queries[1].rows[0].count),
        totalGraduated: parseInt(queries[2].rows[0].count),
        totalSuspended: parseInt(queries[3].rows[0].count),
        maleCount: parseInt(queries[4].rows[0].count),
        femaleCount: parseInt(queries[5].rows[0].count),
        otherCount: parseInt(queries[6].rows[0].count),
        topDepartments: queries[7].rows,
        batchDistribution: queries[8].rows
      }
    });
  } catch (err) {
    console.error("Error fetching student statistics:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch student statistics"
    });
  }
};

// Get student status history (optional)
const getStudentStatusHistory = async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        ssh.*,
        u.full_name as changed_by_name
      FROM student_status_history ssh
      LEFT JOIN users u ON ssh.changed_by = u.id
      WHERE ssh.student_id = $1
      ORDER BY ssh.changed_at DESC
    `;

    const result = await pool.query(query, [id]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error("Error fetching student status history:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch student status history"
    });
  }
};
// Add this to your backend student routes
const updateStatusByBatch =async (req, res) => {
  const { batch_id, status, reason } = req.body;
  const {department_id} = req.params;
  console.log('request body', req.body);
  console.log('department id', department_id);
  try {
    if (!batch_id) {
      return res.status(400).json({ message: "Batch is required" });
    }
    
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    // Get all students in the specified batch
    const batchStudents = await pool.query(
      `SELECT student_id FROM students WHERE batch_id = $1 AND (status='Active' OR status='Suspended') AND department_id=$2`,
      [batch_id, department_id]
    );
    
    if (batchStudents.rows.length === 0) {
      return res.status(404).json({ message: `No students found in batch ${batch_id}` });
    }
    
    const studentIds = batchStudents.rows.map(row => row.student_id);
    const updatedStudents = [];
    
    // Update all students in the batch
    for (const studentId of batchStudents.rows) {
      // Update student status
      const result = await pool.query(
        'UPDATE students SET status = $1, reason=$2 WHERE student_id = $3 RETURNING *',
        [status,reason, studentId.student_id]
      );
      
      if (result.rows.length > 0) {
        const student = result.rows[0];        
        updatedStudents.push(student);
      }
    }
    
    res.json({ 
      message: `Successfully updated ${batchStudents.rows.length} students in batch ${batch_id}`, 
      updatedStudents,
      batch_id,
      newStatus: status
    });
    
  } catch (error) {
    console.error("Error updating batch student status:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}
module.exports = {
  getAllStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentStatistics,
  updateStudentFirst,
  updateStudentStatus,
  exportStudents,
  getStudentStatusHistory,
  updateStatusByBatch
};