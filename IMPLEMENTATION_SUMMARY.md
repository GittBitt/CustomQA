## Firebase Auth & Firestore Integration - What I've Built

### Files Created:
1. **firebase-rest-api.js** - Firebase auth and Firestore operations without SDK
2. **auth-ui.js** - Sidebar UI for login/signup (accessible via `window.initAuthUI()`)
3. **FIREBASE_SETUP.md** - Complete Firebase setup instructions

### UI Changes Made:

**sidebar.html:**
- Added avatar icon (👤) button next to gear icon
- Added collapsible auth menu with:
  - Login form (email/password)
  - Signup form (email/password/role selection)
  - Logged-in view (shows email and role)

**sidebar.css:**
- Styled avatar button, auth menu, forms, and error messages
- Uses existing design language (black bg, pill buttons, etc.)

### How It Works:

1. **Login/Signup Flow:**
   - User clicks avatar icon → auth menu slides out
   - User enters credentials → saved to Firebase Auth
   - User document created in Firestore under `/users/{userId}`
   - Default settings created: audioDescription + vqa settings

2. **Settings Persistence:**
   - User saves settings → call `window.FirebaseAPI.saveSettings('audioDescription', settings)`
   - Settings stored in `/users/{userId}/settings/audioDescription`
   - Next time sidebar opens → load settings from Firestore

3. **Video Recording:**
   - When user generates AD/VQA → save to `/videos/{videoDocId}/audioDescriptions/current`
   - videoDocId = base64(userId + videoUrl)
   - Next time same video → fetch and display previous ADs/VQAs

### Your Setup Checklist:

1. **Firebase Console** (follow FIREBASE_SETUP.md):
   - Create project
   - Register web app (copy config)
   - Enable Email/Password auth
   - Create Firestore database
   - Set security rules (provided in doc)

2. **Update contentScript.js** (around line 120-150, where sidebar is injected):
   ```javascript
   // After sidebar HTML is loaded, add:
   window.firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     projectId: "YOUR_PROJECT_ID"
   };

   // Load Firebase REST API
   const scriptUrl = chrome.runtime.getURL('firebase-rest-api.js');
   const script = document.createElement('script');
   script.src = scriptUrl;
   script.onload = () => {
     // Load auth UI
     const authScript = document.createElement('script');
     authScript.src = chrome.runtime.getURL('auth-ui.js');
     authScript.onload = () => window.initAuthUI(sidebar);
     document.head.appendChild(authScript);
   };
   document.head.appendChild(script);
   ```

3. **Hook up settings saving** (in contentScript.js, find SAVE CHANGES buttons):
   ```javascript
   saveButton.addEventListener('click', async () => {
     if (window.FirebaseAPI?.getCurrentUser()) {
       const settings = {
         volume: parseInt(volumeSlider.value),
         speed: parseInt(speedSlider.value),
         gender: genderButton?.dataset.gender || 'female',
         length: parseInt(lengthSlider.value),
         // ... add other settings
       };
       await window.FirebaseAPI.saveSettings('audioDescription', settings);
     }
   });
   ```

4. **Load saved settings on sidebar open**:
   ```javascript
   const settings = await window.FirebaseAPI.loadSettings('audioDescription');
   if (settings) {
     volumeSlider.value = settings.volume;
     speedSlider.value = settings.speed;
     // ... apply all loaded settings
   }
   ```

### Database Schema:

**Users:**
```
/users/{userId}
  ├── email: string
  ├── role: string (experimental_tester | control_tester)
  ├── createdAt, updatedAt
  └── /settings
      ├── audioDescription (all AD customizations)
      └── vqa (all VQA customizations)
```

**Videos:**
```
/videos/{userId_videoUrlHash}
  ├── userId, videoLink, videoLength
  ├── /audioDescriptions
  │   └── current {customizations, generatedAds: [], timestamp}
  └── /vqa
      └── current {customizations, messages: [], timestamp}
```

### What Still Needs Wiring:

1. Load saved settings when sidebar first appears
2. Save AD customizations + generated ADs to Firestore
3. Save VQA messages to Firestore
4. Load previous ADs/VQAs when revisiting a video
5. Handle guest users (no persistence, reset defaults each time)

All the backend APIs are ready - just need to call them from contentScript.js at the right moments!
