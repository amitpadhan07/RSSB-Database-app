const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const cors = require('cors'); 

const app = express();
const port = process.env.PORT || 3000;

// Yahaan aapka external database URL hai
const EXTERNAL_DB_URL = 'postgresql://rssbdb_live_user:RFfTQR5KemUNzHnG5RhAlvitl88AxBBK@dpg-d3aif0adbo4c738s7g00-a.oregon-postgres.render.com/rssbdb_live';

// PostgreSQL database configuration (SSL fix ke saath)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || EXTERNAL_DB_URL,
    ssl: {
        rejectUnauthorized: false 
    }
});

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// CORS MIDDLEWARE (SARE ROUTES SE PEHLE)
app.use(cors()); 

// Middleware to parse incoming request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/image', express.static(path.join(__dirname, 'public/image')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// ----------------------------------------------------
// 1. LOGIN API (Role-Based Access)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await pool.query(
            "SELECT badge_no, username, role FROM users WHERE username = $1 AND password = $2", 
            [username, password]
        );

        if (user.rows.length > 0) {
            const userRole = user.rows[0].role;
            res.json({ success: true, message: 'Login successful!', role: userRole });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Backend login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});
// ----------------------------------------------------


// ----------------------------------------------------
/// 2. USER SUBMISSION API (MODERATION QUEUE) - FINAL CORRECTED VERSION
app.post('/api/submit-request', upload.single('pic'), async (req, res) => {
    // Data extraction
    const { 
        badgeType, badgeNo, name, parent, gender, phone, birth, address, 
        reason, username, type, requestID, originalBadgeNo, 
        oldPicPath // Purana pic path extract kiya
    } = req.body;
    
    // 🛑 CRITICAL FIX: Validation sirf request metadata (jo hamesha chahiye) par hoga.
    // 'name', 'phone', etc., ko yahan check nahi karenge taaki DELETE request pass ho jaaye.
    if (!username || !reason || !type || !requestID || 
        (type.toUpperCase() !== 'ADD' && !originalBadgeNo) || 
        (type.toUpperCase() === 'ADD' && !badgeNo)) 
    {
        console.error("Missing critical fields (Metadata):", { username, reason, type, requestID, originalBadgeNo, badgeNo });
        return res.status(400).json({ success: false, message: 'Missing critical request metadata (user, reason, type, ID, target).' });
    }
    
    // 1. Requested Data ko JSONB format mein taiyyar karna
    let picPath;
    if (req.file) {
        picPath = `uploads/${req.file.filename}`; // Naya file uploaded
    } else if (oldPicPath) {
        picPath = oldPicPath; // oldPicPath field se value li
    } else {
        picPath = 'demo.png'; // Default
    }

    const requestedData = JSON.stringify({
        badge_no: badgeNo,
        badge_type: badgeType,
        pic: picPath,
        name: name,
        parent_name: parent, 
        gender: gender,
        phone: phone,
        birth_date: birth, 
        address: address
        
        
    });

    // targetBadgeNo 'ADD' ke liye naya, 'UPDATE/DELETE' ke liye purana hona chahiye.
    const targetBadgeNo = (type.toUpperCase() === 'UPDATE' || type.toUpperCase() === 'DELETE') ? originalBadgeNo : badgeNo; 

    try {
        const query = `
            INSERT INTO moderation_requests 
            (request_type, target_badge_no, requested_data, requester_username, submission_reason, tracking_id) 
            VALUES ($1, $2, $3, $4, $5, $6) 
            RETURNING *
        `;
        
        const result = await pool.query(query, [
            type.toUpperCase(),
            targetBadgeNo,
            requestedData, 
            username,
            reason,
            requestID
        ]);
        
        res.status(201).json({ success: true, message: 'Request submitted successfully for Admin approval!', trackingID: requestID });
    } catch (err) {
        console.error('Error submitting request:', err);
        // Unique violation handling agar koi user same badge number se submit kare
        if (err.code === '23505' && err.constraint === 'moderation_requests_tracking_id_key') {
             return res.status(409).json({ success: false, message: `Error: A request with ID ${requestID} already exists. Please try submitting after a minute.` });
        }
        res.status(500).json({ success: false, message: 'Error submitting request. Check server console.' });
    }
});

