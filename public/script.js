// Global BASE_URL variable.
const BASE_URL = 'https://rssb-rudrapur-database-api.onrender.com';

// Global user object update karein
var CURRENT_USER = {}; 

// INITIAL DATABASE (Aapka Purana Data Structure)
const database = {
    records: [],
    count: 0,
    filteredRecords: [],
    selectedRecords: new Set()
};

// -------------------- CORE UTILITIES --------------------

function getFormattedDate() {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = String(today.getFullYear()).slice(-2);
    return `${d}${m}${y}`;
}

function generateRequestID(type, badgeNo, username) {
    const datePart = getFormattedDate();
    let prefix;
    switch (type.toUpperCase()) {
        case 'ADD': prefix = 'AD'; break;
        case 'UPDATE': prefix = 'UD'; break;
        case 'DELETE': prefix = 'DD'; break;
        default: prefix = 'ERR'; 
    }
    return `${prefix}/${datePart}/${badgeNo}/${username}`;
}

function getLoggedInUsername() {
    return CURRENT_USER.username || document.getElementById("username").value; 
}

function formatBadgeNumber(inputId) {
    let input = document.getElementById(inputId);
    let value = input.value.trim().toUpperCase();

    if (!value.startsWith("AM-")) {
        value = value.replace(/[^0-9]/g, '');
        value = `AM-${value}`;
        input.value = value;
    }
}

// -------------------- DATA & UI MANAGEMENT --------------------

async function initializeDatabase() {
    try {
        const response = await fetch(`${BASE_URL}/api/records`);
        if (!response.ok) {
            throw new Error('Failed to fetch records from the server.');
        }
        const data = await response.json();
        database.records = data;
        database.filteredRecords = [...data];
        database.count = data.length;
        if (typeof updateTable === 'function') updateTable();
    } catch (err) {
        console.error("Error loading records:", err);
        alert("Failed to load database. See console.");
    }
}

async function showAllRecords() {
    try {
        const response = await fetch(`${BASE_URL}/api/records`);
        if (!response.ok) {
            throw new Error('Failed to fetch records from the server.');
        }
        const records = await response.json();
        database.records = records;
        database.filteredRecords = records;
        
        if (typeof updateTable === 'function') updateTable(); 
    } catch (error) {
        console.error('Error in showAllRecords:', error);
        alert('Failed to load records. Please check the console for more details.');
    }
}

function updateTable() {
    // Current user ke role ke hisaab se sahi table body ID choose karein
    const tableBodyId = CURRENT_USER.role === 'admin' ? 'admin-records-body' : 'user-records-body';
    
    // Attempt to get the correct table body
    let tbody = document.getElementById(tableBodyId);

    // Fallback logic for robustness
    if (!tbody) {
        if (CURRENT_USER.role === 'admin' && document.getElementById('admin-dashboard')?.style.display === 'flex') {
             tbody = document.getElementById('admin-records-body');
        } else if (CURRENT_USER.role === 'user' && document.getElementById('user-dashboard')?.style.display === 'flex') {
             tbody = document.getElementById('user-records-body');
        }
    }
    
    if (!tbody) {
        console.warn(`Warning: Could not find active table body for role: ${CURRENT_USER.role}`);
        return;
    }
    
    fillTableContent(tbody);

    // Inner function to avoid repetition
    function fillTableContent(targetTbody) {
        targetTbody.innerHTML = '';
        
        const recordsToDisplay = database.filteredRecords; // Data source
        
        if (recordsToDisplay.length === 0) {
            targetTbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">No records found.</td></tr>'; 
            return;
        }
        
        recordsToDisplay.forEach((record, i) => { // <-- 'record' is correctly defined here
            
            // 🛑 CRITICAL FIX: Image Source ko loop ke andar define kiya
            // Aur BASE_URL ke saath jod kar path theek kiya
            const imageSrc = record.pic && record.pic !== 'demo.png' 
                ? `${BASE_URL}/${record.pic}` 
                : 'demo.png';

            const isSelected = database.selectedRecords.has(record.badge_no);
            const row = document.createElement('tr');
            if (isSelected) row.classList.add('selected-row');
            
            row.innerHTML = `
                <td><input type="checkbox" class="record-checkbox" data-badge-no="${record.badge_no}" ${isSelected ? 'checked' : ''} onchange="toggleRecordSelection(this)"></td>
                <td>${i + 1}</td>
                <td>${record.badge_type || ''}</td>
                <td>${record.badge_no || ''}</td>
                
                <td><img src="${imageSrc}" alt="pic" style="height:50px;width:50px;border-radius:50%;"></td> <td>${record.name || ''}</td>
                <td>${record.parent_name || ''}</td>
                <td>${record.gender || ''}</td>
                <td>${record.phone || ''}</td>
                <td>${formatDateDDMMYYYY(record.birth_date) || ''}</td>
                <td>${calculateAge(formatDateDDMMYYYY(record.birth_date))}</td>
                <td>${record.address || ''}</td>
                <td>
                    <button onclick="showMemberActions('${record.badge_no}')">Action</button>
                </td>
            `;
            targetTbody.appendChild(row);
        });
    }
}

// -------------------- AUTHENTICATION & REDIRECTION --------------------

async function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        const result = await response.json();

        if (result.success) {
            CURRENT_USER = { role: result.role, username: username }; 
            
            document.getElementById("login-screen").style.display = "none";
            alert("Login successful!");
            
            if (CURRENT_USER.role === 'admin') {
                document.getElementById("admin-dashboard").style.display = "flex"; 
                showAdminSection('view-section'); 
            } else if (CURRENT_USER.role === 'user') {
                document.getElementById("user-dashboard").style.display = "flex"; 
                showUserSection('user-view-section'); 
            }
            
            await initializeDatabase(); 
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('An error occurred during login. Please try again.');
    }
}

function logout() {
    CURRENT_USER = {};
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("admin-dashboard").style.display = "none";
    document.getElementById("user-dashboard").style.display = "none";
    alert('Logout Successful!');
}


// -------------------- DASHBOARD DISPLAY FUNCTIONS --------------------

