const pool = require("../db");

// CREATE Block
const createBlock = async (req, res) => {
  const { block_name, block_code, floor_capacity, description } = req.body;

  if (!block_name || !block_code ) {
    return res.status(400).json({ error: "Block name and code are required" });
  }
  console.log("request body", req.body);
  try {
    const insertResult = await pool.query(
      `INSERT INTO blocks (block_name, block_code, floor_capacity, description) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [block_name, block_code, floor_capacity, description]
    );
    if (floor_capacity !== null) {
      for (let floor = 0; floor < floor_capacity; floor++){
        let floor_number =floor;
      await pool.query(
      `INSERT INTO floors (block_id, floor_number) 
       VALUES ($1, $2) 
       RETURNING *`,
      [insertResult.rows[0].block_id, floor_number]
    );
      }
   }
    res.status(201).json(insertResult.rows[0]);
  } catch (err) {
    console.error("Block creation error:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Block already exists" });
    }

    res.status(500).json({ error: "Server error" });
  }
};

// READ All Blocks
const getBlocks = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM blocks ORDER BY block_name"
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("Blocks fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// READ Block by ID
const getBlockById = async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      "SELECT * FROM blocks WHERE block_id = $1",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Block not found" });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("Block fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// UPDATE Block
const updateBlock = async (req, res) => {
  const { id } = req.params;
  const { block_name, block_code, floor_capacity, description } = req.body;

  try {
    const updateResult = await pool.query(
      `UPDATE blocks 
       SET block_name = $1, block_code = $2, floor_capacity = $3, description = $4 
       WHERE block_id = $5 
       RETURNING *`,
      [block_name, block_code, floor_capacity, description, id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Block not found" });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error("Block update error:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Block already exists" });
    }

    res.status(500).json({ error: "Server error" });
  }
};

// DELETE Block
const deleteBlock = async (req, res) => {
  const { id } = req.params;

  try {
    const deleteResult = await pool.query(
      "DELETE FROM blocks WHERE block_id = $1",
      [id]
    );

    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: "Block not found" });
    }

    res.json({ message: "Block deleted successfully" });
  } catch (err) {
    console.error("Block deletion error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  createBlock,
  getBlocks,
  getBlockById,
  updateBlock,
  deleteBlock
};