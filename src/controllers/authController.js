// src/controllers/authController.js
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
    user: process.env.EMAIL_USER || 'zewdeph12@gmail.com',
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

// Store reset tokens (use Redis/DB in production)
const resetTokens = new Map();

// --- FORGOT PASSWORD ---
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ 
      success: false,
      error: "Email is required" 
    });
  }

  // Validate university email domain
  if (!email.endsWith('@gmail.com')) {
    return res.status(400).json({ 
      success: false,
      error: "Please use your university email address )" 
    });
  }

  try {
    // Check if user exists
    const { rows } = await pool.query(
      "SELECT id, full_name, email FROM users WHERE email = $1 AND status = 'Active'",
      [email]
    );

    // For security, always return success message even if user doesn't exist
    let user = null;
    let resetUrl = '';
    
    if (rows.length > 0) {
      user = rows[0];

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

      // Store token with expiration (1 hour)
      resetTokens.set(hashedToken, {
        userId: user.id,
        email: user.email,
        expiresAt: Date.now() + 3600000, // 1 hour
      });

      // Create reset URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

      // Send email if user exists
      try {
        const mailOptions = {
          from: process.env.EMAIL_FROM || '"Woldia University <zewdeph12@gmail.com>"',
          to: user.email,
          subject: 'Password Reset Instructions - Woldia University',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e40af;">Password Reset Request</h2>
              <p>Hello ${user.full_name},</p>
              <p>We received a request to reset your password. Click the link below to proceed:</p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${resetUrl}" 
                   style="background-color: #3b82f6; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 6px; display: inline-block;">
                  Reset Password
                </a>
              </div>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request this, please ignore this email.</p>
              <hr>
              <p style="color: #666; font-size: 12px;">
                Link: ${resetUrl}
              </p>
            </div>
          `,
        };
        await transporter.sendMail(mailOptions);
        console.log(`Password reset email sent to: ${user.email}`);
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Don't fail the request, just log it
      }
    }
    // Always return success for security
    res.json({ 
      success: true, 
      message: "If your email is registered, you will receive a reset link shortly." 
    });

  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to process password reset request" 
    });
  }
};

// --- VERIFY RESET TOKEN ---
const verifyResetToken = async (req, res) => {
  const { token } = req.params;
  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const tokenData = resetTokens.get(hashedToken);

    if (!tokenData) {
      return res.status(400).json({ 
        success: false,
        valid: false, 
        error: "Invalid or expired token" 
      });
    }

    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(hashedToken);
      return res.status(400).json({ 
        success: false,
        valid: false, 
        error: "Token expired" 
      });
    }

    res.json({ 
      success: true,
      valid: true, 
      email: tokenData.email 
    });

  } catch (err) {
    console.error("Verify token error:", err);
    res.status(500).json({ 
      success: false,
      valid: false, 
      error: "Failed to verify token" 
    });
  }
};

// --- RESET PASSWORD ---
const resetPassword = async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || !newPassword || !confirmPassword) {
    return res.status(400).json({ 
      success: false,
      error: "All fields are required" 
    });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ 
      success: false,
      error: "Passwords do not match" 
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ 
      success: false,
      error: "Password must be at least 8 characters long" 
    });
  }

  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const tokenData = resetTokens.get(hashedToken);

    if (!tokenData) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid or expired token" 
      });
    }

    if (Date.now() > tokenData.expiresAt) {
      resetTokens.delete(hashedToken);
      return res.status(400).json({ 
        success: false,
        error: "Token expired" 
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password
    await pool.query(
      "UPDATE users SET password_hash = $1 WHERE id = $2",
      [hashedPassword, tokenData.userId]
    );

    // Clear used token
    resetTokens.delete(hashedToken);

    res.json({ 
      success: true, 
      message: "Password has been reset successfully" 
    });

  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ 
      success: false,
      error: "Failed to reset password" 
    });
  }
};

// --- LOGIN ---
const login = async (req, res) => {
  const { email, password } = req.body;
  console.log("Login attempt:", email);

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password required",
    });
  }
  await pool.query('UPDATE users SET is_online=true ,last_seen=now() WHERE email=$1', [email]);
  try {
    /* =====================================================
       1️⃣ TRY USERS TABLE
    ===================================================== */
    const userQuery = `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.password_hash,
        u.role,
        u.id_number,
        u.status,
        u.is_first_login,
        u.department_id,
        d.department_name,
        false AS is_student,
        is_online,
        last_seen
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE u.email = $1
    `;

    let result = await pool.query(userQuery, [email]);
    /* =====================================================
       2️⃣ IF NOT USER → TRY STUDENTS TABLE
    ===================================================== */
    if (result.rows.length === 0) {
      const studentQuery = `
        SELECT 
          s.student_id AS id,
          s.student_number AS id_number,
          s.full_name,
          s.email,
          s.section,
          s.password_hash,
          s.role,
          s.status,
          s.is_first_login,
          s.department_id,
          s.batch_id,
          s.semester_id,
          d.department_name,
          b.batch_year as batch,
          b.batch_id,
          sem.semester,
          true AS is_student
        FROM students s
        LEFT JOIN departments d ON s.department_id = d.department_id
        LEFT JOIN batches b ON s.batch_id = b.batch_id
        LEFT JOIN semesters sem ON s.semester_id = sem.id
        WHERE s.email = $1
      `;

      result = await pool.query(studentQuery, [email]);
    }
    /* =====================================================
       3️⃣ NOT FOUND
    ===================================================== */
    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const account = result.rows[0];

    /* =====================================================
       4️⃣ STATUS CHECK
    ===================================================== */
    if (!account.status || account.status.toLowerCase() !== "active") {
    if (account.status.toLowerCase() !== "suspended") {
    return res.status(403).json({
    success: false,
    message: "Account is not active",
  })
    }
  ;
  
}
    /* =====================================================
       5️⃣ PASSWORD CHECK
    ===================================================== */
    const validPassword = await bcrypt.compare(
      password.trim(),
      account.password_hash
    );

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }
 const sessionTime = await pool.query(
      `SELECT session_timeout_minutes,
      enable_session_timeout
       FROM security_setting
       WHERE id_number = $1`,
      [account.id_number]
    );
    let  found = true;
    if (sessionTime.rows.length === 0)
    { 
      found = false;
    }
    /* =====================================================
       6️⃣ SESSION OBJECT (UNIFIED)
    ===================================================== */
    req.session.user = {
      id: account.id,
      full_name: account.full_name,
      email: account.email,
      role: account.role,
      status: account.status,
      id_number: account.id_number,
      department_id: account.department_id,
      department_name: account.department_name,
      is_student: account.is_student,
      is_first_login: account.is_first_login ?? false,
      batch_id: account.batch_id || "",
      semester_id:account.semester_id || "",
      batch: account.batch || "",
      semester:account.semester || "",
      section: account.section || "",
      is_online: account.is_online ?? false,
      last_seen: account.last_seen || "",
      status: account.status,
      password_hash: account.password_hash,
      sessionTime: found ? sessionTime.rows[0].session_timeout_minutes : 10,
      enable_session_timeout: found ? sessionTime.rows[0].enable_session_timeout : false,
    };

    console.log("Session user:", req.session.user);

    return res.json({
      success: true,
      message: "Login successful",
      user: req.session.user,
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
// --- CHANGE PASSWORD ---
const changePassword = async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const { currentPassword, newPassword } = req.body;
  const userId = req.session.user.id;
  if (!req.session.user.is_first_login) {
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters long" });
  }

  try {
    // Get user's current password hash
    const { rows } = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = rows[0];

    // Verify current password
    if (!req.session.user.is_first_login) {
      const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
      if (!validPassword) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
    }
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    await pool.query(
      "UPDATE users SET password_hash = $1, is_first_login = FALSE WHERE id = $2",
      [hashedPassword, userId]
    );

    // Update session if it exists
    if (req.session.user) {
      req.session.user.is_first_login = false;
    }

    res.json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
const lockSession = (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ locked: true });
  }

  req.session.user.is_locked = true;

  res.json({
    success: true,
    locked: true,
  });
};
const unlockSession = async (req, res) => {
  const { password } = req.body;
  const user = req.session.user;

  if (!user) {
    return res.status(401).json({ message: "Not logged in" });
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({ message: "Invalid password"});
  }

  req.session.user.is_locked = false;
  res.json({ success: true });
};
// --- LOGOUT ---
const logout = async (req, res) => {
      
  if (req.session.user) {
     
     const email = req.session.user.email;
    // Update database
    await pool.query(
      'UPDATE users SET is_online = false WHERE email = $1',
      [email]
    );
    console.log("online is false ");
}
   
    
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ 
        success: false,
        message: "Logout failed" 
      });
    }
    res.clearCookie("connect.sid");
    res.json({ 
      success: true,
      message: "Logged out" 
    });
  });
};

// --- PROFILE ---
const profile = (req, res) => {
  if (!req.session.user) {
    return res.json({
      success: true,
      loggedIn: false,
      locked: true,
    });
  }

  return res.json({
    success: true,
    loggedIn: true,
    locked: req.session.user.is_locked === true,
    user: req.session.user,
  });
};

// --- UPDATE PROFILE ---
const updateProfile = async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const { full_name, email } = req.body;
  const userId = req.session.user.id;

  if (!full_name || !email) {
    return res.status(400).json({ message: "Full name and email are required" });
  }

  try {
    // Update user profile
    let  updatedUser;
    if (req.session.user.role == 'Student') {
   const { rows } = await pool.query(
      "UPDATE students SET full_name = $1, email = $2, updated_at = CURRENT_TIMESTAMP WHERE student_id = $3 RETURNING *",
      [full_name, email, userId]
      );
      if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
      }
           updatedUser = rows[0];
    }
    else {
      const { rows } = await pool.query(
      "UPDATE users SET full_name = $1, email = $2, updatd_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *",
      [full_name, email, userId]
      );
      if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
      }
           updatedUser = rows[0];
    }
    // Update session with new data
    req.session.user = {
      ...req.session.user,
      full_name: updatedUser.full_name,
      email: updatedUser.email,
    };

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: req.session.user
    });
  } catch (err) {
    console.error("Update profile error:", err);

    // Check for unique constraint violation (duplicate email)
    if (err.code === '23505') {
      return res.status(400).json({ message: "Email already exists" });
    }

    res.status(500).json({ message: "Server error" });
  }
};
// --- UPDATE PROFILE ---
const updateSecure = async (req, res) => {
  // Check if user is authenticated
  if (!req.session.user) {
    return res.status(401).json({ message: "Not authenticated" });
  }

  const { session_timeout_minutes, enable_session_timeout } = req.body;
  const userId = req.session.user.id;

  if (!session_timeout_minutes || !enable_session_timeout) {
    return res.status(400).json({ message: "session_timeout_minutes and enable_session_timeout are required" });
  }

  try {
    // Update session with new data
    req.session.user = {
      ...req.session.user,
      sessionTime:session_timeout_minutes,
      enable_session_timeout: enable_session_timeout,
    };
  console.error('current sessionTime ', req.session.user.sessionTime,'and current enable_session_timeout', req.session.user.enable_session_timeout,' are updated now');
    res.json({
      success: true,
      message: "secure updated successfully",
      user: req.session.user
    });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
module.exports = { 
  login, 
  logout,
  profile, 
  lockSession,
  unlockSession,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyResetToken,
  updateProfile,
  updateSecure
};