// script.js mein existing showAdminSection function ko update karein:
function showAdminSection(sectionId) {
    const sections = document.querySelectorAll('#admin-dashboard .content-area section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
    
    const requestedSection = document.getElementById(sectionId);
    if (requestedSection) {
        requestedSection.style.display = 'block';
    }
    
    if (sectionId === 'view-section') {
        showAllRecords(); // View All records
    } 
    
    // ✅ FIX: Requests management section open hone par data fetch karein
    else if (sectionId === 'manage-requests-section') { 
        // LoadPendingRequests function ko call kiya
        loadPendingRequests(); 
    }

    // Naya logic yahan add karein:
    if (sectionId === 'manage-users-section') {
        // Default: Add User section open rakhte hain, ya ek naya 'view-users' section bana sakte ho.
        // Hum maan rahe hain ki Manage Users button click karne par default 'view-users-list' section khulega.
        const defaultUserSection = document.getElementById('view-users-list-section');
        
        // Ensure only one sub-section is visible on first click:
        document.querySelectorAll('#manage-users-content section').forEach(sec => sec.style.display = 'none');
        
        if (defaultUserSection) {
            defaultUserSection.style.display = 'block';
            viewAllUsers(); // Tab khulte hi user list load karein
        }
    }
}


function showUserSection(sectionId) {
    // 1. User Dashboard ke sabhi sections ko select karein
    const sections = document.querySelectorAll('#user-dashboard .content-area section');
    
    // 2. Sabhi sections ko hide (display: none) karein
    sections.forEach(section => {
        section.style.display = 'none';
    });
    
    // 3. Request ki gayi section ko dhundhein aur show karein
    const requestedSection = document.getElementById(sectionId);
    if (requestedSection) {
        requestedSection.style.display = 'block';
    }

    // Yahan trigger logic aayega
    if (sectionId === 'user-view-section') {
        // showAllRecords(); // Agar zaruri ho to uncomment karein
    } 
    
    // ✅ FIX: Trigger logic for 'View My Requests'
    else if (sectionId === 'user-requests-section') {
        fetchAndRenderUserRequests();
    }
}

function setupDashboardListeners() {
    // Admin Dashboard Button Listeners
    document.getElementById('add-member-btn')?.addEventListener('click', () => showAdminSection('add-section'));
    document.getElementById('view-members-btn')?.addEventListener('click', () => showAdminSection('view-section'));
    document.getElementById('print-list-btn')?.addEventListener('click', () => showAdminSection('print-list-section'));
    document.getElementById('manage-requests-btn')?.addEventListener('click', () => showAdminSection('manage-requests-section'));
    document.getElementById('manage-users-btn')?.addEventListener('click', () => showAdminSection('manage-users-section'));

    document.getElementById('add-user-btn')?.addEventListener('click', () => { showAdminSection('manage-users-section'); document.getElementById('add-user-section').style.display = 'block'; });
    document.getElementById('manage-password-btn')?.addEventListener('click', () => { showAdminSection('manage-users-section'); document.getElementById('manage-password-section').style.display = 'block'; });
    document.getElementById('view-logs-btn')?.addEventListener('click', () => { showAdminSection('manage-users-section'); document.getElementById('view-logs-section').style.display = 'block'; });

    // User Dashboard Button Listeners
    document.getElementById('user-add-member-btn')?.addEventListener('click', () => showUserSection('user-add-section'));
    document.getElementById('user-view-members-btn')?.addEventListener('click', () => showUserSection('user-view-section'));
    document.getElementById('user-print-list-btn')?.addEventListener('click', () => showUserSection('user-print-list-section'));
    document.getElementById('user-manage-requests-btn')?.addEventListener('click', () => showUserSection('user-requests-section'));
}

// -------------------- USER ACCOUNT MANAGEMENT (ADMIN SECTION) --------------------

// 1.1: ADMIN ADD NEW USER (Existing, for context)
async function adminAddUser() {
    const badgeNo = document.getElementById('add-user-badge').value.trim().toUpperCase();
    const username = document.getElementById('add-user-username').value.trim();
    const password = document.getElementById('add-user-password').value.trim();
    const role = document.getElementById('add-user-role').value;
    const addedBy = CURRENT_USER.username || 'ADMIN_DIRECT';
    const email = document.getElementById('add-user-email').value.trim();
    
if (!badgeNo || !username || !password || !role) {
        return alert('All fields are required.');
    }
   if (!badgeNo || !username || !password || !role || !email) {
        return alert('All fields including Email are required.');
    }
    if (password.length < 6) return alert('Password kam se kam 6 characters ka hona chahiye.');

    try {
        const response = await fetch(`${BASE_URL}/api/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ username, password, role, addedBy, badgeNo, email }) 
        });

        const result = await response.json();

        if (result.success) {
        alert(`User '${username}' added successfully!`);
        
        // 🛑 FIX 1: Optional Chaining ka use karke form reset karein
        document.getElementById('add-user-form')?.reset();
        
        // 🛑 FIX 2: User ko list view par redirect karein
        // Isse woh 'Add User' screen se hatkar 'View All Users' list par chala jayega.
        if (typeof showUserSubSection === 'function') {
            showUserSubSection('view-users-list-section');
        }
        
        // 🛑 FIX 3: List ko refresh karein
        if (typeof viewAllUsers === 'function') {
            viewAllUsers();
        }
        
    } else {
        alert(result.message);
    }
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Server se connectivity mein galti aayi. Check console.');
    }
}

// 1.2, 2.3: VIEW ALL USERS + LAST LOGIN / STATUS
// script.js - 1.2, 2.3: VIEW ALL USERS + LAST LOGIN / STATUS
async function viewAllUsers() {
    const container = document.getElementById('users-list-container');
    if (!container) return console.error("User list container missing (#users-list-container).");

    container.innerHTML = '<h2><i class="fa fa-spinner fa-spin"></i> Loading Users...</h2>';

    try {
        // API call to fetch all users
        const response = await fetch(`${BASE_URL}/api/users/all`);
        if (!response.ok) throw new Error('Failed to fetch user list.');

        const users = await response.json();

        if (users.length === 0) {
            container.innerHTML = '<h2>No users found in the system.</h2>';
            return;
        }

        let tableHTML = `
           <table class="users-table wide-table" style="min-width: 100%;">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Username</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Last Login</th>
                        <th style="min-width: 150px;">Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        users.forEach(user => {
            const statusText = user.is_active ? 'Active' : 'Disabled';
            const statusClass = user.is_active ? 'status-active' : 'status-disabled';
            const lastLogin = user.last_login ? new Date(user.last_login).toLocaleString('en-IN', { timeStyle: 'short', dateStyle: 'short' }) : 'Never';
            
            const isCurrentUser = user.username === CURRENT_USER.username;

            tableHTML += `
                <tr>
                    
                    <td>${user.name || 'N/A'}</td>
                    <td>${user.username}</td>  <td>
                        <select id="role-select-${user.username}" onchange="updateUserRole('${user.username}', this.value)" ${isCurrentUser ? 'disabled' : ''}>
                            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                        </select>
                    </td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                    <td>${lastLogin}</td>
                    <td>
                        ${isCurrentUser ? '<span style="color: gray;">(Current User)</span>' : 
                        `
                            <button onclick="viewUserDetails('${user.username}')" class="btn-secondary" style="margin-bottom: 5px;">
                                View Details
                            </button>
                            <button onclick="deleteUser('${user.username}', ${user.is_active})" class="${user.is_active ? 'btn-disable' : 'btn-enable'}">
                                ${user.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button onclick="permanentlyDeleteUser('${user.username}')" class="btn-delete" title="Permanent Delete">
                                Delete
                            </button>
                        `}
                    </td>
                </tr>
            `;
        });

        tableHTML += '</tbody></table>';
        container.innerHTML = tableHTML;

    } catch (error) {
        console.error('Error fetching users:', error);
        container.innerHTML = `<h2>Error loading user list. Check console.</h2>`;
    }
}




// 1.2.1 🛑 NEW: Function for Permanent Deletion (CRITICAL ACTION)
async function permanentlyDeleteUser(targetUsername) {
    if (!confirm(`WARNING: Are you sure you want to PERMANENTLY DELETE user ${targetUsername}? This action cannot be undone and will remove all their logs/requests.`)) {
        return;
    }
    
    // Final warning for high-security action
    const finalConfirm = prompt(`TYPE the username "${targetUsername}" to confirm permanent deletion:`);
    if (finalConfirm !== targetUsername) {
        return alert("Deletion cancelled. Username did not match.");
    }

    try {
        const response = await fetch(`${BASE_URL}/api/users/delete-permanent`, {
            method: 'DELETE', // DELETE method use kiya
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername, deletedBy: CURRENT_USER.username }), // 🛑 FIX: Ensure comma is present here
        });

        // Backend fix: Agar 500 error aaye, to detailed message show karo
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown server error (check console)' }));
            throw new Error(`Deletion Failed: ${errorData.message}`);
        }

        const result = await response.json();

        if (result.success) {
            alert(`User ${targetUsername} permanently deleted!`);
            viewAllUsers(); // List refresh karein
        } else {
            alert(`Deletion failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error during permanent deletion:', error);
        alert(`Deletion failed! ${error.message || 'Check console for network error.'}`);
    }
}

// 1.3: EDIT / UPDATE ROLE
async function updateUserRole(targetUsername, newRole) {
    if (!confirm(`Confirm: Change role of user ${targetUsername} to ${newRole}?`)) {
        // Agar user cancel karta hai, toh dropdown ko purane value par reset karein
        viewAllUsers(); 
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/users/update-role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername, newRole, updatedBy: CURRENT_USER.username })
        });

        const result = await response.json();

        if (result.success) {
            alert(`Role of ${targetUsername} successfully updated to ${newRole}!`);
            viewAllUsers(); // List refresh karein
        } else {
            alert(`Role update mein galti: ${result.message}`);
        }
    } catch (error) {
        console.error('Error updating role:', error);
        alert('Role update karte samay network error aaya.');
    }
}

// 1.4: DISABLE / ENABLE USER (Permanent Delete se behtar hai disable karna)
async function deleteUser(targetUsername, isCurrentlyActive) {
    const action = isCurrentlyActive ? 'DISABLE' : 'ENABLE';
    
    if (!confirm(`Confirm: ${action} user ${targetUsername}?`)) return;

    try {
        const response = await fetch(`${BASE_URL}/api/users/toggle-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername, isActive: !isCurrentlyActive, updatedBy: CURRENT_USER.username })
        });

        const result = await response.json();

        if (result.success) {
            alert(`User ${targetUsername} successfully ${action}D!`);
            viewAllUsers(); // List refresh karein
        } else {
            alert(`${action} karne mein galti: ${result.message}`);
        }
    } catch (error) {
        console.error('Error disabling/enabling user:', error);
        alert('Network error during user status change.');
    }
}

