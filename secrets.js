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
