const BASE_URL = 'https://rssb-rudrapur-database-api.onrender.com';
// INITIAL DATABASE
const database = {
    records: [],
    count: 0,
    filteredRecords: [],
    selectedRecords: new Set()
};

// INITIAL ALL PIC WITH DEMO PIC
function initDemoPics() {
  if (!database || !database.records) return;

  database.records.forEach(r => {
    if (!r.pic) {
      r.pic = "demo.png"; // default demo pic
    }
  });

  database.filteredRecords = [...database.records];
  saveToLocalStorage?.();
}

// Returns a promise so other functions can wait for it
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

// Wait until DOM is ready to initialize
let databaseReady = false;
window.addEventListener('DOMContentLoaded', async () => {
    await initializeDatabase();
    databaseReady = true; // explicitly mark ready
})

// --- AUTHENTICATION ---
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
            document.getElementById("login-screen").style.display = "none";
            document.querySelector(".container").style.display = "block";
            await initializeDatabase();
            alert("Login successful!");
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('An error occurred during login. Please try again.');
    }
}

function logout() {
    document.getElementById("login-screen").style.display = "flex";
    document.querySelector(".container").style.display = "none";
}

// --- UI MANAGEMENT ---
function showForm(formId) {

    document.querySelectorAll('.form-container').forEach(form => form.style.display = 'none');
    const form = document.getElementById(formId);
    if (form) form.style.display = 'block';
}
function hideForms() {
    document.querySelectorAll('.form-container').forEach(form => form.style.display = 'none');
}
function updateTable() {
    const tbody = document.getElementById('records-body');
    tbody.innerHTML = '';
    const recordsToDisplay = database.filteredRecords;

    if (recordsToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;">No records found.</td></tr>';
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
            <td><img src="${record.pic}" alt="pic" style="height:50px;width:50px;border-radius:50%;"></td>
            <td>${record.name || ''}</td>
            <td>${record.parent_name || ''}</td>
            <td>${record.gender || ''}</td>
            <td>${record.phone || ''}</td>
            <td>${formatDateDDMMYYYY(record.birth_date) || ''}</td>
            <td>${calculateAge(formatDateDDMMYYYY(record.birth_date))}</td>
            <td>${record.address || ''}</td>
        `;
        tbody.appendChild(row);
    });

    const allCheckboxes = document.querySelectorAll('.record-checkbox');
    const selectAllCheckbox = document.getElementById('select-all');
    if (allCheckboxes.length > 0) {
        selectAllCheckbox.checked = Array.from(allCheckboxes).every(cb => cb.checked);
    }
}

// --- CRUD OPERATIONS ---
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


async function addRecord() {


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
        birth = `${parts[2]}-${parts[1]}-${parts[0]}`;
    } else {
        return alert('Invalid birth date format. Use dd-mm-yyyy.');
    }

    const formData = new FormData();
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

    try {
        const response = await fetch(`${BASE_URL}/api/records`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();
        
        if (result.success) {
            await initializeDatabase(); 
            alert('Record added successfully!');
            document.getElementById('add-form').reset();
            hideForms();
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error adding record:', error);
        alert('An error occurred while adding the record. Please check the console.');
    }
}


// --- FIND RECORD TO UPDATE ---
async function findRecordToUpdate() {
    try {
        const searchBadgeEl = document.getElementById('update-badge');
        if (!searchBadgeEl) throw new Error('Element #update-badge not found');

        const searchBadgeNo = searchBadgeEl.value.trim().toUpperCase();
        if (!searchBadgeNo) {
            alert('Enter a badge number to search.');
            return;
        }

        // --- Find the record on the backend ---
        const response = await fetch(`/api/records/${searchBadgeNo}`);
        if (response.status === 404) {
            alert('Record not found!');
            return;
        }

        const result = await response.json();
        const record = result.record;

        if (!record) {
            alert('Record not found!');
            return;
        }

        // --- Show and fill the update form ---
        const updateForm = document.getElementById('update-record-form');
        if (!updateForm) throw new Error('#update-record-form not found');
        updateForm.style.display = 'block';

        // Store the original badge number in a hidden input for the update call
        document.getElementById('update-original-badge-no').value = record.badge_no;

        const badgeTypeEl = document.getElementById('update-badge-type');
        const badgeNoEl = document.getElementById('update-badge-no');
        const nameEl = document.getElementById('update-name');
        const parentEl = document.getElementById('update-parent');
        const genderEl = document.getElementById('update-gender');
        const phoneEl = document.getElementById('update-phone');
        const birthEl = document.getElementById('update-birth');
        const addressEl = document.getElementById('update-address');
        const picInput = document.getElementById('update-pic');

        if (!badgeTypeEl || !badgeNoEl || !nameEl || !parentEl || !genderEl || !phoneEl || !birthEl || !addressEl) {
            alert('One or more update form elements are missing.');
            return;
        }

        badgeTypeEl.value = record.badge_type || 'OPENSLIP';
        badgeNoEl.value = record.badge_no || '';
        // badgeNoEl.readOnly = true; // This is a good practice to prevent changes

        nameEl.value = record.name || '';
        parentEl.value = record.parent_name || '';
        genderEl.value = record.gender || 'MALE';
        phoneEl.value = record.phone || '';
        addressEl.value = record.address || '';

        // --- Convert and set DOB ---
        if (record.birth_date) {
            const parts = record.birth_date.split('-'); // dd-mm-yyyy
            if (parts.length === 3) {
                birthEl.value = `${parts[2]}-${parts[1]}-${parts[0]}`;
            } else {
                birthEl.value = '';
            }
        } else {
            birthEl.value = '';
        }

    } catch (err) {
        console.error(err);
        alert('Error while finding record. See console.');
    }
}

// ---------- Update record ----------
async function updateRecord() {
    try {

        const originalBadgeNo = document.getElementById('update-original-badge-no')?.value;
        if (!originalBadgeNo) {
            alert('Original badge number missing. Search first.');
            return;
        }

        const badgeType = document.getElementById('update-badge-type').value.trim().toUpperCase();
        const badgeNo = document.getElementById('update-badge-no').value.trim().toUpperCase();
        const name = document.getElementById('update-name').value.trim().toUpperCase();
        const parent = document.getElementById('update-parent').value.trim().toUpperCase();
        const gender = document.getElementById('update-gender').value.trim();
        const phone = document.getElementById('update-phone').value.trim();
        const address = document.getElementById('update-address').value.trim().toUpperCase();
        const picInput = document.getElementById('update-pic');

        let birthRaw = document.getElementById('update-birth').value;
        if (!birthRaw) {
            return alert('Birth date is required!');
        }
        let birth = '';
        const parts = birthRaw.split('-');
        if (parts.length === 3) {
            birth = `${parts[2]}-${parts[1]}-${parts[0]}`;
        } else {
            return alert('Invalid birth date format. Use dd-mm-yyyy.');
        }

        if (!badgeType || !badgeNo || !name || !parent || !phone || !birth || !address) {
            alert('All fields are required!');
            return;
        }
        if (!/^\d{10}$/.test(phone)) {
            alert('Phone must be 10 digits!');
            return;
        }

        const formData = new FormData();
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

        try {
            const response = await fetch(`${BASE_URL}/api/records/${originalBadgeNo}`, {
                method: 'PUT',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                await initializeDatabase();
                alert('Record updated successfully!');
                document.getElementById('update-record-form').style.display = 'none';
                document.getElementById('update-badge').value = '';
                hideForms();
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Error updating record:', error);
            alert('An error occurred while updating the record. Please check the console.');
        }
    } catch (err) {
        console.error(err);
        alert('An unexpected error occurred. See console.');
    }
}

async function sendUpdateData(originalBadgeNo, badgeType, badgeNo, name, parent, gender, phone, birth, address, pic) {
    try {
        const response = await fetch(`/api/records/${originalBadgeNo}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                badgeType,
                badgeNo,
                name,
                parent,
                gender,
                phone,
                birth,
                address,
                pic
            })
        });

        const result = await response.json();

        if (result.success) {
            // Success hone par, backend se saare records dobara fetch karein
            await initializeDatabase();
            alert('Record updated successfully!');
            document.getElementById('update-record-form').style.display = 'none';
            document.getElementById('update-badge').value = '';
            hideForms();
        } else {
            alert(result.message);
        }
    } catch (error) {
        console.error('Error updating record:', error);
        alert('An error occurred while updating the record. Please check the console.');
    }
}

