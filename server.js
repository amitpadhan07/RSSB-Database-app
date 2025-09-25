const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer'); // Multer ko yahan require kiya gaya hai

const app = express();
const port = 3000;

// PostgreSQL database configuration
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "rssbdb",
  password: "Amitpad@07",
  port: 5432,
});

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/'); // Files is folder me save honge
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique file name
    }
});
const upload = multer({ storage: storage });

// Middleware to parse incoming request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to serve images from the 'public/image' directory
app.use('/image', express.static(path.join(__dirname, 'public/image')));

// API endpoint to serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Login API
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === '1234') {
    res.json({ success: true, message: 'Login successful!' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// API to add a new record (with file upload middleware)
app.post('/api/records', upload.single('pic'), async (req, res) => {
  const { badgeType, badgeNo, name, parent, gender, phone, birth, address } = req.body;
  const pic = req.file ? `uploads/${req.file.filename}` : 'demo.png'; // File path save karna
  
  try {
    const result = await pool.query(
      `INSERT INTO persons (badge_type, badge_no, pic, name, parent_name, gender, phone, birth_date, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [badgeType, badgeNo, pic, name, parent, gender, phone, birth, address]
    );
    res.status(201).json({ success: true, record: result.rows[0] });
  } catch (err) {
    console.error('Error adding record:', err);
    res.status(500).json({ success: false, message: 'Error adding record', error: err.message });
  }
});

// API to update a record (with file upload middleware)
app.put('/api/records/:originalBadgeNo', upload.single('pic'), async (req, res) => {
  const { originalBadgeNo } = req.params;
  const { badgeType, badgeNo, name, parent, gender, phone, birth, address } = req.body;
  
  let pic;
  if (req.file) {
      pic = `uploads/${req.file.filename}`; // New picture's path
  } else {
      pic = req.body.pic; // Use the existing picture path from the hidden field
  }

  try {
    const result = await pool.query(
      `UPDATE persons SET badge_type = $1, badge_no = $2, pic = $3, name = $4, parent_name = $5, gender = $6, phone = $7, birth_date = $8, address = $9
       WHERE badge_no = $10 RETURNING *`,
      [badgeType, badgeNo, pic, name, parent, gender, phone, birth, address, originalBadgeNo]
    );
    if (result.rows.length > 0) {
      res.json({ success: true, record: result.rows[0] });
    } else {
      res.status(404).json({ success: false, message: 'Record not found' });
    }
  } catch (err) {
    console.error('Error updating record:', err);
    res.status(500).json({ success: false, message: 'Error updating record', error: err.message });
  }
});

// Other endpoints (get, search, delete) remain the same
app.get('/api/records', async (req, res) => {
    const { sort, direction } = req.query;
    let query = 'SELECT * FROM persons';
    
    if (sort) {
        const validColumns = ['badge_no', 'name', 'birth_date'];
        if (validColumns.includes(sort)) {
            query += ` ORDER BY ${sort}`;
            if (direction && ['ASC', 'DESC'].includes(direction.toUpperCase())) {
                query += ` ${direction.toUpperCase()}`;
            }
        }
    } else {
        query += ` ORDER BY name ASC`;
    }
    
    try {
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching records:', err);
        res.status(500).json({ success: false, message: 'Error fetching records' });
    }
});

app.get('/api/search', async (req, res) => {
  const { searchBy, searchTerm } = req.query;
  let query = 'SELECT * FROM persons WHERE ';
  
  switch (searchBy) {
    case 'badge_no':
    case 'name':
    case 'parent_name':
    case 'phone':
    case 'address':
      query += `${searchBy} ILIKE $1`;
      break;
    default:
      return res.status(400).json({ success: false, message: 'Invalid search criteria' });
  }

  try {
    const result = await pool.query(query, [`%${searchTerm}%`]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error searching records:', err);
    res.status(500).json({ success: false, message: 'Error searching records' });
  }
});

app.get('/api/records/:badgeNo', async (req, res) => {
  const { badgeNo } = req.params;
  try {
    const result = await pool.query('SELECT * FROM persons WHERE badge_no = $1', [badgeNo]);
    if (result.rows.length > 0) {
      res.json({ success: true, record: result.rows[0] });
    } else {
      res.status(404).json({ success: false, message: 'Record not found' });
    }
  } catch (err) {
    console.error('Error finding record:', err);
    res.status(500).json({ success: false, message: 'Error finding record' });
  }
});

app.delete('/api/records/:badgeNo', async (req, res) => {
  const { badgeNo } = req.params;
  try {
    const result = await pool.query('DELETE FROM persons WHERE badge_no = $1 RETURNING *', [badgeNo]);
    if (result.rows.length > 0) {
      res.json({ success: true, message: 'Record deleted successfully' });
    } else {
      res.status(404).json({ success: false, message: 'Record not found' });
    }
  } catch (err) {
    console.error('Error deleting record:', err);
    res.status(500).json({ success: false, message: 'Error deleting record' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});