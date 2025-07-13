// js/programare_script.js - VERSIUNE OPTIMIZATĂ

// Sistem de logging îmbunătățit pentru frontend
const isProd = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
const logger = {
    info: () => {},
    warn: () => {},
    error: () => {}
};

// Cache DOM pentru performanță
const domCache = {
    step1: null,
    step2: null,
    step3: null,
    step4: null,
    oreDisponibile: null,
    verificationPopup: null,
    sundayMessage: null,
    btnStep1: null,
    btnStep2: null,
    btnStep3: null,
    btnVerify: null,
    btnBackToStep1: null,
    btnBackToStep2: null,
    retrimiteCod: null,
    closeVerificationPopup: null,
    selectServiciu: null,
    dataProgramare: null,
    numeCompletInput: null,
    telefonInput: null,
    emailInput: null,
    countryCodeSelect: null,
    codVerificareInput: null,
    
    init() {
        this.step1 = document.getElementById('step1');
        this.step2 = document.getElementById('step2');
        this.step3 = document.getElementById('step3');
        this.step4 = document.getElementById('step4');
        this.oreDisponibile = document.getElementById('oreDisponibile');
        this.verificationPopup = document.getElementById('verificationPopup');
        this.sundayMessage = document.getElementById('sundayMessage');
        this.btnStep1 = document.getElementById('btnStep1');
        this.btnStep2 = document.getElementById('btnStep2');
        this.btnStep3 = document.getElementById('btnStep3');
        this.btnVerify = document.getElementById('btnVerify');
        this.btnBackToStep1 = document.getElementById('btnBackToStep1');
        this.btnBackToStep2 = document.getElementById('btnBackToStep2');
        this.retrimiteCod = document.getElementById('retrimiteCod');
        this.closeVerificationPopup = document.getElementById('closeVerificationPopup');
        this.selectServiciu = document.getElementById('serviciu');
        this.dataProgramare = document.getElementById('dataProgramare');
        this.numeCompletInput = document.getElementById('numeComplet');
        this.telefonInput = document.getElementById('telefon');
        this.emailInput = document.getElementById('email');
        this.countryCodeSelect = document.getElementById('countryCode');
        this.codVerificareInput = document.getElementById('codVerificare');
    }
};

// Variabile globale pentru stocare date
let selectedServiceId = null;
let selectedServiceName = null;
let selectedDate = null;
let selectedTime = null;
let numeComplet = null;
let telefon = null;
let email = null;
let countryCode = null;
let bookingId = null;

// Variabile pentru timer
let countdownInterval;
let secondsLeft = 0;
let canResend = true;

// API URL - detectează automat URL-ul în funcție de mediu
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:5000/api'
    : window.location.protocol + '//' + window.location.hostname + '/api';

// Funcție pentru debouncing - optimizare pentru input-uri
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Pool de notificări pentru a evita spam-ul
const notificationPool = {
    current: null,
    timeout: null,
    
    show(message, type = 'error') {
        // Elimină notificarea existentă
        if (this.current) {
            this.current.remove();
            this.current = null;
        }
        
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        // Creează notificarea
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        let icon;
        switch(type) {
            case 'success': icon = '✓'; break;
            case 'info': icon = 'ℹ'; break;
            case 'warning': icon = '⚠'; break;
            case 'error':
            default: icon = '⚠'; break;
        }

        notification.innerHTML = `
            <div class="icon">${sanitizeInput(icon)}</div>
            <div class="content">${sanitizeInput(message)}</div>
            <button class="close-btn">×</button>
        `;

        document.body.appendChild(notification);
        this.current = notification;

        // Afișează cu animație
        requestAnimationFrame(() => {
            notification.classList.add('show');
        });

        // Auto-remove
        const timeout = message.length > 100 ? 7000 : 5000;
        this.timeout = setTimeout(() => {
            if (this.current === notification) {
                notification.classList.remove('show');
                setTimeout(() => {
                    if (notification.parentElement) {
                        notification.remove();
                    }
                    if (this.current === notification) {
                        this.current = null;
                    }
                }, 300);
            }
        }, timeout);
    }
};

// Funcție optimizată pentru crearea și afișarea notificărilor
function showNotification(message, type = 'error') {
    notificationPool.show(message, type);
}

