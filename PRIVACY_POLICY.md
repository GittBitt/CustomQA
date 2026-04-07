# Privacy Policy for CustomQA

**Effective Date:** April 7, 2026  
**Last Updated:** April 7, 2026

## 1. Introduction

CustomQA ("we," "us," "our," or the "Service") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our browser extension, website, and related services.

Please read this Privacy Policy carefully. If you do not agree with our policies and practices, please do not use our Service.

## 2. Information We Collect

### 2.1 Information You Provide Directly

**Account Information:**
- Email address
- Password (securely handled by Firebase Authentication)
- Account creation and authentication data

**User Preferences and Settings:**
- Audio description preferences (volume, speed, voice gender, narration style, emphasis type)
- Visual Question & Answer (VQA) preferences (volume, speed, response length, time window)
- Content customization options (color descriptions, frequency settings, pause preferences)
- Custom setup configurations you create and save

**Audio and Voice Data:**
- Audio recordings from your microphone when you ask questions via the VQA feature
- Transcriptions of voice input
- Generated audio descriptions and responses

**Browsing Information:**
- URLs of YouTube videos you access
- Video timestamps when you interact with our features
- Viewing context and tab information

### 2.2 Information Collected Automatically

**Extension Usage Data:**
- Feature usage patterns (which features you use and when)
- Interaction events with the extension interface
- Error logs and performance diagnostics
- Browser storage data (settings, authentication tokens, cache)

**Technical Information:**
- Browser type and version
- Operating system
- Extension version
- IP address (via server logs)
- Request timestamp and duration
- Click-through data on extension UI elements

## 3. How We Use Your Information

We use the information we collect for the following purposes:

### 3.1 Core Service Delivery
- Providing audio descriptions for YouTube videos
- Processing and answering visual questions about video content
- Personalizing your experience with your saved preferences
- Authenticating your account and maintaining your login session

### 3.2 AI Model Processing
- Sending video context and your questions to OpenAI's API to generate audio descriptions and answers
- Processing your audio input through Google's speech-to-text and text-to-speech APIs
- Analyzing visual content using Google's Generative Language API

### 3.3 Data Storage and Retrieval
- Storing your preferences and settings in Firebase Firestore
- Retrieving your saved configurations across sessions and devices
- Maintaining your authentication state

### 3.4 Service Improvement
- Analyzing usage patterns to improve feature functionality
- Identifying bugs and issues through error logs
- Optimizing performance and user experience
- Understanding which features are most valuable to users

### 3.5 Security and Compliance
- Detecting and preventing fraud or security threats
- Complying with legal obligations
- Protecting our systems and users from malicious activity

## 4. Third-Party Services and Data Sharing

Your information may be shared with or processed by the following third-party services:

