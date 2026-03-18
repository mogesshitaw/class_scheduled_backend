const pool = require("../db");


 const getAllSecuritySetting = async (req, res) => {
  try {
const result = await pool.query(`
  SELECT * 
  FROM security_setting
  WHERE id_number = (
    SELECT id_number 
    FROM users 
    WHERE role='admin'
    LIMIT 1
  )
`);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Security setting not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch security settings' });
  }
};
 const getSecuritySetting = async (req, res) => {
  try {
    const { id_number } = req.params;

    const result = await pool.query(
      `SELECT * FROM security_setting WHERE id_number = $1`,
      [id_number]
    );
    console.log('id number', id_number);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Security setting not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch security settings' });
  }
};

/**
 * CREATE or UPDATE (UPSERT) security settings
 */
 const upsertSecuritySetting = async (req, res) => {
  try {
    const {
      id_number,
      session_timeout_minutes,
      max_login_attempts,
      password_policy,
      require_2fa,
      enable_session_timeout
    } = req.body;
    console.log('log', req.body);
    if (password_policy !== null) {
       await pool.query(`UPDATE security_setting SET password_policy = $1 WHERE id_number=$2` ,[password_policy, id_number])
    }
    const result = await pool.query(`
      INSERT INTO security_setting
        (id_number, session_timeout_minutes, max_login_attempts, password_policy, require_2fa, enable_session_timeout)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id_number)
      DO UPDATE SET
        session_timeout_minutes = EXCLUDED.session_timeout_minutes,
        max_login_attempts = EXCLUDED.max_login_attempts,
        password_policy = EXCLUDED.password_policy,
        require_2fa = EXCLUDED.require_2fa,
        enable_session_timeout = EXCLUDED.enable_session_timeout,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
      `,
      [
        id_number,
        session_timeout_minutes,
        max_login_attempts,
        password_policy,
        require_2fa,
        enable_session_timeout
      ]
    );

    res.json({
      message: 'Security settings saved successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save security settings' });
  }
};
 const getCurrentSecuritySetting = async (req, res) => {
  try {
    const user = req.user; // from auth middleware
   if (!user) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const result = await pool.query(
      `SELECT session_timeout_minutes
       FROM security_setting
       WHERE id_number = $1`,
      [user.id_number]
    );

    // fallback if not configured
    const timeoutMinutes =
      result.rows[0]?.session_timeout_minutes ?? 30;

    res.json({ session_timeout_minutes: timeoutMinutes });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load security settings' });
  }
};

module.exports = {
    getSecuritySetting,
    upsertSecuritySetting,
  getCurrentSecuritySetting,
 getAllSecuritySetting 
}