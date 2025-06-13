  // Global variables for block functionality
let currentBlockingBookingId = null;
let currentBlockDatePopupMode = 'block'; // 'block' sau 'view'
let blockedDatesCache = [];

// Sistem de logging îmbunătățit pentru frontend
const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const logger = {
    info: () => {},
    warn: () => {},
    error: () => {}
};

// Detectare mediu și configurare URL API
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : window.location.protocol + '//' + window.location.hostname + '/api';

// Utilitare
function sanitizeHtml(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
}

function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

function showToast(message, isSuccess = true) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.className = 'toast ' + (isSuccess ? 'success' : 'error');
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }
}

// Block popup functionality
function showBlockPopup(bookingId) {
    currentBlockingBookingId = bookingId;
    const reasonInput = document.getElementById('blockReasonInput');
    const popup = document.getElementById('blockPopup');
    
    if (reasonInput) {
        reasonInput.value = '';
    }
    if (popup) {
        popup.style.display = 'flex';
    }
}

function hideBlockPopup() {
    currentBlockingBookingId = null;
    const popup = document.getElementById('blockPopup');
    if (popup) {
        popup.style.display = 'none';
    }
}

// Create card for booking
function createCard(booking, type = 'pending') {
    const card = document.createElement('div');
    card.className = 'card';

    const statusClass = type === 'pending' ? 'status-pending' : 'status-confirmed';
    const statusText = type === 'pending' ? 'În așteptare' : 'Confirmată';

    let actionsHtml = '';
    if (type === 'pending') {
        actionsHtml = `
            <div class="card-actions">
                <button class="btn btn-confirm" data-id="${sanitizeHtml(booking.id)}">Acceptă</button>
                <button class="btn btn-decline" data-id="${sanitizeHtml(booking.id)}">Refuză</button>
                <button class="btn btn-block" data-id="${sanitizeHtml(booking.id)}">Blochează</button>
            </div>
        `;
    } else {
        actionsHtml = `
            <div class="card-actions">
                <button class="btn btn-decline" data-id="${sanitizeHtml(booking.id)}">Anulează</button>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="card-header">
            <div class="card-title">${sanitizeHtml(booking.clientName)}</div>
            <div class="card-status ${statusClass}">${statusText}</div>
        </div>
        
        <div class="card-body">
            <div class="card-field email">
                <div class="card-field-label">Email</div>
                <div class="card-field-value">${sanitizeHtml(booking.email)}</div>
            </div>
            
            <div class="card-field phone">
                <div class="card-field-label">Telefon</div>
                <div class="card-field-value">${sanitizeHtml(booking.phoneNumber)}</div>
            </div>
            
            <div class="card-field service">
                <div class="card-field-label">Serviciu</div>
                <div class="card-field-value">${sanitizeHtml(booking.service)}</div>
            </div>
            
            ${type === 'pending' ? `
                <div class="card-field date">
                    <div class="card-field-label">Data</div>
                    <div class="card-field-value">${sanitizeHtml(booking.date)}</div>
                </div>
                
                <div class="card-field time">
                    <div class="card-field-label">Ora</div>
                    <div class="card-field-value">${sanitizeHtml(booking.time)}</div>
                </div>
            ` : `
                <div class="card-field time">
                    <div class="card-field-label">Ora</div>
                    <div class="card-field-value">${sanitizeHtml(booking.time)}</div>
                </div>
                
                <div class="card-field price">
                    <div class="card-field-label">Preț</div>
                    <div class="card-field-value">${sanitizeHtml(booking.servicePrice)} RON</div>
                </div>
            `}
        </div>
        
        ${actionsHtml}
    `;

    return card;
}

// Enhanced authentication and token management functions
function setupTokenExpiry() {
    const tokenTimestamp = localStorage.getItem('tokenTimestamp');
    const currentTime = new Date().getTime();
    
    if (tokenTimestamp && (currentTime - tokenTimestamp > 24 * 60 * 60 * 1000)) {
        localStorage.removeItem('token');
        localStorage.removeItem('tokenTimestamp');
        window.location.href = 'login.html';
        return false;
    }
    
    if (!tokenTimestamp || (currentTime - tokenTimestamp > 30 * 60 * 1000)) {
        localStorage.setItem('tokenTimestamp', currentTime);
    }
    
    return true;
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    
    if (!setupTokenExpiry()) {
        return null;
    }
    
    const authOptions = {
        ...options,
        headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`
        }
    };
    
    try {
        const response = await fetch(url, authOptions);
        
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            localStorage.removeItem('tokenTimestamp');
            window.location.href = 'login.html';
            return null;
        }
        
        return response;
    } catch (error) {
        logger.error('Network error:', error);
        showToast('Eroare de rețea. Verificați conexiunea.', false);
        return null;
    }
}

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    if (!setupTokenExpiry()) {
        return;
    }

    showLoading();
    try {
        // Verify token validity
        const response = await fetchWithAuth(`${API_URL}/dashboard`);
        
        if (!response) {
            return;
        }

        if (!response.ok) {
            throw new Error('Authentication failed');
        }

        // Set current date in date picker
        const today = new Date().toISOString().split('T')[0];
        const datePicker = document.getElementById('datePicker');
        if (datePicker) {
            datePicker.value = today;
        }

        // Load data
        await loadPendingBookings();
        await loadConfirmedBookings(today);
        await loadBlockedDates(); // Încarcă cache-ul pentru datele blocate

        // Add event listeners
        setupEventListeners();

    } catch (error) {
        logger.error('Error initializing dashboard:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('tokenTimestamp');
        window.location.href = 'login.html';
    } finally {
        hideLoading();
    }
});

// Setup all event listeners
function setupEventListeners() {
    const datePicker = document.getElementById('datePicker');
    const logoutBtn = document.getElementById('logoutBtn');
    const refreshPendingBtn = document.getElementById('refreshPendingBtn');
    const refreshConfirmedBtn = document.getElementById('refreshConfirmedBtn');
    const todayBtn = document.getElementById('todayBtn');
    const manualCleanupBtn = document.getElementById('manualCleanupBtn');

    if (datePicker) {
        datePicker.addEventListener('change', async () => {
            await loadConfirmedBookings(datePicker.value);
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    if (refreshPendingBtn) {
        refreshPendingBtn.addEventListener('click', loadPendingBookings);
    }

    if (refreshConfirmedBtn) {
        refreshConfirmedBtn.addEventListener('click', () => {
            const picker = document.getElementById('datePicker');
            if (picker) {
                loadConfirmedBookings(picker.value);
            }
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            const today = new Date().toISOString().split('T')[0];
            const picker = document.getElementById('datePicker');
            if (picker) {
                picker.value = today;
                loadConfirmedBookings(today);
            }
        });
    }

    if (manualCleanupBtn) {
        manualCleanupBtn.addEventListener('click', runManualCleanup);
    }

    // Setup block popup event listeners
    setupBlockPopupListeners();
    setupBlockDateListeners(); // Nou
}


// Setup block popup event listeners
function setupBlockPopupListeners() {
    const blockPopupClose = document.getElementById('blockPopupClose');
    const blockCancelBtn = document.getElementById('blockCancelBtn');
    const blockPopup = document.getElementById('blockPopup');
    const blockConfirmBtn = document.getElementById('blockConfirmBtn');

    if (blockPopupClose) {
        blockPopupClose.addEventListener('click', hideBlockPopup);
    }
    
    if (blockCancelBtn) {
        blockCancelBtn.addEventListener('click', hideBlockPopup);
    }
    
    if (blockPopup) {
        blockPopup.addEventListener('click', function(e) {
            if (e.target === this) {
                hideBlockPopup();
            }
        });
    }

    if (blockConfirmBtn) {
        blockConfirmBtn.addEventListener('click', async function() {
            const reasonInput = document.getElementById('blockReasonInput');
            const reason = reasonInput ? reasonInput.value.trim() : '';
            
            if (!reason) {
                showToast('Te rugăm să introduci un motiv pentru blocare', false);
                return;
            }

            if (!currentBlockingBookingId) {
                showToast('Eroare: ID rezervare lipsește', false);
                return;
            }

            await blockUser(currentBlockingBookingId, reason);
            hideBlockPopup();
        });
    }
}

// Load pending reservations
async function loadPendingBookings() {
    showLoading();
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/bookings/pending`);
        
        if (!response) {
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch pending reservations');
        }

        const data = await response.json();
        
        // Get the cards container
        const cardsContainer = document.getElementById('pendingReservationsCards');
        
        if (cardsContainer) {
            cardsContainer.innerHTML = '';
        }

        if (data.bookings && data.bookings.length > 0) {
            data.bookings.forEach(booking => {
                // Create card
                if (cardsContainer) {
                    const card = createCard(booking, 'pending');
                    cardsContainer.appendChild(card);
                }
            });

            // Add event listeners for action buttons
            addActionButtonListeners();
        } else {
            // No pending reservations
            if (cardsContainer) {
                const emptyCard = document.createElement('div');
                emptyCard.className = 'card';
                emptyCard.innerHTML = `
                    <div class="empty-message">Nu există rezervări în așteptare</div>
                `;
                cardsContainer.appendChild(emptyCard);
            }
        }
    } catch (error) {
        logger.error('Error loading pending reservations:', error);
        showToast('Nu s-au putut încărca rezervările în așteptare', false);
    } finally {
        hideLoading();
    }
}

