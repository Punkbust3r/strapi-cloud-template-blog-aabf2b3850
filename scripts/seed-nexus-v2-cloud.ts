import fs from 'node:fs';
import path from 'node:path';

type JsonObject = Record<string, unknown>;

type Stats = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

type Schema = {
  attributes?: Record<string, unknown>;
};

type SeedRecord = {
  label: string;
  identifiers: string[];
  data: JsonObject;
};

type CollectionSeed = {
  name: string;
  apiPlural: string;
  schemaPath: string;
  records: SeedRecord[];
};

type StrapiEntry = {
  id?: number;
  documentId?: string;
  attributes?: JsonObject;
  [key: string]: unknown;
};

const stats: Stats = {
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
};

function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');

    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, '');
}

function loadSchema(schemaPath: string): Schema | null {
  const fullPath = path.resolve(process.cwd(), schemaPath);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(fullPath, 'utf8')) as Schema;
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as JsonObject)
      .sort()
      .reduce<JsonObject>((result, key) => {
        result[key] = sortObject((value as JsonObject)[key]);
        return result;
      }, {});
  }

  return value;
}

function stable(value: unknown) {
  return JSON.stringify(sortObject(value));
}

function pickExistingFields(schema: Schema, data: JsonObject) {
  const attributes = schema.attributes || {};
  const payload: JsonObject = {};
  const omitted: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (attributes[key]) {
      payload[key] = value;
    } else {
      omitted.push(key);
    }
  }

  return { payload, omitted };
}

function buildFilters(schema: Schema, payload: JsonObject, identifiers: string[]) {
  const attributes = schema.attributes || {};
  const filters: JsonObject = {};

  for (const key of identifiers) {
    if (attributes[key] && payload[key] !== undefined && payload[key] !== null) {
      filters[key] = payload[key];
    }
  }

  return Object.keys(filters).length > 0 ? filters : null;
}

function buildFilterQuery(filters: JsonObject) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    params.set(`filters[${key}][$eq]`, String(value));
  }

  params.set('pagination[pageSize]', '1');
  return params.toString();
}

function unwrapEntry(entry: StrapiEntry): JsonObject {
  return entry.attributes ? { ...entry.attributes, documentId: entry.documentId, id: entry.id } : entry;
}

function hasChanges(existing: JsonObject, payload: JsonObject) {
  return Object.keys(payload).some((key) => stable(existing[key]) !== stable(payload[key]));
}

async function requestStrapi(
  baseUrl: string,
  token: string,
  method: string,
  pathName: string,
  body?: unknown
) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json: unknown = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { message: text };
    }
  }

  if (!response.ok) {
    const message =
      json && typeof json === 'object' && 'error' in json
        ? JSON.stringify((json as { error: unknown }).error)
        : text || response.statusText;
    throw new Error(`HTTP ${response.status}: ${message}`);
  }

  return json;
}

async function findExisting(baseUrl: string, token: string, collection: CollectionSeed, filters: JsonObject) {
  const query = buildFilterQuery(filters);
  const result = await requestStrapi(baseUrl, token, 'GET', `/api/${collection.apiPlural}?${query}`);
  const data = (result as { data?: StrapiEntry[] }).data;

  return Array.isArray(data) && data.length > 0 ? data[0] : null;
}

async function createEntry(baseUrl: string, token: string, collection: CollectionSeed, payload: JsonObject) {
  return requestStrapi(baseUrl, token, 'POST', `/api/${collection.apiPlural}`, {
    data: payload,
  });
}

async function updateEntry(
  baseUrl: string,
  token: string,
  collection: CollectionSeed,
  existing: StrapiEntry,
  payload: JsonObject
) {
  const documentId = existing.documentId;

  if (!documentId) {
    throw new Error('existing entry has no documentId in REST response');
  }

  return requestStrapi(baseUrl, token, 'PUT', `/api/${collection.apiPlural}/${documentId}`, {
    data: payload,
  });
}

function role(guildId: string, key: string, roleName: string, category: string, required = false, description = '') {
  return {
    label: key,
    identifiers: ['guildId', 'roleKey', 'key'],
    data: {
      guildId,
      key,
      roleKey: key,
      roleName,
      roleDisplayName: roleName,
      roleId: '',
      category,
      required,
      description,
      enabled: true,
      sortOrder: 0,
      permissionsJson: {
        guildId,
        roleKey: key,
        scopes: [],
      },
      configJson: {
        guildId,
      },
    },
  };
}

function channel(guildId: string, key: string, channelName: string, channelType: string, purpose: string) {
  return {
    label: key,
    identifiers: ['guildId', 'settingKey', 'channelKey', 'key'],
    data: {
      guildId,
      key,
      settingKey: key,
      channelKey: key,
      channelId: '',
      channelName,
      channelType,
      categoryName: '',
      purpose,
      required: false,
      description: '',
      enabled: true,
      sortOrder: 0,
      configJson: {
        guildId,
      },
    },
  };
}