// Funcție pentru sanitizarea input-urilor pentru a preveni XSS
function sanitizeInput(input) {
    if (input === null || input === undefined) {
        return '';
    }
    
    let str;
    try {
        str = String(input);
    } catch (error) {
        logger.error('Error converting input to string:', error);
        return '';
    }
    
    if (str.length > 10000) {
        logger.warn('Input too long, truncating for security');
        str = str.substring(0, 10000);
    }
    
    const xssPatterns = [
        /<script[^>]*>.*?<\/script>/gi,
        /<iframe[^>]*>.*?<\/iframe>/gi,
        /<object[^>]*>.*?<\/object>/gi,
        /<embed[^>]*>.*?<\/embed>/gi,
        /<link[^>]*>/gi,
        /<meta[^>]*>/gi,
        /javascript:/gi,
        /vbscript:/gi,
        /on\w+\s*=/gi,
        /expression\s*\(/gi,
        /data:text\/html/gi,
        /data:application\/x-javascript/gi,
        /<svg[^>]*>.*?<\/svg>/gi
    ];
    
    for (const pattern of xssPatterns) {
        if (pattern.test(str)) {
            logger.warn('XSS attempt detected and blocked:', str.substring(0, 100));
            return '';
        }
    }
    
    str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    str = str.replace(/&#x?[0-9a-fA-F]+;/g, '');
    str = str.replace(/%[0-9a-fA-F]{2}/g, '');
    
    const div = document.createElement('div');
    div.textContent = str;
    let sanitized = div.innerHTML;
    
    if (/<[^>]+>/.test(sanitized)) {
        logger.warn('HTML detected after sanitization, blocking');
        return '';
    }
    
    return sanitized;
}

// Funcție pentru validarea input-urilor
function validateInput(type, value) {
    if (!value) return false;
    
    switch(type) {
        case 'nume':
            return /^[A-Za-zĂăÂâÎîȘșȚț\s-]{3,50}$/.test(value) && !/\s\s/.test(value);
        case 'telefon':
            return /^[0-9]{4,15}$/.test(value.replace(/\s+|-/g, ''));
        case 'email':
            return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
        case 'cod':
            return /^\d{6}$/.test(value);
        default:
            return true;
    }
}

// Funcție optimizată pentru suspendarea rezervării
async function suspendReservation() {
    if (!bookingId) {
        logger.warn('Nu există bookingId pentru suspendare');
        return;
    }

    try {
        logger.info('Suspendăm rezervarea:', bookingId);
        
        const response = await window.csrfManager.fetchWithCSRF(`${API_URL}/bookings/${bookingId}/suspend`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            bookingId = null;
            resetForm();
            showNotification('Rezervarea a fost suspendată. Intervalul orar este din nou disponibil.', 'info');
        } else {
            logger.error('Eroare la suspendarea rezervării:', data.message);
            bookingId = null;
            resetForm();
            showNotification('Rezervarea a fost anulată local.', 'info');
        }
        
    } catch (error) {
        logger.error('Eroare la suspendarea rezervării:', error);
        bookingId = null;
        resetForm();
        showNotification('Rezervarea a fost anulată local.', 'info');
    }
}

// Funcție optimizată pentru resetarea formularului
function resetForm() {
    // Resetează toate variabilele globale
    selectedServiceId = null;
    selectedServiceName = null;
    selectedDate = null;
    selectedTime = null;
    numeComplet = null;
    telefon = null;
    email = null;
    countryCode = null;
    bookingId = null;
    
    // Resetează inputurile folosind cache-ul DOM
    if (domCache.selectServiciu) domCache.selectServiciu.value = '';
    if (domCache.dataProgramare) domCache.dataProgramare.value = '';
    if (domCache.numeCompletInput) domCache.numeCompletInput.value = '';
    if (domCache.telefonInput) domCache.telefonInput.value = '';
    if (domCache.emailInput) domCache.emailInput.value = '';
    if (domCache.codVerificareInput) domCache.codVerificareInput.value = '';
    if (domCache.countryCodeSelect) domCache.countryCodeSelect.selectedIndex = 0;
    
    // Curăță orele disponibile
    if (domCache.oreDisponibile) domCache.oreDisponibile.innerHTML = '';
    
    // Oprește timer-ul dacă rulează
    clearInterval(countdownInterval);
    
    // Ascunde mesajul de duminică dacă este afișat
    if (domCache.sundayMessage) domCache.sundayMessage.style.display = 'none';
    
    // Reactiveză butonul step1 dacă era dezactivat
    if (domCache.btnStep1) {
        domCache.btnStep1.disabled = false;
        domCache.btnStep1.style.opacity = '1';
    }
}

// Funcție pentru a calcula data minimă permisă
function calculateMinDate() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = currentHour * 60 + currentMinutes;
    
    const PROGRAM_LUCRU = {
        weekdays: {
            start: 10 * 60,
            end: 19 * 60
        },
        saturday: {
            start: 10 * 60,
            end: 13 * 60
        }
    };
    
    const dayOfWeek = now.getDay();
    let canSelectToday = false;
    
    if (dayOfWeek === 0) {
        canSelectToday = false;
    } else if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        canSelectToday = currentTime < PROGRAM_LUCRU.weekdays.end;
    } else if (dayOfWeek === 6) {
        canSelectToday = currentTime < PROGRAM_LUCRU.saturday.end;
    }
    
    let minDate = new Date(now);
    if (!canSelectToday) {
        minDate.setDate(now.getDate() + 1);
    }
    
    return minDate.toISOString().split('T')[0];
}

