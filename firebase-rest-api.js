// Firebase REST API - handles auth and database operations without SDK
// This can be loaded as a regular script in extension contexts

try {
  console.log('[FirebaseAPI] Starting to load...');
  console.log('[FirebaseAPI] window.firebaseConfig:', window.firebaseConfig);

  let currentUser = null;
  let idToken = null;

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
    async signupWithEmail(email, password, role) {
      try {
        console.log('[FirebaseAPI.signup] Starting signup for:', email);
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${window.firebaseConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email, password,
              returnSecureToken: true
            })
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Signup failed');

        idToken = data.idToken;
        currentUser = { uid: data.localId, email };
        await saveAuthState();
        await this.createUserDocument(data.localId, email, role);
        return { success: true, user: { email, role }, uid: data.localId };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },

    async loginWithEmail(email, password) {
      try {
        const response = await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${window.firebaseConfig.apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, returnSecureToken: true })
          }
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Login failed');

        idToken = data.idToken;
        currentUser = { uid: data.localId, email };
        await saveAuthState();
        const userRole = await this.getUserRole(data.localId);
        return { success: true, user: { email, role: userRole }, uid: data.localId };
      } catch (error) {
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

  async createUserDocument(userId, email, role) {
    const timestamp = new Date().toISOString();
    const userData = {
      fields: {
        email: { stringValue: email },
        role: { stringValue: role },
        createdAt: { timestampValue: timestamp },
        updatedAt: { timestampValue: timestamp }
      }
    };

    await fetch(
      `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}?key=${window.firebaseConfig.apiKey}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify(userData)
      }
    ).catch(e => console.warn('Failed to create user doc:', e));

    await this.createDefaultSettings(userId);
  },

  async createDefaultSettings(userId) {
    const ts = new Date().toISOString();
    const settings = [
      { type: 'audioDescription', data: { volume: 50, speed: 50, gender: 'female', voice: 'human', length: 25, frequency: 'sometimes', emphasis: 'balanced', colorPreference: 'on', narrationStyle: 'objective', pauseDuringAd: true } },
      { type: 'vqa', data: { volume: 50, speed: 50, gender: 'female', length: 25 } }
    ];

    for (const { type, data } of settings) {
      const fields = {};
      for (const [k, v] of Object.entries(data)) {
        fields[k] = this.toFirestore(v);
      }
      fields.updatedAt = { timestampValue: ts };

      await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/settings/${type}?key=${window.firebaseConfig.apiKey}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify({ fields })
        }
      ).catch(e => console.warn(`Failed to create ${type} settings:`, e));
    }
  },

  async getUserRole(userId) {
    try {
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      const data = await response.json();
      return data.fields?.role?.stringValue || 'guest';
    } catch (error) {
      return 'guest';
    }
  },

  async loadSettings(settingType) {
    if (!currentUser || !idToken) return null;
    try {
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${currentUser.uid}/settings/${settingType}?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      const data = await response.json();
      return this.fromFirestore(data.fields) || null;
    } catch (error) {
      console.error('Error loading settings:', error);
      return null;
    }
  },

  async saveSettings(settingType, settings) {
    if (!currentUser || !idToken) return { success: false, error: 'Not logged in' };
    try {
      const fields = {};
      for (const [k, v] of Object.entries(settings)) {
        fields[k] = this.toFirestore(v);
      }
      fields.updatedAt = { timestampValue: new Date().toISOString() };

      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${currentUser.uid}/settings/${settingType}?key=${window.firebaseConfig.apiKey}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify({ fields })
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  toFirestore(value) {
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return { integerValue: String(value) };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(v => this.toFirestore(v)) } };
    return {};
  },

  fromFirestore(fields) {
    if (!fields) return null;
    const obj = {};
    for (const [k, f] of Object.entries(fields)) {
      if (f.stringValue) obj[k] = f.stringValue;
      else if (f.integerValue) obj[k] = parseInt(f.integerValue);
      else if (f.booleanValue) obj[k] = f.booleanValue;
      else if (f.arrayValue) obj[k] = f.arrayValue.values.map(v => this.fromFirestore(v));
    }
    return obj;
  },

  // Save video document with AD data
  async saveVideoAD(videoUrl, videoLength, customizations, generatedAds) {
    if (!currentUser || !idToken) return { success: false, error: 'Not logged in' };
    try {
      const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
      const timestamp = new Date().toISOString();
      
      // Create/update video doc
      const videoData = {
        fields: {
          userId: { stringValue: currentUser.uid },
          videoLink: { stringValue: videoUrl },
          videoLength: { integerValue: String(videoLength) },
          updatedAt: { timestampValue: timestamp }
        }
      };
      
      await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}?key=${window.firebaseConfig.apiKey}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify(videoData)
        }
      );

      // Save AD document (overwrite 'current')
      const adData = { fields: {} };
      adData.fields.timestamp = { integerValue: String(Date.now()) };
      adData.fields.customizations = this.objectToFirestore(customizations);
      adData.fields.generatedAds = { arrayValue: { values: generatedAds.map(ad => ({
        mapValue: { fields: {
          timestamp_in_seconds: { integerValue: String(ad.timestamp_in_seconds) },
          description: { stringValue: ad.description }
        }}
      })) }};
      adData.fields.createdAt = { timestampValue: timestamp };

      await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}/audioDescriptions/current?key=${window.firebaseConfig.apiKey}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify(adData)
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Load video AD data
  async loadVideoAD(videoUrl) {
    if (!currentUser || !idToken) {
      console.warn('[FirebaseAPI.loadVideoAD] Cannot load: currentUser=', !!currentUser, 'idToken=', !!idToken);
      return null;
    }
    try {
      const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
      console.log('[FirebaseAPI.loadVideoAD] Loading from:', `videos/${videoDocId}/audioDescriptions/current`);
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}/audioDescriptions/current?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      console.log('[FirebaseAPI.loadVideoAD] Response status:', response.status);
      if (!response.ok) {
        console.warn('[FirebaseAPI.loadVideoAD] Response not ok:', response.status, response.statusText);
        return null;
      }
      const data = await response.json();
      console.log('[FirebaseAPI.loadVideoAD] Loaded data:', !!data.fields);
      return data.fields ? this.fromFirestore(data.fields) : null;
    } catch (error) {
      console.error('[FirebaseAPI.loadVideoAD] Error:', error);
      return null;
    }
  },

  // Save VQA data
  async saveVideoVQA(videoUrl, videoLength, customizations, messages) {
    if (!currentUser || !idToken) return { success: false, error: 'Not logged in' };
    try {
      const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
      const timestamp = new Date().toISOString();
      
      // Create/update video doc
      const videoData = {
        fields: {
          userId: { stringValue: currentUser.uid },
          videoLink: { stringValue: videoUrl },
          videoLength: { integerValue: String(videoLength) },
          updatedAt: { timestampValue: timestamp }
        }
      };
      
      await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}?key=${window.firebaseConfig.apiKey}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify(videoData)
        }
      );

      // Save VQA document
      const vqaData = { fields: {} };
      vqaData.fields.timestamp = { integerValue: String(Date.now()) };
      vqaData.fields.customizations = this.objectToFirestore(customizations);
      vqaData.fields.messages = { arrayValue: { values: messages.map(msg => ({
        mapValue: { fields: {
          role: { stringValue: msg.role },
          content: { stringValue: msg.content },
          timestamp: { integerValue: String(msg.timestamp) }
        }}
      })) }};
      vqaData.fields.createdAt = { timestampValue: timestamp };

      await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}/vqa/current?key=${window.firebaseConfig.apiKey}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
          body: JSON.stringify(vqaData)
        }
      );

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Load VQA data
  async loadVideoVQA(videoUrl) {
    if (!currentUser || !idToken) {
      console.warn('[FirebaseAPI.loadVideoVQA] Cannot load: currentUser=', !!currentUser, 'idToken=', !!idToken);
      return null;
    }
    try {
      const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
      console.log('[FirebaseAPI.loadVideoVQA] Loading from:', `videos/${videoDocId}/vqa/current`);
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}/vqa/current?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      console.log('[FirebaseAPI.loadVideoVQA] Response status:', response.status);
      if (!response.ok) {
        console.warn('[FirebaseAPI.loadVideoVQA] Response not ok:', response.status, response.statusText);
        return null;
      }
      const data = await response.json();
      console.log('[FirebaseAPI.loadVideoVQA] Loaded data:', !!data.fields);
      return data.fields ? this.fromFirestore(data.fields) : null;
    } catch (error) {
      console.error('[FirebaseAPI.loadVideoVQA] Error:', error);
      return null;
    }
  },

  // Get user role
  async getUserRoleById(userId) {
    try {
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      if (!response.ok) return 'guest';
      const data = await response.json();
      return data.fields?.role?.stringValue || 'guest';
    } catch (error) {
      return 'guest';
    }
  },

  createVideoDocId(userId, videoUrl) {
    const urlHash = btoa(videoUrl).replace(/[+/=]/g, '').substring(0, 100);
    return `${userId}_${urlHash}`.substring(0, 128);
  },

  objectToFirestore(obj) {
    const fields = {};
    for (const [k, v] of Object.entries(obj)) {
      fields[k] = this.toFirestore(v);
    }
    return { mapValue: { fields } };
  },

  // Check if a video has existing audio descriptions
  async hasExistingAD(videoUrl) {
    if (!currentUser || !idToken) return false;
    try {
      const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}/audioDescriptions/current?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  // Check if a video has existing VQAs
  async hasExistingVQA(videoUrl) {
    if (!currentUser || !idToken) return false;
    try {
      const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}/vqa/current?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  // Get the most recent AD for a video (returns null if none exists)
  async getMostRecentAD(videoUrl) {
    if (!currentUser || !idToken) return null;
    try {
      const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}/audioDescriptions/current?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.fields) return null;
      
      return {
        data: this.fromFirestore(data.fields),
        createdAt: data.fields?.createdAt?.timestampValue,
        documentId: data.name
      };
    } catch (error) {
      console.error('Error loading most recent AD:', error);
      return null;
    }
  },

  // Get the most recent VQA for a video (returns null if none exists)
  async getMostRecentVQA(videoUrl) {
    if (!currentUser || !idToken) return null;
    try {
      const videoDocId = this.createVideoDocId(currentUser.uid, videoUrl);
      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/videos/${videoDocId}/vqa/current?key=${window.firebaseConfig.apiKey}`,
        { headers: { 'Authorization': `Bearer ${idToken}` } }
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.fields) return null;
      
      return {
        data: this.fromFirestore(data.fields),
        createdAt: data.fields?.createdAt?.timestampValue,
        documentId: data.name
      };
    } catch (error) {
      console.error('Error loading most recent VQA:', error);
      return null;
    }
  }
};

console.log('[FirebaseAPI] Fully loaded:', !!window.FirebaseAPI);
} catch (err) {
  console.error('[FirebaseAPI] FATAL ERROR during loading:', err);
  console.error('[FirebaseAPI] Stack:', err.stack);
}
