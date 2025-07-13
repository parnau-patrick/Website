// js/csrf-utils.js - FIȘIER NOU
class CSRFManager {
    constructor() {
        this.token = null;
        this.refreshPromise = null;
        
        // Detectează automat API URL-ul
        this.API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:5000/api'
            : window.location.protocol + '//' + window.location.hostname + '/api';
    }

    async getCSRFToken() {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        this.refreshPromise = this._fetchCSRFToken();
        
        try {
            const token = await this.refreshPromise;
            return token;
        } finally {
            this.refreshPromise = null;
        }
    }

    async _fetchCSRFToken() {
        try {
            const response = await fetch(`${this.API_URL}/csrf-token`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch CSRF token: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.csrfToken) {
                this.token = data.csrfToken;
                return this.token;
            } else {
                throw new Error('Invalid CSRF token response');
            }
        } catch (error) {
            console.error('❌ Eroare la obținerea token-ului CSRF:', error);
            throw error;
        }
    }

    async fetchWithCSRF(url, options = {}) {
        // Dacă nu avem token, încearcă să-l obținem
        if (!this.token) {
            try {
                await this.getCSRFToken();
            } catch (error) {
                console.error('Nu s-a putut obține token-ul CSRF:', error);
                throw error;
            }
        }

        // Adaugă token-ul CSRF la headers
        const headers = {
            ...options.headers,
            'X-CSRF-Token': this.token,
            'X-Requested-With': 'XMLHttpRequest'
        };

        try {
            const response = await fetch(url, {
                ...options,
                credentials: 'include',
                headers
            });

            // Dacă primim eroare CSRF, încearcă să reîmprospătezi token-ul și să reîncerci
            if (response.status === 403) {
                const errorData = await response.json().catch(() => ({}));
                
                if (errorData.code === 'CSRF_INVALID') {
                    console.log('🔄 Token CSRF invalid, reîmprospătez...');
                    
                    // Resetează token-ul și încearcă din nou
                    this.token = null;
                    await this.getCSRFToken();
                    
                    // Retry cu noul token
                    const retryHeaders = {
                        ...options.headers,
                        'X-CSRF-Token': this.token,
                        'X-Requested-With': 'XMLHttpRequest'
                    };
                    
                    return fetch(url, {
                        ...options,
                        credentials: 'include',
                        headers: retryHeaders
                    });
                }
            }

            return response;
        } catch (error) {
            console.error('Eroare la cererea cu CSRF:', error);
            throw error;
        }
    }
}

// Instanță globală
window.csrfManager = new CSRFManager();