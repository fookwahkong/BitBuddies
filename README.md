# BitBuddies

BitBuddies is a Vite + React web application with an Express backend, Firebase Firestore, and OpenAI-powered helper flows.

This README is written for a hackathon-safe setup:

## Prerequisites

Make sure you have:

- Node.js 20 or later
- `npm`

## Required Local Files

To run the project locally, the following files must exist in the project root:

- `.env`
- `serviceAccountKey.json`

These files are intentionally not included in the public repo. Use:

- `.env.example` as the template for your local `.env`
- the team-provided Firebase Admin service account key for `serviceAccountKey.json`

If you are reviewing the project for judging, the fastest approach is to run it on the team demo machine where these files are already configured.

## Install Dependencies

From the project root:

```bash
npm install
```

## Run the Project

The frontend and backend run separately.

### 1. Start the Backend

In the project root:

```bash
node server.js
```

The backend should start on:

```text
http://localhost:3001
```

This backend powers:

- document analysis and subject detection
- Study Buddy recommendation flows
- PATH node generation

### 2. Start the Frontend

In a **second** terminal, from the same project root:

```bash
npm run dev
```

The frontend will usually start on:

```text
http://localhost:5173
```

### 3. Open the Website

Open the frontend URL shown by Vite in your browser.

For full functionality, keep both the frontend and backend running at the same time.

## Available Scripts

Start the frontend in development mode:

```bash
npm run dev
```

Build the frontend for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Troubleshooting

### Backend does not start

Check that:

- `serviceAccountKey.json` exists in the project root
- `.env` exists in the project root
- you already ran `npm install`

### Frontend loads, but AI features do not work

Check that:

- the backend is running on `http://localhost:3001`
- the backend terminal does not show startup errors

### Firebase errors

Check that:

- your `.env` values are populated correctly
- your Firebase project matches the provided service account
- Firestore is enabled and reachable

## Quick Start

Run these in two separate terminals:

```bash
node server.js
```

```bash
npm run dev
```

Then open the frontend URL in your browser.
