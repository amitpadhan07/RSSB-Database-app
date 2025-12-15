// --- LOAD ENVIRONMENT VARIABLES FIRST ---
require('dotenv').config(); 
const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');



// CLOUDINARY IMPORTS
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
const port = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL;

// --- 1. DATABASE CONFIGURATION (Secured) ---
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// --- 2. CLOUDINARY CONFIGURATION AND STORAGE SETUP (Secured) ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'rssb_project_uploads',
        allowed_formats: ['jpeg', 'png', 'jpg'],
        transformation: [{ width: 500, height: 500, crop: "limit" }]
    },
});

const upload = multer({ storage: storage });

// --- 3. EMAIL TRANSPORT CONFIGURATION (Secured) ---
const transporter = nodemailer.createTransport({
    // Use the explicit host and port instead of 'service: "gmail"'
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Set to false when using port 587 (STARTTLS)
    requireTLS: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/image', express.static(path.join(__dirname, 'public/image')));
app.get('/reset-password', (req, res) => {
    // Note: We use the full filename and pass the query string
    res.redirect(`/reset-password.html${req._parsedUrl.search || ''}`);
});

// --- HELPER FUNCTIONS ---

/**
 * Sends an email notification to a specified recipient.
 * Uses EMAIL_USER from environment variables.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} subject - The subject line of the email.
 * @param {string} text - The plain text body of the email.
 */
async function sendEmailNotification(toEmail, subject, text) {
    const mailOptions = {
        from: process.env.EMAIL_USER, // SECURE: Uses ENV
        to: toEmail,
        subject: subject,
        text: text
    };

    console.log(`[DEBUG] Preparing to send email to: ${toEmail}`);

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`[DEBUG] Email sent successfully! Message ID: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error(`[ERROR] Nodemailer AUTH/CONNECTION FAILED for ${toEmail}:`);
        console.error(error);
        return false;
    }
}

// ... (generateRandomPassword function remains the same)

function generateRandomPassword(length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}


// ====================================================
// --- 1. AUTHENTICATION API ---
// ====================================================

// ... (The rest of the API endpoints remain unchanged as they were already using process.env where appropriate)

/**
 * POST /api/login
 * Handles user login, ensuring only active users proceed to password verification.
 * This is the most robust version against deployment/SQL issues.
 */
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        // 1. Fetch user data (including the HASHED password and active status)
        const userQuery = await pool.query(
            "SELECT badge_no, username, role, password, is_active FROM users WHERE username = $1", 
            [username] 
        );

        if (userQuery.rows.length === 0) {
            // User not found, return generic error for security
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const user = userQuery.rows[0];
        const storedHash = user.password;
        
        // 2. Check if the user is ACTIVE
        if (user.is_active === false) {
             // Specific error message for disabled users
             return res.status(403).json({ success: false, message: 'Your account is currently disabled. Please contact the administrator.' });
        }

        // 3. Verify the password hash using Bcrypt
        const passwordMatch = await bcrypt.compare(password, storedHash);

        if (passwordMatch) {
            // 4. Update last_login timestamp (non-critical, fire-and-forget logging update)
            await pool.query(
                "UPDATE users SET last_login = NOW() WHERE username = $1",
                [username]
            );

            // 5. Success response
            const userRole = user.role;
            res.json({ success: true, message: 'Login successful!', role: userRole });
        } else {
            // Password mismatch
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Backend login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});


// ====================================================
// --- 2. USER/MODERATION APIS ---
// ====================================================

/**
 * POST /api/submit-request
 * User submits an ADD/UPDATE/DELETE request to the moderation queue.
 * Uses Cloudinary for image storage via `upload.single('pic')`.
 */
app.post('/api/submit-request', upload.single('pic'), async (req, res) => {
    const {
        badgeType, badgeNo, name, parent, gender, phone, birth, address,
        reason, username, type, requestID, originalBadgeNo,
        oldPicPath
    } = req.body;

    // Validate critical request metadata
    if (!username || !reason || !type || !requestID ||
        (type.toUpperCase() !== 'ADD' && !originalBadgeNo) ||
        (type.toUpperCase() === 'ADD' && !badgeNo))
    {
        console.error("Missing critical fields (Metadata):", { username, reason, type, requestID, originalBadgeNo, badgeNo });
        return res.status(400).json({ success: false, message: 'Missing critical request metadata.' });
    }

    // Determine the picture path (new Cloudinary URL or old path)
    let picPath;
    if (req.file) {
        picPath = req.file.path; // Cloudinary URL
    } else if (oldPicPath) {
        picPath = oldPicPath;
    } else {
        picPath = 'demo.png';
    }

    // Prepare requested data as JSONB
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

    const targetBadgeNo = (type.toUpperCase() === 'UPDATE' || type.toUpperCase() === 'DELETE') ? originalBadgeNo : badgeNo;

    try {
        const query = `
            INSERT INTO moderation_requests
            (request_type, target_badge_no, requested_data, requester_username, submission_reason, tracking_id)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `;

        await pool.query(query, [
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
        if (err.code === '23505' && err.constraint === 'moderation_requests_tracking_id_key') {
             return res.status(409).json({ success: false, message: `Error: A request with ID ${requestID} already exists.` });
        }
        res.status(500).json({ success: false, message: 'Error submitting request. Check server console.' });
    }
});

/**
 * GET /api/user/my-requests
 * Fetches all moderation requests submitted by a specific user.
 */
app.get('/api/user/my-requests', async (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required to fetch requests.' });
    }

    try {
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

// ====================================================
// --- 3. ADMIN/MODERATION APIS (CRUD & Approval) ---
// ====================================================

/**
 * POST /api/records
 * Admin Direct Add record to the `persons` table with logging.
 * Uses Cloudinary for image storage.
 */
app.post('/api/records', upload.single('pic'), async (req, res) => {
    const { badgeType, badgeNo, name, parent, gender, phone, birth, address, adminTrackingID } = req.body;
    
    // Cloudinary URL or default
    const pic = req.file ? req.file.path : 'demo.png'; 

    try {
        // 1. ORIGINAL INSERT INTO PERSONS TABLE (Direct Action)
        const result = await pool.query(
            `INSERT INTO persons (badge_type, badge_no, pic, name, parent_name, gender, phone, birth_date, address) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [badgeType, badgeNo, pic, name, parent, gender, phone, birth, address]
        );
        const newRecord = result.rows[0];

        // 2. LOGGING: Insert a log entry
        const snapshotData = JSON.stringify(newRecord);

        await pool.query(
            `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, approver_username, submission_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                adminTrackingID,
                'ADMIN_ADD',
                newRecord.badge_no,
                snapshotData,
                'ADMIN_DIRECT', // Actor
                'ADMIN_DIRECT', // Approver
                'Direct record creation by Admin'
            ]
        );

        res.status(201).json({ success: true, record: newRecord });

    } catch (err) {
        console.error('Error adding record:', err);
        if (err.code === '23505' && err.constraint === 'persons_badge_no_key') {
            return res.status(409).json({ success: false, message: `Error: Badge Number ${badgeNo} already exists in the main database.` });
        }
        res.status(500).json({ success: false, message: 'Error adding record (Internal Server Error)', error: err.message });
    }
});

/**
 * PUT /api/records/:originalBadgeNo
 * Admin Direct Update record in the `persons` table with logging.
 * Supports image update via Cloudinary.
 */
app.put('/api/records/:originalBadgeNo', upload.single('pic'), async (req, res) => {
    const { originalBadgeNo } = req.params;
    const { badgeType, badgeNo, name, parent, gender, phone, birth, address, adminTrackingID } = req.body;

    let pic;
    if (req.file) {
        pic = req.file.path; // New Cloudinary URL
    } else {
        pic = req.body.pic; // Use existing path
    }

    try {
        await pool.query('BEGIN');

        // 1. UPDATE QUERY EXECUTION
        const result = await pool.query(
            `UPDATE persons SET badge_type = $1, badge_no = $2, pic = $3, name = $4, parent_name = $5, gender = $6, phone = $7, birth_date = $8, address = $9
             WHERE badge_no = $10 RETURNING *`,
            [badgeType, badgeNo, pic, name, parent, gender, phone, birth, address, originalBadgeNo]
        );

        if (result.rows.length > 0) {
            const updatedRecord = result.rows[0];

            // 2. LOGGING
            const snapshotData = JSON.stringify(updatedRecord);

            await pool.query(
                `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, approver_username, submission_reason)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    adminTrackingID,
                    'ADMIN_UPDATE',
                    updatedRecord.badge_no,
                    snapshotData,
                    'ADMIN_DIRECT',
                    'ADMIN_DIRECT',
                    'Direct update by Admin'
                ]
            );

            await pool.query('COMMIT');
            res.json({ success: true, record: updatedRecord });
        } else {
            await pool.query('COMMIT');
            res.status(404).json({ success: false, message: 'Record not found for update.' });
        }
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error updating record:', err);
        res.status(500).json({ success: false, message: 'Server crashed during update/logging.', error: err.message });
    }
});

