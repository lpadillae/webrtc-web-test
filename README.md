# WebRTC Diagnostic & CoTURN Validator

A professional, cloud-native diagnostic tool for WebRTC infrastructure. This application allows you to validate STUN/TURN servers, analyze ICE gathering in real-time, and perform 1-on-1 video calls to test CoTURN relay performance.

## 🚀 Features

- **ICE Diagnostic**: Detailed breakdown of Host, Srflx (STUN), and Relay (TURN) candidates.
- **Dynamic Configuration**: Add and persist custom STUN/TURN servers via the UI (stored in `localStorage`).
- **ICE Transport Policy**: Toggle between `ALL` and `RELAY ONLY` to force TURN validation.
- **1-on-1 Video Call**: Built-in signaling (Socket.io) to test P2P connectivity through your TURN server.
- **Real-time Logging**: Live console with export to `.txt` functionality.
- **Mobile Optimized**: Support for front-facing cameras and responsive layout.

## 🛠️ Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- npm (v8+)

### 1. Clone & Install

```bash
# Clone the repository (if applicable)
# Navigate to the project directory
cd webrtc-web-test

# Install dependencies
npm install
```

### 2. Configuration (`.env`)

Create a `.env` file in the root directory (you can use `.env.example` as a template):

```bash
PORT=3000
# Optional: Default ICE servers provided by the backend
ICE_SERVERS_JSON='[{"urls":"stun:stun.l.google.com:19302"}]'
```

### 3. Run Locally

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🌉 Signaling Bridge (Local <-> Railway)

To test a connection between your local environment and a deployed Railway instance:

1. Deploy the latest version of this app to Railway.
2. Run the app locally (`npm start`).
3. Access the local app with the `signaling` query parameter pointing to your Railway URL:
   `http://localhost:3000/?signaling=https://your-app.up.railway.app`

This allows the local client to use the Railway signaling server, bridging the communication with participants on the public URL.

## ☁️ Deployment

This project is configured for easy deployment on **Railway.app**.
Check the `railway_deployment_guide.md` in the `brain/` directory for detailed steps.

## ⚠️ Important Note on Media Access

WebRTC requires a **Secure Context (HTTPS)** to access the camera and microphone. 
- When running on Railway, ensure you are using the `https://` domain.
- When running locally, `http://localhost` is considered a secure context by most browsers.

---
Built with Node.js, Socket.io, and Tailwind CSS.
