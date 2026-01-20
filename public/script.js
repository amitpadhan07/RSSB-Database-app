// Global BASE_URL variable.
const BASE_URL = 'https://rssbrudrapur.onrender.com';

// Global Variables
var CURRENT_USER = {}; 
let currentUsername = null;

let genderChartInstance = null;
let ageChartInstance = null;
let badgeTypeChartInstance = null;
const socket = io(BASE_URL);

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


// ====================================================
// ----------- 1. Core Utilities & Helpers-------------
// ====================================================

function encodeBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(str) {
    return decodeURIComponent(escape(atob(str)));
}

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
        case 'ADMIN_ADD': prefix = 'AA'; break;
        case 'ADMIN_UPDATE': prefix = 'AU'; break;
        case 'ADMIN_DELETE': prefix = 'AD'; break;
        default: prefix = 'ERR'; 
    }
    // Reverted to the original format: PREFIX/BADGENO/DDMMYY/USERNAME (Backend compatibility)
    return `${prefix}/${badgeNo}/${datePart}/${username}`; 
}

function getLoggedInUsername() {
    return CURRENT_USER.username || document.getElementById("username")?.value || 'UNKNOWN'; 
}

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

function togglePasswordById(inputId, icon) {
    const input = document.getElementById(inputId);

    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar-menu');
    if (sidebar) {
        if (sidebar.style.display === 'none' || sidebar.style.display === '') {
            sidebar.style.display = 'flex'; // Mobile CSS uses flex for buttons
        } else {
            sidebar.style.display = 'none';
        }
    }
}

function showToast(msg, type = 'success') {
    const box = document.getElementById('toast-box');
    const toast = document.createElement('div');
    
    let icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : '⚠️');
    
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
    
    box.appendChild(toast);

    // Auto remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function checkPasswordStrength(inputId, outputId) {
    const input = document.getElementById(inputId);
    const output = document.getElementById(outputId);

    if (!input || !output) return;

    input.addEventListener("input", () => {
        const val = input.value;
        let strength = 0;

        if (val.length >= 6) strength++;
        if (/[A-Z]/.test(val)) strength++;
        if (/[0-9]/.test(val)) strength++;
        if (/[@$!%*?&]/.test(val)) strength++;

        if (val.length === 0) {
            output.textContent = "";
            output.className = "";
        } 
        else if (strength <= 1) {
            output.textContent = "❌ Weak Password";
            output.className = "strength-weak";
        } 
        else if (strength === 2 || strength === 3) {
            output.textContent = "⚠ Medium Password";
            output.className = "strength-medium";
        } 
        else {
            output.textContent = "✅ Strong Password";
            output.className = "strength-strong";
        }
    });
}


// ====================================================
// ---------- 2. Authentication & Navigation-----------
// ====================================================

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

        
        if (response.ok) {
    CURRENT_USER = { role: result.role, username: username }; // Ensure badge_no is returned by login API
    currentUsername = username; // Store current username globally

    document.getElementById("login-screen").style.display = "none";

    if (CURRENT_USER.role === 'admin') {
        document.getElementById("admin-dashboard").style.display = "flex";
        showAdminSection('view-section');
    } 
    else if (CURRENT_USER.role === 'user') {
        document.getElementById("user-dashboard").style.display = "flex";
        showUserSection('user-view-section');
    }
    // NEW SEWADAR LOGIC
    else if (CURRENT_USER.role === 'sewadar') {
    document.getElementById("sewadar-dashboard").style.display = "flex"; // Must be flex for sidebar layout
    
    // Fix for "undefined" name
    document.getElementById("sewadar-welcome-name").innerText = username; 
    
    // Show Home Section by default
    showSewadarSection('sewadar-home-section'); 
    
    // Load Data
    loadSewadarDuties(); 
    loadMyAttendanceSummary("week");
    loadUserMessages();
    loadBroadcasts();
    renderCalendar();
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

function showUserSection(sectionId) {
    loadUserMessages();
    loadBroadcasts();
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

function showSewadarSection(sectionId) {
    
    loadSewadarDuties(); 
    loadSewadarHistory();
    loadMyAttendanceSummary("week");
    loadUserMessages();
    loadBroadcasts();
    renderCalendar();
    const sections = document.querySelectorAll('#sewadar-dashboard .content-area section');
    sections.forEach(sec => sec.style.display = 'none');

    // Show the requested section
    const activeSection = document.getElementById(sectionId);
    if(activeSection) {
        activeSection.style.display = 'block';
    }
}

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
document.addEventListener('DOMContentLoaded', setupDashboardListeners); 

// ====================================================
// ------ 3. Password Management (Reset & Forgot) -----
// ====================================================

async function userChangePassword() {
    const username = CURRENT_USER.username;
    // Role ke hisaab se prefix set karein (admin ya user)
    const prefix = CURRENT_USER.role === 'admin' ? 'admin' : 'user';
    
    const oldPassword = document.getElementById(`${prefix}-old-password`).value.trim();
    const newPassword = document.getElementById(`${prefix}-new-password`).value.trim();
    const confirmPassword = document.getElementById(`${prefix}-confirm-password`).value.trim();

    if (newPassword !== confirmPassword) {
        return alert("New passwords do not match!");
    }

    try {
        const response = await fetch(`${BASE_URL}/api/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, oldPassword, newPassword }),
        });
        const result = await response.json();
        if (response.ok) {
            alert("Password updated! Logging out...");
            logout();
        } else {
            alert(result.message);
        }
    } catch (error) {
        alert("Error updating password.");
    }
}

async function sewadarChangePassword() {
    const oldPassword = document.getElementById('sewadar-old-password').value;
    const newPassword = document.getElementById('sewadar-new-password').value;
    const confirmPassword = document.getElementById('sewadar-confirm-password').value;

    if (newPassword !== confirmPassword) {
        return alert("New passwords do not match!");
    }

    try {
        const res = await fetch(`${BASE_URL}/api/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: CURRENT_USER.username, 
                oldPassword, 
                newPassword 
            })
        });

        const result = await res.json();
        
        if (res.ok) {
            alert("Password Changed Successfully! Please login again.");
            logout();
        } else {
            alert("Error: " + result.message);
        }
    } catch (e) {
        alert("Network error while changing password.");
    }
}

