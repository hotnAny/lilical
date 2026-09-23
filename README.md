# lilical

Lists of to-do lists in a calendar. See [spec.md](spec.md).

## Run locally

    npm install
    npm run dev

With no env vars set, data is kept in `.data/lilical.json` and there is no
passphrase. Set `LILICAL_PASSPHRASE` to try the login page.

## Deploy (Vercel)

1. Create a private GitHub repo for the data, e.g. `lilical-data`. It can be empty.
2. Create a fine-grained token with **Contents: read and write** on that repo only.
3. Import this repo into Vercel and set the env vars from `.env.example`:
   `GITHUB_TOKEN`, `GITHUB_REPO` (`owner/lilical-data`), `LILICAL_PASSPHRASE`.
4. If you add a custom domain, add it to `security.allowedDomains` in
   `astro.config.mjs`, or the login form will be rejected.