// ----------------------------------------------------


// ----------------------------------------------------
// 3. ADMIN DIRECT ADD API (DATABASE INSERT + LOGGING) - FINAL VERSION
app.post('/api/records', upload.single('pic'), async (req, res) => {
    // 1. Data extraction: Ab hum adminTrackingID ko bhi nikaal rahe hain
    const { badgeType, badgeNo, name, parent, gender, phone, birth, address, adminTrackingID } = req.body;
    const pic = req.file ? `uploads/${req.file.filename}` : 'demo.png';
    
    try {
        // 1. ORIGINAL INSERT INTO PERSONS TABLE (Direct Action)
        const result = await pool.query(
            `INSERT INTO persons (badge_type, badge_no, pic, name, parent_name, gender, phone, birth_date, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [badgeType, badgeNo, pic, name, parent, gender, phone, birth, address]
        );
        const newRecord = result.rows[0];

        // 2. LOGGING: Tracking ID aur data logs table mein daala
        const snapshotData = JSON.stringify(newRecord);
        
        await pool.query(
            // NOTE: tracking_id column mein value daali
            `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, approver_username, submission_reason) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                adminTrackingID, // <-- FRONTEND SE AAYA HUA ID
                'ADMIN_ADD', 
                newRecord.badge_no, 
                snapshotData, 
                'ADMIN_DIRECT', 
                'ADMIN_DIRECT', 
                'Direct record creation by Admin'
            ]
        );

        res.status(201).json({ success: true, record: newRecord });

    } catch (err) {
        console.error('Error adding record:', err);
        // Unique violation handling for badge_no
        if (err.code === '23505' && err.constraint === 'persons_badge_no_key') {
            return res.status(409).json({ success: false, message: `Error: Badge Number ${badgeNo} already exists in the main database.` });
        }
        res.status(500).json({ success: false, message: 'Error adding record (Internal Server Error)', error: err.message });
    }
});
// ----------------------------------------------------