function showForgotPasswordScreen() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('forgot-password-screen').style.display = 'flex';
    document.getElementById('reset-message').textContent = '';
    document.getElementById('reset-identifier').value = '';
}

function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('forgot-password-screen').style.display = 'none';
}

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

function getQueryParams() {
    const params = new URLSearchParams(window.location.search);
    const username = params.get('username');
    const token = params.get('token');
    
    if (username && token) {
        return { username, token };
    }
    return null;
}

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
// ------- 4. Data & UI Management (Tables) -----------
// ====================================================

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

function toggleSelectAll(source) {
    document.querySelectorAll('.record-checkbox').forEach(checkbox => {
        checkbox.checked = source.checked;
        toggleRecordSelection(checkbox);
    });
}

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

function clearAllSelections() {
    database.selectedRecords.clear();
    updateTable();
    alert('All selections cleared.');
}

function showSkeleton(elementId, count = 3) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="skeleton" style="margin-bottom:10px; width:100%; height:40px;"></div>`;
    }
    el.innerHTML = html;
}

// ====================================================
// --------- 5. Member Management (CRUD) --------------
// ====================================================

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

async function adminSubmitUpdate() {
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

// ====================================================
// --------- 6. Admin: User Account Control -----------
// ====================================================

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

async function viewAllUsers() {
    const container = document.getElementById('users-list-container');
    if (!container) return console.error("User list container missing (#users-list-container).");

    container.innerHTML = '<h2><i class="fa fa-spinner fa-spin"></i> Loading Users...</h2>';
    showSkeleton('users-list-container');

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
    <option value="sewadar" ${user.role === 'sewadar' ? 'selected' : ''}>Sewadar</option> 
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

async function saveUserAccount(username) {
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
        const changePasswordSectionId = CURRENT_USER.role === 'admin' ? 'admin-settings-section' : 'user-settings-section';
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
// -------- 7. Admin: Logging & Moderation ------------
// ====================================================

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

function refreshLogs() {
    ALL_SYSTEM_LOGS = []; // Clear cache
    viewLogs(); // Re-run the main function
}

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

function goBackToLogsList() {
    const logList = document.getElementById('logs-list-container');
    const detailDiv = document.getElementById('log-detail-container');
    
    if (logList) logList.style.display = 'block';
    if (detailDiv) detailDiv.style.display = 'none';
    
    // Re-run viewLogs to ensure filters are maintained
    viewLogs();
}

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
                        <th><input type="checkbox" onclick="toggleSelectAllRequests(this)"></th>
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
                    <td><input type="checkbox"
                    class="request-checkbox"
                    data-request-id="${req.request_id}"></td>
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

function toggleSelectAllRequests(master) {
    document.querySelectorAll('.request-checkbox')
        .forEach(cb => cb.checked = master.checked);
}

async function bulkApproveRequests() {
    // 🔐 Admin only
    if (CURRENT_USER.role !== 'admin') {
        return alert('Unauthorized');
    }

    // 📦 Selected request IDs
    const selectedRequests = Array.from(
        document.querySelectorAll('.request-checkbox:checked')
    ).map(cb => cb.dataset.requestId);

    if (selectedRequests.length === 0) {
        return alert('No requests selected');
    }

    if (!confirm(`Accept ${selectedRequests.length} selected requests?`)) return;

    // 🔁 Approve one by one
    for (let requestId of selectedRequests) {
        await fetch(`${BASE_URL}/api/requests/approve/${requestId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                approvedBy: getLoggedInUsername()
            })
        });
    }

    alert('Selected requests accepted successfully');
    loadPendingRequests(); // refresh queue
}

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

// ====================================================
// --------- 8. Duty & Attendance (Sewadar)------------
// ====================================================

async function assignDuty() {
    const badgeNo = document.getElementById('duty-badge').value;
    const date = document.getElementById('duty-date').value;
    const place = document.getElementById('duty-place').value;
    const duration = document.getElementById('duty-duration').value;

    await fetch(`${BASE_URL}/api/duty/assign`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ badgeNo, date, place, duration, assignedBy: CURRENT_USER.username })
    });
    alert("Duty Assigned!");
}

