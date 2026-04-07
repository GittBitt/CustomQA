// Firebase REST API - handles auth and database operations
// Data operations go through backend for security
// Auth stays with Firebase

try {
  console.log('[FirebaseAPI] Starting to load...');

  let currentUser = null;
  let idToken = null;
  const BACKEND_URL = 'https://customqa.onrender.com';

  // Helper function to persist auth state
  const saveAuthState = async () => {
    if (idToken && currentUser) {
      try {
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({ 
            customqa_idToken: idToken,
            customqa_currentUser: currentUser 
          }, () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        console.log('[FirebaseAPI] Auth state saved to storage');
      } catch (e) {
        console.warn('[FirebaseAPI] Failed to save auth state:', e);
      }
    }
  };

  // Helper function to restore auth state
  const restoreAuthState = async () => {
    return new Promise((resolve) => {
      chrome.storage.local.get(['customqa_idToken', 'customqa_currentUser'], (items) => {
        if (items.customqa_idToken && items.customqa_currentUser) {
          idToken = items.customqa_idToken;
          currentUser = items.customqa_currentUser;
          console.log('[FirebaseAPI] Auth state restored from storage for user:', currentUser.email);
        }
        resolve();
      });
    });
  };

  // Restore auth state on initialization
  restoreAuthState().catch(e => console.warn('[FirebaseAPI] Error restoring auth state:', e));

  window.FirebaseAPI = {
    // ==================== AUTHENTICATION ====================

    async signupWithEmail(email, password, role) {
      try {
        console.log('[FirebaseAPI.signup] Starting signup for:', email);
        const response = await fetch(
          `${BACKEND_URL}/api/auth/signup`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Signup failed');

        idToken = data.idToken;
        currentUser = { uid: data.uid, email };
        
        // Store refresh token
        await new Promise((resolve) => {
          chrome.storage.local.set({
            customqa_refreshToken: data.refreshToken,
            customqa_tokenExpiresAt: data.expiresAt
          }, resolve);
        });

        await saveAuthState();
        
        console.log('[FirebaseAPI.signup] Signup successful');
        return { success: true, user: { email, role }, uid: data.uid };
      } catch (error) {
        console.error('[FirebaseAPI.signup] Error:', error);
        return { success: false, error: error.message };
      }
    },

    async loginWithEmail(email, password) {
      try {
        console.log('[FirebaseAPI.login] Starting login for:', email);
        const response = await fetch(
          `${BACKEND_URL}/api/auth/login`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Login failed');

        idToken = data.idToken;
        currentUser = { uid: data.uid, email };
        
        // Store refresh token
        await new Promise((resolve) => {
          chrome.storage.local.set({
            customqa_refreshToken: data.refreshToken,
            customqa_tokenExpiresAt: data.expiresAt
          }, resolve);
        });

        await saveAuthState();

        console.log('[FirebaseAPI.login] Login successful');
        return { success: true, user: { email }, uid: data.uid };
      } catch (error) {
        console.error('[FirebaseAPI.login] Error:', error);
        return { success: false, error: error.message };
      }
    },

    async logout() {
      currentUser = null;
      idToken = null;
      try {
        await new Promise((resolve, reject) => {
          chrome.storage.local.remove(['customqa_idToken', 'customqa_currentUser'], () => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        });
        console.log('[FirebaseAPI] Auth state cleared from storage');
      } catch (e) {
        console.warn('[FirebaseAPI] Failed to clear auth state:', e);
      }
      return { success: true };
    },

    getCurrentUser() {
      return currentUser;
    },

    // ==================== USER DOCUMENT ====================

    async createUserDocument(userId, email, role) {
      // Backend will create the user document via Firestore Admin SDK
      console.log('[FirebaseAPI] User document creation handled by backend');
      return { success: true };
    },

    async createDefaultSettings(userId) {
      // Backend creates default settings - this is called after signup via backend
      console.log('[FirebaseAPI] Default settings creation handled by backend');
      return { success: true };
    },

    // ==================== SETTINGS OPERATIONS ====================

    async loadSettings(settingType) {
      if (!currentUser || !idToken) return null;
      try {
        console.log('[FirebaseAPI.loadSettings] Loading:', settingType);
        const response = await fetch(
          `${BACKEND_URL}/api/settings/${settingType}`,
          {
            headers: { 'Authorization': `Bearer ${idToken}` }
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        console.log('[FirebaseAPI.loadSettings] Loaded:', settingType, data);
        return data;
      } catch (error) {
        console.error('[FirebaseAPI.loadSettings] Error:', error);
        return null;
      }
    },

    async saveSettings(settingType, settings) {
      if (!currentUser || !idToken) return { success: false, error: 'Not logged in' };
      try {
        console.log('[FirebaseAPI.saveSettings] Saving:', settingType, settings);
        const response = await fetch(
          `${BACKEND_URL}/api/settings/${settingType}`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(settings)
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return { success: true };
      } catch (error) {
        console.error('[FirebaseAPI.saveSettings] Error:', error);
        return { success: false, error: error.message };
      }
    },

    // ==================== VIDEO AD OPERATIONS ====================

    async saveVideoAD(videoUrl, videoLength, customizations, generatedAds) {
      if (!currentUser || !idToken) return { success: false, error: 'Not logged in' };
      try {
        console.log('[FirebaseAPI.saveVideoAD] Saving AD for:', videoUrl);
        const response = await fetch(
          `${BACKEND_URL}/api/videos/ad`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              videoUrl,
              videoLength,
              customizations,
              generatedAds
            })
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { success: true };
      } catch (error) {
        console.error('[FirebaseAPI.saveVideoAD] Error:', error);
        return { success: false, error: error.message };
      }
    },

    async loadVideoAD(videoUrl) {
      if (!currentUser || !idToken) return null;
      try {
        const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
        console.log('[FirebaseAPI.loadVideoAD] Loading:', videoDocId);
        const response = await fetch(
          `${BACKEND_URL}/api/videos/ad/${videoDocId}`,
          {
            headers: { 'Authorization': `Bearer ${idToken}` }
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('[FirebaseAPI.loadVideoAD] Error:', error);
        return null;
      }
    },

    async hasExistingAD(videoUrl) {
      if (!currentUser || !idToken) return false;
      try {
        const data = await this.loadVideoAD(videoUrl);
        return !!data?.generatedAds;
      } catch (error) {
        return false;
      }
    },

    async getMostRecentAD(videoUrl) {
      if (!currentUser || !idToken) return null;
      try {
        const data = await this.loadVideoAD(videoUrl);
        if (!data) return null;
        return {
          data: data,
          createdAt: data.adCreatedAt
        };
      } catch (error) {
        console.error('[FirebaseAPI.getMostRecentAD] Error:', error);
        return null;
      }
    },

    // ==================== VIDEO VQA OPERATIONS ====================

    async saveVideoVQA(videoUrl, videoLength, customizations, messages) {
      if (!currentUser || !idToken) return { success: false, error: 'Not logged in' };
      try {
        console.log('[FirebaseAPI.saveVideoVQA] Saving VQA for:', videoUrl);
        const response = await fetch(
          `${BACKEND_URL}/api/videos/vqa`,
          {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              videoUrl,
              videoLength,
              customizations,
              messages
            })
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { success: true };
      } catch (error) {
        console.error('[FirebaseAPI.saveVideoVQA] Error:', error);
        return { success: false, error: error.message };
      }
    },

    async loadVideoVQA(videoUrl) {
      if (!currentUser || !idToken) return null;
      try {
        const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
        console.log('[FirebaseAPI.loadVideoVQA] Loading:', videoDocId);
        const response = await fetch(
          `${BACKEND_URL}/api/videos/vqa/${videoDocId}`,
          {
            headers: { 'Authorization': `Bearer ${idToken}` }
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        return { messages: data };
      } catch (error) {
        console.error('[FirebaseAPI.loadVideoVQA] Error:', error);
        return null;
      }
    },

    async hasExistingVQA(videoUrl) {
      if (!currentUser || !idToken) return false;
      try {
        const data = await this.loadVideoVQA(videoUrl);
        return !!data?.messages?.length;
      } catch (error) {
        return false;
      }
    },

    async getMostRecentVQA(videoUrl) {
      if (!currentUser || !idToken) return null;
      try {
        const data = await this.loadVideoVQA(videoUrl);
        if (!data) return null;
        return {
          data: data,
          createdAt: new Date().toISOString()
        };
      } catch (error) {
        console.error('[FirebaseAPI.getMostRecentVQA] Error:', error);
        return null;
      }
    },

    // ==================== HELPER FUNCTIONS ====================

    createVideoDocId(userId, videoUrl) {
      const urlHash = btoa(videoUrl).replace(/[+/=]/g, '').substring(0, 100);
      return `${userId}_${urlHash}`.substring(0, 128);
    }
  };

  console.log('[FirebaseAPI] Fully loaded:', !!window.FirebaseAPI);
} catch (err) {
  console.error('[FirebaseAPI] FATAL ERROR during loading:', err);
  console.error('[FirebaseAPI] Stack:', err.stack);
}
