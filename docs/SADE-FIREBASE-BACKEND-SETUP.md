# SADE Firebase backend setup

This PR adds the production backend foundation for repository-aware SADE. The browser remains the UI; Firebase Cloud Functions are the secure broker between the browser, GitHub and OpenAI.

## Architecture

`Browser → Firebase Auth → Cloud Function → GitHub App → repository evidence → OpenAI`

The browser never receives the GitHub App private key or the OpenAI service key.

## 1. Create/select the Firebase project

Use the Firebase CLI and select the SADE Firebase project.

```bash
firebase login
firebase use --add
```

## 2. Enable Google sign-in

Firebase Console → Authentication → Sign-in method → Google → Enable.

The web app config in `config/firebase-config.js` is public configuration, not a secret. Replace its placeholders with the Web App configuration from Firebase Console.

## 3. Create the GitHub App

The GitHub App needs, at minimum, repository **Metadata: Read** and **Contents: Read** for the reconnaissance phase. Add **Contents: Write**, **Pull requests: Write** and **Commit statuses: Read** only when the later Patcher/PR phases are enabled.

Install the GitHub App on the repositories SADE is allowed to inspect.

## 4. Store backend secrets

Create one JSON secret containing the GitHub App ID and private key:

```bash
firebase functions:secrets:set SADE_GITHUB_APP
```

Enter JSON in this shape:

```json
{
  "appId": "123456",
  "privateKey": "-----BEGIN RSA PRIVATE KEY-----\\n...\\n-----END RSA PRIVATE KEY-----"
}
```

Create the OpenAI service key:

```bash
firebase functions:secrets:set SADE_OPENAI_API_KEY
```

Do not commit either value.

## 5. Install dependencies and deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

The functions are deployed to `europe-west2`.

## 6. Enable repository mode in SADE

Copy `config/sade-backend.example.json` to `config/sade-backend.json` and replace the placeholder project ID with the deployed Firebase Functions URL, for example:

```json
{
  "enabled": true,
  "baseUrl": "https://europe-west2-YOUR_PROJECT.cloudfunctions.net"
}
```

Commit only the URL/configuration. Never put secrets in this file.

## 7. Test

1. Open SADE.
2. Click **Sign in**.
3. Enter `BlackSurvivalGear/sade`.
4. Enter `main`.
5. Prompt: `Inspect this repository and explain its current SADE architecture. Identify the files that should change to make the Patcher produce real code patches.`
6. Run SADE.

Expected behaviour: Recon reports the actual files it inspected and the model's output refers to evidence from that branch. It must not claim that code was changed or merged.

## Safety boundary in this phase

This PR does **not** write to GitHub. It only reads repository evidence and produces an engineering result. Branch creation, patch application, CI validation and PR creation are deliberately separate capabilities for the next phase.
