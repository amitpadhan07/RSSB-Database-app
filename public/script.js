// Global BASE_URL variable.
const BASE_URL = 'https://rssb-rudrapur-database-api.onrender.com';

// Global user object to store logged-in state (role and username)
var CURRENT_USER = {}; 

// INITIAL DATABASE (In-memory data structure for UI rendering)
const database = {
    records: [],
    count: 0,
    filteredRecords: [],
    selectedRecords: new Set() // For batch actions
};

// Global variable to hold logs data for client-side filtering (Caching)
let ALL_SYSTEM_LOGS = []; 
let PENDING_BADGES = new Set(); // <--- ADD THIS NEW SET VARIABLE
let currentSortState = { key: 'name', direction: 'ASC' };

/**
 * Encodes a string (including Unicode/UTF-8 characters) to a safe Base64 string.
 * This function bypasses the Latin1 limitation of btoa().
 * @param {string} str - The string to encode.
 * @returns {string} The Base64 encoded string.
 */
function encodeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Decodes a Base64 string back to its original (Unicode/UTF-8) string format.
 * @param {string} str - The Base64 string to decode.
 * @returns {string} The original string.
 */
function decodeBase64(str) {
    return decodeURIComponent(escape(atob(str)));
}




// ====================================================
// --- CORE UTILITIES ---
// ====================================================

/**
 * Returns the current date in DDMMYY format.
 * @returns {string} Formatted date string.
 */
function getFormattedDate() {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = String(today.getFullYear()).slice(-2);
    return `${d}${m}${y}`;
}

/**
 * Generates a unique tracking ID for moderation requests or admin actions.
 * Format: PREFIX/DDMMYY/BADGENO/USERNAME
 * @param {string} type - 'ADD', 'UPDATE', or 'DELETE'.
 * @param {string} badgeNo - The target badge number.
 * @param {string} username - The user initiating the request.
 * @returns {string} The generated tracking ID.
 */
function generateRequestID(type, badgeNo, username) {
    const datePart = getFormattedDate();
    let prefix;
    switch (type.toUpperCase()) {
        case 'ADD': prefix = 'AD'; break;
        case 'UPDATE': prefix = 'UD'; break;
        case 'DELETE': prefix = 'DD'; break;
        case 'ADMIN_ADD': prefix = 'AA'; break;
        case 'ADMIN_UPDATE': prefix = 'AU'; break;
        case 'ADMIN_DELETE': prefix = 'AD'; break;
        default: prefix = 'ERR'; 
    }
    // Reverted to the original format: PREFIX/BADGENO/DDMMYY/USERNAME (Backend compatibility)
    return `${prefix}/${badgeNo}/${datePart}/${username}`; 
}

/**
 * Gets the username of the currently logged-in user.
 * @returns {string} The username.
 */
function getLoggedInUsername() {
    return CURRENT_USER.username || document.getElementById("username")?.value || 'UNKNOWN'; 
}

/**
 * Formats the badge number input to ensure it starts with "AM-".
 * @param {string} inputId - The ID of the input element.
 */
function formatBadgeNumber(inputId) {
    let input = document.getElementById(inputId);
    if (!input) return;

    let value = input.value.trim().toUpperCase();

    if (!value.startsWith("AM-")) {
        // Remove any non-digit characters first, then prepend "AM-"
        value = value.replace(/[^0-9]/g, '');
        value = `AM-${value}`;
        input.value = value;
    }
}

/**
 * Converts a database date string (YYYY-MM-DD) or other format to DD-MM-YYYY.
 * @param {string} dateString - The date string from the database.
 * @returns {string} Formatted date string.
 */
function formatDateDDMMYYYY(dateString) {
    if (!dateString) return '';
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateString)) {
        return dateString; // Already in target format
    }
    const date = new Date(dateString);
    if (isNaN(date)) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Calculates the age based on a birth date string (DD-MM-YYYY).
 * @param {string} dobString - Date of birth in "dd-mm-yyyy" format.
 * @returns {number} The calculated age, or NaN if the format is invalid.
 */
function calculateAge(dobString) {
    if (!dobString) return NaN;

    const parts = dobString.split('-'); // Expecting "dd-mm-yyyy"
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

// ====================================================
// --- DATA & UI MANAGEMENT (TABLE & SORTING) ---
// ====================================================

/**
 * Fetches all records from the backend and initializes the in-memory database.
 */
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
        
        // NEW: Fetch Pending Statuses
        const pendingResponse = await fetch(`${BASE_URL}/api/pending-statuses`);
        if (pendingResponse.ok) {
            const pendingList = await pendingResponse.json();
            PENDING_BADGES = new Set(pendingList); // Store pending badge numbers
        } else {
             console.warn("Could not fetch pending statuses.");
        }
        
        // Re-run the table update to display data
        updateTable();
    } catch (err) {
        console.error("Error loading records:", err);
        alert("Failed to load database. See console.");
    }
}

/**
 * Renders the member data table based on the current role and filtered records.
 */