// Funcție pentru a actualiza countdown-ul
function updateCountdown() {
    const countdownElement = document.getElementById('countdown');
    
    if (secondsLeft <= 0) {
        clearInterval(countdownInterval);
        if (countdownElement) countdownElement.style.display = 'none';
        if (domCache.retrimiteCod) domCache.retrimiteCod.style.display = 'inline-block';
        canResend = true;
        return;
    }
    
    if (countdownElement) {
        countdownElement.textContent = `Poți retrimite codul în ${secondsLeft} secunde.`;
    }
    secondsLeft--;
}

// Funcție pentru a începe countdown-ul
function startCountdown(seconds) {
    secondsLeft = seconds;
    clearInterval(countdownInterval);
    const countdownElement = document.getElementById('countdown');
    if (countdownElement) countdownElement.style.display = 'block';
    if (domCache.retrimiteCod) domCache.retrimiteCod.style.display = 'none';
    canResend = false;
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// FUNCȚIE OPTIMIZATĂ - Încarcă orele disponibile de la server
async function incarcaOreDisponibile() {
    try {
        logger.info(`Încărcăm orele disponibile pentru: serviceId=${selectedServiceId}, date=${selectedDate}`);
        
        const response = await window.csrfManager.fetchWithCSRF(`${API_URL}/available-time-slots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    serviceId: parseInt(selectedServiceId),
                    date: selectedDate
                })
            });
        
        logger.info('Status răspuns de la server:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error(`Eroare server (${response.status}):`, errorText);
            throw new Error(`Server responded with ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        logger.info('Răspuns de la server:', data);
        
        if (!domCache.oreDisponibile) return;
        
        if (data.success && data.timeSlots && data.timeSlots.length > 0) {
            // OPTIMIZARE: Construiește HTML-ul ca string, apoi setează o singură dată
            const slotsHTML = data.timeSlots.map(slot => {
                const safeSlot = sanitizeInput(slot);
                return `
                    <label>
                        <input type="radio" name="ora" value="${safeSlot}">
                        <span>${safeSlot}</span>
                    </label>
                `;
            }).join('');
            
            // O singură operație DOM în loc de N operații
            domCache.oreDisponibile.innerHTML = slotsHTML;
            logger.info(`S-au încărcat ${data.timeSlots.length} ore disponibile`);
        } else {
            // Afișează mesajul personalizat de la server
            const message = data.message || 'Nu există ore disponibile pentru data selectată.';
            
            // Verifică dacă este un mesaj de zi blocată
            if (message.includes('Suntem închiși în') || message.includes('indisponibile în')) {
                domCache.oreDisponibile.innerHTML = `
                    <div style="background-color: #1a1a1a; border-left: 4px solid #ff9800; padding: 15px; border-radius: 4px; text-align: center; color: white;">
                        <h3 style="color: #ff9800; margin-bottom: 10px; font-size: 16px;"> Zi Indisponibilă</h3>
                        <p style="margin-bottom: 10px; line-height: 1.5;">${sanitizeInput(message)}</p>
                        <p style="margin: 0; color: #ccc; font-size: 14px;">Program de lucru: Luni-Vineri (10:00-19:00), Sâmbătă (10:00-13:00)</p>
                    </div>
                `;
            } else {
                domCache.oreDisponibile.innerHTML = `<p style="color: white; text-align: center;">${sanitizeInput(message)}</p>`;
            }
            
            logger.info('Nu există ore disponibile pentru data selectată');
        }
    } catch (error) {
        logger.error('Eroare la încărcarea orelor disponibile:', error);
        if (domCache.oreDisponibile) {
            domCache.oreDisponibile.innerHTML = `
                <div style="background-color: #1a1a1a; border-left: 4px solid #f44336; padding: 15px; border-radius: 4px; text-align: center; color: white;">
                    <h3 style="color: #f44336; margin-bottom: 10px; font-size: 16px;"> Eroare de Conectare</h3>
                    <p style="margin-bottom: 10px; line-height: 1.5;">A apărut o eroare la încărcarea orelor disponibile.</p>
                    <p style="margin: 0; color: #ccc; font-size: 14px;">Te rugăm să încerci din nou sau să reîmprospătezi pagina.</p>
                </div>
            `;
        }
    }
}

// Funcție optimizată pentru verificarea disponibilității
async function verifyTimeSlotStillAvailable(selectedTime) {
    if (!selectedDate || !selectedServiceId || !selectedTime) {
        return false;
    }
    
    try {
        logger.info(` Verificăm dacă ora ${selectedTime} mai este disponibilă...`);
        
            const response = await window.csrfManager.fetchWithCSRF(`${API_URL}/available-time-slots`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    serviceId: parseInt(selectedServiceId),
                    date: selectedDate
                })
            });
        
        if (!response.ok) {
            logger.error('Eroare la verificarea orei:', response.status);
            return false;
        }
        
        const data = await response.json();
        const isStillAvailable = data.success && data.timeSlots && data.timeSlots.includes(selectedTime);
        
        if (isStillAvailable) {
            logger.info(` Ora ${selectedTime} este încă disponibilă`);
        } else {
            logger.warn(` Ora ${selectedTime} nu mai este disponibilă`);
        }
        
        return isStillAvailable;
        
    } catch (error) {
        logger.error('Eroare la verificarea orei:', error);
        return false;
    }
}

