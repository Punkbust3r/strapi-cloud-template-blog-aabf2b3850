# MRP:V Nexus Bot Strapi Data Model

This Strapi instance stores public website content and the operational data needed by the custom Discord bot "MRP:V Nexus". The bot collections are intentionally separate from website content types and use bot-specific API IDs where applicable.

## Purpose

The bot collections replace the bot's local Prisma/SQLite datastore with Strapi-managed records. This allows the Discord bot, future Website Admin Panel, and Strapi Admin UI to share one source of truth for guild configuration, module state, channel mappings, account links, audit trails, and Discord publication tracking.

## Collections

| Collection | Singular API ID | Plural API ID | Replaces old Prisma model | Logical uniqueness |
| --- | --- | --- | --- | --- |
| Bot Guild Setting | `bot-guild-setting` | `bot-guild-settings` | Guild/server configuration | `guildId` is schema-unique |
| Bot Module Setting | `bot-module-setting` | `bot-module-settings` | Module enablement/configuration | `guildId` + `moduleKey` |
| Bot Channel Setting | `bot-channel-setting` | `bot-channel-settings` | Named channel mappings | `guildId` + `settingKey` |
| Bot Audit Log | `bot-audit-log` | `bot-audit-logs` | Audit/action log entries | none |
| Linked Game Account | `linked-game-account` | `linked-game-accounts` | Discord-to-game-account link | `discordId` is schema-unique |
| Published Discord Post | `published-discord-post` | `published-discord-posts` | Discord publish tracking | `strapiDocumentId` + `guildId` + `channelId` |

## Logical Unique Constraints

Strapi content-type schemas support single-field uniqueness reliably through `unique: true`. They do not provide a clean portable schema-level declaration for composite unique constraints such as `guildId + moduleKey`, `guildId + settingKey`, or `strapiDocumentId + guildId + channelId`.

The Discord bot and any server-side Website Admin API must treat these combinations as logically unique by querying before create/update and using update-or-create behavior. If strict database enforcement is required later, add a project-specific database migration for the deployed database engine.

## API Token And Security Notes

- The Discord bot needs a Strapi API token with custom rights for the bot collections it reads and writes.
- Do not expose the Discord bot token or Strapi API token to frontend/browser code.
- Do not commit API tokens, Discord tokens, or other secrets.
- The Website Admin Panel must perform write operations server-side only, for example through protected Nuxt server routes or Cloudflare Pages Functions.
- Frontend clients should never call authenticated write endpoints directly with a privileged Strapi token.

## Strapi v5 Notes

Strapi v5 responses use document IDs. Bot code that references website content should store Strapi document identifiers in `published-discord-post.strapiDocumentId` so published Discord messages can be matched back to the source content document.