// ----------------------------------------------------
// server.js - API to Approve a pending moderation request (FINAL FIX FOR LOGS)
app.post('/api/requests/approve/:id', async (req, res) => {
    const requestId = req.params.id;
    const { approverUsername } = req.body; 
    
    try {
        await pool.query('BEGIN'); // Transaction shuru

        // 1. Pending request fetch karein
        const requestResult = await pool.query(
            `SELECT * FROM moderation_requests WHERE request_id = $1 AND request_status = 'Pending'`,
            [requestId]
        );

        if (requestResult.rows.length === 0) {
            await pool.query('COMMIT');
            return res.status(404).json({ success: false, message: 'Pending request not found or already processed.' });
        }

        const request = requestResult.rows[0];
        const recordData = request.requested_data; 
        const { badge_type, badge_no, name, parent_name, gender, phone, birth_date, address, pic } = recordData;

        // 🛑 FIX: Snapshot Variable Initialization
        let snapshotForLogs = null; // Jo record delete hoga, uska data ismein aayega
        let logActionType = '';
        let actionQuery = '';
        
        // 1.1. DELETE Request ke liye Snapshot Capture Karein
        if (request.request_type === 'DELETE') {
            const preDeleteResult = await pool.query('SELECT * FROM persons WHERE badge_no = $1', [request.target_badge_no]);
            if (preDeleteResult.rows.length > 0) {
                // DELETE hone wale record ka data save kiya
                snapshotForLogs = JSON.stringify(preDeleteResult.rows[0]); 
            }
        }
        // End of 1.1

        // 2. Insert/Update/Delete Query taiyyar karein
        if (request.request_type === 'ADD') {
            actionQuery = `INSERT INTO persons (badge_type, badge_no, pic, name, parent_name, gender, phone, birth_date, address) 
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;
            logActionType = 'USER_ADD_APPROVED';
        } else if (request.request_type === 'UPDATE') {
            actionQuery = `UPDATE persons SET badge_type = $1, pic = $2, name = $3, parent_name = $4, gender = $5, phone = $6, birth_date = $7, address = $8
                            WHERE badge_no = $9 RETURNING *`;
            logActionType = 'USER_UPDATE_APPROVED';
        } else if (request.request_type === 'DELETE') {
            actionQuery = `DELETE FROM persons WHERE badge_no = $1 RETURNING *`;
            logActionType = 'USER_DELETE_APPROVED';
        }

        let actionResult;
        if (request.request_type === 'DELETE') {
             actionResult = await pool.query(actionQuery, [request.target_badge_no]);
        } else if (request.request_type === 'UPDATE') {
            actionResult = await pool.query(actionQuery, [
                badge_type, pic, name, parent_name, gender, phone, birth_date, address, 
                request.target_badge_no 
            ]);
        } else {
             actionResult = await pool.query(actionQuery, [
                 badge_type, badge_no, pic, name, parent_name, gender, phone, birth_date, address
             ]);
        }
        
        const finalizedRecord = actionResult?.rows[0]; 

        // 🛑 FIX: ADD/UPDATE ke liye naya snapshot capture karein
        if (request.request_type === 'ADD' || request.request_type === 'UPDATE') {
             snapshotForLogs = JSON.stringify(finalizedRecord);
        }
        // DELETE ke liye, snapshotForLogs mein pehle se hi data hai

        // 3. Update the moderation request status to 'Approved'
        await pool.query(
            `UPDATE moderation_requests SET request_status = 'Approved' WHERE request_id = $1`,
            [requestId]
        );

        // 4. LOGGING: Insert an entry into the logs table (Audit Trail)
        // snapshotForLogs variable use kiya gaya hai (DELETE ke liye pehle se hi populated hai)
        await pool.query(
            `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, approver_username, submission_reason) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                request.tracking_id, 
                logActionType, 
                request.target_badge_no, 
                snapshotForLogs, // ✅ FINAL FIX: Snapshot variable use kiya
                request.requester_username, 
                'ADMIN_PANEL',
                `Approved: ${request.submission_reason || 'No reason provided'}` 
            ]
        );

        await pool.query('COMMIT'); // Transaction complete

        res.status(200).json({ success: true, message: `Request ${request.request_type} approved successfully.` });

    } catch (err) {
        await pool.query('ROLLBACK'); // Galti hone par rollback
        console.error('Error approving request:', err);
        res.status(500).json({ success: false, message: 'Error approving request', error: err.message });
    }
});

