(() => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);

    let currentVolume = 1; // Default volume
    const preloadedAudioMap = new Map();

    const speakerSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0z" fill="none"/><path d="M3 9v6h4l5 5V4L7 9zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77"/></svg>`;
    const stopSvg = `<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0z" fill="none"/><path d="M6 6h12v12H6z"/></svg>`;

    const setButtonToSpeakerIcon = (buttonElement) => {
        if (buttonElement) {
            buttonElement.innerHTML = speakerSvg;
        }
    };

    const setButtonToStopIcon = (buttonElement) => {
        if (buttonElement) {
            buttonElement.innerHTML = stopSvg;
        }
    };

    // Load initial volume from storage
    chrome.storage.sync.get('volume', (data) => {
        if (data.volume) {
            currentVolume = parseFloat(data.volume) / 100;
        }
    });

    // Listen for volume changes in storage
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (changes.volume) {
            currentVolume = parseFloat(changes.volume.newValue) / 100;
        }
    });

    const newVideoLoaded = async () => {
        if (!window.location.href.includes('watch?v=')) {
            return false;
        }

        const video = document.querySelector('video.html5-main-video');
        let currentAudio = null;
        let currentPlayingButton = null;

        const playAudioFromDataUrl = async (dataUrl, buttonElement, onendedCallback = null) => {
            if (currentAudio) {
                try {
                    currentAudio.onended = null; // Prevent old onended from firing
                    currentAudio.stop();
                } catch (e) {
                    // Ignore error if audio is already stopped
                }
                currentAudio = null;
                if (currentPlayingButton) {
                    setButtonToSpeakerIcon(currentPlayingButton);
                    currentPlayingButton = null;
                }
            }

            try {
                const response = await fetch(dataUrl);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(gainNode);

                gainNode.gain.value = currentVolume;

                const speedSlider = document.getElementById('ad-speed-slider') || document.getElementById('vqa-speed-slider');
                if (speedSlider) {
                    source.playbackRate.value = parseFloat(speedSlider.value) / 50;
                }

                source.onended = () => {
                    console.log('Audio playback ended.');
                    currentAudio = null;
                    currentPlayingButton = null;
                    if (buttonElement) {
                        setButtonToSpeakerIcon(buttonElement);
                    }
                    if (onendedCallback) {
                        onendedCallback();
                    }
                };

                source.start(0);

                if (buttonElement) {
                    setButtonToStopIcon(buttonElement);
                }

                currentAudio = source;
                currentPlayingButton = buttonElement;
                return source;

            } catch (error) {
                console.error('Error playing audio with Web Audio API:', error);
                if (buttonElement) {
                    setButtonToSpeakerIcon(buttonElement);
                }
                return null;
            }
        };

        const preloadAndStoreAudio = (text, buttonElement, gender) => {
            if (!text || preloadedAudioMap.has(text)) {
                if (preloadedAudioMap.has(text)) {
                    buttonElement.setAttribute('data-audio-url', preloadedAudioMap.get(text));
                }
                return;
            }

            chrome.runtime.sendMessage({
                type: 'PRELOAD_OPENAI_TTS',
                text: text,
                gender: gender
            }, (response) => {
                if (response && response.success) {
                    preloadedAudioMap.set(response.text, response.audioDataUrl);
                    // Find the button associated with this text and set the attribute
                    const buttons = document.querySelectorAll(`[data-text="${response.text}"]`);
                    buttons.forEach(btn => btn.setAttribute('data-audio-url', response.audioDataUrl));
                } else {
                    console.error('OpenAI TTS preload error:', response?.error);
                }
            });
        };

        const sidebarExists = document.getElementById("custom-qa-sidebar");

        if (!sidebarExists) {
            const secondary = document.getElementById("secondary");
            if (secondary) {
                const sidebar = document.createElement("div");
                sidebar.id = "custom-qa-sidebar";
                sidebar.style.width = "100%";
                sidebar.style.height = "auto";
                sidebar.style.backgroundColor = "#f2f2f2";
                sidebar.style.borderRadius = "8px";
                sidebar.style.padding = "16px";
                sidebar.style.marginBottom = "16px";

                // Setup Firebase config and inline API
                window.firebaseConfig = {
                    apiKey: 'AIzaSyBcHEGgONk1Ff5a8Z1PLT6g3piFMZ9r_8A',
                    authDomain: 'customqa-cf40b.firebaseapp.com',
                    projectId: 'customqa-cf40b',
                    storageBucket: 'customqa-cf40b.firebasestorage.app',
                    messagingSenderId: '44575669634',
                    appId: '1:44575669634:web:313903337bbba65d3d239b',
                    measurementId: 'G-GV9DDT0XB1'
                };

                // Inline Firebase REST API with persistent auth
                let currentUser_FBAuth = null;
                let idToken_FBAuth = null;

                // Load persisted auth on initialization
                const loadPersistedAuth = () => {
                    const persisted = localStorage.getItem('customqa_auth');
                    if (persisted) {
                        try {
                            const auth = JSON.parse(persisted);
                            currentUser_FBAuth = auth.user;
                            idToken_FBAuth = auth.token;
                            return true;
                        } catch (e) {
                            console.error('Failed to load persisted auth:', e);
                            return false;
                        }
                    }
                    return false;
                };

                const savePersistedAuth = (user, token) => {
                    localStorage.setItem('customqa_auth', JSON.stringify({ user, token }));
                };

                const clearPersistedAuth = () => {
                    localStorage.removeItem('customqa_auth');
                };

                window.FirebaseAPI = {
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

                            idToken_FBAuth = data.idToken;
                            
                            // Use Firebase UID as primary document ID for reliability (never changes)
                            currentUser_FBAuth = { uid: data.localId, email };
                            
                            // Fetch user role and custom ID from Firestore user document
                            try {
                                const userDocPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${data.localId}`;
                                const userDocResponse = await fetch(
                                    `https://firestore.googleapis.com/v1/${userDocPath}?key=${window.firebaseConfig.apiKey}`,
                                    {
                                        method: 'GET',
                                        headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                    }
                                );
                                
                                if (userDocResponse.ok) {
                                    const userDocData = await userDocResponse.json();
                                    const fields = userDocData.fields || {};
                                    const role = fields.role?.stringValue || 'guest';
                                    const customUserId = fields.customUserId?.stringValue || '';
                                    
                                    currentUser_FBAuth.role = role;
                                    if (customUserId) currentUser_FBAuth.customUserId = customUserId;
                                    
                                    console.log('[CustomQA] Login successful for:', email, 'Role:', role, 'UID:', data.localId);
                                } else {
                                    console.warn('[CustomQA] Could not fetch user role from Firestore, defaulting to guest');
                                    currentUser_FBAuth.role = 'guest';
                                }
                            } catch (roleError) {
                                console.warn('[CustomQA] Error fetching user role:', roleError);
                                currentUser_FBAuth.role = 'guest';
                            }
                            
                            savePersistedAuth(currentUser_FBAuth, idToken_FBAuth);
                            return { success: true, user: { email, role: currentUser_FBAuth.role }, uid: data.localId };
                        } catch (error) {
                            console.error('[CustomQA] Login error:', error);
                            return { success: false, error: error.message };
                        }
                    },

                    async signupWithEmail(email, password, role) {
                        try {
                            const response = await fetch(
                                `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ email, password, returnSecureToken: true })
                                }
                            );
                            const data = await response.json();
                            if (!response.ok) throw new Error(data.error?.message || 'Signup failed');

                            idToken_FBAuth = data.idToken;
                            
                            // Use Firebase UID as document ID (reliable, never changes)
                            // Generate friendly custom ID to store in document: "username_timestamp"
                            const username = email.split('@')[0];
                            const customUserId = `${username}_${Date.now()}`;
                            
                            currentUser_FBAuth = { uid: data.localId, email, role };
                            savePersistedAuth(currentUser_FBAuth, idToken_FBAuth);

                            // Create user profile documents using Firebase UID, store custom ID as field
                            await this.createUserProfileDocuments(data.localId, email, role, idToken_FBAuth, customUserId);

                            return { success: true, user: { email, role }, uid: data.localId };
                        } catch (error) {
                            return { success: false, error: error.message };
                        }
                    },

                    async createUserProfileDocuments(userId, email, role, token, customUserId) {
                        const timestamp = new Date().toISOString();
                        
                        try {
                            // Create users/{userId} document with all settings fields in the main document
                            console.log('Creating user document for:', userId, 'Custom ID:', customUserId);
                            const userDocResponse = await fetch(
                                `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        fields: {
                                            email: { stringValue: email },
                                            customUserId: { stringValue: customUserId },
                                            role: { stringValue: role || 'guest' },
                                            // User-wide settings (persist across all videos)
                                            adVolume: { integerValue: 50 },
                                            adSpeed: { integerValue: 50 },
                                            adGender: { stringValue: 'female' },
                                            adVoice: { stringValue: 'natural' },
                                            adLength: { integerValue: 25 },
                                            adFrequency: { stringValue: 'sometimes' },
                                            adEmphasis: { stringValue: 'balanced' },
                                            adColorPreference: { stringValue: 'on' },
                                            adNarrationStyle: { stringValue: 'objective' },
                                            adPauseDuringAd: { booleanValue: true },
                                            vqaVolume: { integerValue: 50 },
                                            vqaSpeed: { integerValue: 50 },
                                            vqaGender: { stringValue: 'female' },
                                            vqaLength: { integerValue: 25 },
                                            createdAt: { timestampValue: timestamp },
                                            updatedAt: { timestampValue: timestamp }
                                        }
                                    })
                                }
                            );
                            const userDocData = await userDocResponse.json();
                            if (!userDocResponse.ok) {
                                console.error('Failed to create user document:', userDocData.error?.message || JSON.stringify(userDocData));
                            } else {
                                console.log('User document created successfully with custom ID:', customUserId);
                            }
                        } catch (error) {
                            console.error('Error creating user profile documents:', error);
                        }
                    },

                    async logout() {
                        currentUser_FBAuth = null;
                        idToken_FBAuth = null;
                        clearPersistedAuth();
                        return { success: true };
                    },

                    getCurrentUser() {
                        return currentUser_FBAuth;
                    },

                    setupRoleListener(userId, onRoleChange) {
                        if (!idToken_FBAuth) {
                            console.warn('[CustomQA] No auth token available for role listener');
                            return null;
                        }

                        // Set up polling-based listener since REST API doesn't support real-time
                        const checkInterval = setInterval(async () => {
                            try {
                                const userDocPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}`;
                                const response = await fetch(
                                    `https://firestore.googleapis.com/v1/${userDocPath}?key=${window.firebaseConfig.apiKey}`,
                                    {
                                        method: 'GET',
                                        headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                    }
                                );

                                if (response.ok) {
                                    const data = await response.json();
                                    const fields = data.fields || {};
                                    const newRole = fields.role?.stringValue || 'guest';

                                    // Update cached user data if role changed
                                    if (currentUser_FBAuth && currentUser_FBAuth.role !== newRole) {
                                        currentUser_FBAuth.role = newRole;
                                        console.log('[CustomQA] Role updated to:', newRole);
                                        onRoleChange(newRole);
                                    }
                                }
                            } catch (error) {
                                console.error('[CustomQA] Error checking role:', error);
                            }
                        }, 5000); // Check every 5 seconds

                        // Return function to stop the listener
                        return () => clearInterval(checkInterval);
                    },

                    async loadSettings(userId) {
                        if (!idToken_FBAuth) return null;
                        try {
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'GET',
                                    headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                }
                            );
                            // 404 is ok - document might not exist yet
                            if (response.status === 404) return null;
                            if (!response.ok) {
                                console.error('Load settings error:', response.status);
                                return null;
                            }
                            const data = await response.json();
                            if (data.fields) {
                                return {
                                    // AD settings
                                    adVolume: parseInt(data.fields.adVolume?.integerValue || 50),
                                    adSpeed: parseInt(data.fields.adSpeed?.integerValue || 50),
                                    adGender: data.fields.adGender?.stringValue || 'female',
                                    adVoice: data.fields.adVoice?.stringValue || 'natural',
                                    adLength: parseInt(data.fields.adLength?.integerValue || 25),
                                    adFrequency: data.fields.adFrequency?.stringValue || 'sometimes',
                                    adEmphasis: data.fields.adEmphasis?.stringValue || 'balanced',
                                    adColorPreference: data.fields.adColorPreference?.stringValue || 'on',
                                    adNarrationStyle: data.fields.adNarrationStyle?.stringValue || 'objective',
                                    adPauseDuringAd: data.fields.adPauseDuringAd?.booleanValue ?? true,
                                    // VQA settings
                                    vqaVolume: parseInt(data.fields.vqaVolume?.integerValue || 50),
                                    vqaSpeed: parseInt(data.fields.vqaSpeed?.integerValue || 50),
                                    vqaGender: data.fields.vqaGender?.stringValue || 'female',
                                    vqaLength: parseInt(data.fields.vqaLength?.integerValue || 25)
                                };
                            }
                            return null;
                        } catch (error) {
                            console.error('Error loading settings:', error);
                            return null;
                        }
                    },

                    async saveSettings(userId, settings) {
                        if (!idToken_FBAuth) return false;
                        try {
                            const docPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}`;
                            
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/${docPath}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${idToken_FBAuth}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        fields: {
                                            // AD settings
                                            adVolume: { integerValue: parseInt(settings.adVolume || 50) },
                                            adSpeed: { integerValue: parseInt(settings.adSpeed || 50) },
                                            adGender: { stringValue: settings.adGender || 'female' },
                                            adVoice: { stringValue: settings.adVoice || 'natural' },
                                            adLength: { integerValue: parseInt(settings.adLength || 25) },
                                            adFrequency: { stringValue: settings.adFrequency || 'sometimes' },
                                            adEmphasis: { stringValue: settings.adEmphasis || 'balanced' },
                                            adColorPreference: { stringValue: settings.adColorPreference || 'on' },
                                            adNarrationStyle: { stringValue: settings.adNarrationStyle || 'objective' },
                                            adPauseDuringAd: { booleanValue: settings.adPauseDuringAd ?? true },
                                            // VQA settings
                                            vqaVolume: { integerValue: parseInt(settings.vqaVolume || 50) },
                                            vqaSpeed: { integerValue: parseInt(settings.vqaSpeed || 50) },
                                            vqaGender: { stringValue: settings.vqaGender || 'female' },
                                            vqaLength: { integerValue: parseInt(settings.vqaLength || 25) },
                                            updatedAt: { timestampValue: new Date().toISOString() }
                                        }
                                    })
                                }
                            );
                            const data = await response.json();
                            if (!response.ok) {
                                console.error('Save settings error:', data.error?.message || JSON.stringify(data));
                                return false;
                            }
                            console.log('Settings saved successfully');
                            return true;
                        } catch (error) {
                            console.error('Error saving settings:', error);
                            return false;
                        }
                    },

                    generateDocumentId() {
                        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    },

                    async ensureVideoDocumentExists(userId, videoId, videoLink, videoLength, token, videoTitle = '') {
                        try {
                            console.log('Ensuring video document exists for:', videoId, 'Title:', videoTitle);
                            const timestamp = new Date().toISOString();
                            const videoDocPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}`;
                            
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/${videoDocPath}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${token || idToken_FBAuth}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        fields: {
                                            videoLink: { stringValue: videoLink },
                                            videoTitle: { stringValue: videoTitle },
                                            videoLength: { doubleValue: videoLength },
                                            createdAt: { timestampValue: timestamp },
                                            updatedAt: { timestampValue: timestamp }
                                        }
                                    })
                                }
                            );
                            const data = await response.json();
                            if (!response.ok) {
                                console.error('Failed to ensure video document:', data.error?.message || JSON.stringify(data));
                                return false;
                            }
                            console.log('Video document ready:', videoId);
                            return true;
                        } catch (error) {
                            console.error('Error ensuring video document:', error);
                            return false;
                        }
                    },

                    async loadGeneratedAD(userId, videoId) {
                        if (!idToken_FBAuth) return null;
                        try {
                            // Load the "current" AD document directly
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/audioDescriptions/current?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'GET',
                                    headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                }
                            );
                            
                            if (response.status === 404) {
                                console.log('[CustomQA] No saved AD document found (404)');
                                return null;
                            }
                            if (!response.ok) {
                                console.error('Load AD error:', response.status, response.statusText);
                                return null;
                            }
                            
                            const data = await response.json();
                            const fields = data.fields || {};
                            
                            // Parse customizations
                            let customizations = {};
                            if (fields.customizations?.stringValue) {
                                try {
                                    customizations = JSON.parse(fields.customizations.stringValue);
                                } catch (e) {
                                    console.warn('Failed to parse customizations:', e);
                                }
                            }
                            
                            // Parse generated ADs - they're stored as array of stringValues
                            let generatedAds = [];
                            if (fields.generatedAds?.arrayValue?.values) {
                                generatedAds = fields.generatedAds.arrayValue.values.map(val => {
                                    if (val.stringValue) {
                                        try {
                                            return JSON.parse(val.stringValue);
                                        } catch (e) {
                                            console.warn('Failed to parse AD:', e);
                                            return { timestamp_in_seconds: 0, description: val.stringValue };
                                        }
                                    }
                                    return val;
                                });
                            }
                            
                            return {
                                customizations: customizations,
                                generatedAds: generatedAds,
                                timestamp: fields.timestamp?.integerValue || Date.now(),
                                createdAt: fields.createdAt?.timestampValue || new Date().toISOString()
                            };
                        } catch (error) {
                            console.error('Error loading AD:', error);
                            return null;
                        }
                    },

                    async saveGeneratedAD(userId, videoId, videoLink, videoLength, customizations, generatedAds) {
                        if (!idToken_FBAuth) return false;
                        try {
                            // Extract video title from page
                            const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') || 
                                               document.querySelector('h1 yt-formatted-string') ||
                                               document.querySelector('yt-formatted-string.heading') ||
                                               document.querySelector('h1');
                            const videoTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Title';
                            
                            // First ensure the video document exists with title
                            await this.ensureVideoDocumentExists(userId, videoId, videoLink, videoLength, idToken_FBAuth, videoTitle);
                            
                            // Generate a unique document ID for this AD generation
                            const adDocId = this.generateDocumentId();
                            const timestamp = new Date().toISOString();
                            
                            const adDocFields = {
                                customizations: { stringValue: JSON.stringify(customizations) },
                                generatedAds: { arrayValue: { values: generatedAds.map(ad => ({ stringValue: JSON.stringify(ad) })) } },
                                timestamp: { integerValue: Date.now() },
                                createdAt: { timestampValue: timestamp }
                            };
                            
                            // Save to unique document for history
                            console.log('Saving AD to subcollection:', adDocId);
                            const adDocPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/audioDescriptions/${adDocId}`;
                            
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/${adDocPath}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${idToken_FBAuth}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ fields: adDocFields })
                                }
                            );
                            const data = await response.json();
                            if (!response.ok) {
                                console.error('Save AD error:', data.error?.message || JSON.stringify(data));
                                return false;
                            }
                            
                            // Also save to "current" document for easy retrieval
                            const currentDocPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/audioDescriptions/current`;
                            const currentResponse = await fetch(
                                `https://firestore.googleapis.com/v1/${currentDocPath}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${idToken_FBAuth}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ fields: adDocFields })
                                }
                            );
                            if (!currentResponse.ok) {
                                console.warn('Save AD to current document warning:', currentResponse.status);
                            }
                            
                            console.log('AD saved successfully:', adDocId);
                            return true;
                        } catch (error) {
                            console.error('Error saving AD:', error);
                            return false;
                        }
                    },

                    async loadGeneratedVQA(userId, videoId) {
                        if (!idToken_FBAuth) return null;
                        try {
                            // Load the "current" VQA document directly
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/vqa/current?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'GET',
                                    headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                }
                            );
                            
                            if (response.status === 404) {
                                console.log('[CustomQA] No saved VQA document found (404)');
                                return null;
                            }
                            if (!response.ok) {
                                console.error('Load VQA error:', response.status, response.statusText);
                                return null;
                            }
                            
                            const data = await response.json();
                            const fields = data.fields || {};
                            
                            // Parse customizations
                            let customizations = {};
                            if (fields.customizations?.stringValue) {
                                try {
                                    customizations = JSON.parse(fields.customizations.stringValue);
                                } catch (e) {
                                    console.warn('Failed to parse customizations:', e);
                                }
                            }
                            
                            // Parse messages - they're stored as array of stringValues
                            let messages = [];
                            if (fields.messages?.arrayValue?.values) {
                                messages = fields.messages.arrayValue.values.map(val => {
                                    if (val.stringValue) {
                                        try {
                                            return JSON.parse(val.stringValue);
                                        } catch (e) {
                                            console.warn('Failed to parse message:', e);
                                            return { role: 'assistant', content: val.stringValue };
                                        }
                                    }
                                    return val;
                                });
                            }
                            
                            return {
                                customizations: customizations,
                                messages: messages,
                                timestamp: fields.timestamp?.integerValue || Date.now(),
                                createdAt: fields.createdAt?.timestampValue || new Date().toISOString()
                            };
                        } catch (error) {
                            console.error('Error loading VQA:', error);
                            return null;
                        }
                    },

                    async saveGeneratedVQA(userId, videoId, videoLink, videoLength, customizations, messages) {
                        if (!idToken_FBAuth) return false;
                        try {
                            // Extract video title from page
                            const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer') || 
                                               document.querySelector('h1 yt-formatted-string') ||
                                               document.querySelector('yt-formatted-string.heading') ||
                                               document.querySelector('h1');
                            const videoTitle = titleElement ? titleElement.textContent.trim() : 'Unknown Title';
                            
                            // First ensure the video document exists with title
                            await this.ensureVideoDocumentExists(userId, videoId, videoLink, videoLength, idToken_FBAuth, videoTitle);
                            
                            // Generate a unique document ID for this VQA generation
                            const vqaDocId = this.generateDocumentId();
                            const timestamp = new Date().toISOString();
                            
                            const vqaDocFields = {
                                customizations: { stringValue: JSON.stringify(customizations) },
                                messages: { arrayValue: { values: messages.map(m => ({ stringValue: JSON.stringify(m) })) } },
                                timestamp: { integerValue: Date.now() },
                                createdAt: { timestampValue: timestamp }
                            };
                            
                            // Save to unique document for history
                            console.log('Saving VQA to subcollection:', vqaDocId);
                            const vqaDocPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/vqa/${vqaDocId}`;
                            
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/${vqaDocPath}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${idToken_FBAuth}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ fields: vqaDocFields })
                                }
                            );
                            const data = await response.json();
                            if (!response.ok) {
                                console.error('Save VQA error:', data.error?.message || JSON.stringify(data));
                                return false;
                            }
                            
                            // Also save to "current" document for easy retrieval
                            const currentDocPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/vqa/current`;
                            const currentResponse = await fetch(
                                `https://firestore.googleapis.com/v1/${currentDocPath}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${idToken_FBAuth}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({ fields: vqaDocFields })
                                }
                            );
                            if (!currentResponse.ok) {
                                console.warn('Save VQA to current document warning:', currentResponse.status);
                            }
                            
                            console.log('VQA saved successfully:', vqaDocId);
                            return true;
                        } catch (error) {
                            console.error('Error saving VQA:', error);
                            return false;
                        }
                    },

                    async saveADSettings(userId, settings) {
                        return await this.saveSettings(userId, settings);
                    },

                    async saveVQASettings(userId, settings) {
                        return await this.saveSettings(userId, settings);
                    },

                    async getUserRole(userId) {
                        const settings = await this.loadSettings(userId);
                        return settings?.role || 'guest';
                    }
                };

                // Create database integration wrapper
                window.DatabaseIntegration = {
                    async loadUserSettings() {
                        const user = currentUser_FBAuth;
                        if (!user) return null;
                        return await window.FirebaseAPI.loadSettings(user.uid);
                    },

                    async restoreSettingsToUI(sidebar, settings) {
                        if (!sidebar || !settings) return;
                        
                        // Restore AD settings
                        if (settings.adVolume) {
                            const volSlider = sidebar.querySelector('#ad-volume-slider');
                            if (volSlider) volSlider.value = settings.adVolume;
                        }
                        if (settings.adSpeed) {
                            const speedSlider = sidebar.querySelector('#ad-speed-slider');
                            if (speedSlider) speedSlider.value = settings.adSpeed;
                        }
                        if (settings.adGender) {
                            const genderBtn = sidebar.querySelector(`#audio-descriptions-tab .pill-button[data-gender="${settings.adGender}"]`);
                            if (genderBtn) {
                                sidebar.querySelectorAll('#audio-descriptions-tab .pill-button[data-gender]').forEach(b => b.classList.remove('active'));
                                genderBtn.classList.add('active');
                            }
                        }
                        if (settings.adLength) {
                            const lengthSlider = sidebar.querySelector('#length-slider');
                            if (lengthSlider) lengthSlider.value = settings.adLength;
                        }
                        
                        // Restore VQA settings
                        if (settings.vqaVolume) {
                            const vqaVolSlider = sidebar.querySelector('#vqa-volume-slider');
                            if (vqaVolSlider) vqaVolSlider.value = settings.vqaVolume;
                        }
                        if (settings.vqaSpeed) {
                            const vqaSpeedSlider = sidebar.querySelector('#vqa-speed-slider');
                            if (vqaSpeedSlider) vqaSpeedSlider.value = settings.vqaSpeed;
                        }
                        if (settings.vqaGender) {
                            const vqaGenderBtn = sidebar.querySelector(`#vqa-tab .pill-button[data-gender="${settings.vqaGender}"]`);
                            if (vqaGenderBtn) {
                                sidebar.querySelectorAll('#vqa-tab .pill-button[data-gender]').forEach(b => b.classList.remove('active'));
                                vqaGenderBtn.classList.add('active');
                            }
                        }
                        if (settings.vqaLength) {
                            const vqaLenSlider = sidebar.querySelector('[id*="time-window"]');
                            if (vqaLenSlider) vqaLenSlider.value = settings.vqaLength;
                        }
                    },

                    async loadGeneratedAD(videoUrl) {
                        const user = currentUser_FBAuth;
                        if (!user) return null;
                        const videoId = videoUrl.split('v=')[1]?.split('&')[0] || videoUrl;
                        return await window.FirebaseAPI.loadGeneratedAD(user.uid, videoId);
                    },

                    async loadGeneratedVQA(videoUrl) {
                        const user = currentUser_FBAuth;
                        if (!user) return null;
                        const videoId = videoUrl.split('v=')[1]?.split('&')[0] || videoUrl;
                        return await window.FirebaseAPI.loadGeneratedVQA(user.uid, videoId);
                    },

                    async saveGeneratedAD(videoUrl, duration, settings, ads) {
                        const user = currentUser_FBAuth;
                        if (!user) return false;
                        const videoId = videoUrl.split('v=')[1]?.split('&')[0] || videoUrl;
                        return await window.FirebaseAPI.saveGeneratedAD(user.uid, videoId, videoUrl, duration, settings, ads);
                    },

                    async saveGeneratedVQA(videoUrl, duration, settings, messages) {
                        const user = currentUser_FBAuth;
                        if (!user) return false;
                        const videoId = videoUrl.split('v=')[1]?.split('&')[0] || videoUrl;
                        return await window.FirebaseAPI.saveGeneratedVQA(user.uid, videoId, videoUrl, duration, settings, messages);
                    },

                    async saveADSettings(settings) {
                        const user = currentUser_FBAuth;
                        if (!user) return false;
                        return await window.FirebaseAPI.saveADSettings(user.uid, settings);
                    },

                    async saveVQASettings(settings) {
                        const user = currentUser_FBAuth;
                        if (!user) return false;
                        return await window.FirebaseAPI.saveVQASettings(user.uid, settings);
                    },

                    async getUserRole() {
                        const user = currentUser_FBAuth;
                        if (!user) return 'guest';
                        return await window.FirebaseAPI.getUserRole(user.uid);
                    }
                };

                // Load persisted auth on init
                loadPersistedAuth();

                console.log('FirebaseAPI ready:', !!window.FirebaseAPI);

                // Plugin initialization: Verify logged-in user and their associated videos
                (async () => {
                    const user = window.FirebaseAPI?.getCurrentUser();
                    if (user) {
                        console.log('[CustomQA] ✓ User logged in:', {
                            uid: user.uid,
                            email: user.email,
                            role: user.role || 'guest'
                        });

                        // Try to load user settings to verify Firestore access
                        try {
                            const settings = await window.DatabaseIntegration?.loadUserSettings();
                            if (settings) {
                                console.log('[CustomQA] ✓ User settings loaded successfully');
                            } else {
                                console.warn('[CustomQA] ⚠ User settings not found or empty');
                            }
                        } catch (e) {
                            console.error('[CustomQA] ✗ Error loading user settings:', e?.message);
                        }
                    } else {
                        console.log('[CustomQA] ℹ No user logged in - user must login to see generated content');
                    }
                })();

                // Fetch and inject HTML and CSS
                const htmlUrl = chrome.runtime.getURL('sidebar.html');
                const cssUrl = chrome.runtime.getURL('sidebar.css');

                if (!htmlUrl || !cssUrl) {
                    console.error('Could not find sidebar.html or sidebar.css');
                    return;
                }

                const htmlResponse = await fetch(htmlUrl);
                const html = await htmlResponse.text();

                const cssResponse = await fetch(cssUrl);
                const css = await cssResponse.text();

                const styleElement = document.createElement('style');
                styleElement.textContent = css;
                document.head.appendChild(styleElement);

                sidebar.innerHTML = html;

                // Update time window slider visibility based on user role
                const updateTimeWindowSliderVisibility = () => {
                    const user = window.FirebaseAPI?.getCurrentUser();
                    const timeWindowContainer = sidebar.querySelector('#time-window-slider-container');
                    
                    console.log('[CustomQA] Updating time window visibility - User:', user?.email, 'Role:', user?.role, 'Container found:', !!timeWindowContainer);
                    
                    if (timeWindowContainer) {
                        if (user && user.role === 'admin') {
                            timeWindowContainer.style.display = 'block';
                            console.log('[CustomQA] Time window slider SHOWN for admin');
                        } else {
                            timeWindowContainer.style.display = 'none';
                            console.log('[CustomQA] Time window slider HIDDEN for non-admin');
                        }
                    } else {
                        console.warn('[CustomQA] Time window container not found in DOM');
                    }
                };

                // Setup auth menu - attach to avatar button
                const avatarBtn = sidebar.querySelector('#auth-avatar-btn');
                let authMenuOpen = false;
                
                if (avatarBtn) {
                    const sidebarHeader = sidebar.querySelector('.sidebar-header');
                    let authMenu = sidebar.querySelector('#auth-popup-menu');
                    
                    if (!authMenu) {
                        authMenu = document.createElement('div');
                        authMenu.id = 'auth-popup-menu';
                        authMenu.className = 'auth-popup-menu';
                        sidebarHeader.appendChild(authMenu);
                    }
                    
                    // Update avatar icon based on login state
                    const updateAvatarIcon = () => {
                        const user = window.FirebaseAPI?.getCurrentUser();
                        avatarBtn.textContent = user ? '✓' : '👤';
                        avatarBtn.title = user ? `Logged in as ${user.email}` : 'Login/Signup';
                    };
                    
                    const renderAuthMenu = () => {
                        const user = window.FirebaseAPI?.getCurrentUser();
                        authMenu.innerHTML = '';
                        updateAvatarIcon();
                        updateTimeWindowSliderVisibility();
                        
                        if (user) {
                            // Logged in
                            authMenu.innerHTML = `
                                <div class="auth-popup-content">
                                    <div style="font-size: 14px; font-weight: 600;">${user.email}</div>
                                    <div style="font-size: 12px; color: #666; margin-bottom: 12px;">${user.role || 'user'}</div>
                                    <button id="logout-btn" class="auth-popup-button auth-popup-secondary">Logout</button>
                                </div>
                            `;
                            authMenu.querySelector('#logout-btn').addEventListener('click', async () => {
                                await window.FirebaseAPI.logout();
                                location.reload();
                            });
                        } else {
                            // Login/signup forms
                            authMenu.innerHTML = `
                                <div class="auth-popup-content">
                                    <div id="login-form" style="display: flex; flex-direction: column; gap: 12px;">
                                        <div class="auth-popup-title">Login</div>
                                        <input type="email" id="login-email" class="auth-popup-input" placeholder="Email" />
                                        <input type="password" id="login-password" class="auth-popup-input" placeholder="Password" />
                                        <div id="login-error" style="color: #d32f2f; font-size: 12px; display: none;"></div>
                                        <button id="login-btn" class="auth-popup-button">Login</button>
                                        <button id="to-signup" class="auth-popup-button auth-popup-secondary">Sign Up</button>
                                    </div>
                                    <div id="signup-form" style="display: none; flex-direction: column; gap: 12px;">
                                        <div class="auth-popup-title">Sign Up</div>
                                        <input type="email" id="signup-email" class="auth-popup-input" placeholder="Email" />
                                        <input type="password" id="signup-password" class="auth-popup-input" placeholder="Password" />
                                        <input type="password" id="signup-confirm" class="auth-popup-input" placeholder="Confirm Password" />
                                        <select id="signup-role" class="auth-popup-input">
                                            <option value="control_tester">Control Tester</option>
                                            <option value="experimental_tester">Experimental Tester</option>
                                        </select>
                                        <div id="signup-error" style="color: #d32f2f; font-size: 12px; display: none;"></div>
                                        <button id="signup-btn" class="auth-popup-button">Sign Up</button>
                                        <button id="to-login" class="auth-popup-button auth-popup-secondary">Login</button>
                                    </div>
                                </div>
                            `;
                            
                            const loginForm = authMenu.querySelector('#login-form');
                            const signupForm = authMenu.querySelector('#signup-form');
                            
                            // Login
                            authMenu.querySelector('#login-btn').addEventListener('click', async () => {
                                const email = authMenu.querySelector('#login-email').value.trim();
                                const password = authMenu.querySelector('#login-password').value;
                                const error = authMenu.querySelector('#login-error');
                                
                                if (!email || !password) {
                                    error.textContent = 'Email and password required';
                                    error.style.display = 'block';
                                    return;
                                }
                                
                                if (!window.FirebaseAPI) {
                                    error.textContent = 'FirebaseAPI not loaded. Try again.';
                                    error.style.display = 'block';
                                    console.error('FirebaseAPI not available');
                                    return;
                                }
                                
                                try {
                                    const result = await window.FirebaseAPI.loginWithEmail(email, password);
                                    if (result.success) {
                                        // Update UI immediately without reload
                                        renderAuthMenu();
                                        authMenu.style.display = 'block';
                                        // Then reload after a short delay to load settings
                                        setTimeout(() => location.reload(), 500);
                                    } else {
                                        error.textContent = result.error || 'Login failed';
                                        error.style.display = 'block';
                                    }
                                } catch (err) {
                                    error.textContent = 'Error: ' + err.message;
                                    error.style.display = 'block';
                                    console.error('Login error:', err);
                                }
                            });
                            
                            // Sign up
                            authMenu.querySelector('#signup-btn').addEventListener('click', async () => {
                                const email = authMenu.querySelector('#signup-email').value.trim();
                                const password = authMenu.querySelector('#signup-password').value;
                                const confirm = authMenu.querySelector('#signup-confirm').value;
                                const role = authMenu.querySelector('#signup-role').value;
                                const error = authMenu.querySelector('#signup-error');
                                
                                if (!email || !password || !confirm) {
                                    error.textContent = 'All fields required';
                                    error.style.display = 'block';
                                    return;
                                }
                                
                                if (password !== confirm) {
                                    error.textContent = 'Passwords do not match';
                                    error.style.display = 'block';
                                    return;
                                }
                                
                                if (password.length < 6) {
                                    error.textContent = 'Password must be 6+ chars';
                                    error.style.display = 'block';
                                    return;
                                }
                                
                                if (!window.FirebaseAPI) {
                                    error.textContent = 'FirebaseAPI not loaded. Try again.';
                                    error.style.display = 'block';
                                    console.error('FirebaseAPI not available');
                                    return;
                                }
                                
                                try {
                                    const result = await window.FirebaseAPI.signupWithEmail(email, password, role);
                                    if (result.success) {
                                        // Update UI immediately without reload
                                        renderAuthMenu();
                                        authMenu.style.display = 'block';
                                        // Then reload after a short delay to load settings
                                        setTimeout(() => location.reload(), 500);
                                    } else {
                                        error.textContent = result.error || 'Signup failed';
                                        error.style.display = 'block';
                                    }
                                } catch (err) {
                                    error.textContent = 'Error: ' + err.message;
                                    error.style.display = 'block';
                                    console.error('Signup error:', err);
                                }
                            });
                            
                            // Toggle forms
                            authMenu.querySelector('#to-signup').addEventListener('click', () => {
                                loginForm.style.display = 'none';
                                signupForm.style.display = 'flex';
                            });
                            
                            authMenu.querySelector('#to-login').addEventListener('click', () => {
                                signupForm.style.display = 'none';
                                loginForm.style.display = 'flex';
                            });
                        }
                    };
                    
                    // Click handler
                    avatarBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        authMenuOpen = !authMenuOpen;
                        if (authMenuOpen) {
                            renderAuthMenu();
                            authMenu.style.display = 'block';
                        } else {
                            authMenu.style.display = 'none';
                        }
                    });
                    
                    // Close on outside click
                    document.addEventListener('click', (e) => {
                        if (authMenuOpen && !authMenu.contains(e.target) && e.target !== avatarBtn) {
                            authMenuOpen = false;
                            authMenu.style.display = 'none';
                        }
                    });
                    
                    // Initial render
                    renderAuthMenu();
                }

                // Ensure time window visibility is set immediately after sidebar loads
                setTimeout(() => {
                    updateTimeWindowSliderVisibility();
                }, 100);

                // Load user settings if logged in
                const user = window.FirebaseAPI?.getCurrentUser();
                let hasExistingAD = false;
                let hasExistingVQA = false;
                
                if (user && window.DatabaseIntegration) {
                    const settings = await window.DatabaseIntegration.loadUserSettings();
                    if (settings) {
                        window.DatabaseIntegration.restoreSettingsToUI(sidebar, settings);
                    }

                    // Set up real-time role listener
                    window.FirebaseAPI.setupRoleListener(user.uid, (newRole) => {
                        // Call the time window visibility update when role changes
                        updateTimeWindowSliderVisibility();
                    });
                    
                    // Helper function to format dates
                    const formatDateHelper = (isoString) => {
                        if (!isoString) return '';
                        try {
                            const date = new Date(isoString);
                            const now = new Date();
                            const diffMs = now - date;
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);
                            
                            if (diffMins < 1) return 'just now';
                            if (diffMins < 60) return `${diffMins}m ago`;
                            if (diffHours < 24) return `${diffHours}h ago`;
                            if (diffDays < 7) return `${diffDays}d ago`;
                            
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        } catch {
                            return '';
                        }
                    };
                    
                    // Helper function to format time
                    const formatTimeHelper = (seconds) => {
                        const mins = Math.floor(seconds / 60);
                        const secs = Math.floor(seconds % 60);
                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                    };

                    // Load previous ADs for this video
                    const videoUrl = window.location.href;
                    const videoIdFromUrl = videoUrl.split('v=')[1]?.split('&')[0];
                    console.log('[CustomQA] ========== VIDEO LOAD CHECK ==========');
                    console.log('[CustomQA] Current user:', user?.uid, user?.email);
                    console.log('[CustomQA] Video URL:', videoUrl);
                    console.log('[CustomQA] Extracted Video ID:', videoIdFromUrl);
                    
                    try {
                        const previousAD = await window.DatabaseIntegration.loadGeneratedAD(videoUrl);
                        console.log('[CustomQA] AD Load Result:', previousAD ? 'SUCCESS' : 'NO DATA', previousAD);
                        
                        if (previousAD && previousAD.generatedAds && previousAD.generatedAds.length > 0) {
                            hasExistingAD = true;
                            console.log('[CustomQA] ✓ Displaying', previousAD.generatedAds.length, 'AD(s)');
                            
                            // Restore settings that were used when this AD was generated
                            if (previousAD.customizations) {
                                window.DatabaseIntegration.restoreSettingsToUI(sidebar, previousAD.customizations);
                            }
                            
                            // Display the ADs with full UI (speaker buttons, etc)
                            const adMessages = sidebar.querySelector('#ad-messages');
                            console.log('[CustomQA] AD container found:', !!adMessages);
                            
                            if (adMessages) {
                                adMessages.innerHTML = '';
                                
                                // Add metadata badge showing when this was created
                                const metadataBadge = document.createElement('div');
                                metadataBadge.style.background = '#e8f5e9';
                                metadataBadge.style.border = '1px solid #4caf50';
                                metadataBadge.style.borderRadius = '4px';
                                metadataBadge.style.padding = '8px 12px';
                                metadataBadge.style.marginBottom = '12px';
                                metadataBadge.style.fontSize = '12px';
                                metadataBadge.style.color = '#2e7d32';
                                metadataBadge.innerHTML = `<strong>Saved Descriptions</strong> • ${formatDateHelper(previousAD.createdAt)}`;
                                adMessages.appendChild(metadataBadge);
                                
                                const descriptions = previousAD.generatedAds;
                                const gender = previousAD.customizations?.adGender || 'female';
                                
                                descriptions.forEach((desc, index) => {
                                    const messageContainer = document.createElement('div');
                                    messageContainer.style.display = 'flex';
                                    messageContainer.style.alignItems = 'flex-start';
                                    messageContainer.style.gap = '8px';
                                    messageContainer.style.marginBottom = '12px';
                                    
                                    const currentTs = desc.timestamp_in_seconds;
                                    const nextTs = descriptions[index + 1]?.timestamp_in_seconds || (video ? video.duration : 0);
                                    const tsRange = `${formatTimeHelper(currentTs)} - ${formatTimeHelper(nextTs)}`;
                                    
                                    const bubble = document.createElement('div');
                                    bubble.className = 'chat-message bot-message';
                                    bubble.style.flex = '1';
                                    
                                    const textSpan = document.createElement('span');
                                    textSpan.tabIndex = 0;
                                    textSpan.textContent = `[${tsRange}] ${desc.description}`;
                                    bubble.appendChild(textSpan);
                                    
                                    const speakerBtn = document.createElement('button');
                                    speakerBtn.id = `ad-speaker-btn-loaded-${index}`;
                                    setButtonToSpeakerIcon(speakerBtn);
                                    speakerBtn.setAttribute('data-text', desc.description);
                                    speakerBtn.style.background = 'none';
                                    speakerBtn.style.border = 'none';
                                    speakerBtn.style.fontSize = '18px';
                                    speakerBtn.style.cursor = 'pointer';
                                    speakerBtn.style.padding = '0';
                                    speakerBtn.style.marginTop = '8px';
                                    speakerBtn.style.opacity = '0.5';
                                    speakerBtn.style.transition = 'opacity 0.2s';
                                    
                                    speakerBtn.addEventListener('mouseover', () => speakerBtn.style.opacity = '1');
                                    speakerBtn.addEventListener('mouseout', () => speakerBtn.style.opacity = '0.5');
                                    
                                    speakerBtn.addEventListener('click', (event) => {
                                        const thisButton = event.currentTarget;
                                        
                                        if (currentAudio && currentPlayingButton === thisButton) {
                                            currentAudio.stop();
                                            return;
                                        }
                                        
                                        const textToSpeak = thisButton.getAttribute('data-text');
                                        chrome.runtime.sendMessage({
                                            type: 'CALL_OPENAI_TTS',
                                            text: textToSpeak,
                                            gender: gender
                                        }, (ttsResponse) => {
                                            if (ttsResponse && ttsResponse.success) {
                                                playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                                            } else {
                                                console.error('OpenAI TTS error:', ttsResponse?.error);
                                            }
                                        });
                                    });
                                    
                                    messageContainer.appendChild(bubble);
                                    messageContainer.appendChild(speakerBtn);
                                    adMessages.appendChild(messageContainer);
                                });
                                console.log('[CustomQA] ✓ AD bubbles displayed');
                            } else {
                                console.warn('[CustomQA] ✗ AD container NOT found - bubbles cannot display');
                            }
                        } else {
                            console.log('[CustomQA] ℹ No previous ADs found for this video');
                        }
                    } catch (adError) {
                        console.error('[CustomQA] ✗ Error loading ADs:', adError);
                    }
                    
                    // Load previous VQA for this video
                    try {
                        const previousVQA = await window.DatabaseIntegration.loadGeneratedVQA(videoUrl);
                        console.log('[CustomQA] VQA Load Result:', previousVQA ? 'SUCCESS' : 'NO DATA', previousVQA);
                        
                        if (previousVQA && previousVQA.messages && previousVQA.messages.length > 0) {
                            hasExistingVQA = true;
                            console.log('[CustomQA] ✓ Displaying', previousVQA.messages.length, 'VQA message(s)');
                            
                            const vqaMessages = sidebar.querySelector('.vqa-sub-tab-content .chat-messages');
                            console.log('[CustomQA] VQA container found:', !!vqaMessages);
                            
                            if (vqaMessages) {
                                vqaMessages.innerHTML = '';
                                
                                // Add metadata badge showing when this was created
                                const metadataBadge = document.createElement('div');
                                metadataBadge.style.background = '#e3f2fd';
                                metadataBadge.style.border = '1px solid #2196f3';
                                metadataBadge.style.borderRadius = '4px';
                                metadataBadge.style.padding = '8px 12px';
                                metadataBadge.style.marginBottom = '12px';
                                metadataBadge.style.fontSize = '12px';
                                metadataBadge.style.color = '#1565c0';
                                metadataBadge.innerHTML = `<strong>Saved Q&A</strong> • ${formatDateHelper(previousVQA.createdAt)}`;
                                vqaMessages.appendChild(metadataBadge);
                                
                                // Separate questions from answers
                                const questions = [];
                                const answers = [];
                                
                                previousVQA.messages.forEach(msg => {
                                    // Parse message if it's a stringified object
                                    let msgContent = msg;
                                    if (typeof msg === 'string') {
                                        try {
                                            msgContent = JSON.parse(msg);
                                        } catch (e) {
                                            console.warn('[CustomQA] Failed to parse message:', e);
                                            msgContent = { role: 'assistant', content: msg };
                                        }
                                    }
                                    
                                    if (msgContent.role === 'user') {
                                        questions.push(msgContent);
                                    } else {
                                        answers.push(msgContent);
                                    }
                                });
                                
                                // Display questions first (blue bubbles)
                                questions.forEach(q => {
                                    const message = document.createElement('div');
                                    message.className = 'chat-message user-message';
                                    message.textContent = q.content || q.text || '';
                                    vqaMessages.appendChild(message);
                                });
                                
                                // Display answers next (gray bubbles)
                                answers.forEach(a => {
                                    const message = document.createElement('div');
                                    message.className = 'chat-message bot-message';
                                    message.textContent = a.content || a.text || '';
                                    vqaMessages.appendChild(message);
                                });
                                
                                console.log('[CustomQA] VQA display complete - Questions:', questions.length, 'Answers:', answers.length);
                            } else {
                                console.warn('[CustomQA] ✗ VQA container NOT found - bubbles cannot display');
                            }
                        } else {
                            console.log('[CustomQA] ℹ No previous VQAs found for this video');
                        }
                    } catch (vqaError) {
                        console.error('[CustomQA] ✗ Error loading VQAs:', vqaError);
                    }
                    
                    console.log('[CustomQA] ========== VIDEO LOAD COMPLETE ==========');
                    
                    // Hide timewindow slider for non-admins
                    const userRole = await window.DatabaseIntegration.getUserRole();
                    if (userRole !== 'admin') {
                        const timeWindowSlider = sidebar.querySelector('#time-window-slider');
                        if (timeWindowSlider && timeWindowSlider.closest('.slider-container')) {
                            timeWindowSlider.closest('.slider-container').style.display = 'none';
                        }
                    }
                }

                // Handle AD save
                const adSaveBtn = sidebar.querySelector('#ad-save-button');
                if (adSaveBtn) {
                    adSaveBtn.addEventListener('click', async () => {
                        const user = window.FirebaseAPI?.getCurrentUser();
                        if (!user) {
                            alert('Please log in to save settings');
                            return;
                        }

                        adSaveBtn.disabled = true;
                        adSaveBtn.textContent = 'SAVING...';

                        try {
                            const customizations = {
                                volume: sidebar.querySelector('#ad-volume-slider')?.value || 50,
                                speed: sidebar.querySelector('#ad-speed-slider')?.value || 50,
                                length: sidebar.querySelector('#length-slider')?.value || 25,
                                frequency: sidebar.querySelector('[data-frequency].active')?.dataset?.frequency || 'sometimes',
                                emphasis: sidebar.querySelector('[data-emphasis].active')?.dataset?.emphasis || 'balanced',
                                colorPreference: sidebar.querySelector('[data-color].active')?.dataset?.color || 'on',
                                narrationStyle: sidebar.querySelector('[data-narration].active')?.dataset?.narration || 'objective',
                                gender: sidebar.querySelector('[data-gender].active')?.dataset?.gender || 'female'
                            };

                            const success = await window.DatabaseIntegration.saveADSettings(customizations);
                            if (success) {
                                adSaveBtn.textContent = 'SAVED ✓';
                                setTimeout(() => {
                                    adSaveBtn.textContent = 'SAVE CHANGES';
                                    adSaveBtn.disabled = false;
                                }, 2000);
                            } else {
                                throw new Error('Failed to save');
                            }
                        } catch (error) {
                            alert('Failed to save settings: ' + error.message);
                            adSaveBtn.textContent = 'SAVE CHANGES';
                            adSaveBtn.disabled = false;
                        }
                    });
                }

                // Save VQA settings
                const vqaSaveBtn = sidebar.querySelector('[aria-label="Save Changes"]');
                if (vqaSaveBtn) {
                    vqaSaveBtn.addEventListener('click', async () => {
                        const user = window.FirebaseAPI?.getCurrentUser();
                        if (!user) {
                            alert('Please log in to save settings');
                            return;
                        }

                        vqaSaveBtn.disabled = true;
                        vqaSaveBtn.textContent = 'SAVING...';

                        try {
                            const customizations = {
                                volume: sidebar.querySelector('#vqa-volume-slider')?.value || 50,
                                speed: sidebar.querySelector('#vqa-speed-slider')?.value || 50,
                                length: sidebar.querySelector('#vqa-length-slider')?.value || 25,
                                gender: sidebar.querySelector('#vqa-gender-group .active')?.dataset?.gender || 'female'
                            };

                            const success = await window.DatabaseIntegration.saveVQASettings(customizations);
                            if (success) {
                                vqaSaveBtn.textContent = 'SAVED ✓';
                                setTimeout(() => {
                                    vqaSaveBtn.textContent = 'SAVE CHANGES';
                                    vqaSaveBtn.disabled = false;
                                }, 2000);
                            } else {
                                throw new Error('Failed to save');
                            }
                        } catch (error) {
                            alert('Failed to save settings: ' + error.message);
                            vqaSaveBtn.textContent = 'SAVE CHANGES';
                            vqaSaveBtn.disabled = false;
                        }
                    });
                }

                // Load and set volume for both sliders
                const adVolumeSlider = sidebar.querySelector('#ad-volume-slider');
                const vqaVolumeSlider = sidebar.querySelector('#vqa-volume-slider');

                const setSliderValues = (volume) => {
                    if (adVolumeSlider) {
                        adVolumeSlider.value = volume;
                        adVolumeSlider.setAttribute('aria-valuetext', `Volume ${volume}%`);
                    }
                    if (vqaVolumeSlider) {
                        vqaVolumeSlider.value = volume;
                        vqaVolumeSlider.setAttribute('aria-valuetext', `Volume ${volume}%`);
                    }
                };

                chrome.storage.sync.get('volume', (data) => {
                    if (data.volume) {
                        setSliderValues(data.volume);
                    }
                });

                const volumeChangeHandler = (e) => {
                    const newVolume = e.target.value;
                    chrome.storage.sync.set({ volume: newVolume });
                    setSliderValues(newVolume); // Keep sliders in sync
                };

                if (adVolumeSlider) {
                    adVolumeSlider.addEventListener('input', volumeChangeHandler);
                }
                if (vqaVolumeSlider) {
                    vqaVolumeSlider.addEventListener('input', volumeChangeHandler);
                }

                const vqaBadgeButton = sidebar.querySelector('.vqa-badge');
                if (vqaBadgeButton) {
                    vqaBadgeButton.addEventListener('click', () => {
                        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
                    });
                }

                // Tab switching functionality
                const tabButtons = sidebar.querySelectorAll('.tab-button');
                const tabContents = sidebar.querySelectorAll('.tab-content');

                const adTab = sidebar.querySelector('#audio-descriptions-tab');
                const vqaTab = sidebar.querySelector('#vqa-tab');

                const syncPresentationSettings = (sourceTab, destTab) => {
                    if (!sourceTab || !destTab) return;

                    const sourceSpeed = sourceTab.querySelector('.slider[id*="speed-slider"]');
                    const sourceVolume = sourceTab.querySelector('.slider[id*="volume-slider"]');
                    const sourceVoice = sourceTab.querySelector('.pill-button[data-voice].active');
                    const sourceGender = sourceTab.querySelector('.pill-button[data-gender].active');

                    const destSpeed = destTab.querySelector('.slider[id*="speed-slider"]');
                    const destVolume = destTab.querySelector('.slider[id*="volume-slider"]');
                    const destVoiceButtons = destTab.querySelectorAll('.pill-button[data-voice]');
                    const destGenderButtons = destTab.querySelectorAll('.pill-button[data-gender]');

                    if (sourceSpeed && destSpeed) destSpeed.value = sourceSpeed.value;
                    if (sourceVolume && destVolume) destVolume.value = sourceVolume.value;

                    if (sourceVoice) {
                        destVoiceButtons.forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.voice === sourceVoice.dataset.voice);
                        });
                    }

                    if (sourceGender) {
                        destGenderButtons.forEach(btn => {
                            btn.classList.toggle('active', btn.dataset.gender === sourceGender.dataset.gender);
                        });
                    }
                };

                tabButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const tabName = button.getAttribute('data-tab');
                        const currentActiveTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');

                        // Stop any playing audio when switching tabs
                        if (currentAudio) {
                            try {
                                currentAudio.onended = null; // Prevent old onended from firing
                                currentAudio.stop();
                            } catch (e) {
                                console.error('Error stopping audio on tab switch:', e);
                            }
                            currentAudio = null;
                            if (currentPlayingButton) {
                                setButtonToSpeakerIcon(currentPlayingButton);
                                currentPlayingButton = null;
                            }
                        }

                        // Update active tab button
                        tabButtons.forEach(btn => {
                            btn.classList.remove('active');
                            btn.setAttribute('aria-selected', 'false');
                        });
                        button.classList.add('active');
                        button.setAttribute('aria-selected', 'true');

                        // Show corresponding content
                        tabContents.forEach(content => {
                            content.style.display = 'none';
                        });
                        const newActiveTab = sidebar.querySelector(`#${tabName}-tab`);
                        newActiveTab.style.display = 'block';
                        newActiveTab.focus(); // Focus the new tab panel for screen readers

                        // Sync settings
                        if (currentActiveTab && newActiveTab) {
                            syncPresentationSettings(currentActiveTab, newActiveTab);
                        }
                    });
                });

                // Length slider update
                const lengthSlider = sidebar.querySelector('#length-slider');
                const lengthValue = sidebar.querySelector('#length-value');
                const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                const vqaLengthValue = sidebar.querySelector('#vqa-length-value');

                const syncLengthSliders = (sourceSlider) => {
                    const newValue = sourceSlider.value;
                    if (lengthSlider && lengthValue) {
                        lengthSlider.value = newValue;
                        lengthValue.textContent = newValue;
                        lengthSlider.setAttribute('aria-valuetext', `Length ${newValue} words`);
                    }
                    if (vqaLengthSlider && vqaLengthValue) {
                        vqaLengthSlider.value = newValue;
                        vqaLengthValue.textContent = newValue;
                        vqaLengthSlider.setAttribute('aria-valuetext', `Length ${newValue} words`);
                    }
                };

                if (lengthSlider) {
                    lengthSlider.addEventListener('input', (e) => {
                        syncLengthSliders(e.target);
                    });
                }
                if (vqaLengthSlider) {
                    vqaLengthSlider.addEventListener('input', (e) => {
                        syncLengthSliders(e.target);
                    });
                }

                // Speed slider sync
                const adSpeedSlider = sidebar.querySelector('#ad-speed-slider');
                const vqaSpeedSlider = sidebar.querySelector('#vqa-speed-slider');

                const syncSpeedSliders = (sourceSlider) => {
                    const newValue = sourceSlider.value;
                    if (adSpeedSlider) {
                        adSpeedSlider.value = newValue;
                        adSpeedSlider.setAttribute('aria-valuetext', `Speed ${newValue}%`);
                    }
                    if (vqaSpeedSlider) {
                        vqaSpeedSlider.value = newValue;
                        vqaSpeedSlider.setAttribute('aria-valuetext', `Speed ${newValue}%`);
                    }
                };

                if (adSpeedSlider) {
                    adSpeedSlider.addEventListener('input', (e) => {
                        syncSpeedSliders(e.target);
                    });
                }
                if (vqaSpeedSlider) {
                    vqaSpeedSlider.addEventListener('input', (e) => {
                        syncSpeedSliders(e.target);
                    });
                }

                // Add event listeners for button clicks
                sidebar.addEventListener('click', (e) => {
                    if (e.target.classList.contains('pill-button')) {
                        const button = e.target;
                        const buttonGroup = button.parentElement;
                        const buttons = buttonGroup.querySelectorAll('.pill-button');
                        const subsectionTitleElement = buttonGroup.parentElement.querySelector('.subsection-title');
                        
                        const isMultipleChoice = buttonGroup.dataset.selectionType === 'multiple';
                        
                        if (!isMultipleChoice) {
                            buttons.forEach(btn => {
                                btn.classList.remove('active');
                                btn.setAttribute('aria-pressed', 'false');
                            });
                            button.classList.add('active');
                            button.setAttribute('aria-pressed', 'true');

                            if (subsectionTitleElement) {
                                const groupName = subsectionTitleElement.textContent.trim().replace(':', '');
                                subsectionTitleElement.setAttribute('aria-label', `${groupName}: ${button.textContent.trim()}`);
                            }
                        } else {
                            button.classList.toggle('active');
                            button.setAttribute('aria-pressed', button.classList.contains('active') ? 'true' : 'false');
                            // For multiple choice, update the aria-label to list all active options
                            if (subsectionTitleElement) {
                                const activeButtons = buttonGroup.querySelectorAll('.pill-button.active');
                                const selectedOptions = Array.from(activeButtons).map(btn => btn.textContent.trim());
                                const groupName = subsectionTitleElement.textContent.trim().replace(':', '');
                                if (selectedOptions.length > 0) {
                                    subsectionTitleElement.setAttribute('aria-label', `${groupName}: ${selectedOptions.join(', ')}`);
                                } else {
                                    subsectionTitleElement.setAttribute('aria-label', `${groupName}: None selected`);
                                }
                            }
                        }

                        if (button.dataset.gender) {
                            const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                            const otherTab = sidebar.querySelector('.tab-content[style*="display: none"]');
                            syncPresentationSettings(activeTab, otherTab);
                        }
                    }
                });

                const pauseAdGroup = sidebar.querySelector('#pause-ad-group');
                const audioDuckingSection = sidebar.querySelector('#audio-ducking-section');

                if (pauseAdGroup && audioDuckingSection) {
                    pauseAdGroup.addEventListener('click', (e) => {
                        if (e.target.classList.contains('pill-button')) {
                            const action = e.target.dataset.action;
                            if (action === 'pause-off') {
                                audioDuckingSection.style.display = 'block';
                            } else if (action === 'pause-on') {
                                audioDuckingSection.style.display = 'none';
                            }
                        }
                    });
                }

                // Chat Speech-to-text
                let isListeningChatMicButton = false;
                let recognitionChatMicButton = null;
                const chatMicButton = sidebar.querySelector('#chat-mic-button');
                chatMicButton.addEventListener('click', () => {
                    if (isListeningChatMicButton) {
                        recognitionChatMicButton.stop();
                        isListeningChatMicButton = false;
                        chatMicButton.classList.remove('listening');
                        try {
                            activationSound.play(); // Play sound on stop as well
                        } catch (error) {
                            console.error('Error playing activation sound:', error);
                        }
                    } else {
                        recognitionChatMicButton = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
                        recognitionChatMicButton.lang = 'en-US';
                        recognitionChatMicButton.interimResults = false;
                        recognitionChatMicButton.maxAlternatives = 1;

                        const activationSound = new Audio(chrome.runtime.getURL('assets/activation.mp3'));
                        try {
                            activationSound.play();
                        } catch (error) {
                            console.error('Error playing activation sound:', error);
                        }

                        recognitionChatMicButton.start();
                        isListeningChatMicButton = true;
                        chatMicButton.classList.add('listening');

                        recognitionChatMicButton.onresult = (event) => {
                            const chatInput = sidebar.querySelector('.chat-input');
                            chatInput.value = event.results[0][0].transcript;
                        };

                        recognitionChatMicButton.onspeechend = () => {
                            recognitionChatMicButton.stop();
                            isListeningChatMicButton = false;
                            chatMicButton.classList.remove('listening');
                            try {
                                activationSound.play();
                            } catch (error) {
                                console.error('Error playing activation sound:', error);
                            }
                        };

                        recognitionChatMicButton.onerror = (event) => {
                            console.error('Speech recognition error:', event.error);
                            isListeningChatMicButton = false;
                            chatMicButton.classList.remove('listening');
                        };
                    }
                });

                // Chat Text-to-speech
                const chatSpeakerButton = sidebar.querySelector('#chat-speaker-button');
                chatSpeakerButton.addEventListener('click', (event) => {
                    const thisButton = event.currentTarget;

                    if (currentAudio && currentPlayingButton === thisButton) {
                        currentAudio.stop();
                        return;
                    }

                    console.log('Chat speaker button clicked.');
                    const chatInput = sidebar.querySelector('.chat-input');
                    const textToSpeak = chatInput.value;
                    const genderBtn = sidebar.querySelector('.pill-button[data-gender].active');
                    const gender = genderBtn ? genderBtn.dataset.gender : 'female';

                    if (textToSpeak) {
                        const audioUrl = thisButton.getAttribute('data-audio-url');
                        if (audioUrl) {
                            playAudioFromDataUrl(audioUrl, thisButton);
                        } else {
                            chrome.runtime.sendMessage({
                                type: 'CALL_OPENAI_TTS',
                                text: textToSpeak,
                                gender: gender
                            }, (ttsResponse) => {
                                if (ttsResponse && ttsResponse.success) {
                                    playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                                } else {
                                    console.error('OpenAI TTS error:', ttsResponse?.error);
                                }
                            });
                        }
                    }
                });

                let adSchedule = [];

                const captureVideoFrame = async (timeInSeconds) => {
                    return new Promise((resolve, reject) => {
                        const originalTime = video.currentTime;
                        const seekHandler = () => {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(video, 0, 0);
                                const frameData = canvas.toDataURL('image/jpeg').split(',')[1];
                                
                                video.removeEventListener('seeked', seekHandler);
                                video.currentTime = originalTime;
                                resolve(frameData);
                            } catch (error) {
                                video.removeEventListener('seeked', seekHandler);
                                video.currentTime = originalTime;
                                reject(error);
                            }
                        };
                        video.addEventListener('seeked', seekHandler, { once: true });
                        video.currentTime = timeInSeconds;
                    });
                };

                let isAdGenerationRunning = false;
                let cancelAdGeneration = false;
                const generateAdButton = sidebar.querySelector('#generate-ad-button');
                if (generateAdButton) {
                    // Update button text based on whether ADs exist
                    if (hasExistingAD) {
                        generateAdButton.textContent = 'REGENERATE AD';
                    }
                    
                    generateAdButton.addEventListener('click', async () => {
                        // Clear previous ADs immediately
                        adSchedule = [];
                        const adMessages = sidebar.querySelector('#ad-messages');
                        if (adMessages) {
                            adMessages.innerHTML = '';
                        }
                        // Clear preloaded audio for old ADs
                        preloadedAudioMap.clear();
                        // Stop any currently playing audio
                        if (currentAudio) {
                            currentAudio.stop();
                            currentAudio = null;
                            if (currentPlayingButton) {
                                setButtonToSpeakerIcon(currentPlayingButton);
                                currentPlayingButton = null;
                            }
                        }
                        
                        if (isAdGenerationRunning) {
                            cancelAdGeneration = true;
                            generateAdButton.textContent = 'Cancelling...';
                            generateAdButton.disabled = true;
                            return;
                        }

                        if (!video) {
                            console.error('Video element not found.');
                            return;
                        }

                        // Pause video during generation
                        video.pause();

                        isAdGenerationRunning = true;
                        cancelAdGeneration = false;
                        generateAdButton.textContent = 'Capturing frames... (Click to cancel)';
                        generateAdButton.disabled = false;
                        
                        const duration = video.duration;
                        const frequency = sidebar.querySelector('.pill-button[data-frequency].active')?.dataset.frequency || 'sometimes';
                        
                        let interval;
                        switch (frequency) {
                            case 'rarely':
                                interval = 60;
                                break;
                            case 'sometimes':
                                interval = 30;
                                break;
                            case 'often':
                                interval = 15;
                                break;
                            case 'very-often':
                                interval = 8;
                                break;
                            default:
                                interval = 60;
                        }

                        const timestamps = [];
                        for (let i = 0; i < duration; i += interval) {
                            timestamps.push(i);
                        }

                        console.log('[AD] Capturing frames at timestamps:', timestamps);

                        try {
                            const frames = [];
                            for (const timestamp of timestamps) {
                                if (cancelAdGeneration) {
                                    throw new Error('Cancelled by user');
                                }
                                try {
                                    console.log(`[AD] Capturing frame at ${timestamp}s`);
                                    const frameData = await captureVideoFrame(timestamp);
                                    frames.push({
                                        timestamp: timestamp,
                                        frameData: frameData
                                    });
                                } catch (error) {
                                    console.error(`[AD] Failed to capture frame at ${timestamp}s:`, error);
                                }
                            }

                            if (cancelAdGeneration) {
                                throw new Error('Cancelled by user');
                            }

                            if (frames.length === 0) {
                                throw new Error('No frames were captured.');
                            }

                            console.log('[AD] Frame capture complete. Sending to Gemini...');
                            generateAdButton.textContent = 'Generating descriptions... (Click to cancel)';

                            const customizations = {
                                length: sidebar.querySelector('#length-slider').value,
                                emphasis: sidebar.querySelector('.pill-button[data-emphasis].active')?.dataset.emphasis || 'balanced',
                                subjectiveness: sidebar.querySelector('.pill-button[data-narration].active')?.dataset.narration || 'objective',
                                colorPreference: sidebar.querySelector('.pill-button[data-color].active')?.dataset.color || 'on',
                            };

                            const videoUrl = window.location.href;

                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AD generation timed out')), 300000));

                            const geminiPromise = new Promise((resolve, reject) => {
                                chrome.runtime.sendMessage({
                                    type: 'CALL_GEMINI_FOR_AD',
                                    customizations: customizations,
                                    frames: frames,
                                    videoUrl: videoUrl
                                }, (response) => {
                                    if (cancelAdGeneration) {
                                        reject(new Error('Cancelled by user'));
                                    } else {
                                        resolve(response);
                                    }
                                });
                            });

                            const response = await Promise.race([geminiPromise, timeoutPromise]);

                            if (response && response.success) {
                                console.log('AD Generation successful:', response.text);
                                // Strip markdown and parse
                                const jsonString = response.text.replace(/```json\n|```/g, '');
                                const adData = JSON.parse(jsonString);
                                
                                let descriptions = [];
                                if (adData.VideoMetadata && adData.VideoMetadata.audio_descriptions) {
                                    descriptions = adData.VideoMetadata.audio_descriptions;
                                } else if (adData.audio_descriptions) {
                                    descriptions = adData.audio_descriptions;
                                } else if (adData.VideoMetadata && adData.VideoMetadata.AudioDescriptions) {
                                    descriptions = adData.VideoMetadata.AudioDescriptions;
                                }

                                adSchedule = descriptions.map(desc => ({
                                    timestamp: (desc.timestamp_ms || desc.timestamp_in_seconds * 1000) / 1000,
                                    description: desc.description,
                                    played: false
                                }));

                                generateAdButton.textContent = 'Preloading audio...';

                                const preloadPromises = adSchedule.map(ad => {
                                    return new Promise((resolve, reject) => {
                                        chrome.runtime.sendMessage({
                                            type: 'PRELOAD_OPENAI_TTS',
                                            text: ad.description,
                                            gender: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active')?.dataset.gender || 'female'
                                        }, (response) => {
                                            if (response && response.success) {
                                                preloadedAudioMap.set(response.text, response.audioDataUrl);
                                                resolve();
                                            } else {
                                                console.error('OpenAI TTS preload error:', response?.error);
                                                reject(response?.error);
                                            }
                                        });
                                    });
                                });

                                Promise.all(preloadPromises).then(async () => {
                                    console.log('All audio preloaded');
                                    displayAdBubbles(adSchedule);
                                    
                                    // Save generated ADs to Firestore if user is logged in
                                    const user = window.FirebaseAPI?.getCurrentUser();
                                    if (user && window.DatabaseIntegration) {
                                        const videoUrl = window.location.href;
                                        // Capture all current user settings as snapshot
                                        const customizations = {
                                            // AD settings
                                            adVolume: parseInt(sidebar.querySelector('#ad-volume-slider')?.value || 50),
                                            adSpeed: parseInt(sidebar.querySelector('#ad-speed-slider')?.value || 50),
                                            adGender: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active')?.dataset.gender || 'female',
                                            adVoice: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-voice].active')?.dataset.voice || 'natural',
                                            adLength: parseInt(sidebar.querySelector('#length-slider')?.value || 25),
                                            adFrequency: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-frequency].active')?.dataset.frequency || 'sometimes',
                                            adEmphasis: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-emphasis].active')?.dataset.emphasis || 'balanced',
                                            adColorPreference: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-color].active')?.dataset.color || 'on',
                                            adNarrationStyle: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-narration].active')?.dataset.narration || 'objective',
                                            adPauseDuringAd: sidebar.querySelector('#pause-ad-group .pill-button.active')?.dataset.value === 'true',
                                            // VQA settings
                                            vqaVolume: parseInt(sidebar.querySelector('#vqa-volume-slider')?.value || 50),
                                            vqaSpeed: parseInt(sidebar.querySelector('#vqa-speed-slider')?.value || 50),
                                            vqaGender: sidebar.querySelector('#vqa-tab .pill-button[data-gender].active')?.dataset.gender || 'female',
                                            vqaLength: parseInt(sidebar.querySelector('#time-window-slider')?.value || 25)
                                        };
                                        const generatedAds = adSchedule.map(ad => ({
                                            timestamp_in_seconds: ad.timestamp,
                                            description: ad.description
                                        }));
                                        
                                        const saved = await window.DatabaseIntegration.saveGeneratedAD(videoUrl, video.duration, customizations, generatedAds);
                                        if (saved) {
                                            console.log('Generated ADs saved to Firestore');
                                        }
                                    }
                                    
                                    video.currentTime = 0; // Restart video to apply ADs
                                    // Wait for seek to complete, then play
                                    const handleSeeked = () => {
                                        video.removeEventListener('seeked', handleSeeked);
                                        console.log('[AD] Video seeked to start, auto-playing...');
                                        video.play();
                                    };
                                    video.addEventListener('seeked', handleSeeked);
                                }).catch(error => {
                                    console.error('Error preloading audio:', error);
                                    alert('Error preloading audio. Please try again.');
                                });

                            } else {
                                throw new Error(response?.error || 'Unknown error during AD generation');
                            }
                        } catch (error) {
                            console.log('[AD] AD generation stopped:', error.message);
                            if (error.message !== 'Cancelled by user' && error.message !== 'AD generation timed out') {
                                alert(`AD Generation Error: ${error.message}`);
                            }
                        } finally {
                            isAdGenerationRunning = false;
                            cancelAdGeneration = false;
                            generateAdButton.textContent = 'REGENERATE AD';
                            generateAdButton.disabled = false;
                        }
                    });
                }

                const displayAdBubbles = (descriptions) => {
                    console.log('Displaying AD bubbles:', descriptions);
                    const adMessages = sidebar.querySelector('#ad-messages');
                    adMessages.innerHTML = '';
                    
                    // Add metadata badge for newly generated ADs
                    const metadataBadge = document.createElement('div');
                    metadataBadge.style.background = '#fff3e0';
                    metadataBadge.style.border = '1px solid #ff9800';
                    metadataBadge.style.borderRadius = '4px';
                    metadataBadge.style.padding = '8px 12px';
                    metadataBadge.style.marginBottom = '12px';
                    metadataBadge.style.fontSize = '12px';
                    metadataBadge.style.color = '#e65100';
                    metadataBadge.innerHTML = '<strong>Just Generated</strong> • Now';
                    adMessages.appendChild(metadataBadge);
                    
                    const genderButton = sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active');
                    const gender = genderButton ? genderButton.dataset.gender : 'female';
                    
                    descriptions.forEach((desc, index) => {
                        const messageContainer = document.createElement('div');
                        messageContainer.style.display = 'flex';
                        messageContainer.style.alignItems = 'flex-start';
                        messageContainer.style.gap = '8px';
                        messageContainer.style.marginBottom = '12px';
                        
                        const currentTs = desc.timestamp;
                        const nextTs = descriptions[index + 1]?.timestamp || video.duration;
                        const tsRange = `${formatTime(currentTs)} - ${formatTime(nextTs)}`;
                        
                        const bubble = document.createElement('div');
                        bubble.className = 'chat-message bot-message';
                        bubble.style.flex = '1';

                        const textSpan = document.createElement('span');
                        textSpan.tabIndex = 0;
                        textSpan.textContent = `[${tsRange}] ${desc.description}`;
                        bubble.appendChild(textSpan);
                        
                        const speakerBtn = document.createElement('button');
                        speakerBtn.id = `ad-speaker-btn-${index}`;
                        setButtonToSpeakerIcon(speakerBtn);
                        speakerBtn.setAttribute('data-text', desc.description);
                        if (preloadedAudioMap.has(desc.description)) {
                            speakerBtn.setAttribute('data-audio-url', preloadedAudioMap.get(desc.description));
                        }
                        speakerBtn.style.background = 'none';
                        speakerBtn.style.border = 'none';
                        speakerBtn.style.fontSize = '18px';
                        speakerBtn.style.cursor = 'pointer';
                        speakerBtn.style.padding = '0';
                        speakerBtn.style.marginTop = '8px';
                        speakerBtn.style.opacity = '0.5';
                        speakerBtn.style.transition = 'opacity 0.2s';
                        
                        speakerBtn.addEventListener('mouseover', () => speakerBtn.style.opacity = '1');
                        speakerBtn.addEventListener('mouseout', () => speakerBtn.style.opacity = '0.5');
                        
                        speakerBtn.addEventListener('click', (event) => {
                            const thisButton = event.currentTarget;
                            
                            if (currentAudio && currentPlayingButton === thisButton) {
                                currentAudio.stop();
                                return;
                            }
                            
                            const textToSpeak = thisButton.getAttribute('data-text');
                            const audioUrl = thisButton.getAttribute('data-audio-url');

                            if (audioUrl) {
                                playAudioFromDataUrl(audioUrl, thisButton);
                            } else if (textToSpeak) {
                                chrome.runtime.sendMessage({
                                    type: 'CALL_OPENAI_TTS',
                                    text: textToSpeak,
                                    gender: gender
                                }, (ttsResponse) => {
                                    if (ttsResponse && ttsResponse.success) {
                                        playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                                    } else {
                                        console.error('OpenAI TTS error:', ttsResponse?.error);
                                    }
                                });
                            }
                        });
                        
                        messageContainer.appendChild(bubble);
                        messageContainer.appendChild(speakerBtn);
                        adMessages.appendChild(messageContainer);
                    });
                };

                const formatTime = (seconds) => {
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                };

                if (video) {
                    video.addEventListener('seeked', () => {
                        const currentTime = video.currentTime;
                        adSchedule.forEach(ad => {
                            if (ad.timestamp >= currentTime) {
                                ad.played = false;
                            }
                        });
                    });

                    video.addEventListener('timeupdate', () => {
                        if (adSchedule.length > 0) {
                            const currentTime = video.currentTime;
                            const adIndex = adSchedule.findIndex(ad => {
                                const offset = 1;
                                const triggerTime = Math.max(0, ad.timestamp - offset);
                                return currentTime >= triggerTime && !ad.played;
                            });
                            if (adIndex !== -1) {
                                const nextAd = adSchedule[adIndex];
                                nextAd.played = true;

                                const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                // Always pause for the first AD, then respect the pause-during-ad setting
                                if (adIndex === 0 || pauseAdButton) {
                                    console.log('[AD] Pausing video at', currentTime, 'for AD');
                                    video.pause();
                                }
                                
                                const genderBtnAD = sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active');
                                const gender = genderBtnAD ? genderBtnAD.dataset.gender : 'female';
                                
                                const speakerBtn = sidebar.querySelector(`#ad-speaker-btn-${adIndex}`);
                                const audioUrl = speakerBtn.getAttribute('data-audio-url');

                                if (audioUrl) {
                                    playAudioFromDataUrl(audioUrl, speakerBtn, () => {
                                        console.log('[AD] AD audio ended');
                                        // Always resume after first AD, then respect pause-during-ad setting
                                        if (adIndex === 0 || pauseAdButton) {
                                            console.log('[AD] Resuming video');
                                            video.play();
                                        }
                                    });
                                } else {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: nextAd.description,
                                        gender: gender
                                    }, (ttsResponse) => {
                                        if (ttsResponse && ttsResponse.success) {
                                            playAudioFromDataUrl(ttsResponse.audioDataUrl, speakerBtn, () => {
                                                console.log('[AD] AD audio ended');
                                                // Always resume after first AD, then respect pause-during-ad setting
                                                if (adIndex === 0 || pauseAdButton) {
                                                    console.log('[AD] Resuming video');
                                                    video.play();
                                                }
                                            });
                                        } else {
                                            console.error('OpenAI TTS error:', ttsResponse?.error);
                                            // Resume video on error only if it was paused
                                            if (pauseAdButton) {
                                                video.play();
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    });
                }

                // Prevent arrow keys from controlling video when sidebar is focused
                sidebar.addEventListener('keydown', (e) => {
                    if (e.target.classList.contains('slider')) {
                        return; // Don't prevent default for sliders
                    }
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.stopPropagation();
                        e.preventDefault();
                    }
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'q' && e.target.tagName.toLowerCase() !== 'input' && e.target.tagName.toLowerCase() !== 'textarea') {
                        const sidebar = document.getElementById('custom-qa-sidebar');
                        if (sidebar) {
                            sidebar.focus();
                        }
                    }
                });

                // Make sidebar focusable
                sidebar.setAttribute('tabindex', '0');

                secondary.prepend(sidebar);

                // Add timestamp functionality for CHAT tab
                const vqaSendButton = sidebar.querySelector('#vqa-send-button');
                const timeWindowSlider = sidebar.querySelector('#time-window-slider');
                const timeWindowValue = sidebar.querySelector('#time-window-value');

                if (timeWindowSlider && timeWindowValue) {
                    timeWindowSlider.addEventListener('input', (e) => {
                        const value = e.target.value;
                        if (value >= 60 && value % 60 === 0) {
                            const minutes = value / 60;
                            timeWindowValue.textContent = `${minutes}min`;
                            timeWindowSlider.setAttribute('aria-label', `Time Window ${minutes}m`);
                        } else {
                            timeWindowValue.textContent = `${value}s`;
                            timeWindowSlider.setAttribute('aria-label', `Time Window ${value}s`);
                        }
                    });
                }

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'hidden' && currentAudio) {
                        currentAudio.stop();
                    }
                });

                if (video && vqaSendButton) {
                    video.addEventListener('timeupdate', () => {
                        const minutes = Math.floor(video.currentTime / 60);
                        const seconds = Math.floor(video.currentTime % 60).toString().padStart(2, '0');
                        vqaSendButton.textContent = `Ask question at ${minutes}:${seconds}`;
                    });

                    vqaSendButton.addEventListener('click', () => {
                        const chatInput = sidebar.querySelector('#vqa-tab .chat-input');
                        const chatMessages = sidebar.querySelector('#vqa-tab .chat-messages');
                        const question = chatInput.value.trim();

                        if (question) {
                            // Pause the video
                            video.pause();

                            // Create user message container with speaker button
                            const userMessageContainer = document.createElement('div');
                            userMessageContainer.style.display = 'flex';
                            userMessageContainer.style.alignItems = 'flex-start';
                            userMessageContainer.style.gap = '8px';
                            userMessageContainer.style.marginBottom = '12px';
                            userMessageContainer.style.justifyContent = 'flex-end';

                            const userSpeakerBtn = document.createElement('button');
                            setButtonToSpeakerIcon(userSpeakerBtn);
                            userSpeakerBtn.setAttribute('data-text', question);
                            userSpeakerBtn.style.background = 'none';
                            userSpeakerBtn.style.border = 'none';
                            userSpeakerBtn.style.fontSize = '18px';
                            userSpeakerBtn.style.cursor = 'pointer';
                            userSpeakerBtn.style.padding = '0';
                            userSpeakerBtn.style.marginTop = '8px';
                            userSpeakerBtn.style.opacity = '0.5';
                            userSpeakerBtn.style.transition = 'opacity 0.2s';
                            
                            userSpeakerBtn.addEventListener('mouseover', () => userSpeakerBtn.style.opacity = '1');
                            userSpeakerBtn.addEventListener('mouseout', () => userSpeakerBtn.style.opacity = '0.5');
                            
                            userSpeakerBtn.addEventListener('click', (event) => {
                                const thisButton = event.currentTarget;

                                if (currentAudio && currentPlayingButton === thisButton) {
                                    currentAudio.stop();
                                    return;
                                }
                                const genderBtnUser = sidebar.querySelector('#vqa-tab .pill-button[data-gender].active');
                                const genderUser = genderBtnUser ? genderBtnUser.dataset.gender : 'female';
                                const textToSpeak = thisButton.getAttribute('data-text');
                                const audioUrl = thisButton.getAttribute('data-audio-url');

                                if (audioUrl) {
                                    playAudioFromDataUrl(audioUrl, thisButton);
                                } else if (textToSpeak) {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak,
                                        gender: genderUser
                                    }, (ttsResponse) => {
                                        if (ttsResponse && ttsResponse.success) {
                                            playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                                        } else {
                                            console.error('OpenAI TTS error:', ttsResponse?.error);
                                        }
                                    });
                                }
                            });

                            const userMessage = document.createElement('div');
                            userMessage.className = 'chat-message user-message';
                            userMessage.style.flex = '1';

                            const userTextSpan = document.createElement('span');
                            userTextSpan.tabIndex = 0;
                            userTextSpan.textContent = question;
                            userMessage.appendChild(userTextSpan);

                            userMessageContainer.appendChild(userSpeakerBtn);
                            userMessageContainer.appendChild(userMessage);
                            chatMessages.appendChild(userMessageContainer);

                            const genderBtnUser = sidebar.querySelector('#vqa-tab .pill-button[data-gender].active');
                            const genderUser = genderBtnUser ? genderBtnUser.dataset.gender : 'female';
                            preloadAndStoreAudio(question, userSpeakerBtn, genderUser);

                            chatInput.value = '';
                            chatInput.style.height = 'auto'; // Reset height

                            // Create AI message container with speaker button
                            const aiMessageContainer = document.createElement('div');
                            aiMessageContainer.style.display = 'flex';
                            aiMessageContainer.style.alignItems = 'flex-start';
                            aiMessageContainer.style.gap = '8px';
                            aiMessageContainer.style.marginBottom = '12px';

                            const aiMessage = document.createElement('div');
                            aiMessage.className = 'chat-message bot-message';
                            aiMessage.style.flex = '1';

                            const aiTextSpan = document.createElement('span');
                            aiTextSpan.tabIndex = 0;
                            aiTextSpan.textContent = 'Thinking...';
                            aiMessage.appendChild(aiTextSpan);

                            const speakerBtn = document.createElement('button');
                            setButtonToSpeakerIcon(speakerBtn);
                            speakerBtn.style.background = 'none';
                            speakerBtn.style.border = 'none';
                            speakerBtn.style.fontSize = '18px';
                            speakerBtn.style.cursor = 'pointer';
                            speakerBtn.style.padding = '0';
                            speakerBtn.style.marginTop = '8px';
                            speakerBtn.style.opacity = '0.5';
                            speakerBtn.style.transition = 'opacity 0.2s';
                            
                            speakerBtn.addEventListener('mouseover', () => speakerBtn.style.opacity = '1');
                            speakerBtn.addEventListener('mouseout', () => speakerBtn.style.opacity = '0.5');
                            
                            speakerBtn.addEventListener('click', (event) => {
                                const thisButton = event.currentTarget;

                                if (currentAudio && currentPlayingButton === thisButton) {
                                    currentAudio.stop();
                                    return;
                                }

                                const textToSpeak = aiTextSpan.textContent;
                                const audioUrl = thisButton.getAttribute('data-audio-url');
                                const genderBtnAI = sidebar.querySelector('#vqa-tab .pill-button[data-gender].active');
                                const genderAI = genderBtnAI ? genderBtnAI.dataset.gender : 'female';

                                if (audioUrl) {
                                    playAudioFromDataUrl(audioUrl, thisButton);
                                } else if (textToSpeak && textToSpeak !== 'Thinking...') {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak,
                                        gender: genderAI
                                    }, (ttsResponse) => {
                                        if (ttsResponse && ttsResponse.success) {
                                            playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton);
                                        } else {
                                            console.error('OpenAI TTS error:', ttsResponse?.error);
                                        }
                                    });
                                }
                            });

                            aiMessageContainer.appendChild(aiMessage);
                            aiMessageContainer.appendChild(speakerBtn);
                            chatMessages.appendChild(aiMessageContainer);

                            // Scroll to the bottom of the chat
                            chatMessages.scrollTop = chatMessages.scrollHeight;

                            const callGemini = async () => {
                                try {
                                    const youtubeUrl = window.location.href;
                                    const currentTime = video.currentTime;
                                    const timeWindow = parseInt(timeWindowSlider.value, 10);

                                    const frames = [];
                                    if (timeWindow > 0) {
                                        aiTextSpan.textContent = `Capturing frames for ±${timeWindow}s...`;
                                        const start = Math.max(0, currentTime - timeWindow);
                                        const end = Math.min(video.duration, currentTime + timeWindow);
                                        
                                        // Capture one frame per second
                                        for (let i = start; i <= end; i++) {
                                            try {
                                                console.log(`[VQA] Capturing frame at ${i}s`);
                                                const frameData = await captureVideoFrame(i);
                                                frames.push({
                                                    timestamp: i,
                                                    frameData: frameData
                                                });
                                            } catch (error) {
                                                console.error(`[VQA] Failed to capture frame at ${i}s:`, error);
                                            }
                                        }
                                        aiTextSpan.textContent = 'Thinking...';
                                    } else {
                                        // Capture only the current frame if timeWindow is 0
                                        const frameData = await captureVideoFrame(currentTime);
                                        frames.push({
                                            timestamp: currentTime,
                                            frameData: frameData
                                        });
                                    }

                                    if (frames.length === 0) {
                                        throw new Error("Could not capture any video frames.");
                                    }

                                    const formatTime = (seconds) => {
                                        const mins = Math.floor(seconds / 60);
                                        const secs = Math.floor(seconds % 60);
                                        return `${mins}:${secs.toString().padStart(2, '0')}`;
                                    };

                                    const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                                    const wordCount = vqaLengthSlider ? vqaLengthSlider.value : 20;

                                    const prompt = `User is watching a YouTube video at timestamp ${formatTime(currentTime)}.
User's question: "${question}"

Please analyze the video frames provided and answer their question about what's happening in the video. The frames are captured around the given timestamp. Please answer in approximately ${wordCount} words.`;

                                    console.log('Sending CALL_GEMINI message with frames to background script');
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_GEMINI_VQA_MULTIFRAME',
                                        prompt: prompt,
                                        frames: frames
                                    }, async (response) => {
                                        console.log('Received response from background:', response);
                                        if (response && response.success) {
                                            aiTextSpan.textContent = response.text;
                                            speakerBtn.setAttribute('data-text', response.text);
                                            speakerBtn.style.opacity = '1';
                                            
                                            // Save VQA to Firestore if user is logged in
                                            const user = window.FirebaseAPI?.getCurrentUser();
                                            if (user && window.DatabaseIntegration) {
                                                const videoUrl = window.location.href;
                                                // Capture all current settings as snapshot
                                                const customizations = {
                                                    // AD settings
                                                    adVolume: parseInt(sidebar.querySelector('#ad-volume-slider')?.value || 50),
                                                    adSpeed: parseInt(sidebar.querySelector('#ad-speed-slider')?.value || 50),
                                                    adGender: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active')?.dataset.gender || 'female',
                                                    adVoice: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-voice].active')?.dataset.voice || 'natural',
                                                    adLength: parseInt(sidebar.querySelector('#length-slider')?.value || 25),
                                                    // VQA settings
                                                    vqaVolume: parseInt(sidebar.querySelector('#vqa-volume-slider')?.value || 50),
                                                    vqaSpeed: parseInt(sidebar.querySelector('#vqa-speed-slider')?.value || 50),
                                                    vqaGender: sidebar.querySelector('#vqa-tab .pill-button[data-gender].active')?.dataset.gender || 'female',
                                                    vqaLength: parseInt(sidebar.querySelector('#time-window-slider')?.value || 25)
                                                };
                                                const messages = [
                                                    { role: 'user', content: question, timestamp: Date.now() },
                                                    { role: 'assistant', content: response.text, timestamp: Date.now() }
                                                ];
                                                
                                                await window.DatabaseIntegration.saveGeneratedVQA(videoUrl, video.duration, customizations, messages);
                                            }
                                            
                                            const genderBtnResp = sidebar.querySelector('.pill-button[data-gender].active');
                                            const genderResp = genderBtnResp ? genderBtnResp.dataset.gender : 'female';
                                            preloadAndStoreAudio(response.text, speakerBtn, genderResp);

                                            chrome.runtime.sendMessage({
                                                type: 'CALL_OPENAI_TTS',
                                                text: response.text,
                                                gender: genderResp
                                            }, (ttsResponse) => {
                                                if (ttsResponse && ttsResponse.success) {
                                                    playAudioFromDataUrl(ttsResponse.audioDataUrl, speakerBtn);
                                                } else {
                                                    console.error('OpenAI TTS error:', ttsResponse?.error);
                                                }
                                            });
                                        } else {
                                            aiTextSpan.textContent = `Error: ${response?.error || 'Unknown error occurred'}`;
                                            console.error('Gemini API error:', response?.error);
                                        }
                                    });
                                                                } catch (error) {
                                                                    console.error("Error calling Gemini API:", error);
                                                                    aiTextSpan.textContent = `Error: ${error.message}`;
                                                                }                            };

                            callGemini();
                        }
                    });
                }
                
                return true;
            }
        }
        return false;
    };

    const init = () => {
        newVideoLoaded();
    };

    // Initial load
    init();

    // Handle navigations in YouTube (which is a single-page app)
    document.addEventListener("yt-navigate-finish", () => {
        // Remove old sidebar if it exists
        const oldSidebar = document.getElementById("custom-qa-sidebar");
        if (oldSidebar) {
            oldSidebar.remove();
        }
        // Try to inject sidebar on new page
        init();
    });

    // Handle messages from the popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "GET_TIMESTAMP") {
            const video = document.querySelector('.html5-main-video');
            if (video) {
                sendResponse({ timestamp: video.currentTime });
            } else {
                sendResponse({ timestamp: null });
            }
        }
        return true; // Indicates that the response is sent asynchronously
    });
})();
