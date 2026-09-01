# Catalyst Google Authentication for NETRA

## Verified Development state

- Catalyst Web Client: `https://ksphacks-60080085094.development.catalystserverless.in/app/index.html`
- Catalyst Web SDK `init.js`: loading project `56798000000013049`
- Embedded sign-in widget: loading correctly from the same Catalyst project
- Google provider: enabled and visible, but its saved OAuth client is invalid
- Catalyst application-user roster: contains one active App User as of 2026-08-31
- `ai_quickml`: deployed with authentication optional until an officer completes
  the first interactive Google login

The application code is ready for Catalyst Web SDK v4 Embedded Authentication:

- `src/app/layout.tsx` loads the Catalyst v4 SDK and environment `init.js`.
- `src/app/login/page.tsx` mounts `catalyst.auth.signIn()`.
- `src/lib/ai-client.ts` calls `catalyst.auth.generateAuthToken()` and sends the
  one-hour user token in the `Authorization` header for Function calls.
- `functions/ai_quickml/platform.js` resolves the current Catalyst user and role
  before protected operations.
- Hosted builds have no demo-password fallback. The fallback is localhost-only.

Build and deploy the same-origin authenticated client with:

```bash
npm run deploy:catalyst
```

The Catalyst-specific export remains below Web Client Hosting's 500-entry ZIP
limit by including the 40 newest case dossiers and all 70 criminal profiles.
Cloud Scale list, search, dashboard, AI, evidence, and analytics requests are
not limited by this static-detail packaging rule.

## Repair the Google provider

The live OAuth request was traced on 2026-09-01. Catalyst currently sends a
Zoho-style client ID beginning with `1000.` to Google. Google Web OAuth client
IDs end in `.apps.googleusercontent.com`, so Google rejects the current value
with `401 invalid_client` before NETRA receives a callback.

Create an **OAuth client ID** with application type **Web application** in
Google Cloud Console. Configure these exact development values:

- Authorized JavaScript origin:
  `https://ksphacks-60080085094.development.catalystserverless.in`
- Authorized redirect URI:
  `https://ksphacks-60080085094.development.catalystserverless.in/accounts/pfs/50044349731/clientidpcallback`

Then open `KspHacks` in Catalyst Console and navigate to **Cloud Scale ->
Authentication -> Native Catalyst Authentication -> Embedded Authentication**.
Edit the Google provider and replace both its Client ID and Client Secret with
the new Google Web application credentials. Keep Public Signup enabled while
using social login.

The Google Client Secret belongs only in Google Cloud Console and Catalyst
Authentication. Do not place it in `.env`, frontend code, logs, or git.

## Complete the first login

1. Open the Catalyst Web Client URL above and choose the Google button.
2. Complete Google's consent flow. New social-login users receive Catalyst's
   default `App User` role, which NETRA maps to `Investigation Officer`.
3. Confirm that the app redirects to `/app/dashboard/index.html`, then test AI
   Assistant and Evidence AI once to verify the authenticated Function token.
4. Create custom roles named `Administrator`, `Senior Officer`, `Investigation Officer`,
   `SCRB Analyst`, and `Read Only`. The Function maps these names to NETRA roles.
5. Add the judging/demo Google accounts to Catalyst users and assign roles.
   For a police deployment, add custom user validation or an officer allowlist
   before opening social signup beyond the approved roster.
6. Set `REQUIRE_CATALYST_AUTH=true` and redeploy `ai_quickml` only after the
   first officer login is verified; this avoids locking out the prototype.
7. Repeat Google configuration with the Production ZAID and production app
   domain before enabling `REQUIRE_CATALYST_AUTH=true` in Production.