/**
 * DELETE /api/records/:badgeNo
 * Admin Direct Delete record from the `persons` table with logging.
 */
app.delete('/api/records/:badgeNo', async (req, res) => {
    const { badgeNo } = req.params;
    const { reason, trackingID } = req.body;
    const logReason = reason || 'No reason provided for audit.';
    let snapshotData = null;

    try {
        // 1. FETCH RECORD BEFORE DELETION (For Snapshot)
        const preDeleteResult = await pool.query('SELECT * FROM persons WHERE badge_no = $1', [badgeNo]);
        const recordToLog = preDeleteResult.rows[0];

        if (!recordToLog) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }

        snapshotData = JSON.stringify(recordToLog);

        // 2. DELETE FROM PERSONS TABLE
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
                    snapshotData,
                    'ADMIN_DIRECT',
                    'ADMIN_DIRECT',
                    logReason
                ]
            );

            res.json({ success: true, message: 'Record deleted successfully' });
        } else {
            res.status(404).json({ success: false, message: 'Record not found during final delete.' });
        }
    } catch (err) {
        console.error('Error during simple delete:', err);
        res.status(500).json({ success: false, message: 'Server crashed during deletion/logging.', error: err.message });
    }
});

/**
 * GET /api/moderation/pending
 * Fetches all currently pending moderation requests for admin review.
 */
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
        console.error('Error fetching pending requests:', err);
        res.status(500).json({ success: false, message: 'Server error while fetching pending requests.' });
    }
});

