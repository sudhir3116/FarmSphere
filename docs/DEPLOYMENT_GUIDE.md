# FarmSphere Backend & Twilio SMS Deployment Guide

This guide outlines the simplest deployment configuration for the FarmSphere Node.js backend, environment variables, and the Twilio delivery-status callback webhook setup.

---

## 1. Recommended Deployment Option: Render Web Service

The simplest, zero-cost-to-start hosting option for this backend is **Render** (via standard Node.js Web Service or Render Blueprint `render.yaml`).

### Key Advantages for Twilio Integration:
* **Native HTTPS**: Twilio requires public HTTPS endpoints for status callbacks. Render automatically provisions and manages free SSL/TLS certificates.
* **Zero Infrastructure Maintenance**: Connects directly to the GitHub repository (`sudhir3116/fpo-loan-system`) and builds automatically from `./backend`.
* **Built-in Health Checks**: Uses the existing `/api/health` endpoint for zero-downtime deploys.
* **Alternative Container Hosting**: A production [`Dockerfile`](file:///Users/sudhir31/Downloads/fpo-loan-system_ORG%202/backend/Dockerfile) is also provided in `backend/` for deployment on Railway, Fly.io, Google Cloud Run, or AWS App Runner.

---

## 2. Environment Variables Specification

Configure the following variables in your hosting provider's dashboard (e.g., Render Dashboard -> Environment Variables). **Never commit sensitive values to Git.**

### Core Backend & Database Configuration
| Variable | Required | Example / Format | Purpose |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Enables production security guards and optimized behavior |
| `PORT` | Yes | `10000` (Render default) or `5001` | Port on which the HTTP server listens |
| `MONGO_URI` | Yes | `mongodb+srv://<user>:<password>@cluster.mongodb.net/farmsphere?retryWrites=true&w=majority` | MongoDB Atlas database connection string |
| `JWT_SECRET` | Yes | 64+ char random hex string | Secret key for signing farmer/admin authentication tokens |
| `JWT_EXPIRE` | No | `7d` | Token validity period (defaults to 7d) |
| `CORS_ORIGIN` | Yes | `https://farmspherefinal.netlify.app,https://6ae36c2c903fa492dd80ff8e--farmspherefinal.netlify.app` | Exact allowed browser frontend origins (comma-separated; no trailing slashes) |
| `ADMIN_SECRET_KEY` | Yes | Random secure secret string | Gatekeeper key required for admin user registration |

### Twilio SMS Provider Configuration
| Variable | Required | Format | Purpose |
|---|---|---|---|
| `SMS_PROVIDER` | Yes | `twilio` | Selects Twilio Programmable Messaging as primary provider |
| `SMS_TEST_MODE` | Yes | `true` (Keep true until authorized live test) | Intercepts outbound SMS requests, safely simulating delivery |
| `TWILIO_ACCOUNT_SID` | Yes | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (34 chars) | Twilio Account SID from Twilio Console |
| `TWILIO_AUTH_TOKEN` | Yes | 32+ char token string | Twilio Auth Token (used for API dispatch & webhook verification) |
| `TWILIO_FROM_NUMBER` | Yes | `+1xxxxxxxxxx` (E.164 format) | Active Twilio phone number with SMS capability |
| `TWILIO_STATUS_CALLBACK_URL` | Recommended | `https://<deployed-domain>/api/webhooks/twilio` | Public HTTPS callback URL for handset delivery receipts |

### Fallback Provider (Fast2SMS)
| Variable | Required | Format | Purpose |
|---|---|---|---|
| `FAST2SMS_API_KEY` | Optional | API Key string | Preserved for rollback: used if `SMS_PROVIDER=fast2sms` |
| `SMS_ROUTE` | Optional | `q` (dev) or `dlt` (production) | Fast2SMS route selector |

---

## 3. Step-by-Step Deployment Walkthrough

### Step A: Deploy Backend to Render
1. Log in to [Render](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Select your GitHub repository (`fpo-loan-system`).
4. Configure the service settings:
   * **Name**: `farmsphere-backend`
   * **Root Directory**: `backend`
   * **Environment**: `Node`
   * **Build Command**: `npm install --omit=dev`
   * **Start Command**: `npm start`
   * **Health Check Path**: `/api/health`
5. In the **Environment Variables** tab, add the environment variables listed in Section 2.
   * **Important**: Keep `SMS_TEST_MODE=true` initially.
6. Click **Deploy Web Service**.
7. Once deployed, note your public URL:
   * Example: `https://farmsphere-backend.onrender.com`

For FarmSphere production and the supplied deploy preview, set `CORS_ORIGIN` in Render to the comma-separated origins shown above. The backend reads this allowlist before mounting API routes and handles browser preflight requests through the CORS middleware. Keep local origins in local development configuration only.

### Frontend API and Google Identity Services

- In Netlify, set `VITE_API_BASE_URL` to `https://farmsphere-cy3k.onrender.com/api`. The API client normalizes the suffix so `/api` is added exactly once; if the variable is omitted in a production build, it uses this production API URL rather than localhost.
- The login page uses the public `VITE_GOOGLE_CLIENT_ID` with Google Identity Services and sends the returned ID token to `POST /api/auth/google`. Add `https://farmspherefinal.netlify.app` and `https://6ae36c2c903fa492dd80ff8e--farmspherefinal.netlify.app` under Google Cloud Console → APIs & Services → Credentials → the matching OAuth client → Authorized JavaScript origins. Add any other Netlify deploy-preview domains only if those previews need Google sign-in.
- No redirect-based Google OAuth callback URL is used by this frontend flow; do not change backend callback settings as part of this CORS fix. Never put `GOOGLE_CLIENT_SECRET` in Netlify or any `VITE_*` variable.

---

### Step B: Configure Twilio Delivery-Status Callback
1. In Render, update the `TWILIO_STATUS_CALLBACK_URL` variable to your public endpoint:
   ```env
   TWILIO_STATUS_CALLBACK_URL=https://farmsphere-backend.onrender.com/api/webhooks/twilio
   ```
2. Log in to the [Twilio Console](https://console.twilio.com).
3. Navigate to: **Phone Numbers** -> **Manage** -> **Active Numbers**.
4. Click on your configured sender phone number.
5. Scroll down to the **Messaging Configuration** section:
   * Under **A Message Comes In**: leave empty or default.
   * Under **Status Callback URL**: enter your full webhook URL:
     `https://farmsphere-backend.onrender.com/api/webhooks/twilio`
   * HTTP Method: Select **HTTP POST**.
6. Click **Save Configuration**.

---

## 4. Verification & Live Readiness Checklist

Before switching `SMS_TEST_MODE=false` for live delivery:

1. **Health Check**:
   * Open `https://<deployed-domain>/api/health` in your browser.
   * Confirm response: `{"status":"success","message":"FPO Loan System Backend API is running", ...}`
2. **Webhook Verification Check**:
   * Test signature rejection with a fake request:
     ```bash
     curl -i -X POST https://<deployed-domain>/api/webhooks/twilio \
       -H "Content-Type: application/x-www-form-urlencoded" \
       -d "MessageSid=SM12345&MessageStatus=delivered"
     ```
   * Confirm response is `HTTP 401 Unauthorized` (`Invalid webhook signature`).
3. **India Regulatory / DLT Compliance (Mandatory for Indian +91 Numbers)**:
   * Standard international phone numbers without Indian DLT registration are blocked by Indian telecom operators.
   * To send loan-related transactional SMS to farmers:
     1. Complete Principal Entity (PE) registration on an Indian DLT portal (Vilpower/Jio/Airtel/PingConnect).
     2. Register Sender ID / Header (e.g., `FARMSP`) and Content Templates matching FarmSphere notification formats.
     3. Submit your PE ID and approved template IDs to Twilio via an India DLT regulatory bundle or Twilio Support ticket.
4. **Authorized Single Live Test**:
   * Once regulatory approval is verified by Twilio, set `SMS_TEST_MODE=false` in the deployed environment.
   * Trigger a single test notification (e.g. mobile OTP login or loan application) to an authorized internal test mobile number.
   * Inspect the server logs to confirm:
     * `[SMS Accepted] Dispatched via Twilio to +9198****3210 [SID: SMxxxxxxxx]`
     * `[Twilio Webhook] Processed status update for SMxxxxxxxx: delivered`
