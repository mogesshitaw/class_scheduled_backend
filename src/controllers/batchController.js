const pool = require("../db");

// Get all batches
const getAllBatches = async (req, res) => {
  try {
    const query = `
      SELECT 
        batch_id,
        batch_year,
        created_at,
        updated_at
      FROM batches 
      ORDER BY  batch_id ASC, created_at DESC
    `;

    const result = await pool.query(query);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error("Error fetching batches:", err);
    res.status(500).json({ 
      success: false, 
      error: "Failed to fetch batches" 
    });
  }
};

// Create new batch
const createBatch = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { batch_year } = req.body;

    // Validation
    if (!batch_year) {
      return res.status(400).json({ 
        success: false, 
        error: "Batch year/name is required" 
      });
    }

    if (batch_year.length > 20) {
      return res.status(400).json({ 
        success: false, 
        error: "Batch year/name must be less than 20 characters" 
      });
    }

    await client.query('BEGIN');

    // Check if batch already exists
    const existingBatch = await client.query(
      "SELECT * FROM batches WHERE batch_year = $1",
      [batch_year]
    );

    if (existingBatch.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        success: false, 
        error: "Batch with this name/year already exists" 
      });
    }

    // Create batch
    const result = await client.query(
      "INSERT INTO batches (batch_year) VALUES ($1) RETURNING *",
      [batch_year]
    );

    await client.query('COMMIT');
    
    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: "Batch created successfully"
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error creating batch:", err);
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to create batch" 
    });
  } finally {
    client.release();
  }
};

// Update batch
const updateBatch = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { batch_year } = req.body;

    await client.query('BEGIN');

    // Check if batch exists
    const existingBatch = await client.query(
      "SELECT * FROM batches WHERE batch_id = $1",
      [id]
    );

    if (existingBatch.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Batch not found" 
      });
    }

    // Check for duplicate batch year (excluding current batch)
    if (batch_year && batch_year !== existingBatch.rows[0].batch_year) {
      const duplicateBatch = await client.query(
        "SELECT * FROM batches WHERE batch_year = $1 AND batch_id != $2",
        [batch_year, id]
      );

      if (duplicateBatch.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: "Batch with this name/year already exists" 
        });
      }
    }

    // Update batch
    const result = await client.query(
      `UPDATE batches 
       SET batch_year = $1, updated_at = NOW() 
       WHERE batch_id = $2 
       RETURNING *`,
      [batch_year || existingBatch.rows[0].batch_year, id]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      data: result.rows[0],
      message: "Batch updated successfully"
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error updating batch:", err);
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to update batch" 
    });
  } finally {
    client.release();
  }
};

// Delete batch
const deleteBatch = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;

    await client.query('BEGIN');

    // Check if batch exists
    const batch = await client.query(
      "SELECT * FROM batches WHERE batch_id = $1",
      [id]
    );

    if (batch.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ 
        success: false, 
        error: "Batch not found" 
      });
    }

    // Delete batch
    await client.query(
      "DELETE FROM batches WHERE batch_id = $1",
      [id]
    );

    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: "Batch deleted successfully"
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Error deleting batch:", err);
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to delete batch" 
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getAllBatches,
  createBatch,
  updateBatch,
  deleteBatch
};