// Load confirmed reservations for a specific date
async function loadConfirmedBookings(date) {
    if (!date) {
        logger.warn('No date provided for loadConfirmedBookings');
        return;
    }

    showLoading();
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/bookings/confirmed?date=${date}`);
        
        if (!response) {
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to fetch confirmed reservations');
        }

        const data = await response.json();
        
        // Get the cards container
        const cardsContainer = document.getElementById('confirmedReservationsCards');
        
        // Clear existing content safely
        if (cardsContainer) {
            try {
                cardsContainer.innerHTML = '';
            } catch (e) {
                logger.error('Error clearing cards container:', e);
            }
        }

        if (data.bookings && data.bookings.length > 0) {
            data.bookings.forEach((booking, index) => {
                try {
                    // Create card
                    if (cardsContainer) {
                        const card = createCard(booking, 'confirmed');
                        if (card) {
                            cardsContainer.appendChild(card);
                        }
                    }
                } catch (e) {
                    logger.error(`Error processing booking ${index}:`, e);
                }
            });

            // Add total card
            if (cardsContainer) {
                try {
                    const totalCard = document.createElement('div');
                    totalCard.className = 'card total-card';
                    totalCard.innerHTML = `
                        <div class="card-field">
                            <div class="card-field-label">Total Încasări</div>
                            <div class="card-field-value">${data.totalPrice} RON</div>
                        </div>
                    `;
                    cardsContainer.appendChild(totalCard);
                } catch (e) {
                    logger.error('Error adding total card:', e);
                }
            }

            // Add event listeners for cancel buttons
            try {
                addCancelButtonListeners();
            } catch (e) {
                logger.error('Error adding cancel button listeners:', e);
            }
        } else {
            // No confirmed reservations for this date
            if (cardsContainer) {
                try {
                    const emptyCard = document.createElement('div');
                    emptyCard.className = 'card';
                    emptyCard.innerHTML = `
                        <div class="empty-message">Nu există rezervări confirmate pentru această dată</div>
                    `;
                    cardsContainer.appendChild(emptyCard);

                    // Add total card showing 0
                    const totalCard = document.createElement('div');
                    totalCard.className = 'card total-card';
                    totalCard.innerHTML = `
                        <div class="card-field">
                            <div class="card-field-label">Total Încasări</div>
                            <div class="card-field-value">0 RON</div>
                        </div>
                    `;
                    cardsContainer.appendChild(totalCard);
                } catch (e) {
                    logger.error('Error adding empty card:', e);
                }
            }
        }
    } catch (error) {
        logger.error('Error loading confirmed reservations:', error);
        showToast('Nu s-au putut încărca rezervările confirmate', false);
    } finally {
        hideLoading();
    }
}

// Add event listeners for action buttons
function addActionButtonListeners() {
    // Accept buttons - NO CONFIRMATION
    const acceptButtons = document.querySelectorAll('.btn-confirm');
    acceptButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const bookingId = button.getAttribute('data-id');
            if (bookingId) {
                await confirmBooking(bookingId);
            }
        });
    });

    // Decline buttons from pending - NO CONFIRMATION  
    const declineButtons = document.querySelectorAll('#pendingReservationsCards .btn-decline');
    declineButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const bookingId = button.getAttribute('data-id');
            if (bookingId) {
                await declineBooking(bookingId);
            }
        });
    });

    // Block buttons - CUSTOM POPUP ONLY
    const blockButtons = document.querySelectorAll('.btn-block');
    blockButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const bookingId = button.getAttribute('data-id');
            if (bookingId) {
                showBlockPopup(bookingId);
            }
        });
    });
}

// Add event listeners for cancel buttons
function addCancelButtonListeners() {
    const cancelButtons = document.querySelectorAll('#confirmedReservationsCards .btn-decline');
    cancelButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const bookingId = button.getAttribute('data-id');
            if (bookingId) {
                await declineBooking(bookingId);
            }
        });
    });
}

// Confirm booking (ABSOLUTELY NO CONFIRMATION POPUP)
async function confirmBooking(bookingId) {
    if (!bookingId) {
        showToast('Eroare: ID rezervare lipsește', false);
        return;
    }

    showLoading();
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/bookings/${bookingId}/confirm`, {
            method: 'PUT'
        });
        
        if (!response) {
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to confirm booking');
        }

        const result = await response.json();

        // Reload data
        await loadPendingBookings();
        const datePicker = document.getElementById('datePicker');
        if (datePicker && datePicker.value) {
            await loadConfirmedBookings(datePicker.value);
        }
        
        let message = 'Rezervare confirmată cu succes!';
        if (result.emailStatus === 'sent') {
            message += ' Un email de confirmare a fost trimis clientului.';
        } else if (result.emailStatus === 'limited') {
            message += ' (Notă: Email-ul nu a fost trimis - limită atinsă)';
        } else if (result.emailStatus === 'failed') {
            message += ' (Notă: Email-ul nu a putut fi trimis)';
        }
        
        showToast(message, true);
    } catch (error) {
        logger.error('Error confirming booking:', error);
        showToast('Nu s-a putut confirma rezervarea', false);
    } finally {
        hideLoading();
    }
}

