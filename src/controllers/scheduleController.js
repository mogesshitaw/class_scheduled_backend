const pool = require("../db");

// Helper function to format time
const formatTime = (timeString) => {
  if (!timeString) return '';
  
  try {
    const timeParts = timeString.split(':');
    const hours = parseInt(timeParts[0]);
    const minutes = timeParts[1];
    
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes} ${period}`;
  } catch (error) {
    console.error('Error formatting time:', timeString, error);
    return timeString;
  }
};
// Helper function to calculate classes per day
const getClassesPerDay = (schedules) => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const classesPerDay = {};
  
  days.forEach(day => {
    classesPerDay[day] = schedules.filter(s => s.day === day).length;
  });
  
  return classesPerDay;
};
// get today schedule 
const getTodaySchedule = async (req, res) => {
  const { day } = req.query;
  
  try {
    const today = day || new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    
    const query = `
      SELECT 
        dc.id,
        ds.day_of_week,
        c.course_name,
        c.course_code,
        dc.start_time,
        dc.end_time,
        b.block_name,
        b.block_code,
        f.floor_number,
        r.room_number,
        r.room_type,
        u.full_name AS instructor_name,
        d.department_name,
        s.batch_id,
        s.semester_id,
        ba.batch_year as batch,
        sem.semester,
        s.section
      FROM day_courses dc
      JOIN day_schedules ds ON dc.day_schedule_id = ds.id
      JOIN schedules s ON ds.schedule_id = s.id
      JOIN course c ON dc.course_id = c.course_id
      JOIN users u ON dc.instructor_id = u.id
      JOIN rooms r ON dc.room_id = r.room_id
      JOIN floors f ON r.floor_id = f.floor_id
      JOIN blocks b ON f.block_id = b.block_id
      JOIN departments d ON s.department_id = d.department_id
      JOIN semesters sem ON s.semester_id = sem.id
      JOIN batches ba ON s.batch_id= ba.batch_id
      WHERE LOWER(ds.day_of_week) = LOWER($1)
        AND s.status = 'published'
      ORDER BY dc.start_time
    `;

    const result = await pool.query(query, [today]);

    const formattedSchedules = result.rows.map(row => ({
      id: row.id,
      course_name: row.course_name,
      course_code: row.course_code,
      start_time: row.start_time,
      end_time: row.end_time,
      location: `${row.block_code} - ${row.room_number}`,
      block_name: row.block_name,
      block_code: row.block_code,
      floor_number: row.floor_number,
      room_number: row.room_number,
      room_type: row.room_type,
      day_of_week: row.day_of_week,
      instructor_name: row.instructor_name,
      department_name: row.department_name,
      batch: row.batch,
      semester: row.semester,
      section: row.section
    }));

    res.json(formattedSchedules);
  } catch (err) {
    console.error("Error fetching today's schedule:", err);
    res.status(500).json({ error: "Failed to fetch today's schedule" });
  }
};
// create new schedule
const create = async (req, res) => {
  const { batch, semester, department_id, section, status, schedule } = req.body;
   if (!batch || !semester || !section || !department_id || !status || !schedule) {
        res.status(500).json({ error: "Failed to create . please fill required" });
  } 
  const client = await pool.connect();
  let found = false;
  
  try {
    // Enhanced duplicate checking with room details
    for (const day of schedule) {
      for (const course1 of day.courses) {
        let countRepeat = 0;
        for (const course2 of day.courses) {
           if (course1.startTime == course2.startTime && course1.endTime == course2.endTime) {
             countRepeat += 1;
          }
        }
        if (countRepeat > 1) {
          client.release();
          return res.status(400).json({
            message: `Schedule are repeated on ${day.day_of_week} between ${course1.startTime}-${course1.endTime}.`,
          });
        } 
      }
    }

      for (const day of schedule) {
        const dayResult = await client.query(
          "SELECT * FROM day_schedules WHERE day_of_week = $1",
          [day.day_of_week]
        );
        if (dayResult.rows.length > 0) {

          for (const course of day.courses) {
            // Check for break time conflict
            if (course.startTime > "06:00:00" && course.startTime < "07:00:00") {
              client.release();
              return res.status(400).json({
                message: `Cannot schedule between 06:00:00 and 07:00:00 (break time).`,
              });
            }

            // Enhanced conflict check with room details (without floors)
            const result = await client.query(
              `SELECT s.*, dc.*, c.course_name, u.full_name, 
                b.block_name, b.block_code, r.room_number, dw.day_of_week
               FROM day_courses dc
               JOIN course c ON dc.course_id = c.course_id
               JOIN day_schedules dw ON dc.day_schedule_id = dw.id
               JOIN schedules s ON dw.schedule_id=s.id
               JOIN users u ON dc.instructor_id = u.id
               JOIN rooms r ON dc.room_id = r.room_id
               JOIN floors f ON r.floor_id=f.floor_id
               JOIN blocks b ON f.block_id = b.block_id
               WHERE dc.room_id=$1
                  AND dc.start_time = $2 
                  AND dc.end_time = $3
                  AND dw.day_of_week = $4 
                  AND s.status='published'`,
              [
                course.room_id,
                course.startTime,
                course.endTime,
                day.day_of_week,
              ]
            );

            if (result.rows.length > 0 && result.rows[0].instructor_id == course.instructor_id) {
              client.release();
              return res.status(400).json({
                message: `Instructor ${result.rows[0].full_name} is already scheduled in ${result.rows[0].block_code} - Room ${result.rows[0].room_number} on ${day.day_of_week} between ${course.startTime}-${course.endTime}.`,
              });
            } else if (result.rows.length > 0) {
              client.release();
              return res.status(400).json({
                message: `Room ${result.rows[0].block_code} - ${result.rows[0].room_number} is already scheduled on ${day.day_of_week} between ${course.startTime}-${course.endTime}.`,
              });
            }
          }
        }
      }
    

    // Create the new schedule
    await client.query('BEGIN');

    // Update existing schedules to draft
    await client.query(
      "UPDATE schedules SET status='draft' WHERE batch_id=$1 and semester_id=$2 and section=$3 and status='published' and department_id=$4",
      [batch, semester, section, department_id]
    ); 

    // Insert into schedules
    const schedResult = await client.query(
      "INSERT INTO schedules (batch_id, semester_id, section, status, department_id) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [batch, semester, section, status, department_id]
    );

    const scheduleId = schedResult.rows[0].id;

    // Insert day_schedules and day_courses
    for (const day of schedule) {
      const dayResult = await client.query(
        "INSERT INTO day_schedules (schedule_id, day_of_week) VALUES ($1, $2) RETURNING id",
        [scheduleId, day.day_of_week]
      );

      const dayId = dayResult.rows[0].id;

      for (const course of day.courses) {
        await client.query(
          `INSERT INTO day_courses 
           (day_schedule_id, course_id, room_id, instructor_id, start_time, end_time, color)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            dayId,
            course.course_id,
            course.room_id,
            course.instructor_id,
            course.startTime,
            course.endTime,
            course.color,
          ]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: "Schedule created successfully." });
  } catch (err) {
    console.error("Schedule creation failed:", err);
    await client.query('ROLLBACK');
    res.status(500).json({ error: "Failed to save schedule." });
  } finally {
    client.release();
  }
};
// get all schedule
const getAll = async (req, res) => {
  try {
    const schedulesResult = await pool.query(`SELECT 
      s.*, b.batch_year as batch, sem.semester
       FROM schedules s
      JOIN semesters sem ON s.semester_id = sem.id
      JOIN batches b ON s.batch_id= b.batch_id
      ORDER BY created_at DESC`);
    const schedules = schedulesResult.rows;
    
    if (!schedules || schedules.length === 0) {
      return res.json([]);
    }

    const scheduleIds = schedules.map(s => s.id);

    const daysResult = await pool.query(
      "SELECT * FROM day_schedules WHERE schedule_id = ANY($1) ORDER BY id",
      [scheduleIds]
    );
    const days = daysResult.rows;

    const dayIds = days.map(d => d.id);

    let dayCourses = [];
    if (dayIds.length > 0) {
      const dayCoursesResult = await pool.query(
        `SELECT 
           dc.*,
           c.course_name, c.course_code,
           b.block_name, b.block_code,
          'G'||f.floor_number || '-' || r.room_number AS room_number,
            r.room_type, r.capacity,
           i.full_name AS instructor_name
         FROM day_courses dc
         LEFT JOIN course c ON dc.course_id = c.course_id
         LEFT JOIN rooms r ON dc.room_id = r.room_id
         LEFT JOIN floors f ON r.floor_id = f.floor_id
         LEFT JOIN blocks b ON f.block_id = b.block_id
         LEFT JOIN users i ON dc.instructor_id = i.id
         WHERE dc.day_schedule_id = ANY($1)
         ORDER BY dc.start_time`,
        [dayIds]
      );
      dayCourses = dayCoursesResult.rows;
    }

    const daysById = {};
    days.forEach(d => {
      daysById[d.id] = { ...d, courses: [] };
    });

    dayCourses.forEach(c => {
      const parent = daysById[c.day_schedule_id];
      if (parent) {
        parent.courses.push({
          id: c.id,
          course_id: c.course_id,
          course_code: c.course_code,
          course_name: c.course_name,
          room_id: c.room_id,
          block_name: c.block_name,
          block_code: c.block_code,
          floor_number: c.floor_number,
          room_number: c.room_number,
          room_type: c.room_type,
          room_capacity: c.capacity,
          instructor_id: c.instructor_id,
          instructor_name: c.instructor_name,
          startTime: c.start_time,
          endTime: c.end_time,
          color: c.color,
          location: `${c.block_code} - ${c.room_number}`,
          created_at: c.created_at,
          updated_at: c.updated_at
        });
      }
    });

    const daysByScheduleId = {};
    days.forEach(d => {
      daysByScheduleId[d.schedule_id] = daysByScheduleId[d.schedule_id] || [];
      daysByScheduleId[d.schedule_id].push(daysById[d.id]);
    });

    const result = schedules.map(s => ({
      id: s.id,
      batch: s.batch,
      semester: s.semester,
      section: s.section,
      department_id: s.department_id,
      status: s.status,
      created_at: s.created_at,
      updated_at: s.updated_at,
      days: daysByScheduleId[s.id] || []
    }));

    res.json(result);
  } catch (err) {
    console.error("Error fetching schedules:", err);
    res.status(500).json({ error: "Failed to fetch schedules" });
  }
};
const Delete = async (req, res) => {
  const id = req.params.id;
  try {
    const result = await pool.query("DELETE FROM schedules WHERE id = $1", [id]);
    res.json({ message: "Schedule deleted", affectedRows: result.rowCount });
  } catch (err) {
    console.error("Error deleting schedule:", err);
    res.status(500).json({ error: "Failed to delete schedule" });
  }
};
const permission = async (req, res) => {
  const id = req.params.id;
  const { status } = req.body;
  
  if (!["draft", "published"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  
  try {
    // First get the existing schedule
    const existingResult = await pool.query(
      "SELECT * FROM schedules WHERE id = $1",
      [id]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: "Schedule not found" });
    }
    
    const schedule = existingResult.rows[0];
    
    // If setting to published, set other published schedules with same criteria to draft
    if (status === 'published') {
      await pool.query(
        "UPDATE schedules SET status='draft' WHERE batch_id=$1 AND semester_id=$2 AND section=$3 AND status='published' AND department_id=$4 AND id != $5",
        [schedule.batch_id, schedule.semester_id, schedule.section, schedule.department_id, id]
      );
    }
    
    // Update the current schedule status
    await pool.query("UPDATE schedules SET status = $1 WHERE id = $2", [status, id]);
    res.json({ message: "Status updated" });
  } catch (err) {
    console.error("Error updating status:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
};
const update = async (req, res) => {
  const scheduleId = req.params.id;
  const { batch, semester, section, department_id, status, schedule } = req.body;

  // Add validation for numeric fields
  if (isNaN(Number(batch)) || isNaN(Number(semester)) || isNaN(Number(department_id))) {
    return res.status(400).json({ message: "Batch, semester, and department_id must be numeric IDs" });
  }
  const client = await pool.connect();
  try {
    // Convert to numbers
    const batchId = Number(batch);
    const semesterId = Number(semester);
    const deptId = Number(department_id);

    if (!batchId || !semesterId || !section || !deptId || !status || !schedule) {
      return res.status(400).json({ message: "Failed to update. Please fill all required fields" });
    }

    // Check if schedule exists
    const existing = await client.query("SELECT * FROM schedules WHERE id = $1", [scheduleId]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Schedule not found." });
    }

    // Update main schedule info
     await client.query(
      `UPDATE schedules 
       SET batch_id = $1, semester_id = $2, section = $3, department_id = $4, status = $5, updated_at = NOW() 
       WHERE id = $6`,
      [batchId, semesterId, section, deptId, status, scheduleId]
    );
    // Delete old day_schedules and day_courses
    const oldDays = await client.query("SELECT id FROM day_schedules WHERE schedule_id = $1", [scheduleId]);
    const oldDayIds = oldDays.rows.map(r => r.id);
    if (oldDayIds.length > 0) {
      await client.query("DELETE FROM day_courses WHERE day_schedule_id = ANY($1)", [oldDayIds]);
      await client.query("DELETE FROM day_schedules WHERE id = ANY($1)", [oldDayIds]);
    }

    // Validate duplicate rooms and instructors before inserting new ones
    for (const day of schedule) {
      for (const course1 of day.courses) {
        let countRepeat = 0, instfound = 0;
        for (const course2 of day.courses) {
          if (course1.startTime == course2.startTime && course1.endTime == course2.endTime) {
            countRepeat += 1;
          }
        }
         if (countRepeat > 1) {
          client.release();
          return res.status(400).json({
            message: `Schedule are repeated on ${day.day_of_week} between ${course1.startTime}-${course1.endTime}.`,
          });
        
        }
      }
    }
    
    // Insert updated day_schedules and day_courses
    for (const day of schedule) {
      const dayResult = await client.query(
        "INSERT INTO day_schedules (schedule_id, day_of_week) VALUES ($1, $2) RETURNING id",
        [scheduleId, day.day_of_week]
      );

      const dayId = dayResult.rows[0].id;

      for (const course of day.courses) {
        await client.query(
          `INSERT INTO day_courses 
           (day_schedule_id, course_id, room_id, instructor_id, start_time, end_time, color)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            dayId,
            course.course_id,
            course.room_id,
            course.instructor_id,
            course.startTime,
            course.endTime,
            course.color,
          ]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ message: "Schedule updated successfully." });

  } catch (err) {
    console.error("Schedule update failed:", err);
    await client.query('ROLLBACK');
    res.status(500).json({ message: "Failed to update schedule kkk." });
  } finally {
    client.release();
  }
};
const Batch = async (req, res) => {
  const { batch, semester, section, department_id } = req.query;

  try {
    let query = `
      SELECT 
        dc.id, 
        ds.day_of_week, 
        c.course_name, 
        i.full_name AS instructor_name,
        b.block_name,
        b.block_code,
       'G'||f.floor_number || '-' || r.room_number AS room_number,
        dc.start_time, 
        dc.end_time, 
        d.department_name
      FROM day_courses dc
      JOIN day_schedules ds ON dc.day_schedule_id = ds.id
      JOIN schedules s ON ds.schedule_id = s.id
      JOIN course c ON dc.course_id = c.course_id
      JOIN users i ON dc.instructor_id = i.id
      JOIN rooms r ON dc.room_id = r.room_id
      JOIN floors f ON r.floor_id = f.floor_id
      JOIN blocks b ON f.block_id = b.block_id
      JOIN departments d ON s.department_id = d.department_id
      WHERE s.status='published' 
        AND s.batch_id = $1 
        AND s.semester_id = $2 
        AND s.section = $3
    `;

    const params = [batch, semester, section];

    if (department_id) {
      query += ` AND d.department_id = $4`;
      params.push(department_id);
    }

    query += ` ORDER BY 
      CASE ds.day_of_week
        WHEN 'Monday' THEN 1
        WHEN 'Tuesday' THEN 2
        WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4
        WHEN 'Friday' THEN 5
        WHEN 'Saturday' THEN 6
        WHEN 'Sunday' THEN 7
      END, dc.start_time`;

    const result = await pool.query(query, params);

    const formattedResults = result.rows.map(row => ({
      ...row,
      location: `${row.block_code} - Floor ${row.floor_number} - Room ${row.room_number}`,
      start_time: formatTime(row.start_time),
      end_time: formatTime(row.end_time)
    }));

    res.json(formattedResults);
  } catch (err) {
    console.error("Error fetching schedules:", err);
    res.status(500).json({ error: "Failed to fetch schedules" });
  }
};
// GET /api/instructors/:id/schedule - Get instructor's teaching schedule
const getInstructorSchedule = async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log('Fetching schedule for instructor:', id);
    
    const query = `
      SELECT 
        dc.id,
        c.course_name,
        c.course_code,
        ba.batch_year as batch,
        sem.semester,
        s.section,
        ds.day_of_week as day,
        dc.start_time,
        dc.end_time,
        b.block_code,
        r.room_type,
       'G'|| f.floor_number || '-' || r.room_number AS room_number,
        d.department_name,
        u.full_name as instructor_name,
        u.id_number as instructor_id
      FROM day_courses dc
      JOIN day_schedules ds ON dc.day_schedule_id = ds.id
      JOIN schedules s ON ds.schedule_id = s.id
      JOIN course c ON dc.course_id = c.course_id
      JOIN users u ON dc.instructor_id = u.id
      JOIN rooms r ON dc.room_id = r.room_id
      JOIN floors f ON r.floor_id = f.floor_id
      JOIN blocks b ON f.block_id = b.block_id
      JOIN departments d ON s.department_id = d.department_id
      JOIN semesters sem ON s.semester_id = sem.id
      JOIN batches ba ON s.batch_id= ba.batch_id
      WHERE (u.id = $1)
        AND s.status = 'published'
        AND (u.role = 'instructor' OR u.role = 'department_head')
      ORDER BY 
        CASE ds.day_of_week
          WHEN 'Monday' THEN 1
          WHEN 'Tuesday' THEN 2
          WHEN 'Wednesday' THEN 3
          WHEN 'Thursday' THEN 4
          WHEN 'Friday' THEN 5
          WHEN 'Saturday' THEN 6
          WHEN 'Sunday' THEN 7
        END,
        dc.start_time
    `;

    const result = await pool.query(query, [id]);

    const formattedSchedules = result.rows.map(row => ({
      id: row.id,
      course_name: row.course_name,
      course_code: row.course_code,
      batch: row.batch,
      semester: row.semester,
      section: row.section,
      day: row.day,
      start_time: formatTime(row.start_time),
      end_time: formatTime(row.end_time),
      time_slot: `${formatTime(row.start_time)}-${formatTime(row.end_time)}`,
      room: `${row.block_code} - ${row.room_number}-${row.room_type}`,
      department_name: row.department_name,
      instructor_name: row.instructor_name,
      instructor_id: row.instructor_id
    }));

    console.log(`Found ${formattedSchedules.length} classes for instructor ${id}`);
    res.json(formattedSchedules);

  } catch (err) {
    console.error("Error fetching instructor schedule:", err);
    res.status(500).json({ error: "Failed to fetch instructor schedule" });
  }
};
// GET /api/instructors/:id - Get instructor information
const getInstructorInfo = async (req, res) => {
  const { id } = req.params;
  
  try {
    console.log('Fetching info for instructor:', id);
    
    const query = `
      SELECT 
        u.id,
        u.id_number,
        u.full_name,
        u.email,
        u.role,
        d.department_name,
        u.created_at,
        u.updatd_at
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE (u.id_number = $1 OR u.id = $1 :: int) 
        AND (u.role = 'instructor' OR u.role = 'department_head')
        AND u.status = 'Active'
    `;

  const result = await pool.query(query, [
      Number(id)// integer comparison
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Instructor not found' });
    }

    const instructor = result.rows[0];
    console.log('Found instructor:', instructor.full_name);
    res.json(instructor);

  } catch (err) {
    console.error('Error fetching instructor info:', err);
    res.status(500).json({ error: 'Failed to fetch instructor info' });
  }
};
// GET /api/instructors/me/schedule - Get current instructor's schedule (from session)
const getMySchedule = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'instructor') {
      return res.status(403).json({ error: 'Access denied. Instructor role required.' });
    }

    const instructorId = req.user.id;
    console.log('Fetching schedule for current instructor:', instructorId, req.user.full_name);

    const query = `
      SELECT 
        dc.id,
        c.course_name,
        c.course_code,
        ba.batch_year as batch,
        sem.semester,
        s.section,
        ds.day_of_week as day,
        dc.start_time,
        dc.end_time,
        b.block_code,
       'G'||f.floor_number || '-' || r.room_number AS room_number,
        d.department_name,
        u.full_name as instructor_name,
        u.id_number as instructor_id,
        s.status as schedule_status
      FROM day_courses dc
      JOIN day_schedules ds ON dc.day_schedule_id = ds.id
      JOIN schedules s ON ds.schedule_id = s.id
      JOIN course c ON dc.course_id = c.course_id
      JOIN users u ON dc.instructor_id = u.id
      JOIN rooms r ON dc.room_id = r.room_id
      JOIN floors f ON r.floor_id = f.floor_id
      JOIN blocks b ON f.block_id = b.block_id
      JOIN departments d ON s.department_id = d.department_id
      JOIN semesters sem ON s.semester_id = sem.id
      JOIN batches ba ON s.batch_id= ba.batch_id
      WHERE (u.id_number = $1 OR u.id = $1 ::integer)
        AND s.status = 'published'
        AND (u.role = 'instructor' OR u.role = 'department_head')
        AND u.status = 'Active'
      ORDER BY 
        CASE ds.day_of_week
          WHEN 'Monday' THEN 1
          WHEN 'Tuesday' THEN 2
          WHEN 'Wednesday' THEN 3
          WHEN 'Thursday' THEN 4
          WHEN 'Friday' THEN 5
          WHEN 'Saturday' THEN 6
          WHEN 'Sunday' THEN 7
        END,
        dc.start_time
    `;

    const result = await pool.query(query, [instructorId]);

    const formattedSchedules = result.rows.map(row => ({
      id: row.id,
      course_name: row.course_name,
      course_code: row.course_code,
      batch: row.batch,
      semester: row.semester,
      section: row.section,
      day: row.day,
      start_time: formatTime(row.start_time),
      end_time: formatTime(row.end_time),
      time_slot: `${formatTime(row.start_time)}-${formatTime(row.end_time)}`,
      room: `${row.block_code}-${row.room_number}`,
      department_name: row.department_name,
      instructor_name: row.instructor_name,
      instructor_id: row.instructor_id,
      schedule_status: row.schedule_status
    }));

    console.log(`Found ${formattedSchedules.length} classes for instructor ${instructorId}`);
    
    res.json({
      instructor: {
        id: req.user.id,
        id_number: req.user.id_number,
        full_name: req.user.full_name,
        email: req.user.email,
        role: req.user.role,
        department_name: req.user.department_name,
        department_id: req.user.department_id
      },
      schedules: formattedSchedules,
      stats: {
        total_classes: formattedSchedules.length,
        classes_per_day: getClassesPerDay(formattedSchedules),
        unique_courses: [...new Set(formattedSchedules.map(s => s.course_name))].length,
        unique_batches: [...new Set(formattedSchedules.map(s => s.batch))].length
      }
    });

  } catch (err) {
    console.error("Error fetching my schedule:", err);
    res.status(500).json({ error: "Failed to fetch schedule" });
  }
};
// GET /api/instructors - Get all instructors (for admin use)
const getAllInstructors = async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id,
        u.id_number,
        u.full_name,
        u.email,
        u.role,
        d.department_name,
        u.created_at,
        u.status
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE u.role = 'instructor'
        AND u.status = 'Active'
      ORDER BY u.full_name
    `;

    const result = await pool.query(query);
    
    console.log(`Found ${result.rows.length} instructors`);
    res.json(result.rows);

  } catch (err) {
    console.error('Error fetching instructors:', err);
    res.status(500).json({ error: 'Failed to fetch instructors' });
  }
};
// Get available rooms for a specific time slot (without floors)
const getAvailableRooms = async (req, res) => {
  const { day, start_time, end_time, room_type, capacity } = req.query;
  
  try {
    let query = `
      SELECT 
        r.room_id,
        'G'|| f.floor_number || '-' || r.room_number AS room_number,
        r.room_type,
        r.capacity,
        r.is_available,
        b.block_name,
        b.block_code,
        CONCAT(b.block_code, ' - Floor ', f.floor_number, ' - Room ', r.room_number) as location
      FROM rooms r
      JOIN floors f ON r.floor_id = f.floor_id
      JOIN blocks b ON f.block_id = b.block_id
      WHERE r.is_available = true
        AND r.room_id NOT IN (
          SELECT dc.room_id 
          FROM day_courses dc
          JOIN day_schedules ds ON dc.day_schedule_id = ds.id
          WHERE ds.day_of_week = $1 
            AND dc.start_time = $2 
            AND dc.end_time = $3
        )
    `;

    const params = [day, start_time, end_time];

    if (room_type) {
      query += ` AND r.room_type = $${params.length + 1}`;
      params.push(room_type);
    }

    if (capacity) {
      query += ` AND r.capacity >= $${params.length + 1}`;
      params.push(parseInt(capacity));
    }

    query += ` ORDER BY b.block_name, f.floor_number, r.room_number`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching available rooms:", err);
    res.status(500).json({ error: "Failed to fetch available rooms" });
  }
};
// Get room hierarchy (blocks -> rooms)
const getRoomHierarchy = async (req, res) => {
  try {
    const query = `
      SELECT 
        b.block_id,
        b.block_name,
        b.block_code,
        b.description as block_description,
        b.floor_capacity,
        f.floor_id,
        f.floor_number,
        f.room_capacity as floor_room_capacity,
        r.room_id,
        r.room_number,
        r.room_type,
        r.capacity as room_capacity,
        r.is_available,
        r.created_at as room_created_at
      FROM blocks b
      LEFT JOIN floors f ON b.block_id = f.block_id
      LEFT JOIN rooms r ON f.floor_id = r.floor_id
      ORDER BY b.block_name, f.floor_number::INTEGER, r.room_number
    `;

    const result = await pool.query(query);
    
    const hierarchy = result.rows.reduce((acc, row) => {
      let block = acc.find(b => b.block_id === row.block_id);
      if (!block) {
        block = {
          block_id: row.block_id,
          block_name: row.block_name,
          block_code: row.block_code,
          block_description: row.block_description,
          floor_capacity: row.floor_capacity,
          floors: []
        };
        acc.push(block);
      }

      if (row.floor_id) {
        let floor = block.floors.find(f => f.floor_id === row.floor_id);
        if (!floor) {
          floor = {
            floor_id: row.floor_id,
            floor_number: row.floor_number,
            floor_room_capacity: row.floor_room_capacity,
            rooms: []
          };
          block.floors.push(floor);
        }

        if (row.room_id) {
          floor.rooms.push({
            room_id: row.room_id,
            room_number: row.room_number,
            room_type: row.room_type,
            room_capacity: row.room_capacity,
            is_available: row.is_available,
            room_created_at: row.room_created_at
          });
        }
      }

      return acc;
    }, []);

    res.json(hierarchy);
  } catch (err) {
    console.error("Error fetching room hierarchy:", err);
    res.status(500).json({ error: "Failed to fetch room hierarchy" });
  }
}
const autoGenerateSchedule = async (req, res) => {
  const { batch_id, semester_id, section, department_id } = req.body.scheduleData;
  const client = await pool.connect();
  
  const MAX_INSTRUCTOR_LOAD = 3;
  const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
  const conflictReport = [];
  const assignments = [];

  try {
    await client.query("BEGIN");
      await client.query(
      "UPDATE schedules SET status='draft' WHERE batch_id=$1 and semester_id=$2 and section=$3 and status='published' and department_id=$4",
      [batch_id, semester_id, section, department_id]
    ); 


    /* ---------------- CREATE SCHEDULE ---------------- */
    const schedRes = await client.query(
      `INSERT INTO schedules (department_id, batch_id, semester_id, section, status)
       VALUES ($1,$2,$3,$4,'published')
       RETURNING id`,
      [department_id, batch_id, semester_id, section]
    );
    const scheduleId = schedRes.rows[0].id;

    /* ---------------- DAYS ---------------- */
    const dayMap = {};
    for (const day of DAYS) {
      const d = await client.query(
        `INSERT INTO day_schedules (schedule_id, day_of_week)
         VALUES ($1,$2) RETURNING id`,
        [scheduleId, day]
      );
      dayMap[day] = d.rows[0].id;
    }
   const timslot = await client.query(
    `SELECT * FROM time_slots
     WHERE department_id = $1`,
    [department_id]
    );
    /* ---------------- SLOTS ---------------- */
    const slots = await generateTimeSlots(timslot); // smart + break included
    console.log('time slote', slots);
    
    /* ---------------- COURSES ---------------- */
          const coursesRes = await client.query(
          `SELECT 
            c.course_id,
            c.lec_hr,
            c.tut_hr,
            c.lab_hr
          FROM course_batch cb
          JOIN course c ON cb.course_id = c.course_id
          WHERE cb.department_id = $1
            AND cb.batch = $2
            AND cb.semester_id = $3`,
          [department_id, batch_id, semester_id]
    );
  
    /* ---------------- ROOMS ---------------- */
    const roomsRes = await client.query(
      `SELECT r.room_id, r.room_type
       FROM section_rooms sr
       JOIN rooms r ON sr.room_id=r.room_id
       WHERE sr.department_id=$1 AND
         sr.batch_id=$2 AND sr.section=$3
         AND r.is_available=true`,
      [department_id, batch_id, section]
    );
   
    /* ---------------- PREPARE SESSIONS ---------------- */
    const allSessions = [];
    for (const course of coursesRes.rows) {
      allSessions.push(...calculateCourseSessions(course, timslot));
    }
    const totalLectureTutorial = (allSessions.filter(s => s.type === 'LEC').length);//*timslot.rows[0].lecture_duration;
    const totalLab = (allSessions.filter(s => s.type === 'LAB').length);//*timslot.rows[0].labratory_duration;

        console.log("Total Lecture + Tutorial class :", totalLectureTutorial);
        console.log("Total Lab class:", totalLab);
        console.log("All course", allSessions);
    
    const courseDayUsage = {};
    let k = 0;

    /* ---------------- SCHEDULER ---------------- */
    for (const session of allSessions) {
      const instRes = await client.query(
              `SELECT i.instructor_id
               FROM course_section_instructor_assign i
               JOIN course_batch cb ON i.course_batch_id=cb.id
               WHERE cb.course_id=$1 AND section=$2`, 
              [session.course_id, section]
            );
             if (instRes.rowCount === 0) {
                throw new Error("No available instructor for this section");
      }
      const instructorId = instRes.rows[0].instructor_id;
      let placed = false;
      // Smart scheduling: try LEC first, then LAB
      const filteredSlots = slots.filter(s => s.slot_type === session.type);
      for (const [dayName, dayScheduleId] of Object.entries(dayMap)) {
        courseDayUsage[dayScheduleId] ??= new Set();
        if (courseDayUsage[dayScheduleId].has(session.course_id)) continue;
        for (const slot of filteredSlots) {
          for (const room of roomsRes.rows) {
            // 🧪 Room type check
            if ((session.type === "LAB" && room.room_type === "classroom") || (session.type === "LEC" && room.room_type === "lab")) continue;
            //  Instructor for THIS course only
            //  Max instructor load/day
            const loadRes = await client.query(
              `SELECT COUNT(*) as count
               FROM day_courses dc
               JOIN day_schedules ds ON dc.day_schedule_id=ds.id
               JOIN schedules s ON ds.schedule_id=s.id
               WHERE dc.instructor_id=$1
                 AND ds.day_of_week=$2
                 AND s.status='published'`,
              [instructorId, dayName]
            );
            if (loadRes.rows[0].count >= MAX_INSTRUCTOR_LOAD) continue;

            //  Global instructor conflict
          const globalConflict = await client.query(
              `SELECT 1
               FROM day_courses dc
               JOIN day_schedules ds ON dc.day_schedule_id=ds.id
               JOIN schedules s ON ds.schedule_id=s.id
               WHERE dc.instructor_id=$1
                 AND ds.day_of_week=$2
                 AND dc.start_time=$3
                 AND dc.end_time=$4
                 AND s.status='published'
               LIMIT 1`,
              [instructorId, dayName, slot.start_time, slot.end_time]
            );
            if (globalConflict.rowCount > 0) continue;

            // Local conflict
            const localConflict = assignments.find(a =>
              a.day === dayName &&
              a.start === slot.start_time &&
              (a.room === room.room_id || a.instructor === instructorId)
            );
            if (localConflict) continue;
            console.log('hour start on ',++k,'-i', slot.start_time ,'-', slot.end_time, '-', slot.slot_type, '-day:',dayScheduleId)
            // INSERT
            await client.query(
              `INSERT INTO day_courses
               (day_schedule_id, course_id, room_id, instructor_id, start_time, end_time)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [
                dayScheduleId,
                session.course_id,
                room.room_id,
                instructorId,
                slot.start_time,
                slot.end_time,
              ]
            );

            assignments.push({
              dayScheduleId: dayScheduleId,
              course_id: session.course_id,
              type: session.type,
              day: dayName,
              start: slot.start_time,
              end: slot.end_time,
              room: room.room_id,
              instructor: instructorId
            });
            //  for confilict fetch data
            courseDayUsage[dayScheduleId].add(session.course_id);
            placed = true;
            break;
          }
          if (placed) break;
        } 
        if (placed) break;
      }

      if (!placed) {
        conflictReport.push({
              course_id:session.course_id,
              type:session.type,
              instructor_id:instructorId,
              reason: "No available slot / instructor / room"
        });
      }
    }
    console.log('All coures and schedule ', assignments);
     console.log('single index coures and schedule ', assignments[0]);
    await client.query("COMMIT");

    /* ---------------- FINAL STATUS ---------------- */
    const isFullyScheduled =
      assignments.length === allSessions.length;

    await client.query(
      `UPDATE schedules
       SET status=$1
       WHERE id=$2`,
      [isFullyScheduled ? "published" : "incomplete", scheduleId]
    );

    await client.query("COMMIT");

    /* ---------------- RESPONSE ---------------- */
    return res.json({
      success: isFullyScheduled,
      schedule_id: scheduleId,
      total_sessions: allSessions.length,
      scheduled_sessions: assignments.length,
      conflicts: conflictReport,
      message: isFullyScheduled
        ? "Schedule generated successfully"
        : "Schedule generated with conflicts"
    });


  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
};
function generateTimeSlots(timslot) {
  const slots = [];

  const BREAK_START = "6:30";
  const BREAK_END = "7:30";

  for (const row of timslot.rows) {
    const dayStart = row.start_time;
    const dayEnd = row.end_time;
    const totalHours = diffHours(dayStart, dayEnd);
    const lectureEnd = addHours(dayStart, Math.floor(totalHours / 2));
    console.log("Lecture end:", lectureEnd);
    console.log('start', row.start_time);
    console.log('end', row.end_time);
    /* ---------- LECTURE SLOTS (MORNING) ---------- */
    let lecTime = addHours(dayStart, 0);
    while (timeLessThan(addHours(lecTime, row.lecture_duration), lectureEnd)) {
      const slotStart = lecTime;
      const slotEnd = addHours(lecTime, row.lecture_duration);
      // ⏸ Skip if overlaps lunch/prayer break
      if (!(slotEnd <= BREAK_START || slotStart <= BREAK_END)) {
        lecTime = BREAK_END; // jump past break
        continue;
      }

      slots.push({
        start_time: slotStart,
        end_time: slotEnd,
        slot_type: "LEC"
      });

      lecTime = slotEnd;
    }

    /* ---------- LAB SLOTS (AFTERNOON) ---------- */
    console.log("Trying LEC slot:", lecTime, addHours(lecTime, row.lecture_duration));

    let labTime = BREAK_END;

    while (
      row.labratory_duration > 0 &&
      timeLessThan(addHours(labTime, row.labratory_duration), dayEnd)
    ) {
      const slotStart = labTime;
      const slotEnd = addHours(labTime, row.labratory_duration);

      // ⏸ Skip if overlaps lunch/prayer break
      if (!(slotEnd <= BREAK_START || slotStart >= BREAK_END)) {
        labTime = BREAK_END; // jump past break
        continue;
      }

      slots.push({
        start_time: slotStart,
        end_time: slotEnd,
        slot_type: "LAB"
      });

      labTime = slotEnd;
    }
  }

  return slots;
}
function calculateCourseSessions(course, timslot) {
  const sessions = [];
  let lecSlots, labSlots;
  for (const row of timslot.rows) {
    lecSlots = Math.ceil((course.lec_hr + course.tut_hr) / row.lecture_duration);
    labSlots = Math.ceil(course.lab_hr / row.labratory_duration);
  
    for (let i = 0; i < lecSlots; i++) {
      sessions.push({ course_id: course.course_id, type: "LEC", totallec_hr:row.lecture_duration + row.lecture_duration});
    }
    for (let i = 0; i < labSlots; i++) {
      sessions.push({ course_id: course.course_id, type: "LAB" , totallab_hr:row.labratory_duration+row.labratory_duration});
    }
  }

  return sessions;
}
function addHours(time, hours) {
  const [h, m] = time.split(":").map(Number);
  const d = new Date(2000, 1, 1, h, m);
  d.setHours(d.getHours() + hours);
  return d.toTimeString().slice(0, 5);
}

function diffHours(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh + em / 60) - (sh + sm / 60);
}
function timeLessThan(t1, t2) {
  return t1 <= t2;
}


module.exports = {
  getInstructorSchedule,
  getInstructorInfo,
  getMySchedule,
  getTodaySchedule,
  getAllInstructors,
  getTodaySchedule,
  getAvailableRooms,
  getRoomHierarchy,
  create, 
  getAll,
  Delete, 
  permission,
  Batch, 
  update,
  autoGenerateSchedule
};