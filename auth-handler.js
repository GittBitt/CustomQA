import { auth, db } from './firebase-config.js';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

let currentUser = null;

// Track auth state
export function initAuthStateListener(onUserChange) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (onUserChange) {
      onUserChange(user);
    }
  });
}

// Sign up a new user
export async function signUpUser(email, password, role) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Create user document in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      email: email,
      role: role,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Create default settings documents
    await setDoc(doc(db, 'users', user.uid, 'settings', 'audioDescription'), {
      volume: 50,
      speed: 50,
      gender: 'female',
      voice: 'human',
      length: 25,
      frequency: 'sometimes',
      emphasis: 'balanced',
      colorPreference: 'on',
      narrationStyle: 'objective',
      pauseDuringAd: true,
      updatedAt: serverTimestamp()
    });

    await setDoc(doc(db, 'users', user.uid, 'settings', 'vqa'), {
      volume: 50,
      speed: 50,
      gender: 'female',
      length: 25,
      updatedAt: serverTimestamp()
    });

    return { success: true, user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Login user
export async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Logout user
export async function logoutUser() {
  try {
    await signOut(auth);
    currentUser = null;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get current user
export function getCurrentUser() {
  return currentUser;
}

// Get user role
export async function getUserRole() {
  if (!currentUser) return null;
  try {
    const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
    return userDoc.data()?.role || null;
  } catch (error) {
    console.error('Error getting user role:', error);
    return null;
  }
}

// Load user settings
export async function loadUserSettings(settingType) {
  if (!currentUser) return null;
  try {
    const settingsDoc = await getDoc(doc(db, 'users', currentUser.uid, 'settings', settingType));
    return settingsDoc.data() || null;
  } catch (error) {
    console.error('Error loading settings:', error);
    return null;
  }
}

// Save user settings
export async function saveUserSettings(settingType, settings) {
  if (!currentUser) return { success: false, error: 'Not logged in' };
  try {
    await updateDoc(doc(db, 'users', currentUser.uid, 'settings', settingType), {
      ...settings,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Create video document ID from URL and user ID
function createVideoDocId(userId, videoUrl) {
  const urlHash = btoa(videoUrl).replace(/[+/=]/g, '');
  return `${userId}_${urlHash}`.substring(0, 128); // Firestore max doc ID length
}

// Save AD to Firestore
export async function saveAudioDescription(videoUrl, videoLength, adCustomizations, generatedAds) {
  if (!currentUser) return { success: false, error: 'Not logged in' };
  try {
    const videoDocId = createVideoDocId(currentUser.uid, videoUrl);
    const videoRef = doc(db, 'videos', videoDocId);

    // Check if document exists
    const videoDoc = await getDoc(videoRef);

    const newADData = {
      timestamp: Date.now(),
      customizations: adCustomizations,
      generatedAds: generatedAds,
      createdAt: serverTimestamp()
    };

    if (videoDoc.exists()) {
      // Append to audioDescriptions array
      const adRef = doc(db, 'videos', videoDocId, 'audioDescriptions', 'current');
      await setDoc(adRef, newADData, { merge: false });
      
      // Update parent doc timestamp
      await updateDoc(videoRef, { updatedAt: serverTimestamp() });
    } else {
      // Create new video document
      await setDoc(videoRef, {
        userId: currentUser.uid,
        videoLink: videoUrl,
        videoLength: videoLength,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Create first AD document
      const adRef = doc(db, 'videos', videoDocId, 'audioDescriptions', 'current');
      await setDoc(adRef, newADData);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get saved ADs for a video
export async function getAudioDescription(videoUrl) {
  if (!currentUser) return null;
  try {
    const videoDocId = createVideoDocId(currentUser.uid, videoUrl);
    const adRef = doc(db, 'videos', videoDocId, 'audioDescriptions', 'current');
    const adDoc = await getDoc(adRef);
    
    return adDoc.exists() ? adDoc.data() : null;
  } catch (error) {
    console.error('Error getting AD:', error);
    return null;
  }
}

// Save VQA to Firestore
export async function saveVQA(videoUrl, videoLength, vqaCustomizations, messages) {
  if (!currentUser) return { success: false, error: 'Not logged in' };
  try {
    const videoDocId = createVideoDocId(currentUser.uid, videoUrl);
    const videoRef = doc(db, 'videos', videoDocId);

    const videoDoc = await getDoc(videoRef);

    const newVQAData = {
      timestamp: Date.now(),
      customizations: vqaCustomizations,
      messages: messages,
      createdAt: serverTimestamp()
    };

    if (videoDoc.exists()) {
      const vqaRef = doc(db, 'videos', videoDocId, 'vqa', 'current');
      await setDoc(vqaRef, newVQAData, { merge: false });
      await updateDoc(videoRef, { updatedAt: serverTimestamp() });
    } else {
      await setDoc(videoRef, {
        userId: currentUser.uid,
        videoLink: videoUrl,
        videoLength: videoLength,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const vqaRef = doc(db, 'videos', videoDocId, 'vqa', 'current');
      await setDoc(vqaRef, newVQAData);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Get saved VQA for a video
export async function getVQA(videoUrl) {
  if (!currentUser) return null;
  try {
    const videoDocId = createVideoDocId(currentUser.uid, videoUrl);
    const vqaRef = doc(db, 'videos', videoDocId, 'vqa', 'current');
    const vqaDoc = await getDoc(vqaRef);
    
    return vqaDoc.exists() ? vqaDoc.data() : null;
  } catch (error) {
    console.error('Error getting VQA:', error);
    return null;
  }
}
