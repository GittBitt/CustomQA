/**
 * Secure API Key Management for CustomQA Extension
 * This module manages API keys safely using Chrome's storage API
 */

const SecretsManager = (() => {
    const STORAGE_KEY = 'customqa_secrets';
    const API_KEYS = {
        GEMINI: 'GEMINI_API_KEY',
        OPENAI: 'OPENAI_API_KEY'
    };

    return {
        /**
         * Initialize secrets from .env file (one-time setup)
         * Call this once when extension is first installed
         */
        async initializeFromEnv() {
            try {
                const response = await fetch(chrome.runtime.getURL('.env'));
                const envText = await response.text();
                const secrets = {};
                
                const lines = envText.split('\n');
                lines.forEach(line => {
                    if (line.trim() && !line.trim().startsWith('#')) {
                        const [key, value] = line.trim().split('=');
                        if (key === 'API_KEY') {
                            secrets[API_KEYS.GEMINI] = value.trim();
                        } else if (key === 'OPENAI_API_KEY') {
                            secrets[API_KEYS.OPENAI] = value.trim();
                        }
                    }
                });
                
                // Store in chrome.storage (more secure than accessible resources)
                return new Promise((resolve, reject) => {
                    chrome.storage.local.set({ [STORAGE_KEY]: secrets }, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            console.log('[SecretsManager] Secrets initialized securely');
                            resolve(true);
                        }
                    });
                });
            } catch (error) {
                console.error('[SecretsManager] Error initializing secrets:', error);
                throw error;
            }
        },

        /**
         * Get API key by name
         */
        async getApiKey(keyName) {
            return new Promise((resolve, reject) => {
                chrome.storage.local.get(STORAGE_KEY, (data) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        const secrets = data[STORAGE_KEY] || {};
                        resolve(secrets[keyName] || '');
                    }
                });
            });
        },

        /**
         * Get Gemini API key
         */
        async getGeminiApiKey() {
            return this.getApiKey(API_KEYS.GEMINI);
        },

        /**
         * Get OpenAI API key
         */
        async getOpenAiApiKey() {
            return this.getApiKey(API_KEYS.OPENAI);
        },

        /**
         * Set API key (for manual updates)
         */
        async setApiKey(keyName, value) {
            return new Promise((resolve, reject) => {
                chrome.storage.local.get(STORAGE_KEY, (data) => {
                    const secrets = data[STORAGE_KEY] || {};
                    secrets[keyName] = value;
                    chrome.storage.local.set({ [STORAGE_KEY]: secrets }, () => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(true);
                        }
                    });
                });
            });
        },

        /**
         * Clear all secrets (use cautiously)
         */
        async clearSecrets() {
            return new Promise((resolve, reject) => {
                chrome.storage.local.remove(STORAGE_KEY, () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(true);
                    }
                });
            });
        }
    };
})();
