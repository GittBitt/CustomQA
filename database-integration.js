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
      console.log('User not logged in, not saving settings');
      return false;
    }
    
    // Convert customizations to save format
    const settings = {
      volume: customizations.volume || 50,
      speed: customizations.speed || 50,
      length: customizations.length || 25,
      frequency: customizations.frequency || 'sometimes',
      emphasis: customizations.emphasis || 'balanced',
      colorPreference: customizations.colorPreference || 'on',
      narrationStyle: customizations.narrationStyle || 'objective',
      gender: customizations.gender || 'female',
      voice: customizations.voice || 'human',
      pauseDuringAd: customizations.pauseDuringAd !== false
    };
    
    const result = await window.FirebaseAPI.saveSettings('audioDescription', settings);
    return result.success;
  },

  async saveVQASettings(customizations) {
    const user = window.FirebaseAPI?.getCurrentUser();
    if (!user) return false;
    
    const settings = {
      volume: customizations.volume || 50,
      speed: customizations.speed || 50,
      length: customizations.length || 25,
      gender: customizations.gender || 'female'
    };
    
    const result = await window.FirebaseAPI.saveSettings('vqa', settings);
    return result.success;
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