async function loadAllDuties() {
    // Determine container based on who is logged in
    const containerId = CURRENT_USER.role === 'admin' ? 'admin-duty-list-container' : 'duty-list-container';
    const container = document.getElementById(containerId);
    if(!container) return;

    container.innerHTML = '<p>Loading duties...</p>';

    try {
        const res = await fetch(`${BASE_URL}/api/duty/all`);
        const duties = await res.json();

        if (duties.length === 0) {
            container.innerHTML = '<p>No duties assigned yet.</p>';
            return;
        }

        let html = `
        <table class="styled-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Badge No</th>
                    <th>Name</th>
                    <th>Place</th>
                    <th>Time</th>
                    <th>Assigned By</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>`;

        duties.forEach(d => {
            const dateStr = new Date(d.duty_date).toLocaleDateString();
            
            // Encode data for editing safely
            const dataStr = encodeURIComponent(JSON.stringify(d));

            // --- CHANGE HERE: Buttons are now visible for BOTH Admin and User ---
            html += `
            <tr>
                <td>${dateStr}</td>
                <td>${d.badge_no}</td>
                <td>${d.name || 'N/A'}</td>
                <td>${d.place}</td>
                <td>${d.duration}</td>
                <td>${d.assigned_by || 'System'}</td>
                <td>
                    <button onclick="editDuty('${dataStr}')" class="btn-secondary" style="font-size:12px; padding:5px 10px;">Edit</button>
                    <button onclick="deleteDuty(${d.id})" class="btn-delete" style="font-size:12px; padding:5px 10px;">Delete</button>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = '<p style="color:red">Error loading duties.</p>';
    }
}

async function deleteDuty(id) {
    if(!confirm("Are you sure you want to remove this duty?")) return;

    try {
        const res = await fetch(`${BASE_URL}/api/duty/${id}`, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) {
            alert("Duty Deleted.");
            loadAllDuties();
        }
    } catch(e) { alert("Error deleting duty"); }
}

function getDutyPrefix() {
    return (CURRENT_USER.role === 'admin') ? 'admin-' : '';
}

async function saveDuty() {
    const prefix = getDutyPrefix(); // Admin hai to 'admin-' milega, User hai to ''
    
    const id = document.getElementById(prefix + 'duty-id').value;
    const badgeNo = document.getElementById(prefix + 'duty-badge').value;
    const date = document.getElementById(prefix + 'duty-date').value;
    const place = document.getElementById(prefix + 'duty-place').value;
    const duration = document.getElementById(prefix + 'duty-duration').value;

    // Validation
    if(!badgeNo || !date || !place || !duration) {
        return alert("Please fill all fields properly.");
    }

    const isEdit = id ? true : false;
    const url = isEdit ? `${BASE_URL}/api/duty/${id}` : `${BASE_URL}/api/duty/assign`;
    const method = isEdit ? 'PUT' : 'POST';

    // Body Data Prepare karo
    const bodyData = { 
        badgeNo, date, place, duration, 
        assignedBy: CURRENT_USER.username 
    };

    try {
        const res = await fetch(url, {
            method: method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(bodyData)
        });
        const result = await res.json();
        
        if(result.success) {
            alert(isEdit ? "Duty Updated Successfully!" : "Duty Assigned Successfully!");
            resetDutyForm(); // Form clear karo
            loadAllDuties(); // List refresh karo
        } else {
            alert("Error: " + result.message);
        }
    } catch(e) { 
        console.error(e);
        alert("Network Error: Could not save duty."); 
    }
}

function editDuty(encodedData) {
    const data = JSON.parse(decodeURIComponent(encodedData));
    const prefix = getDutyPrefix(); // Select correct form inputs

    // Fill the form
    document.getElementById(prefix + 'duty-id').value = data.id;
    document.getElementById(prefix + 'duty-badge').value = data.badge_no;
    document.getElementById(prefix + 'duty-badge').readOnly = true; 
    
    // Date Format Fix (YYYY-MM-DD)
    const dateObj = new Date(data.duty_date);
    const dateStr = dateObj.toISOString().split('T')[0];
    document.getElementById(prefix + 'duty-date').value = dateStr;
    
    document.getElementById(prefix + 'duty-place').value = data.place;
    document.getElementById(prefix + 'duty-duration').value = data.duration;

    // Change UI state (Button colors etc)
    const titleId = prefix + 'duty-form-title';
    const submitBtnId = prefix + 'duty-submit-btn';
    const cancelBtnId = prefix + 'duty-cancel-btn';

    if(document.getElementById(titleId)) document.getElementById(titleId).innerText = "Edit Existing Duty";
    if(document.getElementById(submitBtnId)) {
        document.getElementById(submitBtnId).innerText = "Update Duty";
        document.getElementById(submitBtnId).style.backgroundColor = "orange";
    }
    if(document.getElementById(cancelBtnId)) document.getElementById(cancelBtnId).style.display = "inline-block";
    
    // Scroll to form
    const sectionId = (CURRENT_USER.role === 'admin') ? 'admin-duty-section' : 'user-duty-section';
    document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
}

function resetDutyForm() {
    const prefix = getDutyPrefix();

    document.getElementById(prefix + 'duty-id').value = '';
    document.getElementById(prefix + 'duty-badge').value = '';
    document.getElementById(prefix + 'duty-badge').readOnly = false;
    document.getElementById(prefix + 'duty-date').value = '';
    document.getElementById(prefix + 'duty-place').value = '';
    document.getElementById(prefix + 'duty-duration').value = '';

    // Reset UI
    const titleId = prefix + 'duty-form-title';
    const submitBtnId = prefix + 'duty-submit-btn';
    const cancelBtnId = prefix + 'duty-cancel-btn';

    if(document.getElementById(titleId)) document.getElementById(titleId).innerText = "Assign New Duty";
    if(document.getElementById(submitBtnId)) {
        document.getElementById(submitBtnId).innerText = "Assign Duty";
        document.getElementById(submitBtnId).style.backgroundColor = ""; 
    }
    if(document.getElementById(cancelBtnId)) document.getElementById(cancelBtnId).style.display = "none";
}

async function loadSewadarDuties() {
    const container = document.getElementById('my-upcoming-duties');
    if (!container) return; // Safety Check

    container.innerHTML = '<p style="text-align:center;">Loading duties...</p>';

    // Badge check logic
    let badgeNo = CURRENT_USER.badge_no;
    if (!badgeNo) {
        try {
            const uRes = await fetch(`${BASE_URL}/api/user/${CURRENT_USER.username}`);
            const u = await uRes.json();
            badgeNo = u.badge_no;
            CURRENT_USER.badge_no = badgeNo;
        } catch(e) { 
            container.innerHTML = '<p>Error identifying user.</p>';
            return; 
        }
    }

    try {
        const res = await fetch(`${BASE_URL}/api/sewadar/my-duties/${badgeNo}`);
        const duties = await res.json();

        if (duties.length === 0) {
            container.innerHTML = `<p style="text-align:center; padding:20px; color:#888;">No upcoming duties.</p>`;
            return;
        }

        let html = '';
        duties.forEach(d => {
             // Date formatting fix
            let dateStr = d.duty_date;
            try {
                dateStr = new Date(d.duty_date).toLocaleDateString();
            } catch(err){}

            html += `
            <div class="duty-card" style="margin-bottom:10px; padding:15px; border-left:5px solid #007bff; background:#fff; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
                <div style="font-weight:bold; color:#333;">${d.place}</div>
                <div style="font-size:13px; color:#666;">
                    <i class="fa fa-calendar"></i> ${dateStr} <br>
                    <i class="fa fa-clock"></i> ${d.duration}
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p>Server Error.</p>';
    }
}

async function loadSewadarHistory() {
    const tbody = document.getElementById('my-history-table-body');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    try {
        const res = await fetch(`${BASE_URL}/api/sewadar/history/${CURRENT_USER.username}`);
        const logs = await res.json();
        
        if(logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No attendance history found.</td></tr>`;
            return;
        }

        let html = '';
        logs.forEach(l => {
            // --- FIX: Define Date & Time variables here ---
            const dateObj = new Date(l.timestamp);
            const date = dateObj.toLocaleDateString();
            const time = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            // ----------------------------------------------

            let statusColor = '#6c757d'; // Default Grey
            let statusText = l.action_type;

            // Logic for Colors and Text
            if (l.action_type === 'IN') {
                statusColor = '#28a745'; // Green
                statusText = l.is_late ? 'IN (LATE)' : 'IN';
            } else if (l.action_type === 'OUT') {
                statusColor = '#ffc107'; // Yellow/Orange
                statusText = `OUT (${l.duration_minutes}m)`;
            } else if (l.action_type === 'ABSENT') {
                statusColor = '#dc3545'; // RED
            }

            html += `
            <tr>
                <td><strong style="color: ${statusColor};">${statusText}</strong></td>
                <td>${date}</td>
                <td>${l.action_type === 'ABSENT' ? '--:--' : time}</td>
                <td>
                    <span style="background-color:${statusColor}; color:white; font-size:11px; padding:2px 8px; border-radius:4px;">
                        ${l.action_type}
                    </span>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = html;

    } catch(e) { 
        console.error("History Error:", e);
        tbody.innerHTML = '<tr><td colspan="4">Error loading history.</td></tr>'; 
    }
}

function markMyAttendanceGeo() {
   if (!navigator.geolocation) return showToast("No GPS Support", "error");

    // Check time BEFORE calling API
    const now = new Date();
    const isLateTime = (now.getHours() > 9) || (now.getHours() === 9 && now.getMinutes() > 15);
    let reason = "";

    // If Late, Ask for Reason
    if (isLateTime) {
        reason = prompt("⚠️ You are marking LATE (after 9:15 AM). Please enter a reason:");
        if (!reason || reason.trim() === "") {
            return showToast("Attendance Cancelled: Late reason is required.", "error");
        }
    }
    
    const btn = document.querySelector('.punch-btn');
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Locating...';

    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const res = await fetch(`${BASE_URL}/api/sewadar/mark-attendance-geo`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                username: CURRENT_USER.username, 
                lat: pos.coords.latitude, 
                lon: pos.coords.longitude,
                remarks: reason // <--- SEND REASON
            })
            });
            const data = await res.json();
            btn.innerHTML = oldHtml;

            if(data.success) {
                let msg = data.action === 'IN' ? "Punched IN Successfully!" : "Punched OUT Successfully!";
                if(data.isLate) msg += "\n⚠️ You are marked LATE.";
                if(data.action === 'OUT') msg += `\n⏱️ Total Duration: ${data.duration} mins.`;
                alert(msg);
                loadSewadarHistory(); // Refresh history table
            } else {
                alert("Error: " + data.message);
            }
        } catch(e) { 
            btn.innerHTML = oldHtml;
            alert("Network Error"); 
        }
    }, () => {
        btn.innerHTML = oldHtml;
        alert("GPS Permission Denied. Cannot mark attendance.");
    });
}