// Decline booking (ABSOLUTELY NO CONFIRMATION POPUP)
async function declineBooking(bookingId) {
    if (!bookingId) {
        showToast('Eroare: ID rezervare lipsește', false);
        return;
    }

    showLoading();
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/bookings/${bookingId}/decline`, {
            method: 'PUT'
        });
        
        if (!response) {
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to decline booking');
        }

        const result = await response.json();

        // Reload data
        await loadPendingBookings();
        const datePicker = document.getElementById('datePicker');
        if (datePicker && datePicker.value) {
            await loadConfirmedBookings(datePicker.value);
        }
        
        let message = 'Rezervare refuzată cu succes!';
        if (result.emailStatus === 'sent') {
            message += ' Un email de notificare a fost trimis clientului.';
        } else if (result.emailStatus === 'limited') {
            message += ' (Notă: Email-ul nu a fost trimis - limită atinsă)';
        } else if (result.emailStatus === 'failed') {
            message += ' (Notă: Email-ul nu a putut fi trimis)';
        }
        
        showToast(message, true);
    } catch (error) {
        logger.error('Error declining booking:', error);
        showToast('Nu s-a putut refuza rezervarea', false);
    } finally {
        hideLoading();
    }
}

// Block user with reason
async function blockUser(bookingId, reason) {
    showLoading();
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/users/block/${bookingId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reason })
        });
        
        if (!response) {
            return;
        }

        if (!response.ok) {
            throw new Error('Failed to block user');
        }

        // Reload pending reservations
        await loadPendingBookings();
        
        showToast('Utilizator blocat cu succes! Adresa de email și numărul de telefon au fost adăugate în lista de blocate.', true);
    } catch (error) {
        logger.error('Error blocking user:', error);
        showToast('Nu s-a putut bloca utilizatorul', false);
    } finally {
        hideLoading();
    }
}

function setupBlockDateListeners() {
    const blockDateBtn = document.getElementById('blockDateBtn');
    const blockDatePopup = document.getElementById('blockDatePopup');
    const blockDateClose = document.getElementById('blockDateClose');
    const blockDateCancel = document.getElementById('blockDateCancel');
    const blockDateConfirm = document.getElementById('blockDateConfirm');
    const viewBlockedDatesBtn = document.getElementById('viewBlockedDatesBtn');
    const fullDayCheckbox = document.getElementById('fullDayBlock');
    const hoursSelectionDiv = document.getElementById('hoursSelection');

    if (blockDateBtn) {
        blockDateBtn.addEventListener('click', () => {
            currentBlockDatePopupMode = 'block';
            showBlockDatePopup();
        });
    }

    if (viewBlockedDatesBtn) {
        viewBlockedDatesBtn.addEventListener('click', () => {
            currentBlockDatePopupMode = 'view';
            showBlockedDatesView();
        });
    }

    if (blockDateClose) {
        blockDateClose.addEventListener('click', hideBlockDatePopup);
    }

    if (blockDateCancel) {
        blockDateCancel.addEventListener('click', hideBlockDatePopup);
    }

    if (blockDatePopup) {
        blockDatePopup.addEventListener('click', function(e) {
            if (e.target === this) {
                hideBlockDatePopup();
            }
        });
    }

    if (fullDayCheckbox) {
        fullDayCheckbox.addEventListener('change', function() {
            if (hoursSelectionDiv) {
                hoursSelectionDiv.style.display = this.checked ? 'none' : 'block';
            }
        });
    }

    if (blockDateConfirm) {
        blockDateConfirm.addEventListener('click', handleBlockDateConfirm);
    }
}

function showBlockDatePopup() {
    const blockDatePopup = document.getElementById('blockDatePopup');
    const blockDateInput = document.getElementById('blockDateInput');
    const fullDayCheckbox = document.getElementById('fullDayBlock');
    const hoursSelectionDiv = document.getElementById('hoursSelection');
    
    if (blockDatePopup) {
        // Resetează formularul
        if (blockDateInput) {
            const today = new Date().toISOString().split('T')[0];
            blockDateInput.value = today;
            blockDateInput.setAttribute('min', today);
        }
        
        if (fullDayCheckbox) {
            fullDayCheckbox.checked = true;
        }
        
        if (hoursSelectionDiv) {
            hoursSelectionDiv.style.display = 'none';
            generateHourCheckboxes();
        }
        
        blockDatePopup.style.display = 'flex';
    }
}

function hideBlockDatePopup() {
    const blockDatePopup = document.getElementById('blockDatePopup');
    if (blockDatePopup) {
        blockDatePopup.style.display = 'none';
    }
}

function generateHourCheckboxes() {
    const hoursContainer = document.getElementById('hoursContainer');
    if (!hoursContainer) return;
    
    hoursContainer.innerHTML = '';
    
    // Generează ore de la 10:00 la 19:00 (cu pauze de 30 min)
    const hours = [];
    for (let hour = 10; hour < 19; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
            const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            hours.push(timeString);
        }
    }
    
    hours.forEach(hour => {
        const checkboxWrapper = document.createElement('div');
        checkboxWrapper.className = 'hour-checkbox-wrapper';
        
        checkboxWrapper.innerHTML = `
            <label class="hour-checkbox-label">
                <input type="checkbox" value="${hour}" class="hour-checkbox">
                <span>${hour}</span>
            </label>
        `;
        
        hoursContainer.appendChild(checkboxWrapper);
    });
}

// Funcție pentru confirmarea blocării
async function handleBlockDateConfirm() {
    const blockDateInput = document.getElementById('blockDateInput');
    const fullDayCheckbox = document.getElementById('fullDayBlock');
    const hourCheckboxes = document.querySelectorAll('.hour-checkbox:checked');
    
    if (!blockDateInput || !fullDayCheckbox) {
        showToast('Eroare în interfață', false);
        return;
    }
    
    const selectedDate = blockDateInput.value;
    const isFullDay = fullDayCheckbox.checked;
    
    if (!selectedDate) {
        showToast('Te rugăm să selectezi o dată', false);
        return;
    }
    
    if (!isFullDay && hourCheckboxes.length === 0) {
        showToast('Te rugăm să selectezi cel puțin o oră', false);
        return;
    }
    
    const selectedHours = Array.from(hourCheckboxes).map(cb => cb.value);
    
    showLoading();
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/blocked-dates`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                date: selectedDate,
                isFullDay: isFullDay,
                hours: isFullDay ? [] : selectedHours
            })
        });
        
        if (!response) return;
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Eroare la blocarea datei');
        }
        
        const result = await response.json();
        
        hideBlockDatePopup();
        showToast(result.message || 'Data a fost blocată cu succes', true);
        
        // Reîncarcă lista de date blocate pentru cache
        await loadBlockedDates();
        
    } catch (error) {
        logger.error('Error blocking date:', error);
        showToast(error.message || 'Nu s-a putut bloca data', false);
    } finally {
        hideLoading();
    }
}