### 4.1 Firebase (Google Cloud)
- **Purpose:** User authentication, account management, and data storage
- **Data Shared:** Email address, user ID, authentication tokens, user preferences, and settings
- **Privacy Policy:** [https://firebase.google.com/support/privacy](https://firebase.google.com/support/privacy)

### 4.2 OpenAI API
- **Purpose:** Generating audio descriptions and answering visual questions
- **Data Shared:** Video context information, timestamps, your questions
- **Note:** You should review OpenAI's data usage policies as audio descriptions may be retained for improving their services
- **Privacy Policy:** [https://openai.com/policies/privacy-policy](https://openai.com/policies/privacy-policy)

### 4.3 Google APIs (Text-to-Speech, Speech-to-Text, Generative Language)
- **Purpose:** Converting text to speech, transcribing audio, analyzing visual content
- **Data Shared:** Audio data, text content, visual context from videos
- **Privacy Policy:** [https://policies.google.com/privacy](https://policies.google.com/privacy)

### 4.4 YouTube (Google)
- **Purpose:** Accessing content and context from YouTube videos you're watching
- **Data Shared:** Video URLs, viewing context, timestamps
- **Privacy Policy:** [https://policies.google.com/privacy](https://policies.google.com/privacy)

### 4.5 CustomQA Backend Server
- **Purpose:** Processing requests, routing data to AI services, maintaining authorization
- **Data Shared:** All request data is processed through our secure backend
- **Security:** We implement CORS restrictions to only accept requests from our extension

## 5. Data Security

We take the security of your personal information seriously and implement industry-standard measures to protect it:

### 5.1 Technical Safeguards
- End-to-end encryption for authentication data
- Secure HTTPS connections for all data transmission
- Firebase's built-in security rules for database access
- Regular security logging and monitoring
- CORS restrictions to prevent unauthorized data access

### 5.2 Access Controls
- Only authenticated users can access their own data
- Server-side verification of authentication tokens
- Role-based access controls
- Limited data retention for temporary processing data

### 5.3 Infrastructure Security
- Deployment on secure, managed cloud platforms
- Automated security monitoring
- Regular security updates and patches

**Important Note:** No method of transmission over the internet is 100% secure. While we employ strong security measures, we cannot guarantee absolute security of your information.

## 6. Your Privacy Rights

Depending on your location, you may have the following rights:

### 6.1 Access and Portability
- You have the right to request a copy of your personal information
- You can export your preferences and settings

### 6.2 Correction
- You can update or correct your account information at any time

### 6.3 Deletion
- You may request deletion of your account and associated personal data
- Upon deletion, your profile, settings, and preferences will be permanently removed
- Some aggregate or anonymized data may be retained for service improvement

### 6.4 Opt-Out
- You can disable the extension at any time
- You can change your preferences within the extension settings
- You can manage which third-party APIs access your data

### 6.5 Right to Withdraw Consent
- You can withdraw consent for data processing at any time by disabling the extension or deleting your account

**To exercise these rights:** Contact us at [nphuynh2@asu.edu](mailto:nphuynh2@asu.edu) with "Privacy Request" in the subject line

## 7. Data Retention

We retain your information as follows:

- **Account Data:** Maintained for as long as your account is active, plus 30 days
- **Settings and Preferences:** Maintained for as long as your account is active
- **Audio Recordings:** Temporarily stored for processing (typically deleted within 24 hours)
- **Usage Logs:** Retained for up to 90 days for debugging and analytics
- **OpenAI Processed Data:** Subject to OpenAI's retention policies; refer to their privacy policy

Upon account deletion, all personal data is removed within 30 days, except where legally required to retain it.

## 8. Cookies and Tracking Technologies

Our extension uses:

- **Authentication Tokens:** Stored in browser local storage to maintain your login session
- **User Preferences:** Cached locally for better performance
- **Analytics Cookies:** None (we do not use traditional cookies for tracking)

You can clear your browser data through your browser settings to remove stored tokens and preferences.

## 9. Children's Privacy

CustomQA is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that a child under 13 has provided us with personal information, we will take steps to delete such information promptly.

If you believe a child under 13 has created an account or provided information, please contact us immediately.

## 10. International Data Transfers

Your information may be transferred to, stored in, and processed in countries other than your country of residence, including the United States. These countries may have data protection laws that differ from your country of origin. By using CustomQA, you consent to the transfer of your information to countries outside your country of residence, which may have different data protection rules.

We rely on appropriate safeguards, such as Standard Contractual Clauses, for international transfers of personal data.

## 11. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors. We will notify you of any material changes by:

- Posting the updated Privacy Policy in the extension
- Updating the "Last Updated" date at the top of this policy
- Sending you an email notification (for significant changes)

Your continued use of the Service after any modifications to the Privacy Policy signifies your acceptance of the updated terms. We encourage you to review this policy periodically to stay informed about how we protect your information.

## 12. Your California Privacy Rights (CCPA)

If you are a California resident, you have the following rights under the California Consumer Privacy Act (CCPA):

- **Right to Know:** Request information about the categories and specific pieces of personal information we collect
- **Right to Delete:** Request deletion of personal information we have collected
- **Right to Opt-Out:** Opt out of the sale or sharing of personal information (we do not sell personal information)
- **Right to Non-Discrimination:** We do not discriminate against you for exercising your CCPA rights

To submit a CCPA request, contact us at [nphuynh2@asu.edu](mailto:nphuynh2@asu.edu) with "CCPA Request" in the subject line. We will respond within 45 days.

## 13. Your European Privacy Rights (GDPR)

If you are located in the European Union or European Economic Area, the General Data Protection Regulation (GDPR) may apply. You have the following rights:

- **Right to Access:** Request access to your personal data
- **Right to Rectification:** Correct inaccurate or incomplete data
- **Right to Erasure:** Request deletion of your data ("right to be forgotten")
- **Right to Restrict Processing:** Limit how we process your data
- **Right to Data Portability:** Receive your data in a portable format
- **Right to Object:** Object to certain processing activities
- **Right to Lodge a Complaint:** File a complaint with your data protection authority

**Legal Basis for Processing:** We process your data based on:
- Your consent (account registration, feature use)
- Contractual necessity (providing the Service)
- Legal obligations (security, fraud prevention)
- Legitimate interests (improving the Service, ensuring security)

To exercise these rights, contact us at [nphuynh2@asu.edu](mailto:nphuynh2@asu.edu) with "GDPR Request" in the subject line.

## 14. Contact Us

If you have questions about this Privacy Policy or our privacy practices, please contact us:

**Email:** [nphuynh2@asu.edu](mailto:nphuynh2@asu.edu)  
**Mailing Address:**  
CustomQA  
[Your Company Address]  
[City, State/Province, Postal Code]  
[Country]

**Data Protection Officer (if applicable):**  
[DPO Email]

**Response Time:** We will respond to all privacy inquiries within 30 days of receipt.

## 15. Additional Information

### 15.1 Third-Party Links
Our extension may contain links to third-party websites and services that are not operated by us. This Privacy Policy does not apply to third-party services, and we are not responsible for their privacy practices. Please review their privacy policies before providing any personal information.

### 15.2 YouTube Integration
CustomQA is designed to enhance your YouTube experience. YouTube is governed by Google's privacy policy. We do not collect information from YouTube beyond what is necessary to provide audio descriptions and answer visual questions about content you're viewing.

### 15.3 Do Not Track Signals
Some browsers include a "Do Not Track" feature. Currently, there is no industry standard for recognizing Do Not Track signals. Our extension does not respond to Do Not Track browser signals, but you can disable the extension at any time.

---

**Thank you for trusting CustomQA with your data. Your privacy is important to us.**