function updateTable() {
    // Select the correct table body ID based on the current user's role
    const tableBodyId = CURRENT_USER.role === 'admin' ? 'admin-records-body' : 'user-records-body';
    let tbody = document.getElementById(tableBodyId);

    if (!tbody) {
        // Fallback for missing elements or initial load state
        console.warn(`Warning: Could not find active table body for role: ${CURRENT_USER.role}`);
        return;
    }
    
    tbody.innerHTML = '';
    const recordsToDisplay = database.filteredRecords;

    if (recordsToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">No records found.</td></tr>'; 
        return;
    }
    
    recordsToDisplay.forEach((record, i) => { 
        // Image source correction for Cloudinary/HTTP URLs
        const imageSrc = record.pic && record.pic.startsWith('http') && record.pic !== 'demo.png'
            ? record.pic 
            : 'demo.png';

        const isSelected = database.selectedRecords.has(record.badge_no);
        const hasPendingRequest = PENDING_BADGES.has(record.badge_no); // <--- CHECK STATUS HERE
        const row = document.createElement('tr');
        if (isSelected) row.classList.add('selected-row');
        if (hasPendingRequest) row.classList.add('pending-status-row'); // <--- ADD CLASS HERE
        
        const birthDateFormatted = formatDateDDMMYYYY(record.birth_date);
        const ageCalculated = calculateAge(birthDateFormatted);

        const pendingBadgeHtml = hasPendingRequest ? 
            '<span style="color: orange; font-weight: bold; margin-left: 5px;" title="Pending Action Request"> ⚠️</span>' : '';
        
       row.innerHTML = `
            <td><input type="checkbox" class="record-checkbox" data-badge-no="${record.badge_no}" ${isSelected ? 'checked' : ''} onchange="toggleRecordSelection(this)"></td>
            <td>${i + 1}</td>
            <td>${record.badge_type || ''}</td>
            <td>${record.badge_no || ''}</td>
            
            <td><img src="${imageSrc}" alt="pic" style="height:50px;width:50px;border-radius:50%; object-fit: cover;"></td>
            <td>${record.name || ''} ${pendingBadgeHtml}</td> <td>${record.parent_name || ''}</td>
            <td>${record.gender || ''}</td>
            <td>${record.phone || ''}</td>
            <td>${birthDateFormatted || ''}</td>
            <td>${!isNaN(ageCalculated) ? ageCalculated : 'N/A'}</td>
            <td>${record.address || ''}</td>
            <td>
                <button onclick="showMemberActions('${record.badge_no}')">Action</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}
/**
 * Applies client-side filtering and search to the records list.
 */
function filterAndSearchRecords() {
    // Determine which section's inputs to use (Admin or User)
    let searchId;
    let filterId;

    if (CURRENT_USER.role === 'admin') {
        searchId = 'global-search';
        filterId = 'badge-type-filter';
    } else if (CURRENT_USER.role === 'user') {
        searchId = 'user-global-search';
        filterId = 'user-badge-type-filter';
    } else {
        return;
    }
    
    // Get values from the correct inputs
    const searchTerm = document.getElementById(searchId)?.value.trim().toUpperCase() || '';
    const badgeTypeFilter = document.getElementById(filterId)?.value.trim().toUpperCase() || '';
    
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

    updateTable();
}

/**
 * Sorts the filtered records based on a key and toggles the direction.
 * @param {string} key - The column key to sort by.
 * @param {HTMLElement} buttonElement - The button clicked for visual feedback.
 */
function sortRecords(key, buttonElement) {
    let direction = currentSortState.direction;
    
    if (currentSortState.key === key) {
        direction = direction === 'ASC' ? 'DESC' : 'ASC';
    } else {
        direction = 'ASC';
    }

    // Reset visual indicators on all buttons
    document.querySelectorAll('.sorting-actions button').forEach(btn => {
        btn.textContent = btn.textContent.replace(' ↑', '').replace(' ↓', '');
        btn.classList.remove('active-sort');
    });
    
    // Set visual indicator on the current button
    buttonElement.textContent += (direction === 'ASC' ? ' ↑' : ' ↓');
    buttonElement.classList.add('active-sort');

    currentSortState = { key: key, direction: direction };

    // Sorting logic
    database.filteredRecords.sort((a, b) => {
        let valA, valB;

        if (key === 'age') {
            valA = calculateAge(formatDateDDMMYYYY(a.birth_date)) || 0;
            valB = calculateAge(formatDateDDMMYYYY(b.birth_date)) || 0;

        } else if (key === 'name' || key === 'address' || key === 'gender' || key === 'parent_name') {
            // String comparison (case-insensitive)
            valA = (a[key] || '').toUpperCase();
            valB = (b[key] || '').toUpperCase();
        } else {
            // Default string comparison
            valA = (a[key] || '').toUpperCase();
            valB = (b[key] || '').toUpperCase();
        }

        if (valA < valB) {
            return direction === 'ASC' ? -1 : 1;
        }
        if (valA > valB) {
            return direction === 'ASC' ? 1 : -1;
        }
        return 0;
    });

    updateTable();
}

// ====================================================
// --- AUTHENTICATION & DASHBOARD REDIRECTION ---
// ====================================================

/**
 * Handles the user login process.
 */
// script.js

async function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
        const response = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });
        
        // --- START OF REQUIRED CHANGE ---
        
        const result = await response.json();

        // Check if the HTTP status code indicates success (200-299)
        if (response.ok) { 
            // Original success logic
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
            // Handle 401 (Invalid Credentials) or 403 (Disabled Account)
            // The result.message contains the specific error text ("Invalid credentials" 
            // or "Your account is currently disabled. Please contact the administrator.")
            alert(result.message);
        }
        
        // --- END OF REQUIRED CHANGE ---

    } catch (error) {
        console.error('Login error:', error);
        alert('An error occurred during login. Please try again.');
    }
}


/**
 * Logs out the current user and resets the UI.
 */
function logout() {
    CURRENT_USER = {};
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("admin-dashboard").style.display = "none";
    document.getElementById("user-dashboard").style.display = "none";
    alert('Logout Successful!');
}

/**
 * Shows the requested Admin dashboard section and triggers necessary data loads.
 * @param {string} sectionId - The ID of the section to display.
 */
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
        // Refresh master list when viewing members
        initializeDatabase(); 
    } 
    
    else if (sectionId === 'manage-requests-section') { 
        loadPendingRequests(); 
    }

    else if (sectionId === 'manage-users-section') {
        // Ensure the sub-sections are managed correctly on main tab click
        const defaultUserSection = document.getElementById('view-users-list-section');
        document.querySelectorAll('#manage-users-content section').forEach(sec => sec.style.display = 'none');
        
        if (defaultUserSection) {
            defaultUserSection.style.display = 'block';
            viewAllUsers(); // Load user list by default
        }
    }
}

/**
 * Shows the requested User dashboard section and triggers necessary data loads.
 * @param {string} sectionId - The ID of the section to display.
 */
function showUserSection(sectionId) {
    const sections = document.querySelectorAll('#user-dashboard .content-area section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
    
    const requestedSection = document.getElementById(sectionId);
    if (requestedSection) {
        requestedSection.style.display = 'block';
    }

    if (sectionId === 'user-view-section') {
        // Reload master list for the user view
        initializeDatabase(); 
    } 
    
    else if (sectionId === 'user-requests-section') {
        fetchAndRenderUserRequests(); // Load submitted requests by the user
    }
}

/**
 * Sets up all dashboard navigation listeners. (Should be called once on page load)
 */
function setupDashboardListeners() {
    // Admin Dashboard Button Listeners
    document.getElementById('add-member-btn')?.addEventListener('click', () => showAdminSection('add-section'));
    document.getElementById('view-members-btn')?.addEventListener('click', () => showAdminSection('view-section'));
    document.getElementById('print-list-btn')?.addEventListener('click', () => showAdminSection('print-list-section'));
    document.getElementById('manage-requests-btn')?.addEventListener('click', () => showAdminSection('manage-requests-section'));
    document.getElementById('manage-users-btn')?.addEventListener('click', () => showAdminSection('manage-users-section'));

    // Admin User Management Sub-section Listeners
    document.getElementById('add-user-sub-btn')?.addEventListener('click', () => showUserSubSection('add-user-section'));
    document.getElementById('view-users-sub-btn')?.addEventListener('click', () => { showUserSubSection('view-users-list-section'); viewAllUsers(); });
    document.getElementById('manage-password-sub-btn')?.addEventListener('click', () => showUserSubSection('manage-password-section'));
    document.getElementById('view-logs-sub-btn')?.addEventListener('click', () => { showUserSubSection('view-logs-section'); viewLogs(); });

    // User Dashboard Button Listeners
    document.getElementById('user-add-member-btn')?.addEventListener('click', () => showUserSection('user-add-section'));
    document.getElementById('user-view-members-btn')?.addEventListener('click', () => showUserSection('user-view-section'));
    document.getElementById('user-print-list-btn')?.addEventListener('click', () => showUserSection('user-print-list-section'));
    document.getElementById('user-manage-requests-btn')?.addEventListener('click', () => showUserSection('user-requests-section'));
    document.getElementById('user-change-password-btn')?.addEventListener('click', () => showUserSection('user-change-password-section'));
}
document.addEventListener('DOMContentLoaded', setupDashboardListeners); // Run on page load

/**
 * Function to handle switching between sub-sections within Manage Users (Admin).
 * @param {string} sectionId - The ID of the user management sub-section.
 */
function showUserSubSection(sectionId) {
    const sections = document.querySelectorAll('#manage-users-content section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
    
    const requestedSection = document.getElementById(sectionId);
    if (requestedSection) {
        requestedSection.style.display = 'block';
    }
}

// Function to go back from the detail view
function goBackToUserList() {
    document.getElementById('user-account-detail-section').style.display = 'none';
    document.getElementById('view-users-list-section').style.display = 'block'; 
}


// ====================================================
// --- 6. USER ACCOUNT MANAGEMENT (ADMIN SECTION) ---
// ====================================================

/**
 * Admin: Adds a new user account linked to a member record.
 */
async function adminAddUser() {
    const badgeNo = document.getElementById('add-user-badge').value.trim().toUpperCase();
    const username = document.getElementById('add-user-username').value.trim();
    const role = document.getElementById('add-user-role').value;
    const addedBy = getLoggedInUsername();
    const email = document.getElementById('add-user-email').value.trim();
    
   if (!badgeNo || !username || !role || !email) {
        return alert('All fields except Password are required.'); // Updated message
    }

    try {
        const response = await fetch(`${BASE_URL}/api/users/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ username, role, addedBy, badgeNo, email }) // <-- REMOVE 'password' from body
        });

        const result = await response.json();

        if (result.success) {
            alert(`User '${username}' added successfully!`);
            document.getElementById('add-user-form')?.reset();
            
            // Redirect and refresh list
            showUserSubSection('view-users-list-section');
            viewAllUsers();
            
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error adding user:', error);
        alert('Server connectivity error. Check console.');
    }
}

/**
 * Admin: Fetches and displays the list of all system users.
 */
async function viewAllUsers() {
    const container = document.getElementById('users-list-container');
    if (!container) return console.error("User list container missing (#users-list-container).");

    container.innerHTML = '<h2><i class="fa fa-spinner fa-spin"></i> Loading Users...</h2>';

    try {
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
                    <td>${user.username}</td> 
                    <td>
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

/**
 * Admin: Permanently deletes a user account with confirmation.
 * @param {string} targetUsername - Username to delete.
 */
async function permanentlyDeleteUser(targetUsername) {
    if (!confirm(`WARNING: Are you sure you want to PERMANENTLY DELETE user ${targetUsername}? This action cannot be undone.`)) {
        return;
    }
    
    const finalConfirm = prompt(`TYPE the username "${targetUsername}" to confirm permanent deletion:`);
    if (finalConfirm !== targetUsername) {
        return alert("Deletion cancelled. Username did not match.");
    }

    try {
        const deletedBy = getLoggedInUsername();

        const response = await fetch(`${BASE_URL}/api/users/${targetUsername}`, {
            method: 'DELETE', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                deletedBy: deletedBy,
                reason: `User permanently deleted by ${deletedBy}.` 
            }), 
        });

        if (!response.ok) {
            const errorText = await response.text();
            try {
                const errorData = JSON.parse(errorText);
                throw new Error(`Deletion Failed: ${errorData.message}`);
            } catch {
                 throw new Error(`Deletion Failed (Server Crash): Check console for error details.`);
            }
        }

        alert(`User ${targetUsername} permanently deleted!`);
        viewAllUsers(); 
        
    } catch (error) {
        console.error('Error during permanent deletion:', error);
        alert(`Deletion failed! ${error.message || 'Check console for network error.'}`);
    }
}

/**
 * Admin: Updates a user's role.
 * @param {string} targetUsername - Username to update.
 * @param {string} newRole - The new role ('admin' or 'user').
 */
async function updateUserRole(targetUsername, newRole) {
    if (!confirm(`Confirm: Change role of user ${targetUsername} to ${newRole}?`)) {
        viewAllUsers(); 
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/users/update-role`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername, newRole, updatedBy: getLoggedInUsername() })
        });

        const result = await response.json();

        if (result.success) {
            alert(`Role of ${targetUsername} successfully updated to ${newRole}!`);
            viewAllUsers(); 
        } else {
            alert(`Role update failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error updating role:', error);
        alert('Network error during role update.');
    }
}

/**
 * Admin: Toggles a user's active/disabled status.
 * @param {string} targetUsername - Username to modify.
 * @param {boolean} isCurrentlyActive - Current status of the user.
 */
