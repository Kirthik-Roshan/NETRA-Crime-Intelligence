# Catalyst Authentication for NETRA

## Verified Development state

- Catalyst Web Client: `https://ksphacks-60080085094.development.catalystserverless.in/app/index.html`
- Catalyst Web SDK `init.js`: loading project `56798000000013049`
- Embedded sign-in widget: loading correctly from the same Catalyst project
- Social providers: Zoho, Google, Microsoft and Facebook are enabled; the
  project owner manually completed their login flows on 2026-09-13
- Production `ai_quickml` must use `REQUIRE_CATALYST_AUTH=true`; Development can
  remain optional only while running automated release probes

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

Case and accused detail pages use stable static route shells and load the
selected official record by query parameter after authentication.

## Provider callback contract

Keep the Development provider applications configured with these exact values:

- Authorized JavaScript origin:
  `https://ksphacks-60080085094.development.catalystserverless.in`
- Authorized redirect URI:
  `https://ksphacks-60080085094.development.catalystserverless.in/accounts/pfs/50044349731/clientidpcallback`

Production uses this separate exact callback and origin:

- Authorized JavaScript origin:
  `https://ksphacks-60080085094.catalystserverless.in`
- Authorized redirect URI:
  `https://ksphacks-60080085094.catalystserverless.in/accounts/pfs/50044437015/clientidpcallback`

Use the callback as a Web redirect URI in Google Cloud and Microsoft Entra,
and as a Valid OAuth Redirect URI in Meta. The provider client configured in
Catalyst must be the same client whose redirect allowlist contains that URI.
Keep the Meta application Live for non-developer accounts.

Provider secrets belong only in their provider console and Catalyst
Authentication. Do not place them in `.env`, frontend code, logs, or git.

## Release verification

1. Open the Catalyst Web Client URL above and test each enabled provider.
2. Complete its consent flow. New social-login users receive Catalyst's
   default `App User` role, which NETRA maps to `Investigation Officer`.
3. Confirm that the app redirects to `/app/dashboard/index.html`, then test AI
   Assistant and Evidence AI once to verify the authenticated Function token.
4. Create custom roles named `Administrator`, `Senior Officer`, `Investigation Officer`,
   `SCRB Analyst`, and `Read Only`. The Function maps these names to NETRA roles.
5. Add the judging/demo accounts to Catalyst users and assign roles.
   For a police deployment, add custom user validation or an officer allowlist
   before opening social signup beyond the approved roster.
6. Set `REQUIRE_CATALYST_AUTH=true` and redeploy `ai_quickml` only after the
   first officer login is verified; this avoids locking out the prototype.
7. Repeat the callback configuration for every provider with the Production
   ZAID and domain before enabling `REQUIRE_CATALYST_AUTH=true` in Production.
8. For each provider, verify login, logout, direct-route return and a second
   login in a private browser window after every Production promotion.