async function autoScheduleDuties() {
    const d = prompt("Days to schedule:", "7");
    if(!d) return;
    const res = await fetch(`${BASE_URL}/api/duty/auto-schedule`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ startDate: new Date(), days: d, assignedBy: CURRENT_USER.username })
    });
    const json = await res.json();
    alert(json.message);
    loadAllDuties();
}

async function renderCalendar() {
    // Determine the container ID based on role
    const prefix = CURRENT_USER.role === 'sewadar' ? 'sewadar' : 'user';
    const container = document.getElementById(`${prefix}-duty-calendar`);
    
    if (!container) return; // Exit if container doesn't exist for this role

    // Fetch duties
    // Note: Ensure CURRENT_USER.badge_no is set. If logged in as User, fetch user details first if needed.
    let badgeNo = CURRENT_USER.badge_no;
    if (!badgeNo && CURRENT_USER.username) {
         try {
            const uRes = await fetch(`${BASE_URL}/api/user/${CURRENT_USER.username}`);
            const u = await uRes.json();
            badgeNo = u.badge_no;
         } catch(e) { console.error("Could not fetch badge for calendar"); return; }
    }

    const res = await fetch(`${BASE_URL}/api/sewadar/my-duties/${badgeNo}`);
    const duties = await res.json();
    
    // Render Calendar (Current Month)
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    
    let html = '';
    // Headers
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => html += `<div class="calendar-header">${d}</div>`);
    
    // Days
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        
        // Find duty for this day
        const duty = duties.find(d => d.duty_date.startsWith(dateStr));
        const dutyClass = duty ? 'has-duty' : '';
        const dutyText = duty ? `<br><small>📍 ${duty.place}</small>` : '';

        html += `<div class="calendar-day ${dutyClass}">
                    <strong>${i}</strong>
                    ${dutyText}
                 </div>`;
    }
    container.innerHTML = html;
}