// Funcție pentru încărcarea datelor blocate
async function loadBlockedDates() {
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/blocked-dates`);
        
        if (!response) return;
        
        if (!response.ok) {
            throw new Error('Failed to fetch blocked dates');
        }
        
        const data = await response.json();
        blockedDatesCache = data.blockedDates || [];
        
        return blockedDatesCache;
    } catch (error) {
        logger.error('Error loading blocked dates:', error);
        return [];
    }
}

// Funcție pentru afișarea listei de date blocate
async function showBlockedDatesView() {
    showLoading();
    try {
        const blockedDates = await loadBlockedDates();
        
        const blockDatePopup = document.getElementById('blockDatePopup');
        const popupTitle = document.getElementById('blockDatePopupTitle');
        const popupContent = document.getElementById('blockDatePopupContent');
        
        if (!blockDatePopup || !popupTitle || !popupContent) {
            showToast('Eroare în interfață', false);
            return;
        }
        
        popupTitle.textContent = 'Date Blocate';
        
        if (blockedDates.length === 0) {
            popupContent.innerHTML = `
                <div class="no-blocked-dates">
                    <p>Nu există date blocate în prezent.</p>
                </div>
            `;
        } else {
            let blockedDatesHTML = '<div class="blocked-dates-list">';
            
            blockedDates.forEach(blocked => {
                const dateFormatted = new Date(blocked.date).toLocaleDateString('ro-RO');
                const hoursText = blocked.isFullDayBlocked 
                    ? 'Toată ziua' 
                    : blocked.blockedHours.join(', ');
                
                blockedDatesHTML += `
                    <div class="blocked-date-item">
                        <div class="blocked-date-info">
                            <h4>${blocked.dateFormatted}</h4>
                            <p><strong>Tip:</strong> ${hoursText}</p>
                            <p><strong>Motiv:</strong> ${blocked.reason}</p>
                            <p><strong>Creat de:</strong> ${blocked.createdBy}</p>
                        </div>
                        <button class="btn btn-decline unblock-date-btn" data-id="${blocked.id}">
                            Deblochează
                        </button>
                    </div>
                `;
            });
            
            blockedDatesHTML += '</div>';
            popupContent.innerHTML = blockedDatesHTML;
            
            // Adaugă event listeners pentru butoanele de deblocare
            const unblockButtons = popupContent.querySelectorAll('.unblock-date-btn');
            unblockButtons.forEach(button => {
                button.addEventListener('click', async (e) => {
                    const blockedDateId = e.target.getAttribute('data-id');
                    if (blockedDateId) {
                        await unblockDate(blockedDateId);
                    }
                });
            });
        }
        
        blockDatePopup.style.display = 'flex';
        
    } catch (error) {
        logger.error('Error showing blocked dates view:', error);
        showToast('Nu s-au putut încărca datele blocate', false);
    } finally {
        hideLoading();
    }
}

// Funcție pentru deblocarea unei date
async function unblockDate(blockedDateId) {
    if (!confirm('Ești sigur că vrei să deblochezi această dată?')) {
        return;
    }
    
    showLoading();
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/blocked-dates/${blockedDateId}`, {
            method: 'DELETE'
        });
        
        if (!response) return;
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Eroare la deblocarea datei');
        }
        
        const result = await response.json();
        showToast(result.message || 'Data a fost deblocată cu succes', true);
        
        // Reîncarcă lista
        await showBlockedDatesView();
        
    } catch (error) {
        logger.error('Error unblocking date:', error);
        showToast(error.message || 'Nu s-a putut debloca data', false);
    } finally {
        hideLoading();
    }
}

// Funcție pentru rularea manuală a curățării
async function runManualCleanup() {
    if (!confirm('Ești sigur că vrei să rulezi curățarea automată? Aceasta va șterge rezervările expirate.')) {
        return;
    }
    
    showLoading();
    try {
        const response = await fetchWithAuth(`${API_URL}/admin/cleanup`, {
            method: 'POST'
        });
        
        if (!response) return;
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Eroare la rularea curățării');
        }
        
        const result = await response.json();
        
        const message = `Curățare completă: ${result.results.totalCleaned} rezervări curățate, ${result.results.totalErrors} erori`;
        showToast(message, true);
        
        // Reîncarcă datele
        await loadPendingBookings();
        const datePicker = document.getElementById('datePicker');
        if (datePicker && datePicker.value) {
            await loadConfirmedBookings(datePicker.value);
        }
        
    } catch (error) {
        logger.error('Error running manual cleanup:', error);
        showToast(error.message || 'Nu s-a putut rula curățarea', false);
    } finally {
        hideLoading();
    }
}


// Logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('tokenTimestamp');
    window.location.href = 'login.html';
}