async function suspendActiveTimeLock() {
    try {
        const response = await window.csrfManager.fetchWithCSRF(`${API_URL}/bookings/active-timelock`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        
        const data = await response.json();
        return response.ok && data.success;
    } catch (error) {
        logger.error('Eroare la suspendarea TimeLock-ului:', error);
        return false;
    }
}

// Event Listeners optimizați cu debouncing pentru dată
const debouncedDateChange = debounce(async function() {
    if (!domCache.dataProgramare) return;
    
    const selectedDate = new Date(domCache.dataProgramare.value);
    const dayOfWeek = selectedDate.getDay();
    
    if (dayOfWeek === 0) { // Duminică
        if (domCache.sundayMessage) domCache.sundayMessage.style.display = 'block';
        if (domCache.btnStep1) {
            domCache.btnStep1.disabled = true;
            domCache.btnStep1.style.opacity = '0.5';
        }
        return;
    }
    
    // Verifică dacă data este blocată
    try {
        const response = await fetch(`${API_URL}/check-blocked-date?date=${domCache.dataProgramare.value}`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.isBlocked) {
                if (domCache.sundayMessage) {
                    domCache.sundayMessage.innerHTML = `
                        <h3>Zi Indisponibilă</h3>
                        <p>${sanitizeInput(data.reason)}</p>
                        <p>Te rugăm să selectezi o altă dată pentru programarea ta.</p>
                        <p>Program de lucru: Luni-Vineri (10:00-19:00), Sâmbătă (10:00-13:00)</p>
                    `;
                    domCache.sundayMessage.style.display = 'block';
                }
                if (domCache.btnStep1) {
                    domCache.btnStep1.disabled = true;
                    domCache.btnStep1.style.opacity = '0.5';
                }
                return;
            }
        }
    } catch (error) {
        logger.error('Eroare la verificarea datei blocate:', error);
    }
    
    // Data este OK
    if (domCache.sundayMessage) domCache.sundayMessage.style.display = 'none';
    if (domCache.btnStep1) {
        domCache.btnStep1.disabled = false;
        domCache.btnStep1.style.opacity = '1';
    }
}, 100);