// ====================================================
// --- 9. New Features (Reports, Leaves, Broadcasts)---
// ====================================================

async function loadAnalytics() {
    try {
        // ✅ ADMIN SAFETY CHECK
        if (CURRENT_USER.role !== 'admin') return;

        const res = await fetch(`${BASE_URL}/api/admin/analytics`);
        const data = await res.json();

        // 🔢 Stats numbers
        document.getElementById('totalMembers').innerText = data.totalMembers;
        document.getElementById('activeUsers').innerText = data.activeUsers;
        document.getElementById('pendingRequests').innerText = data.pendingRequests;

        // 🧹 Destroy old charts
        if (genderChartInstance) genderChartInstance.destroy();
        if (ageChartInstance) ageChartInstance.destroy();
        if (badgeTypeChartInstance) badgeTypeChartInstance.destroy();

        // ===============================
        // 🥧 GENDER PIE CHART (COUNT + %)
        // ===============================
        const genderCtx = document.getElementById('genderChart').getContext('2d');

        genderChartInstance = new Chart(genderCtx, {
    type: 'pie',
    data: {
        labels: data.genderStats.map(g => g.gender),
        datasets: [{
            data: data.genderStats.map(g => Number(g.count)), // 🔥 FIX
            backgroundColor: ['#007bff', '#dc3545', '#28a745']
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function (context) {
                        const value = Number(context.raw);
                        const total = context.dataset.data
                            .map(Number)
                            .reduce((a, b) => a + b, 0);

                        const percent = ((value / total) * 100).toFixed(1);
                        return `${context.label}: ${value} (${percent}%)`;
                    }
                }
            }
        }
    }
});

        // ===============================
        // 📊 AGE BAR CHART (COUNT + %)
        // ===============================
        const ageCtx = document.getElementById('ageChart').getContext('2d');

        ageChartInstance = new Chart(ageCtx, {
    type: 'bar',
    data: {
        labels: data.ageGroups.map(a => a.age_group),
        datasets: [{
            label: 'Members',
            data: data.ageGroups.map(a => Number(a.count)), // 🔥 FIX
            backgroundColor: '#6c757d'
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function (context) {
                        const value = Number(context.raw);
                        const total = context.dataset.data
                            .map(Number)
                            .reduce((a, b) => a + b, 0);

                        const percent = ((value / total) * 100).toFixed(1);
                        return `${value} members (${percent}%)`;
                    }
                }
            }
        }
    }
});


        // ===============================
        // 🥧 BADGE TYPE PIE CHART (COUNT + %)
        // ===============================
        const badgeCtx = document.getElementById('badgeTypeChart').getContext('2d');

       badgeTypeChartInstance = new Chart(badgeCtx, {
    type: 'pie',
    data: {
        labels: data.badgeTypeStats.map(b => b.badge_type),
        datasets: [{
            data: data.badgeTypeStats.map(b => Number(b.count)), // 🔥 FIX
            backgroundColor: ['#007bff', '#28a745']
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function (context) {
                        const value = Number(context.raw);
                        const total = context.dataset.data
                            .map(Number)
                            .reduce((a, b) => a + b, 0);

                        const percent = ((value / total) * 100).toFixed(1);
                        return `${context.label}: ${value} (${percent}%)`;
                    }
                }
            }
        }
    }
});

    } catch (err) {
        console.error('Analytics load failed:', err);
        alert('Failed to load analytics');
    }
}

