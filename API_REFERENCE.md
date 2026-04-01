## Firebase API Reference

All methods available via `window.FirebaseAPI` after firebase-rest-api.js loads.

### Authentication

#### `signupWithEmail(email, password, role)`
Create new account and user document.
- **email**: string
- **password**: string (min 6 chars)
- **role**: 'experimental_tester' | 'control_tester'
- **Returns**: `{success: bool, user: {email, role}, uid: string}`

```javascript
const result = await window.FirebaseAPI.signupWithEmail('user@example.com', 'password123', 'experimental_tester');
if (result.success) {
  console.log('Signed up:', result.user.email);
}
```

#### `loginWithEmail(email, password)`
Login existing user.
- **email**: string
- **password**: string
- **Returns**: `{success: bool, user: {email, role}, uid: string}`

```javascript
const result = await window.FirebaseAPI.loginWithEmail('user@example.com', 'password123');
if (result.success) {
  console.log('Logged in as:', result.user.email, 'Role:', result.user.role);
}
```

#### `logout()`
Logout current user.
- **Returns**: `{success: true}`

```javascript
await window.FirebaseAPI.logout();
```

#### `getCurrentUser()`
Get logged in user object (synchronous).
- **Returns**: `{uid: string, email: string} | null`

```javascript
const user = window.FirebaseAPI.getCurrentUser();
if (user) {
  console.log('User:', user.email);
} else {
  console.log('Not logged in');
}
```

### Settings Storage

#### `saveSettings(settingType, settingsObject)`
Save user settings to Firestore.
- **settingType**: 'audioDescription' | 'vqa'
- **settingsObject**: object with setting values
- **Returns**: `{success: bool, error?: string}`

```javascript
// Save audio description settings
const result = await window.FirebaseAPI.saveSettings('audioDescription', {
  volume: 75,
  speed: 60,
  gender: 'male',
  length: 30,
  frequency: 'often',
  emphasis: 'character',
  colorPreference: 'on',
  narrationStyle: 'subjective',
  pauseDuringAd: true
});

if (result.success) {
  console.log('Settings saved!');
} else {
  console.log('Error:', result.error);
}
```

#### `loadSettings(settingType)`
Load user settings from Firestore.
- **settingType**: 'audioDescription' | 'vqa'
- **Returns**: `{[key]: value} | null` (returns null if not logged in or settings don't exist)

```javascript
const settings = await window.FirebaseAPI.loadSettings('audioDescription');
if (settings) {
  console.log('Volume:', settings.volume);
  console.log('Speed:', settings.speed);
  // Apply to UI
  volumeSlider.value = settings.volume;
  speedSlider.value = settings.speed;
}
```

### Data Type Conversion Helpers

These convert between JavaScript objects and Firestore format.

#### `toFirestore(value)`
Convert JS value to Firestore format (internal use).
- Handles: string, number, boolean, array
- **Returns**: `{stringValue|integerValue|booleanValue|arrayValue: ...}`

#### `fromFirestore(fields)`
Convert Firestore fields to JS object.
- **fields**: Firestore document fields
- **Returns**: `{[key]: value}`

### Usage Pattern Example

```javascript
async function loadAndDisplaySettings(sidebar) {
  const user = window.FirebaseAPI.getCurrentUser();
  
  if (!user) {
    // Guest mode - use defaults
    console.log('Guest user - using defaults');
    return;
  }

  // Logged in user - load from Firestore
  const settings = await window.FirebaseAPI.loadSettings('audioDescription');
  
  if (settings) {
    // Apply to UI
    sidebar.querySelector('#ad-volume-slider').value = settings.volume;
    sidebar.querySelector('#ad-speed-slider').value = settings.speed;
    // ... set other controls
  }
}

async function saveSettings(sidebar) {
  const user = window.FirebaseAPI.getCurrentUser();
  
  if (!user) {
    alert('Please log in to save settings');
    return;
  }

  // Collect current values from UI
  const settings = {
    volume: parseInt(sidebar.querySelector('#ad-volume-slider').value),
    speed: parseInt(sidebar.querySelector('#ad-speed-slider').value),
    gender: sidebar.querySelector('.pill-button[data-gender].active')?.dataset.gender || 'female',
    length: parseInt(sidebar.querySelector('#length-slider').value),
    frequency: sidebar.querySelector('.pill-button[data-frequency].active')?.dataset.frequency || 'sometimes',
    emphasis: sidebar.querySelector('.pill-button[data-emphasis].active')?.dataset.emphasis || 'balanced',
    colorPreference: sidebar.querySelector('.pill-button[data-color].active')?.dataset.color || 'on',
    narrationStyle: sidebar.querySelector('.pill-button[data-narration].active')?.dataset.narration || 'objective',
    pauseDuringAd: sidebar.querySelector('#pause-ad-group .pill-button.active')?.dataset.action === 'pause-on'
  };

  const result = await window.FirebaseAPI.saveSettings('audioDescription', settings);
  
  if (result.success) {
    console.log('✓ Settings saved to Firestore');
  } else {
    console.error('✗ Failed to save:', result.error);
  }
}
```

### Error Handling

All methods return `{success: bool}` with optional `error` field:

```javascript
const result = await window.FirebaseAPI.loginWithEmail('bad', 'short');

if (!result.success) {
  // Handle specific error messages
  switch (result.error) {
    case 'PASSWORD_TOO_SHORT':
      showError('Password must be at least 6 characters');
      break;
    case 'EMAIL_NOT_FOUND':
      showError('Account not found');
      break;
    case 'INVALID_PASSWORD':
      showError('Wrong password');
      break;
    default:
      showError(result.error);
  }
}
```

### Configuration

Before using any methods, set your Firebase config:

```javascript
window.firebaseConfig = {
  apiKey: "your_api_key",
  projectId: "your_project_id"
};
```

This should be done in contentScript.js right after loading firebase-rest-api.js.