// Funcție de inițializare optimizată
function initializeApp() {
    // Inițializează cache-ul DOM
    domCache.init();
    
    // Setează data minimă
    const minDate = calculateMinDate();
    if (domCache.dataProgramare) {
        domCache.dataProgramare.setAttribute('min', minDate);
    }
    
    // Event listeners optimizați
    if (domCache.dataProgramare) {
        domCache.dataProgramare.addEventListener('change', debouncedDateChange);
        
        domCache.dataProgramare.addEventListener('input', function() {
            const selectedDate = new Date(this.value);
            const currentDate = new Date();
            
            currentDate.setHours(0, 0, 0, 0);
            selectedDate.setHours(0, 0, 0, 0);
            
            if (selectedDate < currentDate) {
                showNotification('Nu poți selecta o dată din trecut!', 'error');
                this.value = '';
                if (domCache.sundayMessage) domCache.sundayMessage.style.display = 'none';
                if (domCache.btnStep1) {
                    domCache.btnStep1.disabled = false;
                    domCache.btnStep1.style.opacity = '1';
                }
                return;
            }
        });
    }
    
    // Event listeners pentru butoane înapoi
    if (domCache.btnBackToStep1) {
        domCache.btnBackToStep1.addEventListener('click', async function() {
            if (selectedServiceId && selectedDate) {
                logger.info('Reîncărcăm orele disponibile după revenirea la pasul 1...');
                await incarcaOreDisponibile();
            }
            
            if (domCache.step2) domCache.step2.classList.remove('active');
            if (domCache.step1) domCache.step1.classList.add('active');
        });
    }
    
   if (domCache.btnBackToStep2) {
    domCache.btnBackToStep2.addEventListener('click', async function() {
        // Suspendă TimeLock-ul activ când utilizatorul se întoarce la pasul 2
        logger.info('🔄 Utilizatorul s-a întors la pasul 2 - suspendăm TimeLock-ul activ...');
        
        const suspended = await suspendActiveTimeLock();
        
        if (suspended) {
            logger.info('✅ TimeLock suspendat cu succes');
        } else {
            logger.warn('⚠️ Nu s-a putut suspenda TimeLock-ul, dar continuăm...');
        }
        
        // Resetează ora selectată pentru UX
        selectedTime = null;
        
        // Reîncarcă orele disponibile pentru a reflecta disponibilitatea actualizată
        if (selectedServiceId && selectedDate) {
            logger.info('🔄 Reîncărcăm orele disponibile după suspendarea TimeLock-ului...');
            await incarcaOreDisponibile();
        }
        
        // Navigația normală
        if (domCache.step3) domCache.step3.classList.remove('active');
        if (domCache.step2) domCache.step2.classList.add('active');
    });
}
    
    // Event listener pentru butonul X de închidere a popup-ului
    if (domCache.closeVerificationPopup) {
        domCache.closeVerificationPopup.addEventListener('click', function() {
            if (domCache.verificationPopup) domCache.verificationPopup.style.display = 'none';
            suspendReservation();
            if (domCache.step3) domCache.step3.classList.remove('active');
            if (domCache.step1) domCache.step1.classList.add('active');
        });
    }
    
    // Event listener pentru închiderea popup-ului cu ESC
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && domCache.verificationPopup && domCache.verificationPopup.style.display === 'flex') {
            domCache.verificationPopup.style.display = 'none';
            suspendReservation();
            if (domCache.step3) domCache.step3.classList.remove('active');
            if (domCache.step1) domCache.step1.classList.add('active');
        }
    });
    
    // Pasul 1 -> Pasul 2
    if (domCache.btnStep1) {
        domCache.btnStep1.addEventListener('click', async function () {
            if (!domCache.selectServiciu || !domCache.dataProgramare) return;
            
            if (!domCache.selectServiciu.value || !domCache.dataProgramare.value) {
                showNotification('Te rugăm să selectezi un serviciu și o dată!', 'error');
                return;
            }
            
            const selectedDateObj = new Date(domCache.dataProgramare.value);
            const dayOfWeek = selectedDateObj.getDay();
            
            if (dayOfWeek === 0) {
                if (domCache.sundayMessage) domCache.sundayMessage.style.display = 'block';
                return;
            }

            selectedServiceId = domCache.selectServiciu.value;
            selectedServiceName = domCache.selectServiciu.options[domCache.selectServiciu.selectedIndex].text;
            selectedDate = domCache.dataProgramare.value;

            logger.info('Serviciu selectat:', selectedServiceId, selectedServiceName);
            logger.info('Dată selectată:', selectedDate);

            try {
                await incarcaOreDisponibile();
                
                if (domCache.step1) domCache.step1.classList.remove('active');
                if (domCache.step2) domCache.step2.classList.add('active');
            } catch (error) {
                logger.error('Eroare la pasul 1:', error);
                showNotification('A apărut o eroare. Te rugăm să încerci din nou.', 'error');
            }
        });
    }
    
    // Pasul 2 -> Pasul 3
    if (domCache.btnStep2) {
    domCache.btnStep2.addEventListener('click', async function () {
        // Verifică dacă containerul pentru ore există
        if (!domCache.oreDisponibile) {
            logger.error('Container ore disponibile nu a fost găsit');
            showNotification('Eroare în interfață. Te rugăm să reîmprospătezi pagina.', 'error');
            return;
        }
        
        // Găsește toate input-urile radio pentru ore
        const oreInputs = domCache.oreDisponibile.querySelectorAll('input[name="ora"]');
        let oraSelectata = null;
        
        // Verifică care oră a fost selectată
        oreInputs.forEach((radio) => {
            if (radio.checked) {
                oraSelectata = radio.value;
            }
        });

        // Validare - trebuie să existe o oră selectată
        if (!oraSelectata) {
            showNotification('Te rugăm să selectezi o oră!', 'error');
            return;
        }

        // Validare format oră pentru securitate
        if (!validateInput('time', oraSelectata)) {
            logger.error('Format oră invalid:', oraSelectata);
            showNotification('Format oră invalid. Te rugăm să selectezi din nou.', 'error');
            await incarcaOreDisponibile(); // Reîncarcă orele
            return;
        }

        // Verifică dacă avem toate datele necesare
        if (!selectedServiceId || !selectedDate) {
            logger.error('Date lipsă pentru rezervare:', { selectedServiceId, selectedDate });
            showNotification('Date incomplete. Te rugăm să începi din nou.', 'error');
            resetForm();
            return;
        }

        // Salvează ora selectată
        selectedTime = oraSelectata;
        logger.info(' Oră selectată:', selectedTime);

        // Dezactivează butonul temporar pentru a preveni click-uri multiple
        const originalText = this.textContent;
        this.disabled = true;
        this.textContent = 'Se procesează...';

        try {
            logger.info('📡 Trimitem cerere pentru rezervarea orei...');
            
            // Cerere directă la API pentru rezervarea orei
            const response = await window.csrfManager.fetchWithCSRF(`${API_URL}/bookings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    serviceId: parseInt(selectedServiceId),
                    date: selectedDate,
                    time: selectedTime
                })
            });

            // Verifică dacă cererea a fost procesată
            if (!response.ok) {
                throw new Error(`Eroare server: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            logger.info('📨 Răspuns de la server:', data);
            
            //  SUCCES - Ora a fost rezervată
            if (data.success) {
                logger.info(' Ora rezervată cu succes!');
                
                // Trece direct la pasul 3
                if (domCache.step2) domCache.step2.classList.remove('active');
                if (domCache.step3) domCache.step3.classList.add('active');
                
                
            } else {
                logger.warn(' Ora nu a putut fi rezervată:', data.message);
                
                // Procesează tipurile de erori pentru mesaje personalizate
                let errorMessage = data.message || 'Ora selectată nu mai este disponibilă';
                let errorType = 'error';
                let shouldRefreshSlots = true;
                
                if (data.message) {
                    // Admin a blocat ora/data
                    if (data.message.includes('blocat') || 
                        data.message.includes('închis') || 
                        data.message.includes('indisponibil')) {
                        errorMessage = `${data.message} Te rugăm să selectezi altă oră.`;
                        errorType = 'warning';
                        logger.info('🔒 Admin a blocat ora - refreshez orele...');
                    }
                    // Alt client a rezervat ora
                    else if (data.message.includes('nu mai este disponibil') || 
                             data.message.includes('rezervat de alt client') ||
                             data.message.includes('același timp')) {
                        errorMessage = `${data.message} Te rugăm să selectezi altă oră.`;
                        errorType = 'info';
                        logger.info('👥 Alt client a rezervat ora - refreshez orele...');
                    }
                    // Erori de validare (nu necesită refresh)
                    else if (data.message.includes('Serviciul nu a fost găsit') ||
                             data.message.includes('Date invalide')) {
                        errorType = 'error';
                        shouldRefreshSlots = false;
                        logger.error(' Eroare de validare:', data.message);
                    }
                    // Alte erori
                    else {
                        logger.info(' Eroare necunoscută - refreshez orele...');
                    }
                }
                
                // Afișează mesajul de eroare
                showNotification(errorMessage, errorType);
                
                // Reîncarcă orele dacă e necesar (pentru cazuri de conflict)
                if (shouldRefreshSlots) {
                    logger.info(' Reîncarcă orele disponibile...');
                    setTimeout(async () => {
                        await incarcaOreDisponibile();
                    }, 1000); // Delay pentru a permite utilizatorului să citească mesajul
                }
            }
            
        } catch (error) {
            // Gestionează erorile de rețea sau server
            logger.error(' Eroare la rezervarea orei:', error);
            
            let networkErrorMessage = 'A apărut o eroare la rezervarea orei.';
            let shouldRefreshSlots = true;
            
            // Personalizează mesajul în funcție de tipul erorii
            if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
                networkErrorMessage = 'Probleme de conexiune. Verifică internetul și încearcă din nou.';
            } else if (error.message.includes('timeout') || error.message.includes('AbortError')) {
                networkErrorMessage = 'Cererea a expirat. Te rugăm să încerci din nou.';
            } else if (error.message.includes('500')) {
                networkErrorMessage = 'Eroare de server. Te rugăm să încerci din nou în câteva minute.';
            } else if (error.message.includes('404')) {
                networkErrorMessage = 'Serviciul nu a fost găsit. Te rugăm să reîmprospătezi pagina.';
                shouldRefreshSlots = false;
            }
            
            showNotification(networkErrorMessage, 'error');
            
            // Reîncarcă orele în caz de erori de rețea
            if (shouldRefreshSlots) {
                logger.info(' Reîncarcă orele din cauza erorii de rețea...');
                setTimeout(async () => {
                    try {
                        await incarcaOreDisponibile();
                    } catch (refreshError) {
                        logger.error('Eroare la reîncărcarea orelor:', refreshError);
                        showNotification('Nu s-au putut reîncărca orele. Te rugăm să reîmprospătezi pagina.', 'error');
                    }
                }, 1500);
            }
            
        } finally {
            // Reactiveză butonul indiferent de rezultat
            this.disabled = false;
            this.textContent = originalText;
            
            logger.info(' Buton reactivat și proces finalizat');
        }
    });
}
    
    // Pasul 3 -> Verificare prin Email
    if (domCache.btnStep3) {
        domCache.btnStep3.addEventListener('click', async function () {
            if (!domCache.numeCompletInput || !domCache.telefonInput || !domCache.emailInput || !domCache.countryCodeSelect) return;
            
            numeComplet = domCache.numeCompletInput.value.trim();
            telefon = domCache.telefonInput.value.trim();
            email = domCache.emailInput.value.trim();
            countryCode = domCache.countryCodeSelect.value;

            if (!numeComplet || !telefon || !email) {
                showNotification('Te rugăm să introduci numele, telefonul și emailul!', 'error');
                return;
            }

            if (!validateInput('nume', numeComplet)) {
                showNotification('Numele trebuie să conțină doar litere, spații și cratime, între 3 și 50 caractere!', 'error');
                return;
            }
            
            if (!validateInput('email', email)) {
                showNotification('Te rugăm să introduci o adresă de email validă', 'error');
                return;
            }
            
            if (!validateInput('telefon', telefon)) {
                showNotification('Vă rugăm să introduceți un număr de telefon valid', 'error');
                return;
            }

            try {
                logger.info('Trimitem cerere pentru completarea rezervării...');
                const response = await window.csrfManager.fetchWithCSRF(`${API_URL}/bookings/complete`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        clientName: numeComplet,
                        phoneNumber: telefon,
                        email: email,
                        countryCode: countryCode,
                        serviceId: parseInt(selectedServiceId),
                        date: selectedDate,
                        time: selectedTime
                    })
                });

                const data = await response.json();
                logger.info('Răspuns completare rezervare:', data);
                
                if (data.success) {
                            bookingId = data.bookingId;
                            logger.info('ID Rezervare:', bookingId);
                            
                            // Resetează countdown-ul și starea butonului de retrimitere
                            const retrimiteCodElement = document.getElementById('retrimiteCod');
                            const countdownElement = document.getElementById('countdown');
                            if (retrimiteCodElement) retrimiteCodElement.style.display = 'inline-block';
                            if (countdownElement) countdownElement.style.display = 'none';
                            clearInterval(countdownInterval);
                            canResend = true;
                            
                            
                            if (domCache.codVerificareInput) domCache.codVerificareInput.value = '';
                            
                           
                            if (domCache.verificationPopup) domCache.verificationPopup.style.display = 'flex';
                            
                            
                            showNotification('Rezervare creată! Se trimite codul de verificare...', 'success');
                            
                            // FEEDBACK VIZUAL că email-ul se trimite
                            setTimeout(() => {
                                showNotification(' Verifică-ți inbox-ul pentru codul de verificare (codul se poate afla si in spam)', 'info');
                            }, 3000);
                        } else {
                        //  Verifică dacă sesiunea a expirat
                        if (data.message && data.message.includes('Sesiunea a expirat')) {
                            showNotification('Sesiunea a expirat. Se reîncarcă pagina...', 'error');
                            
                            // Redirect automat după 3 secunde
                            setTimeout(() => {
                                window.location.reload();
                            }, 3000);
                        } else {
                            showNotification(data.message || 'A apărut o eroare la trimiterea codului de verificare.', 'error');
                        }
                    }
            } catch (error) {
                logger.error('Eroare la pasul 3:', error);
                showNotification('A apărut o eroare la trimiterea codului de verificare. Te rugăm să încerci din nou.', 'error');
            }
        });
    }
    
    // Verifică codul de email
    if (domCache.btnVerify) {
        domCache.btnVerify.addEventListener('click', async function () {
            if (!domCache.codVerificareInput) return;
            
            const codVerificare = domCache.codVerificareInput.value.trim();

            if (!codVerificare) {
                showNotification('Te rugăm să introduci codul de verificare!', 'error');
                return;
            }
            
            if (!validateInput('cod', codVerificare)) {
                showNotification('Codul de verificare trebuie să conțină exact 6 cifre!', 'error');
                return;
            }

            try {
                logger.info('Trimitem cerere pentru verificarea codului...');
                const response = await window.csrfManager.fetchWithCSRF(`${API_URL}/bookings/verify`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        bookingId: bookingId,
                        code: codVerificare
                    })
                });

                const data = await response.json();
                logger.info('Răspuns verificare cod:', data);
                
                if (data.success) {
                    if (domCache.verificationPopup) domCache.verificationPopup.style.display = 'none';
                    if (domCache.step3) domCache.step3.classList.remove('active');
                    if (domCache.step4) domCache.step4.classList.add('active');
                    
                    const bookingData = {
                        serviciu: selectedServiceName,
                        data: selectedDate,
                        ora: selectedTime,
                        numeComplet: numeComplet,
                        telefon: countryCode + telefon,
                        email: email
                    };
                    
                    logger.info('Rezervare confirmată:', bookingData);
                } else {
                        // Verifică dacă e eroare de sesiune expirată
                        if (data.message && (data.message.includes('Sesiunea a expirat') || 
                                        data.message.includes('Rezervarea nu a fost găsită'))) {
                            showNotification('Sesiunea a expirat. Se reîncarcă pagina...', 'error');
                            
                            setTimeout(() => {
                                window.location.reload();
                            }, 3000);
                        } else {
                            showNotification(data.message || 'Codul de verificare este incorect!', 'error');
                        }
                    }
            } catch (error) {
                logger.error('Eroare la verificarea codului:', error);
                showNotification('A apărut o eroare la verificarea codului. Te rugăm să încerci din nou.', 'error');
            }
        });
    }
    
    // Retrimite cod
    if (domCache.retrimiteCod) {
        domCache.retrimiteCod.addEventListener('click', async function (event) {
            event.preventDefault();
            
            if (!bookingId || !canResend) {
                return;
            }

            try {
                logger.info('Trimitem cerere pentru retrimitere cod...');
                const response = await window.csrfManager.fetchWithCSRF(`${API_URL}/bookings/resend-code`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        bookingId: bookingId
                    })
                });

                const data = await response.json();
                logger.info('Răspuns retrimitere cod:', data);
                
                if (data.success) {
                    showNotification('Un nou cod de verificare a fost trimis la adresa ta de email.', 'success');
                    startCountdown(60);
                } else {
                    const countdownElement = document.getElementById('countdown');
                    if (data.message && data.message.includes('limita de email-uri pentru această rezervare')) {
                        domCache.retrimiteCod.style.display = 'none';
                        if (countdownElement) {
                            countdownElement.textContent = 'Ai atins limita de 5 email-uri pentru această rezervare.';
                            countdownElement.style.display = 'block';
                        }
                        canResend = false;
                    } else if (data.message && data.message.includes('limita zilnică de email-uri')) {
                        domCache.retrimiteCod.style.display = 'none';
                        if (countdownElement) {
                            countdownElement.textContent = 'Ai atins limita zilnică de 20 email-uri.';
                            countdownElement.style.display = 'block';
                        }
                        canResend = false;
                    } else {
                        showNotification('Nu s-a putut retrimite codul de verificare.', 'error');
                    }
                }
            } catch (error) {
                logger.error('Eroare la retrimiterea codului:', error);
                showNotification('A apărut o eroare la retrimiterea codului. Te rugăm să încerci din nou.', 'error');
            }
        });
    }
    
    // Pre-completare câmpuri din localStorage dacă există
    const savedName = localStorage.getItem('numeComplet');
    const savedEmail = localStorage.getItem('email');
    const savedPhone = localStorage.getItem('telefon');
    const savedCountryCode = localStorage.getItem('countryCode');
    
    if (savedName && domCache.numeCompletInput) domCache.numeCompletInput.value = savedName;
    if (savedEmail && domCache.emailInput) domCache.emailInput.value = savedEmail;
    if (savedPhone && domCache.telefonInput) domCache.telefonInput.value = savedPhone;
    if (savedCountryCode && domCache.countryCodeSelect) {
        const options = domCache.countryCodeSelect.options;
        for (let i = 0; i < options.length; i++) {
            if (options[i].value === savedCountryCode) {
                domCache.countryCodeSelect.selectedIndex = i;
                break;
            }
        }
    }
    
    // Salvează datele clientului pentru utilizări viitoare
    if (domCache.btnStep3) {
        domCache.btnStep3.addEventListener('click', function() {
            if (domCache.numeCompletInput?.value && domCache.emailInput?.value && domCache.telefonInput?.value) {
                localStorage.setItem('numeComplet', domCache.numeCompletInput.value);
                localStorage.setItem('email', domCache.emailInput.value);
                localStorage.setItem('telefon', domCache.telefonInput.value);
                localStorage.setItem('countryCode', domCache.countryCodeSelect.value);
            }
        });
    }
}

// Protecție împotriva CSRF și inițializare
document.addEventListener('DOMContentLoaded', function() {
    // Verifică dacă pagina este încărcată în iframe (protecție clickjacking)
    if (window.self !== window.top) {
        window.top.location = window.self.location;
    }
    
    // Inițializează aplicația
    initializeApp();
});