//----DOB VERIFICATION -----
function validateDOB(dob) {
    if (!dob) return false;
    const regex = /^\d{2}-\d{2}-\d{4}$/; // dd-mm-yyyy
    return regex.test(dob);
}

// ---------- Delete record ----------
async function confirmDelete() {
    const badgeNoEl = document.getElementById('delete-badge');
    if (!badgeNoEl) return alert('Delete badge input not found.');

    const badgeNo = badgeNoEl.value.trim().toUpperCase();

    if (confirm(`Are you sure you want to delete record for ${badgeNo}?`)) {
        try {
            const response = await fetch(`${BASE_URL}/api/records/${badgeNo}`, { method: 'DELETE' });
            if (response.status === 404) {
                alert('Record not found on server.');
                return;
            }
            const result = await response.json();
            
            if (result.success) {
                await initializeDatabase();
                database.selectedRecords.delete(badgeNo);
                alert('Record deleted successfully!');
                hideForms();
                badgeNoEl.value = '';
            } else {
                alert(result.message);
            }
        } catch (error) {
            console.error('Error deleting record:', error);
            alert('An error occurred while deleting the record. Please check the console.');
        }
    }
}

// ---------- Helper function to hide forms ----------
function hideForms() {
    const forms = ['add-form', 'update-form', 'delete-form', 'update-record-form']; // add all form IDs
    forms.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

// --- DATA MANAGEMENT & FILTERING ---
async function showAllRecords() {
    try {
        const response = await fetch(`${BASE_URL}/api/records`);
        if (!response.ok) {
            throw new Error('Failed to fetch records from the server.');
        }
        const records = await response.json();
        database.records = records;
        database.filteredRecords = records;
        
        document.getElementById('global-search').value = '';
        document.getElementById('badge-type-filter').value = '';
        
        updateTable();
        alert('Showing all records.');

    } catch (error) {
        console.error('Error in showAllRecords:', error);
        alert('Failed to load records. Please check the console for more details.');
    }
}

//----DOB FORMAT----
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


// ---SEARCH RECORD----
async function searchRecords() {
    try {
        const searchByRaw = document.getElementById('search-by')?.value;
        const searchTerm = document.getElementById('search-term')?.value.trim();

        if (!searchByRaw) return alert('Please select a search field!');
        if (!searchTerm) return alert('Please enter a search term!');

        const searchBy = searchByRaw.trim().toLowerCase();

        const response = await fetch(`${BASE_URL}/api/search?searchBy=${searchBy}&searchTerm=${encodeURIComponent(searchTerm)}`);

        if (!response.ok) {
            throw new Error('Failed to fetch search results from the server.');
        }

        const records = await response.json();
        database.filteredRecords = records;
        
        if (typeof hideForms === 'function') hideForms();
        if (typeof updateTable === 'function') updateTable();

        alert(`Found ${database.filteredRecords.length} record(s).`);

    } catch (err) {
        console.error(err);
        alert('Error during search. See console.');
    }
}

// ---SORT RECORD-----
async function sortDatabase() {
    const sortBy = prompt("Sort by:\n1. Badge No.\n2. Name\n3. Birth Date");
    if (!sortBy) {
        return;
    }

    let orderByColumn = '';
    let direction = 'ASC';
    
    switch(sortBy) {
        case '1':
            orderByColumn = 'badge_no';
            break;
        case '2':
            orderByColumn = 'name';
            break;
        case '3':
            orderByColumn = 'birth_date';
            break;
        default:
            alert('Invalid sort option.');
            return;
    }

    try {
        const response = await fetch(`${BASE_URL}/api/records?sort=${orderByColumn}&direction=${direction}`);
        const records = await response.json();
        database.records = records;
        database.filteredRecords = records;
        updateTable();
        alert('Database sorted!');
        
    } catch (error) {
        console.error('Error sorting records:', error);
        alert('Failed to sort records. Please check the console.');
    }
}

// --- SELECTION HANDLING ---
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

// --- PRINT & EXPORT ---

function showPrintModal() {
    document.getElementById('print-modal').style.display = 'block';
    generatePrintPreview();
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

function showNotification(message, type = 'info') {
    alert(message);
}

function generatePrintPreview() {
    // Step 1: User ne kis record set ko print karna hai (selected / filtered / all)
    const recordsToInclude = document.querySelector('input[name="records-to-print"]:checked').value;
    let recordsToPrint;

    switch (recordsToInclude) {
        case 'selected':
            if (database.selectedRecords.size === 0) {
                showNotification('Please select records to print.', 'error');
                document.getElementById('print-preview').innerHTML = '<p>No records selected.</p>';
                return;
            }
            recordsToPrint = [...database.records].filter(record => database.selectedRecords.has(record.badge_no));
            break;

        case 'filtered':
            recordsToPrint = [...database.filteredRecords];
            break;

        case 'all':
            recordsToPrint = [...database.records];
            break;
    }

    if (recordsToPrint.length === 0) {
        showNotification('No records match the criteria.', 'error');
        document.getElementById('print-preview').innerHTML = '<p>No records to display.</p>';
        return;
    }

    // Step 2: User ne kaunse fields select kiye print ke liye
    const printFields = Array.from(document.querySelectorAll('input[name="print-field"]:checked')).map(el => el.value);
    if (printFields.length === 0) {
        showNotification('Please select at least one field to print.', 'error');
        return;
    }

    // Step 3: Table headers prepare karna
    const headers = ['SR NO.'];
    const fieldMap = {
        'badge-type': 'BADGE TYPE',
        'badge-no': 'BADGE NO.',
        'pic': 'PICTURE',
        'name': 'NAME',
        'parent': 'PARENT NAME',
        'gender': 'GENDER',
        'phone': 'PHONE',
        'birth': 'BIRTH DATE',
        'age': 'AGE',
        'address': 'ADDRESS'
    };
    printFields.forEach(field => headers.push(fieldMap[field]));

    // Step 4: Table rows generate karna
    const rows = recordsToPrint.map((record, index) => {
        let rowData = `<td>${index + 1}</td>`;
        printFields.forEach(field => {
            let cellData = '';
            switch (field) {
                case 'age': cellData = calculateAge(formatDateDDMMYYYY(record.birth_date)
); break;
                case 'parent': cellData = record.parent_name; break;
                case 'birth': cellData = formatDateDDMMYYYY(record.birth_date); break;
                case 'pic': cellData = `<img src="${record.pic}" style="width:50px;height:50px;border-radius:50%;">`;
                break;
                default: cellData = record[field.replace('-', '_')] || '';
            }
            rowData += `<td>${cellData}</td>`;
        });
        return `<tr>${rowData}</tr>`;
    }).join('');

    // Step 5: Print preview HTML build karna
    const logoPath = "logo.png"; // Local logo path

    const printPreview = document.getElementById('print-preview');
    printPreview.innerHTML = `
    <table border="1" cellpadding="5" cellspacing="0" width="100%" 
           style="border-collapse: collapse; font-size:11px; page-break-inside:auto;">
        <thead style="display: table-header-group;">
            <!-- Logo + Title row -->
            <tr>
                <th colspan="${headers.length}" style="padding:10px; background:#fff; color:#000;">
                    <div style="display:flex; align-items:center; justify-content:center;">
                        <img src="${logoPath}" style="height:50px; margin-right:10px;">
                        <div style="text-align:center;">
                            <h2 style="margin:0; font-size:20px; font-weight:bold;">SEWADAR LIST</h2>
                            <span class="first-page-date" style="font-size:12px;">
                                Generated on ${new Date().toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                </th>
            </tr>
            <!-- Column headers -->
            <tr style="background:#222;color:#fff;font-weight:bold; text-align:center;">
                ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
        </thead>
        <tbody style="display: table-row-group;">
            ${rows}
            <tr style="font-weight:bold; background:#f2f2f2;">
                <td colspan="${headers.length}" style="text-align:right;">
                    Total: ${recordsToPrint.length} records
                </td>
            </tr>
        </tbody>
    </table>
    `;

    // Step 6: Print-specific CSS inject karna
    const style = document.createElement('style');
    style.innerHTML = `
        @media print {
            .first-page-date { display: block; } /* Date only on first page */
            thead tr:first-child { display: table-row-group; } /* Logo + title repeat */
            tbody tr:last-child { page-break-after: auto; } /* Total row last me */
        }
    `;
    document.head.appendChild(style);
}

// -------------------- Print function --------------------
function printPreview() {
    const printContent = document.getElementById('print-preview').innerHTML;
    const printStyle = `
        <style>
            @media print {
                body { margin:0; font-family: Arial, sans-serif; }
                table { width:100%; border-collapse: collapse; font-size:11px; page-break-inside:auto; }
                th, td { border:1px solid #555; padding:4px; }
                th { background:#222; color:#fff; font-weight:bold; text-align:center; }
                tbody tr:nth-child(even) { background:#f9f9f9; }
                tbody tr:nth-child(odd) { background:#fff; }
                tbody tr:last-child td { font-weight:bold; background:#f2f2f2; text-align:right; }
                thead { display: table-header-group; } /* repeat header */
                .print-header { display: flex; align-items:center; justify-content:center; margin-bottom:10px; }
                @page { size: auto; margin: 15mm; }
            }
        </style>
    `;

    const printArea = document.createElement('iframe');
    printArea.style.position = 'absolute';
    printArea.style.width = '0';
    printArea.style.height = '0';
    document.body.appendChild(printArea);

    const printDoc = printArea.contentWindow.document;
    printDoc.open();
    printDoc.write(`<html><head>${printStyle}</head><body>${printContent}</body></html>`);
    printDoc.close();

    printArea.contentWindow.focus();
    printArea.contentWindow.print();

    document.body.removeChild(printArea);
}

// -------------------- PDF function --------------------
async function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    const preview = document.getElementById("print-preview");
    if (!preview || !preview.innerHTML.trim()) {
        alert("Please generate a preview first.");
        return;
    }

    // Fields and headers
    const printFields = Array.from(document.querySelectorAll('input[name="print-field"]:checked')).map(el => el.value);
    if (!printFields.includes('pic')) printFields.unshift('pic'); // always include pic first if not selected

    const headers = ["SR NO."];
    const fieldMap = {
        "pic": "PICTURE",
        "badge-type": "BADGE TYPE",
        "badge-no": "BADGE NO.",
        "name": "NAME",
        "parent": "PARENT NAME",
        "gender": "GENDER",
        "phone": "PHONE",
        "birth": "BIRTH DATE",
        "age": "AGE",
        "address": "ADDRESS"
    };
    printFields.forEach(f => headers.push(fieldMap[f]));

    // Select records
    const recordsToInclude = document.querySelector('input[name="records-to-print"]:checked').value;
    let recordsToPrint = [];
    switch (recordsToInclude) {
        case "selected":
            recordsToPrint = [...database.records].filter(r => database.selectedRecords.has(r.badge_no));
            break;
        case "filtered":
            recordsToPrint = [...database.filteredRecords];
            break;
        case "all":
            recordsToPrint = [...database.records];
            break;
    }

    // Generate rows
    const rows = recordsToPrint.map((record, index) => {
    const row = [index + 1];
    printFields.forEach(field => {
        switch(field) {
            case "pic":
                row.push(""); // <-- text ko empty rakho, sirf image draw hogi
                break;
            case "age":
                row.push(calculateAge(formatDateDDMMYYYY(record.birth_date)));
                break;
            case "birth":
                row.push(formatDateDDMMYYYY(record.birth_date));
                break;
            case "parent":
                row.push(record.parent_name);
                break;
            default:
                row.push(record[field.replace("-", "_")] || "");
        }
    });
    return row;
});


    // Add total row
    rows.push(Array(headers.length).fill(""));
    rows[rows.length - 1][headers.length - 1] = `Total: ${recordsToPrint.length} records`;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.autoTable({
        head: [headers],
        body: rows,
        margin: { top: 35, left: 12, right: 12 },
        styles: { fontSize: 9, cellPadding: 3, lineColor: [200, 200, 200], lineWidth: 0.1 },
        headStyles: { fillColor: [34, 45, 50], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        bodyStyles: { textColor: [33, 33, 33] },

       didDrawCell: function (data) {
    // Sirf body section ke cells me image draw karo
    if (data.section === 'body') {
        const colIndex = data.column.index;
        const fieldName = printFields[colIndex - 1]; // SR NO column is first
        if (fieldName === "pic") {
            const record = recordsToPrint[data.row.index];
            try {
                doc.addImage(record.pic || "demo.png", "PNG", data.cell.x + 1, data.cell.y + 1, 10, 10);
            } catch (e) {
                console.error("Image load error:", e);
            }
        }
    }
}


,

        didDrawPage: function (data) {
            // Header, title, logo, footer same as original
            const logoSize = 12;
            const gap = 5;
            const blockY = 18;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            const title = "SEWADAR LIST";
            const titleWidth = doc.getTextWidth(title);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            const dateText = "Generated on " + new Date().toLocaleDateString();
            const blockWidth = logoSize + gap + Math.max(titleWidth, doc.getTextWidth(dateText));
            const startX = (pageWidth - blockWidth) / 2;

            try {
                doc.addImage("logo.png", "PNG", startX, blockY - logoSize + 5, logoSize, logoSize);
            } catch(e) {}

            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text(title, startX + logoSize + gap, blockY);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(dateText, startX + logoSize + gap, blockY + 6);

            doc.setDrawColor(60);
            doc.setLineWidth(0.5);
            doc.line(12, blockY + 10, pageWidth - 12, blockY + 10);

            const str = "Page " + data.pageNumber + " of " + doc.internal.getNumberOfPages();
            doc.setFontSize(9);
            doc.setFont("helvetica", "italic");
            doc.text(str, pageWidth / 2, pageHeight - 10, { align: "center" });
        }
    });

    doc.save("SEWADAR_LIST.pdf");
}

// -------------------- Excel function --------------------

function exportToExcel() {
    const table = document.getElementById('print-preview').querySelector('table');
    if (!table) {
        alert("Please generate a preview first.");
        return;
    }

    // Convert table to worksheet
    const ws = XLSX.utils.table_to_sheet(table);

    // Apply styles
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Loop through all cells
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (!ws[cellRef]) continue;

            // Header row styling
            if (R === 0) {
                ws[cellRef].s = {
                    font: { bold: true, color: { rgb: "FFFFFF" } },
                    fill: { fgColor: { rgb: "2C3E50" } }, // dark blue header
                    alignment: { horizontal: "center", vertical: "center" },
                    border: {
                        top: { style: "thin", color: { rgb: "999999" } },
                        bottom: { style: "thin", color: { rgb: "999999" } },
                        left: { style: "thin", color: { rgb: "999999" } },
                        right: { style: "thin", color: { rgb: "999999" } }
                    }
                };
            } else {
                // Normal rows
                ws[cellRef].s = {
                    alignment: { vertical: "center" },
                    border: {
                        top: { style: "thin", color: { rgb: "DDDDDD" } },
                        bottom: { style: "thin", color: { rgb: "DDDDDD" } },
                        left: { style: "thin", color: { rgb: "DDDDDD" } },
                        right: { style: "thin", color: { rgb: "DDDDDD" } }
                    }
                };

                // Zebra striping for even rows
                if (R % 2 === 0) {
                    ws[cellRef].s.fill = { fgColor: { rgb: "F5F5F5" } }; // light gray
                }
            }
        }
    }

    // Auto column widths
    const colWidths = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
        let maxWidth = 10;
        for (let R = range.s.r; R <= range.e.r; ++R) {
            const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
            if (ws[cellRef] && ws[cellRef].v) {
                const len = ws[cellRef].v.toString().length;
                if (len > maxWidth) maxWidth = len;
            }
        }
        colWidths.push({ wch: maxWidth + 2 });
    }
    ws['!cols'] = colWidths;

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SEWADAR_LIST");

    // Save file
    XLSX.writeFile(wb, "SEWADAR_LIST.xlsx");
}

