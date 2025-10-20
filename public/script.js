// Global BASE_URL variable.
const API_BASE_URL = 'https://rssb-rudrapur-database-api.onrender.com'; 

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
    // NOTE: Agar aapne Admin aur User mein do alag ID rakhe hain, toh yeh logic use hoga.
    const tableBodyId = CURRENT_USER.role === 'admin' ? 'admin-records-body' : 'user-records-body';
    
    // Agar dono mein same ID hai, toh hum 'records-body' ID ko hi target karte hain (Jo aapne pehle use ki thi)
    // Hum maan rahe hain ki aapne pichle step mein ID ko unique kar diya hai.
    const tbody = document.getElementById(tableBodyId);

    if (!tbody) {
        // Agar yeh ID nahi mili to console mein error aayega
        console.error(`Critical Error: Table body (${tableBodyId}) is missing from the active dashboard section.`);
        // Emergency fallback: agar Admin ki table visible hai, to use hi target karo
        const fallbackTbody = document.getElementById('records-body'); 
        if (fallbackTbody) {
            // Agar ek generic ID mili, toh use hi fill karte hain.
            // Hum isi par kaam karenge kyunki yeh sabse aasan hai.
            fillTableContent(fallbackTbody);
            return;
        }
        return;
    }
    
    fillTableContent(tbody);

    // Inner function to avoid repetition
    function fillTableContent(targetTbody) {
        targetTbody.innerHTML = '';
        const recordsToDisplay = database.filteredRecords;

        if (recordsToDisplay.length === 0) {
            targetTbody.innerHTML = '<tr><td colspan="14" style="text-align:center;">No records found.</td></tr>'; 
            return;
        }
        
        recordsToDisplay.forEach((record, i) => {
            const isSelected = database.selectedRecords.has(record.badge_no);
            const row = document.createElement('tr');
            if (isSelected) row.classList.add('selected-row');
            
            row.innerHTML = `
                <td><input type="checkbox" class="record-checkbox" data-badge-no="${record.badge_no}" ${isSelected ? 'checked' : ''} onchange="toggleRecordSelection(this)"></td>
                <td>${i + 1}</td>
                <td>${record.badge_type || ''}</td>
                <td>${record.badge_no || ''}</td>
                <td><img src="${record.pic || 'demo.png'}" alt="pic" style="height:50px;width:50px;border-radius:50%;"></td>
                <td>${record.name || ''}</td>
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

    if (sectionId !== 'manage-users-section') {
        document.querySelectorAll('#manage-users-content section').forEach(sec => sec.style.display = 'none');
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
    document.getElementById('search-btn')?.addEventListener('click', () => showAdminSection('search-section'));
    document.getElementById('print-list-btn')?.addEventListener('click', () => showAdminSection('print-list-section'));
    document.getElementById('manage-requests-btn')?.addEventListener('click', () => showAdminSection('manage-requests-section'));
    document.getElementById('manage-users-btn')?.addEventListener('click', () => showAdminSection('manage-users-section'));

    document.getElementById('add-user-btn')?.addEventListener('click', () => { showAdminSection('manage-users-section'); document.getElementById('add-user-section').style.display = 'block'; });
    document.getElementById('manage-password-btn')?.addEventListener('click', () => { showAdminSection('manage-users-section'); document.getElementById('manage-password-section').style.display = 'block'; });
    document.getElementById('view-logs-btn')?.addEventListener('click', () => { showAdminSection('manage-users-section'); document.getElementById('view-logs-section').style.display = 'block'; });

    // User Dashboard Button Listeners
    document.getElementById('user-add-member-btn')?.addEventListener('click', () => showUserSection('user-add-section'));
    document.getElementById('user-view-members-btn')?.addEventListener('click', () => showUserSection('user-view-section'));
    document.getElementById('user-search-btn')?.addEventListener('click', () => showUserSection('user-search-section'));
    document.getElementById('user-print-list-btn')?.addEventListener('click', () => showUserSection('user-print-list-section'));
    document.getElementById('user-manage-requests-btn')?.addEventListener('click', () => showUserSection('user-requests-section'));
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
            <img src="${record.pic || 'demo.png'}" style="width:100px; height:100px; border-radius:50%; margin-bottom: 10px;">
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
        
        // 3. Populate HTML Section
        detailSection.innerHTML = `
            <button onclick="${goBackFunctionName}('${viewSectionId}')" style="float:right;">Go Back</button>
            <h2>Member Details & Actions: ${record.name}</h2>
            <div style="display:flex; gap:20px; align-items:center; padding: 20px 0;">
                <img src="${record.pic || 'demo.png'}" style="width:120px; height:120px; border-radius:5px;">
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

// Function to render the fetched data into HTML

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
    const formattedDate = formatDateDDMMYYYY(request.submission_timestamp);
    const dateString = String(request.submission_timestamp).replace(' ', 'T');
    const dateObj = new Date(dateString);
    const formattedTime = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const submittedTime = formattedDate === '' ? 'N/A' : `${formattedDate} ${formattedTime}`;


    // Helper function to compare and highlight differences
    const highlight = (originalVal, requestedVal) => {
        // Highlighting only applies if it's an UPDATE request AND values are different.
        if (!isUpdate || originalVal === requestedVal) {
            return requestedVal || 'N/A';
        }
        if (originalVal !== requestedVal) {
            return `<span style="color:red; font-weight:bold;">${requestedVal || 'Empty'}</span>`;
        }
        return requestedVal || 'N/A';
    };

    // Original Column ki value nikalne ka tareeka
    const getOriginalValue = (key) => {
        if (!originalExists || isAdd || isDelete) return 'N/A';
        const value = originalRecord[key];
        return value || 'N/A';
    };

    const requestedName = requestedData.name || 'N/A';
    
    container.innerHTML = `
        <button onclick="loadPendingRequests()" style="float:right;">Back to List</button>
        <h2>Review: ${request.request_type} Request (${request.tracking_id})</h2>
        <p><strong>Submitted By:</strong> ${request.requester_username} on ${submittedTime}</p>
        <hr>
        
                ${isUpdate ? 
                    // Sirf UPDATE ke liye Original data ke fields dikhao
                    `
                    <div style="display:flex; justify-content: space-between; gap: 20px;">
             <div style="width: 48%; padding: 15px; border: 1px solid ${isUpdate ? 'green' : 'green'}; background-color: ${isUpdate ? '#f0fff0' : '#fff'};">
                    <h3>Original Record (DATABASE COPY)</h3>
                <p><strong>Badge No:</strong> ${request.target_badge_no}</p>
                <p><strong>Picture:</strong> <img src="${originalExists ? originalRecord.pic : 'demo.png'}" style="width:50px; height:50px;"></p>
                    <p><strong>Badge Type:</strong> ${getOriginalValue('badge_type')}</p>
                    <p><strong>Name:</strong> ${getOriginalValue('name')}</p>
                    <p><strong>Parent Name:</strong> ${getOriginalValue('parent_name')}</p>
                    <p><strong>Gender:</strong> ${getOriginalValue('gender')}</p>
                    <p><strong>Phone:</strong> ${getOriginalValue('phone')}</p>
                    <p><strong>Birth Date:</strong> ${formatDateDDMMYYYY(getOriginalValue('birth_date'))}</p>
                    <p><strong>Address:</strong> ${getOriginalValue('address')}</p>
                    `
                    : ''
                }
            </div>

            <div style="width: 48%; padding: 15px; border: 1px solid ${isUpdate ? 'red' : 'green'}; background-color: ${isUpdate ? '#fef0f0' : '#f0fff0'};">
                <h3>Requested Data (${request.request_type})</h3>
                
                <p><strong>Badge No:</strong> ${requestedData.badge_no || 'N/A'}</p>
                <p><strong>Picture:</strong> <img src="${requestedData.pic || 'demo.png'}" style="width:50px; height:50px;"></p>
                   <p><strong>Badge Type:</strong> ${highlight(getOriginalValue('badge_type'), requestedData.badge_type)}</p>
                <p><strong>Name:</strong> ${highlight(getOriginalValue('name'), requestedName)}</p>
                <p><strong>Parent Name:</strong> ${highlight(getOriginalValue('parent_name'), requestedData.parent_name)}</p>
                <p><strong>Gender:</strong> ${highlight(getOriginalValue('gender'), requestedData.gender)}</p>
                <p><strong>Phone:</strong> ${highlight(getOriginalValue('phone'), requestedData.phone)}</p>
                <p><strong>Birth Date:</strong> ${highlight(formatDateDDMMYYYY(getOriginalValue('birth_date')), formatDateDDMMYYYY(requestedData.birth_date))}</p>
                <p><strong>Address:</strong> ${highlight(getOriginalValue('address'), requestedData.address)}</p>
                
            </div>
        </div>

        <hr>
        
        <h3>Requester's Reason:</h3>
        <p class="request-reason" style="">${originalReason || 'No reason provided.'}</p>
        
        <div class="action-buttons-final" style="margin-top: 20px;">
            <button onclick="approveRequest(${request.request_id})" class="btn-approve btn-lg">APPROVE & EXECUTE</button>
            <button onclick="rejectRequest(${request.request_id})" class="btn-reject btn-lg">REJECT</button>
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