# Firebase Setup Guide for CustomQA Extension

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **"Create a project"**
3. Enter project name: `CustomQA` (or your preferred name)
4. Click "Continue"
5. Disable "Enable Google Analytics" (optional, not needed for this)
6. Click **"Create project"**
7. Wait for project to be created, then click **"Continue"**

## Step 2: Register Your Web App

1. In Firebase Console, click the **</> (Code) icon** on the overview page
2. Enter App nickname: `CustomQA Extension`
3. **DO NOT check** "Also set up Firebase Hosting" 
4. Click **"Register app"**
5. Copy the Firebase config object you see - it will look like:
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

## Step 3: Add Firebase Config to Extension

1. Open `contentScript.js` in your extension
2. Find where the sidebar is being injected (around line 120-150)
3. Right after loading the HTML/CSS, add this code to initialize Firebase:

```javascript
// Initialize Firebase after sidebar is created
const firebaseConfig = {
  apiKey: "your_api_key_here",
  projectId: "your_project_id_here"
  // Add your other config values from Step 2
};
window.firebaseConfig = firebaseConfig;
```

4. Then load the Firebase REST API script:
```javascript
const scriptUrl = chrome.runtime.getURL('firebase-rest-api.js');
const scriptTag = document.createElement('script');
scriptTag.src = scriptUrl;
document.head.appendChild(scriptTag);
```

5. After firebase-rest-api.js loads, initialize auth UI:
```javascript
scriptTag.onload = async () => {
  const authUIUrl = chrome.runtime.getURL('auth-ui.js');
  const authScript = document.createElement('script');
  authScript.src = authUIUrl;
  authScript.onload = () => {
    window.initAuthUI(sidebar);
  };
  document.head.appendChild(authScript);
};
```

## Step 4: Enable Authentication Methods

1. In Firebase Console, go to **Authentication** → **Sign-in method**
2. Click **Email/Password**
3. Enable "Email/Password"
4. Click **"Save"**
5. Return to "Sign-in method" page - you should see "Email/Password" enabled

## Step 5: Create Firestore Database

1. In Firebase Console, go to **Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (we'll secure it in Step 6)
4. Select location closest to you (e.g., us-central1)
5. Click **"Create"**

## Step 6: Set Firestore Security Rules

1. In Firestore Database, go to **"Rules"** tab
2. Replace all rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
      
      // Users can read/write their own videos subcollection
      match /videos/{videoId} {
        allow read, write: if request.auth.uid == userId;
        
        // Users can read/write audio descriptions for their own videos
        match /audioDescriptions/{document=**} {
          allow read, write: if request.auth.uid == userId;
        }
        
        // Users can read/write VQA for their own videos
        match /vqa/{document=**} {
          allow read, write: if request.auth.uid == userId;
        }
      }
    }
  }
}
```

3. Click **"Publish"**

**IMPORTANT:** The `{userId}` in the match rule ensures users can ONLY read/write their own data. The nested match paths match your actual data structure: `/users/{userId}/videos/{videoId}/audioDescriptions/...` and `/users/{userId}/videos/{videoId}/vqa/...`

## Step 7: Enable CORS for Firebase

1. In Firebase Console, go to **Settings** → **Project settings**
2. Copy your **Project ID**
3. No additional CORS setup needed for web - Firebase SDK handles it automatically

## Step 8: Verify Extension Permissions

Your `manifest.json` has already been updated with the necessary permissions:
- `https://www.googleapis.com/*`
- `https://*.firebaseio.com/*`
- `https://securetoken.googleapis.com/*`

These allow the extension to communicate with Firebase services.

## Step 9: Wire Up Settings Save

In your sidebar event listeners (where you handle "SAVE CHANGES" button):

```javascript
const saveButton = sidebar.querySelector('#ad-save-button');
saveButton.addEventListener('click', async () => {
  if (window.FirebaseAPI?.getCurrentUser()) {
    // Get current settings from sidebar
    const settings = {
      volume: parseInt(sidebar.querySelector('#ad-volume-slider').value),
      speed: parseInt(sidebar.querySelector('#ad-speed-slider').value),
      gender: sidebar.querySelector('.pill-button[data-gender].active')?.dataset.gender || 'female',
      length: parseInt(sidebar.querySelector('#length-slider').value),
      // ... get all other settings
    };
    
    const result = await window.FirebaseAPI.saveSettings('audioDescription', settings);
    if (result.success) {
      console.log('Settings saved!');
    } else {
      console.error('Failed to save:', result.error);
    }
  } else {
    alert('Please log in to save settings');
  }
});
```

## Step 10: Test the Setup

1. Load your extension in Chrome (chrome://extensions)
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select your CustomQA folder
4. Go to any YouTube video
5. Click the avatar icon (👤) in the sidebar
6. Try signing up with a test email (e.g., test@example.com)
7. Check Firebase Console → Firestore → "users" collection to verify user document was created

## What Gets Stored in Firestore

### Users Collection
```
/users/{userId}
  ├── email: string
  ├── role: string (experimental_tester or control_tester)
  ├── createdAt: timestamp
  ├── updatedAt: timestamp
  └── /settings
      ├── audioDescription
      │   ├── volume, speed, gender, length, emphasis, etc.
      │   └── updatedAt: timestamp
      └── vqa
          ├── volume, speed, gender, length
          └── updatedAt: timestamp
```

### Videos Collection
```
/videos/{videoDocId} (userId_urlHash)
  ├── userId: string
  ├── videoLink: string
  ├── videoLength: number
  ├── createdAt: timestamp
  ├── updatedAt: timestamp
  ├── /audioDescriptions
  │   └── current
  │       ├── timestamp: number (when generated)
  │       ├── customizations: object
  │       ├── generatedAds: array
  │       └── createdAt: timestamp
  └── /vqa
      └── current
          ├── timestamp: number
          ├── customizations: object
          ├── messages: array
          └── createdAt: timestamp
```

## Troubleshooting

### Auth menu doesn't appear
- Make sure `firebase-rest-api.js` is loaded before `auth-ui.js`
- Check browser console for errors
- Make sure `firebaseConfig` is set globally before auth UI initializes

### Settings not saving
- Check that user is logged in: `console.log(window.FirebaseAPI?.getCurrentUser())`
- Verify Firestore rules allow your auth user
- Check browser console for fetch errors

### "apiKey is empty" or Firebase errors
- Verify you've added all config values correctly
- Make apiKey and projectId are correct from Firebase Console
- Check that you've enabled Email/Password auth

## Next Steps

1. Wire up the settings save handlers for all customization options
2. Add loading saved settings when sidebar opens
3. Add saving AD/VQA results when user generates them
4. Test saving and reloading settings across sessions
5. Plan AWS migration (can migrate data later)

