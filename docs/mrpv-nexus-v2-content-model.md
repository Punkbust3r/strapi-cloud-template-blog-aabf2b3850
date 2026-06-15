# MRP:V Nexus V2 Content Model

This document describes the Strapi content model for MRP:V Nexus, the Discord bot and future admin surface for the MRP:V FiveM project.

The model stores safe IDs, names, switches, and configuration metadata. It must not store secrets, Discord bot tokens, OAuth client secrets, Strapi API tokens, webhook secrets, or database credentials.

## Data Flow

```text
Admin Panel -> Nuxt server/api -> Strapi
Discord Bot -> Strapi
FiveM later -> secure API/webhooks -> Bot/Nuxt -> Strapi
```

All authenticated write access must happen server-side through the Discord bot backend, Nuxt server routes, or protected Cloudflare/Pages Functions. Browser code must never receive privileged Strapi tokens.

## V2 Collections

### discord-role-mapping

Stores central Discord role mappings for the Admin Panel, bot modules, OAuth authorization, team permissions, and later FiveM sync.

Systems:
- Admin Panel reads/writes role mapping metadata.
- Discord Bot reads role IDs and permission metadata.
- Strapi CMS provides admin editing.
- FiveM later can consume mapped roles through secure backend sync.

Example keys: `projectlead`, `admin`, `moderator`, `support`, `developer`, `verified`, `applicant`, `police`, `medic`, `mechanic`, `faction`, `gang`.

### discord-channel-mapping

Stores target channels for bot logs, moderation logs, announcements, server status, welcome messages, tickets, and CMS sync.

Systems:
- Admin Panel manages channel assignments.
- Discord Bot reads channel IDs for posting and logging.
- Strapi CMS provides admin editing.
- FiveM later can trigger messages through secure backend flows.

Example keys: `mod_logs`, `announcements`, `devlogs`, `news`, `tickets`, `welcome`, `server_status`.

### bot-feature-setting

Stores module and feature switches plus JSON configuration for Nexus features.

Systems:
- Admin Panel toggles modules and edits settings.
- Discord Bot reads module state and config.
- Strapi CMS provides admin editing.
- FiveM later can read sync-related feature settings through backend services.

Example feature keys: `welcome`, `tickets`, `reaction_roles`, `leveling`, `moderation`, `cms_sync`, `fivem_sync`, `server_status`.

### discord-oauth-setting

Stores safe Discord OAuth configuration metadata. Secrets remain in environment variables.

Systems:
- Admin Panel reads role requirements and redirect paths.
- Discord Bot may read guild role metadata if needed.
- Strapi CMS provides admin editing.
- FiveM later should not receive OAuth secrets from Strapi.

### server-status-setting

Stores status sources for the Website, Admin Panel, Discord status embeds, and later FiveM status checks.

Systems:
- Admin Panel manages status source metadata.
- Discord Bot reads public/Discord visibility and status messages.
- Strapi CMS provides admin editing.
- FiveM later can report status through secure API/webhooks.

Example keys: `website`, `strapi`, `discord_bot`, `fivem_dev`, `fivem_live`, `database`.

### bot-ticket-setting

Stores ticket flows for support, applications, whitelist, bugs, team contacts, and faction contacts.

Systems:
- Admin Panel manages ticket panels and support role targets.
- Discord Bot creates ticket panels and ticket channels.
- Strapi CMS provides admin editing.
- FiveM later can link whitelist or faction flows through backend services.

Example keys: `support`, `application`, `whitelist`, `bug_report`, `team_contact`, `faction_contact`.

### bot-reaction-role-panel

Stores reaction role panels for community roles, interests, factions, and events.

Systems:
- Admin Panel manages panel config and role definitions.
- Discord Bot renders panels and applies roles.
- Strapi CMS provides admin editing.
- FiveM later can consume role choices through secure role sync.

Example keys: `community_roles`, `event_roles`, `faction_roles`, `interest_roles`.

### bot-welcome-setting

Stores welcome and leave configuration for new Discord members.

Systems:
- Admin Panel edits templates and channel targets.
- Discord Bot sends welcome/leave messages and assigns optional join roles.
- Strapi CMS provides admin editing.
- FiveM later can use account-link prompts through backend flows.

Example keys: `default_welcome`, `main_guild_welcome`.

### bot-level-setting

Stores XP, level, rank, cooldown, and role reward configuration.

Systems:
- Admin Panel manages leveling settings.
- Discord Bot calculates XP and applies level roles.
- Strapi CMS provides admin editing.
- FiveM later can read rank metadata through backend services if needed.

Example keys: `default_leveling`, `community_leveling`.

### bot-fivem-sync-setting

Stores future FiveM account linking, whitelist sync, ban sync, role sync, and event logging settings. `webhookSecretHint` may store a non-secret label or rotation hint only; it must not contain the real webhook secret.

Systems:
- Admin Panel manages safe sync switches and metadata.
- Discord Bot reads sync configuration and executes sync jobs.
- Strapi CMS provides admin editing.
- FiveM later sends secure events through backend-owned webhooks or APIs.

Example keys: `default_fivem_sync`, `dev_server_sync`, `live_server_sync`.

## Existing Bot Collections

The V2 model extends the existing bot collections and does not replace them:

- `bot-guild-setting`
- `bot-channel-setting`
- `bot-module-setting`
- `bot-audit-log`
- `published-discord-post`
- `linked-game-account`

## Security Rules

- No secrets in Strapi content entries.
- Discord bot token, Strapi API tokens, OAuth client secrets, and webhook secrets stay in `.env` or platform secret storage.
- Write access must be server-side only through Nuxt server/api, the Discord bot backend, or protected serverless functions.
- Frontend/browser code must never receive privileged Strapi API tokens.
- Strapi API tokens for the bot should use custom scoped rights limited to the required bot collections.

## Optional Example Records

Use these as manual admin examples, not as seed data:

- `bot-feature-setting`: `welcome`, `tickets`, `reaction_roles`, `leveling`, `moderation`, `cms_sync`, `fivem_sync`, `server_status`
- `discord-channel-mapping`: `announcements`, `devlogs`, `news`, `mod_logs`, `server_status`, `tickets`, `welcome`
- `server-status-setting`: `website`, `strapi`, `discord_bot`, `fivem_dev`, `fivem_live`, `database`
- `bot-ticket-setting`: `support`, `application`, `whitelist`, `bug_report`, `team_contact`
- `discord-role-mapping`: `projectlead`, `admin`, `moderator`, `support`, `developer`, `verified`, `applicant`
