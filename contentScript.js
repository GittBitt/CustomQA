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
        let currentVideoUrl = null; // Track which video ADs belong to
        let lastAdPlayTime = 0; // Track when the last AD was triggered to prevent rapid re-triggers
        let isPlayingAd = false; // Semaphore to prevent simultaneous AD playback
        const MIN_AD_INTERVAL = 500; // Minimum 500ms between AD triggers (prevents scrubbing issues)
        
        // Helper function to detect if YouTube is showing an advertisement
        const isYouTubeAdPlaying = () => {
            // Only check for Skip Ad button which definitively indicates an ad is playing
            const skipAdButton = document.querySelector('.ytp-ad-skip-button');
            return skipAdButton && !skipAdButton.style.display?.includes('none') && skipAdButton.offsetParent !== null;
        };

        const playAudioFromDataUrl = async (dataUrl, buttonElement, onendedCallback = null, delayMs = 0) => {
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

                const playSound = () => {
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
                        isPlayingAd = false; // Reset AD playback semaphore
                        if (buttonElement) {
                            setButtonToSpeakerIcon(buttonElement);
                        }
                        // If this was the first AD and video was paused, resume it
                        if (window.shouldResumeAfterFirstAD && buttonElement?.id === 'ad-speaker-btn-loaded-0') {
                            console.log('[CustomQA] Resuming video after first AD finished');
                            window.shouldResumeAfterFirstAD = false;
                            if (video) {
                                video.play();
                            }
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
                };

                if (delayMs > 0) {
                    console.log('[CustomQA] Delaying audio playback by ' + delayMs + 'ms');
                    setTimeout(playSound, delayMs);
                } else {
                    playSound();
                }

                return null;
            } catch (error) {
                console.error('Error playing audio with Web Audio API:', error);
                isPlayingAd = false; // Reset semaphore on error
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
                                            adVolume: { integerValue: 100 },
                                            adSpeed: { integerValue: 50 },
                                            adGender: { stringValue: 'female' },
                                            adVoice: { stringValue: 'human' },
                                            adLength: { integerValue: 25 },
                                            adFrequency: { stringValue: 'sometimes' },
                                            adEmphasis: { stringValue: 'balanced' },
                                            adColorPreference: { stringValue: 'on' },
                                            adNarrationStyle: { stringValue: 'objective' },
                                            adPauseDuringAd: { booleanValue: true },
                                            vqaVolume: { integerValue: 100 },
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
                                    adVolume: parseInt(data.fields.adVolume?.integerValue || 100),
                                    adSpeed: parseInt(data.fields.adSpeed?.integerValue || 50),
                                    adGender: data.fields.adGender?.stringValue || 'female',
                                    adVoice: data.fields.adVoice?.stringValue || 'human',
                                    adLength: parseInt(data.fields.adLength?.integerValue || 25),
                                    adFrequency: data.fields.adFrequency?.stringValue || 'sometimes',
                                    adEmphasis: data.fields.adEmphasis?.stringValue || 'balanced',
                                    adColorPreference: data.fields.adColorPreference?.stringValue || 'on',
                                    adNarrationStyle: data.fields.adNarrationStyle?.stringValue || 'objective',
                                    adPauseDuringAd: data.fields.adPauseDuringAd?.booleanValue ?? true,
                                    // VQA settings
                                    vqaVolume: parseInt(data.fields.vqaVolume?.integerValue || 100),
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
                            
                            // Build updateMask to preserve other fields (email, etc)
                            const maskParams = new URLSearchParams();
                            maskParams.append('key', window.firebaseConfig.apiKey);
                            ['adVolume', 'adSpeed', 'adGender', 'adVoice', 'adLength', 'adFrequency',
                             'adEmphasis', 'adColorPreference', 'adNarrationStyle', 'adPauseDuringAd',
                             'vqaVolume', 'vqaSpeed', 'vqaGender', 'vqaLength', 'updatedAt'].forEach(field => {
                                maskParams.append('updateMask.fieldPaths', field);
                            });
                            
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/${docPath}?${maskParams.toString()}`,
                                {
                                    method: 'PATCH',
                                    headers: {
                                        'Authorization': `Bearer ${idToken_FBAuth}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        fields: {
                                            // AD settings
                                            adVolume: { integerValue: parseInt(settings.adVolume || 100) },
                                            adSpeed: { integerValue: parseInt(settings.adSpeed || 50) },
                                            adGender: { stringValue: settings.adGender || 'female' },
                                            adVoice: { stringValue: settings.adVoice || 'human' },
                                            adLength: { integerValue: parseInt(settings.adLength || 25) },
                                            adFrequency: { stringValue: settings.adFrequency || 'sometimes' },
                                            adEmphasis: { stringValue: settings.adEmphasis || 'balanced' },
                                            adColorPreference: { stringValue: settings.adColorPreference || 'on' },
                                            adNarrationStyle: { stringValue: settings.adNarrationStyle || 'objective' },
                                            adPauseDuringAd: { booleanValue: settings.adPauseDuringAd ?? true },
                                            // VQA settings
                                            vqaVolume: { integerValue: parseInt(settings.vqaVolume || 100) },
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
                        
                        // Helper to set active button by data attribute
                        const setActiveButton = (selector, attrName, attrValue) => {
                            if (!attrValue) return;
                            const buttons = sidebar.querySelectorAll(selector);
                            buttons.forEach(btn => {
                                const isActive = btn.dataset[attrName] === attrValue;
                                btn.classList.toggle('active', isActive);
                                btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
                            });
                        };

                        // === AD PRESENTATION CUSTOMIZATION ===
                        if (settings.adVolume) {
                            const volSlider = sidebar.querySelector('#ad-volume-slider');
                            if (volSlider) volSlider.value = settings.adVolume;
                        }
                        if (settings.adSpeed) {
                            const speedSlider = sidebar.querySelector('#ad-speed-slider');
                            if (speedSlider) speedSlider.value = settings.adSpeed;
                        }
                        if (settings.adVoice) {
                            setActiveButton('#audio-descriptions-tab .pill-button[data-voice]', 'voice', settings.adVoice);
                        }
                        if (settings.adGender) {
                            setActiveButton('#audio-descriptions-tab .pill-button[data-gender]', 'gender', settings.adGender);
                        }

                        // === AD CONTENT CUSTOMIZATION ===
                        if (settings.adLength) {
                            const lengthSlider = sidebar.querySelector('#length-slider');
                            if (lengthSlider) {
                                lengthSlider.value = settings.adLength;
                                const lengthValue = sidebar.querySelector('#length-value');
                                if (lengthValue) lengthValue.textContent = settings.adLength;
                            }
                        }
                        if (settings.adFrequency) {
                            setActiveButton('#audio-descriptions-tab .pill-button[data-frequency]', 'frequency', settings.adFrequency);
                        }
                        if (settings.adEmphasis) {
                            setActiveButton('#audio-descriptions-tab .pill-button[data-emphasis]', 'emphasis', settings.adEmphasis);
                        }
                        if (settings.adColorPreference) {
                            setActiveButton('#audio-descriptions-tab .pill-button[data-color]', 'color', settings.adColorPreference);
                        }
                        if (settings.adNarrationStyle) {
                            setActiveButton('#audio-descriptions-tab .pill-button[data-narration]', 'narration', settings.adNarrationStyle);
                        }

                        // === AD CUSTOMIZATION SETUPS ===
                        if (settings.adPauseDuringAd !== undefined) {
                            const pauseAction = settings.adPauseDuringAd ? 'pause-on' : 'pause-off';
                            setActiveButton('#pause-ad-group .pill-button', 'action', pauseAction);
                        }

                        // === VQA PRESENTATION CUSTOMIZATION ===
                        if (settings.vqaVolume) {
                            const vqaVolSlider = sidebar.querySelector('#vqa-volume-slider');
                            if (vqaVolSlider) vqaVolSlider.value = settings.vqaVolume;
                        }
                        if (settings.vqaSpeed) {
                            const vqaSpeedSlider = sidebar.querySelector('#vqa-speed-slider');
                            if (vqaSpeedSlider) vqaSpeedSlider.value = settings.vqaSpeed;
                        }
                        if (settings.vqaGender) {
                            setActiveButton('#vqa-tab .pill-button[data-gender]', 'gender', settings.vqaGender);
                        }

                        // === VQA CONTENT CUSTOMIZATION ===
                        if (settings.vqaLength) {
                            const vqaLenSlider = sidebar.querySelector('#vqa-length-slider');
                            if (vqaLenSlider) {
                                vqaLenSlider.value = settings.vqaLength;
                                const vqaLengthValue = sidebar.querySelector('#vqa-length-value');
                                if (vqaLengthValue) vqaLengthValue.textContent = settings.vqaLength;
                            }
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
                    },

                    async getMostRecentVideoSettings(currentVideoUrl) {
                        const user = currentUser_FBAuth;
                        if (!user || !idToken_FBAuth) return null;

                        try {
                            const currentVideoId = currentVideoUrl.split('v=')[1]?.split('&')[0] || '';
                            console.log('[CustomQA] Looking for most recent video settings (excluding:', currentVideoId, ')');

                            const videosPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${user.uid}/videos`;
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/${videosPath}?pageSize=100&key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'GET',
                                    headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                }
                            );

                            if (!response.ok) {
                                console.warn('[CustomQA] Failed to fetch videos list');
                                return null;
                            }

                            const data = await response.json();
                            const documents = data.documents || [];

                            let mostRecent = null;
                            let mostRecentTimestamp = 0;

                            for (const doc of documents) {
                                const docId = doc.name.split('/').pop();
                                if (docId === currentVideoId) continue;

                                const fields = doc.fields || {};
                                const createdAt = fields.createdAt?.timestampValue;
                                const updatedAt = fields.updatedAt?.timestampValue;
                                const timestamp = updatedAt || createdAt;

                                if (timestamp) {
                                    const timestampMs = new Date(timestamp).getTime();
                                    if (timestampMs > mostRecentTimestamp) {
                                        mostRecentTimestamp = timestampMs;
                                        const videoTitle = fields.videoTitle?.stringValue || 'Previous Video';
                                        
                                        const settings = {
                                            adVolume: fields.adVolume?.integerValue || 50,
                                            adSpeed: fields.adSpeed?.integerValue || 50,
                                            adGender: fields.adGender?.stringValue || 'female',
                                            adVoice: fields.adVoice?.stringValue || 'human',
                                            adLength: fields.adLength?.integerValue || 25,
                                            adFrequency: fields.adFrequency?.stringValue || 'sometimes',
                                            adEmphasis: fields.adEmphasis?.stringValue || 'balanced',
                                            adColorPreference: fields.adColorPreference?.stringValue || 'on',
                                            adNarration: fields.adNarration?.stringValue || 'objective',
                                            adPauseDuringAd: fields.adPauseDuringAd?.booleanValue !== false,
                                            adEnabled: fields.adEnabled?.booleanValue !== false
                                        };

                                        mostRecent = { settings, videoTitle };
                                    }
                                }
                            }

                            if (mostRecent) {
                                console.log('[CustomQA] Found most recent video settings:', mostRecent.videoTitle);
                                return mostRecent;
                            }

                            console.log('[CustomQA] No previous video settings found');
                            return null;

                        } catch (error) {
                            console.error('[CustomQA] Error getting most recent video settings:', error);
                            return null;
                        }
                    }
                };

                // Load persisted auth on init
                loadPersistedAuth();

                console.log('FirebaseAPI ready:', !!window.FirebaseAPI);

                // Plugin initialization: Verify logged-in user and their associated videos
                (async () => {
                    const user = window.FirebaseAPI?.getCurrentUser();
                    if (user) {
                        console.log('[CustomQA] User logged in:', {
                            uid: user.uid,
                            email: user.email,
                            role: user.role || 'guest'
                        });

                        // Try to load user settings to verify Firestore access
                        try {
                            const settings = await window.DatabaseIntegration?.loadUserSettings();
                            if (settings) {
                                console.log('[CustomQA] User settings loaded successfully');
                            } else {
                                console.warn('[CustomQA] ⚠ User settings not found or empty');
                            }
                        } catch (e) {
                            console.error('[CustomQA] Error loading user settings:', e?.message);
                        }
                    } else {
                        console.log('[CustomQA] No user logged in - user must login to see generated content');
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
                    // Initialize currentVideoUrl when the video loads
                    const previousVideoUrl = currentVideoUrl;
                    currentVideoUrl = videoUrl;
                    
                    // Clear adSchedule if switching to a different video
                    if (previousVideoUrl && previousVideoUrl !== videoUrl) {
                        adSchedule = [];
                        adScheduleVideoUrl = null;
                        console.log('[CustomQA] Video changed, cleared adSchedule');
                    }
                    
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
                            // If loading ADs for a different video, clear cache
                            if (currentVideoUrl !== videoUrl) {
                                console.log('[CustomQA] Video changed, clearing cache');
                                clearAudioCache();
                                currentVideoUrl = videoUrl;
                            }
                            console.log('[CustomQA] Displaying', previousAD.generatedAds.length, 'AD(s)');
                            
                            // Restore settings that were used when this AD was generated
                            if (previousAD.customizations) {
                                window.DatabaseIntegration.restoreSettingsToUI(sidebar, previousAD.customizations);
                            }
                            
                            // Display the ADs with full UI (speaker buttons, etc)
                            const adMessages = sidebar.querySelector('#ad-messages');
                            console.log('[CustomQA] AD container found:', !!adMessages);
                            
                            if (adMessages) {
                                adMessages.innerHTML = '';
                                
                                // Auto-pause from start if Pause During AD is ON
                                const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                if (pauseAdButton && video) {
                                    console.log('[CustomQA] Auto-pausing from start for first AD (loaded)');
                                    video.currentTime = 0;
                                    video.pause();
                                    window.shouldResumeAfterFirstAD = true;
                                }
                                
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
                                    speakerBtn.setAttribute('data-timestamp', currentTs);
                                    speakerBtn.setAttribute('data-video-url', currentVideoUrl || videoUrl);
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
                                        
                                        // Skip if YouTube ad is playing
                                        if (isYouTubeAdPlaying()) {
                                            console.log('[CustomQA] Cannot play during YouTube ad');
                                            return;
                                        }
                                        
                                        const buttonVideoUrl = thisButton.getAttribute('data-video-url');
                                        
                                        // Only play if this AD belongs to the current video
                                        if (buttonVideoUrl && buttonVideoUrl !== window.location.href) {
                                            console.log('[CustomQA] Cannot play AD from different video');
                                            return;
                                        }
                                        
                                        if (currentAudio && currentPlayingButton === thisButton) {
                                            currentAudio.stop();
                                            return;
                                        }
                                        
                                        const textToSpeak = thisButton.getAttribute('data-text');
                                        const adTimestamp = parseFloat(thisButton.getAttribute('data-timestamp')) || 0;
                                        const videoTime = video?.currentTime || 0;
                                        const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                        const isPauseOn = pauseAdButton !== null;
                                        
                                        let delayMs = 0;
                                        if (isPauseOn) {
                                            // Pause is ON: 1 second delay before audio
                                            delayMs = 1000;
                                        } else {
                                            // Pause is OFF: play audio 5 seconds before the AD timestamp
                                            const timeUntilAd = (adTimestamp - videoTime) * 1000; // Convert to ms
                                            delayMs = Math.max(0, timeUntilAd - 5000); // Play 5s before
                                        }
                                        
                                        chrome.runtime.sendMessage({
                                            type: 'CALL_OPENAI_TTS',
                                            text: textToSpeak,
                                            gender: gender
                                        }, (ttsResponse) => {
                                            if (ttsResponse && ttsResponse.success) {
                                                playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton, null, delayMs);
                                            } else {
                                                console.error('OpenAI TTS error:', ttsResponse?.error);
                                            }
                                        });
                                    });
                                    
                                    messageContainer.appendChild(bubble);
                                    messageContainer.appendChild(speakerBtn);
                                    adMessages.appendChild(messageContainer);
                                });
                                console.log('[CustomQA] AD bubbles displayed');
                                
                                // Populate adSchedule with loaded ADs for timeupdate auto-play
                                adSchedule = descriptions.map((desc, index) => ({
                                    timestamp: desc.timestamp_in_seconds,
                                    description: desc.description,
                                    played: true, // Mark all previously loaded ADs as already played to avoid auto-playing old content
                                    buttonId: `ad-speaker-btn-loaded-${index}`
                                }));
                                adScheduleVideoUrl = videoUrl; // Track video for this schedule
                                console.log('[CustomQA] AD schedule populated with', adSchedule.length, 'ADs (marked as played for returning visits)');
                                
                                // Auto-preload all previously loaded AD audio
                                setTimeout(() => {
                                    console.log('[CustomQA] Preloading all previously loaded AD audio...');
                                    const genderBtn = sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active');
                                    const gender = genderBtn ? genderBtn.dataset.gender : 'female';
                                    
                                    const allAdButtons = sidebar.querySelectorAll('#ad-messages [id$="-loaded-"] button[data-text]');
                                    allAdButtons.forEach(btn => {
                                        const text = btn.getAttribute('data-text');
                                        if (text && !preloadedAudioMap.has(text)) {
                                            preloadAndStoreAudio(text, btn, gender);
                                        }
                                    });
                                }, 100);
                                
                                // Auto-play first AD if Audio Description toggle is ON (only in AD tab)
                                setTimeout(() => {
                                    const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                                    // Only auto-play in AD tab, not in VQA tab
                                    if (activeTab && activeTab.id !== 'audio-descriptions-tab') {
                                        console.log('[CustomQA] Not in AD tab, skipping auto-play');
                                        return;
                                    }
                                    
                                    // Find the Audio Description toggle buttons in CUSTOMIZATION SETUPS
                                    const allButtonGroups = sidebar.querySelectorAll('.button-group');
                                    let adToggleGroup = null;
                                    
                                    allButtonGroups.forEach(group => {
                                        const label = group.parentElement?.querySelector('.subsection-title');
                                        if (label && label.textContent.includes('Audio Description')) {
                                            adToggleGroup = group;
                                        }
                                    });
                                    
                                    if (adToggleGroup) {
                                        const onButton = Array.from(adToggleGroup.querySelectorAll('.pill-button')).find(b => b.textContent.trim() === 'ON');
                                        if (onButton?.classList.contains('active')) {
                                            const firstSpeaker = sidebar.querySelector('#ad-speaker-btn-loaded-0');
                                            if (firstSpeaker) {
                                                console.log('[CustomQA] Auto-playing first AD...');
                                                // Check if Pause During AD is ON
                                                const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                                if (pauseAdButton) {
                                                    console.log('[CustomQA] Pausing video for first AD...');
                                                    video.pause();
                                                    // Set flag to resume after first AD finishes
                                                    window.shouldResumeAfterFirstAD = true;
                                                }
                                                firstSpeaker.click();
                                            }
                                        }
                                    }
                                }, 300);
                            } else {
                                console.warn('[CustomQA] AD container not found - cannot display preloaded ads');
                            }
                        } else {
                            console.log('[CustomQA] No previous ADs found for this video');
                        }
                    } catch (adError) {
                        console.error('[CustomQA] Error loading ADs:', adError);
                    }
                    
                    // Load previous VQA for this video
                    try {
                        const previousVQA = await window.DatabaseIntegration.loadGeneratedVQA(videoUrl);
                        console.log('[CustomQA] VQA Load Result:', previousVQA ? 'SUCCESS' : 'NO DATA', previousVQA);
                        
                        if (previousVQA && previousVQA.messages && previousVQA.messages.length > 0) {
                            hasExistingVQA = true;
                            console.log('[CustomQA] Displaying', previousVQA.messages.length, 'VQA message(s)');
                            
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
                                    const userMessageContainer = document.createElement('div');
                                    userMessageContainer.style.display = 'flex';
                                    userMessageContainer.style.alignItems = 'flex-start';
                                    userMessageContainer.style.gap = '8px';
                                    userMessageContainer.style.marginBottom = '12px';
                                    userMessageContainer.style.justifyContent = 'flex-end';
                                    
                                    const message = document.createElement('div');
                                    message.className = 'chat-message user-message';
                                    message.style.flex = '1';
                                    message.textContent = q.content || q.text || '';
                                    
                                    const userSpeakerBtn = document.createElement('button');
                                    setButtonToSpeakerIcon(userSpeakerBtn);
                                    userSpeakerBtn.setAttribute('data-text', q.content || q.text || '');
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
                                        
                                        // Skip if YouTube ad is playing (to prevent audio conflicts)
                                        if (isYouTubeAdPlaying()) {
                                            console.log('[CustomQA] Cannot play during YouTube ad');
                                            return;
                                        }
                                        
                                        if (currentAudio && currentPlayingButton === thisButton) {
                                            currentAudio.stop();
                                            return;
                                        }
                                        const genderBtn = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                                        const gender = genderBtn ? genderBtn.dataset.gender : 'female';
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
                                    
                                    userMessageContainer.appendChild(message);
                                    userMessageContainer.appendChild(userSpeakerBtn);
                                    vqaMessages.appendChild(userMessageContainer);
                                });
                                
                                // Display answers next (gray bubbles)
                                answers.forEach(a => {
                                    const aiMessageContainer = document.createElement('div');
                                    aiMessageContainer.style.display = 'flex';
                                    aiMessageContainer.style.alignItems = 'flex-start';
                                    aiMessageContainer.style.gap = '8px';
                                    aiMessageContainer.style.marginBottom = '12px';
                                    
                                    const message = document.createElement('div');
                                    message.className = 'chat-message bot-message';
                                    message.style.flex = '1';
                                    message.textContent = a.content || a.text || '';
                                    
                                    const answerSpeakerBtn = document.createElement('button');
                                    setButtonToSpeakerIcon(answerSpeakerBtn);
                                    answerSpeakerBtn.setAttribute('data-text', a.content || a.text || '');
                                    answerSpeakerBtn.style.background = 'none';
                                    answerSpeakerBtn.style.border = 'none';
                                    answerSpeakerBtn.style.fontSize = '18px';
                                    answerSpeakerBtn.style.cursor = 'pointer';
                                    answerSpeakerBtn.style.padding = '0';
                                    answerSpeakerBtn.style.marginTop = '8px';
                                    answerSpeakerBtn.style.opacity = '0.5';
                                    answerSpeakerBtn.style.transition = 'opacity 0.2s';
                                    
                                    answerSpeakerBtn.addEventListener('mouseover', () => answerSpeakerBtn.style.opacity = '1');
                                    answerSpeakerBtn.addEventListener('mouseout', () => answerSpeakerBtn.style.opacity = '0.5');
                                    
                                    answerSpeakerBtn.addEventListener('click', (event) => {
                                        const thisButton = event.currentTarget;
                                        
                                        // Skip if YouTube ad is playing (to prevent audio conflicts)
                                        if (isYouTubeAdPlaying()) {
                                            console.log('[CustomQA] Cannot play during YouTube ad');
                                            return;
                                        }
                                        
                                        if (currentAudio && currentPlayingButton === thisButton) {
                                            currentAudio.stop();
                                            return;
                                        }
                                        const genderBtn = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                                        const gender = genderBtn ? genderBtn.dataset.gender : 'female';
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
                                    
                                    aiMessageContainer.appendChild(message);
                                    aiMessageContainer.appendChild(answerSpeakerBtn);
                                    vqaMessages.appendChild(aiMessageContainer);
                                });
                                
                                console.log('[CustomQA] VQA display complete - Questions:', questions.length, 'Answers:', answers.length);
                                
                                // Auto-preload all displayed VQA audio
                                setTimeout(() => {
                                    console.log('[CustomQA] Preloading all previously loaded VQA audio...');
                                    const genderBtn = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                                    const gender = genderBtn ? genderBtn.dataset.gender : 'female';
                                    
                                    const allVqaButtons = sidebar.querySelectorAll('.vqa-sub-tab-content [role="tabpanel"] button[data-text]');
                                    allVqaButtons.forEach(btn => {
                                        const text = btn.getAttribute('data-text');
                                        if (text && !preloadedAudioMap.has(text)) {
                                            preloadAndStoreAudio(text, btn, gender);
                                        }
                                    });
                                }, 100);
                            } else {
                                console.warn('[CustomQA] VQA container not found - cannot display previous questions');
                            }
                        } else {
                            console.log('[CustomQA] No previous VQAs found for this video');
                        }
                    } catch (vqaError) {
                        console.error('[CustomQA] Error loading VQAs:', vqaError);
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

                // AD settings are now auto-captured on generation - no save button needed

                // VQA settings are now synced automatically - no need for save button

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

                // Helper function to get ALL current settings from a tab
                const getAllSettings = (tab) => {
                    const isADTab = tab.id === 'audio-descriptions-tab';
                    const settings = {};
                    
                    if (isADTab) {
                        // === AD PRESENTATION CUSTOMIZATION ===
                        const volumeSlider = tab.querySelector('#ad-volume-slider');
                        const speedSlider = tab.querySelector('#ad-speed-slider');
                        const genderBtn = tab.querySelector('.pill-button[data-gender].active');
                        const voiceBtn = tab.querySelector('.pill-button[data-voice].active');
                        
                        settings.adVolume = volumeSlider ? parseInt(volumeSlider.value) : 50;
                        settings.adSpeed = speedSlider ? parseInt(speedSlider.value) : 50;
                        settings.adGender = genderBtn ? genderBtn.dataset.gender : 'female';
                        settings.adVoice = voiceBtn ? voiceBtn.dataset.voice : 'human';

                        // === AD CONTENT CUSTOMIZATION ===
                        const lengthSlider = tab.querySelector('#length-slider');
                        const frequencyBtn = tab.querySelector('.pill-button[data-frequency].active');
                        const emphasisBtn = tab.querySelector('.pill-button[data-emphasis].active');
                        const colorBtn = tab.querySelector('.pill-button[data-color].active');
                        const narrationBtn = tab.querySelector('.pill-button[data-narration].active');
                        
                        settings.adLength = lengthSlider ? parseInt(lengthSlider.value) : 25;
                        settings.adFrequency = frequencyBtn ? frequencyBtn.dataset.frequency : 'sometimes';
                        settings.adEmphasis = emphasisBtn ? emphasisBtn.dataset.emphasis : 'balanced';
                        settings.adColorPreference = colorBtn ? colorBtn.dataset.color : 'on';
                        settings.adNarrationStyle = narrationBtn ? narrationBtn.dataset.narration : 'objective';

                        // === AD CUSTOMIZATION SETUPS ===
                        const pauseBtn = tab.querySelector('#pause-ad-group .pill-button.active');
                        settings.adPauseDuringAd = pauseBtn ? pauseBtn.dataset.action === 'pause-on' : true;
                    } else {
                        // === VQA PRESENTATION CUSTOMIZATION ===
                        const volumeSlider = tab.querySelector('#vqa-volume-slider');
                        const speedSlider = tab.querySelector('#vqa-speed-slider');
                        const genderBtn = tab.querySelector('#vqa-tab .pill-button[data-gender].active');
                        
                        settings.vqaVolume = volumeSlider ? parseInt(volumeSlider.value) : 100;
                        settings.vqaSpeed = speedSlider ? parseInt(speedSlider.value) : 50;
                        settings.vqaGender = genderBtn ? genderBtn.dataset.gender : 'female';

                        // === VQA CONTENT CUSTOMIZATION ===
                        const lengthSlider = tab.querySelector('#vqa-length-slider');
                        settings.vqaLength = lengthSlider ? parseInt(lengthSlider.value) : 25;
                    }
                    
                    return settings;
                };

                // Helper function to save ALL settings to Firestore
                const saveAllSettings = async (tab) => {
                    if (!tab) {
                        console.warn('[CustomQA] No active tab provided to saveAllSettings');
                        return;
                    }
                    
                    const settings = getAllSettings(tab);
                    const isADTab = tab.id === 'audio-descriptions-tab';
                    
                    try {
                        console.log('[CustomQA] Attempting to save settings:', { isADTab, settings });
                        if (isADTab) {
                            const result = await window.DatabaseIntegration?.saveADSettings(settings);
                            if (!result?.success) {
                                console.error('[CustomQA] Failed to save AD settings:', result);
                            }
                        } else {
                            const result = await window.DatabaseIntegration?.saveVQASettings(settings);
                            if (!result?.success) {
                                console.error('[CustomQA] Failed to save VQA settings:', result);
                            }
                        }
                    } catch (error) {
                        console.error('[CustomQA] Error in saveAllSettings:', error);
                    }
                };

                // Helper function to completely clear audio cache and remove attributes
                const clearAudioCache = () => {
                    console.log('[CustomQA] Clearing audio cache');
                    preloadedAudioMap.clear();
                    // Also remove data-audio-url attributes from all buttons
                    const allButtons = sidebar.querySelectorAll('button[data-audio-url]');
                    allButtons.forEach(btn => btn.removeAttribute('data-audio-url'));
                };

                // Function to preload all visible audio when settings change
                const preloadAllVisibleAudio = () => {
                    // Get current gender setting
                    const genderBtnAD = sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active');
                    const genderBtnVQA = sidebar.querySelector('#vqa-gender-group .pill-button[data-gender].active');
                    const genderAD = genderBtnAD ? genderBtnAD.dataset.gender : 'female';
                    const genderVQA = genderBtnVQA ? genderBtnVQA.dataset.gender : 'female';
                    
                    // Preload AD audio
                    const adSpeakerButtons = sidebar.querySelectorAll('#ad-messages [id^="ad-speaker-btn"]');
                    adSpeakerButtons.forEach(btn => {
                        const text = btn.getAttribute('data-text');
                        if (text) {
                            // Always preload (don't check for existing data-audio-url)
                            console.log('[CustomQA] Preloading AD audio for:', text.substring(0, 30) + '...');
                            preloadAndStoreAudio(text, btn, genderAD);
                        }
                    });
                    
                    // Preload VQA audio (both questions and answers)
                    const vqaSpeakerButtons = sidebar.querySelectorAll('#chat-tab [role="tabpanel"] button[data-text]');
                    vqaSpeakerButtons.forEach(btn => {
                        const text = btn.getAttribute('data-text');
                        if (text) {
                            // Always preload (don't check for existing data-audio-url)
                            console.log('[CustomQA] Preloading VQA audio for:', text.substring(0, 30) + '...');
                            preloadAndStoreAudio(text, btn, genderVQA);
                        }
                    });
                    
                    console.log('[CustomQA] Preloading all visible audio...');
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
                    // Update currentVolume for immediate playback changes
                    currentVolume = parseFloat(newVolume) / 100;
                    console.log('[CustomQA] Volume updated to:', currentVolume);
                    
                    // Clear preloaded audio cache and regenerate with new volume
                    clearAudioCache();
                    
                    // Save all settings when volume changes
                    const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                    if (activeTab) {
                        saveAllSettings(activeTab);
                        // Preload all audio with new settings after a brief delay
                        setTimeout(() => {
                            preloadAllVisibleAudio();
                        }, 50);
                    }
                };

                if (adVolumeSlider) {
                    adVolumeSlider.addEventListener('input', volumeChangeHandler);
                    adVolumeSlider.addEventListener('input', preloadAllVisibleAudio);
                }
                if (vqaVolumeSlider) {
                    vqaVolumeSlider.addEventListener('input', volumeChangeHandler);
                    vqaVolumeSlider.addEventListener('input', preloadAllVisibleAudio);
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
                        // Clear preloaded audio cache when length changes
                        console.log('[CustomQA] Clearing audio cache for length change');
                        preloadedAudioMap.clear();
                        // Save settings when length changes
                        const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                        if (activeTab) {
                            saveAllSettings(activeTab);
                            // Preload all audio with new settings after a brief delay
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);
                        }
                    });
                }
                if (vqaLengthSlider) {
                    vqaLengthSlider.addEventListener('input', (e) => {
                        syncLengthSliders(e.target);
                        // Clear preloaded audio cache when length changes
                        console.log('[CustomQA] Clearing audio cache for length change');
                        preloadedAudioMap.clear();
                        // Save settings when length changes
                        const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                        if (activeTab) {
                            saveAllSettings(activeTab);
                            // Preload all audio with new settings after a brief delay
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);
                        }
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
                        
                        // Clear preloaded audio cache and regenerate with new speed
                        console.log('[CustomQA] Clearing audio cache for speed change');
                        preloadedAudioMap.clear();
                        
                        // Save all settings when speed changes
                        const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                        if (activeTab) {
                            saveAllSettings(activeTab);
                            // Preload all audio with new settings after a brief delay
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);
                        }
                    });
                }
                if (vqaSpeedSlider) {
                    vqaSpeedSlider.addEventListener('input', (e) => {
                        syncSpeedSliders(e.target);
                        
                        // Clear preloaded audio cache and regenerate with new speed
                        console.log('[CustomQA] Clearing audio cache for speed change');
                        preloadedAudioMap.clear();
                        
                        // Save all settings when speed changes
                        const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                        if (activeTab) {
                            saveAllSettings(activeTab);
                            // Preload all audio with new settings after a brief delay
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);
                        }
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
                            // When gender changes, immediately clear cache and preload with new gender
                            console.log('[CustomQA] Gender changed - clearing preloaded audio');
                            clearAudioCache(); // Clear cache so audio regenerates with new gender
                            preloadAllVisibleAudio();
                            // Save all settings when gender changes
                            if (activeTab) {
                                saveAllSettings(activeTab);
                            }
                        }
                        
                        // Handle Audio Description toggle - stop playback if OFF is selected
                        const label = subsectionTitleElement?.textContent.trim();
                        if (label?.includes('Audio Description')) {
                            if (button.textContent.trim() === 'OFF' && button.classList.contains('active')) {
                                // User chose OFF - stop current audio
                                if (currentAudio) {
                                    console.log('[CustomQA] Audio Description OFF - stopping playback');
                                    try {
                                        currentAudio.stop();
                                    } catch (e) {
                                        console.log('[CustomQA] Audio already stopped');
                                    }
                                    currentAudio = null;
                                    if (currentPlayingButton) {
                                        setButtonToSpeakerIcon(currentPlayingButton);
                                        currentPlayingButton = null;
                                    }
                                }
                            }
                        }
                        
                        // Save settings for ANY pill button click (frequency, emphasis, color, narration, pause, etc.)
                        // Automatically save when any setting changes
                        const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                        if (activeTab && (button.dataset.frequency || button.dataset.emphasis || button.dataset.color || button.dataset.narration || button.dataset.action)) {
                            console.log('[CustomQA] Setting changed:', button.dataset);
                            // Clear preloaded audio cache for content customization changes
                            clearAudioCache();
                            saveAllSettings(activeTab);
                            // Preload all audio with new settings after a brief delay
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);
                        }
                    }
                });

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
                            
                            // Auto-play what the user just said
                            setTimeout(() => {
                                const chatInput = sidebar.querySelector('.chat-input');
                                const textToSpeak = chatInput.value;
                                const genderBtn = sidebar.querySelector('#vqa-gender-group .pill-button.active');
                                const gender = genderBtn ? genderBtn.dataset.gender : 'female';
                                
                                if (textToSpeak && textToSpeak.trim()) {
                                    console.log('[CustomQA] Auto-playing recorded question...');
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak,
                                        gender: gender
                                    }, (ttsResponse) => {
                                        if (ttsResponse && ttsResponse.success) {
                                            // Use chat speaker button instead of mic button for playback
                                            playAudioFromDataUrl(ttsResponse.audioDataUrl, chatSpeakerButton);
                                        } else {
                                            console.error('OpenAI TTS error:', ttsResponse?.error);
                                        }
                                    });
                                }
                            }, 200);
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
                    
                    // Skip if YouTube ad is playing (to prevent audio conflicts)
                    if (isYouTubeAdPlaying()) {
                        console.log('[CustomQA] Cannot play during YouTube ad');
                        return;
                    }

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
                let adScheduleVideoUrl = null; // Track which video the adSchedule belongs to

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
                        // Save current customization settings to user document
                        const user = window.FirebaseAPI?.getCurrentUser();
                        if (user && window.FirebaseAPI) {
                            const currentSettings = {
                                adVolume: parseInt(sidebar.querySelector('#ad-volume-slider')?.value || 100),
                                adSpeed: parseInt(sidebar.querySelector('#ad-speed-slider')?.value || 50),
                                adGender: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active')?.dataset.gender || 'female',
                                adVoice: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-voice].active')?.dataset.voice || 'human',
                                adLength: parseInt(sidebar.querySelector('#length-slider')?.value || 25),
                                adFrequency: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-frequency].active')?.dataset.frequency || 'sometimes',
                                adEmphasis: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-emphasis].active')?.dataset.emphasis || 'balanced',
                                adColorPreference: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-color].active')?.dataset.color || 'on',
                                adNarration: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-narration].active')?.dataset.narration || 'objective',
                                adPauseDuringAd: sidebar.querySelector('#pause-ad-group .pill-button.active')?.dataset.action === 'pause-on'
                            };
                            await window.FirebaseAPI.saveSettings(user.uid, currentSettings);
                            console.log('[CustomQA] Settings saved on generate');
                        }
                        // Clear previous ADs immediately
                        adSchedule = [];
                        adScheduleVideoUrl = null; // Clear video context when generating new ADs
                        const adMessages = sidebar.querySelector('#ad-messages');
                        if (adMessages) {
                            adMessages.innerHTML = '';
                        }
                        // Clear preloaded audio for old ADs
                        clearAudioCache();
                        // Stop any currently playing audio
                        if (currentAudio) {
                            currentAudio.stop();
                            currentAudio = null;
                            if (currentPlayingButton) {
                                setButtonToSpeakerIcon(currentPlayingButton);
                                currentPlayingButton = null;
                            }
                        }
                        
                        // Update current video URL
                        
                        // Update current video URL
                        currentVideoUrl = window.location.href;
                        
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
                                // Strip markdown and parse - more robust cleanup
                                let jsonString = response.text.trim();
                                // Remove markdown code blocks
                                jsonString = jsonString.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
                                jsonString = jsonString.trim();
                                const adData = JSON.parse(jsonString);
                                
                                let descriptions = [];
                                if (adData.VideoMetadata && adData.VideoMetadata.audio_descriptions) {
                                    descriptions = adData.VideoMetadata.audio_descriptions;
                                } else if (adData.audio_descriptions) {
                                    descriptions = adData.audio_descriptions;
                                } else if (adData.VideoMetadata && adData.VideoMetadata.AudioDescriptions) {
                                    descriptions = adData.VideoMetadata.AudioDescriptions;
                                }

                                adSchedule = descriptions.map((desc, index) => ({
                                    timestamp: (desc.timestamp_ms || desc.timestamp_in_seconds * 1000) / 1000,
                                    description: desc.description,
                                    played: false,
                                    buttonId: `ad-speaker-btn-${index}`
                                }));
                                adScheduleVideoUrl = window.location.href; // Track video for this schedule

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
                                    
                                    // Auto-pause from start if Pause During AD is ON
                                    const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                    if (pauseAdButton && video) {
                                        console.log('[CustomQA] Auto-pausing from start for first AD');
                                        video.currentTime = 0;
                                        video.pause();
                                        window.shouldResumeAfterFirstAD = true;
                                    }
                                    
                                    displayAdBubbles(adSchedule);
                                    
                                    // Save generated ADs to Firestore if user is logged in
                                    const user = window.FirebaseAPI?.getCurrentUser();
                                    if (user && window.DatabaseIntegration) {
                                        const videoUrl = window.location.href;
                                        // Capture all current user settings as snapshot
                                        const customizations = {
                                            // AD settings
                                            adVolume: parseInt(sidebar.querySelector('#ad-volume-slider')?.value || 100),
                                            adSpeed: parseInt(sidebar.querySelector('#ad-speed-slider')?.value || 50),
                                            adGender: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active')?.dataset.gender || 'female',
                                            adVoice: sidebar.querySelector('#audio-descriptions-tab .pill-button[data-voice].active')?.dataset.voice || 'human',
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
                                    // Wait for seek to complete, then check pause setting
                                    const handleSeeked = () => {
                                        video.removeEventListener('seeked', handleSeeked);
                                        console.log('[AD] Video seeked to start.');
                                        // Check if Pause During AD is ON
                                        const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                        if (pauseAdButton) {
                                            console.log('[AD] Pausing video for generated AD...');
                                            video.pause();
                                            window.shouldResumeAfterFirstAD = true;
                                        } else {
                                            console.log('[AD] Playing video...');
                                            video.play();
                                        }
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

                const restoreSettingsButton = sidebar.querySelector('#restore-settings-button');
                if (restoreSettingsButton) {
                    // Define default settings to use when no previous settings found
                    const DEFAULT_SETTINGS = {
                        // AD Presentation Customization
                        adVolume: 100,
                        adSpeed: 50,
                        adVoice: 'human',
                        adGender: 'female',
                        // AD Content Customization
                        adLength: 25,
                        adFrequency: 'sometimes',
                        adEmphasis: 'balanced',
                        adColorPreference: 'on',
                        adNarrationStyle: 'objective',
                        // AD Customization Setups
                        adPauseDuringAd: true,
                        // VQA Presentation Customization
                        vqaVolume: 100,
                        vqaSpeed: 50,
                        vqaVoice: 'human',
                        vqaGender: 'female',
                        // VQA Content Customization
                        vqaLength: 25
                    };

                    restoreSettingsButton.addEventListener('click', async () => {
                        try {
                            const user = window.FirebaseAPI?.getCurrentUser();
                            if (!user || !window.DatabaseIntegration) {
                                console.log('[CustomQA] Restore Settings: Not logged in or database not available');
                                return;
                            }

                            restoreSettingsButton.disabled = true;
                            restoreSettingsButton.textContent = 'Searching...';

                            const result = await window.DatabaseIntegration.getMostRecentVideoSettings(window.location.href);
                            
                            // Use default settings if no previous settings found
                            let settings = DEFAULT_SETTINGS;
                            let videoTitle = 'Default Settings';
                            
                            if (result && result.settings) {
                                settings = result.settings;
                                videoTitle = result.videoTitle || 'Previous Video';
                                console.log('[CustomQA] Restoring settings from:', videoTitle);
                            } else {
                                console.log('[CustomQA] No previous video settings found, applying default settings');
                            }

                            // Restore presentation customization
                            const adSliders = {
                                volume: sidebar.querySelector('#ad-volume-slider'),
                                speed: sidebar.querySelector('#ad-speed-slider'),
                                length: sidebar.querySelector('#length-slider')
                            };

                            if (settings.adVolume && adSliders.volume) adSliders.volume.value = settings.adVolume;
                            if (settings.adSpeed && adSliders.speed) adSliders.speed.value = settings.adSpeed;
                            if (settings.adLength && adSliders.length) adSliders.length.value = settings.adLength;

                            const setButtonByDataAttr = (selector, attrName, attrValue) => {
                                const buttons = sidebar.querySelectorAll(selector);
                                buttons.forEach(btn => {
                                    if (btn.dataset[attrName] === attrValue) {
                                        btn.classList.add('active');
                                        btn.setAttribute('aria-pressed', 'true');
                                    } else {
                                        btn.classList.remove('active');
                                        btn.setAttribute('aria-pressed', 'false');
                                    }
                                });
                            };

                            // Restore Gender and Voice
                            if (settings.adGender) {
                                setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-gender]', 'gender', settings.adGender);
                            }
                            if (settings.adVoice) {
                                setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-voice]', 'voice', settings.adVoice);
                            }

                            // Restore content customization
                            if (settings.adFrequency) {
                                setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-frequency]', 'frequency', settings.adFrequency);
                            }
                            if (settings.adEmphasis) {
                                setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-emphasis]', 'emphasis', settings.adEmphasis);
                            }
                            if (settings.adColorPreference) {
                                setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-color]', 'color', settings.adColorPreference);
                            }
                            if (settings.adNarration) {
                                setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-narration]', 'narration', settings.adNarration);
                            }

                            // Restore customization setups
                            if (settings.adPauseDuringAd !== undefined) {
                                const pauseAction = settings.adPauseDuringAd ? 'pause-on' : 'pause-off';
                                setButtonByDataAttr('#pause-ad-group .pill-button', 'action', pauseAction);
                            }

                            // Restore Audio Description ON/OFF status if available
                            if (settings.adEnabled !== undefined) {
                                const adToggleButtons = sidebar.querySelectorAll('#audio-descriptions-tab > .section:nth-child(3) .button-group .pill-button');
                                if (adToggleButtons.length >= 2) {
                                    const onBtn = adToggleButtons[0];
                                    const offBtn = adToggleButtons[1];
                                    if (settings.adEnabled) {
                                        onBtn.classList.add('active');
                                        onBtn.setAttribute('aria-pressed', 'true');
                                        offBtn.classList.remove('active');
                                        offBtn.setAttribute('aria-pressed', 'false');
                                    } else {
                                        offBtn.classList.add('active');
                                        offBtn.setAttribute('aria-pressed', 'true');
                                        onBtn.classList.remove('active');
                                        onBtn.setAttribute('aria-pressed', 'false');
                                    }
                                }
                            }

                            // Restore VQA presentation customization
                            const vqaSliders = {
                                volume: sidebar.querySelector('#vqa-volume-slider'),
                                speed: sidebar.querySelector('#vqa-speed-slider'),
                                length: sidebar.querySelector('#vqa-length-slider')
                            };

                            if (settings.vqaVolume !== undefined && vqaSliders.volume) vqaSliders.volume.value = settings.vqaVolume;
                            if (settings.vqaSpeed !== undefined && vqaSliders.speed) vqaSliders.speed.value = settings.vqaSpeed;
                            if (settings.vqaLength !== undefined && vqaSliders.length) {
                                vqaSliders.length.value = settings.vqaLength;
                                const vqaLengthValue = sidebar.querySelector('#vqa-length-value');
                                if (vqaLengthValue) vqaLengthValue.textContent = settings.vqaLength;
                            }

                            // Restore VQA Gender and Voice if available
                            if (settings.vqaGender) {
                                setButtonByDataAttr('#vqa-tab .pill-button[data-gender]', 'gender', settings.vqaGender);
                            }
                            if (settings.vqaVoice) {
                                setButtonByDataAttr('#vqa-tab .pill-button[data-voice]', 'voice', settings.vqaVoice);
                            }

                            console.log('[CustomQA] Settings restored successfully from:', videoTitle);
                            
                            // Save restored settings to user profile
                            try {
                                const allSettings = await getAllSettings(sidebar.querySelector('.tab-content:not([style*="display: none"])') || sidebar.querySelector('#audio-descriptions-tab'));
                                await window.DatabaseIntegration.saveSettings(user.uid, allSettings);
                                console.log('[CustomQA] Restored settings saved to user profile');
                            } catch (error) {
                                console.error('[CustomQA] Error saving restored settings:', error);
                            }
                            
                            restoreSettingsButton.textContent = 'Settings Restored!';
                            
                            setTimeout(() => {
                                restoreSettingsButton.textContent = 'RESTORE SETTINGS';
                                restoreSettingsButton.disabled = false;
                            }, 2000);

                            clearAudioCache();
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);

                        } catch (error) {
                            console.error('[CustomQA] Error restoring settings:', error);
                            restoreSettingsButton.textContent = 'RESTORE SETTINGS';
                            restoreSettingsButton.disabled = false;
                        }
                    });
                }

                const displayAdBubbles = (descriptions, videoUrl = null) => {
                    console.log('Displaying AD bubbles:', descriptions);
                    const adMessages = sidebar.querySelector('#ad-messages');
                    // Only clear if not already cleared by the generation handler
                    if (adMessages.innerHTML !== '') {
                        adMessages.innerHTML = '';
                    }
                    // Update video URL if provided
                    if (videoUrl) {
                        currentVideoUrl = videoUrl;
                    }
                    
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
                        speakerBtn.setAttribute('data-timestamp', currentTs);
                        speakerBtn.setAttribute('data-video-url', currentVideoUrl || window.location.href);
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
                            
                            // Skip if YouTube ad is playing
                            if (isYouTubeAdPlaying()) {
                                console.log('[CustomQA] Cannot play during YouTube ad');
                                return;
                            }
                            
                            const buttonVideoUrl = thisButton.getAttribute('data-video-url');
                            
                            // Only play if this AD belongs to the current video
                            if (buttonVideoUrl && buttonVideoUrl !== window.location.href) {
                                console.log('[CustomQA] Cannot play AD from different video');
                                return;
                            }
                            
                            if (currentAudio && currentPlayingButton === thisButton) {
                                currentAudio.stop();
                                return;
                            }
                            
                            const textToSpeak = thisButton.getAttribute('data-text');
                            const cachedAudioUrl = textToSpeak && preloadedAudioMap.has(textToSpeak) ? preloadedAudioMap.get(textToSpeak) : null;
                            const buttonAudioUrl = thisButton.getAttribute('data-audio-url');

                            // Use cached audio if available, otherwise fall back to button attribute
                            const audioUrl = cachedAudioUrl || buttonAudioUrl;

                            if (audioUrl) {
                                const adTimestamp = parseFloat(thisButton.getAttribute('data-timestamp')) || 0;
                                const videoTime = video?.currentTime || 0;
                                const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                const isPauseOn = pauseAdButton !== null;
                                
                                let delayMs = 0;
                                if (isPauseOn) {
                                    // Pause is ON: 1 second delay before audio
                                    delayMs = 1000;
                                } else {
                                    // Pause is OFF: play audio 5 seconds before the AD timestamp
                                    const timeUntilAd = (adTimestamp - videoTime) * 1000; // Convert to ms
                                    delayMs = Math.max(0, timeUntilAd - 5000); // Play 5s before
                                }
                                
                                playAudioFromDataUrl(audioUrl, thisButton, null, delayMs);
                                // Update button attribute with current cached URL
                                if (cachedAudioUrl) {
                                    thisButton.setAttribute('data-audio-url', cachedAudioUrl);
                                }
                            } else if (textToSpeak) {
                                const adTimestamp = parseFloat(thisButton.getAttribute('data-timestamp')) || 0;
                                const videoTime = video?.currentTime || 0;
                                const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                const isPauseOn = pauseAdButton !== null;
                                
                                let delayMs = 0;
                                if (isPauseOn) {
                                    // Pause is ON: 1 second delay before audio
                                    delayMs = 1000;
                                } else {
                                    // Pause is OFF: play audio 5 seconds before the AD timestamp
                                    const timeUntilAd = (adTimestamp - videoTime) * 1000; // Convert to ms
                                    delayMs = Math.max(0, timeUntilAd - 5000); // Play 5s before
                                }
                                
                                chrome.runtime.sendMessage({
                                    type: 'CALL_OPENAI_TTS',
                                    text: textToSpeak,
                                    gender: gender
                                }, (ttsResponse) => {
                                    if (ttsResponse && ttsResponse.success) {
                                        playAudioFromDataUrl(ttsResponse.audioDataUrl, thisButton, null, delayMs);
                                        // Cache and update button attribute
                                        preloadedAudioMap.set(textToSpeak, ttsResponse.audioDataUrl);
                                        thisButton.setAttribute('data-audio-url', ttsResponse.audioDataUrl);
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
                    
                    // Auto-preload all the displayed AD audio
                    setTimeout(() => {
                        console.log('[CustomQA] Preloading all newly displayed AD audio...');
                        const allAdButtons = sidebar.querySelectorAll('#ad-messages [id^="ad-speaker-btn"]');
                        const genderBtn = sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active');
                        const gender = genderBtn ? genderBtn.dataset.gender : 'female';
                        
                        allAdButtons.forEach(btn => {
                            const text = btn.getAttribute('data-text');
                            if (text && !preloadedAudioMap.has(text)) {
                                preloadAndStoreAudio(text, btn, gender);
                            }
                        });
                    }, 100);
                };

                const formatTime = (seconds) => {
                    const mins = Math.floor(seconds / 60);
                    const secs = Math.floor(seconds % 60);
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                };

                if (video) {
                    video.addEventListener('seeked', () => {
                        const currentTime = video.currentTime;
                        
                        // Stop any currently playing audio when seeking
                        if (currentAudio) {
                            try {
                                currentAudio.onended = null;
                                currentAudio.stop();
                            } catch (e) {
                                console.error('Error stopping audio on seek:', e);
                            }
                            currentAudio = null;
                            if (currentPlayingButton) {
                                setButtonToSpeakerIcon(currentPlayingButton);
                                currentPlayingButton = null;
                            }
                        }
                        
                        // Reset semaphore to allow new AD to play
                        isPlayingAd = false;
                        lastAdPlayTime = 0; // Allow immediate play of next AD
                        
                        // Reset played flags for ADs ahead of current position
                        adSchedule.forEach(ad => {
                            if (ad.timestamp >= currentTime) {
                                ad.played = false;
                            }
                        });
                    });

                    video.addEventListener('timeupdate', () => {
                        // Skip if YouTube ad is currently playing
                        if (isYouTubeAdPlaying()) {
                            console.log('[CustomQA] YouTube ad detected, skipping AD playback');
                            return;
                        }
                        
                        // Robust check: Only auto-play ADs when in AD tab (using both class and data attributes)
                        const adTabButton = sidebar.querySelector('.tab-button[data-tab="audio-descriptions"].active');
                        if (!adTabButton) {
                            return; // Skip AD auto-play if not in AD tab
                        }
                        
                        // Verify ADs belong to current video before auto-playing
                        if (!adScheduleVideoUrl || adScheduleVideoUrl !== window.location.href) {
                            return; // Skip if ADs are for a different video
                        }
                        
                        // Prevent rapid re-triggers from scrubbing/seeking
                        const now = Date.now();
                        if (now - lastAdPlayTime < MIN_AD_INTERVAL) {
                            return;
                        }
                        
                        if (adSchedule.length > 0) {
                            const currentTime = video.currentTime;
                            const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                            const lookAheadWindow = 10; // Only consider ADs within 10s in the future
                            
                            const adIndex = adSchedule.findIndex(ad => {
                                // For ADs at 0:00, play immediately without offset constraint
                                const offset = ad.timestamp === 0 ? 0 : (pauseAdButton ? 1 : 5);
                                const triggerTime = Math.max(0, ad.timestamp - offset);
                                // Only auto-play ADs that are coming up soon (not way in the past)
                                return currentTime >= triggerTime && 
                                       ad.timestamp <= currentTime + lookAheadWindow && 
                                       !ad.played;
                            });
                            if (adIndex !== -1) {
                                // Prevent simultaneous AD playback
                                if (isPlayingAd) {
                                    return;
                                }
                                isPlayingAd = true;
                                
                                // Safeguard: reset after max duration (15s) in case onended doesn't fire
                                setTimeout(() => { isPlayingAd = false; }, 15000);
                                
                                const nextAd = adSchedule[adIndex];
                                nextAd.played = true;
                                
                                // Update the last play time to prevent rapid re-triggers
                                lastAdPlayTime = Date.now();

                                const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                // Pause if: (1) first AD AND not at 0:00, OR (2) pause-during-ad is ON
                                const shouldPause = (adIndex === 0 && nextAd.timestamp !== 0) || pauseAdButton;
                                if (shouldPause) {
                                    console.log('[AD] Pausing video at', currentTime, 'for AD');
                                    video.pause();
                                }
                                
                                const genderBtnAD = sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active');
                                const gender = genderBtnAD ? genderBtnAD.dataset.gender : 'female';
                                
                                const speakerBtn = sidebar.querySelector(`#${nextAd.buttonId}`);
                                if (!speakerBtn) {
                                    console.error('[AD] Speaker button not found for AD:', nextAd.buttonId);
                                    isPlayingAd = false;
                                    return;
                                }
                                
                                const audioUrl = speakerBtn.getAttribute('data-audio-url');

                                if (audioUrl) {
                                    playAudioFromDataUrl(audioUrl, speakerBtn, () => {
                                        console.log('[AD] AD audio ended');
                                        // Resume if we paused (first AD not at 0:00, or pause-during-ad is ON)
                                        if (shouldPause) {
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
                                                // Resume if we paused
                                                if (shouldPause) {
                                                    console.log('[AD] Resuming video');
                                                    video.play();
                                                }
                                            });
                                        } else {
                                            console.error('OpenAI TTS error:', ttsResponse?.error);
                                            // Reset semaphore on error
                                            isPlayingAd = false;
                                            // Resume video on error if it was paused
                                            if (shouldPause) {
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
                        // Clear preloaded audio cache when time window changes
                        clearAudioCache();
                        // Save settings when time window changes
                        const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                        if (activeTab) {
                            saveAllSettings(activeTab);
                            // Preload all audio with new settings after a brief delay
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);
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
                                const formatTime = (seconds) => {
                                    const mins = Math.floor(seconds / 60);
                                    const secs = Math.floor(seconds % 60);
                                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                                };

                                // Capture the timestamp at which the question was asked
                                const askedAtTime = video.currentTime;
                                const askedAtTimestamp = formatTime(askedAtTime);

                                const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                                const wordCount = vqaLengthSlider ? vqaLengthSlider.value : 20;

                                const sendGeminiRequest = async (windowSize) => {
                                    try {
                                        const youtubeUrl = window.location.href;
                                        const currentTime = video.currentTime;

                                        const frames = [];
                                        if (windowSize > 0) {
                                            const start = Math.max(0, currentTime - windowSize);
                                            const end = Math.min(video.duration, currentTime + windowSize);
                                            
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
                                        } else {
                                            const frameData = await captureVideoFrame(currentTime);
                                            frames.push({
                                                timestamp: currentTime,
                                                frameData: frameData
                                            });
                                        }

                                        if (frames.length === 0) {
                                            return { success: false, error: 'Could not capture frames' };
                                        }

                                        const prompt = `User is watching a YouTube video at timestamp ${formatTime(currentTime)}.
User's question: "${question}"

Please analyze the video frames provided and answer their question about what's happening in the video. The frames are captured around the given timestamp. Please answer in approximately ${wordCount} words.`;

                                        return new Promise((resolve) => {
                                            chrome.runtime.sendMessage({
                                                type: 'CALL_GEMINI_VQA_MULTIFRAME',
                                                prompt: prompt,
                                                frames: frames
                                            }, (response) => {
                                                resolve(response);
                                            });
                                        });
                                    } catch (error) {
                                        console.error('Error in sendGeminiRequest:', error);
                                        return { success: false, error: error.message };
                                    }
                                };

                                const isValidResponse = (response) => {
                                    if (!response || !response.success || !response.text) {
                                        return false;
                                    }
                                    const text = response.text.toLowerCase();
                                    const failureIndicators = [
                                        "i don't have enough information",
                                        "i can't see",
                                        "i cannot see",
                                        "cannot determine",
                                        "unable to determine",
                                        "not visible",
                                        "no frames",
                                        "cannot answer",
                                        "can't answer",
                                        "unable to answer",
                                        "i'm unable to",
                                        "i cannot answer",
                                        "don't have enough",
                                        "insufficient information",
                                        "too blurry",
                                        "unclear",
                                        "cannot identify",
                                        "not clear enough",
                                        "unable to identify",
                                        "not possible to see"
                                    ];
                                    return !failureIndicators.some(indicator => text.includes(indicator));
                                };

                                try {
                                    const initialWindow = 3;
                                    const fallbackWindows = [9, 30, video.duration];
                                    
                                    aiTextSpan.textContent = `Capturing frames for ±${initialWindow}s...`;
                                    let response = await sendGeminiRequest(initialWindow);
                                    aiTextSpan.textContent = 'Processing...';

                                    if (isValidResponse(response)) {
                                        console.log('[VQA] Got valid response with initial window');
                                    } else {
                                        console.log('[VQA] Initial response invalid, attempting fallback strategy');
                                        for (const windowSize of fallbackWindows) {
                                            if (windowSize === video.duration) {
                                                aiTextSpan.textContent = 'Expanding to full video...';
                                            } else {
                                                aiTextSpan.textContent = `Expanding to ±${windowSize}s...`;
                                            }
                                            
                                            response = await sendGeminiRequest(windowSize);
                                            if (isValidResponse(response)) {
                                                console.log(`[VQA] Got valid response with ${windowSize}s window`);
                                                break;
                                            }
                                        }
                                    }

                                    aiTextSpan.textContent = 'Thinking...';

                                    if (response && response.success) {
                                        const responseWithTimestamp = `[${askedAtTimestamp}] ${response.text}`;
                                        aiTextSpan.textContent = responseWithTimestamp;
                                        speakerBtn.setAttribute('data-text', response.text);
                                        speakerBtn.style.opacity = '1';
                                        
                                        const user = window.FirebaseAPI?.getCurrentUser();
                                        if (user && window.DatabaseIntegration) {
                                            const videoUrl = window.location.href;
                                            
                                            // Gather ALL VQA presentation customizations
                                            const vqaVolumeSlider = sidebar.querySelector('#vqa-volume-slider');
                                            const vqaSpeedSlider = sidebar.querySelector('#vqa-speed-slider');
                                            const vqaVoiceBtn = sidebar.querySelector('#vqa-tab .pill-button[data-voice].active');
                                            const vqaGenderBtn = sidebar.querySelector('#vqa-tab .pill-button[data-gender].active');
                                            const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                                            
                                            const customizations = {
                                                vqaVolume: vqaVolumeSlider ? parseInt(vqaVolumeSlider.value) : 100,
                                                vqaSpeed: vqaSpeedSlider ? parseInt(vqaSpeedSlider.value) : 50,
                                                vqaVoice: vqaVoiceBtn ? vqaVoiceBtn.dataset.voice : 'human',
                                                vqaGender: vqaGenderBtn ? vqaGenderBtn.dataset.gender : 'female',
                                                vqaLength: vqaLengthSlider ? parseInt(vqaLengthSlider.value) : 25
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
                                        aiTextSpan.textContent = `Error: ${response?.error || 'Could not generate response'}`;
                                        console.error('Gemini API error:', response?.error);
                                    }
                                } catch (error) {
                                    console.error('Error calling Gemini API:', error);
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
