// Firebase REST API - handles auth and database operations without SDK
// This can be loaded as a regular script in extension contexts

let currentUser = null;
let idToken = null;

window.FirebaseAPI = {
  async signupWithEmail(email, password, role) {
    try {
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
      const userRole = await this.getUserRole(data.localId);
      return { success: true, user: { email, role: userRole }, uid: data.localId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async logout() {
    currentUser = null;
    idToken = null;
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
      `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/(default)/documents/users/${userId}?key=${window.firebaseConfig.apiKey}`,
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
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/(default)/documents/users/${userId}/settings/${type}?key=${window.firebaseConfig.apiKey}`,
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
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/(default)/documents/users/${userId}?key=${window.firebaseConfig.apiKey}`,
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
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/(default)/documents/users/${currentUser.uid}/settings/${settingType}?key=${window.firebaseConfig.apiKey}`,
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
        `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/(default)/documents/users/${currentUser.uid}/settings/${settingType}?key=${window.firebaseConfig.apiKey}`,
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
  }
};
