# Nexus V2 Seeding

## Purpose

`src/scripts/seed-nexus-v2.ts` creates safe default records for the MRP:V Nexus V2 Discord Bot and Admin Panel collections. It is intended for local setup and controlled admin initialization.

The script is idempotent. It detects existing entries by the identifier fields available in each Strapi schema and updates or skips them instead of creating duplicates.

## Collections

The seed script targets these collections:

- `discord-role-mapping`
- `discord-channel-mapping`
- `bot-feature-setting`
- `bot-ticket-setting`
- `bot-welcome-setting`
- `bot-level-setting`
- `bot-reaction-role-panel`
- `bot-fivem-sync-setting`
- `server-status-setting`
- `discord-oauth-setting`

All records are prepared for guild ID `1512886842809389277`.

## Run Locally

```bash
npm run seed:nexus
```

The script loads Strapi locally, reads the registered content-type schemas, filters out fields that do not exist in the current schema, and prints a summary:

- `created`
- `updated`
- `skipped`
- `failed`
- `collectionsSkipped`

## Safety

- The script does not delete existing data.
- The script does not seed website posts, news, announcements, or devlogs.
- The script does not store Discord bot tokens, Strapi API tokens, OAuth client secrets, webhook secrets, or private credentials.
- Existing records are matched and updated/skipped, so repeated runs should not create duplicates.

## Deployment Notes

After changing the seed script or content-type schemas, commit and push the changes so Strapi Cloud can redeploy the application code.

Running the seed script against Strapi Cloud data requires an environment where the app can load with the intended database connection and permissions. API Token permissions for the Discord Bot and Admin Panel must still be configured in Strapi Admin. The seed script itself does not create API tokens or grant permissions.