// API TO  rejection endpoint ka corrected code
app.post('/api/requests/reject/:id', async (req, res) => {
    const requestId = req.params.id;
    const { approverUsername, rejectionReason } = req.body; 

    try {
        await pool.query('BEGIN'); // Transaction shuru

        // ✅ FIX 1: UPDATE query se 'rejection_reason' ko hata diya.
        // Ab yeh sirf request_status ko 'Rejected' set karega.
        const result = await pool.query(
            `UPDATE moderation_requests SET request_status = 'Rejected' WHERE request_id = $1 AND request_status = 'Pending' RETURNING *`,
            [requestId]
        );

        if (result.rows.length === 0) {
            await pool.query('COMMIT');
            return res.status(404).json({ success: false, message: 'Pending request not found or already processed.' });
        }
        
        const request = result.rows[0];

        // 2. LOGGING: Logs table mein rejection reason record karein (yeh column 'submission_reason' ke liye use ho raha hoga)
        await pool.query(
            `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, approver_username, submission_reason) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                request.tracking_id,
                `USER_${request.request_type}_REJECTED`,
                request.target_badge_no, 
                JSON.stringify(request.requested_data),
                request.requester_username, 
                'ADMIN_PANEL',
                `Rejected: ${rejectionReason || 'No reason provided'}` // Rejection reason yahan save ho raha hai
            ]
        );

        await pool.query('COMMIT'); 

        res.status(200).json({ success: true, message: 'Request rejected successfully.', request: result.rows[0] });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error rejecting request:', err);
        res.status(500).json({ success: false, message: 'Server error while rejecting request.' });
    }
});
// ----------------------------------------------------

// NEW API: Get all Pending Moderation Requests (Final Stable Version)
app.get('/api/moderation/pending', async (req, res) => {
    try {
        const query = `
            SELECT request_id, tracking_id, request_type, target_badge_no, requester_username, submission_reason, submission_timestamp
            FROM moderation_requests 
            WHERE request_status = 'Pending'
            ORDER BY submission_timestamp ASC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
        
    } catch (err) {
        console.error('Error fetching pending requests (CRASH):', err);
        res.status(500).json({ success: false, message: 'Server error while fetching pending requests.' });
    }
});
// ----------------------------------------------------
// 5. ADMIN DIRECT UPDATE/DELETE WITH LOGGING

// API to update a record (Admin Direct Update) - FINAL VERSION with Logging
app.put('/api/records/:originalBadgeNo', upload.single('pic'), async (req, res) => {
    const { originalBadgeNo } = req.params;
    // 1. Data extraction: Ab hum adminTrackingID bhi nikaal rahe hain
    const { badgeType, badgeNo, name, parent, gender, phone, birth, address, adminTrackingID } = req.body; 
    
    let pic;
    if (req.file) {
        pic = `uploads/${req.file.filename}`;
    } else {
        pic = req.body.pic;
    }

    try {
        await pool.query('BEGIN'); // Transaction shuru

        // 1. UPDATE QUERY EXECUTION
        const result = await pool.query(
            `UPDATE persons SET badge_type = $1, badge_no = $2, pic = $3, name = $4, parent_name = $5, gender = $6, phone = $7, birth_date = $8, address = $9
             WHERE badge_no = $10 RETURNING *`, 
            [badgeType, badgeNo, pic, name, parent, gender, phone, birth, address, originalBadgeNo]
        );
        
        if (result.rows.length > 0) {
            const updatedRecord = result.rows[0];
            
            // 2. LOGGING: Insert into logs table with Tracking ID
            const snapshotData = JSON.stringify(updatedRecord);
            
            await pool.query(
                `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, approver_username, submission_reason) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    adminTrackingID, // <-- FRONTEND SE AAYA HUA ID
                    'ADMIN_UPDATE', 
                    updatedRecord.badge_no, 
                    snapshotData, 
                    'ADMIN_DIRECT', 
                    'ADMIN_DIRECT', 
                    'Direct update by Admin'
                ]
            );

            await pool.query('COMMIT'); // Transaction complete
            res.json({ success: true, record: updatedRecord });
        } else {
            await pool.query('COMMIT'); 
            res.status(404).json({ success: false, message: 'Record not found for update.' });
        }
    } catch (err) {
        await pool.query('ROLLBACK'); // Rollback on failure
        console.error('Error updating record:', err);
        res.status(500).json({ success: false, message: 'Server crashed during update/logging.', error: err.message });
    }
});

// API to delete a record (Admin Direct Delete) - FINAL FIX
app.delete('/api/records/:badgeNo', async (req, res) => {
    const { badgeNo } = req.params;
    const { reason, trackingID } = req.body; 
    const logReason = reason || 'No reason provided for audit.';
    let snapshotData = null; // Variable to hold the deleted record's data

    try {
        // 1. FETCH RECORD BEFORE DELETION (Snapshot ke liye)
        const preDeleteResult = await pool.query('SELECT * FROM persons WHERE badge_no = $1', [badgeNo]);
        const recordToLog = preDeleteResult.rows[0];
        
        if (!recordToLog) {
            // Agar record nahi mila
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        
        // Snapshot data ko JSON string mein save karein
        snapshotData = JSON.stringify(recordToLog);

        // 2. DELETE FROM PERSONS TABLE (Final Action)
        const deleteResult = await pool.query('DELETE FROM persons WHERE badge_no = $1 RETURNING *', [badgeNo]);
    
        if (deleteResult.rows.length > 0) {
            // 3. LOGGING (Audit Trail with full snapshot)
            await pool.query(
                `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, approver_username, submission_reason) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    trackingID, 
                    'ADMIN_DELETE', 
                    badgeNo, 
                    snapshotData, // <-- Deleted record ka pura data
                    'ADMIN_DIRECT', 
                    'ADMIN_DIRECT', 
                    logReason
                ]
            );

            res.json({ success: true, message: 'Record deleted successfully' });
        } else {
            // Safety Check
            res.status(404).json({ success: false, message: 'Record not found during final delete.' });
        }
    } catch (err) {
        console.error('Error during simple delete:', err);
        // Ensure ki error hamesha JSON format mein hi wapas jaye
        res.status(500).json({ success: false, message: 'Server crashed during deletion/logging.', error: err.message });
    }
});
// ----------------------------------------------------

