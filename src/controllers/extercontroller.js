const XLSX = require("xlsx");
const pool = require("../db");

const upload = async (req, res) => {
  try {
    // 🔴 MUST exist (multer requirement)
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const students = XLSX.utils.sheet_to_json(sheet);

    let inserted = 0;
    let skipped = 0;

    for (const s of students) {
      if (!s.student_number || !s.full_name || !s.email) {
        skipped++;
        continue;
      }

      await pool.query(
        `
        INSERT INTO students (
          student_number,
          full_name,
          email,
          phone,
          date_of_birth,
          gender,
          address,
          enrollment_date,
          status,
          department_id,
          batch_id,
          semester_id,
          section,
          profile_image_url
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
        )
        ON CONFLICT (student_number) DO NOTHING
        `,
        [
          s.student_number,
          s.full_name,
          s.email,
          s.phone || null,
          s.date_of_birth || null,
          s.gender || null,
          s.address || null,
          s.enrollment_date || null,
          s.status || "Active",
          s.department_id || null,
          s.batch_id || null,
          s.semester_id || null,
          s.section || null,
          s.profile_image_url || null,
        ]
      );

      inserted++;
    }

    return res.json({
      message: "Import completed successfully",
      inserted,
      skipped,
      total: students.length,
    });
  } catch (error) {
    console.error("IMPORT ERROR:", error);
    return res.status(500).json({ error: "Failed to import students" });
  }
};

module.exports = { upload };