function feature(guildId: string, featureKey: string, displayName: string, category: string) {
  return {
    label: featureKey,
    identifiers: ['guildId', 'moduleKey', 'featureKey', 'key'],
    data: {
      guildId,
      moduleKey: featureKey,
      featureKey,
      key: featureKey,
      label: displayName,
      displayName,
      enabled: false,
      description: `${displayName} feature settings`,
      category,
      status: 'planned',
      sortOrder: 0,
      configJson: {
        guildId,
      },
    },
  };
}

function keyedSetting(guildId: string, key: string, data: JsonObject, identifiers = ['guildId', 'key']): SeedRecord {
  return {
    label: key,
    identifiers,
    data: {
      guildId,
      key,
      ...data,
    },
  };
}

function buildSeedCollections(guildId: string): CollectionSeed[] {
  return [
    {
      name: 'discord-role-mappings',
      apiPlural: 'discord-role-mappings',
      schemaPath: 'src/api/discord-role-mapping/content-types/discord-role-mapping/schema.json',
      records: [
        role(guildId, 'projectlead', 'Projektleitung', 'admin', true, 'Project lead access'),
        role(guildId, 'admin', 'Administrator', 'admin', true, 'Administrator access'),
        role(guildId, 'moderator', 'Moderator', 'team', false, 'Moderation access'),
        role(guildId, 'support', 'Support', 'team', false, 'Support access'),
        role(guildId, 'developer', 'Developer', 'team', false, 'Developer access'),
        role(guildId, 'community', 'Community', 'community', false, 'Community role'),
        role(guildId, 'verified', 'Verified', 'community', false, 'Verified Discord member'),
        role(guildId, 'applicant', 'Bewerber', 'community', false, 'Application role'),
        role(guildId, 'unverified', 'Unverified', 'community', false, 'Unverified Discord member'),
        role(guildId, 'police', 'Polizei', 'fivem', false, 'FiveM police role'),
        role(guildId, 'medic', 'Medic', 'fivem', false, 'FiveM medic role'),
        role(guildId, 'mechanic', 'Mechaniker', 'fivem', false, 'FiveM mechanic role'),
        role(guildId, 'faction', 'Fraktion', 'faction', false, 'FiveM faction role'),
        role(guildId, 'gang', 'Gang', 'gang', false, 'FiveM gang role'),
      ],
    },
    {
      name: 'discord-channel-mappings',
      apiPlural: 'discord-channel-mappings',
      schemaPath: 'src/api/discord-channel-mapping/content-types/discord-channel-mapping/schema.json',
      records: [
        channel(guildId, 'log_channel', 'Bot Log', 'text', 'logs'),
        channel(guildId, 'mod_log_channel', 'Bot Mod Log', 'text', 'moderation'),
        channel(guildId, 'announcement_channel', 'Announcements', 'announcement', 'announcements'),
        channel(guildId, 'server_status_channel', 'Server Status', 'text', 'status'),
        channel(guildId, 'ticket_channel', 'Ticket System', 'text', 'tickets'),
        channel(guildId, 'welcome_channel', 'Willkommen', 'text', 'welcome'),
        channel(guildId, 'rules_channel', 'Regelwerk', 'text', 'system'),
        channel(guildId, 'news_channel', 'News', 'announcement', 'news'),
        channel(guildId, 'devlog_channel', 'Devlogs', 'announcement', 'devlogs'),
      ],
    },
    {
      name: 'bot-feature-settings',
      apiPlural: 'bot-feature-settings',
      schemaPath: 'src/api/bot-feature-setting/content-types/bot-feature-setting/schema.json',
      records: [
        feature(guildId, 'moderation', 'Moderation', 'moderation'),
        feature(guildId, 'logging', 'Logging', 'core'),
        feature(guildId, 'welcome', 'Welcome', 'community'),
        feature(guildId, 'reaction_roles', 'Reaction Roles', 'community'),
        feature(guildId, 'leveling', 'Leveling', 'community'),
        feature(guildId, 'tickets', 'Tickets', 'tickets'),
        feature(guildId, 'strapi_announcements', 'Strapi Announcements', 'cms'),
        feature(guildId, 'server_status', 'Server Status', 'status'),
        feature(guildId, 'fivem_account_link', 'FiveM Account Link', 'fivem'),
      ],
    },
    {
      name: 'bot-ticket-settings',
      apiPlural: 'bot-ticket-settings',
      schemaPath: 'src/api/bot-ticket-setting/content-types/bot-ticket-setting/schema.json',
      records: [
        keyedSetting(guildId, 'default', {
          label: 'Default Tickets',
          enabled: false,
          panelTitle: 'MRP:V Support',
          panelDescription: 'Create a ticket for support, applications, whitelist, bugs, team, or faction requests.',
          buttonText: 'Ticket erstellen',
          emoji: '',
          configJson: {
            guildId,
            ticketTypes: ['support', 'application', 'whitelist', 'bug_report', 'team_internal', 'faction_application'],
            transcripts: true,
            autoCloseDays: 7,
            supportRoleKey: 'support',
            moderatorRoleKey: 'moderator',
            projectleadRoleKey: 'projectlead',
          },
        }),
      ],
    },
    {
      name: 'bot-welcome-settings',
      apiPlural: 'bot-welcome-settings',
      schemaPath: 'src/api/bot-welcome-setting/content-types/bot-welcome-setting/schema.json',
      records: [
        keyedSetting(guildId, 'default', {
          enabled: false,
          useEmbed: true,
          mentionUser: true,
          assignJoinRole: false,
          joinRoleName: 'Community',
          titleTemplate: 'Willkommen bei MRP:V',
          messageTemplate: 'Willkommen {user} auf MRP:V.',
          buttonText: 'Regelwerk lesen',
          buttonUrl: '',
          configJson: {
            guildId,
            welcomeMessage: 'Willkommen {user} auf MRP:V.',
            leaveMessage: '{user} hat den Discord verlassen.',
            embedEnabled: true,
            mentionUser: true,
            rulesUrl: '',
            autoRoleKey: 'community',
          },
        }),
      ],
    },
    {
      name: 'bot-level-settings',
      apiPlural: 'bot-level-settings',
      schemaPath: 'src/api/bot-level-setting/content-types/bot-level-setting/schema.json',
      records: [
        keyedSetting(guildId, 'default', {
          enabled: false,
          xpPerMessageMin: 8,
          xpPerMessageMax: 18,
          cooldownSeconds: 60,
          voiceXpEnabled: false,
          ignoreBots: true,
          ignoreCommands: true,
          levelRolesJson: [],
          configJson: {
            guildId,
            xpPerMessageMin: 8,
            xpPerMessageMax: 18,
            cooldownSeconds: 60,
            voiceXpEnabled: false,
            levelRoles: [],
          },
        }),
      ],
    },
    {
      name: 'bot-reaction-role-panels',
      apiPlural: 'bot-reaction-role-panels',
      schemaPath: 'src/api/bot-reaction-role-panel/content-types/bot-reaction-role-panel/schema.json',
      records: [
        keyedSetting(guildId, 'community_roles', {
          title: 'Community Rollen',
          description: 'Waehle optionale Community Rollen.',
          enabled: false,
          displayMode: 'buttons',
          mode: 'buttons',
          allowMultiple: true,
          exclusiveRoles: false,
          exclusive: false,
          rolesJson: [],
          configJson: { guildId, panelKey: 'community_roles' },
        }, ['guildId', 'panelKey', 'key']),
        keyedSetting(guildId, 'interests_games', {
          title: 'Interessen',
          description: 'Waehle Interessen und Spielbereiche.',
          enabled: false,
          displayMode: 'buttons',
          mode: 'buttons',
          allowMultiple: true,
          exclusiveRoles: false,
          exclusive: false,
          rolesJson: [],
          configJson: { guildId, panelKey: 'interests_games' },
        }, ['guildId', 'panelKey', 'key']),
        keyedSetting(guildId, 'faction_preview', {
          title: 'Fraktionsinteresse',
          description: 'Waehle Vorschaurollen fuer Fraktionen.',
          enabled: false,
          displayMode: 'select_menu',
          mode: 'select_menu',
          allowMultiple: true,
          exclusiveRoles: false,
          exclusive: false,
          rolesJson: [],
          configJson: { guildId, panelKey: 'faction_preview' },
        }, ['guildId', 'panelKey', 'key']),
        keyedSetting(guildId, 'event_notifications', {
          title: 'Event Benachrichtigungen',
          description: 'Waehle Event-Benachrichtigungen.',
          enabled: false,
          displayMode: 'buttons',
          mode: 'buttons',
          allowMultiple: true,
          exclusiveRoles: false,
          exclusive: false,
          rolesJson: [],
          configJson: { guildId, panelKey: 'event_notifications' },
        }, ['guildId', 'panelKey', 'key']),
      ],
    },
    {
      name: 'bot-fivem-sync-settings',
      apiPlural: 'bot-fivem-sync-settings',
      schemaPath: 'src/api/bot-fivem-sync-setting/content-types/bot-fivem-sync-setting/schema.json',
      records: [
        keyedSetting(guildId, 'default', {
          enabled: false,
          accountLinkEnabled: true,
          whitelistSyncEnabled: false,
          banSyncEnabled: false,
          roleSyncEnabled: false,
          logEventsEnabled: true,
          webhookSecretHint: 'Configured through environment secrets',
          configJson: {
            guildId,
            accountLinkEnabled: true,
            whitelistSyncEnabled: false,
            banSyncEnabled: false,
            roleSyncEnabled: false,
            webhookEvents: ['account_linked', 'whitelist_updated', 'ban_updated', 'role_sync'],
          },
        }),
      ],
    },
    {
      name: 'server-status-settings',
      apiPlural: 'server-status-settings',
      schemaPath: 'src/api/server-status-setting/content-types/server-status-setting/schema.json',
      records: [
        keyedSetting(guildId, 'default', {
          label: 'Default Server Status',
          enabled: true,
          source: 'custom',
          status: 'unknown',
          publicVisible: true,
          discordVisible: true,
          sortOrder: 0,
          refreshIntervalSeconds: 60,
          message: '',
          configJson: {
            guildId,
            websiteStatus: 'unknown',
            strapiStatus: 'unknown',
            discordBotStatus: 'unknown',
            fivemDevStatus: 'unknown',
            fivemLiveStatus: 'unknown',
            refreshIntervalSeconds: 60,
          },
        }),
      ],
    },
    {
      name: 'discord-oauth-settings',
      apiPlural: 'discord-oauth-settings',
      schemaPath: 'src/api/discord-oauth-setting/content-types/discord-oauth-setting/schema.json',
      records: [
        keyedSetting(guildId, 'admin_panel', {
          guildId,
          guildName: 'MRP:V',
          enabled: true,
          projectLeadRoleName: 'Projektleitung',
          adminRoleName: 'Administrator',
          developerRoleName: 'Developer',
          allowedRoleIdsJson: [],
          loginRedirectPath: '/admin-panel',
          deniedRedirectPath: '/admin-panel?error=forbidden',
          configJson: {
            key: 'admin_panel',
            requiredGuildId: guildId,
            requiredRoleKey: 'projectlead',
            allowedDevBypass: true,
            scopes: ['identify', 'guilds', 'guilds.members.read'],
          },
        }, ['guildId', 'key']),
      ],
    },
  ];
}

