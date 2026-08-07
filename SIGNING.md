# Making Pilot a trusted app (code signing)

Unsigned builds trigger SmartScreen on Windows ("Unknown publisher") and Gatekeeper on macOS
(right-click → Open). Fixing both requires a verified Salesdock identity — one-time company
setup, then builds sign automatically.

## Windows — recommended: Azure Trusted Signing (~$10/month)

1. **Azure setup (IT / admin, one-time):**
   - In the Azure portal, create a **Trusted Signing** account (e.g. `salesdock-signing`,
     region West Europe → endpoint `https://weu.codesigning.azure.net`).
   - Complete organization identity validation for Salesdock (needs 3+ years of verifiable
     business history — company registration data).
   - Create a **certificate profile** (e.g. `pilot`, type: Public Trust).
   - Create an Entra app registration ("pilot-signer") with the
     `Trusted Signing Certificate Profile Signer` role on the account; note tenant id,
     client id, client secret.

2. **Wire it into the build** — add to `electron-builder.yml` under `win:`:

   ```yaml
   win:
     azureSignOptions:
       publisherName: Salesdock B.V.
       endpoint: https://weu.codesigning.azure.net
       codeSigningAccountName: salesdock-signing
       certificateProfileName: pilot
   ```

   and export before `yarn dist:win`:

   ```bash
   export AZURE_TENANT_ID=…
   export AZURE_CLIENT_ID=…
   export AZURE_CLIENT_SECRET=…
   ```

   Note: Azure Trusted Signing's signtool integration runs on Windows — sign the exe on a
   Windows machine or CI runner (GitHub Actions `windows-latest` works well with the
   `azure/trusted-signing-action`).

3. Result: installer and app show **Publisher: Salesdock B.V.**; SmartScreen reputation is
   Microsoft-managed and warnings stop almost immediately.

### Alternative A: EV code-signing certificate (~$300–500/yr)
Classic route via DigiCert/Sectigo/Certum: instant SmartScreen reputation, but requires a
hardware token or cloud HSM (CA/B rules since 2023) and more paperwork. Configure via
`win.certificateSubjectName` + the CA's signing tool.

### Alternative B: internal trust only (free)
Pilot is an internal asset — company-managed Windows machines can trust it without any CA:
- IT pushes a **self-signed signing cert** to all machines as a Trusted Publisher via
  Intune/Group Policy, or
- IT distributes Pilot as a **managed app** through Intune/Endpoint Manager — managed
  installs bypass SmartScreen entirely.
No public trust, but zero warnings inside Salesdock.

## macOS — Apple Developer Program ($99/yr)

1. Enroll Salesdock in the Apple Developer Program (organization enrollment, needs a D-U-N-S number).
2. Create a **Developer ID Application** certificate in the developer portal; install it in
   the build Mac's keychain.
3. Update `electron-builder.yml`:

   ```yaml
   mac:
     identity: "Developer ID Application: Salesdock B.V. (TEAMID)"
     hardenedRuntime: true
     notarize: true   # electron-builder notarizes when APPLE_* env vars are present
   ```

   and export:

   ```bash
   export APPLE_ID=…            # or use an App Store Connect API key
   export APPLE_APP_SPECIFIC_PASSWORD=…
   export APPLE_TEAM_ID=…
   ```

4. Result: the dmg opens first-try on any Mac — no right-click, no quarantine dance.

## Suggested order

1. Windows first (QA team feels it daily): Azure Trusted Signing + a GitHub Actions
   `windows-latest` job that builds and signs `dist:win`.
2. macOS when convenient: Apple enrollment takes a few days; wire it into the same CI.
3. Until then, the internal shortcut (Intune trusted publisher / managed install) removes
   warnings on company machines for free.