async function sendAdminMessage() {
    const msg = document.getElementById('sewadar-msg').value;
    const resUser = await fetch(`${BASE_URL}/api/user/${CURRENT_USER.username}`);
    const userData = await resUser.json();
    
    await fetch(`${BASE_URL}/api/sewadar/contact`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ badgeNo: userData.badge_no, message: msg })
    });
    alert("Message sent!");
    document.getElementById('sewadar-msg').value = '';
}

async function viewSewadarProfile() {
    const container = document.getElementById('sewadar-profile-details');
    container.innerHTML = '<p>Loading details...</p>';
    
    try {
        const res = await fetch(`${BASE_URL}/api/user/${CURRENT_USER.username}`);
        const user = await res.json();
        
        const picSrc = (user.pic && user.pic.startsWith('http')) ? user.pic : 'demo.png';

        container.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <img src="${picSrc}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 3px solid #ff9800;">
            </div>
            <p><strong>Name:</strong> ${user.name}</p>
            <p><strong>Username:</strong> ${user.username}</p>
            <p><strong>Badge No:</strong> ${user.badge_no}</p>
            <p><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
            <p><strong>Address:</strong> ${user.address || 'N/A'}</p>
            <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
        `;
    } catch (e) {
        container.innerHTML = '<p style="color:red;">Error loading profile.</p>';
    }
}

async function loadAdminMessages() {
    const container = document.getElementById('admin-messages-container');
    container.innerHTML = '<p><i class="fa fa-spinner fa-spin"></i> Loading messages...</p>';
    
    try {
        const res = await fetch(`${BASE_URL}/api/admin/messages`);
        const messages = await res.json();
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: white; border-radius: 8px; border: 1px dashed #ccc;">
                    <i class="fa fa-envelope-open" style="font-size: 40px; color: #ddd; margin-bottom: 10px;"></i>
                    <p style="color: #777;">No messages from Sewadars yet.</p>
                </div>`;
            return;
        }
        
        let html = '';
        messages.forEach(msg => {
            const date = new Date(msg.sent_at).toLocaleString();
            // Handle image path (Cloudinary or Local)
            const pic = (msg.pic && msg.pic.startsWith('http')) ? msg.pic : 'demo.png';
            
            html += `
            <div class="message-card" style="background: white; padding: 20px; border-radius: 8px; border-left: 5px solid #007bff; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-bottom: 15px;">
                <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                    <img src="${pic}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid #eee;">
                    <div>
                        <h4 style="margin: 0; color: #333;">${msg.name || 'Unknown Sewadar'}</h4>
                        <span style="font-size: 12px; color: #666; background: #eef; padding: 2px 6px; border-radius: 4px;">
                            Badge: ${msg.badge_no}
                        </span>
                        <div style="font-size: 11px; color: #888; margin-top: 2px;">${date}</div>
                    </div>
                </div>
                
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; color: #444; font-size: 14px; line-height: 1.5;">
                    <i class="fa fa-quote-left" style="color: #ccc; margin-right: 5px;"></i>
                    ${msg.message}
                </div>
            </div>`;
        });
        container.innerHTML = html;
        
    } catch(e) {
        console.error(e);
        container.innerHTML = '<p style="color:red;">Error loading messages. Check console.</p>';
    }
}

socket.on('admin-alert', (data) => {
    if (CURRENT_USER.role === 'admin') {
        const box = document.getElementById('live-alerts-box');
        const txt = document.getElementById('alert-text');
        if(box && txt) {
            txt.innerText = data.message;
            box.style.display = 'block';
            setTimeout(() => { box.style.display = 'none'; }, 8000);
        }
    }
}
);