/**
 * GET /api/request/:requestId
 * Fetches the full details of a single moderation request.
 */
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

        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error fetching request ${requestId}:`, err);
        res.status(500).json({ success: false, message: 'Failed to fetch request details.' });
    }
});

/**
 * POST /api/requests/approve/:id
 * Approves a pending moderation request (ADD, UPDATE, or DELETE) within a transaction.
 */
app.post('/api/requests/approve/:id', async (req, res) => {
    const requestId = req.params.id;
    const { approverUsername } = req.body;

    try {
        await pool.query('BEGIN');

        // 1. Fetch pending request
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

        let snapshotForLogs = null;
        let logActionType = '';
        let actionQuery = '';

        // 1.1. Pre-Action Snapshot for DELETE
        if (request.request_type === 'DELETE') {
            const preDeleteResult = await pool.query('SELECT * FROM persons WHERE badge_no = $1', [request.target_badge_no]);
            if (preDeleteResult.rows.length > 0) {
                snapshotForLogs = JSON.stringify(preDeleteResult.rows[0]);
            }
        }

        // 2. Prepare and Execute DB Action
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

        // 2.1 Post-Action Snapshot for ADD/UPDATE
        if (request.request_type === 'ADD' || request.request_type === 'UPDATE') {
             snapshotForLogs = JSON.stringify(finalizedRecord);
        }

        // 3. Update moderation request status
        await pool.query(
            `UPDATE moderation_requests SET request_status = 'Approved' WHERE request_id = $1`,
            [requestId]
        );

        // 4. LOGGING
        await pool.query(
            `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, approver_username, submission_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                request.tracking_id,
                logActionType,
                request.target_badge_no,
                snapshotForLogs,
                request.requester_username,
                'ADMIN_PANEL',
                `Approved: ${request.submission_reason || 'No reason provided'}`
            ]
        );

        await pool.query('COMMIT');
        res.status(200).json({ success: true, message: `Request ${request.request_type} approved successfully.` });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('Error approving request:', err);
        res.status(500).json({ success: false, message: 'Error approving request', error: err.message });
    }
});