async function deleteUser(targetUsername, isCurrentlyActive) {
    const action = isCurrentlyActive ? 'DISABLE' : 'ENABLE';
    
    if (!confirm(`Confirm: ${action} user ${targetUsername}?`)) return;

    try {
        const response = await fetch(`${BASE_URL}/api/users/toggle-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername, isActive: !isCurrentlyActive, updatedBy: getLoggedInUsername() })
        });

        const result = await response.json();

        if (result.success) {
            alert(`User ${targetUsername} successfully ${action}D!`);
            viewAllUsers(); 
        } else {
            alert(`${action} failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error disabling/enabling user:', error);
        alert('Network error during user status change.');
    }
}

/**
 * Admin: Resets a user's password and sends new credentials via email.
 */
async function adminResetPassword() {
    // Only the target username is needed for the secure backend process.
    const targetUsername = document.getElementById('reset-username').value.trim();
    // The newPasswordInput is now unnecessary for validation/logic.
    const resetBy = getLoggedInUsername();

    if (!targetUsername) return alert('Username is required.');

    // Removed the confusing validation for newPasswordInput.

    if (!confirm(`Confirm: Reset password for ${targetUsername}? A new random temporary password will be generated, HASHED, and securely emailed to the user's registered address.`)) return;

    try {
        // The body only needs the targetUsername and the actor (resetBy)
        const response = await fetch(`${BASE_URL}/api/users/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUsername, resetBy }) 
        });

        const result = await response.json();

        // Ensure we check for non-200 status codes (though this API should only return 200 or 404/500)
        if (response.ok) {
            alert(`Password successfully reset for user '${targetUsername}'. New temporary password sent via email!`);
            document.getElementById('reset-password-form').reset();
        } else {
            alert(`Password reset failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        alert('Server connectivity error. Check console.');
    }
}

/**
 * Admin: Fetches and displays the detailed account information for a single user.
 * @param {string} username - The username to view.
 */
// script.js (Updated function viewUserDetails - Encodes data for safe passing)
async function viewUserDetails(username) {
    if (!username) return alert("Error: Username missing.");

    const listSection = document.getElementById('view-users-list-section');
    const detailSection = document.getElementById('user-account-detail-section');
    
    if (!listSection || !detailSection) return console.error("User Detail containers missing.");

    listSection.style.display = 'none';
    detailSection.style.display = 'block';
    detailSection.innerHTML = '<h2>Loading User Details...</h2>'; 

    try {
        const response = await fetch(`${BASE_URL}/api/user/${username}`); 
        if (!response.ok) throw new Error('User details not found.');
        
        const user = await response.json();
        const userPicUrl = user.pic && user.pic.startsWith('http') ? user.pic : `${BASE_URL}/${user.pic}`;
        const finalPicSrc = user.pic ? userPicUrl : 'demo.png'; 
        
        // CRITICAL FIX: Encode the entire user object to safely pass it to the edit function
        const encodedUserData = encodeBase64(JSON.stringify(user)); 

        // RENDER: Default READ-ONLY view using <p> tags
        detailSection.innerHTML = `
            <button onclick="goBackToUserList()" style="float:right; margin-bottom: 20px;">Go Back</button>
            
            <button id="edit-user-btn" onclick="editUserAccount('${user.username}', '${encodedUserData}')" class="btn-primary" style="float:right; margin-bottom: 20px; margin-right: 10px;">
                📝 Edit Details
            </button>
            <button id="save-user-btn" onclick="saveUserAccount('${user.username}')" class="btn-approve" style="float:right; margin-bottom: 20px; margin-right: 10px; display: none;">
                💾 Save Changes
            </button>
            
            <div id="user-detail-form-card" style="
                border: 2px solid #5cb85c; padding: 20px; max-width: 400px; background-color: #f9fff9; 
                border-radius: 5px; color: #333; box-shadow: 0 0 5px rgba(0,0,0,0.1);
            ">
                <h3 style="margin-top: 0; border-bottom: 1px solid #5cb85c; padding-bottom: 10px; color: #333;">
                    Account Details
                </h3>

                <div style="text-align: center; margin-bottom: 15px;">
                    <p style="margin: 0; font-weight: bold;">Picture:</p>
                    <img src="${finalPicSrc}" alt="${user.name} Profile Pic" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #ccc; margin-top: 5px;">
                </div>

                <p><strong>Username:</strong> ${user.username}</p>
                <p><strong>Role:</strong> <span style="font-weight: bold; color: ${user.role === 'admin' ? 'red' : 'green'};">${user.role.toUpperCase()}</span></p>
                
                <hr style="border: 0; border-top: 1px dashed #ccc;">
                
                <div id="editable-fields-container"> 
                    <p><strong>Badge No:</strong> <span class="editable-value" id="badgeNo-display">${user.badge_no || 'N/A'}</span></p>
                    <p><strong>Name:</strong> <span class="editable-value" id="name-display">${user.name || 'N/A'}</span></p>
                    <p><strong>Phone:</strong> <span class="editable-value" id="phone-display">${user.phone || 'N/A'}</span></p>
                    <p><strong>Email:</strong> <span class="editable-value" id="email-display">${user.email || 'N/A'}</span></p>
                    <p><strong>Address:</strong> <span class="editable-value" id="address-display">${user.address || 'N/A'}</span></p>
                </div>
                
                <p><strong>Status:</strong> <span style="color: ${user.is_active ? 'green' : 'red'}; font-weight: bold;">${user.is_active ? 'Active' : 'Disabled'}</span></p>
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

// script.js (New functions for Admin User Edit)

/**
 * Admin: Toggles the user detail view into editable mode.
 * @param {string} username - The username being edited.
 */
function editUserAccount(username, encodedUserData) {
    const container = document.getElementById('editable-fields-container');
    if (!container) return;
    
    let userData;
    try {
        // Decode the Base64 string and parse JSON to get the user object
        userData = JSON.parse(decodeBase64(encodedUserData));
    } catch (e) {
        console.error("Error decoding user data for edit:", e);
        return alert("Failed to load user data for editing. Check console.");
    }

    // Map the fields we want to edit
    const fields = [
        { key: 'badge-no', label: 'Badge No:', type: 'text', value: userData.badge_no || '' },
        { key: 'name', label: 'Name:', type: 'text', value: userData.name || '' },
        { key: 'phone', label: 'Phone:', type: 'text', value: userData.phone || '', maxlength: 10 },
        { key: 'email', label: 'Email:', type: 'email', value: userData.email || '' },
        { key: 'address', label: 'Address:', type: 'text', value: userData.address || '' }
    ];

    let editableHtml = '';
    
    fields.forEach(field => {
        // Use hyphens in ID for consistency (e.g., edit-badge-no)
        const inputId = `edit-${field.key}`; 
        
        editableHtml += `
            <div class="form-group" data-key="${field.key}">
                <label for="${inputId}">${field.label}</label>
                <input type="${field.type}" 
                       id="${inputId}" 
                       value="${field.value}"
                       ${field.maxlength ? `maxlength="${field.maxlength}"` : ''} 
                       style="background-color: #fff8e1; border: 1px solid #007bff;">
            </div>
        `;
    });

    // Replace the read-only P tags with the editable HTML inputs
    container.innerHTML = editableHtml;

    // 2. Buttons ko switch karna
    const editBtn = document.getElementById('edit-user-btn');
    const saveBtn = document.getElementById('save-user-btn');
    
    if (editBtn) editBtn.style.display = 'none';
    if (saveBtn) saveBtn.style.display = 'block';
}

/**
 * Admin: Saves the updated user account details via API call.
 * @param {string} username - The username being saved.
 */
async function saveUserAccount(username) {
    // CRITICAL FIX: Use the correct IDs rendered in the editUserAccount function
    const badgeNo = document.getElementById('edit-badge-no')?.value.trim();
    const name = document.getElementById('edit-name')?.value.trim().toUpperCase(); // Name must be uppercase
    const phone = document.getElementById('edit-phone')?.value.trim();
    const email = document.getElementById('edit-email')?.value.trim();
    const address = document.getElementById('edit-address')?.value.trim();
    const updatedBy = getLoggedInUsername();

    // ERROR CHECK: If any input is null, it means the structure is wrong or the user exited edit mode.
    if (!document.getElementById('edit-badge-no') || !document.getElementById('edit-name')) {
        // Fallback: Reload the read-only view and alert
        alert('Error: Could not find editable fields. Reloading view.');
        viewUserDetails(username); 
        return;
    }

    // Basic Validation
    if (!badgeNo || !name || !email) {
        return alert('Badge No, Name, and Email are required.');
    }
    if (phone && !/^\d{10}$/.test(phone)) {
        return alert('Phone number must be 10 digits.');
    }

    if (!confirm(`Confirm: Save changes for user ${username}?`)) {
        // Agar cancel kiya, toh view ko refresh kar do
        viewUserDetails(username); 
        return;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/users/${username}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ badgeNo, name, phone, email, address, updatedBy })
        });

        const result = await response.json();

        if (response.ok) {
            alert(`User ${username} details updated successfully!`);
            // Reload the detail view in read-only mode (This re-renders the component)
            viewUserDetails(username); 
        } else {
            alert(`Update Failed: ${result.message}`);
            viewUserDetails(username); // Reload on failure
        }
    } catch (error) {
        console.error('Error saving user details:', error);
        alert('Network error while saving changes. Check console.');
    }
}


// ====================================================
// --- 7. LOGGING SYSTEM (ADMIN) ---
// ====================================================

/**
 * Main function to fetch, filter, and display system logs.
 */
async function viewLogs() {
    const container = document.getElementById('logs-list-container');
    const filterUser = document.getElementById('log-filter-user')?.value.trim().toUpperCase() || '';
    const filterAction = document.getElementById('log-filter-action')?.value.toUpperCase() || '';
    
    if (!container) return console.error("Logs container missing (#logs-list-container).");

    container.innerHTML = '<h2><i class="fa fa-spinner fa-spin"></i> Loading System Logs...</h2>';

    try {
        // Fetch data only if not already loaded
        if (ALL_SYSTEM_LOGS.length === 0) {
            // Note: Backend limits to 100 logs
            const response = await fetch(`${BASE_URL}/api/logs`); 
            if (!response.ok) throw new Error('Failed to fetch logs.');
            ALL_SYSTEM_LOGS = await response.json();
        }
        
        // Apply Client-Side Filtering
        const filteredLogs = ALL_SYSTEM_LOGS.filter(log => {
            const matchesUser = log.actor_username && log.actor_username.toUpperCase().includes(filterUser);
            const matchesAction = filterAction === '' || log.action_type.toUpperCase() === filterAction;
            return matchesUser && matchesAction;
        });

        // Render the filtered logs
        renderLogsTable(filteredLogs, container);

    } catch (error) {
        console.error('Error fetching logs:', error);
        container.innerHTML = `<h2>Error loading logs. Check console.</h2>`;
    }
}

/**
 * Helper function to render the logs data into an HTML table.
 * @param {Array} logs - Array of log objects.
 * @param {HTMLElement} container - The container element to render into.
 */
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
        const logDate = new Date(log.log_timestamp).toLocaleString('en-IN', {
            dateStyle: 'short',
            timeStyle: 'medium'
        });

        tableHTML += `
            <tr onclick="viewLogDetails(${log.log_id})" style="cursor: pointer;" title="Click to view full snapshot"> <td>${logDate}</td>
                
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

/**
 * Clears the log cache and re-fetches logs.
 */
function refreshLogs() {
    ALL_SYSTEM_LOGS = []; // Clear cache
    viewLogs(); // Re-run the main function
}

/**
 * Admin: Fetches and displays the full snapshot for a log entry.
 * @param {number} logId - The ID of the log entry.
 */
async function viewLogDetails(logId) {
    if (!logId) return;

    const container = document.getElementById('view-logs-section');
    const logList = document.getElementById('logs-list-container');
    
    // Create or retrieve the detail container
    let detailDiv = document.getElementById('log-detail-container');
    if (!detailDiv) {
        detailDiv = document.createElement('div');
        detailDiv.id = 'log-detail-container';
        container.appendChild(detailDiv);
    }

    logList.style.display = 'none';
    detailDiv.style.display = 'block';
    detailDiv.innerHTML = `<h3>Loading Log Detail #${logId}...</h3>`;

    try {
        const response = await fetch(`${BASE_URL}/api/logs/${logId}`);
        if (!response.ok) throw new Error('Log not found.');
        const log = await response.json();
        
        let snapshotHtml = 'Snapshot not available for this action type.';
        if (log.record_snapshot) {
            try {
                // Parse the JSON string for clean display
                const snapshot = JSON.parse(log.record_snapshot); 
                snapshotHtml = `<pre style="white-space: pre-wrap; background-color: #f4f4f4; padding: 15px; border-radius: 5px; border: 1px solid #ddd; max-height: 400px; overflow-y: auto;">${JSON.stringify(snapshot, null, 2)}</pre>`;
            } catch (e) {
                snapshotHtml = `Invalid Snapshot Data (Not JSON): ${log.record_snapshot}`;
            }
        }
        
        detailDiv.innerHTML = `
            <button onclick="goBackToLogsList()" style="float:right; margin-bottom: 10px;">⬅️ Back to Logs</button>
            <h3>Audit Log Details (ID: ${log.log_id})</h3>
            <p><strong>Timestamp:</strong> ${new Date(log.log_timestamp).toLocaleString()}</p>
            <p><strong>Action Type:</strong> <span class="log-type log-type-${log.action_type.toLowerCase().replace(/ /g, '-')}">${log.action_type}</span></p>
            <p><strong>Actor:</strong> ${log.actor_username}</p>
            <p><strong>Target Badge/User:</strong> ${log.target_badge_no || 'N/A'}</p>
            <p><strong>Tracking ID:</strong> ${log.tracking_id || 'N/A'}</p>
            <p><strong>Reason/Note:</strong> ${log.submission_reason || 'N/A'}</p>
            
            <h4 style="margin-top: 20px;">Record Snapshot at Time of Action:</h4>
            ${snapshotHtml}
        `;

    } catch (error) {
        console.error('Error fetching log details:', error);
        detailDiv.innerHTML = `<h3>Error loading log details.</h3>
                                <p style="color: red;">${error.message}</p>
                                <button onclick="goBackToLogsList()">Back to Logs</button>`;
    }
}

/**
 * Helper function to switch back to the main logs list view.
 */
function goBackToLogsList() {
    const logList = document.getElementById('logs-list-container');
    const detailDiv = document.getElementById('log-detail-container');
    
    if (logList) logList.style.display = 'block';
    if (detailDiv) detailDiv.style.display = 'none';
    
    // Re-run viewLogs to ensure filters are maintained
    viewLogs();
}

// ====================================================
// --- 8. MEMBER CRUD & MODERATION LOGIC ---
// ====================================================

// --- ACTION BUTTON HANDLERS (ADMIN/USER) ---

// script.js (Updated function showMemberActions - Around line 700)

async function showMemberActions(badgeNo) {
    if (!badgeNo) {
        alert("Error: Badge Number missing for action.");
        return;
    }
    
    const role = CURRENT_USER.role;
    const viewSectionId = role === 'admin' ? 'view-section' : 'user-view-section';
    const goBackFunctionName = role === 'admin' ? 'showAdminSection' : 'showUserSection';
    
    const detailSectionId = role === 'admin' ? 'member-detail-section' : 'user-member-detail-section';
    const detailSection = document.getElementById(detailSectionId);

    if (!detailSection) {
        console.error(`CRITICAL: Member detail section (${detailSectionId}) is missing in HTML.`);
        return;
    }

    // NEW LOGIC: Check for Pending Status (Requires PENDING_BADGES Set from Feature 5)
    // NOTE: If you haven't implemented PENDING_BADGES yet, this will always be false.
    const hasPendingRequest = PENDING_BADGES.has(badgeNo); 

    // UI Switch
    role === 'admin' ? showAdminSection(detailSectionId) : showUserSection(detailSectionId);
    detailSection.innerHTML = '<h2>Loading member details...</h2>'; 

    try {
        // Fetch single record
        const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`); 
        
        if (!response.ok) {
            alert('Record not found or failed to fetch.');
            role === 'admin' ? showAdminSection(viewSectionId) : showUserSection(viewSectionId);
            return;
        }
        
        const record = await response.json();
        
        // Image Source Path Correction
        const imageSrc = record.pic && record.pic.startsWith('http') && record.pic !== 'demo.png'
            ? record.pic
            : 'demo.png';

        // Conditional Button for Viewing Pending Details
        const pendingDetailButton = hasPendingRequest ? 
            // This button calls the new function viewPendingRequestDetails
            `
            <button onclick="viewPendingRequestDetails('${record.badge_no}')" class="btn-primary" style="background-color: orange; margin-bottom: 10px;">
                🔍 View Pending Request Details
            </button>
            ` 
            : '';
            
        // Conditional Status Display
        const statusDisplay = hasPendingRequest 
            ? '<span style="color: orange; font-weight: bold;">⚠️ Under Moderation Review</span>' 
            : '<span style="color: green;">✅ Active Record</span>';
            
        // Populate HTML Section
        detailSection.innerHTML = `
            <button onclick="${goBackFunctionName}('${viewSectionId}')" style="float:right;">Go Back</button>
            <h2>Member Details & Actions: ${record.name}</h2>
            <div style="display:flex; gap:20px; align-items:center; padding: 20px 0;">
                
                <img src="${imageSrc}" style="width:120px; height:120px; border-radius:5px; object-fit: cover;">
                
                <div>
                    <p><strong>Badge No:</strong> ${record.badge_no}</p>
                    <p><strong>Status:</strong> ${statusDisplay}</p>
                    <p><strong>Parent:</strong> ${record.parent_name || 'N/A'}</p>
                    <p><strong>Phone:</strong> ${record.phone || 'N/A'}</p>
                    <p><strong>Birth Date:</strong> ${formatDateDDMMYYYY(record.birth_date)} (Age: ${calculateAge(formatDateDDMMYYYY(record.birth_date))})</p>
                    <p><strong>Address:</strong> ${record.address || 'N/A'}</p>
                </div>
            </div>
            <hr>
            <h3>Actions:</h3>
            
            ${pendingDetailButton}  <button onclick="editMember('${record.badge_no}')">
                ${role === 'admin' ? 'Update Record' : 'Submit Update Request'}
            </button>
            <button onclick="deleteMember('${record.badge_no}')" class="btn-delete" style="margin-left: 10px;">
                ${role === 'admin' ? 'Delete Record' : 'Submit Delete Request'}
            </button>
        `;
        
    } catch (error) {
        console.error('Error fetching member details (Rendering issue):', error);
        alert('Could not fetch member details for action. Check console for rendering error.');
        role === 'admin' ? showAdminSection(viewSectionId) : showUserSection(viewSectionId);
    }
}

// --- ADD LOGIC ---

/**
 * User: Submits an ADD request to the Moderation Queue.
 */
async function submitRecordRequest() {
    const currentUsername = getLoggedInUsername();

    // Data Collection (using consistent IDs)
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
    
    // Validation
    if (!reason || reason.length < 5) return alert('Submission reason is mandatory (min 5 characters).');
    if (!badgeType || !/^[A-Z]{2}-\d{6}$/.test(badgeNo) || !badgeNo || !name || !parent || !phone || !birthRaw || !address) return alert('All fields are required and Badge No. format must be "AM-123456"!');
    if (!/^\d{10}$/.test(phone)) return alert('Phone must be 10 digits!');
    
    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // ID Generation & FormData Assembly
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

    // API Call
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
            alert('Request submitted for Admin approval! Request ID: ' + requestID);
            
            initializeDatabase(); 
            
            document.getElementById('user-add-record-form').reset();
            showUserSection('user-requests-section'); 
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error submitting request:', error);
        alert('An error occurred while submitting the request. Check console.');
    }
}

/**
 * Admin: Directly adds a record to the database with logging.
 */
async function adminAddRecord() {
    // Data Collection (using consistent IDs)
    const badgeType = document.getElementById('add-badge-type').value.trim().toUpperCase();
    const badgeNo = document.getElementById('add-badge').value.trim().toUpperCase();
    const name = document.getElementById('add-name').value.trim().toUpperCase();
    const parent = document.getElementById('add-parent').value.trim().toUpperCase();
    const gender = document.getElementById('add-gender').value;
    const phone = document.getElementById('add-phone').value.trim();
    const birthRaw = document.getElementById('add-birth').value;
    const address = document.getElementById('add-address').value.trim().toUpperCase();
    const picInput = document.getElementById('add-pic');
    
    // Validation
    if (!badgeType || !/^[A-Z]{2}-\d{6}$/.test(badgeNo) || !badgeNo || !name || !parent || !phone || !birthRaw || !address) return alert('All fields are required and Badge No. format must be "AM-123456"!');
    if (!/^\d{10}$/.test(phone)) return alert('Phone must be 10 digits!');
    
    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // Tracking ID Generation
    const adminTrackingID = generateRequestID('ADMIN_ADD', badgeNo, 'ADMIN_DIRECT'); 
    
    const formData = new FormData();
    formData.append('badgeType', badgeType);
    formData.append('badgeNo', badgeNo);
    formData.append('name', name);
    formData.append('parent', parent);
    formData.append('gender', gender);
    formData.append('phone', phone);
    formData.append('birth', birth);
    formData.append('address', address);
    formData.append('adminTrackingID', adminTrackingID);
    
    if (picInput.files.length > 0) {
        formData.append('pic', picInput.files[0]);
    }

    // API Call: Direct to Database
    try {
        const response = await fetch(`${BASE_URL}/api/records`, { 
            method: 'POST',
            body: formData,
        });
        
        if (!response.ok) {
            const errorData = await response.json(); 
            alert(`Record NOT added! Error: ${errorData.message}`);
            return;
        }

        const result = await response.json();
        
        if (result.success) {
            alert('Record successfully added directly to the database! Tracking ID: ' + adminTrackingID);
            
            initializeDatabase(); 
            
            document.getElementById('add-record-form').reset();
            showAdminSection('view-section');
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error adding record:', error);
        alert('An error occurred. Check console.');
    }
}


// --- UPDATE LOGIC ---

/**
 * Fetches a record and opens the appropriate update form (Admin or User).
 * @param {string} badgeNo - The badge number of the record to edit.
 */
async function editMember(badgeNo) {
    if (!badgeNo) return alert("Error: Badge Number missing.");

    try {
        const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`);
        if (!response.ok) throw new Error('Record not found.');
        const record = await response.json();
        
        const role = CURRENT_USER.role;

        // 1. Store Original badgeNo in hidden input for backend tracking
        const originalBadgeNoInput = document.getElementById(role === 'admin' ? 'admin-update-original-badge-no' : 'user-update-original-badge-no');
        if(originalBadgeNoInput) {
            originalBadgeNoInput.value = badgeNo;
        }

        // Hide detail section
        const detailSectionIdToHide = role === 'admin' ? 'member-detail-section' : 'user-member-detail-section';
        document.getElementById(detailSectionIdToHide)?.style.display === 'none';
        
        // 2. Show the Update form and fill data
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

/**
 * Dynamically fills the update form fields with record data.
 * @param {object} record - The member record data.
 * @param {string} formContainerId - The ID of the container div.
 * @param {boolean} isModerated - True if user (moderated), false if admin (direct).
 */
function fillUpdateForm(record, formContainerId, isModerated) {
    const container = document.getElementById(formContainerId);
    if (!container) return;

    const formattedBirthDate = formatDateDDMMYYYY(record.birth_date); 
    const prefix = isModerated ? 'user-update' : 'admin-update';
    
    // CRITICAL FIX: Image Source Path Correction
    const imageSrc = record.pic && record.pic.startsWith('http') && record.pic !== 'demo.png'
        ? record.pic
        : 'demo.png';
    
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
            
            <img src="${imageSrc}" style="width:100px; height:100px; border-radius:50%; margin-bottom: 10px; object-fit: cover;">
            
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
            <label>Birth Date (dd-mm-yyyy):</label>
            <input type="text" id="${prefix}-birth" value="${formattedBirthDate}" placeholder="dd-mm-yyyy">
        </div>
        <div class="form-group">
            <label>Address:</label>
            <input type="text" id="${prefix}-address" value="${record.address || ''}">
        </div>
    `;
}

/**
 * User: Submits an UPDATE request to the Moderation Queue.
 */
async function userSubmitUpdateRequest() {
    const currentUsername = getLoggedInUsername();

    // Data Collection
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
    const oldPicPath = document.getElementById('user-update-pic-path-old')?.value;
    const reason = document.getElementById('user-update-reason')?.value.trim(); 
    
    // Validation
    if (!originalBadgeNo || !reason || reason.length < 5 || !badgeType || !badgeNo || !name || !parent || !phone || !birthRaw || !address || !/^\d{10}$/.test(phone)) return alert('Validation failed. Check mandatory fields, phone number (10 digits), and reason (min 5 characters).');

    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // ID Generation & FormData Assembly
    const requestID = generateRequestID('UPDATE', originalBadgeNo, currentUsername);
    
    const formData = new FormData();
    
    // User/Request Metadata
    formData.append('type', 'UPDATE'); 
    formData.append('username', currentUsername); 
    formData.append('reason', reason); 
    formData.append('requestID', requestID); 
    formData.append('originalBadgeNo', originalBadgeNo);
    
    // Record Details (The requested changes)
    formData.append('badgeType', badgeType);
    formData.append('badgeNo', badgeNo); 
    formData.append('name', name);
    formData.append('parent', parent);
    formData.append('gender', gender);
    formData.append('phone', phone);
    formData.append('birth', birth);
    formData.append('address', address);
    
    // PICTURE PERSISTENCE LOGIC (Cloudinary)
    if (picInput && picInput.files.length > 0) {
        formData.append('pic', picInput.files[0]); 
    } else if (oldPicPath) {
        // Send the existing pic path to the backend for inclusion in the JSONB snapshot
        formData.append('oldPicPath', oldPicPath); 
    }
    
    // API Call
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
                alert(`Update Request Failed! Server responded with HTTP ${response.status}. Check console.`);
            }
            return;
        }

        alert('Update request submitted for Admin approval! Tracking ID: ' + requestID);
        document.getElementById('user-update-record-form')?.reset();
        showUserSection('user-requests-section'); 
        
    } catch (error) {
        console.error('Network Error submitting update request:', error);
        alert('A network error occurred while submitting the request. Check console.');
    }
}

/**
 * Admin: Directly updates a record in the database with logging.
 */
async function adminSubmitUpdate() {
    // Data Collection
    const originalBadgeNo = document.getElementById('admin-update-original-badge-no').value;
    const badgeType = document.getElementById('admin-update-badge-type').value.trim().toUpperCase();
    const badgeNo = document.getElementById('admin-update-badge-no').value.trim().toUpperCase();
    const name = document.getElementById('admin-update-name').value.trim().toUpperCase();
    const parent = document.getElementById('admin-update-parent').value.trim().toUpperCase();
    const gender = document.getElementById('admin-update-gender').value;
    const phone = document.getElementById('admin-update-phone').value.trim();
    const birthRaw = document.getElementById('admin-update-birth').value;
    const address = document.getElementById('admin-update-address').value.trim().toUpperCase();
    const picInput = document.getElementById('admin-update-pic');
    const oldPicPath = document.getElementById('admin-update-pic-path-old')?.value;

    // Validation
    if (!originalBadgeNo || !badgeNo || !name || !parent || !phone || !birthRaw || !address || !/^\d{10}$/.test(phone)) return alert('Validation failed. All fields are required and Phone must be 10 digits.');
    
    let birth = '';
    const parts = birthRaw.split('-');
    if (parts.length === 3) {
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }
    
    // Tracking ID Generation
    const adminTrackingID = generateRequestID('ADMIN_UPDATE', originalBadgeNo, 'ADMIN_DIRECT'); 
    
    // FormData Assembly
    const formData = new FormData();
    formData.append('badgeType', badgeType);
    formData.append('badgeNo', badgeNo); 
    formData.append('name', name);
    formData.append('parent', parent);
    formData.append('gender', gender);
    formData.append('phone', phone);
    formData.append('birth', birth);
    formData.append('address', address);
    
    formData.append('adminTrackingID', adminTrackingID); 
    
    // PICTURE PERSISTENCE LOGIC
    if (picInput && picInput.files.length > 0) {
        formData.append('pic', picInput.files[0]); 
    } else if (oldPicPath) {
        formData.append('pic', oldPicPath); 
    }

    // API Call: Direct PUT to Database
    try {
        const response = await fetch(`${BASE_URL}/api/records/${originalBadgeNo}`, { 
            method: 'PUT',
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

// --- DELETE LOGIC ---

/**
 * Handles Delete action: Direct delete for Admin, submit request for User.
 * @param {string} badgeNo - The badge number to delete/request deletion for.
 */
async function deleteMember(badgeNo) {
    if (!badgeNo) return alert("Error: Badge Number missing.");

    const role = CURRENT_USER.role;
    const currentUsername = getLoggedInUsername();

    const reason = prompt(`Please enter the reason for the ${role === 'admin' ? 'deletion' : 'delete request'} of Badge No. ${badgeNo}:`);
    if (!reason || reason.trim() === '') return alert('Reason is mandatory for auditing.');

    const trackingID = generateRequestID('DELETE', badgeNo, role === 'admin' ? 'ADMIN_DIRECT' : currentUsername);

    // --- ADMIN: DIRECT DELETE ---
    if (role === 'admin') {
        if (confirm(`ADMIN CONFIRMATION: Are you sure you want to DELETE record ${badgeNo} directly?`)) {
            try {
                const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`, { 
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
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
                initializeDatabase(); 
                showAdminSection('view-section');
                
            } catch (error) {
                console.error('Error during direct deletion:', error);
                alert('An unexpected network error occurred during deletion. Check console.');
            }
        }
        
    // --- USER: SUBMIT DELETE REQUEST ---
    } else if (role === 'user') {
        
        // 2. Fetch Original Record Data (Snapshot)
        let originalRecord;
        try {
            const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`);
            if (!response.ok) throw new Error('Original Record not found for deletion.');
            originalRecord = await response.json();
        } catch (error) {
            console.error('Error fetching original record for deletion:', error);
            return alert('Original record details could not be fetched. Please contact Admin.');
        }

        if (confirm(`Submit delete request for ${badgeNo} to Admin?`)) {
            
            // 3. FormData Assembly: Sending the Original Data Snapshot
            const formData = new FormData();
            
            // Request/Moderation Metadata
            formData.append('type', 'DELETE'); 
            formData.append('username', currentUsername); 
            formData.append('reason', reason); 
            formData.append('requestID', trackingID); 
            formData.append('badgeNo', badgeNo); 
            formData.append('originalBadgeNo', badgeNo); 

            // Critical: Full Original Record Data is required by backend moderation table
            formData.append('badgeType', originalRecord.badge_type || '');
            formData.append('name', originalRecord.name || '');
            formData.append('parent', originalRecord.parent_name || '');
            formData.append('gender', originalRecord.gender || '');
            formData.append('phone', originalRecord.phone || '');
            formData.append('birth', originalRecord.birth_date || ''); // YYYY-MM-DD format
            formData.append('address', originalRecord.address || ''); 
            formData.append('pic', originalRecord.pic || 'demo.png'); 

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
                alert('A network error occurred while submitting the request. Check console.');
            }
        }
    }
}

// --- MODERATION (ADMIN) ---

/**
 * Fetches and displays all Pending Moderation Requests for admin review.
 */
async function loadPendingRequests() {
    const listContainer = document.getElementById('requests-list-container');
    const detailContainer = document.getElementById('request-details-view'); 
    
    if (!listContainer) return console.error("List container missing.");
    
    // UI State ko reset karna
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
            
            const dateObj = new Date(String(req.submission_timestamp).replace(' ', 'T'));
            const submittedDateTime = isNaN(dateObj.getTime()) ? 'N/A' : dateObj.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
            
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

/**
 * Opens the detailed view for a moderation request, fetching both requested and original data.
 * @param {number} requestId - The ID of the moderation request.
 */
async function viewRequestDetails(requestId) {
    const listContainer = document.getElementById('requests-list-container');
    const detailContainer = document.getElementById('request-details-view'); 
    
    if (!listContainer || !detailContainer) {
        console.error("Containers missing for request review.");
        return;
    }

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
        
        // Fetch Original Record Data (Needed for UPDATE/DELETE comparison)
        let originalRecord = null;
        if (request.request_type !== 'ADD' && targetBadge) {
            const originalResponse = await fetch(`${BASE_URL}/api/records/${targetBadge}`);
            if (originalResponse.ok) {
                originalRecord = await originalResponse.json();
            }
        }

        // --- NEW STEP: Fetch Request History ---
        let history = [];
        try {
            const historyResponse = await fetch(`${BASE_URL}/api/request-history/${targetBadge}`);
            if (historyResponse.ok) {
                 history = await historyResponse.json();
            }
            // Note: If request history is empty, it returns an empty array, which is fine.
        } catch (e) {
            console.warn("Could not fetch request history:", e);
        }
        // --- END NEW STEP ---

        // Render the details (Call renderRequestDetails with history)
        renderRequestDetails(request, originalRecord, detailContainer, history); // <--- Pass history as the 4th argument

    } catch (error) {
        console.error('Error fetching request details:', error);
        detailContainer.innerHTML = `<h2>Error: ${error.message}</h2>
                                     <button onclick="loadPendingRequests()">Go Back</button>`;
    }
}

/**
 * Renders the side-by-side comparison view for moderation.
 * @param {object} request - The moderation request object.
 * @param {object} originalRecord - The existing record from the 'persons' table.
 * @param {HTMLElement} container - The container element.
 */
function renderRequestDetails(request, originalRecord, container, history) {
    const requestedData = request.requested_data; 
    const originalReason = request.submission_reason;
    
    const isUpdate = request.request_type === 'UPDATE';
    const isDelete = request.request_type === 'DELETE';
    const isAdd = request.request_type === 'ADD';
    
    const originalExists = originalRecord && originalRecord.badge_no;
    const submittedTime = new Date(request.submission_timestamp).toLocaleString();

    // Helper functions
    const highlight = (originalVal, requestedVal) => {
        if (!isUpdate) return requestedVal || 'N/A';
        const originalString = String(originalVal || '');
        const requestedString = String(requestedVal || '');
        
        // Handle date formatting for comparison
        const originalDate = originalVal === originalRecord?.birth_date ? formatDateDDMMYYYY(originalVal) : originalString;
        const requestedDate = requestedVal === requestedData.birth_date ? formatDateDDMMYYYY(requestedVal) : requestedString;

        if (originalDate !== requestedDate) {
            return `<span style="color:red; font-weight:bold;">${requestedDate || 'Empty'}</span>`;
        }
        return requestedDate || 'N/A';
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
    
    // Color setup
    const mainBoxBorderColor = isDelete ? 'red' : (isUpdate ? 'red' : 'green');
    const mainBoxBgColor = isDelete ? '#fff0f0' : (isUpdate ? '#fff0f0' : '#f9fff9');
    const mainBoxHeaderColor = isDelete ? 'red' : (isUpdate ? 'red' : 'green');

    // --- NEW: History Rendering Logic ---
    let historyHtml = '';
    // Filter out the current pending request from the history list for cleaner display
    const filteredHistory = history.filter(item => item.request_id !== request.request_id);

    if (filteredHistory && filteredHistory.length > 0) {
        historyHtml = `
            <div style="margin-top: 30px; border-top: 2px dashed #ccc; padding-top: 15px;">
                <h4 style="color: #007bff;">History of Requests for Badge No. ${request.target_badge_no} (${filteredHistory.length} total processed)</h4>
                <ul style="list-style: none; padding: 0;">
                    ${filteredHistory.map(item => {
                        const statusColor = item.request_status === 'Approved' ? 'green' : 'red';
                        const statusIcon = item.request_status === 'Approved' ? '✅' : '❌';
                        
                        return `
                            <li onclick="showHistoryDetail(${item.request_id})" 
                                style="margin-bottom: 8px; padding-left: 10px; border-left: 4px solid ${statusColor}; 
                                       background-color: #f9f9f9; padding: 5px; cursor: pointer;" 
                                title="Click to view full detail of this ${item.request_type} request"> 
                                
                                <strong>${statusIcon} ${item.request_type}</strong> (ID: ${item.request_id})
                                <span style="float: right; font-size: 12px; color: #666;">
                                    Submitted: ${new Date(item.submission_timestamp).toLocaleDateString()}
                                </span>
                                <br>
                                By: ${item.requester_username}. Status: <strong style="color: ${statusColor};">${item.request_status}</strong>
                                <br>
                                *Reason: ${item.submission_reason.substring(0, 50)}...*
                            </li>
                        `;
                    }).join('')}
                </ul>
            </div>
        `;
    } else {
        historyHtml = `
             <div style="margin-top: 20px; padding: 10px; border: 1px dashed green; background-color: #f0fff0;">
                <p style="margin: 0; font-weight: bold;">No previous moderation history found for this badge number.</p>
            </div>
        `;
    }
    // --- END NEW: History Rendering Logic ---


    container.innerHTML = `
        <button onclick="loadPendingRequests()" style="float:right; margin-bottom: 20px;">Back to List</button>
        <h2>Review: ${request.request_type} Request (${request.tracking_id})</h2>
        <p style="margin-bottom: 20px;"><strong>Submitted By:</strong> ${request.requester_username} on ${submittedTime}</p>
        <hr>
        
        <div style="
            display: ${isUpdate ? 'flex' : 'block'}; 
            justify-content: center; 
            gap: 20px; 
            flex-wrap: nowrap;
        ">
            
            ${isUpdate ? 
                // 1. ORIGINAL RECORD SECTION (Only for UPDATE)
                `
                <div style="
                    flex-basis: 50%;
                    flex-grow: 1;
                    flex-shrink: 1;
                    min-width: 250px;
                    
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
                flex-basis: ${isUpdate ? '50%' : '100%'}; 
                flex-grow: 1; 
                flex-shrink: 1;
                min-width: 250px;
                
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
                <p><strong>Birth Date:</strong> ${highlight(getOriginalValue('birth_date'), requestedData.birth_date)}</p>
            </div>
        </div>

        <hr style="margin: 20px 0;">
        
        <h3>Requester's Reason:</h3>
        <p style="padding: 10px; background-color: #eee; border-radius: 3px;">${originalReason || 'No reason provided.'}</p>
        
        <div class="action-buttons-final" style="margin-top: 30px; text-align: center;">
        ${historyHtml} <div class="action-buttons-final" style="margin-top: 30px; text-align: center;">
            <button onclick="approveRequest(${request.request_id})" class="btn-approve btn-lg">APPROVE & EXECUTE</button>
            <button onclick="rejectRequest(${request.request_id})" class="btn-reject btn-lg" style="margin-left: 15px;">REJECT</button>
        </div>
    `;
}

async function showHistoryDetail(requestId) {
    if (!requestId) return;
    
    // Use the same container as the current pending request detail
    const detailContainer = document.getElementById('request-details-view');
    if (!detailContainer) return console.error("Request Detail container missing.");

  // Store current content to restore later
    const originalContent = detailContainer.innerHTML; 
    
    // UI Update
    detailContainer.innerHTML = '<h2>Loading Past Request Details...</h2>';
    
    try {
        // Fetch the full historical request details (including requested_data snapshot)
        const response = await fetch(`${BASE_URL}/api/request/${requestId}`);
        if (!response.ok) throw new Error('History request details not found.');
        
        const pastRequest = await response.json();
        
        // Data for display
        const requestedData = pastRequest.requested_data;
        const recordType = pastRequest.request_type;
        const status = pastRequest.request_status;

        // Determine if it was an UPDATE/DELETE, as it affects what original data we show
        const isUpdate = recordType === 'UPDATE';
        let originalRecord = null;

        if (recordType !== 'ADD' && pastRequest.target_badge_no && status === 'Approved') {
            // Note: If Approved, the change is applied. To see the *original* state 
            // before this historical update, we would need to check the log snapshot 
            // right before this historical request's approval log entry.
            // For simplicity, we just check the current status in the DB.
             
            // OPTIONAL: For a more robust view, we could fetch the current record, 
            // but for historical accuracy, we will focus on the details from the request itself.
        }

        // Generate dynamic HTML for the historical view
        detailContainer.innerHTML = `
            <button onclick="restorePendingRequestView('${encodeBase64(originalContent)}')" style="float:right; margin-bottom: 20px;" class="btn-secondary">
                ⬅️ Back to Pending Review
            </button>
            <h2 style="color: ${status === 'Approved' ? 'green' : 'red'};">${status.toUpperCase()} Request Detail (ID: ${requestId})</h2>
            <p><strong>Tracking ID:</strong> ${pastRequest.tracking_id}</p>
            <p><strong>Request Type:</strong> ${recordType}</p>
            <p><strong>Target Badge:</strong> ${pastRequest.target_badge_no}</p>
            <p><strong>Submitted By:</strong> ${pastRequest.requester_username} on ${new Date(pastRequest.submission_timestamp).toLocaleString()}</p>
            <p><strong>Status:</strong> <strong style="color: ${status === 'Approved' ? 'green' : 'red'};">${status}</strong></p>
            <p><strong>Processed By:</strong> ${pastRequest.approver_username || 'N/A'}</p>
            <p><strong>Reason for Submission:</strong> ${pastRequest.submission_reason}</p>
            
            <hr>
            <h4>Requested Data Snapshot (${recordType}):</h4>
            <pre style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; max-height: 300px; overflow-y: auto; white-space: pre-wrap;">
${JSON.stringify(requestedData, null, 2)}
            </pre>
            
            ${pastRequest.rejection_reason ? 
                `<h4 style="color: red;">Rejection Reason:</h4><p>${pastRequest.rejection_reason}</p>` 
                : ''}
        `;

  } catch (error) {
        console.error('Error fetching historical request details:', error);
        // Fallback button update: Use the new encoder function
        detailContainer.innerHTML = `<h2>Error loading history details.</h2>
                                     <p style="color: red;">${error.message}</p>
                                     <button onclick="restorePendingRequestView('${encodeBase64(originalContent)}')" class="btn-secondary">
                                         Back to Pending Review
                                     </button>`; // <--- CRITICAL CHANGE: Use encodeBase64()
    }
}

/**
 * Restores the view of the original pending request.
 * Uses Base64 encoding to pass the large HTML string safely.
 * @param {string} encodedContent - Base64 encoded HTML string of the original view.
 */
function restorePendingRequestView(encodedContent) {
    const detailContainer = document.getElementById('request-details-view');
    if (detailContainer) {
        try {
            const decodedContent = decodeBase64(encodedContent); // <--- CRITICAL CHANGE: Use decodeBase64()
            detailContainer.innerHTML = decodedContent;
        } catch (e) {
            console.error("Error decoding content, forcing refresh:", e);
            // Fallback: If decoding fails, force reload the list
            loadPendingRequests(); 
        }
    }
}

/**
 * User/General Admin: Fetches and displays the read-only details of the pending request 
 * for a specific badge number in a simple alert/modal.
 * @param {string} badgeNo - The target badge number.
 */
async function viewPendingRequestDetails(badgeNo) {
    if (!badgeNo) return;
    
    // Determine the correct section based on the user's role
    const detailContainer = document.getElementById(CURRENT_USER.role === 'admin' ? 'member-detail-section' : 'user-member-detail-section');
    if (!detailContainer) return;
    
    // Store original HTML to restore it later (using the safe UTF-8 encoder)
    const originalHTML = detailContainer.innerHTML;
    
    // Display loading state
    detailContainer.innerHTML = '<h2>Loading Pending Request Details...</h2>';
    
    try {
        // 1. Fetch the Request ID (using the API from the previous planning step)
        let response = await fetch(`${BASE_URL}/api/pending-request-id/${badgeNo}`);
        if (!response.ok) {
            detailContainer.innerHTML = `<h2>No Pending Request</h2><p>For Badge No. ${badgeNo}.</p><button onclick="restoreMemberActionsView('${encodeBase64(originalHTML)}')" class="btn-secondary">Back to Actions</button>`;
            return;
        }
        const { requestId } = await response.json();

        // 2. Fetch the Full Request Details
        response = await fetch(`${BASE_URL}/api/request/${requestId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch request details.');
        }
        const request = await response.json();
        const requestedData = request.requested_data;

        // 3. Generate HTML View
        detailContainer.innerHTML = `
            <button onclick="restoreMemberActionsView('${encodeBase64(originalHTML)}')" style="float:right; margin-bottom: 20px;" class="btn-secondary">
                ⬅️ Back to Actions
            </button>
            <h2 style="color: orange;">Pending Request Details</h2>
            <p>This request is currently waiting for Administration approval.</p>
            <hr>
            
            <div style="background-color: #fff8e1; border: 1px solid #ffecb3; padding: 20px; border-radius: 5px;">
                <h4>Request Metadata:</h4>
                <p><strong>Tracking ID:</strong> ${request.tracking_id}</p>
                <p><strong>Request ID:</strong> ${request.request_id}</p>
                <p><strong>Request Type:</strong> <strong style="color: orange;">${request.request_type}</strong></p>
                <p><strong>Submitted By:</strong> ${request.requester_username}</p>
                <p><strong>Submitted On:</strong> ${new Date(request.submission_timestamp).toLocaleString()}</p>
                <p><strong>Reason:</strong> ${request.submission_reason || 'N/A'}</p>
            </div>

            <h4 style="margin-top: 20px;">Requested Data/Changes:</h4>
            <pre style="background-color: #f4f4f4; padding: 15px; border-radius: 5px; max-height: 300px; overflow-y: auto; white-space: pre-wrap;">
${JSON.stringify(requestedData, null, 2)}
            </pre>
            
            <button onclick="restoreMemberActionsView('${encodeBase64(originalHTML)}')" class="btn-secondary">Back to Actions</button>
        `;

    } catch (error) {
        console.error('Error in viewPendingRequestDetails:', error);
        detailContainer.innerHTML = `<h2>Error loading details.</h2>
                                     <p style="color: red;">Failed to fetch request details due to an error.</p>
                                     <button onclick="restoreMemberActionsView('${encodeBase64(originalHTML)}')" class="btn-secondary">Back to Actions</button>`;
    }
}

function restoreMemberActionsView(encodedContent) {
    const detailContainer = document.getElementById(CURRENT_USER.role === 'admin' ? 'member-detail-section' : 'user-member-detail-section');
    if (detailContainer) {
        try {
            const decodedContent = decodeBase64(encodedContent); // Use the UTF-8 safe decoder
            detailContainer.innerHTML = decodedContent;
        } catch (e) {
            console.error("Error decoding content, attempting simple restore:", e);
            // Fallback: If decoding fails, try to re-render the action view
            const badgeNoMatch = decodedContent.match(/Badge No:\s*(AM-\d+)/);
            if (badgeNoMatch && badgeNoMatch[1]) {
                // Re-render the actions for the badge number found in the decoded content
                showMemberActions(badgeNoMatch[1]);
            } else {
                 // Final fallback
                alert("Could not restore previous view. Returning to main list.");
                CURRENT_USER.role === 'admin' ? showAdminSection('view-section') : showUserSection('user-view-section');
            }
        }
    }
}

/**
 * Executes the request approval on the backend.
 * @param {number} requestId - The ID of the request to approve.
 */
async function approveRequest(requestId) {
    const approverUsername = getLoggedInUsername();
    
    if (!confirm(`Are you sure you want to APPROVE request #${requestId}? This action is final and executes the change in the main database.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${BASE_URL}/api/requests/approve/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approverUsername: approverUsername })
        });

        const result = await response.json();
        
        if (result.success) {
            alert(`Request #${requestId} approved! Record updated/added to main table.`);
            loadPendingRequests(); 
            initializeDatabase(); 
        } else {
            alert(`Approval Failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Approval error:', error);
        alert('An error occurred during approval. Check console.');
    }
}

/**
 * Executes the request rejection on the backend.
 * @param {number} requestId - The ID of the request to reject.
 */
async function rejectRequest(requestId) {
    const approverUsername = getLoggedInUsername();
    const rejectionReason = prompt(`Enter reason for rejecting request #${requestId}:`);
    
    if (!rejectionReason || rejectionReason.trim() === '') {
        alert("Rejection reason is mandatory.");
        return;
    }
    
    try {
        const response = await fetch(`${BASE_URL}/api/requests/reject/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ approverUsername: approverUsername, rejectionReason: rejectionReason })
        });

        const result = await response.json();
        
        if (result.success) {
            alert(`Request #${requestId} rejected!`);
            loadPendingRequests(); 
        } else {
            alert(`Rejection Failed: ${result.message}`);
        }
    } catch (error) {
        console.error('Rejection error:', error);
        alert('An error occurred during rejection. Check console.');
    }
}

// --- USER REQUESTS (USER DASHBOARD) ---

/**
 * Fetches and renders the current user's submitted moderation requests.
 */
async function fetchAndRenderUserRequests() {
    const currentUsername = CURRENT_USER.username;
    const container = document.getElementById('my-requests-list-container'); 
    
    if (!container) return console.error("User request container not found (#my-requests-list-container).");

    if (!currentUsername) {
        container.innerHTML = '<h2>Login details not found. Please re-login.</h2>';
        return;
    }
    
    container.innerHTML = `<h2><i class="fa fa-spinner fa-spin"></i> Loading requests for ${currentUsername}...</h2>`;
    
    try {
        const response = await fetch(`${BASE_URL}/api/user/my-requests?username=${currentUsername}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch user requests: ${response.status}`);
        }
        const requests = await response.json();

        if (requests.length === 0) {
            container.innerHTML = '<h2>You have no submitted requests.</h2>';
            return;
        }

        let html = '<table class="requests-table"><thead><tr><th>Tracking ID</th><th>Type</th><th>Target Badge</th><th>Reason</th><th>Status</th><th>Submitted On</th></tr></thead><tbody>';
        
        requests.forEach(req => {
            const statusClass = req.request_status.toLowerCase();
            
            const submittedDate = new Date(req.submission_timestamp).toLocaleString('en-IN', {
                dateStyle: 'short',
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
        container.innerHTML = '<h2>Error loading your requests. Server or Network issue.</h2>';
    }
}

/**
 * Admin/User: Fetches and displays the current user's profile details.
 */
async function viewMyProfile() {
    const username = getLoggedInUsername();
    if (!username || username === 'UNKNOWN') return alert("Error: User not logged in.");

    // Select the correct container based on the user's role
    const containerId = CURRENT_USER.role === 'admin' ? 'admin-profile-details' : 'user-profile-details'; // <--- Yahan 'user' ke liye select hoga
    const detailContainer = document.getElementById(containerId);
    
    if (!detailContainer) return;
    
    detailContainer.innerHTML = '<h2>Loading My Profile...</h2>'; 

    try {
        const response = await fetch(`${BASE_URL}/api/user/${username}`); 
        if (!response.ok) throw new Error('Profile details not found.');
        
        const user = await response.json();
        
        // Correct image source path
        const userPicUrl = user.pic && user.pic.startsWith('http') ? user.pic : `${BASE_URL}/${user.pic}`;
        const finalPicSrc = user.pic ? userPicUrl : 'demo.png'; 
        
        // Determine the ID for the Change Password button link
        const changePasswordSectionId = CURRENT_USER.role === 'admin' ? 'admin-settings-section' : 'user-change-password-section';
        const sectionFunction = CURRENT_USER.role === 'admin' ? 'showAdminSection' : 'showUserSection';

        // Render the user details dynamically
        detailContainer.innerHTML = `
            <div class="form-card" style="max-width: 500px; padding: 25px;">
                <h3 style="margin-top: 0;">Account and Member Information</h3>

                <div style="text-align: center; margin-bottom: 15px;">
                    <p style="margin: 0; font-weight: bold;">Picture:</p>
                    <img src="${finalPicSrc}" alt="${user.name} Profile Pic" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 2px solid #000; margin-top: 5px;">
                </div>

                <p><strong>Username:</strong> ${user.username}</p>
                <p><strong>Role:</strong> <strong style="color: ${user.role === 'admin' ? 'red' : 'green'};">${user.role ? user.role.toUpperCase() : 'N/A'}</strong></p>
                <p><strong>Status:</strong> <span style="color: ${user.is_active ? 'green' : 'red'}; font-weight: bold;">${user.is_active ? 'Active' : 'Disabled'}</span></p>
                <hr style="border: 0; border-top: 1px dashed #ccc;">
                
                <h4>Linked Member Data:</h4>
                <p><strong>Name:</strong> ${user.name || 'N/A'}</p>
                <p><strong>Badge No:</strong> ${user.badge_no || 'N/A'}</p>
                <p><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
                <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
                <p><strong>Address:</strong> ${user.address || 'N/A'}</p>
                <p><strong>Last Login:</strong> ${user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</p>
            </div>
            
            <button onclick="${sectionFunction}('${changePasswordSectionId}')" class="btn-primary" style="margin-top: 20px;">Change Password</button>
        `;

    } catch (error) {
        console.error('Error fetching user profile:', error);
        detailContainer.innerHTML = `<h2>Error loading profile details.</h2>
                                     <p style="color: red;">${error.message}</p>`;
    }
}


// ====================================================
// --- 9. PASSWORD MANAGEMENT (USER & FORGOT) ---
// ====================================================

/**
 * User: Handles the change password submission for logged-in users.
 */
async function userChangePassword() {
    const username = CURRENT_USER.username;
    if (!username) return alert("Error: Please log in again to change your password.");

    const oldPasswordInput = document.getElementById('user-old-password');
    const newPasswordInput = document.getElementById('user-new-password');
    const confirmPasswordInput = document.getElementById('user-confirm-password');

    const oldPassword = oldPasswordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    // Frontend Validation
    if (!oldPassword || !newPassword || !confirmPassword || newPassword.length < 6 || newPassword !== confirmPassword || oldPassword === newPassword) {
        return alert('Validation failed: Check all fields, password length (min 6), match, and ensure new password is different from old.');
    }

    try {
        const response = await fetch(`${BASE_URL}/api/change-password`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: username, 
                oldPassword: oldPassword, 
                newPassword: newPassword 
            }),
        });

        const result = await response.json(); 

        if (response.ok) {
            alert(`Success! ${result.message || "Password successfully changed."} You will be logged out now.`);
            
            // Clear inputs and force logout
            oldPasswordInput.value = '';
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            
            logout(); 
        } else {
            alert(`Password Change Failed: ${result.message || "An unknown error occurred."}`);
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('A network error occurred while attempting to change the password.');
    }
}

/**
 * Shows the Forgot Password screen.
 */
function showForgotPasswordScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('forgot-password-screen').style.display = 'flex';
    document.getElementById('reset-message').textContent = '';
    document.getElementById('reset-identifier').value = '';
}

/**
 * Shows the main Login screen.
 */
function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('forgot-password-screen').style.display = 'none';
}

/**
 * Submits the password reset request for forgotten passwords.
 */
async function submitPasswordResetRequest() {
    const identifier = document.getElementById('reset-identifier').value.trim();
    const resetMessageElement = document.getElementById('reset-message');

    if (identifier === '') {
        resetMessageElement.style.color = 'red';
        resetMessageElement.textContent = "Please enter your Username or Badge Number.";
        return;
    }

    resetMessageElement.style.color = 'orange';
    resetMessageElement.textContent = 'Processing request...';
    
    const submitButton = document.getElementById('submit-reset-btn');
    if (submitButton) submitButton.disabled = true;

    try {
        const response = await fetch(`${BASE_URL}/api/forgot-password`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: identifier }),
        });

        const result = await response.json();

        // Check for client-side errors (e.g., 400: Missing identifier)
        if (response.status >= 400 && response.status < 500) { 
            resetMessageElement.style.color = 'red';
            resetMessageElement.textContent = `Request Failed: ${result.message || 'Check your input.'}`;
        }
        
        // FIX: The backend now always returns 200 for success/user-not-found/server-error.
        else { 
            resetMessageElement.style.color = '#65e612';
            // ⭐️ CRITICAL CHANGE HERE ⭐️
            resetMessageElement.textContent = `If a matching account exists, a password reset link has been sent to the registered email.`;
        }
    } catch (error) {
        console.error('Error submitting password reset:', error);
        resetMessageElement.style.color = 'red';
        resetMessageElement.textContent = 'A network error occurred. Please try again.';
    } finally {
        if (submitButton) submitButton.disabled = false;
        // Optionally, remove the identifier immediately, or shorten the timeout.
        setTimeout(() => {
            document.getElementById('reset-identifier').value = '';
        }, 5000); 
    }
}

//Retrieves query parameters (username and token) from the URL.
function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const username = params.get('username');
    const token = params.get('token');
    
    if (username && token) {
        return { username, token };
    }
    return null;
}

/**
 * Validates the reset link parameters and sets up the form inputs.
 */
function validateResetLinkAndSetupForm() {
    const params = getQueryParams();
    const messageElement = document.getElementById('reset-page-message');
    const formElement = document.getElementById('new-password-form');
    
    if (!params) {
        messageElement.textContent = 'Invalid reset link. Missing username or token.';
        messageElement.style.color = 'red';
        if (formElement) formElement.style.display = 'none';
        return;
    }
    
    // Store the parameters globally or locally so submit function can use them
    window.RESET_PARAMS = params; 
    
    // Form is shown and inputs are set up.
    messageElement.textContent = `Ready to set a new password for user: ${params.username}`;
    messageElement.style.color = '#1a6912;';
    if (formElement) formElement.style.display = 'block';
}

/**
 * Submits the new password along with the token and username to the backend.
 */
async function submitNewPassword() {
    const newPassword = document.getElementById('new-password-input').value.trim();
    const confirmPassword = document.getElementById('confirm-password-input').value.trim();
    const messageElement = document.getElementById('reset-page-message');
    const submitButton = document.getElementById('submit-new-password-btn');
    const params = window.RESET_PARAMS; 

    // 1. Client-side validation
    if (!params) return alert("Error: Reset link data is missing. Please try the link again.");
    if (!newPassword || !confirmPassword || newPassword.length < 6) {
        messageElement.textContent = "Password must be at least 6 characters long.";
        messageElement.style.color = 'red';
        return;
    }
    if (newPassword !== confirmPassword) {
        messageElement.textContent = "New passwords do not match.";
        messageElement.style.color = 'red';
        return;
    }

    submitButton.disabled = true;
    messageElement.textContent = 'Updating password...';
    messageElement.style.color = 'orange';

    try {
        const response = await fetch(`${BASE_URL}/api/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: params.username,
                token: params.token,
                newPassword: newPassword,
            }),
        });

        const result = await response.json();

        if (response.ok) {
            messageElement.textContent = result.message;
            messageElement.style.color = 'green';
            alert('Password reset successful! Redirecting to login.');
            // Redirect user back to the main login page after a delay
            setTimeout(() => {
                window.location.href = '/index.html'; // Assuming your login page is index.html
            }, 3000);
        } else {
            messageElement.textContent = result.message || 'Reset failed due to server error.';
            messageElement.style.color = 'red';
        }

    } catch (error) {
        console.error('Network Error during password reset:', error);
        messageElement.textContent = 'A network error occurred. Please try again.';
        messageElement.style.color = 'red';
    } finally {
        submitButton.disabled = false;
    }
}

// ====================================================
// --- BATCH ACTION UTILITIES (Selection) ---
// ====================================================

/**
 * Toggles the selection state of all checkboxes in the table.
 * @param {HTMLElement} source - The 'Select All' checkbox.
 */
function toggleSelectAll(source) {
    document.querySelectorAll('.record-checkbox').forEach(checkbox => {
        checkbox.checked = source.checked;
        toggleRecordSelection(checkbox);
    });
}

/**
 * Toggles the selection state of a single record and updates the global Set.
 * @param {HTMLElement} checkbox - The individual record checkbox.
 */
function toggleRecordSelection(checkbox) {
    const badgeNo = checkbox.dataset.badgeNo;
    const row = checkbox.closest('tr');
    if (checkbox.checked) {
        database.selectedRecords.add(badgeNo);
        row.classList.add('selected-row');
    } else {
        database.selectedRecords.delete(badgeNo);
        row.classList.remove('selected-row');
    }
}

/**
 * Batch action to select records by name filter.
 */
function selectAllByName() {
    const term = prompt("Enter name to select (leave blank for all visible):")?.trim().toUpperCase();
    if (term === null) return;
    
    database.filteredRecords.forEach(record => {
        if (term === '' || (record.name && record.name.includes(term))) {
            database.selectedRecords.add(record.badge_no);
        }
    });
    
    updateTable();
    alert(`Selected ${database.selectedRecords.size} records.`);
}

/**
 * Batch action to clear all current selections.
 */
function clearAllSelections() {
    database.selectedRecords.clear();
    updateTable();
    alert('All selections cleared.');
}