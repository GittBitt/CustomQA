// Database integration helper for CustomQA
// Handles loading/saving user settings and video data to Firestore via REST API

window.DatabaseIntegration = {
  async loadUserSettings() {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return null;
    
    try {
      const adSettings = await window.FirebaseAPI.loadSettings('audioDescription');
      const vqaSettings = await window.FirebaseAPI.loadSettings('vqa');
      return { adSettings, vqaSettings };
    } catch (error) {
      console.error('Failed to load user settings:', error);
      return null;
    }
  },

  async saveADSettings(customizations) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) {
      console.log('[CustomQA] User not logged in, not saving settings');
      return { success: false };
    }
    
    // Convert customizations to save format - use the new field naming for user document
    const settings = {
      adVolume: customizations.volume || 50,
      adSpeed: customizations.speed || 50,
      adLength: customizations.length || 25,
      adFrequency: customizations.frequency || 'sometimes',
      adEmphasis: customizations.emphasis || 'balanced',
      adColorPreference: customizations.colorPreference || 'on',
      adNarrationStyle: customizations.narrationStyle || 'objective',
      adGender: customizations.gender || 'female',
      adVoice: customizations.voice || 'human',
      adPauseDuringAd: customizations.pauseDuringAd !== false
    };
    
    try {
      const result = await window.FirebaseAPI.saveSettings(user.uid, settings);
      console.log('[CustomQA] saveSettings returned:', result);
      // Handle both boolean and object returns
      const success = result === true || result?.success === true;
      if (!success) {
        console.error('[CustomQA] Failed to save AD settings to Firestore:', result);
        return { success: false };
      } else {
        console.log('[CustomQA] ✓ AD settings saved to Firestore:', settings);
        return { success: true };
      }
    } catch (error) {
      console.error('[CustomQA] Error saving AD settings:', error);
      return { success: false, error: error.message };
    }
  },

  async saveVQASettings(customizations) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) {
      console.log('[CustomQA] User not logged in, not saving VQA settings');
      return { success: false };
    }
    
    const settings = {
      vqaVolume: customizations.volume || 50,
      vqaSpeed: customizations.speed || 50,
      vqaLength: customizations.length || 25,
      vqaGender: customizations.gender || 'female',
      vqaVoice: customizations.voice || 'human'
    };
    
    try {
      const result = await window.FirebaseAPI.saveSettings(user.uid, settings);
      console.log('[CustomQA] VQA saveSettings returned:', result);
      // Handle both boolean and object returns
      const success = result === true || result?.success === true;
      if (!success) {
        console.error('[CustomQA] Failed to save VQA settings to Firestore:', result);
        return { success: false };
      } else {
        console.log('[CustomQA] ✓ VQA settings saved to Firestore:', settings);
        return { success: true };
      }
    } catch (error) {
      console.error('[CustomQA] Error saving VQA settings:', error);
      return { success: false, error: error.message };
    }
  },

  async saveGeneratedAD(videoUrl, videoLength, customizations, generatedAds) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) {
      console.log('User not logged in, not saving AD');
      return false;
    }
    
    const result = await window.FirebaseAPI.saveVideoAD(videoUrl, videoLength, customizations, generatedAds);
    return result.success;
  },

  async loadGeneratedAD(videoUrl) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return null;
    
    return await window.FirebaseAPI.loadVideoAD(videoUrl);
  },

  async saveGeneratedVQA(videoUrl, videoLength, customizations, messages) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return false;
    
    const result = await window.FirebaseAPI.saveVideoVQA(videoUrl, videoLength, customizations, messages);
    return result.success;
  },

  async loadGeneratedVQA(videoUrl) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return null;
    
    return await window.FirebaseAPI.loadVideoVQA(videoUrl);
  },

  // Check if existing AD exists for a video
  async hasExistingAD(videoUrl) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return false;
    
    return await window.FirebaseAPI.hasExistingAD(videoUrl);
  },

  // Check if existing VQA exists for a video
  async hasExistingVQA(videoUrl) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return false;
    
    return await window.FirebaseAPI.hasExistingVQA(videoUrl);
  },

  // Get the most recent AD for a video
  async getMostRecentAD(videoUrl) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return null;
    
    return await window.FirebaseAPI.getMostRecentAD(videoUrl);
  },

  // Get the most recent VQA for a video
  async getMostRecentVQA(videoUrl) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return null;
    
    return await window.FirebaseAPI.getMostRecentVQA(videoUrl);
  },

  async getUserRole() {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return 'guest';
    
    return await window.FirebaseAPI.getUserRoleById(user.uid) || 'guest';
  },

  restoreSettingsToUI(sidebar, settings) {
    if (!settings) return;
    
    const { adSettings, vqaSettings } = settings;
    
    if (adSettings) {
      const restoreValue = (id, value) => {
        const el = sidebar.querySelector(id);
        if (el) el.value = value;
      };
      
      const restoreButtonState = (selector, key) => {
        const buttons = sidebar.querySelectorAll(selector);
        buttons.forEach(btn => btn.classList.remove('active'));
        const active = sidebar.querySelector(`${selector}[data-${key}="${adSettings[key]}"]`);
        if (active) active.classList.add('active');
      };
      
      restoreValue('#ad-volume-slider', adSettings.volume);
      restoreValue('#ad-speed-slider', adSettings.speed);
      restoreValue('#length-slider', adSettings.length);
      restoreButtonState('[data-gender]', 'gender');
      restoreButtonState('[data-frequency]', 'frequency');
      restoreButtonState('[data-emphasis]', 'emphasis');
      restoreButtonState('[data-color]', 'color');
      restoreButtonState('[data-narration]', 'narration');
    }
    
    if (vqaSettings) {
      const restoreValue = (id, value) => {
        const el = sidebar.querySelector(id);
        if (el) el.value = value;
      };
      
      restoreValue('#vqa-volume-slider', vqaSettings.volume);
      restoreValue('#vqa-speed-slider', vqaSettings.speed);
    }
  }
};
