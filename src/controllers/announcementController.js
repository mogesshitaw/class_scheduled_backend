
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("../db");
const nodemailer = require("nodemailer");

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  secure:false,
  auth: {
    user: process.env.EMAIL_USER || 'mogesshitaw7707@gmail.com',
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

const getAnnouncements = async (req, res) => {
  const { department_id, published_only = 'false' } = req.query;
  
  try {
    let query = `
      SELECT a.*, u.full_name as author_name, d.department_name
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN departments d ON a.department_id = d.department_id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    // If user is logged in, you can filter by their department if needed
    if (department_id) {
      paramCount++;
      query += ` AND a.department_id = $${paramCount}`;
      params.push(department_id);
    }

    if (published_only === 'true') {
      paramCount++;
      query += ` AND a.is_published = true AND (a.publish_at IS NULL OR a.publish_at <= NOW()) 
                AND (a.expires_at IS NULL OR a.expires_at > NOW())`;
    }

    query += ` ORDER BY 
              CASE a.priority 
                WHEN 'high' THEN 1
                WHEN 'medium' THEN 2
                WHEN 'low' THEN 3
                ELSE 4
              END, 
              a.created_at DESC`;

    console.log('Executing query:', query);
    console.log('With params:', params);
    
    const result = await pool.query(query, params);
    console.log('Found announcements:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
};

// Create announcement - WITH SESSION USER
const createAnnouncement = async (req, res) => {
  const { title, content, priority, publish_at, expires_at, is_published } = req.body;
  
  console.log('Creating announcement with data:', req.body);
  console.log('User session:', req.user); // This should contain user info from your auth middleware
  
  try {
    const allStudents = await pool.query(`SELECT * FROM students WHERE status ='Active'`);
    // Get user from session (this depends on your authentication setup)
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const author_id = user.id;
    const department_id = user.department_id; // Make sure this is in your user object

    if (!department_id) {
      return res.status(400).json({ error: 'User department not found' });
    }
    if (is_published) {
       const result = await pool.query(
      `INSERT INTO announcements 
       (title, content, author_id, department_id, priority, publish_at, expires_at, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, content, author_id, department_id, priority, publish_at, expires_at, is_published || false]
      );
    
      for (const email of allStudents.rows) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
       loginUrl = `${frontendUrl}/announcements/${result.rows[0].id}`;
        if (department_id == email.department_id) {
          // Send email if user exists
          const mailOptions = {
                  from: process.env.EMAIL_FROM || '"Woldia University" <woldiauniversity@gmail.com>',
                  to: email.email,
                  subject: '📢 New Announcement – Woldia University',
                  html: `
                  <div style="background:#f3f4f6;padding:20px;">
                    <div style="
                      max-width:600px;
                      margin:auto;
                      background:#ffffff;
                      border-radius:10px;
                      overflow:hidden;
                      box-shadow:0 4px 10px rgba(0,0,0,0.08);
                      font-family:Arial,Helvetica,sans-serif;
                    ">

                      <!-- Header -->
                      <div style="background:#1e40af;color:#fff;padding:20px;text-align:center;">
                        <h2 style="margin:0;">Woldia University</h2>
                        <p style="margin:5px 0 0;font-size:14px;">Official Announcement</p>
                      </div>

                      <!-- Body -->
                      <div style="padding:20px;color:#111827;">
                        <p style="font-size:15px;">Hello <strong>${email.full_name}</strong>,</p>

                        <p style="font-size:14px;line-height:1.6;">
                          We have published a new announcement. Please read it carefully.
                        </p>

                        <!-- Short preview -->
                        <div style="
                          background:#f9fafb;
                          padding:15px;
                          border-left:4px solid #3b82f6;
                          margin:15px 0;
                          font-size:14px;
                        ">
                          ${content.substring(0, 150)}...
                        </div>

                        <!-- Button -->
                        <div style="text-align:center;margin:25px 0;">
                          <a href="${loginUrl}"
                            style="
                              background:#3b82f6;
                              color:#ffffff;
                              padding:12px 28px;
                              font-size:15px;
                              text-decoration:none;
                              border-radius:6px;
                              display:inline-block;
                            ">
                            Read Full Announcement
                          </a>
                        </div>

                        <p style="font-size:13px;color:#374151;">
                          If the button does not work, copy and paste this link into your browser:
                        </p>
                        <p style="font-size:12px;color:#1e40af;word-break:break-all;">
                          ${loginUrl}
                        </p>
                      </div>

                      <!-- Footer -->
                      <div style="background:#f3f4f6;padding:15px;text-align:center;font-size:12px;color:#6b7280;">
                        © ${new Date().getFullYear()} Woldia University<br>
                        This is an automated message. Please do not reply.
                      </div>

                    </div>
                  </div>
                  `
                };

          await transporter.sendMail(mailOptions);
          console.log(`Announcement post for all students  : ${email.email}`);
        }
      }
        console.log('Announcement created:', result.rows[0]);
    res.status(201).json(result.rows[0]);
    }
    else {
       const result = await pool.query(
      `INSERT INTO announcements 
       (title, content, author_id, department_id, priority, publish_at, expires_at, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, content, author_id, department_id, priority, publish_at, expires_at, is_published || false]
      );
      console.log('Announcement created:', result.rows[0]);
       res.status(201).json(result.rows[0]);
    }
   

    
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
};
// Get single announcement
const getAnnouncementById = async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query(
      `SELECT a.*, u.full_name as author_name, d.department_name as department_name
       FROM announcements a
       LEFT JOIN users u ON a.author_id = u.id
       LEFT JOIN departments d ON a.department_id = d.department_id
       WHERE a.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
};


// Update announcement
const updateAnnouncement = async (req, res) => {
  const { id } = req.params;
  const { title, content, priority, publish_at, expires_at, is_published } = req.body;

  try {
    const result = await pool.query(
      `UPDATE announcements 
       SET title = $1, content = $2, priority = $3, publish_at = $4, 
           expires_at = $5, is_published = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [title, content, priority, publish_at, expires_at, is_published, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
};

// Delete announcement
const deleteAnnouncement = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM announcements WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
};

// Toggle publish status
const togglePublish = async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Toggle publish state
    const result = await pool.query(
      `UPDATE announcements 
       SET is_published = NOT is_published,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Announcement not found" });
    }

    const announcement = result.rows[0];

    // 2️⃣ If just published → send email
    if (announcement.is_published === true) {
      const allStudents = await pool.query(
        `SELECT * FROM students WHERE status = 'Active'`
      );

      const frontendUrl =
        process.env.FRONTEND_URL || "http://localhost:3000";

      const announcementUrl = `${frontendUrl}/announcements/${announcement.id}`;

      for (const student of allStudents.rows) {
        // Only same department
        if (student.department_id !== announcement.department_id) continue;

        const mailOptions = {
          from:
            process.env.EMAIL_FROM ||
            '"Woldia University" <woldiauniversity@gmail.com>',
          to: student.email,
          subject: "📢 New Announcement – Woldia University",
          html: `
          <div style="background:#f3f4f6;padding:20px;">
            <div style="max-width:600px;margin:auto;background:#fff;border-radius:10px;
              box-shadow:0 4px 10px rgba(0,0,0,0.08);font-family:Arial">

              <div style="background:#1e40af;color:#fff;padding:20px;text-align:center">
                <h2 style="margin:0">Woldia University</h2>
                <p style="margin:5px 0 0;font-size:14px">Official Announcement</p>
              </div>

              <div style="padding:20px;color:#111827">
                <p>Hello <strong>${student.full_name}</strong>,</p>

                <p>A new announcement has been published.</p>

                <div style="background:#f9fafb;padding:15px;
                  border-left:4px solid #3b82f6;margin:15px 0">
                  ${announcement.content.substring(0, 150)}...
                </div>

                <div style="text-align:center;margin:25px 0">
                  <a href="${announcementUrl}"
                    style="background:#3b82f6;color:#fff;
                    padding:12px 28px;border-radius:6px;
                    text-decoration:none;display:inline-block">
                    Read Full Announcement
                  </a>
                </div>

                <p style="font-size:12px;color:#6b7280">
                  If the button does not work, copy and paste this link:
                </p>
                <p style="font-size:12px;color:#1e40af;word-break:break-all">
                  ${announcementUrl}
                </p>
              </div>

              <div style="background:#f3f4f6;padding:15px;text-align:center;
                font-size:12px;color:#6b7280">
                © ${new Date().getFullYear()} Woldia University
              </div>
            </div>
          </div>
          `,
        };

        await transporter.sendMail(mailOptions);
      }

      console.log(
        `📧 Announcement ${announcement.id} emailed to students`
      );
    }

    // 3️⃣ Respond
    res.json({
      success: true,
      announcement,
      message: announcement.is_published
        ? "Announcement published and emailed"
        : "Announcement unpublished",
    });
  } catch (error) {
    console.error("Error toggling announcement:", error);
    res.status(500).json({ error: "Failed to toggle announcement" });
  }
};


module.exports = { getAnnouncements, getAnnouncementById, createAnnouncement,updateAnnouncement, togglePublish, deleteAnnouncement };
 