async function showDigitalICard() {
    let badge = CURRENT_USER.badge_no;
    if(!badge) {
        const r = await fetch(`${BASE_URL}/api/user/${CURRENT_USER.username}`);
        const u = await r.json();
        badge = u.badge_no;
    }
    const res = await fetch(`${BASE_URL}/api/sewadar/qrcode/${badge}`);
    const data = await res.json();

    const div = document.createElement('div');
    div.style = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:9999; display:flex; justify-content:center; align-items:center;";
    div.innerHTML = `
        <div style="background:white; padding:25px; border-radius:12px; text-align:center; width:300px;">
            <h2 style="margin:0; color:#ff9800;">RSSB SEWADAR</h2>
            <img src="${data.qrCode}" style="width:200px; margin:15px 0;">
            <h1 style="margin:0; font-size:28px;">${badge}</h1>
            <p style="color:#666;">${CURRENT_USER.username}</p>
            <button onclick="this.parentElement.parentElement.remove()" style="background:#333; color:white; border:none; padding:10px 30px; border-radius:5px; cursor:pointer;">Close</button>
        </div>
    `;
    document.body.appendChild(div);
}

async function requestLeave() {
    const s = prompt("Start Date (YYYY-MM-DD):");
    if(!s) return;
    const e = prompt("End Date (YYYY-MM-DD):");
    const r = prompt("Reason:");
    
    // Get badge if missing
    let badge = CURRENT_USER.badge_no;
    if(!badge) {
        const uRes = await fetch(`${BASE_URL}/api/user/${CURRENT_USER.username}`);
        const u = await uRes.json();
        badge = u.badge_no;
    }

    await fetch(`${BASE_URL}/api/leave/request`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ badgeNo: badge, startDate: s, endDate: e, reason: r })
    });
    alert("Leave Request Sent!");
}

function getMyCurrentLocation() {
    if (!navigator.geolocation) {
        alert("Geolocation not supported by your browser");
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            
            // Ye alert dega jise tum copy kar paoge
            prompt("COPY THESE COORDINATES:", `const RSSB_CENTER_LAT = ${lat};\nconst RSSB_CENTER_LON = ${lon};`);
        },
        (error) => {
            alert("Error: " + error.message);
        }
    );
}

