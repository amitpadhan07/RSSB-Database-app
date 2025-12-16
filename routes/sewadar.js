// File: routes/sewadar.js

const express = require('express');
const router = express.Router();

// Yeh ek wrapper function hai jo pool (PG), io (Socket.IO) aur helper function receive karta hai
module.exports = (pool, io, sendNotificationToUser) => {

    // --- UTILITY FUNCTION: COMPREHENSIVE LOGGING ---
    // Har action ko logs table mein record karega
    async function logSewadarAction(trackingID, actionType, targetBadge, details, actorUsername) {
        try {
            await pool.query(
                `INSERT INTO logs (tracking_id, action_type, target_badge_no, record_snapshot, actor_username, submission_reason) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    trackingID, 
                    actionType, 
                    targetBadge || 'N/A', 
                    JSON.stringify(details), // Full data snapshot
                    actorUsername,
                    details.reason || 'Sewadar Action'
                ]
            );
        } catch (error) {
            console.error('CRITICAL LOGGING ERROR:', error);
            // Logging fail hone par server crash nahi hona chahiye, isliye try/catch use kiya
        }
    }

    // =======================================================
    // 1. POST: Mark Attendance (Haziri Lagana)
    // =======================================================
    router.post('/mark-attendance', async (req, res) => {
        // Frontend se data nikalna
        const { username, status, timestamp, location, trackingID } = req.body;
        
        // --- 1. Validation ---
        if (!username || !status || !timestamp) {
            return res.status(400).json({ success: false, message: 'Username, status, and timestamp are required.' });
        }

        try {
            // --- 2. Database Record (Nayi table 'sewadar_attendance' mein record daalna) ---
            const result = await pool.query(
                `INSERT INTO sewadar_attendance (username, status, check_in_time, location) 
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [username, status, timestamp, location || 'Not Provided']
            );

            // --- 3. Comprehensive Logging (Har haziri ko log karna) ---
            const newAttendance = result.rows[0];
            await logSewadarAction(
                trackingID, // Frontend se aaya hua ID
                'SEWADAR_ATTENDANCE_MARKED',
                username, // Target ID username hai
                { status: status, location: location, attendanceId: newAttendance.id },
                username
            );
            
            // --- 4. Real-Time Notification (Admin ko confirmation) ---
            // 'admin_room' ki jagah, hum Admin ko specific ID se target kar sakte hain
            io.emit('new_attendance_marked', { username: username, time: timestamp, status: status }); 
            
            res.json({ success: true, message: 'Attendance recorded successfully.', record: newAttendance });

        } catch (err) {
            console.error('Attendance marking error:', err);
            res.status(500).json({ success: false, message: 'Database error during attendance recording.' });
        }
    });

    // =======================================================
    // 2. GET: Upcoming Sewa/Duty
    // =======================================================
    router.get('/upcoming-sewa', async (req, res) => {
        const username = req.query.user;
        
        try {
            // NOTE: Yahan hum database se upcoming sewa ka data fetch karenge
            const result = await pool.query(
                `SELECT sewa_id, duty_name, scheduled_time, location, is_urgent 
                 FROM sewa_schedule 
                 WHERE assigned_user = $1 AND scheduled_time > NOW() 
                 ORDER BY scheduled_time ASC`,
                [username]
            );

            // Log: Sewadar ne apna schedule dekha
            // logSewadarAction('N/A', 'SEWADAR_VIEW_SCHEDULE', username, { status: 'viewed', count: result.rows.length }, username);

            // Data ko frontend format mein map kiya (Agar zaroori ho)
            const formattedSewa = result.rows.map(row => ({
                sewaId: row.sewa_id,
                dutyName: row.duty_name,
                dateTime: row.scheduled_time, // ISO string
                location: row.location,
                isUrgent: row.is_urgent
            }));

            res.json(formattedSewa);

        } catch (err) {
            console.error('Upcoming Sewa fetch error:', err);
            // Dummy data hata diya, ab proper error handling use hoga
            res.status(500).json({ success: false, message: 'Error fetching upcoming sewa details.' });
        }
    });


    // =======================================================
    // 3. GET: Past Attendance
    // =======================================================
    router.get('/past-attendance', async (req, res) => {
        const username = req.query.user;
        
        try {
            // NOTE: Yahan hum database se past attendance ka data fetch karenge
            const result = await pool.query(
                `SELECT check_in_time, status, location
                 FROM sewadar_attendance 
                 WHERE username = $1 
                 ORDER BY check_in_time DESC 
                 LIMIT 30`, // Pichle 30 records
                [username]
            );

            // Data ko frontend format mein map kiya
            const formattedAttendance = result.rows.map(row => ({
                date: row.check_in_time,
                status: row.status,
                time: new Date(row.check_in_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
            }));

            res.json(formattedAttendance);

        } catch (err) {
            console.error('Past Attendance fetch error:', err);
            res.status(500).json({ success: false, message: 'Error fetching past attendance details.' });
        }
    });

    // Final router object return kiya
    return router;
};