(() => {
    // ==================== SETTINGS MANAGER ====================
    class SettingsManager {
        constructor() {
            this.settings = {
                // Shared presentation settings
                volume: 100,
                speed: 50,
                voice: 'human',
                gender: 'female',
                
                // Whisper/Speech-to-Text settings
                whisperLanguage: 'en',
                whisperTemperature: 0,
                whisperPrompt: '',
                whisperResponseFormat: 'json',
                
                // AD-specific content settings
                adLength: 25,
                adFrequency: 'sometimes',
                adEmphasis: 'balanced',
                adNarrationStyle: 'objective',
                adColor: 'on',
                adPauseDuringAd: false
            };
        }

        // Initialize from Chrome storage
        async init() {
            return new Promise((resolve) => {
                chrome.storage.sync.get(null, (data) => {
                    if (data && Object.keys(data).length > 0) {
                        this.settings = { ...this.settings, ...data };
                        console.log('[Settings] Loaded from storage:', this.settings);
                    } else {
                        console.log('[Settings] Using defaults:', this.settings);
                    }
                    resolve();
                });
            });
        }

        // Get a setting value
        get(key, defaultValue = null) {
            return this.settings.hasOwnProperty(key) ? this.settings[key] : defaultValue;
        }

        // Set and auto-save
        set(key, value) {
            this.settings[key] = value;
            chrome.storage.sync.set({ [key]: value });
            console.log(`[Settings] Updated ${key}:`, value);
        }

        // Get all settings
        getAll() {
            return { ...this.settings };
        }

        // For AD customizations
        getAdCustomizations() {
            return {
                length: this.get('adLength'),
                frequency: this.get('adFrequency'),
                intervalSeconds: this.getFrequencyInterval(this.get('adFrequency')),
                emphasis: this.get('adEmphasis'),
                subjectiveness: this.get('adNarrationStyle'),
                colorPreference: this.get('adColor'),
                presentation: {
                    volume: this.get('volume'),
                    speed: this.get('speed'),
                    voice: this.get('voice'),
                    gender: this.get('gender')
                },
                content: {
                    emphasis: this.get('adEmphasis'),
                    narrationStyle: this.get('adNarrationStyle'),
                    colorDescriptions: this.get('adColor')
                },
                setup: {
                    adEnabled: true,
                    pauseDuringAd: this.get('adPauseDuringAd')
                }
            };
        }

        // For VQA customizations
        getVqaCustomizations() {
            return {
                length: this.get('adLength'),
                presentation: {
                    volume: this.get('volume'),
                    speed: this.get('speed'),
                    voice: this.get('voice'),
                    gender: this.get('gender')
                }
            };
        }

        // For Whisper/Speech-to-Text customizations
        getWhisperSettings() {
            return {
                language: this.get('whisperLanguage', 'en'),
                temperature: this.get('whisperTemperature', 0),
                prompt: this.get('whisperPrompt', ''),
                responseFormat: this.get('whisperResponseFormat', 'json')
            };
        }

        // Helper to convert frequency to seconds
        getFrequencyInterval(frequency) {
            const map = {
                'rarely': 60,
                'sometimes': 30,
                'often': 15,
                'very-often': 8
            };
            return map[frequency] || 30;
        }
    }

    // Initialize settings manager globally
    const settings = new SettingsManager();

    const syncSettingsManagerFromPersisted = (persisted = {}) => {
        if (!persisted || typeof persisted !== 'object') return;
        if (persisted.adVolume !== undefined) settings.set('volume', Number(persisted.adVolume));
        if (persisted.vqaVolume !== undefined) settings.set('volume', Number(persisted.vqaVolume));
        if (persisted.adSpeed !== undefined) settings.set('speed', Number(persisted.adSpeed));
        if (persisted.vqaSpeed !== undefined) settings.set('speed', Number(persisted.vqaSpeed));
        if (persisted.adGender) settings.set('gender', persisted.adGender);
        if (persisted.vqaGender) settings.set('gender', persisted.vqaGender);
        if (persisted.adVoice) settings.set('voice', persisted.adVoice);
        if (persisted.vqaVoice) settings.set('voice', persisted.vqaVoice);
        if (persisted.adLength !== undefined) settings.set('adLength', Number(persisted.adLength));
        if (persisted.vqaLength !== undefined && persisted.adLength === undefined) settings.set('adLength', Number(persisted.vqaLength));
        if (persisted.adFrequency) settings.set('adFrequency', persisted.adFrequency);
        if (persisted.adEmphasis) settings.set('adEmphasis', persisted.adEmphasis);
        if (persisted.adColorPreference) settings.set('adColor', persisted.adColorPreference);
        if (persisted.adNarrationStyle) settings.set('adNarrationStyle', persisted.adNarrationStyle);
        if (persisted.adPauseDuringAd !== undefined) settings.set('adPauseDuringAd', !!persisted.adPauseDuringAd);
    };
    
    // ======================================================
    // Debounce utility to prevent rate limiting on rapid slider changes
    const debounce = (func, wait = 300) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    };
    // ======================================================

    // Try to create AudioContext with error handling
    let audioContext = null;
    let gainNode = null;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        gainNode = audioContext.createGain();
        gainNode.connect(audioContext.destination);
    } catch (error) {
        console.warn('[CustomQA] AudioContext initialization failed:', error);
    }

    let currentVolume = 1; // Default volume
    const preloadedAudioMap = new Map();

    // Prevent audio ducking by monitoring and restoring gainNode value
    const preventAudioDucking = setInterval(() => {
        try {
            if (gainNode && audioContext && gainNode.gain.value !== currentVolume && currentVolume > 0) {
                gainNode.gain.setValueAtTime(currentVolume, audioContext.currentTime);
            }
        } catch (e) {
            // Silently handle errors in audio context
        }
    }, 100);

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

        const isAudioDescriptionEnabled = () => {
            const sidebarRoot = document.getElementById('custom-qa-sidebar');
            if (!sidebarRoot) return true;

            const allButtonGroups = sidebarRoot.querySelectorAll('.button-group');
            let adToggleGroup = null;

            allButtonGroups.forEach(group => {
                const label = group.parentElement?.querySelector('.subsection-title');
                if (label && label.textContent.includes('Audio Description')) {
                    adToggleGroup = group;
                }
            });

            if (!adToggleGroup) return true;
            const onButton = Array.from(adToggleGroup.querySelectorAll('.pill-button')).find(b => b.textContent.trim() === 'ON');
            return !!onButton?.classList.contains('active');
        };

        const getYoutubeVideoId = (url) => {
            try {
                const u = new URL(url || window.location.href);
                if (u.hostname.includes('youtu.be')) {
                    return u.pathname.replace('/', '');
                }
                return u.searchParams.get('v') || '';
            } catch {
                return '';
            }
        };

        const playAudioFromDataUrl = async (dataUrl, buttonElement, onendedCallback = null, delayMs = 0) => {
            // Check if audioContext is available
            if (!audioContext || !gainNode) {
                console.warn('[CustomQA] AudioContext not initialized, skipping audio playback');
                return null;
            }
            
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
                    // Ensure audio context and gain node are available
                    if (!audioContext || !gainNode) {
                        console.warn('[CustomQA] AudioContext not available, cannot play audio');
                        return;
                    }
                    
                    const source = audioContext.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(gainNode);

                    gainNode.gain.value = currentVolume;

                    // NOTE: Speed is now handled at the OpenAI TTS API level as an attribute parameter.
                    // Web Audio API's playbackRate inherently couples speed and pitch together,
                    // making speech sound like chipmunks when sped up. By passing speed to OpenAI TTS
                    // as an attribute, the audio is generated at the correct speed without pitch distortion.
                    // Do NOT use playbackRate here.

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
                gender: gender,
                speed: settings.get('speed', 50)
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
                sidebar.style.backgroundColor = "#f2f2f2";
                sidebar.style.borderRadius = "8px";
                sidebar.style.padding = "16px";
                sidebar.style.marginBottom = "16px";

                // Setup Firebase config and inline API
                window.firebaseConfig = {
                    apiKey: 'AIzaSyBcHEGgONk1Ff5a8Z1PLT6g3piFMZ9r_8A',
                    projectId: 'customqa-cf40b'
                };

                // Inline Firebase REST API with persistent auth
                let currentUser_FBAuth = null;
                let idToken_FBAuth = null;
                let refreshToken_FBAuth = null;
                let tokenExpiresAt_FBAuth = 0;

                // Load persisted auth on initialization
                const loadPersistedAuth = () => {
                    const persisted = localStorage.getItem('customqa_auth');
                    if (persisted) {
                        try {
                            const auth = JSON.parse(persisted);
                            currentUser_FBAuth = auth.user;
                            idToken_FBAuth = auth.token;
                            refreshToken_FBAuth = auth.refreshToken || null;
                            tokenExpiresAt_FBAuth = Number(auth.tokenExpiresAt || 0);
                            return true;
                        } catch (e) {
                            console.error('Failed to load persisted auth:', e);
                            return false;
                        }
                    }
                    return false;
                };

                const savePersistedAuth = (user, token, refreshToken = refreshToken_FBAuth, tokenExpiresAt = tokenExpiresAt_FBAuth) => {
                    // Save to localStorage for backward compatibility
                    localStorage.setItem('customqa_auth', JSON.stringify({
                        user,
                        token,
                        refreshToken,
                        tokenExpiresAt
                    }));
                    
                    // Also save to Chrome storage for sync with popup/background
                    try {
                        chrome.storage.local.set({
                            customqa_currentUser: user,
                            customqa_idToken: token,
                            customqa_refreshToken: refreshToken,
                            customqa_tokenExpiresAt: tokenExpiresAt
                        });
                    } catch (e) {
                        console.warn('[CustomQA] Error saving to Chrome storage:', e);
                    }
                };

                const clearPersistedAuth = () => {
                    localStorage.removeItem('customqa_auth');
                    
                    // Also clear Chrome storage
                    try {
                        chrome.storage.local.remove(['customqa_currentUser', 'customqa_idToken', 'customqa_refreshToken', 'customqa_tokenExpiresAt']);
                    } catch (e) {
                        console.warn('[CustomQA] Error clearing Chrome storage:', e);
                    }
                };

                const refreshIdToken = async () => {
                    if (!refreshToken_FBAuth) {
                        return false;
                    }

                    try {
                        const response = await fetch(
                            `https://securetoken.googleapis.com/v1/token?key=${window.firebaseConfig.apiKey}`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken_FBAuth)}`
                            }
                        );

                        const data = await response.json();
                        if (!response.ok || !data.id_token) {
                            console.warn('[CustomQA] Failed to refresh Firebase token:', data?.error?.message || response.statusText);
                            return false;
                        }

                        idToken_FBAuth = data.id_token;
                        refreshToken_FBAuth = data.refresh_token || refreshToken_FBAuth;
                        const expiresInSeconds = parseInt(data.expires_in || '3600', 10);
                        tokenExpiresAt_FBAuth = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;
                        savePersistedAuth(currentUser_FBAuth, idToken_FBAuth, refreshToken_FBAuth, tokenExpiresAt_FBAuth);
                        return true;
                    } catch (error) {
                        console.error('[CustomQA] Error refreshing Firebase token:', error);
                        return false;
                    }
                };

                const ensureValidIdToken = async () => {
                    if (!idToken_FBAuth) {
                        return false;
                    }

                    if (!tokenExpiresAt_FBAuth || Date.now() >= tokenExpiresAt_FBAuth) {
                        return refreshIdToken();
                    }

                    return true;
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
                            refreshToken_FBAuth = data.refreshToken || null;
                            tokenExpiresAt_FBAuth = Date.now() + Math.max(0, (parseInt(data.expiresIn || '3600', 10) - 60)) * 1000;
                            
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
                            
                            savePersistedAuth(currentUser_FBAuth, idToken_FBAuth, refreshToken_FBAuth, tokenExpiresAt_FBAuth);
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
                            refreshToken_FBAuth = data.refreshToken || null;
                            tokenExpiresAt_FBAuth = Date.now() + Math.max(0, (parseInt(data.expiresIn || '3600', 10) - 60)) * 1000;
                            
                            // Use Firebase UID as document ID (reliable, never changes)
                            // Generate friendly custom ID to store in document: "username_timestamp"
                            const username = email.split('@')[0];
                            const customUserId = `${username}_${Date.now()}`;
                            
                            currentUser_FBAuth = { uid: data.localId, email, role };
                            savePersistedAuth(currentUser_FBAuth, idToken_FBAuth, refreshToken_FBAuth, tokenExpiresAt_FBAuth);

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
                        refreshToken_FBAuth = null;
                        tokenExpiresAt_FBAuth = 0;
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
                                const hasValidToken = await ensureValidIdToken();
                                if (!hasValidToken) {
                                    console.warn('[CustomQA] Auth expired and refresh failed; stopping role listener.');
                                    clearInterval(checkInterval);
                                    return;
                                }

                                const userDocPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}`;
                                let response = await fetch(
                                    `https://firestore.googleapis.com/v1/${userDocPath}?key=${window.firebaseConfig.apiKey}`,
                                    {
                                        method: 'GET',
                                        headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                    }
                                );

                                if (response.status === 401) {
                                    const refreshed = await refreshIdToken();
                                    if (!refreshed) {
                                        console.warn('[CustomQA] Unauthorized in role listener and token refresh failed; stopping listener.');
                                        clearInterval(checkInterval);
                                        return;
                                    }

                                    response = await fetch(
                                        `https://firestore.googleapis.com/v1/${userDocPath}?key=${window.firebaseConfig.apiKey}`,
                                        {
                                            method: 'GET',
                                            headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                        }
                                    );
                                }

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
                        if (!(await ensureValidIdToken())) return null;
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
                                    vqaGender: data.fields.vqaGender?.stringValue || 'female'
                                };
                            }
                            return null;
                        } catch (error) {
                            console.error('Error loading settings:', error);
                            return null;
                        }
                    },

                    async saveSettings(userId, settings) {
                        if (!(await ensureValidIdToken())) return false;
                        try {
                            const docPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}`;
                            const existingSettings = await this.loadSettings(userId) || {};
                            const mergedSettings = { ...existingSettings, ...(settings || {}) };
                            
                            // Get current user info (email, role) from currentUser_FBAuth
                            const userEmail = currentUser_FBAuth?.email || mergedSettings.email || '';
                            const userRole = currentUser_FBAuth?.role || mergedSettings.role || 'user';
                            
                            // Build updateMask to include all fields: user info, AD settings, VQA settings, and timestamps
                            const maskParams = new URLSearchParams();
                            maskParams.append('key', window.firebaseConfig.apiKey);
                            ['email', 'role', 'adVolume', 'adSpeed', 'adGender', 'adVoice', 'adLength', 'adFrequency',
                             'adEmphasis', 'adColorPreference', 'adNarrationStyle', 'adPauseDuringAd',
                             'vqaVolume', 'vqaSpeed', 'vqaGender', 'updatedAt'].forEach(field => {
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
                                            // User profile information
                                            email: { stringValue: userEmail },
                                            role: { stringValue: userRole },
                                            // AD presentation customization
                                            adVolume: { integerValue: parseInt(mergedSettings.adVolume || 100) },
                                            adSpeed: { integerValue: parseInt(mergedSettings.adSpeed || 50) },
                                            adGender: { stringValue: mergedSettings.adGender || 'female' },
                                            adVoice: { stringValue: mergedSettings.adVoice || 'human' },
                                            // AD content customization
                                            adLength: { integerValue: parseInt(mergedSettings.adLength || 25) },
                                            adFrequency: { stringValue: mergedSettings.adFrequency || 'sometimes' },
                                            adEmphasis: { stringValue: mergedSettings.adEmphasis || 'balanced' },
                                            adColorPreference: { stringValue: mergedSettings.adColorPreference || 'on' },
                                            adNarrationStyle: { stringValue: mergedSettings.adNarrationStyle || 'objective' },
                                            // AD customization setup
                                            adPauseDuringAd: { booleanValue: mergedSettings.adPauseDuringAd ?? true },
                                            // VQA presentation customization
                                            vqaVolume: { integerValue: parseInt(mergedSettings.vqaVolume || 100) },
                                            vqaSpeed: { integerValue: parseInt(mergedSettings.vqaSpeed || 50) },
                                            vqaGender: { stringValue: mergedSettings.vqaGender || 'female' },
                                            // Timestamps
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
                            console.log('[CustomQA] Settings saved successfully for user:', userEmail, 'with role:', userRole);
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
                            const parseStoredArray = (field) => {
                                if (!field?.arrayValue?.values) return [];
                                return field.arrayValue.values.map((val) => {
                                    if (val.stringValue) {
                                        try {
                                            return JSON.parse(val.stringValue);
                                        } catch {
                                            return { timestamp_in_seconds: 0, description: val.stringValue };
                                        }
                                    }
                                    return val;
                                });
                            };

                            // Load the "current" AD document directly
                            const response = await fetch(
                                `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/audioDescriptions/current?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'GET',
                                    headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                }
                            );
                            
                            if (response.status === 404) {
                                // Backward-compatible fallback: older builds stored ADs directly on videos/{videoId}.
                                const legacyResponse = await fetch(
                                    `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}?key=${window.firebaseConfig.apiKey}`,
                                    {
                                        method: 'GET',
                                        headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                    }
                                );

                                if (!legacyResponse.ok) {
                                    console.log('[CustomQA] No saved AD document found (current + legacy)');
                                    return null;
                                }

                                const legacyData = await legacyResponse.json();
                                const legacyFields = legacyData.fields || {};
                                const generatedAds = parseStoredArray(legacyFields.generatedAds);
                                if (!generatedAds.length) {
                                    return null;
                                }

                                let customizations = {};
                                if (legacyFields.customizations?.stringValue) {
                                    try {
                                        customizations = JSON.parse(legacyFields.customizations.stringValue);
                                    } catch {
                                        customizations = {};
                                    }
                                }

                                return {
                                    customizations,
                                    generatedAds,
                                    timestamp: legacyFields.adUpdatedAt?.timestampValue || legacyFields.timestamp?.integerValue || Date.now(),
                                    createdAt: legacyFields.adUpdatedAt?.timestampValue || legacyFields.createdAt?.timestampValue || new Date().toISOString()
                                };
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
                            const generatedAds = parseStoredArray(fields.generatedAds);
                            
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
                            const parseStoredMessages = (field) => {
                                if (!field?.arrayValue?.values) return [];
                                return field.arrayValue.values.map((val) => {
                                    if (val.stringValue) {
                                        try {
                                            return JSON.parse(val.stringValue);
                                        } catch {
                                            return { role: 'assistant', content: val.stringValue };
                                        }
                                    }
                                    return val;
                                });
                            };

                            const parseVqaDoc = (doc) => {
                                const fields = doc?.fields || {};
                                let customizations = {};
                                if (fields.customizations?.stringValue) {
                                    try {
                                        customizations = JSON.parse(fields.customizations.stringValue);
                                    } catch (e) {
                                        console.warn('Failed to parse VQA customizations:', e);
                                    }
                                }

                                const messages = parseStoredMessages(fields.messages);
                                return {
                                    docId: doc?.name?.split('/').pop() || '',
                                    customizations,
                                    messages,
                                    timestamp: Number(fields.timestamp?.integerValue || 0),
                                    createdAt: fields.createdAt?.timestampValue || fields.vqaUpdatedAt?.timestampValue || new Date().toISOString()
                                };
                            };

                            // Prefer direct read of "current" first; some Firestore rules allow document gets but deny collection list.
                            const currentPath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/vqa/current`;
                            const currentResponse = await fetch(
                                `https://firestore.googleapis.com/v1/${currentPath}?key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'GET',
                                    headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                }
                            );

                            let entries = [];
                            if (currentResponse.ok) {
                                const currentDoc = await currentResponse.json();
                                const entry = parseVqaDoc(currentDoc);
                                if (Array.isArray(entry.messages) && entry.messages.length > 0) {
                                    entries = [entry];
                                }
                            }

                            // Then try reading full history (subcollection list). If forbidden, continue with current/legacy fallback.
                            const basePath = `projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}/vqa`;
                            const listResponse = await fetch(
                                `https://firestore.googleapis.com/v1/${basePath}?pageSize=200&key=${window.firebaseConfig.apiKey}`,
                                {
                                    method: 'GET',
                                    headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                }
                            );

                            if (listResponse.ok) {
                                const listData = await listResponse.json();
                                const docs = listData.documents || [];
                                entries = docs
                                    .map(parseVqaDoc)
                                    .filter(entry => Array.isArray(entry.messages) && entry.messages.length > 0)
                                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                            } else if (listResponse.status !== 404 && listResponse.status !== 403) {
                                console.error('Load VQA list error:', listResponse.status, listResponse.statusText);
                            } else if (listResponse.status === 403) {
                                console.warn('[CustomQA] VQA history list forbidden by rules; using current/legacy fallback');
                            }

                            // Keep all sessions, but drop exact duplicates (common when "current" mirrors latest saved doc).
                            const dedupedEntries = [];
                            const seenSignatures = new Set();
                            entries.forEach((entry) => {
                                const signature = JSON.stringify(entry.messages);
                                if (!seenSignatures.has(signature)) {
                                    seenSignatures.add(signature);
                                    dedupedEntries.push(entry);
                                }
                            });

                            if (!dedupedEntries.length) {
                                // Backward-compatible fallback: older builds stored vqaMessages directly on videos/{videoId}.
                                const legacyResponse = await fetch(
                                    `https://firestore.googleapis.com/v1/projects/${window.firebaseConfig.projectId}/databases/customqa/documents/users/${userId}/videos/${videoId}?key=${window.firebaseConfig.apiKey}`,
                                    {
                                        method: 'GET',
                                        headers: { 'Authorization': `Bearer ${idToken_FBAuth}` }
                                    }
                                );

                                if (!legacyResponse.ok) {
                                    return null;
                                }

                                const legacyData = await legacyResponse.json();
                                const legacyFields = legacyData.fields || {};
                                const legacyMessages = parseStoredMessages(legacyFields.vqaMessages || legacyFields.messages);
                                if (!legacyMessages.length) {
                                    return null;
                                }

                                return {
                                    entries: [{
                                        docId: 'legacy-video-doc',
                                        customizations: {},
                                        messages: legacyMessages,
                                        timestamp: Number(legacyFields.timestamp?.integerValue || Date.now()),
                                        createdAt: legacyFields.vqaUpdatedAt?.timestampValue || legacyFields.createdAt?.timestampValue || new Date().toISOString()
                                    }],
                                    messages: legacyMessages,
                                    createdAt: legacyFields.vqaUpdatedAt?.timestampValue || legacyFields.createdAt?.timestampValue || new Date().toISOString(),
                                    timestamp: Number(legacyFields.timestamp?.integerValue || Date.now())
                                };
                            }

                            return {
                                entries: dedupedEntries,
                                // Backward-compatible flattened view for older rendering paths.
                                messages: dedupedEntries.flatMap(entry => entry.messages),
                                createdAt: dedupedEntries[0].createdAt,
                                timestamp: dedupedEntries[0].timestamp
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

                            const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                            if (vqaLengthSlider) {
                                vqaLengthSlider.value = settings.adLength;
                                const vqaLengthValue = sidebar.querySelector('#vqa-length-value');
                                if (vqaLengthValue) vqaLengthValue.textContent = settings.adLength;
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

                        // VQA uses shared adLength; no dedicated VQA length control in user settings.
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

                // Also check Chrome storage for recently logged-in user
                // (in case user logged in via popup which uses Chrome storage)
                chrome.storage.local.get(['customqa_currentUser', 'customqa_idToken', 'customqa_refreshToken', 'customqa_tokenExpiresAt'], (items) => {
                    if (items.customqa_currentUser && items.customqa_idToken && !currentUser_FBAuth) {
                        console.log('[CustomQA] Syncing auth from Chrome storage...');
                        currentUser_FBAuth = items.customqa_currentUser;
                        idToken_FBAuth = items.customqa_idToken;
                        refreshToken_FBAuth = items.customqa_refreshToken || null;
                        tokenExpiresAt_FBAuth = Number(items.customqa_tokenExpiresAt || 0);
                        // Also save to localStorage for persistence
                        savePersistedAuth(currentUser_FBAuth, idToken_FBAuth, refreshToken_FBAuth, tokenExpiresAt_FBAuth);
                    }
                });

                // Listen for auth changes from popup/background
                chrome.storage.onChanged.addListener((changes, areaName) => {
                    if (areaName === 'local') {
                        if (changes.customqa_currentUser || changes.customqa_idToken) {
                            console.log('[CustomQA] Auth changed in Chrome storage, syncing...');
                            const newUser = changes.customqa_currentUser?.newValue;
                            const newToken = changes.customqa_idToken?.newValue;
                            const newRefreshToken = changes.customqa_refreshToken?.newValue;
                            const newExpiresAt = changes.customqa_tokenExpiresAt?.newValue;
                            
                            if (newUser && newToken) {
                                currentUser_FBAuth = newUser;
                                idToken_FBAuth = newToken;
                                refreshToken_FBAuth = newRefreshToken || null;
                                tokenExpiresAt_FBAuth = Number(newExpiresAt || 0);
                                savePersistedAuth(currentUser_FBAuth, idToken_FBAuth, refreshToken_FBAuth, tokenExpiresAt_FBAuth);
                                console.log('[CustomQA] Auth synced, user:', newUser.email);
                            } else if (!newUser || !newToken) {
                                // User logged out
                                currentUser_FBAuth = null;
                                idToken_FBAuth = null;
                                refreshToken_FBAuth = null;
                                tokenExpiresAt_FBAuth = 0;
                                console.log('[CustomQA] Auth cleared');
                            }
                        }
                    }
                });

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

                const waitForAuthenticatedSession = async (timeoutMs = 3000) => {
                    const existingUser = window.FirebaseAPI?.getCurrentUser();
                    if (existingUser && idToken_FBAuth) {
                        return existingUser;
                    }

                    return new Promise((resolve) => {
                        let settled = false;

                        const finish = (user, token) => {
                            if (settled) return;
                            settled = true;
                            chrome.storage.onChanged.removeListener(onStorageChange);
                            clearTimeout(timeoutId);
                            resolve(user && token ? user : null);
                        };

                        const maybeResolveFromState = () => {
                            const user = window.FirebaseAPI?.getCurrentUser() || currentUser_FBAuth;
                            const token = idToken_FBAuth;
                            if (user && token) {
                                finish(user, token);
                            }
                        };

                        const onStorageChange = (changes, areaName) => {
                            if (areaName !== 'local') return;

                            if (changes.customqa_currentUser?.newValue) {
                                currentUser_FBAuth = changes.customqa_currentUser.newValue;
                            }
                            if (changes.customqa_idToken?.newValue) {
                                idToken_FBAuth = changes.customqa_idToken.newValue;
                            }
                            if (changes.customqa_refreshToken?.newValue !== undefined) {
                                refreshToken_FBAuth = changes.customqa_refreshToken.newValue || null;
                            }
                            if (changes.customqa_tokenExpiresAt?.newValue !== undefined) {
                                tokenExpiresAt_FBAuth = Number(changes.customqa_tokenExpiresAt.newValue || 0);
                            }

                            maybeResolveFromState();
                        };

                        chrome.storage.onChanged.addListener(onStorageChange);

                        chrome.storage.local.get(['customqa_currentUser', 'customqa_idToken', 'customqa_refreshToken', 'customqa_tokenExpiresAt'], (items) => {
                            if (items.customqa_currentUser) {
                                currentUser_FBAuth = items.customqa_currentUser;
                            }
                            if (items.customqa_idToken) {
                                idToken_FBAuth = items.customqa_idToken;
                            }
                            if (items.customqa_refreshToken) {
                                refreshToken_FBAuth = items.customqa_refreshToken;
                            }
                            if (items.customqa_tokenExpiresAt) {
                                tokenExpiresAt_FBAuth = Number(items.customqa_tokenExpiresAt || 0);
                            }

                            maybeResolveFromState();
                        });

                        const timeoutId = setTimeout(() => {
                            const user = window.FirebaseAPI?.getCurrentUser() || currentUser_FBAuth;
                            finish(user, idToken_FBAuth);
                        }, timeoutMs);
                    });
                };

                // Load user settings if logged in
                const user = await waitForAuthenticatedSession();
                let hasExistingAD = false;
                let hasExistingVQA = false;
                
                if (user && window.DatabaseIntegration) {
                    const userSettings = await window.DatabaseIntegration.loadUserSettings();
                    if (userSettings) {
                        window.DatabaseIntegration.restoreSettingsToUI(sidebar, userSettings);
                        syncSettingsManagerFromPersisted(userSettings);
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
                            
                            // Keep global user settings persistent across videos.
                            // Do not overwrite current UI with per-video AD snapshot customizations.
                            
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
                                
                                const rawDescriptions = previousAD.generatedAds;
                                const descriptions = mergeConsecutiveSimilarAds(rawDescriptions.map((desc, index) => ({
                                    timestamp: Number(desc.timestamp_in_seconds || 0),
                                    endTimestamp: Number(rawDescriptions[index + 1]?.timestamp_in_seconds || (video ? video.duration : 0)),
                                    description: (desc.description || '').trim()
                                })));
                                
                                descriptions.forEach((desc, index) => {
                                    const messageContainer = document.createElement('div');
                                    messageContainer.style.display = 'flex';
                                    messageContainer.style.alignItems = 'flex-start';
                                    messageContainer.style.gap = '8px';
                                    messageContainer.style.marginBottom = '12px';
                                    
                                    const currentTs = desc.timestamp;
                                    const nextTs = Number.isFinite(desc.endTimestamp) ? desc.endTimestamp : (descriptions[index + 1]?.timestamp || (video ? video.duration : 0));
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
                                        
                                        // Prevent simultaneous audio playback: stop any currently playing audio from different button
                                        if (currentAudio && currentPlayingButton !== thisButton) {
                                            try {
                                                currentAudio.stop();
                                                currentAudio = null;
                                                if (currentPlayingButton) {
                                                    setButtonToSpeakerIcon(currentPlayingButton);
                                                }
                                                currentPlayingButton = null;
                                            } catch (e) {
                                                // Ignore error if audio is already stopped
                                            }
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
                                            gender: settings.get('gender', 'female'),
                                            speed: settings.get('speed', 50)
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
                                    timestamp: desc.timestamp,
                                    endTimestamp: desc.endTimestamp,
                                    description: desc.description,
                                    played: true, // Mark all previously loaded ADs as already played to avoid auto-playing old content
                                    buttonId: `ad-speaker-btn-loaded-${index}`
                                }));
                                adScheduleVideoUrl = videoUrl; // Track video for this schedule
                                console.log('[CustomQA] AD schedule populated with', adSchedule.length, 'ADs (marked as played for returning visits)');
                                
                                // Auto-preload all previously loaded AD audio
                                setTimeout(() => {
                                    console.log('[CustomQA] Preloading all previously loaded AD audio...');
                                    const gender = settings.get('gender', 'female');
                                    
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
                        
                        const hasVqaEntries = Array.isArray(previousVQA?.entries) && previousVQA.entries.length > 0;
                        const hasVqaMessages = Array.isArray(previousVQA?.messages) && previousVQA.messages.length > 0;
                        if (previousVQA && (hasVqaEntries || hasVqaMessages)) {
                            hasExistingVQA = true;
                            const messageCount = hasVqaEntries
                                ? previousVQA.entries.reduce((sum, entry) => sum + ((entry.messages || []).length), 0)
                                : previousVQA.messages.length;
                            console.log('[CustomQA] Displaying', messageCount, 'VQA message(s)');
                            
                            const vqaMessages = sidebar.querySelector('.vqa-sub-tab-content .chat-messages');
                            console.log('[CustomQA] VQA container found:', !!vqaMessages);
                            
                            if (vqaMessages) {
                                vqaMessages.innerHTML = '';
                                
                                // Add metadata badge showing history scope
                                const metadataBadge = document.createElement('div');
                                metadataBadge.style.background = '#e3f2fd';
                                metadataBadge.style.border = '1px solid #2196f3';
                                metadataBadge.style.borderRadius = '4px';
                                metadataBadge.style.padding = '8px 12px';
                                metadataBadge.style.marginBottom = '12px';
                                metadataBadge.style.fontSize = '12px';
                                metadataBadge.style.color = '#1565c0';
                                const entryCount = Array.isArray(previousVQA.entries) ? previousVQA.entries.length : 1;
                                metadataBadge.innerHTML = `<strong>Saved Q&A History</strong> • ${entryCount} session${entryCount === 1 ? '' : 's'}`;
                                vqaMessages.appendChild(metadataBadge);

                                const allMessages = Array.isArray(previousVQA.entries)
                                    ? previousVQA.entries
                                        .slice()
                                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                                        .flatMap(entry => Array.isArray(entry.messages) ? entry.messages : [])
                                    : (Array.isArray(previousVQA.messages) ? previousVQA.messages : []);

                                // Separate questions from answers
                                const questions = [];
                                const answers = [];

                                allMessages.forEach(msg => {
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
                                        
                                        // Prevent simultaneous audio playback: stop any currently playing audio from different button
                                        if (currentAudio && currentPlayingButton !== thisButton) {
                                            try {
                                                currentAudio.stop();
                                                currentAudio = null;
                                                if (currentPlayingButton) {
                                                    setButtonToSpeakerIcon(currentPlayingButton);
                                                }
                                                currentPlayingButton = null;
                                            } catch (e) {
                                                // Ignore error if audio is already stopped
                                            }
                                        }
                                        
                                        const gender = settings.get('gender', 'female');
                                        const textToSpeak = thisButton.getAttribute('data-text');
                                        chrome.runtime.sendMessage({
                                            type: 'CALL_OPENAI_TTS',
                                            text: textToSpeak,
                                            gender: gender,
                                            speed: settings.get('speed', 50)
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
                                        
                                        // Prevent simultaneous audio playback: stop any currently playing audio from different button
                                        if (currentAudio && currentPlayingButton !== thisButton) {
                                            try {
                                                currentAudio.stop();
                                                currentAudio = null;
                                                if (currentPlayingButton) {
                                                    setButtonToSpeakerIcon(currentPlayingButton);
                                                }
                                                currentPlayingButton = null;
                                            } catch (e) {
                                                // Ignore error if audio is already stopped
                                            }
                                        }
                                        
                                        const gender = settings.get('gender', 'female');
                                        const textToSpeak = thisButton.getAttribute('data-text');
                                        chrome.runtime.sendMessage({
                                            type: 'CALL_OPENAI_TTS',
                                            text: textToSpeak,
                                            gender: gender,
                                            speed: settings.get('speed', 50)
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
                
                                console.log('[CustomQA] VQA display complete - Questions:', questions.length, 'Answers:', answers.length, 'Total:', allMessages.length);
                
                // Auto-preload all displayed VQA audio
                setTimeout(() => {
                    console.log('[CustomQA] Preloading all previously loaded VQA audio...');
                    const gender = settings.get('gender', 'female');
                    
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
                    const dbSettings = {};
                    
                    if (isADTab) {
                        // === AD PRESENTATION CUSTOMIZATION ===
                        const volumeSlider = tab.querySelector('#ad-volume-slider');
                        const speedSlider = tab.querySelector('#ad-speed-slider');
                        const genderBtn = tab.querySelector('.pill-button[data-gender].active');
                        const voiceBtn = tab.querySelector('.pill-button[data-voice].active');
                        
                        const volume = volumeSlider ? parseInt(volumeSlider.value) : 100;
                        const speed = speedSlider ? parseInt(speedSlider.value) : 50;
                        const gender = genderBtn ? genderBtn.dataset.gender : 'female';
                        const voice = voiceBtn ? voiceBtn.dataset.voice : 'human';

                        // === AD CONTENT CUSTOMIZATION ===
                        const lengthSlider = tab.querySelector('#length-slider');
                        const frequencyBtn = tab.querySelector('.pill-button[data-frequency].active');
                        const emphasisBtn = tab.querySelector('.pill-button[data-emphasis].active');
                        const colorBtn = tab.querySelector('.pill-button[data-color].active');
                        const narrationBtn = tab.querySelector('.pill-button[data-narration].active');
                        
                        const adLength = lengthSlider ? parseInt(lengthSlider.value) : 25;
                        const frequency = frequencyBtn ? frequencyBtn.dataset.frequency : 'sometimes';
                        const emphasis = emphasisBtn ? emphasisBtn.dataset.emphasis : 'balanced';
                        const color = colorBtn ? colorBtn.dataset.color : 'on';
                        const narration = narrationBtn ? narrationBtn.dataset.narration : 'objective';

                        // === AD CUSTOMIZATION SETUPS ===
                        const pauseBtn = tab.querySelector('#pause-ad-group .pill-button.active');
                        const pauseDuringAd = pauseBtn ? pauseBtn.dataset.action === 'pause-on' : false;

                        // Save to global settings manager (syncs to chrome.storage.sync)
                        settings.set('volume', volume);
                        settings.set('speed', speed);
                        settings.set('gender', gender);
                        settings.set('voice', voice);
                        settings.set('adLength', adLength);
                        settings.set('adFrequency', frequency);
                        settings.set('adEmphasis', emphasis);
                        settings.set('adColor', color);
                        settings.set('adNarrationStyle', narration);
                        settings.set('adPauseDuringAd', pauseDuringAd);

                        // For database (shared presentation stays synced across AD and VQA)
                        dbSettings.adVolume = volume;
                        dbSettings.adSpeed = speed;
                        dbSettings.adGender = gender;
                        dbSettings.adVoice = voice;
                        dbSettings.vqaVolume = volume;
                        dbSettings.vqaSpeed = speed;
                        dbSettings.vqaGender = gender;
                        dbSettings.adLength = adLength;
                        dbSettings.adFrequency = frequency;
                        dbSettings.adEmphasis = emphasis;
                        dbSettings.adColorPreference = color;
                        dbSettings.adNarrationStyle = narration;
                        dbSettings.adPauseDuringAd = pauseDuringAd;
                    } else {
                        // === VQA PRESENTATION CUSTOMIZATION ===
                        const volumeSlider = tab.querySelector('#vqa-volume-slider');
                        const speedSlider = tab.querySelector('#vqa-speed-slider');
                        const vqaLengthSlider = tab.querySelector('#vqa-length-slider');
                        const genderBtn = tab.querySelector('#vqa-tab .pill-button[data-gender].active');
                        
                        const volume = volumeSlider ? parseInt(volumeSlider.value) : 100;
                        const speed = speedSlider ? parseInt(speedSlider.value) : 50;
                        const adLength = vqaLengthSlider ? parseInt(vqaLengthSlider.value) : settings.get('adLength', 25);
                        const gender = genderBtn ? genderBtn.dataset.gender : 'female';

                        // Save to global settings manager (syncs to chrome.storage.sync)
                        settings.set('volume', volume);
                        settings.set('speed', speed);
                        settings.set('gender', gender);
                        settings.set('adLength', adLength);

                        // For database (shared presentation stays synced across AD and VQA)
                        dbSettings.vqaVolume = volume;
                        dbSettings.vqaSpeed = speed;
                        dbSettings.vqaGender = gender;
                        dbSettings.adVolume = volume;
                        dbSettings.adSpeed = speed;
                        dbSettings.adGender = gender;
                        dbSettings.adVoice = settings.get('voice', 'human');
                        dbSettings.adLength = adLength;
                    }
                    
                    return dbSettings;
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
                            if (!result) {
                                console.error('[CustomQA] Failed to save AD settings:', result);
                            }
                        } else {
                            const result = await window.DatabaseIntegration?.saveVQASettings(settings);
                            if (!result) {
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
                    const gender = settings.get('gender', 'female');
                    
                    // Preload AD audio
                    const adSpeakerButtons = sidebar.querySelectorAll('#ad-messages [id^="ad-speaker-btn"]');
                    adSpeakerButtons.forEach(btn => {
                        const text = btn.getAttribute('data-text');
                        if (text) {
                            // Always preload (don't check for existing data-audio-url)
                            console.log('[CustomQA] Preloading AD audio for:', text.substring(0, 30) + '...');
                            preloadAndStoreAudio(text, btn, gender);
                        }
                    });
                    
                    // Preload VQA audio (both questions and answers)
                    const vqaSpeakerButtons = sidebar.querySelectorAll('#chat-tab [role="tabpanel"] button[data-text]');
                    vqaSpeakerButtons.forEach(btn => {
                        const text = btn.getAttribute('data-text');
                        if (text) {
                            // Always preload (don't check for existing data-audio-url)
                            console.log('[CustomQA] Preloading VQA audio for:', text.substring(0, 30) + '...');
                            preloadAndStoreAudio(text, btn, gender);
                        }
                    });
                    
                    console.log('[CustomQA] Preloading all visible audio...');
                };

                chrome.storage.sync.get('volume', (data) => {
                    if (data.volume) {
                        setSliderValues(data.volume);
                    }
                });

                // Sync all UI elements to current SettingsManager values
                const syncUIToSettings = () => {
                    // Sync volume sliders
                    const adVolSlider = sidebar.querySelector('#ad-volume-slider');
                    const vqaVolSlider = sidebar.querySelector('#vqa-volume-slider');
                    const volume = settings.get('volume', 100);
                    if (adVolSlider) adVolSlider.value = volume;
                    if (vqaVolSlider) vqaVolSlider.value = volume;

                    // Sync speed sliders
                    const adSpeedSlider = sidebar.querySelector('#ad-speed-slider');
                    const vqaSpeedSlider = sidebar.querySelector('#vqa-speed-slider');
                    const speed = settings.get('speed', 50);
                    if (adSpeedSlider) {
                        adSpeedSlider.value = speed;
                        adSpeedSlider.setAttribute('aria-valuetext', `Speed ${speed}%`);
                    }
                    if (vqaSpeedSlider) {
                        vqaSpeedSlider.value = speed;
                        vqaSpeedSlider.setAttribute('aria-valuetext', `Speed ${speed}%`);
                    }

                    // Sync gender buttons
                    const gender = settings.get('gender', 'female');
                    const genderBtn = sidebar.querySelector(`.pill-button[data-gender="${gender}"]`);
                    if (genderBtn) {
                        sidebar.querySelectorAll('.pill-button[data-gender]').forEach(btn => btn.classList.remove('active'));
                        genderBtn.classList.add('active');
                    }

                    // Sync shared length slider
                    const adLengthSlider = sidebar.querySelector('#length-slider');
                    const vqaLengthSlider = sidebar.querySelector('#vqa-length-slider');
                    const adLength = settings.get('adLength', 25);
                    if (adLengthSlider) {
                        adLengthSlider.value = adLength;
                        const adLengthValue = sidebar.querySelector('#length-value');
                        if (adLengthValue) adLengthValue.textContent = adLength;
                    }
                    if (vqaLengthSlider) {
                        vqaLengthSlider.value = adLength;
                        vqaLengthSlider.setAttribute('aria-valuetext', `Length ${adLength} words`);
                        const vqaLengthValue = sidebar.querySelector('#vqa-length-value');
                        if (vqaLengthValue) vqaLengthValue.textContent = adLength;
                    }

                    console.log('[CustomQA] UI synced to settings:', {
                        volume, speed, gender, adLength
                    });
                };
                
                // Sync UI immediately after showing sidebar
                syncUIToSettings();

                const debouncedVolumeSave = debounce((newVolume) => {
                    chrome.storage.sync.set({ volume: newVolume });
                    settings.set('volume', newVolume);
                    clearAudioCache();
                    const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                    if (activeTab) {
                        saveAllSettings(activeTab);
                        setTimeout(() => {
                            preloadAllVisibleAudio();
                        }, 50);
                    }
                }, 300);

                const volumeChangeHandler = (e) => {
                    const newVolume = e.target.value;
                    // Instant UI updates (no debounce needed - just DOM updates)
                    setSliderValues(newVolume);
                    currentVolume = parseFloat(newVolume) / 100;
                    console.log('[CustomQA] Volume updated to:', currentVolume);
                    // Debounced storage/DB save (only after dragging stops)
                    debouncedVolumeSave(newVolume);
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
                
                // Add enter key support for chat input
                const chatInput = sidebar.querySelector('#vqa-tab .chat-input');
                if (chatInput) {
                    chatInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            // Trigger the send button click
                            vqaSendButton.click();
                        }
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
                const syncLengthSlider = (sourceSlider) => {
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

                // Shared debounced handler for AD length (also used by VQA generation)
                const debouncedLengthChange = debounce((value) => {
                    preloadedAudioMap.clear();
                    settings.set('adLength', value);
                    const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                    if (activeTab) {
                        saveAllSettings(activeTab);
                        setTimeout(() => {
                            preloadAllVisibleAudio();
                        }, 50);
                    }
                }, 300);
                
                if (lengthSlider) {
                    lengthSlider.addEventListener('input', (e) => {
                        syncLengthSlider(e.target);
                        debouncedLengthChange(e.target.value);
                    });
                }
                if (vqaLengthSlider) {
                    vqaLengthSlider.addEventListener('input', (e) => {
                        syncLengthSlider(e.target);
                        debouncedLengthChange(e.target.value);
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
                    // Debounce handler to only update storage/DB after dragging stops
                    const debouncedSpeedChange = debounce((value) => {
                        settings.set('speed', value);
                        preloadedAudioMap.clear();
                        const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                        if (activeTab) {
                            saveAllSettings(activeTab);
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);
                        }
                    }, 300);
                    
                    adSpeedSlider.addEventListener('input', (e) => {
                        // Instant UI sync, debounced storage update
                        syncSpeedSliders(e.target);
                        debouncedSpeedChange(e.target.value);
                    });
                }
                if (vqaSpeedSlider) {
                    // Debounce handler to only update storage/DB after dragging stops
                    const debouncedSpeedChange = debounce((value) => {
                        settings.set('speed', value);
                        preloadedAudioMap.clear();
                        const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                        if (activeTab) {
                            saveAllSettings(activeTab);
                            setTimeout(() => {
                                preloadAllVisibleAudio();
                            }, 50);
                        }
                    }, 300);
                    
                    vqaSpeedSlider.addEventListener('input', (e) => {
                        // Instant UI sync, debounced storage update
                        syncSpeedSliders(e.target);
                        debouncedSpeedChange(e.target.value);
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
                            // Save to SettingsManager
                            settings.set('gender', button.dataset.gender);
                            // When gender changes, immediately clear cache and preload with new gender
                            console.log('[CustomQA] Gender changed - clearing preloaded audio');
                            clearAudioCache(); // Clear cache so audio regenerates with new gender
                            preloadAllVisibleAudio();
                            // Save all settings when gender changes
                            if (activeTab) {
                                saveAllSettings(activeTab);
                            }
                        }
                        
                        // Save voice setting
                        if (button.dataset.voice) {
                            const activeTab = sidebar.querySelector('.tab-content:not([style*="display: none"])');
                            const otherTab = sidebar.querySelector('.tab-content[style*="display: none"]');
                            syncPresentationSettings(activeTab, otherTab);
                            settings.set('voice', button.dataset.voice);
                            clearAudioCache();
                            preloadAllVisibleAudio();
                            // Save voice changes to database
                            if (activeTab) {
                                saveAllSettings(activeTab);
                            }
                        }
                        
                        // Save frequency setting
                        if (button.dataset.frequency) {
                            settings.set('adFrequency', button.dataset.frequency);
                            // Update frequency helper text with fade animation
                            const frequencyMap = {
                                'rarely': 'currently playing: audio description every 60 seconds',
                                'sometimes': 'currently playing: audio description every 30 seconds',
                                'often': 'currently playing: audio description every 15 seconds',
                                'very-often': 'currently playing: audio description every 8 seconds'
                            };
                            const frequencyHelper = sidebar.querySelector('#frequency-helper');
                            if (frequencyHelper && frequencyMap[button.dataset.frequency]) {
                                frequencyHelper.style.opacity = '0';
                                setTimeout(() => {
                                    frequencyHelper.textContent = frequencyMap[button.dataset.frequency];
                                    frequencyHelper.style.opacity = '1';
                                }, 150);
                            }
                        }
                        
                        // Save emphasis setting
                        if (button.dataset.emphasis) {
                            settings.set('adEmphasis', button.dataset.emphasis);
                        }
                        
                        // Save color preference
                        if (button.dataset.color) {
                            settings.set('adColor', button.dataset.color);
                        }
                        
                        // Save narration style
                        if (button.dataset.narration) {
                            settings.set('adNarrationStyle', button.dataset.narration);
                        }
                        
                        // Save pause during ad setting
                        if (button.dataset.action === 'pause-on') {
                            settings.set('adPauseDuringAd', true);
                        } else if (button.dataset.action === 'pause-off') {
                            settings.set('adPauseDuringAd', false);
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
                        
                        // Save settings for any pill button click (frequency, emphasis, color, narration, pause, etc.)
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

                // Chat Speech-to-text with OpenAI Whisper
                let isListeningChatMicButton = false;
                let mediaRecorder = null;
                let audioChunks = [];
                let micAutoStopTimer = null;
                let micSilenceMonitor = null;
                let micAudioContext = null;
                let micAnalyser = null;
                let micSourceNode = null;
                let micStream = null;
                let micStartedAt = 0;
                let micHasDetectedSpeech = false;
                let micNoSpeechTimer = null;
                let micSpeechFrameCount = 0;
                let micDetectedSpeechAt = 0;
                let micPeakRms = 0;
                const chatMicButton = sidebar.querySelector('#chat-mic-button');
                const activationSound = new Audio(chrome.runtime.getURL('assets/activation.mp3'));
                const MIC_INITIAL_GRACE_MS = 500;
                const MIC_SPEECH_THRESHOLD = 0.024;
                const MIC_SILENCE_MS = 1200;
                const MIC_MONITOR_INTERVAL_MS = 120;
                const MIC_NO_SPEECH_TIMEOUT_MS = 6000;
                const MIC_SPEECH_CONFIRM_FRAMES = 2;
                const MIC_FALLBACK_MIN_PEAK_RMS = 0.018;

                const stopMicMonitoring = () => {
                    if (micAutoStopTimer) {
                        clearTimeout(micAutoStopTimer);
                        micAutoStopTimer = null;
                    }

                    if (micSilenceMonitor) {
                        clearInterval(micSilenceMonitor);
                        micSilenceMonitor = null;
                    }

                    if (micNoSpeechTimer) {
                        clearTimeout(micNoSpeechTimer);
                        micNoSpeechTimer = null;
                    }

                    if (micSourceNode) {
                        try {
                            micSourceNode.disconnect();
                        } catch (error) {
                            console.warn('[CustomQA] Failed to disconnect mic source node:', error);
                        }
                        micSourceNode = null;
                    }

                    if (micAnalyser) {
                        try {
                            micAnalyser.disconnect();
                        } catch (error) {
                            console.warn('[CustomQA] Failed to disconnect mic analyser:', error);
                        }
                        micAnalyser = null;
                    }

                    if (micAudioContext) {
                        micAudioContext.close().catch((error) => {
                            console.warn('[CustomQA] Failed to close mic audio context:', error);
                        });
                        micAudioContext = null;
                    }

                    micStream = null;
                    micHasDetectedSpeech = false;
                    micSpeechFrameCount = 0;
                    micDetectedSpeechAt = 0;
                    micPeakRms = 0;
                };

                const stopMicRecording = () => {
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                    }
                };

                const playActivationCue = (pitchedDown = false) => {
                    try {
                        const cue = new Audio(chrome.runtime.getURL('assets/activation.mp3'));
                        if (pitchedDown) {
                            cue.playbackRate = 0.72;
                            cue.preservesPitch = false;
                            cue.mozPreservesPitch = false;
                            cue.webkitPreservesPitch = false;
                        }
                        cue.play();
                    } catch (error) {
                        console.error('Error playing activation cue:', error);
                    }
                };
                
                if (!chatMicButton) {
                    console.warn('[CustomQA] Chat mic button not found');
                } else {
                    chatMicButton.addEventListener('click', async () => {
                    if (isListeningChatMicButton) {
                        // Stop recording
                        stopMicMonitoring();
                        stopMicRecording();
                        isListeningChatMicButton = false;
                        chatMicButton.classList.remove('listening');
                    } else {
                        // Start recording
                        try {
                            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                            micStream = stream;
                            mediaRecorder = new MediaRecorder(stream);
                            audioChunks = [];
                            micStartedAt = Date.now();
                            micHasDetectedSpeech = false;
                            micSpeechFrameCount = 0;
                            micDetectedSpeechAt = 0;
                            micPeakRms = 0;
                            micNoSpeechTimer = setTimeout(() => {
                                if (isListeningChatMicButton && mediaRecorder && mediaRecorder.state !== 'inactive' && !micHasDetectedSpeech) {
                                    stopMicRecording();
                                }
                            }, MIC_NO_SPEECH_TIMEOUT_MS);
                            
                            mediaRecorder.ondataavailable = (event) => {
                                audioChunks.push(event.data);
                            };
                            
                            mediaRecorder.onstop = async () => {
                                const activeMicStream = micStream;
                                const hadDetectedSpeech = micHasDetectedSpeech;
                                const recordedPeakRms = micPeakRms;
                                stopMicMonitoring();
                                isListeningChatMicButton = false;
                                chatMicButton.classList.remove('listening');

                                // When mic stops listening, play a pitched-down cue.
                                playActivationCue(true);

                                try {
                                    activeMicStream?.getTracks().forEach(track => track.stop());
                                } catch (error) {
                                    console.warn('[CustomQA] Failed to stop mic stream tracks:', error);
                                }
                                
                                // Create audio blob using the recorder's native mime type.
                                const recordedMimeType = mediaRecorder?.mimeType || audioChunks?.[0]?.type || 'audio/webm';
                                const audioBlob = new Blob(audioChunks, { type: recordedMimeType });

                                const canUseFallbackTranscription = !hadDetectedSpeech && recordedPeakRms >= MIC_FALLBACK_MIN_PEAK_RMS;

                                if (!hadDetectedSpeech && !canUseFallbackTranscription) {
                                    console.log('[CustomQA] No speech detected; skipping Whisper transcription');
                                    const chatInput = sidebar.querySelector('#vqa-tab .chat-input');
                                    if (chatInput && !chatInput.value.trim()) {
                                        chatInput.placeholder = 'No speech detected. Try speaking a bit louder.';
                                    }
                                    return;
                                }

                                if (canUseFallbackTranscription) {
                                    console.log('[CustomQA] Using fallback transcription path for low-volume speech. Peak RMS:', recordedPeakRms.toFixed(4));
                                }
                                
                                // Get Whisper settings from SettingsManager
                                const whisperSettings = settings.getWhisperSettings();
                                
                                // Send to Whisper API via background script
                                console.log('[CustomQA] Sending audio to Whisper API with settings:', whisperSettings);
                                chrome.runtime.sendMessage({
                                    type: 'CALL_WHISPER',
                                    audioBlob: await new Promise(resolve => {
                                        const reader = new FileReader();
                                        reader.onloadend = () => resolve(reader.result);
                                        reader.readAsDataURL(audioBlob);
                                    }),
                                    settings: whisperSettings
                                }, (response) => {
                                    if (response && response.success) {
                                        const chatInput = sidebar.querySelector('#vqa-tab .chat-input');
                                        if (!chatInput) {
                                            console.error('[CustomQA] VQA chat input not found after transcription');
                                            return;
                                        }

                                        chatInput.value = response.text;
                                        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                                        console.log('[CustomQA] Transcribed:', response.text);

                                        const textToSpeak = chatInput.value;
                                        const gender = settings.get('gender', 'female');
                                        const speed = settings.get('speed', 50);
                                        const chatSpeakerButton = sidebar.querySelector('#chat-speaker-button');
                                        const cacheKey = `${textToSpeak}::${gender}::${speed}`;

                                        if (textToSpeak && textToSpeak.trim()) {
                                            console.log('[CustomQA] Auto-playing recorded question...');

                                            // Toggle speaker state as soon as TTS is requested.
                                            if (chatSpeakerButton) {
                                                setButtonToStopIcon(chatSpeakerButton);
                                            }

                                            chrome.runtime.sendMessage({
                                                type: 'CALL_OPENAI_TTS',
                                                text: textToSpeak,
                                                gender: gender,
                                                speed: speed
                                            }, (ttsResponse) => {
                                                if (ttsResponse && ttsResponse.success) {
                                                    if (chatSpeakerButton) {
                                                        chatSpeakerButton.setAttribute('data-text', textToSpeak);
                                                        chatSpeakerButton.setAttribute('data-audio-url', ttsResponse.audioDataUrl);
                                                        chatSpeakerButton.setAttribute('data-audio-cache-key', cacheKey);
                                                    }
                                                    playAudioFromDataUrl(ttsResponse.audioDataUrl, chatSpeakerButton);
                                                } else {
                                                    if (chatSpeakerButton) {
                                                        setButtonToSpeakerIcon(chatSpeakerButton);
                                                    }
                                                    console.error('OpenAI TTS error:', ttsResponse?.error);
                                                }
                                            });
                                        }
                                    } else {
                                        console.error('Whisper API error:', response?.error);
                                        alert('Error transcribing audio: ' + (response?.error || 'Unknown error'));
                                    }
                                });
                            };

                                try {
                                    micAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                                    micAnalyser = micAudioContext.createAnalyser();
                                    micAnalyser.fftSize = 2048;
                                    micSourceNode = micAudioContext.createMediaStreamSource(stream);
                                    micSourceNode.connect(micAnalyser);

                                    const samples = new Uint8Array(micAnalyser.fftSize);
                                    micSilenceMonitor = setInterval(() => {
                                        if (!isListeningChatMicButton || !mediaRecorder || mediaRecorder.state === 'inactive' || !micAnalyser) {
                                            return;
                                        }

                                        const elapsedMs = Date.now() - micStartedAt;
                                        if (elapsedMs < MIC_INITIAL_GRACE_MS) {
                                            return;
                                        }

                                        micAnalyser.getByteTimeDomainData(samples);
                                        let sumSquares = 0;

                                        for (let i = 0; i < samples.length; i++) {
                                            const normalized = (samples[i] - 128) / 128;
                                            sumSquares += normalized * normalized;
                                        }

                                        const rms = Math.sqrt(sumSquares / samples.length);
                                        micPeakRms = Math.max(micPeakRms, rms);

                                        if (rms >= MIC_SPEECH_THRESHOLD) {
                                            micSpeechFrameCount += 1;
                                            if (!micHasDetectedSpeech && micSpeechFrameCount >= MIC_SPEECH_CONFIRM_FRAMES) {
                                                micHasDetectedSpeech = true;
                                                micDetectedSpeechAt = Date.now();
                                            }
                                            if (micNoSpeechTimer) {
                                                clearTimeout(micNoSpeechTimer);
                                                micNoSpeechTimer = null;
                                            }
                                            if (micAutoStopTimer) {
                                                clearTimeout(micAutoStopTimer);
                                                micAutoStopTimer = null;
                                            }
                                            return;
                                        }

                                        micSpeechFrameCount = 0;

                                        if (micHasDetectedSpeech && !micAutoStopTimer) {
                                            micAutoStopTimer = setTimeout(() => {
                                                if (isListeningChatMicButton && mediaRecorder && mediaRecorder.state !== 'inactive') {
                                                    stopMicRecording();
                                                }
                                            }, MIC_SILENCE_MS);
                                        }
                                    }, MIC_MONITOR_INTERVAL_MS);
                                } catch (error) {
                                    console.warn('[CustomQA] Failed to initialize mic silence monitor:', error);
                                }
                            
                            // Clear previous chat input text so new transcription replaces it
                            const chatInputToRecord = sidebar.querySelector('.chat-input');
                            if (chatInputToRecord) {
                                chatInputToRecord.value = '';
                            }
                            
                            // Pause the video when starting to record
                            if (video) {
                                video.pause();
                                console.log('[CustomQA] Video paused for microphone recording');
                            }
                            
                            mediaRecorder.start();
                            isListeningChatMicButton = true;
                            chatMicButton.classList.add('listening');
                            try {
                                activationSound.play();
                            } catch (error) {
                                console.error('Error playing activation sound:', error);
                            }
                        } catch (error) {
                            console.error('Error accessing microphone:', error);
                            alert('Could not access microphone: ' + error.message);
                        }
                    }
                    });
                }

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
                    const chatInput = sidebar.querySelector('#vqa-tab .chat-input');
                    const textToSpeak = chatInput.value;
                    const gender = settings.get('gender', 'female');
                    const speed = settings.get('speed', 50);

                    if (textToSpeak) {
                        const audioUrl = thisButton.getAttribute('data-audio-url');
                        const cachedKey = thisButton.getAttribute('data-audio-cache-key');
                        const currentKey = `${textToSpeak}::${gender}::${speed}`;
                        const canUseCachedAudio = !!audioUrl && cachedKey === currentKey;

                        if (canUseCachedAudio) {
                            playAudioFromDataUrl(audioUrl, thisButton);
                        } else {
                            chrome.runtime.sendMessage({
                                type: 'CALL_OPENAI_TTS',
                                text: textToSpeak,
                                gender: gender,
                                speed: speed
                            }, (ttsResponse) => {
                                if (ttsResponse && ttsResponse.success) {
                                    thisButton.setAttribute('data-text', textToSpeak);
                                    thisButton.setAttribute('data-audio-url', ttsResponse.audioDataUrl);
                                    thisButton.setAttribute('data-audio-cache-key', currentKey);
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

                const formatTimestamp = (seconds) => {
                    const safeSeconds = Math.max(0, Math.floor(seconds));
                    const mins = Math.floor(safeSeconds / 60);
                    const secs = safeSeconds % 60;
                    return `${mins}:${secs.toString().padStart(2, '0')}`;
                };

                const getFrequencyIntervalSeconds = (frequency) => {
                    switch (frequency) {
                        case 'rarely':
                            return 60;
                        case 'sometimes':
                            return 30;
                        case 'often':
                            return 15;
                        case 'very-often':
                            return 8;
                        default:
                            return 30;
                    }
                };

                const buildAdSegments = (duration, intervalSeconds) => {
                    const segments = [];
                    for (let start = 0; start < duration; start += intervalSeconds) {
                        const end = Math.min(duration, start + intervalSeconds);
                        segments.push({
                            start_in_seconds: Math.floor(start),
                            end_in_seconds: Math.floor(end),
                            start_label: formatTimestamp(start),
                            end_label: formatTimestamp(end)
                        });
                    }
                    return segments;
                };

                const countWords = (text) => {
                    return (text || '').trim().split(/\s+/).filter(Boolean).length;
                };

                const finalizeSentenceEnding = (text) => {
                    let normalized = (text || '').replace(/\s+/g, ' ').trim();
                    if (!normalized) return '';

                    const trailingPunctuationMatch = normalized.match(/[.!?]["')\]]*$/);
                    let sentencePunctuation = trailingPunctuationMatch ? trailingPunctuationMatch[0] : '.';

                    if (trailingPunctuationMatch) {
                        normalized = normalized.slice(0, -sentencePunctuation.length).trim();
                    }

                    const danglingTailWords = new Set([
                        'a', 'an', 'the', 'and', 'or', 'but', 'so', 'yet',
                        'to', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'into', 'onto',
                        'as', 'if', 'than', 'that', 'this', 'these', 'those',
                        'his', 'her', 'their', 'its', 'my', 'your', 'our'
                    ]);

                    const getLastWord = (value) => {
                        const matches = (value || '').toLowerCase().match(/[a-z']+/g);
                        return matches && matches.length ? matches[matches.length - 1] : '';
                    };

                    let lastWord = getLastWord(normalized);
                    while (lastWord && danglingTailWords.has(lastWord)) {
                        // Prefer dropping the trailing clause after the final comma/semicolon/colon.
                        const delimiterIndex = Math.max(
                            normalized.lastIndexOf(','),
                            normalized.lastIndexOf(';'),
                            normalized.lastIndexOf(':')
                        );

                        if (delimiterIndex > -1) {
                            normalized = normalized.slice(0, delimiterIndex).trim();
                        } else {
                            // No delimiter: drop the final dangling word.
                            normalized = normalized.replace(/\s*[A-Za-z']+\s*$/, '').trim();
                        }

                        lastWord = getLastWord(normalized);
                    }

                    if (!normalized) {
                        return (text || '').trim();
                    }

                    if (!/[.!?]["')\]]*$/.test(normalized)) {
                        normalized = `${normalized}${sentencePunctuation || '.'}`;
                    }

                    return normalized;
                };

                const trimToWordLimit = (text, minWords, maxWords) => {
                    const normalized = (text || '').replace(/\s+/g, ' ').trim();
                    if (!normalized) return '';

                    const words = normalized.split(' ').filter(Boolean);

                    if (words.length <= maxWords) {
                        return finalizeSentenceEnding(normalized);
                    }

                    // Prefer complete sentence prefixes that stay inside the configured range.
                    const sentenceParts = normalized.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [normalized];
                    const candidates = [];
                    let running = [];
                    let runningCount = 0;

                    sentenceParts.forEach((part) => {
                        const sentence = part.trim();
                        if (!sentence) return;
                        const sentenceWordCount = countWords(sentence);
                        if (!sentenceWordCount) return;

                        running.push(sentence);
                        runningCount += sentenceWordCount;

                        if (runningCount >= minWords && runningCount <= maxWords && /[.!?]["')\]]*$/.test(sentence)) {
                            candidates.push({
                                text: running.join(' ').trim(),
                                count: runningCount
                            });
                        }
                    });

                    if (candidates.length > 0) {
                        const target = Math.round((minWords + maxWords) / 2);
                        candidates.sort((a, b) => {
                            const aDelta = Math.abs(a.count - target);
                            const bDelta = Math.abs(b.count - target);
                            if (aDelta !== bDelta) return aDelta - bDelta;
                            return b.count - a.count;
                        });
                        return finalizeSentenceEnding(candidates[0].text);
                    }

                    // Fallback: truncate at max words and force terminal punctuation.
                    let trimmed = words.slice(0, maxWords).join(' ').trim();
                    trimmed = trimmed.replace(/[;,]\s*$/, '.');
                    if (!/[.!?]["')\]]*$/.test(trimmed)) {
                        trimmed += '.';
                    }
                    return finalizeSentenceEnding(trimmed);
                };

                const normalizeAdDescriptions = (descriptions, targetWords) => {
                    const target = parseInt(targetWords, 10) || 25;
                    const minWords = Math.max(8, target - 5);  // Allow 5 words less if needed
                    const maxWords = Math.max(12, target + 5); // Allow 5 words more for complete sentences
                    
                    return (descriptions || []).map((desc) => {
                        const raw = (desc?.description || '').trim();
                        const cleaned = raw.replace(/^\[\d+:\d{2}\s*-\s*\d+:\d{2}\]\s*/i, '');
                        const normalized = trimToWordLimit(cleaned, minWords, maxWords);
                        return {
                            ...desc,
                            description: normalized,
                            _wordCount: countWords(normalized)
                        };
                    });
                };

                function normalizeDescriptionKey(text) {
                    return (text || '')
                        .toLowerCase()
                        .replace(/[^a-z0-9\s]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                }

                function isNoChangeDescription(text) {
                    const normalized = normalizeDescriptionKey(text);
                    return /no (major )?(visible )?change|no scene change|scene continues|nothing (notable )?(changes|happens)|little to no change/.test(normalized);
                }

                function mergeConsecutiveSimilarAds(items) {
                    const source = Array.isArray(items) ? [...items] : [];
                    if (source.length <= 1) return source;

                    source.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                    const merged = [];

                    source.forEach((item) => {
                        const current = {
                            ...item,
                            timestamp: Number(item.timestamp || 0),
                            endTimestamp: Number(item.endTimestamp || item.timestamp || 0),
                            description: (item.description || '').trim()
                        };

                        const prev = merged[merged.length - 1];
                        if (!prev) {
                            merged.push(current);
                            return;
                        }

                        const prevKey = normalizeDescriptionKey(prev.description);
                        const currKey = normalizeDescriptionKey(current.description);
                        const bothNoChange = isNoChangeDescription(prev.description) && isNoChangeDescription(current.description);
                        const sameText = prevKey && prevKey === currKey;

                        if (sameText || bothNoChange) {
                            prev.endTimestamp = Math.max(prev.endTimestamp || prev.timestamp, current.endTimestamp || current.timestamp);
                            if ((current.description || '').length > (prev.description || '').length) {
                                prev.description = current.description;
                            }
                        } else {
                            merged.push(current);
                        }
                    });

                    return merged;
                }

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
                                adVolume: settings.get('volume', 100),
                                adSpeed: settings.get('speed', 50),
                                adGender: settings.get('gender', 'female'),
                                adVoice: settings.get('voice', 'human'),
                                adLength: settings.get('adLength', 25),
                                adFrequency: settings.get('adFrequency', 'sometimes'),
                                adEmphasis: settings.get('adEmphasis', 'balanced'),
                                adColorPreference: settings.get('adColor', 'on'),
                                adNarration: settings.get('adNarrationStyle', 'objective'),
                                adPauseDuringAd: settings.get('adPauseDuringAd', false)
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
                        generateAdButton.textContent = 'Generating audio description... (Click to cancel)';
                        generateAdButton.setAttribute('aria-label', 'Generating audio description, click to cancel');
                        generateAdButton.disabled = false;
                        
                        // Announce to VoiceOver via aria-live region
                        const announcer = sidebar.querySelector('#button-state-announcer');
                        if (announcer) {
                            announcer.textContent = 'Generating audio description, click to cancel';
                        }
                        
                        const duration = video.duration;
                        const frequency = settings.get('adFrequency') || 'sometimes';
                        const interval = settings.getFrequencyInterval(frequency);
                        const segments = buildAdSegments(duration, interval);

                        console.log('[AD] Generated time segments:', segments);

                        try {
                            if (cancelAdGeneration) {
                                throw new Error('Cancelled by user');
                            }

                            if (segments.length === 0) {
                                throw new Error('Could not generate time segments for AD.');
                            }

                            console.log('[AD] Segment planning complete. Sending URL + segments to Gemini...');

                            const customizations = settings.getAdCustomizations();

                            const videoUrl = window.location.href;

                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AD generation timed out')), 300000));

                            const geminiPromise = new Promise((resolve, reject) => {
                                chrome.runtime.sendMessage({
                                    type: 'CALL_GEMINI_FOR_AD',
                                    customizations: customizations,
                                    videoUrl: videoUrl,
                                    videoDuration: Math.floor(duration),
                                    segments: segments
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
                                generateAdButton.textContent = 'Generating audio description... (Click to cancel)';
                                // Strip markdown and parse - more robust cleanup
                                let jsonString = response.text.trim();
                                // Remove markdown code blocks
                                jsonString = jsonString.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
                                jsonString = jsonString.trim();
                                const adData = JSON.parse(jsonString);
                                
                                let descriptions = [];
                                if (Array.isArray(adData)) {
                                    descriptions = adData;
                                } else if (adData.VideoMetadata && adData.VideoMetadata.audio_descriptions) {
                                    descriptions = adData.VideoMetadata.audio_descriptions;
                                } else if (adData.audio_descriptions) {
                                    descriptions = adData.audio_descriptions;
                                } else if (adData.VideoMetadata && adData.VideoMetadata.AudioDescriptions) {
                                    descriptions = adData.VideoMetadata.AudioDescriptions;
                                }

                                if (!Array.isArray(descriptions)) {
                                    descriptions = [];
                                }

                                const selectedLength = parseInt(sidebar.querySelector('#length-slider')?.value || 25, 10);
                                descriptions = normalizeAdDescriptions(descriptions, selectedLength);
                                console.log('[AD] Normalized description word counts:', descriptions.map(d => d._wordCount));

                                if (descriptions.length === 0) {
                                    throw new Error('No audio descriptions returned by Gemini.');
                                }

                                const defaultDescription = 'Scene continues with no major visible change in this section.';
                                let normalizedSchedule = segments.map((segment, index) => {
                                    const modelEntry = descriptions[index] || {};
                                    const modelText = (modelEntry.description || '').trim();
                                    return {
                                        // Use planned segment timeline as source of truth for autoplay stability.
                                        timestamp: Number(segment.start_in_seconds || 0),
                                        endTimestamp: Number(segment.end_in_seconds || segment.start_in_seconds || 0),
                                        description: modelText || defaultDescription,
                                        played: false
                                    };
                                });

                                normalizedSchedule = mergeConsecutiveSimilarAds(normalizedSchedule);
                                adSchedule = normalizedSchedule.map((ad, index) => ({
                                    ...ad,
                                    buttonId: `ad-speaker-btn-${index}`
                                }));
                                adScheduleVideoUrl = window.location.href; // Track video for this schedule

                                generateAdButton.textContent = 'Preloading audio...';

                                // Render immediately so UI never depends on preload completion.
                                displayAdBubbles(adSchedule);

                                // Save generated ADs in background; do not block rendering/playback.
                                (async () => {
                                    try {
                                        const user = window.FirebaseAPI?.getCurrentUser();
                                        if (!user || !window.DatabaseIntegration) return;

                                        const videoUrl = window.location.href;
                                        const customizations = {
                                            adVolume: settings.get('volume', 100),
                                            adSpeed: settings.get('speed', 50),
                                            adGender: settings.get('gender', 'female'),
                                            adVoice: settings.get('voice', 'human'),
                                            adLength: settings.get('adLength', 25),
                                            adFrequency: settings.get('adFrequency', 'sometimes'),
                                            adEmphasis: settings.get('adEmphasis', 'balanced'),
                                            adColorPreference: settings.get('adColor', 'on'),
                                            adNarrationStyle: settings.get('adNarrationStyle', 'objective'),
                                            adPauseDuringAd: settings.get('adPauseDuringAd', false),
                                            vqaVolume: settings.get('volume', 100),
                                            vqaSpeed: settings.get('speed', 50),
                                            vqaGender: settings.get('gender', 'female'),
                                            vqaLength: settings.get('adLength', 25)
                                        };
                                        const generatedAds = adSchedule.map(ad => ({
                                            timestamp_in_seconds: ad.timestamp,
                                            description: ad.description
                                        }));

                                        const saved = await window.DatabaseIntegration.saveGeneratedAD(videoUrl, video.duration, customizations, generatedAds);
                                        if (saved) {
                                            console.log('Generated ADs saved to Firestore');
                                        }
                                    } catch (saveError) {
                                        console.error('Error saving generated ADs:', saveError);
                                    }
                                })();

                                // Preload TTS before playback to reduce first-play delays.
                                const preloadGender = sidebar.querySelector('#audio-descriptions-tab .pill-button[data-gender].active')?.dataset.gender || 'female';
                                const preloadPromises = adSchedule.map((ad) => new Promise((resolve) => {
                                    chrome.runtime.sendMessage({
                                        type: 'PRELOAD_OPENAI_TTS',
                                        text: ad.description,
                                        gender: preloadGender,
                                        speed: settings.get('speed', 50)
                                    }, (response) => {
                                        if (response && response.success && response.audioDataUrl) {
                                            const key = response.text || ad.description;
                                            preloadedAudioMap.set(key, response.audioDataUrl);
                                            const matchingButtons = sidebar.querySelectorAll('button[data-text]');
                                            matchingButtons.forEach((btn) => {
                                                if (btn.getAttribute('data-text') === key) {
                                                    btn.setAttribute('data-audio-url', response.audioDataUrl);
                                                }
                                            });
                                        } else {
                                            console.warn('[AD] Preload failed for one segment:', response?.error || 'Unknown error');
                                        }
                                        resolve();
                                    });
                                }));

                                const preloadTimeout = new Promise((resolve) => setTimeout(resolve, 2500));
                                await Promise.race([Promise.allSettled(preloadPromises), preloadTimeout]);

                                // Restart and begin playback after preloading attempt.
                                const handleSeeked = () => {
                                    video.removeEventListener('seeked', handleSeeked);
                                    console.log('[AD] Video seeked to start.');
                                    const pauseAdButton = sidebar.querySelector('#pause-ad-group .pill-button[data-action="pause-on"].active');
                                    if (pauseAdButton) {
                                        console.log('[AD] Pausing video for generated AD...');
                                        video.pause();
                                        window.shouldResumeAfterFirstAD = true;
                                        // Kick one autoplay check immediately so first AD can start while paused.
                                        setTimeout(() => {
                                            video.dispatchEvent(new Event('timeupdate'));
                                        }, 50);
                                    } else {
                                        console.log('[AD] Playing video...');
                                        video.play();
                                    }
                                };
                                video.addEventListener('seeked', handleSeeked);
                                video.currentTime = 0;

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
                            generateAdButton.setAttribute('aria-label', 'Regenerate Audio Description');
                            generateAdButton.disabled = false;
                            
                            // Announce to VoiceOver via aria-live region
                            const announcer = sidebar.querySelector('#button-state-announcer');
                            if (announcer) {
                                announcer.textContent = 'Audio description generation complete. Ready to regenerate.';
                            }
                        }
                    });
                }

                const restoreSettingsButtons = sidebar.querySelectorAll('#restore-settings-button');
                if (restoreSettingsButtons.length > 0) {
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
                        vqaGender: 'female'
                    };

                    // Add the same event listener to all restore settings buttons
                    restoreSettingsButtons.forEach(restoreSettingsButton => {
                        restoreSettingsButton.addEventListener('click', async () => {
                            try {
                                const user = window.FirebaseAPI?.getCurrentUser();
                                if (!user || !window.DatabaseIntegration) {
                                    console.log('[CustomQA] Restore Settings: Not logged in or database not available');
                                    return;
                                }

                                restoreSettingsButton.disabled = true;
                                restoreSettingsButton.textContent = 'Restoring...';

                                // Restore always means return to original defaults.
                                const defaultSettings = { ...DEFAULT_SETTINGS };
                                console.log('[CustomQA] Applying original default settings');

                                // Restore presentation customization
                                const adSliders = {
                                    volume: sidebar.querySelector('#ad-volume-slider'),
                                    speed: sidebar.querySelector('#ad-speed-slider'),
                                    length: sidebar.querySelector('#length-slider')
                                };

                                if (defaultSettings.adVolume && adSliders.volume) adSliders.volume.value = defaultSettings.adVolume;
                                if (defaultSettings.adSpeed && adSliders.speed) adSliders.speed.value = defaultSettings.adSpeed;
                                if (defaultSettings.adLength && adSliders.length) adSliders.length.value = defaultSettings.adLength;

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
                                if (defaultSettings.adGender) {
                                    setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-gender]', 'gender', defaultSettings.adGender);
                                }
                                if (defaultSettings.adVoice) {
                                    setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-voice]', 'voice', defaultSettings.adVoice);
                                }

                                // Restore content customization
                                if (defaultSettings.adFrequency) {
                                    setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-frequency]', 'frequency', defaultSettings.adFrequency);
                                }
                                if (defaultSettings.adEmphasis) {
                                    setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-emphasis]', 'emphasis', defaultSettings.adEmphasis);
                                }
                                if (defaultSettings.adColorPreference) {
                                    setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-color]', 'color', defaultSettings.adColorPreference);
                                }
                                if (defaultSettings.adNarrationStyle) {
                                    setButtonByDataAttr('#audio-descriptions-tab .pill-button[data-narration]', 'narration', defaultSettings.adNarrationStyle);
                                }

                                // Restore customization setups
                                if (defaultSettings.adPauseDuringAd !== undefined) {
                                    const pauseAction = defaultSettings.adPauseDuringAd ? 'pause-on' : 'pause-off';
                                    setButtonByDataAttr('#pause-ad-group .pill-button', 'action', pauseAction);
                                }

                                // Restore Audio Description ON/OFF status if available
                                if (defaultSettings.adEnabled !== undefined) {
                                    const adToggleButtons = sidebar.querySelectorAll('#audio-descriptions-tab > .section:nth-child(3) .button-group .pill-button');
                                    if (adToggleButtons.length >= 2) {
                                        const onBtn = adToggleButtons[0];
                                        const offBtn = adToggleButtons[1];
                                        if (defaultSettings.adEnabled) {
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
                                    speed: sidebar.querySelector('#vqa-speed-slider')
                                };

                                if (defaultSettings.vqaVolume !== undefined && vqaSliders.volume) vqaSliders.volume.value = defaultSettings.vqaVolume;
                                if (defaultSettings.vqaSpeed !== undefined && vqaSliders.speed) vqaSliders.speed.value = defaultSettings.vqaSpeed;

                                // Restore VQA Gender and Voice if available
                                if (defaultSettings.vqaGender) {
                                    setButtonByDataAttr('#vqa-tab .pill-button[data-gender]', 'gender', defaultSettings.vqaGender);
                                }
                                if (defaultSettings.vqaVoice) {
                                    setButtonByDataAttr('#vqa-tab .pill-button[data-voice]', 'voice', defaultSettings.vqaVoice);
                                }

                                // Sync runtime settings manager so behavior updates immediately.
                                settings.set('volume', defaultSettings.adVolume);
                                settings.set('speed', defaultSettings.adSpeed);
                                settings.set('voice', defaultSettings.adVoice);
                                settings.set('gender', defaultSettings.adGender);
                                settings.set('adLength', defaultSettings.adLength);
                                settings.set('adFrequency', defaultSettings.adFrequency);
                                settings.set('adEmphasis', defaultSettings.adEmphasis);
                                settings.set('adColor', defaultSettings.adColorPreference);
                                settings.set('adNarrationStyle', defaultSettings.adNarrationStyle);
                                settings.set('adPauseDuringAd', defaultSettings.adPauseDuringAd);

                                console.log('[CustomQA] Default settings applied to UI and runtime');

                                // Persist defaults to user profile for both AD and VQA settings.
                                try {
                                    await window.DatabaseIntegration.saveADSettings(defaultSettings);
                                    await window.DatabaseIntegration.saveVQASettings(defaultSettings);
                                    console.log('[CustomQA] Default settings persisted to user profile');
                                } catch (error) {
                                    console.error('[CustomQA] Error persisting default settings:', error);
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
                    
                    const gender = settings.get('gender', 'female');
                    
                    descriptions.forEach((desc, index) => {
                        const messageContainer = document.createElement('div');
                        messageContainer.style.display = 'flex';
                        messageContainer.style.alignItems = 'flex-start';
                        messageContainer.style.gap = '8px';
                        messageContainer.style.marginBottom = '12px';
                        
                        const currentTs = desc.timestamp;
                        const nextTs = Number.isFinite(desc.endTimestamp) ? desc.endTimestamp : (descriptions[index + 1]?.timestamp || video.duration);
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
                            
                            // Prevent simultaneous audio playback: stop any currently playing audio from different button
                            if (currentAudio && currentPlayingButton !== thisButton) {
                                try {
                                    currentAudio.stop();
                                    currentAudio = null;
                                    if (currentPlayingButton) {
                                        setButtonToSpeakerIcon(currentPlayingButton);
                                    }
                                    currentPlayingButton = null;
                                } catch (e) {
                                    // Ignore error if audio is already stopped
                                }
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
                                    gender: gender,
                                    speed: settings.get('speed', 50)
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
                        const gender = settings.get('gender', 'female');
                        
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
                        
                        if (!isAudioDescriptionEnabled()) {
                            return;
                        }
                        
                        // Verify ADs belong to current video before auto-playing.
                        const scheduleVideoId = getYoutubeVideoId(adScheduleVideoUrl);
                        const currentVideoId = getYoutubeVideoId(window.location.href);
                        if (!adScheduleVideoUrl || (scheduleVideoId && currentVideoId && scheduleVideoId !== currentVideoId)) {
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
                                
                                const gender = settings.get('gender', 'female');
                                
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
                                        if (shouldPause) {
                                            console.log('[AD] Resuming video');
                                            video.play();
                                        }
                                    });
                                } else {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: nextAd.description,
                                        gender: gender,
                                        speed: settings.get('speed', 50)
                                    }, (ttsResponse) => {
                                        if (ttsResponse && ttsResponse.success) {
                                            preloadedAudioMap.set(nextAd.description, ttsResponse.audioDataUrl);
                                            speakerBtn.setAttribute('data-audio-url', ttsResponse.audioDataUrl);
                                            playAudioFromDataUrl(ttsResponse.audioDataUrl, speakerBtn, () => {
                                                console.log('[AD] AD audio ended');
                                                if (shouldPause) {
                                                    console.log('[AD] Resuming video');
                                                    video.play();
                                                }
                                            });
                                        } else {
                                            console.error('OpenAI TTS error:', ttsResponse?.error);
                                            isPlayingAd = false;
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

                const related = secondary.querySelector('#related');
                if (related) {
                    related.prepend(sidebar);
                } else {
                    secondary.prepend(sidebar);
                }

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
                                
                                // Prevent simultaneous audio playback: stop any currently playing audio from different button
                                if (currentAudio && currentPlayingButton !== thisButton) {
                                    try {
                                        currentAudio.stop();
                                        currentAudio = null;
                                        if (currentPlayingButton) {
                                            setButtonToSpeakerIcon(currentPlayingButton);
                                        }
                                        currentPlayingButton = null;
                                    } catch (e) {
                                        // Ignore error if audio is already stopped
                                    }
                                }
                                
                                const genderUser = settings.get('gender', 'female');
                                const textToSpeak = thisButton.getAttribute('data-text');
                                const audioUrl = thisButton.getAttribute('data-audio-url');

                                if (audioUrl) {
                                    playAudioFromDataUrl(audioUrl, thisButton);
                                } else if (textToSpeak) {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak,
                                        gender: genderUser,
                                        speed: settings.get('speed', 50)
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

                            const genderUser = settings.get('gender', 'female');
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
                            aiTextSpan.setAttribute('aria-live', 'assertive');
                            aiTextSpan.setAttribute('aria-atomic', 'true');
                            aiMessage.appendChild(aiTextSpan);
                            
                            // Scroll response bubble into view
                            aiMessageContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });

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
                                
                                // Prevent simultaneous audio playback: stop any currently playing audio from different button
                                if (currentAudio && currentPlayingButton !== thisButton) {
                                    try {
                                        currentAudio.stop();
                                        currentAudio = null;
                                        if (currentPlayingButton) {
                                            setButtonToSpeakerIcon(currentPlayingButton);
                                        }
                                        currentPlayingButton = null;
                                    } catch (e) {
                                        // Ignore error if audio is already stopped
                                    }
                                }

                                const textToSpeak = aiTextSpan.textContent;
                                const audioUrl = thisButton.getAttribute('data-audio-url');
                                const genderAI = settings.get('gender', 'female');

                                if (audioUrl) {
                                    playAudioFromDataUrl(audioUrl, thisButton);
                                } else if (textToSpeak && textToSpeak !== 'Thinking...') {
                                    chrome.runtime.sendMessage({
                                        type: 'CALL_OPENAI_TTS',
                                        text: textToSpeak,
                                        gender: genderAI,
                                        speed: settings.get('speed', 50)
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

                                const wordCount = settings.get('adLength', 25);

                                const sendGeminiRequest = async (timestampSeconds) => {
                                    try {
                                        const youtubeUrl = window.location.href;
                                        const timeToAnalyze = timestampSeconds || video.currentTime;
                                        const timeLabel = formatTime(timeToAnalyze);

                                        console.log(`[VQA] Sending URL + timestamp ${timeLabel} to Gemini`);

                                        const prompt = `User is watching a YouTube video. 
Analyze the video at timestamp ${timeLabel} and answer their question.

User's question: "${question}"

Look at the video content around the timestamp ${timeLabel}. Please provide a clear, concise answer to their question based on what's visible in the video at that time.
If the key evidence is slightly before/after this timestamp, explicitly say where you observed it using a timestamp in your answer.
Answer in approximately ${wordCount} words.`;

                                        return new Promise((resolve) => {
                                            chrome.runtime.sendMessage({
                                                type: 'CALL_GEMINI_VQA',
                                                prompt: prompt,
                                                videoUrl: youtubeUrl,
                                                timestamp: timeToAnalyze
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
                                        "is not visible",
                                        "there is no",
                                        "is no",
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
                                    const initialTimestamp = video.currentTime;
                                    let usedTimestamp = initialTimestamp;
                                    // Try both directions for each offset: -3s/+3s, then -9s/+9s, then -30s/+30s
                                    const fallbackOffsets = [{offset: 3, direction: -1}, {offset: 3, direction: 1}, {offset: 9, direction: -1}, {offset: 9, direction: 1}, {offset: 30, direction: -1}, {offset: 30, direction: 1}];
                                    
                                    aiTextSpan.textContent = `Analyzing at ${formatTime(initialTimestamp)}...`;
                                    let response = await sendGeminiRequest(initialTimestamp);
                                    aiTextSpan.textContent = 'Processing...';

                                    if (isValidResponse(response)) {
                                        console.log('[VQA] Got valid response at initial timestamp');
                                    } else {
                                        console.log('[VQA] Initial response invalid, expanding in both directions');
                                        const offsetSizes = [3, 9, 30, 60];
                                        
                                        for (const offset of offsetSizes) {
                                            const beforeTimestamp = Math.max(0, initialTimestamp - offset);
                                            const afterTimestamp = Math.min(initialTimestamp + offset, video.duration);
                                            
                                            aiTextSpan.textContent = `Analyzing at ${formatTime(beforeTimestamp)} and ${formatTime(afterTimestamp)}...`;
                                            
                                            // Try both directions in parallel
                                            const [responseBefore, responseAfter] = await Promise.all([
                                                sendGeminiRequest(beforeTimestamp),
                                                sendGeminiRequest(afterTimestamp)
                                            ]);
                                            
                                            // Use the first valid response
                                            if (isValidResponse(responseBefore)) {
                                                response = responseBefore;
                                                usedTimestamp = beforeTimestamp;
                                                console.log(`[VQA] Got valid response at -${offset}s (${formatTime(beforeTimestamp)})`);
                                                break;
                                            } else if (isValidResponse(responseAfter)) {
                                                response = responseAfter;
                                                usedTimestamp = afterTimestamp;
                                                console.log(`[VQA] Got valid response at +${offset}s (${formatTime(afterTimestamp)})`);
                                                break;
                                            }
                                        }
                                    }

                                    aiTextSpan.textContent = 'Thinking...';

                                    if (response && response.success) {
                                        const observedAtTimestamp = formatTime(usedTimestamp);
                                        const responseWithTimestamp = usedTimestamp === initialTimestamp
                                            ? `[${askedAtTimestamp}] ${response.text}`
                                            : `[${askedAtTimestamp}] (Observed at ${observedAtTimestamp}) ${response.text}`;
                                        aiTextSpan.textContent = responseWithTimestamp;
                                        speakerBtn.setAttribute('data-text', responseWithTimestamp);
                                        speakerBtn.style.opacity = '1';
                                        
                                        const user = window.FirebaseAPI?.getCurrentUser();
                                        if (user && window.DatabaseIntegration) {
                                            const videoUrl = window.location.href;
                                            
                                            // Gather ALL VQA presentation customizations
                                            const vqaVolumeSlider = sidebar.querySelector('#vqa-volume-slider');
                                            const vqaSpeedSlider = sidebar.querySelector('#vqa-speed-slider');
                                            const vqaVoiceBtn = sidebar.querySelector('#vqa-tab .pill-button[data-voice].active');
                                            const vqaGenderBtn = sidebar.querySelector('#vqa-tab .pill-button[data-gender].active');
                                            const customizations = {
                                                vqaVolume: vqaVolumeSlider ? parseInt(vqaVolumeSlider.value) : 100,
                                                vqaSpeed: vqaSpeedSlider ? parseInt(vqaSpeedSlider.value) : 50,
                                                vqaVoice: vqaVoiceBtn ? vqaVoiceBtn.dataset.voice : 'human',
                                                vqaGender: vqaGenderBtn ? vqaGenderBtn.dataset.gender : 'female',
                                                // Persist as vqaLength in each VQA document, sourced from shared AD length.
                                                vqaLength: settings.get('adLength', 25)
                                            };
                                            
                                            const messages = [
                                                { role: 'user', content: question, timestamp: Date.now() },
                                                { role: 'assistant', content: responseWithTimestamp, timestamp: Date.now() }
                                            ];
                                            
                                            await window.DatabaseIntegration.saveGeneratedVQA(videoUrl, video.duration, customizations, messages);
                                        }
                                        
                                        const genderResp = settings.get('gender', 'female');
                                        preloadAndStoreAudio(responseWithTimestamp, speakerBtn, genderResp);

                                        chrome.runtime.sendMessage({
                                            type: 'CALL_OPENAI_TTS',
                                            text: responseWithTimestamp,
                                            gender: genderResp,
                                            speed: settings.get('speed', 50)
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

    const init = async () => {
        try {
            console.log('[CustomQA] Starting initialization...');
            await settings.init();
            console.log('[CustomQA] Settings initialized, calling newVideoLoaded()');
            newVideoLoaded();
            console.log('[CustomQA] newVideoLoaded() completed');
        } catch (err) {
            console.error('[CustomQA] Initialization error:', err);
        }
    };

    // Initial load
    console.log('[CustomQA] Loading extension...');
    init();

    // Handle navigations in YouTube (which is a single-page app)
    document.addEventListener("yt-navigate-finish", () => {
        console.log('[CustomQA] YouTube navigation detected');
        // Remove old sidebar if it exists
        const oldSidebar = document.getElementById("custom-qa-sidebar");
        if (oldSidebar) {
            console.log('[CustomQA] Removing old sidebar');
            oldSidebar.remove();
        }
        // Try to inject sidebar on new page
        console.log('[CustomQA] Reinitializing on new page');
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