// NEW API: Get a single record by BadgeNo (Required for Action Button)
app.get('/api/records/:badgeNo', async (req, res) => {
    const { badgeNo } = req.params;
    try {
        // Person table se sirf woh record fetch karein jiska badgeNo match kare
        const result = await pool.query('SELECT * FROM persons WHERE badge_no = $1', [badgeNo]);
        
        if (result.rows.length === 0) {
            // Agar record nahi mila to 404 (Not Found) return karein
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        // Success: sirf single record object return karein
        res.json(result.rows[0]); 
    } catch (err) {
        console.error('Error fetching single record:', err);
        res.status(500).json({ success: false, message: 'Server error while fetching record.' });
    }
});

// API to get all records, with sorting (Existing Code)
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
        query += ` ORDER BY name ASC`; // Default sort
    }
    
    try {
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching records:', err);
        res.status(500).json({ success: false, message: 'Error fetching records' });
    }
});

// API to search for records (Existing Code)
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

// server.js mein jahan aapke GET APIs hain, wahan yeh code add karein.

// 7. API to fetch requests submitted by the currently logged-in user
// server.js - API to fetch requests submitted by the currently logged-in user

app.get('/api/user/my-requests', async (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required to fetch requests.' });
    }

    try {
        // ✅ FIX: 'submitted_at' ko 'submission_timestamp' se badal diya
        const result = await pool.query(
            `SELECT request_id, tracking_id, request_type, target_badge_no, submission_reason, request_status, submission_timestamp 
             FROM moderation_requests 
             WHERE requester_username = $1 
             ORDER BY submission_timestamp DESC`,
            [username]
        );
        
        res.json(result.rows);
    } catch (err) {
        console.error(`Error fetching requests for user ${username}:`, err);
        res.status(500).json({ success: false, message: 'Failed to fetch user requests.' });
    }
});

// server.js mein jahan Get APIs hain, wahan yeh code add karein.

// 8. API to fetch a single request by its ID (for detailed review)
app.get('/api/request/:requestId', async (req, res) => {
    const { requestId } = req.params;

    try {
        const result = await pool.query(
            `SELECT * FROM moderation_requests WHERE request_id = $1`,
            [requestId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Request not found.' });
        }
        
        // Poora request object wapas bhejein
        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error fetching request ${requestId}:`, err);
        res.status(500).json({ success: false, message: 'Failed to fetch request details.' });
    }
});
// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});