# Formai Backend

Express + TypeScript API for AI-powered form generation with Google Forms export.

## Architecture

```
src/
├── index.ts          App bootstrap
├── config/
│   ├── db.ts         MongoDB connection
│   └── systemPrompt.ts Claude system prompt
├── controllers/
│   ├── formController.ts  Form generation/revision/finalization
│   ├── account/      Account management endpoints
│   └── auth/         Authentication endpoints
├── middleware/
│   ├── verifyJWT.ts  JWT authentication
│   └── rateLimiter.ts Rate limiting
├── models/
│   ├── user.model.ts
│   ├── form.model.ts
│   └── submission.model.ts
├── routes/           API route definitions
├── schemas/
│   └── formSchema.ts Zod schema for Google Form mapping
├── types/
│   └── custom.d.ts   Type declarations
└── utils/
    ├── claudeClient.ts      Anthropic Claude integration
    ├── googleFormService.ts Google Forms API service
    ├── formSchemaConverter.ts Schema conversion utilities
    └── recaptcha.ts         reCAPTCHA verification
```

## API Endpoints

Base URL: `/api`

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register user (reCAPTCHA + honeypot) |
| POST | `/auth/login` | Login, returns `{ success, message, token }` |
| GET | `/auth/google/callback` | OAuth callback, sets cookie |
| POST | `/auth/logout` | Clears auth cookie |

### Account

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/account` | Get current user profile |
| DELETE | `/account/google-link` | Unlink Google account |
| DELETE | `/account` | Delete account and data |

### Forms

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/form/generate-form` | Generate form from prompt |
| POST | `/form/revise-form/:formId` | Revise existing form |
| POST | `/form/finalize-form/:formId` | Export to Google Forms |
| GET | `/form/forms/history` | Get user's form history |

## Data Models

### User
- `fullName`, `email`, `password?`
- `googleId?`, `googleTokens?` (encrypted)
- `formsHistory[]`
- `dailyFormCreations { count, date }` (limit: 3/day)

### Form
- `userId`, `prompt`, `claudeResponse`
- `revisions[]`, `googleFormUrl?`, `revisionCount`

### Submission
- `formId`, `submittedData` (future use)

## Environment Variables

Create a `.env` file with:

```env
# Server
PORT=4000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/formai

# Authentication
JWT_SECRET=your-jwt-secret-key
ENCRYPTION_KEY=exactly-32-characters-here!!

# CORS
FRONTEND_URL=http://localhost:5173

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# reCAPTCHA
RECAPTCHA_SECRET_KEY=your-secret-key
```

### Important Notes

- `ENCRYPTION_KEY` must be exactly 32 characters (AES-256-CBC)
- `FRONTEND_URL` is used for CORS and OAuth redirect construction
- Google OAuth redirect URI: `${FRONTEND_URL}/auth/google/callback`

## Google OAuth Setup

1. Create OAuth 2.0 Client ID (Web application) in Google Cloud Console
2. Add authorized redirect URI: `http://localhost:5173/auth/google/callback`
3. Enable Google Forms API and Google Drive API
4. Required scopes:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/forms`
   - `https://www.googleapis.com/auth/drive.file`

## Development

```bash
# Install dependencies
npm install

# Run with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Deployment

The backend is deployed on **Azure App Service** with automated CI/CD via GitHub Actions.

### Pipeline Overview

```
push to main → GitHub Actions → Build & Test → Deploy to Azure
```

- **Trigger**: Push to `main` branch
- **Build**: TypeScript compilation, dependency installation
- **Deploy**: Automatic deployment to Azure App Service
- **Environment**: Managed via Azure App Service configuration

### Infrastructure

| Component | Service |
|-----------|----------|
| Hosting | Azure App Service (Node.js) |
| Database | MongoDB Atlas |
| CI/CD | GitHub Actions |
| Secrets | Azure App Service Environment Variables |

## Key Implementation Details

### Authentication Flow

- **Email/password**: Returns JWT in response body; also sets secure `token` cookie
- **Google OAuth**: Frontend builds consent URL → user authorizes → callback exchanges code → creates/links user
- `verifyJWT` middleware accepts tokens from cookie OR `Authorization: Bearer <token>` header

### Form Generation

1. Claude generates minified JSON using strict system prompt
2. Zod schema validates structure before Google API calls
3. Branch metadata added for dashboard preview

### Google Forms Export

1. Internal schema mapped to Google Forms BatchUpdate requests
2. Navigation (goTo) patched after section item IDs are known
3. Branching rules: radio/select options must include `goTo` (`NEXT_SECTION`, `SUBMIT_FORM`, or section title)

### Token Encryption

Google OAuth tokens are encrypted at rest using AES-256-CBC. Tokens are automatically refreshed during finalize if expired.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401/403 on finalize | Ensure Google is connected with Forms scope; reconnect if expired |
| CORS errors | Verify `FRONTEND_URL` matches actual frontend origin |
| Token encryption fails | Check `ENCRYPTION_KEY` is exactly 32 characters |
| Branching errors | Every radio/select option needs `goTo`; section titles must exist |
| Claude timeouts | API calls have increased timeouts; verify `ANTHROPIC_API_KEY` |

## License

MIT