// Export the print-preview div as an image
async function exportToImage() {
    const printPreview = document.getElementById('print-preview');
    if (!printPreview || !printPreview.innerHTML.trim()) {
        alert("Please generate a preview first.");
        return;
    }

    // Make all images CORS-ready
    const images = printPreview.querySelectorAll('img');
    images.forEach(img => {
        if (!img.crossOrigin) {
            img.crossOrigin = "anonymous";
        }
    });

    // Wait for all images to load
    await waitForImages(printPreview);

    // Use html2canvas to render
    html2canvas(printPreview, {
        useCORS: true,
        logging: true,
        allowTaint: false
    })
    .then(canvas => {
        canvas.toBlob(blob => {
            if (!blob) {
                alert("Failed to create image.");
                return;
            }

            const link = document.createElement('a');
            link.download = 'SEWADAR_LIST.png';
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href); // cleanup
        }, 'image/png');
    })
    .catch(err => {
        console.error("Export failed:", err);
        alert("Failed to export image. Check console.");
    });
}

// Wait until all images in a container are fully loaded
function waitForImages(container) {
    const images = container.querySelectorAll('img');
    return Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
            img.onload = img.onerror = resolve;
        });
    }));
}

// --- UTILITY & HELPERS ---

function calculateAge(dobString) {
    // Expecting dobString in "dd-mm-yyyy" format
    if (!dobString) return NaN;

    const parts = dobString.split('-'); // ["dd", "mm", "yyyy"]
    if (parts.length !== 3) return NaN;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-based
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
function saveToLocalStorage() {
    localStorage.setItem("sewadarDB", JSON.stringify(database.records));
}
function loadFromLocalStorage() {
    const data = localStorage.getItem("sewadarDB");
    if (data) {
        try {
            database.records = JSON.parse(data);
            return true;
        } catch (e) {
            console.error("Error loading localStorage:", e);
            return false;
        }
    }
    return false;
}
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// --- EVENT LISTENERS ---

document.getElementById('global-search').addEventListener('input', function() {
    const searchTerm = this.value.trim().toUpperCase();
    if (!searchTerm) {
        database.filteredRecords = [...database.records];
    } else {
        database.filteredRecords = database.records.filter(record => {
            const age = calculateAge(formatDateDDMMYYYY(record.birth_date)
).toString();
            return Object.values(record).some(value => 
                String(value).toUpperCase().includes(searchTerm)
            ) || age.includes(searchTerm);
        });
    }
    updateTable();
});

document.getElementById('badge-type-filter').addEventListener('change', function() {
    const filterValue = this.value;
    if (!filterValue) {
        database.filteredRecords = [...database.records];
    } else {
        database.filteredRecords = database.records.filter(record => 
            record.badge_type === filterValue
        );
    }
    updateTable();
});

window.addEventListener('scroll', function() {
    const scrollButton = document.querySelector('.scroll-to-top');
    if (window.pageYOffset > 300) {
        scrollButton.style.display = 'block';
    } else {
        scrollButton.style.display = 'none';
    }
});

function scrollToOptions() {
    const options = document.querySelector('.print-options');
    // This will scroll to the bottom of the options box
    options.scrollTop = options.scrollHeight;
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('scroll', function() {
    const scrollButton = document.querySelector('.scroll-to-top');
    if (scrollButton) {
        scrollButton.style.display = (window.pageYOffset > 300) ? 'block' : 'none';
    }
});
// 1️⃣ Load existing records from localStorage
if (typeof loadFromLocalStorage === 'function') loadFromLocalStorage();

// 2️⃣ Add demo pic for old records
initDemoPics();

// 3️⃣ Render table
if (typeof updateTable === 'function') updateTable();
