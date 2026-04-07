# CustomQA

CustomQA is a browser extension that adds accessibility features to YouTube videos. It generates audio descriptions of video content and enables visual question-answering through an intuitive sidebar interface.

## Overview

CustomQA enhances YouTube viewing by providing:
- **Audio Descriptions**: AI-generated narrations describing what's happening in videos
- **Visual Question & Answer**: Ask questions about video content and get instant answers

The extension works by analyzing video context using AI models and presenting information through the browser sidebar.

## Tech Stack

### Frontend (Browser Extension)

**Framework & Languages:**
- Vanilla HTML5, CSS3, JavaScript (ES6+)
- Chrome Extension Manifest v3

**Key Files:**
- `popup.html/popup.js` - Extension popup interface
- `sidebar.html/sidebar.css/sidebar.js` - Sidebar UI for audio descriptions and VQA
- `contentScript.js` - Content script injected into YouTube pages (handles UI injection and audio playback)
- `auth-ui.js` - Authentication UI components
- `firebase-rest-api.js` - Firebase authentication and database operations

**Libraries & APIs:**
- Chrome Storage API (local and sync storage)
- Chrome Tabs API (tab detection and management)
- Web Audio API (audio playback with volume/speed control)
- Native Speech-to-Text and Text-to-Speech via Google APIs

### Backend (API Server)

**Framework & Runtime:**
- Node.js with Express.js
- ES Modules (type: "module" in package.json)

**Key Responsibilities:**
- Token verification and authentication gateway
- Routing requests to external AI APIs (OpenAI, Google Gemini)
- User settings and preferences storage
- Caching generated audio descriptions and VQA responses
- User signup, login, and token refresh management

**Key Files:**
- `backend/server.js` - Express server with all API endpoints
- `backend/package.json` - Backend dependencies

**API Endpoints:**
- `POST /api/call-gemini` - Generate video analysis
- `POST /api/call-whisper` - Transcribe microphone audio (for VQA questions)
- `POST /api/call-tts` - Convert text to speech
- `POST /api/settings/:type` - Save user preferences
- `GET /api/settings/:type` - Load user preferences
- `POST /api/videos/ad` - Cache audio descriptions
- `POST /api/videos/vqa` - Cache VQA responses
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh-token` - Token refresh

### Database & Storage

**Primary:**
- Firebase Cloud Firestore - Stores user accounts, preferences, and generated content
- Firebase Authentication - Manages user login/signup and session tokens

**Backup:**
- Firebase Realtime Database - Alternative storage for settings synchronization

### External AI APIs

**OpenAI:**
- Purpose: Generate audio descriptions from video context
- Model: GPT-4 (chat completions) for text generation
- Text-to-Speech for converting descriptions to audio

**Google:**
- Generative Language API (Gemini) - Analyze video content and answer questions
- Text-to-Speech API - Voice synthesis for audio output
- Speech-to-Text API - Transcribe user voice input for VQA questions

**YouTube:**
- Content accessibility for video metadata and context

### Infrastructure & Hosting

**Development:**
- Local: `http://localhost:3000` (backend server)
- Extension: Runs in Chrome locally with extension ID

**Production:**
- Backend: Deployed to Render (`https://customqa.onrender.com`)
- Database: Firebase Cloud (Google Cloud infrastructure)
- APIs: Managed through secure backend routing

## Architecture

### Request Flow

1. **User Action** - User clicks "Generate AD" or asks a VQA question in the sidebar
2. **Content Script** - `contentScript.js` captures video context and sends request to background script
3. **Background Service Worker** - `background.js` retrieves authentication token and sends request to backend
4. **Backend Server** - Validates token, retrieves/generates content, calls external APIs
5. **External APIs** - OpenAI and Google APIs process requests and return results
6. **Storage** - Results cached in Firestore for future use
7. **Response** - Data returned to content script
8. **UI Update** - Sidebar displays audio description or VQA response
9. **Playback** - Web Audio API handles audio playback with user-configured settings

### Security Considerations

**Token Management:**
- Firebase tokens stored securely in Chrome storage
- Backend validates all tokens before processing requests
- Automatic token refresh on expiration

**CORS Protection:**
- Backend only accepts requests from the extension (`chrome-extension://`)
- Prevents unauthorized API access

**API Key Security:**
- OpenAI and Google API keys stored on backend only
- Never exposed to extension or frontend
- All external API calls routed through backend

**User Data Privacy:**
- User settings encrypted in transit (HTTPS)
- Firestore rules ensure users only access their own data
- No third-party tracking or analytics

## Configuration

### Environment Variables

**Backend (.env file):**
```
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_API_KEY=your_firebase_api_key
GOOGLE_GEMINI_API_KEY=your_google_gemini_key
OPENAI_API_KEY=your_openai_api_key
OPENAI_ORG_ID=your_org_id
PORT=3000
NODE_ENV=development
EXTENSION_ID=your_extension_id
BACKEND_URL=http://localhost:3000/
```

**Extension (manifest.json):**
- Host permissions configured for YouTube, Firebase APIs, and external AI services
- Content script configured to inject on all YouTube video pages

## Development Workflow

### Local Setup

1. Clone repository
2. Install backend dependencies: `cd backend && npm install`
3. Create `.env` file with API keys and Firebase credentials
4. Start backend: `npm start`
5. Load extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select project folder

### Testing

- Test extension on YouTube videos
- Verify audio descriptions generate correctly
- Test VQA questions and responses
- Check settings persist across page reloads
- Monitor backend logs for errors

### Deployment

**Backend to Render:**
- Push to GitHub/connected repository
- Render auto-deploys on push
- Set environment variables in Render dashboard
- Update BACKEND_URL in manifest to Render URL

**Extension to Chrome Web Store:**
- Package as .zip
- Submit with privacy policy and manifest justifications
- Await review and approval

## File Structure

```
CustomQA/
├── popup.html / popup.js / popup.css
├── sidebar.html / sidebar.js / sidebar.css
├── contentScript.js
├── background.js
├── auth-ui.js
├── firebase-rest-api.js
├── database-integration.js
├── signup.html / login.html
├── manifest.json
├── package.json
├── PRIVACY_POLICY.md
├── MANIFEST_JUSTIFICATIONS.md
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── .env
│   └── .env.example
└── assets/
    └── activation.mp3
```

## Performance Considerations

**Frontend:**
- Chrome storage caching reduces API calls
- Web Audio API optimized for low-latency playback
- Sidebar rendered on-demand to minimize memory

**Backend:**
- Request rate limiting to prevent API quota exhaustion
- Response caching in Firestore (24-hour TTL)
- Efficient JSON parsing and transformation

**APIs:**
- Concurrent requests to Google and OpenAI APIs
- Fallback handling for API failures
- Token-based authentication with automatic refresh

## Known Limitations

- Audio descriptions require stable internet connection
- OpenAI and Google API calls incur costs
- Extension only works on YouTube.com
- Settings sync requires active Firebase authentication
- Content script only works on HTTPS YouTube pages

## Support

For issues or questions:
- Check backend logs: `npm start` in backend folder
- Verify API keys in .env file
- Check Chrome extension console (chrome://extensions/ -> Details -> Errors)
- Review CORS settings in backend/server.js

## Privacy & Compliance

- Full GDPR compliance (EU users)
- CCPA compliance (California users)
- COPPA compliance (children under 13 protected)
- See PRIVACY_POLICY.md for complete details