/**
 * POST /api/requests/reject/:id
 * Rejects a pending moderation request and logs the action.
 */
app.post('/api/requests/reject/:id', async (req, res) => {
    const requestId = req.params.id;
    const { approverUsername, rejectionReason } = req.body;

    try {
        await pool.query('BEGIN');

        // 1. Update request status to 'Rejected'
        const result = await pool.query(
            `UPDATE moderation_requests SET request_status = 'Rejected' WHERE request_id = $1 AND request_status = 'Pending' RETURNING *`,
            [requestId]
        );

        if (result.rows.length === 0) {
            await pool.query('COMMIT');
            return res.status(404).json({ success: false, message: 'Pending request not found or already processed.' });
        }

        const request = result.rows[0];

        // 2. LOGGING
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
                `Rejected: ${rejectionReason || 'No reason provided'}`
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

// ====================================================
// --- 4. DATA RETRIEVAL APIS ---
// ====================================================

/**
 * GET /api/records
 * Fetches all records from the `persons` table with optional sorting.
 */
app.get('/api/records', async (req, res) => {
    const { sort, direction } = req.query;
    let query = 'SELECT * FROM persons';
    
    // Dynamic Sorting Logic
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

/**
 * GET /api/records/:badgeNo
 * Fetches a single record from the `persons` table by badge number.
 */
app.get('/api/records/:badgeNo', async (req, res) => {
    const { badgeNo } = req.params;
    try {
        const result = await pool.query('SELECT * FROM persons WHERE badge_no = $1', [badgeNo]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Record not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching single record:', err);
        res.status(500).json({ success: false, message: 'Server error while fetching record.' });
    }
});

/**
 * GET /api/search
 * Searches for records in the `persons` table based on criteria.
 */
app.get('/api/search', async (req, res) => {
    const { searchBy, searchTerm } = req.query;
    let query = 'SELECT * FROM persons WHERE ';
    let isValidSearch = false;

    switch (searchBy) {
        case 'badge_no':
        case 'name':
        case 'parent_name':
        case 'phone':
        case 'address':
            query += `${searchBy} ILIKE $1`;
            isValidSearch = true;
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

// ====================================================
// --- 5. USER MANAGEMENT APIS (Admin) ---
// ====================================================

/**
 * POST /api/users/add
 * Admin creates a new user account, linked to a member in `persons`, with logging.
 */
app.post('/api/users/add', async (req, res) => {
    
    const { username, role, addedBy, badgeNo, email } = req.body; 

    if (!badgeNo || !username || !role || !addedBy || !email) {
        return res.status(400).json({ success: false, message: 'Missing mandatory user fields.' });
    }
    
    try {
        await pool.query('BEGIN');

        // 1. User Existence Check
        const checkUser = await pool.query('SELECT 1 FROM users WHERE username = $1 OR badge_no = $2', [username, badgeNo]);
        if (checkUser.rows.length > 0) {
            await pool.query('ROLLBACK');
            return res.status(409).json({ success: false, message: `User account with username '${username}' or badge number '${badgeNo}' already exists.` });
        }

        // 2. Member Details Check (from persons table)
        const memberResult = await pool.query(
            `SELECT pic, name, phone, address FROM persons WHERE badge_no = $1`,
            [badgeNo]
        );

        if (memberResult.rows.length === 0) {
            await pool.query('ROLLBACK');
            return res.status(404).json({ success: false, message: `Member details not found for Badge No. ${badgeNo}.` });
        }

        const memberData = memberResult.rows[0];

        // 3. GENERATE AND HASH THE RANDOM PASSWORD 
        const generatedPassword = generateRandomPassword(12); // Generate plain text password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(generatedPassword, saltRounds); // Hash the password

        // 4. Insert into the users table
        const result = await pool.query(
            `INSERT INTO users (badge_no, pic, name, phone, role, username, password, email, address, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE) 
             RETURNING username, role, badge_no, name`,
            [
                badgeNo, 
                memberData.pic || 'demo.png',
                memberData.name, 
                memberData.phone, 
                role, 
                username, 
                hashedPassword, // Store HASHED password
                email, 
                memberData.address 
            ]
        );

        const newUserData = result.rows[0]; // CRITICAL: Define newUserData here for email and logging

        // 5. SEND ONBOARDING EMAIL (Use the plain text generated password)
        const subject = "Welcome to the RSSB Database System!";
        
        const emailBody = `Dear ${newUserData.name || username},

A new account has been successfully created for you on the RSSB system by Admin : ${addedBy}.

Your credentials are:
Username: ${username}
Temporary Password: ${generatedPassword} 

For security purposes, please log in and change your password immediately.

You can log in to your account here: ${FRONTEND_URL || 'https://rssb-rudrapur-database-api.onrender.com'}

Best regards,
The RSSB Administration Team`;
        
        await sendEmailNotification(email, subject, emailBody);


        // 6. Logging
        await pool.query(
            `INSERT INTO logs (action_type, target_badge_no, record_snapshot, actor_username, submission_reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                'USER_CREATED', 
                newUserData.badge_no, 
                JSON.stringify(newUserData),
                addedBy, 
                `New user ${username} created with role ${role} and linked to Badge No. ${badgeNo} by ${addedBy}.`
            ]
        );

        await pool.query('COMMIT');

        res.status(201).json({ 
            success: true, 
            message: `User ${username} created successfully. Login credentials sent to ${email}.`, 
            user: newUserData 
        });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('CRITICAL DATABASE ERROR in adminAddUser:', err);
        if (err.code === '23505') {
            return res.status(409).json({ success: false, message: `Error: A user with this badge number or username already exists.` });
        }
        res.status(500).json({ success: false, message: `Server error adding user: ${err.message}` });
    }
});

/**
 * GET /api/users/all
 * Fetches a list of all user accounts.
 */
app.get('/api/users/all', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
                name,
                username,
                role,
                is_active,
                last_login
             FROM users
             ORDER BY username ASC`
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching all users:', err);
        res.status(500).json({ success: false, message: 'Server error fetching user list.' });
    }
});

/**
 * GET /api/user/:username
 * Fetches details for a single user account.
 */
app.get('/api/user/:username', async (req, res) => {
    const { username } = req.params;
    try {
        const result = await pool.query(`SELECT badge_no, pic, name, phone, role, username, email, address, is_active, last_login FROM users WHERE username = $1`, [username]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error(`Error fetching user ${username}:`, err);
        res.status(500).json({ success: false, message: 'Server error while fetching user details.' });
    }
});

/**
 * POST /api/users/update-role
 * Admin updates the role of a user and logs the action.
 */
app.post('/api/users/update-role', async (req, res) => {
    const { targetUsername, newRole, updatedBy } = req.body;
    try {
        const result = await pool.query(
            `UPDATE users SET role = $1 WHERE username = $2 RETURNING *`,
            [newRole, targetUsername]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Target user not found.' });
        }

        // Logging
        await pool.query(
            `INSERT INTO logs (action_type, target_badge_no, record_snapshot, actor_username, submission_reason)
             VALUES ($1, $2, $3, $4, $5)`,
            ['ROLE_UPDATED', targetUsername, JSON.stringify(result.rows[0]), updatedBy, `Role changed to ${newRole}.`]
        );

        res.json({ success: true, message: `Role updated to ${newRole}` });
    } catch (err) {
        console.error('Error updating user role:', err);
        res.status(500).json({ success: false, message: 'Server error updating role.' });
    }
});

/**
 * POST /api/users/toggle-status
 * Admin disables or enables a user account and logs the action.
 */
app.post('/api/users/toggle-status', async (req, res) => {
    const { targetUsername, isActive, updatedBy } = req.body;

    try {
        const result = await pool.query(
            `UPDATE users SET is_active = $1 WHERE username = $2 RETURNING *`,
            [isActive, targetUsername]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Target user not found.' });
        }

        const action = isActive ? 'USER_ENABLED' : 'USER_DISABLED';

        // Logging
        await pool.query(
            `INSERT INTO logs (action_type, target_badge_no, record_snapshot, actor_username, submission_reason)
             VALUES ($1, $2, $3, $4, $5)`,
            [action, targetUsername, JSON.stringify(result.rows[0]), updatedBy, `${targetUsername} status set to ${action} by ${updatedBy}.`]
        );

        res.json({ success: true, message: `User status updated to ${isActive}` });
    } catch (err) {
        console.error('Error toggling user status:', err);
        res.status(500).json({ success: false, message: 'Server error toggling status.' });
    }
});

/**
 * POST /api/users/reset-password
 * Admin resets a user's password, updates the DB, sends new credentials via email, and logs the action.
 */
// server.js

// ... (code above)

/**
 * POST /api/users/reset-password
 * Admin resets a user's password, updates the DB with a secure hash, 
 * sends new credentials via email, and logs the action.
 */
app.post('/api/users/reset-password', async (req, res) => {
    const { targetUsername, resetBy } = req.body; 

    try {
        // 1. Fetch target user data (to get email, badge_no, and name)
        const targetUserResult = await pool.query(
            "SELECT email, badge_no, name FROM users WHERE username = $1", 
            [targetUsername]
        );

        if (targetUserResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        
        // Extract target user details
        const { 
            email: userEmail, 
            badge_no: userBadgeNo, 
            name: targetUserName 
        } = targetUserResult.rows[0];
        
        if (!userEmail) {
            return res.status(400).json({ success: false, message: `User's email ID is missing. Cannot send temporary password.` });
        }

        // 1.5. NEW: Fetch the REAL NAME of the Admin (resetBy)
        const adminResult = await pool.query(
            "SELECT name FROM users WHERE username = $1",
            [resetBy]
        );
        // Use the Admin's name, or fall back to their username if the name is not found/null
        const adminName = adminResult.rows[0]?.name || resetBy; 
        
        // 2. Generate and Hash New Password (Code remains unchanged)
        const newPassword = generateRandomPassword(12);
        const hashedPassword = await bcrypt.hash(newPassword, 10); 

        // 3. Database Update (Code remains unchanged)
        await pool.query(
            "UPDATE users SET password = $1 WHERE username = $2",
            [hashedPassword, targetUsername]
        );

        // 4. Email User (New Credentials) - USING ADMIN NAME
        const subject = "RSSB Account Password Reset Successful (Admin Initiated)";
        
        // Use target user's real name in salutation and Admin's real name for 'resetBy'
        const emailBody = `Dear ${targetUserName || targetUsername},

Your password for the RSSB system has been successfully reset by the administration.

Please use the following temporary credentials to log in:
Username: ${targetUsername}
New Password: ${newPassword}

For security purposes, please ensure you change your password immediately upon logging in to the system.

This action was performed by Admin: ${resetBy} (${adminName}).
Timestamp: ${new Date().toLocaleString()}

---

Thank you for using the RSSB system.
You can log in to your account here: https://rssb-rudrapur-database-api.onrender.com

For any other support or queries regarding your account or the system, please contact us at: rssbsecrudrapur@gmail.com

Best regards,
The RSSB Administration Team`;
        
        await sendEmailNotification(userEmail, subject, emailBody); 

        // 5. Action Log (Code remains unchanged)
        await pool.query(
            `INSERT INTO logs (action_type, target_badge_no, actor_username, submission_reason)
             VALUES ($1, $2, $3, $4)`,
            ['PASSWORD_RESET_ADMIN', userBadgeNo, resetBy, `Password reset by Admin ${resetBy} (${adminName}). New temporary password sent via email to ${userEmail}.`]
        );

        res.json({ 
            success: true, 
            message: `Password successfully reset for ${targetUsername}. New temporary credentials have been sent to ${userEmail}.` 
        });

    } catch (error) {
        console.error('Admin password reset error:', error);
        res.status(500).json({ success: false, message: 'Server error while resetting password.' });
    }
});

/**
 * DELETE /api/users/:username
 * Permanently deletes a user account (Assuming ON DELETE CASCADE handles related data).
 */
app.delete('/api/users/:username', async (req, res) => {
    const usernameToDelete = req.params.username;

    try {
        const deleteUserQuery = `
             DELETE FROM users
             WHERE username = $1
             RETURNING username;
        `;
        const result = await pool.query(deleteUserQuery, [usernameToDelete]);

        if (result.rowCount === 0) {
            return res.status(404).send({ message: 'User not found.' });
        }

        // LOG THE ACTION
        await pool.query(
            `INSERT INTO logs (action_type, target_badge_no, actor_username, submission_reason)
             VALUES ($1, $2, $3, $4)`,
            ['USER_DELETED', usernameToDelete, 'ADMIN_PANEL', `User ${usernameToDelete} permanently deleted.`]
        );

        res.status(200).send({ message: `User ${usernameToDelete} permanently deleted successfully.` });

    } catch (error) {
        console.error('Deletion error:', error);
        res.status(500).send({ message: 'Error permanently deleting user.', details: error.detail });
    }
});

// ====================================================
// --- 6. LOGGING API ---
// ====================================================

/**
 * GET /api/logs
 * Fetches system logs with optional filtering by username and action type.
 */
app.get('/api/logs', async (req, res) => {
    const { username, actionType } = req.query;

    let query = `
        SELECT
            log_id, log_timestamp, action_type, actor_username,
            target_badge_no, submission_reason, tracking_id  -- <--- ADDED tracking_id HERE
        FROM logs
        WHERE 1=1
    `;
    const params = [];

    // Username Filter (case-insensitive search)
    if (username && username.trim() !== '') {
        params.push(`%${username.trim()}%`);
        query += ` AND actor_username ILIKE $${params.length}`;
    }

    // Action Type Filter (exact match)
    if (actionType && actionType !== 'All Actions' && actionType.trim() !== '') {
        params.push(actionType);
        query += ` AND action_type = $${params.length}`;
    }

    // Sorting and Limiting (mandatory for large logs)
    query += ' ORDER BY log_timestamp DESC LIMIT 100;';

    try {
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error("Error fetching logs:", error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// ====================================================
// --- 7. PASSWORD RECOVERY APIS (User) ---
// ====================================================

/**
 * POST /api/forgot-password
 * Handles user-initiated password reset via email.
 */
app.post('/api/forgot-password', async (req, res) => {
    const { identifier } = req.body;
    
    if (!identifier) {
        return res.status(400).json({ success: false, message: 'Username or Badge Number is required.' });
    }

    try {
        await pool.query('BEGIN');

        // 1. Fetch user by identifier and necessary details 
        const userResult = await pool.query(
            "SELECT id, username, email, badge_no, name FROM users WHERE username = $1 OR badge_no = $1", 
            [identifier]
        );

        // Security Best Practice: Use a generic message if no user or no email is found
        if (userResult.rows.length === 0 || !userResult.rows[0].email) {
            await pool.query('COMMIT');
            return res.json({ success: true, message: 'If a matching account exists, a password reset link has been sent to the registered email.' });
        }
        
        const user = userResult.rows[0];
        const { username, email, badge_no, name } = user; // Use username for token linking

        // 2. Generate a Secure Token and Expiration (e.g., 1 hour)
        const token = crypto.randomBytes(32).toString('hex');
        const expires_at = new Date(Date.now() + 3600000);

        // 3. Clean up and Save New Token (Using the 'username' column)
        await pool.query("DELETE FROM password_reset_tokens WHERE username = $1", [username]);

        await pool.query(
            `INSERT INTO password_reset_tokens (username, token, expires_at)
             VALUES ($1, $2, $3)`,
            [username, token, expires_at] // Pass username (string)
        );
        
        // 4. Email: Send the Reset Link to the user
        // The reset link now uses 'username'
        const resetLink = `${FRONTEND_URL}/reset-password?username=${username}&token=${token}`;
        const subject = "RSSB Account Password Reset Request";
        
        const emailBody = `Dear ${name},

You requested a password reset for your RSSB system account with username: ${username}..

To complete the process and set a new password, please click the link below:
${resetLink}

This link is valid for 1 hour. If you did not request this, please ignore this email.

---------

Thank you for using the RSSB system.
You can log in to your account here: https://rssb-rudrapur-database-api.onrender.com

For any other support or queries regarding your account or the system, please contact us at: rssbsecrudrapur@gmail.com

Best regards,
The RSSB Administration Team`;
        
        await sendEmailNotification(email, subject, emailBody); 

        // 5. Log the Action
        await pool.query(
            `INSERT INTO logs (action_type, target_badge_no, actor_username, submission_reason)
             VALUES ($1, $2, $3, $4)`,
            ['PASSWORD_RESET_REQUESTED', badge_no, username, `User initiated password reset request. Token generated and link sent to ${email}.`]
        );

        await pool.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'If a matching account exists, a password reset link has been sent to the registered email.' 
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Forgot Password backend error (DB or Email failure):', error);
        
        // Always return a 200 OK with the generic message on internal failures.
        res.status(200).json({ 
             success: true, 
             message: 'If a matching account exists, a password reset link has been sent to the registered email.' 
        });
    }
});

/**
 * POST /api/reset-password
 * Handles the final password update using the token.
 */
app.post('/api/reset-password', async (req, res) => {
    
    // Expect 'username' in the request body, not 'user_id'
    const { username, token, newPassword } = req.body; 

    if (!username || !token || !newPassword) {
        return res.status(400).json({ success: false, message: 'All fields (username, token, new password) are required.' });
    }

    try {
        await pool.query('BEGIN');

        // 1. Find and validate the token (Check token, username, and expiry time)
        const tokenResult = await pool.query(
            `SELECT * FROM password_reset_tokens 
             WHERE username = $1 AND token = $2 AND expires_at > NOW()`,
            [username, token]
        );

        if (tokenResult.rows.length === 0) {
            await pool.query('COMMIT');
            return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
        }
        
        // 2. Hash the New Password
        const hashedPassword = await bcrypt.hash(newPassword, 10); 

        // 3. Update the User's Password using the username
        const updateResult = await pool.query(
            "UPDATE users SET password = $1 WHERE username = $2 RETURNING username, badge_no, email",
            [hashedPassword, username]
        );

        if (updateResult.rows.length === 0) {
             await pool.query('ROLLBACK');
             return res.status(404).json({ success: false, message: 'User not found.' });
        }
        
        const { badge_no, email } = updateResult.rows[0];

        // 4. Invalidate (Delete) the Used Token using the username
        await pool.query(
            "DELETE FROM password_reset_tokens WHERE username = $1",
            [username]
        );

        // 5. Log the Action
        await pool.query(
            `INSERT INTO logs (action_type, target_badge_no, actor_username, submission_reason)
             VALUES ($1, $2, $3, $4)`,
            ['PASSWORD_RESET_COMPLETED', badge_no, username, `Password reset successfully completed using a token.`]
        );
        
        await pool.query('COMMIT');

        res.json({ 
            success: true, 
            message: 'Your password has been reset successfully. You can now log in with your new password.' 
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Reset Password backend error:', error);
        res.status(500).json({ success: false, message: 'Server error during password update process.' });
    }
});

/**
 * POST /api/change-password
 * Allows a logged-in user to change their password using their old password.
 */
app.post('/api/change-password', async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    if (!username || !oldPassword || !newPassword) {
        return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    try {
        await pool.query('BEGIN');
        
        // 1. Fetch current hash and verify old password
        const userResult = await pool.query(
            "SELECT password, badge_no FROM users WHERE username = $1",
            [username]
        );

        if (userResult.rows.length === 0) {
            await pool.query('COMMIT'); 
            return res.status(401).json({ success: false, message: 'Authentication failed.' });
        }
        
        const user = userResult.rows[0];
        const storedHash = user.password;
        const badgeNo = user.badge_no;

        const isMatch = await bcrypt.compare(oldPassword, storedHash);

        if (!isMatch) {
            await pool.query('COMMIT'); 
            return res.status(401).json({ success: false, message: 'The current password provided is incorrect.' });
        }
        
        // 2. Hash the new password
        const newHashedPassword = await bcrypt.hash(newPassword, 10);

        // 3. Update password in the database
        await pool.query(
            "UPDATE users SET password = $1 WHERE username = $2",
            [newHashedPassword, username]
        );
        
        // 4. Log the action
        await pool.query(
            `INSERT INTO logs (action_type, target_badge_no, actor_username, submission_reason)
             VALUES ($1, $2, $3, $4)`,
            ['PASSWORD_CHANGED_USER', badgeNo, username, `User successfully changed their password.`]
        );

        await pool.query('COMMIT');
        
        res.json({ success: true, message: 'Password updated successfully! Please log in with your new password.' });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('User Change Password error:', error);
        res.status(500).json({ success: false, message: 'Server error during password change.' });
    }
});


// --- START THE SERVER ---
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});