async function upsertCollection(baseUrl: string, token: string, collection: CollectionSeed) {
  const schema = loadSchema(collection.schemaPath);

  if (!schema) {
    stats.failed += collection.records.length;
    console.error(`[failed] ${collection.name}: local schema not found at ${collection.schemaPath}`);
    return;
  }

  for (const record of collection.records) {
    const { payload, omitted } = pickExistingFields(schema, record.data);
    const filters = buildFilters(schema, payload, record.identifiers);

    if (!filters) {
      stats.failed += 1;
      console.error(`[failed] ${collection.name}/${record.label}: no usable identifier field exists`);
      continue;
    }

    if (omitted.length > 0) {
      console.log(`[field-filter] ${collection.name}/${record.label}: omitted ${omitted.join(', ')}`);
    }

    try {
      const existing = await findExisting(baseUrl, token, collection, filters);

      if (!existing) {
        await createEntry(baseUrl, token, collection, payload);
        stats.created += 1;
        console.log(`[created] ${collection.name}/${record.label}`);
        continue;
      }

      const existingData = unwrapEntry(existing);

      if (!hasChanges(existingData, payload)) {
        stats.skipped += 1;
        console.log(`[skipped] ${collection.name}/${record.label}`);
        continue;
      }

      await updateEntry(baseUrl, token, collection, existing, payload);
      stats.updated += 1;
      console.log(`[updated] ${collection.name}/${record.label}`);
    } catch (error) {
      stats.failed += 1;
      console.error(`[failed] ${collection.name}/${record.label}: ${(error as Error).message}`);
    }
  }
}

async function main() {
  loadEnvFile();

  const baseUrl = normalizeBaseUrl(requireEnv('STRAPI_CLOUD_URL'));
  const token = requireEnv('STRAPI_API_TOKEN');
  const guildId = requireEnv('DISCORD_GUILD_ID');

  console.log(`Seeding Nexus V2 defaults to ${baseUrl}`);
  console.log(`Discord guild: ${guildId}`);

  for (const collection of buildSeedCollections(guildId)) {
    await upsertCollection(baseUrl, token, collection);
  }

  console.log('');
  console.log('Nexus V2 cloud seed summary');
  console.log(`created: ${stats.created}`);
  console.log(`updated: ${stats.updated}`);
  console.log(`skipped: ${stats.skipped}`);
  console.log(`failed: ${stats.failed}`);

  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Nexus V2 cloud seed failed: ${(error as Error).message}`);
  process.exit(1);
});