// 1.5: ADMIN PASSWORD RESET (Existing, for context)
async function adminResetPassword() {
    const targetUsername = document.getElementById('reset-username').value.trim();
    const newPassword = document.getElementById('reset-new-password').value.trim();
    const resetBy = CURRENT_USER.username || 'ADMIN_DIRECT';

    if (!targetUsername || !newPassword) return alert('Username aur New Password zaroori hain.');
    if (newPassword.length < 6) return alert('Naya Password kam se kam 6 characters ka hona chahiye.');

    try {
        const response = await fetch(`${BASE_URL}/api/users/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername, newPassword, resetBy })
        });

        const result = await response.json();

        if (result.success) {
            alert(`Password for user '${targetUsername}' successfully reset!`);
            document.getElementById('reset-password-form').reset();
        } else {
            alert(`Password reset karne mein galti: ${result.message}`);
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        alert('Server se connectivity mein galti aayi. Check console.');
    }
}

//1.6 - New Function to show User Account Details
async function viewUserDetails(username) {
    if (!username) return alert("Error: Username missing.");

    const listSection = document.getElementById('view-users-list-section');
    const detailSection = document.getElementById('user-account-detail-section');
    
    // UI State Switch: List chhipao, Detail section dikhao
    listSection.style.display = 'none';
    detailSection.style.display = 'block';
    
    detailSection.innerHTML = '<h2>Loading User Details...</h2>'; 

    try {
        // Backend API call to fetch a single user's complete data
        const response = await fetch(`${BASE_URL}/api/user/${username}`); 
        if (!response.ok) throw new Error('User details not found.');
        
        const user = await response.json();
        
        // Pic URL ko theek kiya, taaki agar sirf file ka naam ho toh BASE_URL use ho
        const userPicUrl = user.pic && user.pic.startsWith('http') ? user.pic : `${BASE_URL}/${user.pic}`;
        // Default pic agar user.pic null/undefined ho
        const finalPicSrc = user.pic ? userPicUrl : 'demo.png'; 

        // 🛑 FIX: Inline Styling aur Layout aapki image jaisa
        detailSection.innerHTML = `
            <button onclick="goBackToUserList()" style="float:right; margin-bottom: 20px;">Go Back</button>
            
            <div style="
                border: 2px solid #5cb85c; 
                padding: 20px; 
                max-width: 400px; 
                background-color: #f9fff9; 
                border-radius: 5px;
                color: #333;
                box-shadow: 0 0 5px rgba(0,0,0,0.1);
            ">
                <h3 style="margin-top: 0; border-bottom: 1px solid #5cb85c; padding-bottom: 10px; color: #333;">
                    Account Details
                </h3>

                <div style="text-align: center; margin-bottom: 15px;">
                    <p style="margin: 0; font-weight: bold;">Picture:</p>
                    <img src="${finalPicSrc}" alt="${user.name} Profile Pic" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #ccc; margin-top: 5px;">
                </div>

                <p><strong>Username:</strong> ${user.username}</p>
                <p><strong>Name:</strong> ${user.name || 'N/A'}</p>
                <p><strong>Role:</strong> ${user.role}</p>
                <p><strong>Status:</strong> <span style="color: ${user.is_active ? 'green' : 'red'}; font-weight: bold;">${user.is_active ? 'Active' : 'Disabled'}</span></p>
                <hr style="border: 0; border-top: 1px dashed #ccc;">
                
                <p><strong>Badge No:</strong> ${user.badge_no || 'N/A'}</p>
                <p><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
                <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
                <p><strong>Address:</strong> ${user.address || 'N/A'}</p>
                <p><strong>Last Login:</strong> ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</p>
            </div>
        `;

    } catch (error) {
        console.error('Error fetching user details:', error);
        detailSection.innerHTML = `
            <h2>Error loading details.</h2>
            <p style="color: red;">${error.message}</p>
            <button onclick="goBackToUserList()">Go Back</button>
        `;
    }
}

//1.7 Function to handle switching between sub-sections within Manage Users
function showUserSubSection(sectionId) {
    // Manage Users ke sabhi inner sections ko select karein
    const sections = document.querySelectorAll('#manage-users-content section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
    
    // Requested section ko show karein
    const requestedSection = document.getElementById(sectionId);
    if (requestedSection) {
        requestedSection.style.display = 'block';
    }
}

// Function to go back from the detail view
function goBackToUserList() {
    // Current section ko hide karo
    document.getElementById('user-account-detail-section').style.display = 'none';
    // User List section ko wapas show karo
    document.getElementById('view-users-list-section').style.display = 'block'; 
}
// -------------------- LOGGING SYSTEM (ADMIN) --------------------

// Global variable to hold logs data for filtering
let ALL_SYSTEM_LOGS = []; 

// Main function to fetch and display logs
async function viewLogs() {
    const container = document.getElementById('logs-list-container');
    const filterUser = document.getElementById('log-filter-user')?.value.trim().toUpperCase() || '';
    const filterAction = document.getElementById('log-filter-action')?.value.toUpperCase() || '';
    
    if (!container) return console.error("Logs container missing (#logs-list-container).");

    container.innerHTML = '<h2><i class="fa fa-spinner fa-spin"></i> Loading System Logs...</h2>';

    try {
        // 1. Fetch data only if not already loaded (simple caching)
        if (ALL_SYSTEM_LOGS.length === 0) {
            // Humne server-side filtering ko client-side mein shift kiya hai, so we fetch ALL
            const response = await fetch(`${BASE_URL}/api/logs`); 
            if (!response.ok) throw new Error('Failed to fetch logs.');
            ALL_SYSTEM_LOGS = await response.json();
            
            // NOTE: Agar server-side filtering band karke simple SELECT * FROM logs ORDER BY... kar diya hai,
            //       toh yeh caching method theek kaam karega.
        }
        
        // 2. Apply Filtering (on the client-side for simplicity)
        const filteredLogs = ALL_SYSTEM_LOGS.filter(log => {
            // 🛑 FIX 1: log.actor_user ko log.actor_username se badla gaya hai
            const matchesUser = log.actor_username && log.actor_username.toUpperCase().includes(filterUser);
            const matchesAction = filterAction === '' || log.action_type.toUpperCase() === filterAction;
            return matchesUser && matchesAction;
        });

        // 3. Render the filtered logs
        renderLogsTable(filteredLogs, container);

    } catch (error) {
        console.error('Error fetching logs:', error);
        container.innerHTML = `<h2>Error loading logs. Check console.</h2>`;
    }
}

// Helper function to render the logs table
function renderLogsTable(logs, container) {
    if (logs.length === 0) {
        container.innerHTML = '<h2>No log entries found matching the criteria.</h2>';
        return;
    }

    let tableHTML = `
        <table class="logs-table">
            <thead>
                <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action Type</th>
                    <th>Description</th>
                    <th>Tracking ID</th>
                </tr>
            </thead>
            <tbody>
    `;

    logs.forEach(log => {
        // 🛑 FIX 2: log.timestamp ko log.log_timestamp se badla gaya hai
        const logDate = new Date(log.log_timestamp).toLocaleString('en-IN', {
            dateStyle: 'short',
            timeStyle: 'medium'
        });

        tableHTML += `
            <tr>
                <td>${logDate}</td>
                
                <td>${log.actor_username || 'SYSTEM'}</td> 
                
                <td><span class="log-type log-type-${log.action_type ? log.action_type.toLowerCase().replace(/ /g, '-') : 'other'}">${log.action_type || 'N/A'}</span></td>
                
                <td>${log.submission_reason || 'N/A'}</td> 
                
                <td>${log.tracking_id || 'N/A'}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    container.innerHTML = tableHTML;
}

// Function to refresh logs (clears cache and fetches again)
function refreshLogs() {
    ALL_SYSTEM_LOGS = []; // Clear cache
    viewLogs(); // Re-run the main function
}

// -------------------- APPROVAL HELPERS --------------------

function getFormattedDate() {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = String(today.getFullYear()).slice(-2);
    return `${d}${m}${y}`;
}

function generateRequestID(type, badgeNo, username) {
    const datePart = getFormattedDate();
    let prefix;
    switch (type.toUpperCase()) {
        case 'ADD': prefix = 'AD'; break;
        case 'UPDATE': prefix = 'UD'; break;
        case 'DELETE': prefix = 'DD'; break;
        default: prefix = 'ERR'; 
    }
    return `${prefix}/${badgeNo}/${datePart}/${username}`;
}

function getLoggedInUsername() {
    return CURRENT_USER.username || document.getElementById("username").value; 
}


// -------------------- CORE CRUD LOGIC --------------------

// 1. USER SUBMISSION LOGIC (Approval Queue)
async function submitRecordRequest() {
    const currentUsername = getLoggedInUsername();

    // --- 1. Data Collection ---
    const badgeType = document.getElementById('user-add-badge-type').value.trim().toUpperCase();
    const badgeNo = document.getElementById('user-add-badge').value.trim().toUpperCase();
    const name = document.getElementById('user-add-name').value.trim().toUpperCase();
    const parent = document.getElementById('user-add-parent').value.trim().toUpperCase();
    const gender = document.getElementById('user-add-gender').value;
    const phone = document.getElementById('user-add-phone').value.trim();
    const birthRaw = document.getElementById('user-add-birth').value;
    const address = document.getElementById('user-add-address').value.trim().toUpperCase();
    const picInput = document.getElementById('user-add-pic');
    const reason = document.getElementById('user-add-reason').value.trim(); 
    
    // --- 2. Validation (Code Same Rahega) ---
    if (!reason || reason.length < 5) return alert('Submission ka kaaran batana zaroori hai (min 5 characters).');
    if (!badgeType) return alert('Please select a badge type!');
    if (!/^[A-Z]{2}-\d{6}$/.test(badgeNo)) return alert('Badge number must be in format "AM-123456"!');
    if (!badgeNo || !name || !parent || !phone || !birthRaw || !address) return alert('All fields are required!');
    if (!/^\d{10}$/.test(phone)) return alert('Phone must be 10 digits!');
    
    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; 
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // --- 3. ID Generation & FormData Assembly ---
    const requestID = generateRequestID('ADD', badgeNo, currentUsername);
    
    const formData = new FormData();
    formData.append('type', 'ADD'); 
    formData.append('username', currentUsername); 
    formData.append('reason', reason); 
    formData.append('requestID', requestID); 
    formData.append('badgeType', badgeType);
    formData.append('badgeNo', badgeNo);
    formData.append('name', name);
    formData.append('parent', parent);
    formData.append('gender', gender);
    formData.append('phone', phone);
    formData.append('birth', birth); 
    formData.append('address', address);
    
    if (picInput.files.length > 0) {
        formData.append('pic', picInput.files[0]);
    }

    // --- 4. API Call to Moderation Queue ---
    try {
        const response = await fetch(`${BASE_URL}/api/submit-request`, {
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            const errorData = await response.json(); 
            alert(`Record NOT submitted! Error: ${errorData.message}`);
            return;
        }

        const result = await response.json();
        
        if (result.success) {
            // SUCCESS LOGIC: Alert ko pehle dikhayenge
            alert('Request submitted for Admin approval! Request ID: ' + requestID);
            
            // Database reload ko background mein chalao (No 'await' needed)
            initializeDatabase(); 
            
            // Form reset aur Section switch
            document.getElementById('user-add-record-form').reset();
            showUserSection('user-requests-section'); 
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('Request bhejte samay galti hui. Kripya console check karein.');
    }
}

// 2. ADMIN DIRECT ADD LOGIC (Direct to DB)
async function adminAddRecord() {
    // --- Data Collection ---
    const badgeType = document.getElementById('add-badge-type').value.trim().toUpperCase();
    const badgeNo = document.getElementById('add-badge').value.trim().toUpperCase();
    const name = document.getElementById('add-name').value.trim().toUpperCase();
    const parent = document.getElementById('add-parent').value.trim().toUpperCase();
    const gender = document.getElementById('add-gender').value;
    const phone = document.getElementById('add-phone').value.trim();
    const birthRaw = document.getElementById('add-birth').value;
    const address = document.getElementById('add-address').value.trim().toUpperCase();
    const picInput = document.getElementById('add-pic');
    
    // --- Validation ---
    if (!badgeType) return alert('Please select a badge type!');
    if (!/^[A-Z]{2}-\d{6}$/.test(badgeNo)) return alert('Badge number must be in format "AM-123456"!');
    if (!badgeNo || !name || !parent || !phone || !birthRaw || !address) return alert('All fields are required!');
    if (!/^\d{10}$/.test(phone)) return alert('Phone must be 10 digits!');
    
    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD format for backend
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // --- Tracking ID Generation (Frontend se generated) ---
    const adminTrackingID = generateRequestID('ADD', badgeNo, 'ADMIN_DIRECT'); // 'ADMIN_DIRECT' is actor username
    
    const formData = new FormData();
    formData.append('badgeType', badgeType);
    formData.append('badgeNo', badgeNo);
    formData.append('name', name);
    formData.append('parent', parent);
    formData.append('gender', gender);
    formData.append('phone', phone);
    formData.append('birth', birth);
    formData.append('address', address);
    formData.append('adminTrackingID', adminTrackingID); // Logging ke liye backend ko bheja
    
    if (picInput.files.length > 0) {
        formData.append('pic', picInput.files[0]);
    }

    // --- API Call: Direct to Database (Robust Handling) ---
    try {
        const response = await fetch(`${BASE_URL}/api/records`, { 
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            // Error Handling for 409 (Duplicate Key) or 500 (Server Crash)
            const errorData = await response.json(); 
            alert(`Record NOT added! Error: ${errorData.message}`);
            return;
        }

        const result = await response.json();
        
        if (result.success) {
            // SUCCESS LOGIC: Alert ko pehle dikhayein
            alert('Record successfully added directly to the database! Tracking ID: ' + adminTrackingID);
            
            // Database reload ko background mein chalao (No 'await' needed)
            initializeDatabase(); 
            
            // Form reset aur Screen switch
            document.getElementById('add-record-form').reset();
            showAdminSection('view-section'); // Wapas View All Records par bhej diya
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error adding record:', error);
        alert('An error occurred. Check console.');
    }
}

// Function to handle click on 'Update Record' button

// Function to handle click on 'Update Record' button
async function editMember(badgeNo) {
    if (!badgeNo) return alert("Error: Badge Number missing.");

    try {
        const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`);
        if (!response.ok) throw new Error('Record not found.');
        const record = await response.json();
        
        const role = CURRENT_USER.role;

        // 1. Original badgeNo ko hidden input mein store karein
        const originalBadgeNoInput = document.getElementById(role === 'admin' ? 'admin-update-original-badge-no' : 'user-update-original-badge-no');
        if(originalBadgeNoInput) {
            originalBadgeNoInput.value = badgeNo;
        }

        // ✅ FIX 3: Member detail page ko chhipane ke liye sahi ID use kiya
        const detailSectionIdToHide = role === 'admin' ? 'member-detail-section' : 'user-member-detail-section';
        const detailSection = document.getElementById(detailSectionIdToHide);
        
        if (detailSection) {
            detailSection.style.display = 'none';
        }
        
        // 2. Update form dikhayein
        if (role === 'admin') {
            showAdminSection('update-section'); 
            fillUpdateForm(record, 'admin-update-form-fields', false); 
        } else if (role === 'user') {
            showUserSection('user-update-section'); 
            fillUpdateForm(record, 'user-update-form-fields', true);
        }

    } catch (error) {
        console.error('Error fetching record for update:', error);
        alert('Could not prepare record for update.');
    }
}

// Function to dynamically create and fill all member fields for update forms
function fillUpdateForm(record, formContainerId, isModerated) {
    const container = document.getElementById(formContainerId);
    if (!container) return;

    // Yahan hum YYYY-MM-DD ko DD-MM-YYYY format mein badalte hain
    const formattedBirthDate = formatDateDDMMYYYY(record.birth_date); 
    
    // Field IDs ka prefix role ke hisaab se set karte hain
    const prefix = isModerated ? 'user-update' : 'admin-update';
    
    // 🛑 CRITICAL FIX: Image Source Path Correction
    // Agar pic path "demo.png" nahi hai, toh BASE_URL ke saath jod kar use karein
    const imageSrc = record.pic && record.pic !== 'demo.png' 
        ? `${BASE_URL}/${record.pic}` 
        : 'demo.png';
    
    // Yahan saare fields ka HTML dynamically create karein aur value fill karein
    container.innerHTML = `
        <div class="form-group">
            <label>Badge Type:</label>
            <select id="${prefix}-badge-type" disabled>
                <option value="OPENSLIP" ${record.badge_type === 'OPENSLIP' ? 'selected' : ''}>OPENSLIP</option>
                <option value="ZONE" ${record.badge_type === 'ZONE' ? 'selected' : ''}>ZONE</option>
            </select>
        </div>
        <div class="form-group">
            <label>Badge No:</label>
            <input type="text" id="${prefix}-badge-no" value="${record.badge_no}" readonly>
        </div>
        
        <div class="form-group update-pic-group">
            <label>Current Picture:</label>
            
            <img src="${imageSrc}" style="width:100px; height:100px; border-radius:50%; margin-bottom: 10px;">
            
            <label for="${prefix}-pic">Change Picture:</label>
            <input type="file" id="${prefix}-pic" accept="image/*">
            <input type="hidden" id="${prefix}-pic-path-old" value="${record.pic}"> 
        </div>
        <div class="form-group">
            <label>Name:</label>
            <input type="text" id="${prefix}-name" value="${record.name}">
        </div>
        <div class="form-group">
            <label>Parent Name:</label>
            <input type="text" id="${prefix}-parent" value="${record.parent_name || ''}">
        </div>
        <div class="form-group">
            <label>Gender:</label>
            <select id="${prefix}-gender">
                <option value="MALE" ${record.gender === 'MALE' ? 'selected' : ''}>Male</option>
                <option value="FEMALE" ${record.gender === 'FEMALE' ? 'selected' : ''}>Female</option>
                <option value="OTHER" ${record.gender === 'OTHER' ? 'selected' : ''}>Other</option>
            </select>
        </div>
        <div class="form-group">
            <label>Phone:</label>
            <input type="text" id="${prefix}-phone" value="${record.phone || ''}">
        </div>
        <div class="form-group">
            <label>Birth Date:</label>
            <input type="text" id="${prefix}-birth" value="${formattedBirthDate}" placeholder="dd-mm-yyyy">
        </div>
        <div class="form-group">
            <label>Address:</label>
            <input type="text" id="${prefix}-address" value="${record.address || ''}">
        </div>
    `;
}


// Function to handle User's Update submission to Moderation Queue
async function userSubmitUpdateRequest() {
    const currentUsername = getLoggedInUsername();

    // --- 1. Data Collection (Admin ke logic ki tarah simple IDs se) ---
    const originalBadgeNo = document.getElementById('user-update-original-badge-no')?.value; 
    const badgeType = document.getElementById('user-update-badge-type')?.value.trim().toUpperCase();
    const badgeNo = document.getElementById('user-update-badge-no')?.value.trim().toUpperCase();
    const name = document.getElementById('user-update-name')?.value.trim().toUpperCase();
    const parent = document.getElementById('user-update-parent')?.value.trim().toUpperCase();
    const gender = document.getElementById('user-update-gender')?.value;
    const phone = document.getElementById('user-update-phone')?.value.trim();
    const birthRaw = document.getElementById('user-update-birth')?.value;
    const address = document.getElementById('user-update-address')?.value.trim().toUpperCase();
    const picInput = document.getElementById('user-update-pic');
    const oldPicPath = document.getElementById('user-update-pic-path-old')?.value; // Purana path uthaya
    const reason = document.getElementById('user-update-reason')?.value.trim(); // Mandatory reason field
    
    // --- 2. Validation ---
    if (!originalBadgeNo) return alert('Error: Original Badge Number is missing. Please try again.');
    if (!reason || reason.length < 5) return alert('Submission ka kaaran batana zaroori hai (min 5 characters).');
    if (!badgeType || !badgeNo || !name || !parent || !phone || !birthRaw || !address) return alert('Update ke liye sabhi fields required hain!');
    if (!/^\d{10}$/.test(phone)) return alert('Phone must be 10 digits!');

    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // --- 3. ID Generation & FormData Assembly (Admin Logic Applied) ---
    const requestID = generateRequestID('UPDATE', originalBadgeNo, currentUsername);
    
    const formData = new FormData();
    
    // 1. User/Request Metadata (Backend ko pata ho moderation queue mein kya dalna hai)
    formData.append('type', 'UPDATE'); 
    formData.append('username', currentUsername); 
    formData.append('reason', reason); 
    formData.append('requestID', requestID); 
    formData.append('originalBadgeNo', originalBadgeNo); // CRITICAL: Original ID to track
    
    // 2. ✅ FIX: Record Details (Admin ki tarah simple key-value pairs)
    formData.append('badgeType', badgeType);
    formData.append('badgeNo', badgeNo); 
    formData.append('name', name);
    formData.append('parent', parent);
    formData.append('gender', gender);
    formData.append('phone', phone);
    formData.append('birth', birth);
    formData.append('address', address);
    
    // 3. PICTURE PERSISTENCE LOGIC
    if (picInput && picInput.files.length > 0) {
        formData.append('pic', picInput.files[0]); // Naya file bhejo
    } else if (oldPicPath) {
        // Agar pic change nahi hua, to purana path backend ko bhejo
        formData.append('pic', oldPicPath); 
    }
    
    // --- 4. API Call to Moderation Queue ---
    try {
        const response = await fetch(`${BASE_URL}/api/submit-request`, {
            method: 'POST', 
            body: formData,
        });
        
        if (!response.ok) {
            // Error Handling ko robust rakha hai
            const errorText = await response.text(); 
            try {
                const errorData = JSON.parse(errorText);
                alert(`Update Request NOT submitted! Error: ${errorData.message}`);
            } catch {
                console.error("Server Error Response (Not JSON - check backend Multer config):", errorText);
                alert(`Update Request Failed! Server responded with HTTP 400. Check console for details.`);
            }
            return;
        }

        alert('Update request submitted for Admin approval! Tracking ID: ' + requestID);
        // Form reset aur Pending requests page par switch karein
        document.getElementById('user-update-record-form')?.reset();
        showUserSection('user-requests-section'); 
        
    } catch (error) {
        console.error('Network Error submitting update request:', error);
        alert('Request bhejte samay network galti hui. Kripya console check karein.');
    }
}

// Function to handle direct update submission by Admin
async function adminSubmitUpdate() {
    // --- Data Collection ---
    const originalBadgeNo = document.getElementById('admin-update-original-badge-no').value;
    
    // Naye data ke liye form fields se data uthayein
    const badgeType = document.getElementById('admin-update-badge-type').value.trim().toUpperCase();
    const badgeNo = document.getElementById('admin-update-badge-no').value.trim().toUpperCase();
    const name = document.getElementById('admin-update-name').value.trim().toUpperCase();
    const parent = document.getElementById('admin-update-parent').value.trim().toUpperCase();
    const gender = document.getElementById('admin-update-gender').value;
    const phone = document.getElementById('admin-update-phone').value.trim();
    const birthRaw = document.getElementById('admin-update-birth').value;
    const address = document.getElementById('admin-update-address').value.trim().toUpperCase();
    const picInput = document.getElementById('admin-update-pic');
    const oldPicPath = document.getElementById('admin-update-pic-path-old')?.value; // Purana pic path uthaya

    // --- Validation ---
    if (!originalBadgeNo) return alert('Error: Original Badge Number not found for update.');
    if (!badgeNo || !name || !parent || !phone || !birthRaw || !address) return alert('All fields are required!');
    if (!/^\d{10}$/.test(phone)) return alert('Phone must be 10 digits!');
    
    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD format for backend
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // 1. TRACKING ID GENERATE KI (UD/DATE/BADGENO/ADMIN_DIRECT)
    const adminTrackingID = generateRequestID('UPDATE', originalBadgeNo, 'ADMIN_DIRECT'); 
    
    // --- 2. FormData Assembly for PUT Request ---
    const formData = new FormData();
    formData.append('badgeType', badgeType);
    formData.append('badgeNo', badgeNo); 
    formData.append('name', name);
    formData.append('parent', parent);
    formData.append('gender', gender);
    formData.append('phone', phone);
    formData.append('birth', birth);
    formData.append('address', address);
    
    formData.append('adminTrackingID', adminTrackingID); // FINAL FIX: Logging ke liye bheji
    
    // 3. PICTURE PERSISTENCE LOGIC
    if (picInput && picInput.files.length > 0) {
        formData.append('pic', picInput.files[0]); // Naya file bhejo
    } else if (oldPicPath) {
        formData.append('pic', oldPicPath); // Purana path bhejo
    }

    // --- API Call: Direct PUT to Database ---
    try {
        const response = await fetch(`${BASE_URL}/api/records/${originalBadgeNo}`, { 
            method: 'PUT', // PUT method for update
            body: formData,
        });
        
        if (!response.ok) {
            const errorData = await response.json(); 
            alert(`Record NOT updated! Error: ${errorData.message}`);
            return;
        }

        const result = await response.json();
        
        if (result.success) {
            alert('Record successfully updated directly in the database! Tracking ID: ' + adminTrackingID);
            
            // Database reload, form hide, aur View All par wapas
            initializeDatabase(); 
            document.getElementById('admin-update-record-form').reset();
            showAdminSection('view-section');
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error updating record:', error);
        alert('An error occurred during update. Check console.');
    }
}


// 1. USER UPDATE REQUEST SUBMISSION (USER Action Button calls this)
// Function to handle User's Update submission to Moderation Queue
async function userSubmitUpdateRequest() {
    const currentUsername = getLoggedInUsername();

    // --- 1. Data Collection ---
    const originalBadgeNo = document.getElementById('user-update-original-badge-no')?.value;
    const badgeType = document.getElementById('user-update-badge-type')?.value.trim().toUpperCase();
    const badgeNo = document.getElementById('user-update-badge-no')?.value.trim().toUpperCase();
    const name = document.getElementById('user-update-name')?.value.trim().toUpperCase();
    const parent = document.getElementById('user-update-parent')?.value.trim().toUpperCase();
    const gender = document.getElementById('user-update-gender')?.value;
    const phone = document.getElementById('user-update-phone')?.value.trim();
    const birthRaw = document.getElementById('user-update-birth')?.value;
    const address = document.getElementById('user-update-address')?.value.trim().toUpperCase();
    const picInput = document.getElementById('user-update-pic');
    const oldPicPath = document.getElementById('user-update-pic-path-old')?.value; // Purana path uthaya
    const reason = document.getElementById('user-update-reason')?.value.trim();
    
    // --- 2. Validation ---
    if (!originalBadgeNo) return alert('Error: Original Badge Number is missing. Please try again.');
    if (!reason || reason.length < 5) return alert('Submission ka kaaran batana zaroori hai (min 5 characters).');
    if (!badgeType || !badgeNo || !name || !parent || !phone || !birthRaw || !address) return alert('Update ke liye sabhi fields required hain!');
    if (!/^\d{10}$/.test(phone)) return alert('Phone must be 10 digits!');

    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // --- 3. ID Generation & FormData Assembly ---
    const requestID = generateRequestID('UPDATE', originalBadgeNo, currentUsername);
    
    const formData = new FormData();
    
    // 1. User/Request Metadata
    formData.append('type', 'UPDATE'); 
    formData.append('username', currentUsername); 
    formData.append('reason', reason); 
    formData.append('requestID', requestID); 
    formData.append('originalBadgeNo', originalBadgeNo); // CRITICAL: Original ID to track
    
    // 2. Record Details
    formData.append('badgeType', badgeType);
    formData.append('badgeNo', badgeNo); 
    formData.append('name', name);
    formData.append('parent', parent);
    formData.append('gender', gender);
    formData.append('phone', phone);
    formData.append('birth', birth);
    formData.append('address', address);
    
    // 3. ✅ FINAL FIX: PICTURE PERSISTENCE LOGIC
    if (picInput && picInput.files.length > 0) {
        // Naya file select hua hai, 'pic' field mein file bhejo.
        formData.append('pic', picInput.files[0]); 
    } else if (oldPicPath) {
        // File select nahi hua, purane path ko 'oldPicPath' field mein bhejo.
        formData.append('oldPicPath', oldPicPath); 
    }
    
    // --- 4. API Call to Moderation Queue ---
    try {
        const response = await fetch(`${BASE_URL}/api/submit-request`, {
            method: 'POST', 
            body: formData,
        });
        
        if (!response.ok) {
            const errorText = await response.text(); 
            try {
                const errorData = JSON.parse(errorText);
                alert(`Update Request NOT submitted! Error: ${errorData.message}`);
            } catch {
                console.error("Server Error Response:", errorText);
                alert(`Update Request Failed! Server responded with HTTP 400. Check console for details.`);
            }
            return;
        }

        alert('Update request submitted for Admin approval! Tracking ID: ' + requestID);
        document.getElementById('user-update-record-form')?.reset();
        showUserSection('user-requests-section'); 
        
    } catch (error) {
        console.error('Network Error submitting update request:', error);
        alert('Request bhejte samay network galti hui. Kripya console check karein.');
    }
}


// Function to handle click on 'Delete Record' button
async function deleteMember(badgeNo) {
    if (!badgeNo) return alert("Error: Badge Number missing.");

    const role = CURRENT_USER.role;
    const currentUsername = getLoggedInUsername();

    // Reason for deletion is mandatory for auditing (both roles)
    const reason = prompt(`Please enter the reason for deleting Badge No. ${badgeNo}:`);
    if (!reason || reason.trim() === '') return alert('Deletion reason is mandatory for auditing.');

    // 1. Tracking ID Generate Karein
    const trackingID = generateRequestID('DELETE', badgeNo, role === 'admin' ? 'ADMIN_DIRECT' : currentUsername);

    // --- ADMIN: DIRECT DELETE (JSON data is used, which is fine) ---
    if (role === 'admin') {
        if (confirm(`ADMIN CONFIRMATION: Are you sure you want to DELETE record ${badgeNo} directly?`)) {
            try {
                // Admin DELETE API call (sends data as JSON in body for logging)
                const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`, { 
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    // Tracking ID aur reason ko JSON mein bheja
                    body: JSON.stringify({ reason: reason, trackingID: trackingID }) 
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    try {
                        const errorData = JSON.parse(errorText);
                        alert(`Deletion NOT successful! Error: ${errorData.message}`);
                    } catch {
                        alert(`CRITICAL SERVER CRASH (500)! Deletion Failed. Check terminal for SQL error.`);
                        console.error('Server Sent Error:', errorText);
                    }
                    return;
                }

                alert(`Record ${badgeNo} deleted successfully! Tracking ID: ${trackingID}`);
                initializeDatabase(); // Reload data
                showAdminSection('view-section'); // Go back to the main view
                
            } catch (error) {
                console.error('Error during direct deletion:', error);
                alert('An unexpected network error occurred during deletion. Check console.');
            }
        }
        
    // --- USER: SUBMIT DELETE REQUEST (CRITICAL FIX: Fetch Full Original Data) ---
    } else if (role === 'user') {
        
        // 2. Original Record Fetch Karein (Backend Validation के लिए)
        let originalRecord;
        try {
            const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`);
            if (!response.ok) throw new Error('Original Record not found for deletion.');
            originalRecord = await response.json();
        } catch (error) {
            console.error('Error fetching original record for deletion:', error);
            return alert('Original record details fetch नहीं हो पाए. Kripya Admin से संपर्क करें.');
        }

        if (confirm(`Submit delete request for ${badgeNo} to Admin?`)) {
            
            // 3. FormData Assembly: Original Data Snapshot Bheja
            const formData = new FormData();
            
            // Request/Moderation Metadata
            formData.append('type', 'DELETE'); 
            formData.append('username', currentUsername); 
            formData.append('reason', reason); 
            formData.append('requestID', trackingID); 
            formData.append('badgeNo', badgeNo); 
            formData.append('originalBadgeNo', badgeNo); // Target ID

            // ✅ CRITICAL FIX: Original Record का पूरा Data Bheja (8 fields)
            formData.append('badgeType', originalRecord.badge_type || '');
            formData.append('name', originalRecord.name || '');
            formData.append('parent', originalRecord.parent_name || '');
            formData.append('gender', originalRecord.gender || '');
            formData.append('phone', originalRecord.phone || '');
            
            // Birth Date को YYYY-MM-DD format में भेजना है (database format)
            formData.append('birth', originalRecord.birth_date || ''); 
            
            formData.append('address', originalRecord.address || ''); 
            formData.append('pic', originalRecord.pic || 'demo.png'); // Pic path भी भेजा

            try {
                const response = await fetch(`${BASE_URL}/api/submit-request`, {
                    method: 'POST',
                    body: formData,
                });
                
                if (!response.ok) {
                    const errorData = await response.json(); 
                    alert(`Request NOT submitted! Error: ${errorData.message}`);
                    return;
                }

                alert('Delete request submitted for Admin approval! Tracking ID: ' + trackingID);
                showUserSection('user-requests-section'); 
                
            } catch (error) {
                console.error('Error submitting delete request:', error);
                alert('Request bhejte samay network galti hui. Kripya console check करें.');
            }
        }
    }
}

// -------------------- SEARCH & FILTER LOGIC (UPDATED FOR UNIQUE IDs) --------------------

function filterAndSearchRecords() {
    
    // Pehle decide karo ki kis section ke inputs ko dekhna hai
    let searchId;
    let filterId;

    if (CURRENT_USER.role === 'admin') {
        searchId = 'global-search';         // Admin IDs (Jo pehle se theek the)
        filterId = 'badge-type-filter';
    } else if (CURRENT_USER.role === 'user') {
        searchId = 'user-global-search';    // 🛑 Ab Nayi User ID uthayega
        filterId = 'user-badge-type-filter';// 🛑 Ab Nayi User ID uthayega
    } else {
        return;
    }
    
    // 1. Inputs se values lein (Ab correct ID use hogi)
    const searchTerm = document.getElementById(searchId)?.value.trim().toUpperCase() || '';
    const badgeTypeFilter = document.getElementById(filterId)?.value.trim().toUpperCase() || '';
    
    // 2. Database ke sabhi records par filter lagayein (Logic same as before)
    database.filteredRecords = database.records.filter(record => {
        
        if (badgeTypeFilter && record.badge_type !== badgeTypeFilter) {
            return false;
        }

        if (searchTerm) {
            const badgeNo = record.badge_no?.toUpperCase() || '';
            const name = record.name?.toUpperCase() || '';
            const parentName = record.parent_name?.toUpperCase() || '';
            const phone = record.phone || ''; 
            const address = record.address?.toUpperCase() || '';

            // Age aur Birth Date ke liye helper functions use ho rahe hain
            const formattedBirthDate = formatDateDDMMYYYY(record.birth_date) || ''; 
            const age = String(calculateAge(formattedBirthDate));

            const matches = 
                badgeNo.includes(searchTerm) ||
                name.includes(searchTerm) ||
                parentName.includes(searchTerm) ||
                phone.includes(searchTerm) ||
                address.includes(searchTerm) ||
                formattedBirthDate.includes(searchTerm) ||
                age.includes(searchTerm);
            
            return matches;
        }

        return true; 
    });

    // 3. Table ko update karein
    updateTable();
}

// ----------------------------------------------------------------------------------
// IMPORTANT: Yeh ensure karo ki updateTable() function mein typo theek ho chuka hai:
// "targetTboy" ko "targetTbody" se badal diya gaya hai.
// ----------------------------------------------------------------------------------

// -------------------- NEW SORTING LOGIC --------------------

// Global variable to keep track of the current sort state
let currentSortState = { key: 'name', direction: 'ASC' };

function sortRecords(key, buttonElement) {
    let direction = currentSortState.direction;
    
    // Agar same button ko click kiya gaya hai, toh direction ko reverse karo
    if (currentSortState.key === key) {
        direction = direction === 'ASC' ? 'DESC' : 'ASC';
    } else {
        // Agar naya key hai, toh default ASC rakho
        direction = 'ASC';
    }

    // Button labels ko update karo (Optional, but looks good)
    document.querySelectorAll('.sorting-actions button').forEach(btn => {
        btn.textContent = btn.textContent.replace(' ↑', '').replace(' ↓', '');
        btn.classList.remove('active-sort');
    });
    
    buttonElement.textContent += (direction === 'ASC' ? ' ↑' : ' ↓');
    buttonElement.classList.add('active-sort');

    // State update karo
    currentSortState = { key: key, direction: direction };

    // Sorting logic on the currently filtered records
    database.filteredRecords.sort((a, b) => {
        let valA, valB;

        // Special handling for Age (needs numeric comparison)
        if (key === 'age') {
            valA = calculateAge(formatDateDDMMYYYY(a.birth_date)) || 0;
            valB = calculateAge(formatDateDDMMYYYY(b.birth_date)) || 0;
            // Agar age calculate nahi ho payi, toh 0 maan lenge

        } else if (key === 'name' || key === 'address' || key === 'gender') {
            // String comparison (case-insensitive)
            valA = (a[key] || '').toUpperCase();
            valB = (b[key] || '').toUpperCase();
        } else {
            // Default string comparison
            valA = (a[key] || '').toUpperCase();
            valB = (b[key] || '').toUpperCase();
        }

        // Comparison
        if (valA < valB) {
            return direction === 'ASC' ? -1 : 1;
        }
        if (valA > valB) {
            return direction === 'ASC' ? 1 : -1;
        }
        return 0;
    });

    // Table ko refresh karo
    updateTable();
}


// -------------------- UTILITY & HELPERS (Existing Code) --------------------

// Function to show a dedicated detail/action page for a specific member
async function showMemberActions(badgeNo) {
    if (!badgeNo) {
        alert("Error: Badge Number missing for action.");
        return;
    }
    
    // Determine current role, target view ID, aur detail section ID
    const role = CURRENT_USER.role;
    const viewSectionId = role === 'admin' ? 'view-section' : 'user-view-section';
    const goBackFunctionName = role === 'admin' ? 'showAdminSection' : 'showUserSection';
    
    // ✅ FIX 1: Correct Detail Section ID select kiya gaya
    const detailSectionId = role === 'admin' ? 'member-detail-section' : 'user-member-detail-section';
    const detailSection = document.getElementById(detailSectionId);

    if (!detailSection) {
        console.error(`CRITICAL: Member detail section (${detailSectionId}) is missing in HTML.`);
        return;
    }

    // 1. UI Switch: Detail view par switch karein
    role === 'admin' ? showAdminSection(detailSectionId) : showUserSection(detailSectionId);
    detailSection.innerHTML = '<h2>Loading member details...</h2>'; // Temporary loading message

    try {
        // 2. Backend API call to fetch single record
        const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`); 
        
        if (!response.ok) {
            alert('Record not found or failed to fetch.');
            role === 'admin' ? showAdminSection(viewSectionId) : showUserSection(viewSectionId); // Go back on failure
            return;
        }
        
        const record = await response.json();
        
        // 🛑 CRITICAL FIX: Image Source Path Correction
        // Agar pic path "demo.png" nahi hai, toh BASE_URL ke saath jod kar use karein
        const imageSrc = record.pic && record.pic !== 'demo.png' 
            ? `${BASE_URL}/${record.pic}` 
            : 'demo.png';
            
        // 3. Populate HTML Section
        detailSection.innerHTML = `
            <button onclick="${goBackFunctionName}('${viewSectionId}')" style="float:right;">Go Back</button>
            <h2>Member Details & Actions: ${record.name}</h2>
            <div style="display:flex; gap:20px; align-items:center; padding: 20px 0;">
                
                <img src="${imageSrc}" style="width:120px; height:120px; border-radius:5px;">
                
                <div>
                    <p><strong>Badge No:</strong> ${record.badge_no}</p>
                    <p><strong>Parent:</strong> ${record.parent_name || 'N/A'}</p>
                    <p><strong>Phone:</strong> ${record.phone || 'N/A'}</p>
                    <p><strong>Birth Date:</strong> ${formatDateDDMMYYYY(record.birth_date)} (Age: ${calculateAge(formatDateDDMMYYYY(record.birth_date))})</p>
                    <p><strong>Address:</strong> ${record.address || 'N/A'}</p>
                </div>
            </div>
            <hr>
            <h3>Actions:</h3>
            <button onclick="editMember('${record.badge_no}')">
                ${role === 'admin' ? 'Update Record' : 'Submit Update Request'}
            </button>
            <button onclick="deleteMember('${record.badge_no}')" class="delete-btn">
                ${role === 'admin' ? 'Delete Record' : 'Submit Delete Request'}
            </button>
        `;
        
    } catch (error) {
        console.error('Error fetching member details (Rendering issue):', error);
        alert('Could not fetch member details for action. Check console for rendering error.');
        role === 'admin' ? showAdminSection(viewSectionId) : showUserSection(viewSectionId); // Go back on failure
    }
}

// Function to fetch and display all Pending Moderation Requests
async function loadPendingRequests() {
    const listContainer = document.getElementById('requests-list-container');
    const detailContainer = document.getElementById('request-details-view'); 
    
    if (!listContainer) return console.error("List container missing.");
    
    // UI State ko reset karna: Detail view chhipao, List view dikhao
    if (detailContainer) {
        detailContainer.style.display = 'none';
    }
    listContainer.style.display = 'block'; 

    listContainer.innerHTML = '<h2>Loading Pending Requests...</h2>';
    
    try {
        const response = await fetch(`${BASE_URL}/api/moderation/pending`); 
        if (!response.ok) throw new Error('Failed to fetch pending requests.');
        
        const requests = await response.json();

        if (requests.length === 0) {
            listContainer.innerHTML = '<h2>No Pending Requests! 🎉</h2>';
            return;
        }

        let tableHTML = `
            <table class="moderation-table">
                <thead>
                    <tr>
                        <th>Req ID</th>
                        <th>Tracking ID</th>
                        <th>Type</th>
                        <th>Target Badge</th>
                        <th>Requester</th>
                        <th>Reason</th>
                        <th>Submitted On</th>
                        <th>ACTION</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        requests.forEach(req => {
            const typeClass = req.request_type.toLowerCase(); 
            
            // ✅ FIX: formatDateDDMMYYYY se date part aur time part alag se nikala
            const formattedDate = formatDateDDMMYYYY(req.submission_timestamp);
            
            // Time part nikalne ke liye string ko ISO format mein badla (' ' to 'T')
            const dateString = String(req.submission_timestamp).replace(' ', 'T');
            const dateObj = new Date(dateString);
            const formattedTime = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

            const submittedDateTime = formattedDate === '' ? 'N/A' : `${formattedDate} ${formattedTime}`;
            
            tableHTML += `
                <tr>
                    <td>${req.request_id}</td>
                    <td>${req.tracking_id || 'N/A'}</td>
                    <td class="type-${typeClass}">${req.request_type}</td>
                    <td>${req.target_badge_no || 'N/A'}</td>
                    <td>${req.requester_username}</td>
                    <td>${req.submission_reason ? req.submission_reason.substring(0, 20) + '...' : 'N/A'}</td> 
                    <td>${submittedDateTime}</td>
                    <td>
                        <button onclick="viewRequestDetails(${req.request_id})" class="btn-review">Review Details</button>
                    </td>
                </tr>
            `;
        });
        
        tableHTML += `</tbody></table>`;
        listContainer.innerHTML = tableHTML;

    } catch (error) {
        console.error('Error loading pending requests:', error);
        listContainer.innerHTML = '<h2>Error loading requests. Check console.</h2>';
    }
}

// FETCH USER REQUEST

// script.js - fetchAndRenderUserRequests function ka corrected code

async function fetchAndRenderUserRequests() {
    const currentUsername = CURRENT_USER.username;
    // HTML container: <div id="my-requests-list-container">
    const container = document.getElementById('my-requests-list-container'); 
    
    if (!container) return console.error("User request container not found (#my-requests-list-container).");

    if (!currentUsername) {
        container.innerHTML = '<h2>Login details not found. Please re-login.</h2>';
        return;
    }
    
    container.innerHTML = `<h2><i class="fa fa-spinner fa-spin"></i> Loading requests for ${currentUsername}...</h2>`;
    
    try {
        // Backend API call: username query parameter mein bheja
        const response = await fetch(`${BASE_URL}/api/user/my-requests?username=${currentUsername}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch user requests: ${response.status}`);
        }
        const requests = await response.json();

        if (requests.length === 0) {
            container.innerHTML = '<h2>You have no submitted requests.</h2>';
            return;
        }

        // List ko HTML table mein render karein
        let html = '<table class="requests-table"><thead><tr><th>Tracking ID</th><th>Type</th><th>Target Badge</th><th>Reason</th><th>Status</th><th>Submitted On</th></tr></thead><tbody>';
        
        requests.forEach(req => {
            const statusClass = req.request_status.toLowerCase();
            
            // ✅ FIX: toLocaleTimeString() ko toLocaleString() se badla
            const submittedDate = new Date(req.submission_timestamp).toLocaleString('en-IN', {
                dateStyle: 'short', // Ab yeh option kaam karega
                timeStyle: 'short'
            });
            
            html += `
                <tr>
                    <td>${req.tracking_id}</td>
                    <td>${req.request_type}</td>
                    <td>${req.target_badge_no}</td>
                    <td>${req.submission_reason ? req.submission_reason.substring(0, 50) + '...' : 'N/A'}</td>
                    <td class="status-${statusClass}">${req.request_status}</td>
                    <td>${submittedDate}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error fetching user requests:', error);
        container.innerHTML = '<h2>Error loading your requests. Server ya Network issue.</h2>';
    }
}

// Function to handle Approval button click
async function approveRequest(requestId) {
    const approverUsername = CURRENT_USER.username;
    
    if (!confirm(`Are you sure you want to APPROVE request #${requestId}? This action is final and logs the record to the main database.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${BASE_URL}/api/requests/approve/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approverUsername: approverUsername }) // Admin ka username bheja
        });

        const result = await response.json();
        
        if (result.success) {
            alert(`Request #${requestId} approved! Record updated/added to main table.`);
            loadPendingRequests(); // Pending list reload karein
            initializeDatabase(); // Main data (View All) reload karein
        } else {
            alert(`Approval Failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Approval error:', error);
        alert('An error occurred during approval. Check console.');
    }
}

// Function to handle Rejection button click
async function rejectRequest(requestId) {
    const approverUsername = CURRENT_USER.username;
    const rejectionReason = prompt(`Enter reason for rejecting request #${requestId}:`);
    
    if (!rejectionReason || rejectionReason.trim() === '') {
        alert("Rejection ke liye kaaran dena zaroori hai.");
        return;
    }
    
    try {
        const response = await fetch(`${BASE_URL}/api/requests/reject/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // Rejection reason aur Admin ka username bheja
            body: JSON.stringify({ approverUsername: approverUsername, rejectionReason: rejectionReason })
        });

        const result = await response.json();
        
        if (result.success) {
            alert(`Request #${requestId} rejected!`);
            loadPendingRequests(); // Pending list reload karein
        } else {
            alert(`Rejection Failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Rejection error:', error);
        alert('An error occurred during rejection. Check console.');
    }
}


// Function to open the detailed view and fetch data

async function viewRequestDetails(requestId) {
    const listContainer = document.getElementById('requests-list-container');
    const detailContainer = document.getElementById('request-details-view'); 
    
    if (!listContainer || !detailContainer) {
        console.error("Containers missing for request review.");
        return;
    }

    // UI State Change: List chhipao, Detail view dikhao
    listContainer.style.display = 'none';
    detailContainer.innerHTML = '<h2>Loading Details...</h2>';
    detailContainer.style.display = 'block'; 

    try {
        // Fetch Request Metadata
        const requestResponse = await fetch(`${BASE_URL}/api/request/${requestId}`);
        if (!requestResponse.ok) {
            throw new Error(`Failed to fetch metadata: ${requestResponse.status}`);
        }
        const request = await requestResponse.json();

        const targetBadge = request.target_badge_no;
        
        // Fetch Original Record Data
        let originalRecord = null;
        if (request.request_type !== 'ADD' && targetBadge) {
            const originalResponse = await fetch(`${BASE_URL}/api/records/${targetBadge}`);
            if (originalResponse.ok) {
                originalRecord = await originalResponse.json();
            }
        }

        // Data ko render karein
        renderRequestDetails(request, originalRecord, detailContainer);

    } catch (error) {
        console.error('Error fetching request details:', error);
        detailContainer.innerHTML = `<h2>Error: ${error.message}</h2>
                                    <button onclick="loadPendingRequests()">Go Back</button>`;
    }
}

// script.js - Updated renderRequestDetails function with Flexible Side-by-Side View

function renderRequestDetails(request, originalRecord, container) {
    const requestedData = request.requested_data; 
    const originalReason = request.submission_reason;
    
    // Request Type Check
    const isUpdate = request.request_type === 'UPDATE';
    const isDelete = request.request_type === 'DELETE';
    const isAdd = request.request_type === 'ADD';
    
    // Data Existence Check
    const originalExists = originalRecord && originalRecord.badge_no;

    // Date/Time Formatting
    const submittedTime = new Date(request.submission_timestamp).toLocaleString();

    // Helper functions (Highlight, getOriginalValue, getPicSrc)
    const highlight = (originalVal, requestedVal) => {
        if (!isUpdate) return requestedVal || 'N/A';
        const originalString = String(originalVal || '');
        const requestedString = String(requestedVal || '');
        
        if (originalString !== requestedString) {
            return `<span style="color:red; font-weight:bold;">${requestedString || 'Empty'}</span>`;
        }
        return requestedString || 'N/A';
    };

    const getOriginalValue = (key) => {
        if (!originalExists || isAdd || isDelete) return 'N/A';
        if (key === 'birth_date') return formatDateDDMMYYYY(originalRecord[key]);
        return originalRecord[key] || 'N/A';
    };
    
    const getPicSrc = (data) => {
        const picPath = data?.pic;
        if (!picPath) return 'demo.png';
        return picPath.startsWith('http') ? picPath : `${BASE_URL}/${picPath}`;
    };
    
    // Color scheme setup
    const mainBoxBorderColor = isDelete ? 'red' : (isUpdate ? 'red' : 'green');
    const mainBoxBgColor = isDelete ? '#fff0f0' : (isUpdate ? '#fff0f0' : '#f9fff9');
    const mainBoxHeaderColor = isDelete ? 'red' : (isUpdate ? 'red' : 'green');


    container.innerHTML = `
        <button onclick="loadPendingRequests()" style="float:right; margin-bottom: 20px;">Back to List</button>
        <h2>Review: ${request.request_type} Request (${request.tracking_id})</h2>
        <p style="margin-bottom: 20px;"><strong>Submitted By:</strong> ${request.requester_username} on ${submittedTime}</p>
        <hr>
        
        <div style="
            display: ${isUpdate ? 'flex' : 'block'}; 
            justify-content: center; /* Changed from space-between to center for better visual balance on non-50/50 split */
            gap: 20px; 
            /* overflow-x: auto; - Removed to prevent scrollbar */
            flex-wrap: nowrap; /* Hamesha side-by-side rakhega */
            /* padding-bottom: 10px; - Removed unnecessary padding */
        ">
            
            ${isUpdate ? 
                // 1. ORIGINAL RECORD SECTION (Only for UPDATE)
                `
                <div style="
                    /* 🛑 UPDATED: Flexible 50% width */
                    flex-basis: 50%; /* Preferred width 50% */
                    flex-grow: 1; /* Allow to grow if space is available (though not necessary here) */
                    flex-shrink: 1; /* Allow to shrink if space is tight */
                    min-width: 250px; /* Thoda kam minimum size set kiya */
                    
                    border: 2px solid green; 
                    padding: 20px; 
                    background-color: #f0fff0; 
                    border-radius: 5px;
                ">
                    <h3 style="margin-top: 0; color: green; border-bottom: 1px solid #ccc; padding-bottom: 5px;">
                        Original Record (DATABASE)
                    </h3>
                    
                    <div style="text-align: center; margin-bottom: 15px;">
                        <p style="margin: 0; font-weight: bold;">Picture:</p>
                        <img src="${getPicSrc(originalRecord)}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid green; margin-top: 5px;">
                    </div>

                    <p><strong>Badge No:</strong> ${request.target_badge_no}</p>
                    <p><strong>Name:</strong> ${getOriginalValue('name')}</p>
                    <p><strong>Parent Name:</strong> ${getOriginalValue('parent_name')}</p>
                    <p><strong>Phone:</strong> ${getOriginalValue('phone')}</p>
                    <p><strong>Address:</strong> ${getOriginalValue('address')}</p>
                    <p><strong>Birth Date:</strong> ${getOriginalValue('birth_date')}</p>
                </div>
                `
                : ''
            }

            <div style="
                /* 🛑 UPDATED: Flexible width based on isUpdate */
                flex-basis: ${isUpdate ? '50%' : '100%'}; /* Preferred width */
                flex-grow: 1; /* Allow to grow */
                flex-shrink: 1; /* Allow to shrink (essential for avoiding scrollbar) */
                min-width: 250px; /* Thoda kam minimum size set kiya */
                
                border: 2px solid ${mainBoxBorderColor}; 
                padding: 20px; 
                background-color: ${mainBoxBgColor}; 
                border-radius: 5px;
            ">
                <h3 style="margin-top: 0; color: ${mainBoxHeaderColor}; border-bottom: 1px solid #ccc; padding-bottom: 5px;">
                    Requested Data (${request.request_type})
                </h3>

                <div style="text-align: center; margin-bottom: 15px;">
                    <p style="margin: 0; font-weight: bold;">Picture:</p>
                    <img src="${getPicSrc(requestedData)}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid ${mainBoxHeaderColor}; margin-top: 5px;">
                </div>
                
                <p><strong>Badge No:</strong> ${requestedData.badge_no || 'N/A'}</p>
                <p><strong>Name:</strong> ${highlight(getOriginalValue('name'), requestedData.name)}</p>
                <p><strong>Parent Name:</strong> ${highlight(getOriginalValue('parent_name'), requestedData.parent_name)}</p>
                <p><strong>Phone:</strong> ${highlight(getOriginalValue('phone'), requestedData.phone)}</p>
                <p><strong>Address:</strong> ${highlight(getOriginalValue('address'), requestedData.address)}</p>
                <p><strong>Birth Date:</strong> ${highlight(formatDateDDMMYYYY(getOriginalValue('birth_date')), formatDateDDMMYYYY(requestedData.birth_date))}</p>
            </div>
        </div>

        <hr style="margin: 20px 0;">
        
        <h3>Requester's Reason:</h3>
        <p style="padding: 10px; background-color: #eee; border-radius: 3px;">${originalReason || 'No reason provided.'}</p>
        
        <div class="action-buttons-final" style="margin-top: 30px; text-align: center;">
            <button onclick="approveRequest(${request.request_id})" class="btn-approve btn-lg">APPROVE & EXECUTE</button>
            <button onclick="rejectRequest(${request.request_id})" class="btn-reject btn-lg" style="margin-left: 15px;">REJECT</button>
        </div>
    `;
}


// --- MISSING UTILITY FUNCTIONS ---

// Function to format Badge No. on input (Admin and User forms mein call ho raha hai)
function formatBadgeNumber(inputId) {
    let input = document.getElementById(inputId);
    let value = input.value.trim().toUpperCase();

    // Agar value already "AM-" se start nahi ho rahi, to add AM-
    if (!value.startsWith("AM-")) {
        // Remove any non-digit characters first
        value = value.replace(/[^0-9]/g, '');
        value = `AM-${value}`;
        input.value = value;
    }
}

// Function to fetch and show all records (View All button se call hota hai)
async function showAllRecords() {
    try {
        const response = await fetch(`${BASE_URL}/api/records`);
        if (!response.ok) {
            throw new Error('Failed to fetch records from the server.');
        }
        const records = await response.json();
        database.records = records;
        database.filteredRecords = records;
        
        // Data aane ke baad table ko update karein
        if (typeof updateTable === 'function') updateTable(); 
    } catch (error) {
        console.error('Error in showAllRecords:', error);
        alert('Failed to load records. Please check the console for more details.');
    }
}

// --- UTILITY & HELPER FUNCTIONS ---

// 1. DATE FORMATTING (Required by updateTable)
function formatDateDDMMYYYY(dateString) {
    if (!dateString) return '';
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
        return dateString; // already dd-mm-yyyy
    }
    const date = new Date(dateString);
    if (isNaN(date)) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

// 2. AGE CALCULATION (Required by updateTable)
function calculateAge(dobString) {
    if (!dobString) return NaN;

    const parts = dobString.split('-'); // Expecting dobString in "dd-mm-yyyy" format
    if (parts.length !== 3) return NaN;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; 
    const year = parseInt(parts[2], 10);

    const dob = new Date(year, month, day);
    if (isNaN(dob.getTime())) return NaN;

    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
    }
    return age;
}
// --- SELECTION AND BATCH HANDLING ---

// Function for 'Select All' checkbox (Called from the table header HTML)
function toggleSelectAll(source) {
    document.querySelectorAll('.record-checkbox').forEach(checkbox => {
        checkbox.checked = source.checked;
        toggleRecordSelection(checkbox);
    });
}

// Function to handle single checkbox click (CRITICAL DEPENDENCY)
function toggleRecordSelection(checkbox) {
    const badgeNo = checkbox.dataset.badgeNo;
    const row = checkbox.closest('tr');
    if (checkbox.checked) {
        // Assume database.selectedRecords is defined globally
        database.selectedRecords.add(badgeNo);
        row.classList.add('selected-row');
    } else {
        database.selectedRecords.delete(badgeNo);
        row.classList.remove('selected-row');
    }
}

// Batch action: Select by Name (Called from the Batch Actions button)
function selectAllByName() {
    const term = prompt("Enter name to select (leave blank for all visible):")?.trim().toUpperCase();
    if (term === null) return;
    // Assume database.filteredRecords is populated
    database.filteredRecords.forEach(record => {
        if (term === '' || (record.name && record.name.includes(term))) {
            database.selectedRecords.add(record.badge_no);
        }
    });
    // Update the visual state
    updateTable();
    alert(`Selected ${database.selectedRecords.size} records.`);
}

// Batch action: Clear Selections (Called from the Batch Actions button)
function clearAllSelections() {
    database.selectedRecords.clear();
    updateTable();
    alert('All selections cleared.');
}