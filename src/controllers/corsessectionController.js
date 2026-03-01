const pool = require("../db");

const getAllSectionAssignments = async (req, res) => {
  try {
    const query = `
      SELECT 
        csi.id,
        csi.course_batch_id,
        csi.instructor_id,
        csi.section,
        csi.created_at,
        csi.updated_at,
        u.full_name ,
        u.email ,
        cb.batch,
        s.semester,
        s.academic_year,
        d.department_id,
        d.department_name,
        c.course_id,
        c.course_code,
        c.course_name,
        c.credit_hour,
        c.category,
        cia.course_status
      FROM course_section_instructor_assign csi
      LEFT JOIN users u ON csi.instructor_id = u.id
      LEFT JOIN course_batch cb ON csi.course_batch_id = cb.id
      LEFT JOIN semesters s ON cb.semester_id = s.id
      LEFT JOIN departments d ON cb.department_id = d.department_id
      LEFT JOIN Course c ON cb.course_id = c.course_id
      LEFT JOIN course_instructor_assign cia ON 
        cia.course_id = c.course_id AND 
        cia.instructor_id = u.id
      ORDER BY csi.section, c.course_code, cb.batch
    `;
    
    const result = await pool.query(query);
    
    // Format the response
    const formattedResults = result.rows.map(row => ({
      id: row.id,
      course_batch_id: row.course_batch_id,
      instructor_id: row.instructor_id,
      section: row.section,
      created_at: row.created_at,
      updated_at: row.updated_at,
      instructor: {
        instructor_id: row.instructor_id,
        full_name: row.instructor_full_name,
        first_name: row.instructor_first_name,
        last_name: row.instructor_last_name,
        email: row.instructor_email,
        course_status: row.course_status
      },
      course_batch: {
        batch: row.batch,
        semester_name: row.semester_name,
        academic_year: row.academic_year,
        department: {
          department_id: row.department_id,
          department_name: row.department_name
        },
        course: {
          course_id: row.course_id,
          course_code: row.course_code,
          course_name: row.course_name,
          credit_hour: row.credit_hour,
          category: row.category
        }
      }
    }));
    
    res.json({
      success: true,
      count: formattedResults.length,
      data: formattedResults
    });
  } catch (error) {
    console.error('Error fetching section assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
const getSectionAssignmentsByCourseBatch = async (req, res) => {
  try {
    const { courseBatchId } = req.params;
    
    if (!courseBatchId) {
      return res.status(400).json({
        success: false,
        message: 'Course batch ID is required'
      });
    }
    
    // Convert courseBatchId to integer
    const courseBatchIdInt = parseInt(courseBatchId, 10);
    
    if (isNaN(courseBatchIdInt)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid course batch ID'
      });
    }
    
    // First, verify the course batch exists
    const courseBatchCheck = await pool.query(
      'SELECT id FROM course_batch WHERE id = $1',
      [courseBatchIdInt]
    );
    
    if (courseBatchCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course batch not found'
      });
    }
    
    const query = `
      SELECT 
        csi.id,
        csi.course_batch_id,
        csi.instructor_id,
        csi.section,
        csi.created_at,
        csi.updated_at,
        u.full_name as instructor_full_name,
        u.email as instructor_email,
        cb.batch,
        s.semester as semester_name,
        d.department_name,
        c.course_id,
        c.course_code,
        c.course_name,
        cia.course_status
      FROM course_section_instructor_assign csi
      LEFT JOIN users u ON csi.instructor_id = u.id
      LEFT JOIN course_batch cb ON csi.course_batch_id = cb.id
      LEFT JOIN semesters s ON cb.semester_id  = s.id
      LEFT JOIN departments d ON cb.department_id = d.department_id
      LEFT JOIN Course c ON cb.course_id = c.course_id
      LEFT JOIN course_instructor_assign cia ON 
          cia.course_id = c.course_id
          AND cia.instructor_id = u.id
      WHERE csi.course_batch_id = $1
      ORDER BY csi.section
    `;
    
    const result = await pool.query(query, [courseBatchIdInt]);
    
    // Format the response
    const formattedResults = result.rows.map(row => ({
      id: row.id,
      course_batch_id: row.course_batch_id,
      instructor_id: row.instructor_id,
      section: row.section,
      created_at: row.created_at,
      updated_at: row.updated_at,
      instructor: {
        instructor_id: row.instructor_id,
        full_name: row.instructor_full_name,
        email: row.instructor_email,
        course_status: row.course_status
      },
      course_batch: {
        batch: row.batch,
        semester_name: row.semester_name,
        department_name: row.department_name,
        
          course_id: row.course_id,
          course_code: row.course_code,
          course_name: row.course_name
        
      }
    }));
    console.log("all" ,formattedResults)
    res.json({
      success: true,
      count: formattedResults.length,
      data: formattedResults
    });
  } catch (error) {
    console.error('Error fetching section assignments by course batch:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
const createSectionAssignment = async (req, res) => {
  try {
    const { course_batch_id, instructor_id, section } = req.body;
    
    // Validate required fields
    if (!course_batch_id || !instructor_id || !section) {
      return res.status(400).json({
        success: false,
        message: 'Please provide course_batch_id, instructor_id, and section'
      });
    }
    
    // Validate section format (A-Z)
    if (!/^[A-Z]$/.test(section)) {
      return res.status(400).json({
        success: false,
        message: 'Section must be a single capital letter (A-Z)'
      });
    }
    
    // Check if course batch exists
    const courseBatchCheck = await pool.query(
      'SELECT id, department_id FROM course_batch WHERE id = $1',
      [course_batch_id]
    );
    if (courseBatchCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course batch not found'
      });
    }
     const timslot = await pool.query(
    `SELECT * FROM time_slots
     WHERE department_id = $1`,
    [courseBatchCheck.rows[0].department_id]
    );
    if (timslot.rows.length === 0) {
        return res.status(400).json({
  success: false,
  message: `Time Slote not assigned. please set time slote`
})
    }
   const coursesRes = await pool.query(`SELECT 
            c.course_id,
            c.course_name,
            c.lec_hr,
            c.tut_hr,
            c.lab_hr,
            i.instructor_id
          FROM course_batch cb
          INNER JOIN course c ON cb.course_id = c.course_id
          INNER JOIN course_section_instructor_assign i ON cb.id=i.course_batch_id 
          WHERE i.instructor_id=$1`,
          [instructor_id]
    );
      const coursesName = await pool.query(`
      SELECT 
        c.course_name,
        i.instructor_id
      FROM course_batch cb
      INNER JOIN course c ON cb.course_id = c.course_id
      INNER JOIN course_section_instructor_assign i ON cb.id = i.course_batch_id
      WHERE i.instructor_id = $1
      GROUP BY c.course_name, i.instructor_id
    `, [instructor_id]);

    const START = timslot.rows[0].start_time, BREAK_START='6:30';
    const END = timslot.rows[0].end_time, BREAK_END='7:30';
    const labratory_duration = timslot.rows[0].labratory_duration;
    const lecture_duration = timslot.rows[0].lecture_duration;

    console.log("start", START);
    console.log("end", END);
    console.log("break start", BREAK_START);
    console.log("break end", BREAK_START);
    console.log("lab du", labratory_duration);
    console.log("lect du", lecture_duration);
    
    const validate = [];
   const allSessions = [];
    for (const course of coursesRes.rows) {
      allSessions.push(...calculateCourseSessions(course, timslot));
    }
  for (const coursename of coursesName.rows) {
  const totalLectureTutorial = allSessions.filter(s => s.type === 'LEC' && s.course_name === coursename.course_name).length;
  const totalLab = allSessions.filter( s => s.type === 'LAB' && s.course_name === coursename.course_name).length;

  const leclength = courselength(coursesRes, coursename.course_name);
  const lablength = courselength(coursesRes, coursename.course_name);
    console.log("lect", leclength);
    console.log("lab", lablength);
   console.log("total lect", totalLectureTutorial);
    console.log("total lab", totalLab);
 
    if (totalLectureTutorial) {
      const lecturePerWeek = totalLectureTutorial / leclength;
      const lecturePerDay = diffHours(START, BREAK_START) / lecture_duration;
      validate.push(
          { coursename: coursename.course_name, coursePerWeek: lecturePerWeek, coursePerDay: lecturePerDay, type:'LEC' },
        );
    }
    if (totalLab) {
       const labPerWeek = totalLab / lablength;
  const labPerDay = diffHours(BREAK_END, END) / labratory_duration;
  validate.push(
    { coursename: coursename.course_name, coursePerWeek: labPerWeek, coursePerDay: labPerDay , type:'LAB'}
  );
    }
 
}

    const totalLectureTutorial1 = (allSessions.filter(s => s.type === 'LEC').length);//*timslot.rows[0].lecture_duration;
    const totalLabl = (allSessions.filter(s => s.type === 'LAB').length);//*timslot.rows[0].labratory_duration;
    const withsectionlength = totalLectureTutorial1 / coursesRes.rowCount;

    console.log("Total Lecture + Tutorial class :", totalLectureTutorial1, 'with ', withsectionlength,'sections');
        console.log("Total Lab class:", totalLabl);
    console.log("All course", allSessions);
    console.log("All course", validate);

   

    // Check if instructor exists and is assigned to the course
    const courseBatchDetails = await pool.query(`
      SELECT cb.course_id 
      FROM course_batch cb 
      WHERE cb.id = $1
    `, [course_batch_id]);
     
    const courseId = courseBatchDetails.rows[0]?.course_id;
    
    if (!courseId) {
      return res.status(404).json({
        success: false,
        message: 'Course not found for this batch'
      });
    }
    
    // Check if instructor is assigned to the course
    const instructorCheck = await pool.query(`
      SELECT cia.*, u.full_name, u.email
      FROM course_instructor_assign cia
      JOIN users u ON cia.instructor_id = u.id
      WHERE cia.course_id = $1 AND cia.instructor_id = $2
    `, [courseId, instructor_id]);
    
    if (instructorCheck.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Instructor is not assigned to this course by admin'
      });
    }
    
    // Check if section is already assigned for this course batch
    const existingSection = await pool.query(
      `SELECT * FROM course_section_instructor_assign 
       WHERE course_batch_id = $1 AND section = $2`,
      [course_batch_id, section]
    );
    
    if (existingSection.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Section ${section} is already assigned for this course batch`
      });
    }
   // Before the validation loop, add:
console.log("=== VALIDATION DEBUG ===");
console.log("Instructor ID:", instructor_id);
console.log("Courses assigned to instructor:", coursesRes.rows);
console.log("Course names (unique):", coursesName.rows);
console.log("All sessions:", allSessions);
console.log("Validate array:", validate);

// Update the validation logic to be clearer
let found = 0;
for (const checkInst of validate) {
  // Calculate available slots per week
  const weeklySlotsAvailable = checkInst.coursePerDay * 5; // 5 days per week
  const slotsPerWeekNeeded = checkInst.coursePerWeek;
  
  // Calculate how many sections this can support
  const maxSectionsPossible = Math.floor(weeklySlotsAvailable / slotsPerWeekNeeded);
  const currentSections = courselength(coursesRes, checkInst.coursename);
  
  console.log(`=== Course: ${checkInst.coursename} (${checkInst.type}) ===`);
  console.log('Weekly slots available:', weeklySlotsAvailable);
  console.log('Slots needed per week per section:', slotsPerWeekNeeded);
  console.log('Maximum sections possible:', maxSectionsPossible);
  console.log('Current sections assigned:', currentSections);
  console.log('New section would make total:', currentSections + 1);
  
  // Check if adding another section would exceed capacity
  if (currentSections + 1 >= maxSectionsPossible) {
    console.log(`❌ Section override: ${currentSections + 1} > ${maxSectionsPossible}`);
    found += 1;
  } else {
    console.log(`✓ OK: ${currentSections + 1} <= ${maxSectionsPossible}`);
    found = 0;
  }
}

if (found > 0) {
  return res.status(400).json({
  success: false,
  message: `Instructor cannot handle more sections. Current workload requires ${found} more slot(s) than available`
});

}
    
    // Create the section assignment
    const createQuery = `
      INSERT INTO course_section_instructor_assign 
      (course_batch_id, instructor_id, section) 
      VALUES ($1, $2, $3) 
      RETURNING *
    `;
    
    const createResult = await pool.query(createQuery, [
      course_batch_id,
      instructor_id,
      section
    ]);
    
    const newAssignment = createResult.rows[0].id;
    
    // Get full details with joins
    const fullQuery = `
      SELECT 
        csi.id,
        csi.course_batch_id,
        csi.instructor_id,
        csi.section,
        csi.created_at,
        csi.updated_at,
        u.full_name as instructor_full_name,
        u.email as instructor_email,
        cb.batch,
        s.semester,
        d.department_name,
        c.course_id,
        c.course_code,
        c.course_name,
        cia.course_status
      FROM course_section_instructor_assign csi
      LEFT JOIN users u ON csi.instructor_id = u.id
      LEFT JOIN course_batch cb ON csi.course_batch_id = cb.id
      LEFT JOIN semesters s ON cb.semester_id = s.id
      LEFT JOIN departments d ON cb.department_id = d.department_id
      LEFT JOIN course c ON cb.course_id = c.course_id
      LEFT JOIN course_instructor_assign cia ON 
        c.course_id = cia.course_id AND 
        u.id = cia.instructor_id
      WHERE csi.id = $1
    `;
    
    const fullResult = await pool.query(fullQuery, [newAssignment]);
    
    res.status(201).json({
      success: true,
      message: 'Section assignment created successfully',
      data: {
        id: fullResult.rows[0].id,
        course_batch_id: fullResult.rows[0].course_batch_id,
        instructor_id: fullResult.rows[0].instructor_id,
        section: fullResult.rows[0].section,
        created_at: fullResult.rows[0].created_at,
        updated_at: fullResult.rows[0].updated_at,
        instructor: {
          instructor_id: fullResult.rows[0].instructor_id,
          full_name: fullResult.rows[0].instructor_full_name,
          email: fullResult.rows[0].instructor_email,
          course_status: fullResult.rows[0].course_status
        },
        course_batch: {
          batch: fullResult.rows[0].batch,
          semester: fullResult.rows[0].semester,
          department_name: fullResult.rows[0].department_name,
          course: {
            course_id: fullResult.rows[0].course_id,
            course_code: fullResult.rows[0].course_code,
            course_name: fullResult.rows[0].course_name
          }
        }
      }
    });
    
  } catch (error) {
    console.error('Error creating section assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
function calculateCourseSessions(course, timslot) {
  const sessions = [];
  let lecSlots, labSlots;
  for (const row of timslot.rows) {
    lecSlots = Math.ceil((course.lec_hr + course.tut_hr) / row.lecture_duration);
    labSlots = Math.ceil(course.lab_hr / row.labratory_duration);
  
    for (let i = 0; i < lecSlots; i++) {
      sessions.push({ course_id: course.course_id, type: "LEC", course_name:course.course_name});
    }
    for (let i = 0; i < labSlots; i++) {
      sessions.push({ course_id: course.course_id, type: "LAB" , course_name:course.course_name });
    }
  }

  return sessions;
}
function diffHours(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh + em / 60) - (sh + sm / 60);
}
function courselength(courses, coursename) {
  return courses.rows.filter(l => l.course_name === coursename).length;
}
const createMultipleSectionAssignments = async (req, res) => {
  try {
    const { assignments } = req.body;
    
    // Validate required fields
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of assignments'
      });
    }
    
    const results = [];
    const errors = [];
    
    for (const assignment of assignments) {
      const { course_batch_id, instructor_id, section } = assignment;
      
      try {
        // Validate required fields for each assignment
        if (!course_batch_id || !instructor_id || !section) {
          errors.push({
            section,
            error: 'Missing required fields'
          });
          continue;
        }
        
        // Validate section format (A-Z)
        if (!/^[A-Z]$/.test(section)) {
          errors.push({
            section,
            error: 'Section must be a single capital letter (A-Z)'
          });
          continue;
        }
        
        // Check if course batch exists
        const courseBatchCheck = await pool.query(
          'SELECT id FROM course_batch WHERE id = $1',
          [course_batch_id]
        );
        
        if (courseBatchCheck.rows.length === 0) {
          errors.push({
            section,
            error: 'Course batch not found'
          });
          continue;
        }
        
        // Check if instructor exists and is assigned to the course
        const courseBatchDetails = await pool.query(`
          SELECT cb.course_id 
          FROM course_batch cb 
          WHERE cb.id = $1
        `, [course_batch_id]);
        
        const courseId = courseBatchDetails.rows[0]?.course_id;
        
        if (!courseId) {
          errors.push({
            section,
            error: 'Course not found for this batch'
          });
          continue;
        }
        
        // Check if instructor is assigned to the course
        const instructorCheck = await pool.query(`
          SELECT cia.*, u.full_name, u.email
          FROM course_instructor_assign cia
          JOIN users u ON cia.instructor_id = u.id
          WHERE cia.course_id = $1 AND cia.instructor_id = $2
        `, [courseId, instructor_id]);
        
        if (instructorCheck.rows.length === 0) {
          errors.push({
            section,
            error: 'Instructor is not assigned to this course by admin'
          });
          continue;
        }
        
        // Check if section is already assigned for this course batch
        const existingSection = await pool.query(
          `SELECT * FROM course_section_instructor_assign 
           WHERE course_batch_id = $1 AND section = $2`,
          [course_batch_id, section]
        );
        
        if (existingSection.rows.length > 0) {
          errors.push({
            section,
            error: `Section ${section} is already assigned`
          });
          continue;
        }
        
        // Create the section assignment
        const createQuery = `
          INSERT INTO course_section_instructor_assign 
          (course_batch_id, instructor_id, section) 
          VALUES ($1, $2, $3) 
          RETURNING *
        `;
        
        const createResult = await pool.query(createQuery, [
          course_batch_id,
          instructor_id,
          section
        ]);
        
        const newAssignment = createResult.rows[0].id;
        
        // Get full details with joins
        const fullQuery = `
          SELECT 
            csi.id,
            csi.course_batch_id,
            csi.instructor_id,
            csi.section,
            csi.created_at,
            csi.updated_at,
            u.full_name as instructor_full_name,
            u.email as instructor_email,
            cb.batch,
            s.semester,
            d.department_name,
            c.course_id,
            c.course_code,
            c.course_name,
            cia.course_status
          FROM course_section_instructor_assign csi
          LEFT JOIN users u ON csi.instructor_id = u.id
          LEFT JOIN course_batch cb ON csi.course_batch_id = cb.id
          LEFT JOIN semesters s ON cb.semester_id = s.id
          LEFT JOIN department d ON cb.department_id = d.department_id
          LEFT JOIN course c ON cb.course_id = c.course_id
          LEFT JOIN course_instructor_assign cia ON 
            c.course_id = cia.course_id AND 
            u.id = cia.instructor_id
          WHERE csi.id = $1
        `;
        
        const fullResult = await pool.query(fullQuery, [newAssignment]);
        
        results.push({
          id: fullResult.rows[0].id,
          course_batch_id: fullResult.rows[0].course_batch_id,
          instructor_id: fullResult.rows[0].instructor_id,
          section: fullResult.rows[0].section,
          instructor: {
            instructor_id: fullResult.rows[0].instructor_id,
            full_name: fullResult.rows[0].instructor_full_name,
            email: fullResult.rows[0].instructor_email,
            course_status: fullResult.rows[0].course_status
          }
        });
        
      } catch (error) {
        errors.push({
          section,
          error: error.message
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `${results.length} section assignment(s) created successfully`,
      data: results,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error('Error creating multiple section assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
const updateSectionAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const { instructor_id, section } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Section assignment ID is required'
      });
    }

    // Validate at least one field to update
    if (!instructor_id && !section) {
      return res.status(400).json({
        success: false,
        message: 'Please provide instructor_id or section to update'
      });
    }

    // Check if section assignment exists
    const existingAssignment = await pool.query(
      'SELECT * FROM course_section_instructor_assign WHERE id = $1',
      [id]
    );

    if (existingAssignment.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Section assignment not found'
      });
    }

    const currentAssignment = existingAssignment.rows[0];
    const course_batch_id = currentAssignment.course_batch_id;

    // Build dynamic update query
    let updateFields = [];
    let updateValues = [];
    let paramCount = 1;

    if (instructor_id) {
      // Verify the new instructor is assigned to the course
      const courseBatchDetails = await pool.query(`
        SELECT cb.course_id 
        FROM course_batch cb 
        WHERE cb.id = $1
      `, [course_batch_id]);

      const courseId = courseBatchDetails.rows[0]?.course_id;

      if (courseId) {
        const instructorCheck = await pool.query(`
          SELECT * FROM course_instructor_assign 
          WHERE course_id = $1 AND instructor_id = $2
        `, [courseId, instructor_id]);

        if (instructorCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'New instructor is not assigned to this course by admin'
          });
        }

        // Check if new instructor is already assigned to another section in this course batch
        const existingInstructorAssignment = await pool.query(
          `SELECT * FROM course_section_instructor_assign 
           WHERE course_batch_id = $1 AND instructor_id = $2 AND id != $3`,
          [course_batch_id, instructor_id, id]
        );

        if (existingInstructorAssignment.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'Instructor is already assigned to another section in this course batch'
          });
        }
      }

      updateFields.push(`instructor_id = $${paramCount}`);
      updateValues.push(instructor_id);
      paramCount++;
    }

    if (section) {
      // Validate section format
      if (!/^[A-Z]$/.test(section)) {
        return res.status(400).json({
          success: false,
          message: 'Section must be a single capital letter (A-Z)'
        });
      }

      // Check if new section is already assigned for this course batch
      const existingSection = await pool.query(
        `SELECT * FROM course_section_instructor_assign 
         WHERE course_batch_id = $1 AND section = $2 AND id != $3`,
        [course_batch_id, section, id]
      );

      if (existingSection.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Section ${section} is already assigned for this course batch`
        });
      }

      updateFields.push(`section = $${paramCount}`);
      updateValues.push(section);
      paramCount++;
    }

    // Add updated_at timestamp
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add the ID parameter
    updateValues.push(id);

    const updateQuery = `
      UPDATE course_section_instructor_assign 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, updateValues);

    const updatedAssignment = updateResult.rows[0];

    // Get full details with joins
    const fullQuery = `
      SELECT 
        csi.id,
        csi.course_batch_id,
        csi.instructor_id,
        csi.section,
        csi.created_at,
        csi.updated_at,
        u.full_name as instructor_full_name,
        u.email as instructor_email,
        cb.batch,
        s.semester as semester_name,
        d.department_name,
        c.course_id,
        c.course_code,
        c.course_name,
        cia.course_status
      FROM course_section_instructor_assign csi
      LEFT JOIN users u ON csi.instructor_id = u.id
      LEFT JOIN course_batch cb ON csi.course_batch_id = cb.id
      LEFT JOIN semesters s ON cb.semester_id = s.id
      LEFT JOIN departments d ON cb.department_id = d.department_id
      LEFT JOIN course c ON cb.course_id = c.course_id
      LEFT JOIN course_instructor_assign cia ON 
        cia.course_id = c.course_id AND 
        cia.instructor_id = u.id
      WHERE csi.id = $1
    `;

    const fullResult = await pool.query(fullQuery, [updatedAssignment.id]);

    res.json({
      success: true,
      message: 'Section assignment updated successfully',
      data: {
        id: fullResult.rows[0].id,
        course_batch_id: fullResult.rows[0].course_batch_id,
        instructor_id: fullResult.rows[0].instructor_id,
        section: fullResult.rows[0].section,
        created_at: fullResult.rows[0].created_at,
        updated_at: fullResult.rows[0].updated_at,
        instructor: {
          instructor_id: fullResult.rows[0].instructor_id,
          full_name: fullResult.rows[0].instructor_full_name,
          email: fullResult.rows[0].instructor_email,
          course_status: fullResult.rows[0].course_status
        },
        course_batch: {
          batch: fullResult.rows[0].batch,
          semester_name: fullResult.rows[0].semester_name,
          department_name: fullResult.rows[0].department_name,
          course: {
            course_id: fullResult.rows[0].course_id,
            course_code: fullResult.rows[0].course_code,
            course_name: fullResult.rows[0].course_name
          }
        }
      }
    });

  } catch (error) {
    console.error('Error updating section assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
const deleteSectionAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Section assignment ID is required'
      });
    }
    
    // Check if section assignment exists
    const existingAssignment = await pool.query(
      'SELECT * FROM course_section_instructor_assign WHERE id = $1',
      [id]
    );
    
    if (existingAssignment.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Section assignment not found'
      });
    }
    
    // Delete the section assignment
    await pool.query('DELETE FROM course_section_instructor_assign WHERE id = $1', [id]);
    
    res.json({
      success: true,
      message: 'Section assignment deleted successfully',
      data: { id: parseInt(id) }
    });
    
  } catch (error) {
    console.error('Error deleting section assignment:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
const getAvailableSections = async (req, res) => {
  try {
    const { courseBatchId } = req.params;
    
    if (!courseBatchId) {
      return res.status(400).json({
        success: false,
        message: 'Course batch ID is required'
      });
    }
    
    // Define all possible sections (A-H)
    const allSections = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    
    // Get assigned sections for this course batch
    const assignedSectionsResult = await pool.query(
      'SELECT section FROM course_section_instructor_assign WHERE course_batch_id = $1',
      [courseBatchId]
    );
    
    const assignedSections = assignedSectionsResult.rows.map(row => row.section);
    
    // Calculate available sections
    const availableSections = allSections.filter(
      section => !assignedSections.includes(section)
    );
    
    res.json({
      success: true,
      data: {
        all_sections: allSections,
        assigned_sections: assignedSections,
        available_sections: availableSections
      }
    });
    
  } catch (error) {
    console.error('Error fetching available sections:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};
const getAvailableInstructors = async (req, res) => {
  try {
    const { courseBatchId } = req.params;
    
    if (!courseBatchId) {
      return res.status(400).json({
        success: false,
        message: 'Course batch ID is required'
      });
    }
    
    // Get course ID from course batch
    const courseBatchResult = await pool.query(
      'SELECT course_id FROM course_batch WHERE id = $1',
      [courseBatchId]
    );
    
    if (courseBatchResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course batch not found'
      });
    }
    
    const courseId = courseBatchResult.rows[0].course_id;
    
    // Get all admin-assigned instructors for this course
    const allInstructorsQuery = `
      SELECT 
        cia.instructor_id,
        cia.course_status,
        u.first_name,
        u.last_name,
        CONCAT(u.first_name, ' ', u.last_name) as full_name,
        u.email,
        d.department_name
      FROM course_instructor_assign cia
      JOIN users u ON cia.instructor_id = u.id
      LEFT JOIN department d ON u.department_id = d.department_id
      WHERE cia.course_id = $1
      ORDER BY u.first_name, u.last_name
    `;
    
    const allInstructorsResult = await pool.query(allInstructorsQuery, [courseId]);
    
    // Get instructors already assigned to sections in this course batch
    const assignedInstructorsQuery = `
      SELECT instructor_id 
      FROM course_section_instructor_assign 
      WHERE course_batch_id = $1
    `;
    
    const assignedInstructorsResult = await pool.query(assignedInstructorsQuery, [courseBatchId]);
    
    const assignedInstructorIds = assignedInstructorsResult.rows.map(row => row.instructor_id);
    
    // Separate available and assigned instructors
    const allInstructors = allInstructorsResult.rows.map(instructor => ({
      instructor_id: instructor.instructor_id,
      full_name: instructor.full_name,
      first_name: instructor.first_name,
      last_name: instructor.last_name,
      email: instructor.email,
      department_name: instructor.department_name,
      course_status: instructor.course_status,
      is_assigned: assignedInstructorIds.includes(instructor.instructor_id)
    }));
    
    const availableInstructors = allInstructors.filter(instructor => !instructor.is_assigned);
    const assignedInstructors = allInstructors.filter(instructor => instructor.is_assigned);
    
    res.json({
      success: true,
      data: {
        all_instructors: allInstructors,
        available_instructors: availableInstructors,
        assigned_instructors: assignedInstructors,
        total_count: allInstructors.length,
        available_count: availableInstructors.length,
        assigned_count: assignedInstructors.length
      }
    });
    
  } catch (error) {
    console.error('Error fetching available instructors:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  getAllSectionAssignments,
  getSectionAssignmentsByCourseBatch,
  createSectionAssignment,
  updateSectionAssignment,
  deleteSectionAssignment,
  getAvailableSections,
  getAvailableInstructors,
  createMultipleSectionAssignments
};