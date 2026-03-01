const pool = require("../db");

// CREATE Floor (SAFE VERSION)
const createFloor = async (req, res) => {
  const client = await pool.connect();

  try {
    const { block_id, floor_number, room_capacity } = req.body;

    if (!block_id || floor_number === undefined || floor_number === null) {
      return res.status(400).json({
        error: "Block ID and floor number are required",
      });
    }

    await client.query("BEGIN");

    // 🔍 Check if floor already exists in this block
    const exists = await client.query(
      `SELECT 1 FROM floors WHERE block_id = $1 AND floor_number = $2`,
      [block_id, floor_number]
    );

    if (exists.rowCount > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "Floor already exists in this block",
      });
    }

    // ✅ Insert floor
    const floorResult = await client.query(
      `INSERT INTO floors (block_id, floor_number, room_capacity)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [block_id, floor_number, room_capacity]
    );

    const floor = floorResult.rows[0];

    // ✅ Create rooms (if needed)
    if (room_capacity && room_capacity > 0) {
      for (let room = 1; room <= room_capacity; room++) {
        const room_number = `R${room.toString().padStart(2, "0")}`;

        await client.query(
          `INSERT INTO rooms (floor_id, room_number)
           VALUES ($1, $2)`,
          [floor.floor_id, room_number]
        );
      }
    }

    await client.query("COMMIT");

    res.status(201).json(floor);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Floor creation error:", err);

    if (err.code === "23505") {
      return res.status(409).json({
        error: "Floor already exists in this block",
      });
    }

    if (err.code === "23503") {
      return res.status(404).json({
        error: "Block not found",
      });
    }

    res.status(500).json({ error: "Server error" });

  } finally {
    client.release();
  }
};


// READ All Floors with Block Info
const getFloors = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT f.*, b.block_name, b.block_code 
       FROM floors f
       JOIN blocks b ON f.block_id = b.block_id
       ORDER BY b.block_name, f.floor_number`
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error("Floors fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// READ Floors by Block ID
const getFloorsByBlock = async (req, res) => {
  const { blockId } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT f.*, b.block_name, b.block_code 
       FROM floors f
       JOIN blocks b ON f.block_id = b.block_id
       WHERE f.block_id = $1
       ORDER BY f.floor_number`,
      [blockId]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error("Floors by block fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// UPDATE Floor
const updateFloor = async (req, res) => {
  const { id } = req.params;
  const { block_id, floor_number, room_capacity } = req.body;

  try {
    const updateResult = await pool.query(
      `UPDATE floors 
       SET block_id = $1, floor_number = $2, room_capacity = $3 
       WHERE floor_id = $4 
       RETURNING *`,
      [block_id, floor_number, room_capacity, id]
    );

    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: "Floor not found" });
    }

    res.json(updateResult.rows[0]);
  } catch (err) {
    console.error("Floor update error:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Floor already exists in this block" });
    }

    res.status(500).json({ error: "Server error" });
  }
};

// DELETE Floor
const deleteFloor = async (req, res) => {
  const { id } = req.params;

  try {
    // await pool.query("DELETE FROM rooms WHERE floor_id = $1",[id]);
    const deleteResult = await pool.query(
      "DELETE FROM floors WHERE floor_id = $1",
      [id]
    );

    if (deleteResult.rowCount === 0 ) {
      return res.status(404).json({ error: "Floor not found" });
    }

    res.json({ message: "Floor deleted successfully" });
  } catch (err) {
    console.error("Floor deletion error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  createFloor,
  getFloors,
  getFloorsByBlock,
  updateFloor,
  deleteFloor
};