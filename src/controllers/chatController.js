// src/controllers/chatController.js
const pool = require("../db");

// Get user contacts with pagination and filtering
const getUserContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      type, 
      department, 
      favorite, 
      online, 
      limit = 50, 
      offset = 0,
      search 
    } = req.query;
  
    let query = `
      SELECT 
        uc.id,
        uc.user_id,
        uc.status,
        uc.contact_id,
        uc.is_favorite,
        uc.is_blocked,
        uc.last_interaction,
        uc.message_count,
        uc.created_at,
        u.full_name as contact_name,
        u.role as contact_role,
        u.department_id,
        d.department_name,
        u.avatar_url,
        u.is_online,
        u.last_seen,
        (
          SELECT dm.message 
          FROM direct_messages dm 
          WHERE dm.contact_id =uc.id
          ORDER BY dm.created_at DESC 
          LIMIT 1
        ) as last_message,
        (
          SELECT dm.created_at 
          FROM direct_messages dm 
          WHERE dm.contact_id =uc.id
          ORDER BY dm.created_at DESC 
          LIMIT 1
        ) as last_message_time,
        (
          SELECT COUNT(*) 
          FROM direct_messages dm 
          WHERE dm.contact_id =uc.id
            AND dm.receiver_id =$1
            AND dm.is_read = false
        ) as unread_count
      FROM user_contacts uc
      INNER JOIN users u ON uc.contact_id = u.id
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE uc.user_id = $1
    `;

    const params = [userId];
    let paramCount = 1;

    // Apply filters
    if (type) {
      paramCount++;
      query += ` AND u.role = $${paramCount}`;
      params.push(type);
    }

    if (department) {
      paramCount++;
      query += ` AND d.department_name = $${paramCount}`;
      params.push(department);
    }

    if (favorite === 'true') {
      query += ` AND uc.is_favorite = true`;
    }

    if (online === 'true') {
      query += ` AND u.is_online = true`;
    }

    if (search) {
      paramCount++;
      query += ` AND (u.full_name ILIKE $${paramCount} OR u.email ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY uc.last_interaction DESC`;

    // Apply pagination
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(limit);

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);

    const { rows } = await pool.query(query, params);

    res.json(rows);
  } catch (err) {
    console.error('GET /api/chat/contacts error:', err);
    res.status(500).json({ error: 'Failed to fetch contacts' });
  }
};
// Create new contact (send request)
const createContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contact_id, is_favorite = false } = req.body;

    // Validate input
    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id is required' });
    }

    // Check if contact exists
    const contactCheck = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [contact_id]
    );

    if (contactCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Check if contact is not the same user
    if (parseInt(contact_id) === userId) {
      return res.status(400).json({ error: 'Cannot add yourself as contact' });
    }

    // Check if contact already exists
    const existingContact = await pool.query(
      `SELECT id, status FROM user_contacts 
       WHERE user_id = $1 AND contact_id = $2`,
      [userId, contact_id]
    );

    if (existingContact.rows.length > 0) {
      const existingStatus = existingContact.rows[0].status;
      if (existingStatus === 'accepted') {
        return res.status(409).json({ error: 'Contact already connected' });
      } else if (existingStatus === 'request') {
        return res.status(409).json({ error: 'Contact request already sent' });
      } else if (existingStatus === 'pending') {
        return res.status(409).json({ error: 'Contact request already received from this user' });
      }
    }

    // Start transaction
    await pool.query('BEGIN');

    // Check if there's already a pending request from the other user
    const existingReverseRequest = await pool.query(
      `SELECT id FROM user_contacts 
       WHERE user_id = $1 AND contact_id = $2 AND status = 'request'`,
      [contact_id, userId]
    );

    let result;
    
    if (existingReverseRequest.rows.length > 0) {
      // If other user already sent request, automatically accept both
      // Update reverse request to accepted
      await pool.query(
        `UPDATE user_contacts 
         SET status = 'accepted', updated_at = NOW()
         WHERE id = $1`,
        [existingReverseRequest.rows[0].id]
      );

      // Create accepted contact for current user
      const insertQuery = `
        INSERT INTO user_contacts (user_id, contact_id, is_favorite, status) 
        VALUES ($1, $2, $3, 'accepted') 
        RETURNING *
      `;

      const insertResult = await pool.query(insertQuery, [
        userId,
        contact_id,
        is_favorite
      ]);

      result = insertResult.rows[0];
    } else {
      // Create contact request (bidirectional)
      const query = `
        WITH inserted_contact AS (
          INSERT INTO user_contacts (user_id, contact_id, is_favorite, status) 
          VALUES ($1, $2, $3, 'request') 
          RETURNING *
        ),
        reverse_contact AS (
          INSERT INTO user_contacts (user_id, contact_id, status) 
          VALUES ($2, $1, 'pending') 
          RETURNING *
        )
        SELECT * FROM inserted_contact
      `;

      const { rows } = await pool.query(query, [
        userId,
        contact_id,
        is_favorite
      ]);

      result = rows[0];
    }
      // Update last interaction
    await pool.query(
      `UPDATE user_contacts 
       SET last_interaction = NOW()
        WHERE (user_id = $1 AND contact_id = $2)
           OR (user_id = $2 AND contact_id = $1)`,
      [userId, contact_id]
    );

    await pool.query('COMMIT');

    res.status(201).json(result);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error('POST /api/chat/contacts error:', err);
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }
    res.status(500).json({ error: 'Failed to create contact' });
  }
};
// Respond to contact request (accept/reject/cancel)
const respondToContactRequest = async (req, res) => {
  console.log('=== RESPOND TO CONTACT REQUEST START ===');
  console.log('User ID:', req.user?.id);
  console.log('Contact ID:', req.params.contactId);
  console.log('Action:', req.body?.action);
  
  let client;
  try {
    const userId = req.user.id;
    const contactId = parseInt(req.params.contactId);
    const { action } = req.body;

    // Validate inputs
    if (!action || !['accept', 'reject', 'cancel'].includes(action)) {
      console.log('Validation failed: Invalid action', action);
      return res.status(400).json({ 
        error: 'Invalid action. Must be accept, reject, or cancel' 
      });
    }

    if (!contactId || isNaN(contactId)) {
      console.log('Validation failed: Invalid contact ID', req.params.contactId);
      return res.status(400).json({ error: 'Invalid contact ID' });
    }
    // Get client from pool
    client = await pool.connect();
    console.log('Database client connected');
    
    await client.query('BEGIN');
    console.log('Transaction started');
    if (action === 'accept') {
      console.log('Processing accept action...');
      
      // Find pending request where this user is the receiver
      const pendingResult = await client.query(
        `SELECT id, user_id, status FROM user_contacts 
         WHERE contact_id = $2 AND user_id = $1 AND status = 'pending'`,
        [userId, contactId]
      );
      console.log('Pending request check:', {
        found: pendingResult.rows.length > 0,
        rows: pendingResult.rows
      });

      if (pendingResult.rows.length === 0) {
        // Also check if maybe the status is 'request' instead of 'pending'
        const requestResult = await client.query(
          `SELECT id, user_id, status FROM user_contacts 
           WHERE user_id = $1 AND contact_id = $2 AND status = 'request'`,
          [contactId, userId]
        );
        console.log('Alternative request check:', {
          found: requestResult.rows.length > 0,
          rows: requestResult.rows
        });

        if (requestResult.rows.length === 0) {
          console.log('No pending or request found for acceptance');
          await client.query('ROLLBACK');
          client.release();
          return res.status(404).json({ 
            error: 'No contact request found to accept',
            details: `No pending request from user ${contactId} to user ${userId}`
          });
        }
        
        // If we found a 'request', use that as pending
        const requestRow = requestResult.rows[0];
        
        // Update the request to accepted
        await client.query(
          `UPDATE user_contacts 
           SET status = 'accepted', updated_at = NOW()
           WHERE id = $1`,
          [requestRow.id]
        );

        

      } else {
        // Found pending request
        const pendingRow = pendingResult.rows[0];
        
        // Update pending to accepted
        await client.query(
          `UPDATE user_contacts 
           SET status = 'accepted', updated_at = NOW()
           WHERE (contact_id = $2 AND user_id = $1 AND status = 'pending')
           OR contact_id = $1 AND user_id = $2 AND status = 'request'`,
         [userId, contactId]
        );

        // Check if reverse contact exists
        const reverseResult = await client.query(
          `SELECT id FROM user_contacts 
           WHERE user_id = $1 AND contact_id = $2 AND status = 'request'`,
          [userId, contactId]
        );

        if (reverseResult.rows.length > 0) {
          // Update reverse to accepted
          await client.query(
            `UPDATE user_contacts 
             SET status = 'accepted', updated_at = NOW()
             WHERE id = $1`,
            [reverseResult.rows[0].id]
          );
        } else {
          // Create new accepted contact for current user
         
        }
      }

    } else if (action === 'reject' || action === 'cancel') {
      console.log(`Processing ${action} action...`);
      
      // For reject: look for pending request from other user
      // For cancel: look for request sent by current user
      const statusToCheck = action === 'reject' ? 'pending' : 'request';
      const userField = action === 'reject' ? 'contact_id' : 'user_id';
      const contactField = action === 'reject' ? 'user_id' : 'contact_id';
      
      const checkResult = await client.query(
        `SELECT id FROM user_contacts 
         WHERE ${userField} = $1 AND ${contactField} = $2 AND status = $3`,
        [action === 'reject' ? contactId:userId , 
         action === 'reject' ? userId:contactId , 
         statusToCheck]
      );

      console.log(`${action} check:`, {
        found: checkResult.rows.length > 0,
        rows: checkResult.rows
      });

      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ 
          error: `No ${statusToCheck} request found to ${action}`,
          details: `User ${userId} trying to ${action} request with ${contactId}`
        });
      }

      // Delete both contact records
      const deleteResult = await client.query(
        `DELETE FROM user_contacts 
         WHERE (user_id = $1 AND contact_id = $2) 
            OR (user_id = $2 AND contact_id = $1)
         RETURNING id`,
        [userId, contactId]
      );

      console.log(`Deleted ${deleteResult.rowCount} contact records`);

    } else {
      // Should not reach here due to validation, but just in case
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Invalid action' });
    }

    await client.query('COMMIT');
    console.log('Transaction committed successfully');
    
    client.release();
    console.log('Database client released');

    console.log('=== RESPOND TO CONTACT REQUEST SUCCESS ===');
    return res.json({
      success: true,
      message: `Contact request ${action}ed successfully`,
      action: action,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('=== RESPOND TO CONTACT REQUEST ERROR ===');
    console.error('Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      table: err.table,
      column: err.column,
      stack: err.stack
    });
    
    // Rollback transaction if client exists
    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('Transaction rolled back');
      } catch (rollbackErr) {
        console.error('Rollback error:', rollbackErr.message);
      }
      
      try {
        client.release();
        console.log('Database client released after error');
      } catch (releaseErr) {
        console.error('Release error:', releaseErr.message);
      }
    }

    // Check for specific database errors
    if (err.code === '23503') {
      return res.status(404).json({ 
        error: 'Contact not found',
        details: 'The specified user does not exist'
      });
    }
    
    if (err.code === '23505') {
      return res.status(409).json({ 
        error: 'Duplicate contact',
        details: 'Contact already exists'
      });
    }

    // Generic error response
    if (!res.headersSent) {
      return res.status(500).json({ 
        error: 'Failed to process contact request',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined,
        code: err.code
      });
    } else {
      console.error('Headers already sent, cannot send error response');
    }
  }
};