async function loadAdminLeaves() {
    const tbody = document.getElementById('admin-leave-table-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    try {
        const res = await fetch(`${BASE_URL}/api/admin/leaves`);
        const leaves = await res.json();

        if (leaves.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No Pending Requests</td></tr>';
            return;
        }

        let html = '';
        leaves.forEach(l => {
            const sDate = new Date(l.start_date).toLocaleDateString();
            const eDate = new Date(l.end_date).toLocaleDateString();

            html += `
            <tr>
                <td>
                    <strong>${l.name}</strong><br>
                    <span style="font-size:12px; color:#666;">${l.badge_no}</span>
                </td>
                <td>${sDate} to ${eDate}</td>
                <td>${l.reason}</td>
                <td>
                    <button onclick="respondLeave(${l.id}, 'Approved')" style="background:green; color:white; border:none; padding:5px 10px; cursor:pointer;">✔</button>
                    <button onclick="respondLeave(${l.id}, 'Rejected')" style="background:red; color:white; border:none; padding:5px 10px; cursor:pointer; margin-left:5px;">✖</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4">Error loading data</td></tr>';
    }
}

async function respondLeave(id, status) {
    if(!confirm(`Mark this request as ${status}?`)) return;

    await fetch(`${BASE_URL}/api/admin/leaves/respond`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ id, status })
    });
    
    // Refresh table automatically
    loadAdminLeaves();
}

document.addEventListener("DOMContentLoaded", () => {
    checkPasswordStrength("admin-new-password", "password-strength-text");
    checkPasswordStrength("user-new-password", "password-strength-text-user");
    checkPasswordStrength("new-password-input", "password-strength-text-reset");
    checkPasswordStrength("sewadar-new-password","sewadar-password-strength-text");
}
);

async function loadMyAttendanceSummary(range) {
    if (!currentUsername) return;

    const box = document.getElementById("attendance-summary-box");
    if (!box) return;

    box.innerHTML = "Loading...";

    try {
        const res = await fetch(
            `/api/attendance-summary?identifier=${currentUsername}&range=${range}`
        );
        const data = await res.json();

        if (!data.success) {
            box.innerHTML = data.message || "No data found.";
            return;
        }

        const s = data.summary;

        box.innerHTML = `
            <p>✅ Present Days: <b>${s.present_days}</b></p>
            <p>❌ Absent Days: <b>${s.absent_days}</b></p>
            <p>⏰ Late Days: <b>${s.late_days}</b></p>
            <p>⏱ Total Duty Time: <b>${Math.floor(s.total_minutes / 60)} hrs</b></p>
        `;
    } catch (err) {
        console.error(err);
        box.innerHTML = "Error loading summary.";
    }
}

async function loadAttendanceSummaryBySearch(range) {
    const input = document.getElementById("attendance-search-input");
    const box = document.getElementById("attendance-summary-box-admin");

    if (!input || !box) return;

    const identifier = input.value.trim();
    if (!identifier) {
        box.innerHTML = "Enter Sewadar username or badge no.";
        return;
    }

    box.innerHTML = "Loading...";

    try {
        const res = await fetch(
            `/api/attendance-summary?identifier=${identifier}&range=${range}`
        );
        const data = await res.json();

        if (!data.success) {
            box.innerHTML = data.message;
            return;
        }

        const s = data.summary;

        box.innerHTML = `
            <p><b>User:</b> ${data.username}</p>
            <p>✅ Present Days: <b>${s.present_days}</b></p>
            <p>❌ Absent Days: <b>${s.absent_days}</b></p>
            <p>⏰ Late Days: <b>${s.late_days}</b></p>
            <p>⏱ Total Duty Time: <b>${Math.floor(s.total_minutes / 60)} hrs</b></p>
        `;
    } catch (err) {
        console.error(err);
        box.innerHTML = "Error loading data.";
    }
}

async function loadUserAttendanceSummary(range) {
    const input = document.getElementById("user-attendance-search-input");
    const box = document.getElementById("user-attendance-summary-box");

    if (!input || !box) return;

    const identifier = input.value.trim();
    if (!identifier) {
        box.innerHTML = "Enter Sewadar username or badge no.";
        return;
    }

    box.innerHTML = "Loading...";

    try {
        const res = await fetch(
            `/api/attendance-summary?identifier=${encodeURIComponent(identifier)}&range=${range}`
        );
        const data = await res.json();

        if (!data.success) {
            box.innerHTML = data.message || "No data found.";
            return;
        }

        const s = data.summary;

        box.innerHTML = `
            <p><b>User:</b> ${data.username}</p>
            <p>✅ Present Days: <b>${s.present_days}</b></p>
            <p>❌ Absent Days: <b>${s.absent_days}</b></p>
            <p>⏰ Late Days: <b>${s.late_days}</b></p>
            <p>⏱ Total Duty Time: <b>${Math.floor(s.total_minutes / 60)} hrs</b></p>
        `;
    } catch (err) {
        console.error("User attendance error:", err);
        box.innerHTML = "Error loading data.";
    }
}

async function generateAttendanceReport() {
    const start = document.getElementById('report-start-date').value;
    const end = document.getElementById('report-end-date').value;
    
    if(!start || !end) return alert("Select Start and End dates.");

    const btn = event.target;
    btn.innerText = "Generating...";
    
    try {
        const res = await fetch(`${BASE_URL}/api/attendance/report?startDate=${start}&endDate=${end}`);
        const data = await res.json();
        
        if(!data.success || data.data.length === 0) {
            alert("No records found for this range.");
            btn.innerText = "View & Download Report";
            return;
        }

        // Export to Excel using SheetJS
        const ws = XLSX.utils.json_to_sheet(data.data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Attendance_Report");
        XLSX.writeFile(wb, `Attendance_${start}_to_${end}.xlsx`);
        
        alert("Report Downloaded Successfully!");
    } catch(e) {
        console.error(e);
        alert("Error generating report.");
    } finally {
        btn.innerText = "View & Download Report";
    }
}

async function sendBroadcast() {
    const msg = document.getElementById('broadcast-msg').value;
    if(!msg) return alert("Enter a message.");
    
    await fetch(`${BASE_URL}/api/admin/broadcast`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ message: msg, createdBy: CURRENT_USER.username })
    });
    alert("Broadcast Sent!");
    document.getElementById('broadcast-msg').value = '';
}

async function loadBroadcasts() {
    try {
        const res = await fetch(`${BASE_URL}/api/broadcasts`);
        const msgs = await res.json();
        
        if (msgs.length > 0) {
            // Determine the prefix based on role (user or sewadar)
            const prefix = CURRENT_USER.role === 'sewadar' ? 'sewadar' : 'user';
            
            const box = document.getElementById(`${prefix}-broadcast-box`);
            const textSpan = document.getElementById(`${prefix}-latest-broadcast-text`);
            
            if (box && textSpan) {
                box.style.display = 'flex';
                textSpan.innerText = msgs[0].message; // Show latest message
            }
        }
    } catch (e) {
        console.error("Error loading broadcasts:", e);
    }
}

async function loadUserMessages() {
    const container = document.getElementById('sewadar-message-thread');
    if(!container) return;
    
    const res = await fetch(`${BASE_URL}/api/sewadar/messages/${CURRENT_USER.badge_no}`);
    const msgs = await res.json();
    
    let html = '';
    msgs.forEach(m => {
        html += `
            <div style="background:#f9f9f9; padding:10px; margin-bottom:10px; border-radius:5px;">
                <p><strong>You:</strong> ${m.message}</p>
                <small style="color:#888;">${new Date(m.sent_at).toLocaleString()}</small>
                ${m.reply ? `
                    <div style="margin-top:10px; border-left:3px solid #007bff; padding-left:10px; background:#eef;">
                        <p><strong>Admin:</strong> ${m.reply}</p>
                        <small style="color:#666;">${new Date(m.reply_at).toLocaleString()}</small>
                    </div>
                ` : '<p><em>Waiting for reply...</em></p>'}
            </div>
        `;
    });
    container.innerHTML = html || '<p>No messages.</p>';
}

function goBackToUserList() {
    document.getElementById('user-account-detail-section').style.display = 'none';
    document.getElementById('view-users-list-section').style.display = 'block'; 
}