// Update contact (favorite/block)
const updateContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.contactId;
    const { is_favorite, is_blocked } = req.body;

    const { rows, rowCount } = await pool.query(
      `UPDATE user_contacts 
       SET is_favorite = COALESCE($1, is_favorite),
           is_blocked = COALESCE($2, is_blocked),
           updated_at = NOW()
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [is_favorite, is_blocked, contactId, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/chat/contacts/:id error:', err);
    res.status(500).json({ error: 'Failed to update contact' });
  }
};

// Delete contact
const deleteContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.contactId;

    const { rowCount } = await pool.query(
      `DELETE FROM user_contacts 
       WHERE id = $1 AND user_id = $2 AND status = 'accepted'`,
      [contactId, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Contact not found or cannot delete pending requests' });
    }

    // Also delete the reverse contact if it exists
    await pool.query(
      `DELETE FROM user_contacts 
       WHERE user_id = $1 AND contact_id = (
         SELECT contact_id FROM user_contacts WHERE id = $2
       )`,
      [contactId, userId]
    );

    res.json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    console.error('DELETE /api/chat/contacts/:id error:', err);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
};

// Get direct messages with pagination
const getDirectMessages = async (req, res) => {
  try {
    const userId = req.user.id;
    const otherUserId = parseInt(req.params.contactId);
    const { limit = 50, offset = 0, before } = req.query;

    console.log('User ID:', userId, 'Other User ID:', otherUserId);

    let query = `
      SELECT 
        dm.id,
        dm.sender_id,
        dm.receiver_id,
        dm.message_type,
        dm.message,
        dm.file_url,
        dm.file_name,
        dm.file_size,
        dm.is_edited,
        dm.edited_at,
        dm.is_deleted,
        dm.deleted_at,
        dm.mime_type,
        dm.is_read,
        dm.read_at,
        dm.created_at,
        s.full_name as sender_name,
        s.role as sender_role,
        s.avatar_url as sender_avatar,
        r.full_name as receiver_name,
        r.role as receiver_role,
        r.avatar_url as receiver_avatar,
        uc.status
      FROM direct_messages dm
      JOIN user_contacts uc ON dm.contact_id = uc.id
      JOIN users s ON dm.sender_id = s.id
      JOIN users r ON dm.receiver_id = r.id
      WHERE  (dm.sender_id =$1 and  dm.receiver_id=$2) OR (dm.sender_id =$2 and  dm.receiver_id=$1) OR dm.contact_id = (
        SELECT id 
        FROM user_contacts 
        WHERE (user_id = $1 AND contact_id = $2)
           OR (user_id = $2 AND contact_id = $1)
        LIMIT 1
      )
    `;

    const params = [userId, otherUserId];
    let paramCount = 2;

    if (before) {
      paramCount++;
      query += ` AND dm.created_at < $${paramCount}`;
      params.push(new Date(before));
    }

    query += ` AND dm.is_deleted = false`;

    query += ` ORDER BY dm.created_at DESC`;

    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));

    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(parseInt(offset));

    console.log('Query:', query);
    console.log('Params:', params);

    const { rows } = await pool.query(query, params);

    console.log('Number of messages found:', rows.length);

    // Format messages to match your Redux interface
    const formattedMessages = rows.map(row => ({
      id: row.id,
      sender_id: row.sender_id,
      receiver_id: row.receiver_id,
      status: row.status || 'sent',
      message_type: row.message_type,
      message: row.message,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      is_edited: row.is_edited,
      edited_at: row.edited_at,
      is_deleted: row.is_deleted,
      deleted_at: row.deleted_at,
      mime_type: row.mime_type,
      is_read: row.is_read,
      read_at: row.read_at,
      created_at: row.created_at,
      sender_name: row.sender_name,
      sender_avatar: row.sender_avatar,
      sender_role: row.sender_role,
      receiver_name: row.receiver_name,
      receiver_avatar: row.receiver_avatar,
      receiver_role: row.receiver_role
    }));

    // Mark messages as read if viewing (only messages sent to the current user)
    if (formattedMessages.length > 0) {
      await pool.query(
        `UPDATE direct_messages 
         SET is_read = true, read_at = NOW()
         WHERE receiver_id = $1 
           AND sender_id = $2 
           AND is_read = false
           AND is_deleted = false
           AND contact_id = (
             SELECT id 
             FROM user_contacts 
             WHERE (user_id = $1 AND contact_id = $2)
                OR (user_id = $2 AND contact_id = $1)
             LIMIT 1
           )`,
        [userId, otherUserId]
      );
    }

    // Return in chronological order (oldest first)
    console.log('Returning messages:', formattedMessages.length);
    res.json(formattedMessages.reverse());
  } catch (err) {
    console.error('GET /api/chat/messages/:contactId error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};
// New endpoint: GET /api/chat/messages/user/:userId
const getDirectMessagesByUserId = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = parseInt(req.params.userId);
    const { limit = 50, offset = 0 } = req.query;

    // Get messages between these two users
    const query = `
      SELECT 
        dm.id,
        dm.sender_id,
        dm.receiver_id,
        dm.message_type,
        dm.message,
        dm.file_url,
        dm.file_name,
        dm.file_size,
        dm.is_edited,
        dm.edited_at,
        dm.is_deleted,
        dm.deleted_at,
        dm.mime_type,
        dm.is_read,
        dm.read_at,
        dm.created_at,
        s.full_name as sender_name,
        s.role as sender_role,
        s.avatar_url as sender_avatar,
        r.full_name as receiver_name,
        r.role as receiver_role,
        r.avatar_url as receiver_avatar
      FROM direct_messages dm
      JOIN users s ON dm.sender_id = s.id
      JOIN users r ON dm.receiver_id = r.id
      JOIN user_contacts uc ON dm.contact_id = uc.id
      WHERE ((dm.sender_id = $1 AND dm.receiver_id = $2)
         OR (dm.sender_id = $2 AND dm.receiver_id = $1))
        AND dm.is_deleted = false
        AND uc.status = 'accepted'
      ORDER BY dm.created_at DESC
      LIMIT $3
      OFFSET $4
    `;

    const { rows } = await pool.query(query, [
      currentUserId,
      otherUserId,
      parseInt(limit),
      parseInt(offset)
    ]);

    // Mark messages as read
    if (rows.length > 0) {
      await pool.query(
        `UPDATE direct_messages 
         SET is_read = true, read_at = NOW()
         WHERE receiver_id = $1 
           AND sender_id = $2 
           AND is_read = false
           AND is_deleted = false`,
        [currentUserId, otherUserId]
      );
    }

    // Format and return
    const formattedMessages = rows.map(row => ({
      id: row.id,
      sender_id: row.sender_id,
      receiver_id: row.receiver_id,
      status: 'sent',
      message_type: row.message_type,
      message: row.message,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      is_edited: row.is_edited,
      edited_at: row.edited_at,
      is_deleted: row.is_deleted,
      deleted_at: row.deleted_at,
      mime_type: row.mime_type,
      is_read: row.is_read,
      read_at: row.read_at,
      created_at: row.created_at,
      sender_name: row.sender_name,
      sender_avatar: row.sender_avatar,
      sender_role: row.sender_role,
      receiver_name: row.receiver_name,
      receiver_avatar: row.receiver_avatar,
      receiver_role: row.receiver_role
    }));

    res.json(formattedMessages.reverse());
  } catch (err) {
    console.error('GET /api/chat/messages/user/:userId error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};
// Send message
const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { receiver_id, message, message_type = 'text', file_url, file_name, file_size, mime_type } = req.body;

    // Validate input
    if (!receiver_id) {
      return res.status(400).json({ error: 'receiver_id is required' });
    }

    if (message_type === 'text' && (!message || message.trim() === '')) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    if (message_type !== 'text' && !file_url) {
      return res.status(400).json({ error: 'File URL is required for non-text messages' });
    }

    // Get contact relationship
    const contactQuery = await pool.query(
      `SELECT id, status FROM user_contacts 
       WHERE user_id = $1 AND contact_id = $2`,
      [userId, receiver_id]
    );

    if (contactQuery.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found in your contacts' });
    }

    if (contactQuery.rows[0].status !== 'accepted') {
      return res.status(403).json({ error: 'Cannot send message to pending or requested contact' });
    }

    const contactRelationshipId = contactQuery.rows[0].id;

    const query = `
      INSERT INTO direct_messages (
        sender_id, 
        receiver_id, 
        contact_id, 
        message_type, 
        message, 
        file_url, 
        file_name, 
        file_size, 
        mime_type
      ) 
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
      RETURNING *
    `;

    const { rows } = await pool.query(query, [
      userId,
      receiver_id,
      contactRelationshipId,
      message_type,
      message?.trim(),
      file_url,
      file_name,
      file_size,
      mime_type
    ]);

    // Update last interaction
    await pool.query(
      `UPDATE user_contacts 
       SET last_interaction = NOW(),
           message_count = message_count + 1
       WHERE id = $1`,
      [contactRelationshipId]
    );

    // Also update reverse contact's last interaction
    const reverseContactQuery = await pool.query(
      'SELECT id FROM user_contacts WHERE user_id = $1 AND contact_id = $2',
      [receiver_id, userId]
    );

    if (reverseContactQuery.rows.length > 0) {
      await pool.query(
        `UPDATE user_contacts 
         SET last_interaction = NOW()
         WHERE id = $1`,
        [reverseContactQuery.rows[0].id]
      );
    }

    // Get sender info
    const senderInfo = await pool.query(
      'SELECT full_name, role, avatar_url FROM users WHERE id = $1',
      [userId]
    );

    const result = {
      ...rows[0],
      sender_name: senderInfo.rows[0]?.full_name,
      sender_role: senderInfo.rows[0]?.role,
      sender_avatar: senderInfo.rows[0]?.avatar_url,
      receiver_name: req.body.receiver_name || 'User',
      receiver_role: req.body.receiver_role || 'user',
    };

    res.status(201).json(result);

  } catch (err) {
    console.error('POST /api/chat/messages error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
};

// Update message
const updateMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;
    const { message } = req.body;

    const { rows, rowCount } = await pool.query(
      `UPDATE direct_messages 
       SET message = $1, 
           is_edited = true, 
           edited_at = NOW()
       WHERE id = $2 AND sender_id = $3
       RETURNING *`,
      [message, messageId, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/chat/messages/:id error:', err);
    res.status(500).json({ error: 'Failed to update message' });
  }
};

// Delete message (soft delete)
const deleteMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const messageId = req.params.messageId;

    const { rows, rowCount } = await pool.query(
      `UPDATE direct_messages 
       SET is_deleted = true, 
           deleted_at = NOW()
       WHERE id = $1 AND sender_id = $2
       RETURNING *`,
      [messageId, userId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Message not found or unauthorized' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('DELETE /api/chat/messages/:id error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
};

// Get unread message count
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `SELECT COUNT(*) as unread_count
       FROM direct_messages dm
       INNER JOIN user_contacts uc ON dm.contact_id = uc.id
       WHERE dm.receiver_id = $1 
         AND dm.is_read = false
         AND uc.user_id = $1`,
      [userId]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/chat/messages/unread/count error:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};

// Mark messages as read
const markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.contactId;

    const { rowCount } = await pool.query(
      `UPDATE direct_messages 
       SET is_read = true, read_at = NOW()
       WHERE receiver_id = $1 
         AND sender_id = $2 
         AND is_read = false`,
      [userId, contactId]
    );

    res.json({ success: true, marked_count: rowCount });
  } catch (err) {
    console.error('PUT /api/chat/messages/read/:contactId error:', err);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
};

// Search contacts
const searchContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { query } = req.query;

    if (!query || query.trim() === '') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const { rows } = await pool.query(
      `SELECT 
        u.id,
        u.full_name,
        u.email,
        u.role,
        u.department_id,
        d.department_name,
        u.avatar_url,
        u.is_online,
        u.last_seen,
        uc.status,
        uc.is_favorite,
        uc.is_blocked
      FROM user_contacts uc
      INNER JOIN users u ON uc.contact_id = u.id
      LEFT JOIN departments d ON u.department_id = d.department_id
      WHERE uc.user_id = $1
        AND (u.full_name ILIKE $2 OR u.email ILIKE $2 OR u.role ILIKE $2)
      ORDER BY uc.last_interaction DESC
      LIMIT 20`,
      [userId, `%${query}%`]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /api/chat/contacts/search error:', err);
    res.status(500).json({ error: 'Failed to search contacts' });
  }
};

// Get all users with contact status
const getAllUsersWithContactStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `SELECT 
        u.id,
        u.full_name,
        u.email,
        u.role,
        u.department_id,
        d.department_name,
        u.avatar_url,
        u.is_online,
        u.last_seen,
        CASE 
          WHEN uc_sent.id IS NOT NULL THEN uc_sent.status
          WHEN uc_received.id IS NOT NULL THEN 
            CASE WHEN uc_received.status = 'request' THEN 'pending'
                 WHEN uc_received.status = 'pending' THEN 'request'
                 ELSE uc_received.status
            END
          ELSE 'not_contact'
        END as contact_status,
        CASE
          WHEN uc_sent.id IS NOT NULL THEN true
          ELSE false
        END as is_contact_initiated_by_me,
        uc_sent.is_favorite,
        uc_sent.is_blocked
      FROM users u
      LEFT JOIN departments d ON u.department_id = d.department_id
      LEFT JOIN user_contacts uc_sent ON u.id = uc_sent.contact_id AND uc_sent.user_id = $1
      LEFT JOIN user_contacts uc_received ON u.id = uc_received.user_id AND uc_received.contact_id = $1
      WHERE u.id != $1
      ORDER BY u.full_name`,
      [userId]
    );

    res.json(rows);
  } catch (err) {
    console.error('GET /api/chat/users/all error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

module.exports = {
  getUserContacts,
  createContact,
  respondToContactRequest,
  updateContact,
  deleteContact,
  getDirectMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
  getUnreadCount,
  markMessagesAsRead,
  searchContacts,
  getDirectMessagesByUserId,
  getAllUsersWithContactStatus
};