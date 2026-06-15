'use strict';

const { createStrapi, compileStrapi } = require('@strapi/strapi');

declare const strapi: any;

type SeedStats = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  collectionsSkipped: number;
};

type SeedRecord = {
  label: string;
  identifiers: string[];
  data: Record<string, unknown>;
};

type SeedCollection = {
  uid: string;
  records: SeedRecord[];
};

const GUILD_ID = '1512886842809389277';
const GUILD_NAME = 'MRP:V';

const stats: SeedStats = {
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  collectionsSkipped: 0,
};

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortObject((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

function stable(value: unknown): string {
  return JSON.stringify(sortObject(value));
}

function getContentType(uid: string): any | null {
  return strapi.contentTypes?.[uid] || null;
}

function pickExistingFields(contentType: any, data: Record<string, unknown>) {
  const attributes = contentType.attributes || {};
  const picked: Record<string, unknown> = {};
  const omitted: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (attributes[key]) {
      picked[key] = value;
    } else {
      omitted.push(key);
    }
  }

  return { picked, omitted };
}

function buildFilters(contentType: any, data: Record<string, unknown>, identifiers: string[]) {
  const attributes = contentType.attributes || {};
  const filters: Record<string, unknown> = {};

  for (const key of identifiers) {
    if (attributes[key] && data[key] !== undefined && data[key] !== null) {
      filters[key] = data[key];
    }
  }

  return Object.keys(filters).length > 0 ? filters : null;
}

function hasChanges(existing: Record<string, unknown>, data: Record<string, unknown>) {
  return Object.keys(data).some((key) => stable(existing[key]) !== stable(data[key]));
}

async function findExisting(uid: string, filters: Record<string, unknown>) {
  try {
    const entries = await strapi.documents(uid).findMany({
      filters,
      limit: 1,
    });
    return Array.isArray(entries) ? entries[0] : null;
  } catch (documentError) {
    try {
      return await strapi.db.query(uid).findOne({ where: filters });
    } catch (queryError) {
      throw new Error(
        `find failed for ${uid}: ${(queryError as Error).message || (documentError as Error).message}`
      );
    }
  }
}

async function createEntry(uid: string, data: Record<string, unknown>) {
  try {
    return await strapi.documents(uid).create({ data });
  } catch (documentError) {
    try {
      return await strapi.db.query(uid).create({ data });
    } catch (queryError) {
      throw new Error(
        `create failed for ${uid}: ${(queryError as Error).message || (documentError as Error).message}`
      );
    }
  }
}

async function updateEntry(uid: string, existing: Record<string, unknown>, data: Record<string, unknown>) {
  try {
    if (existing.documentId) {
      return await strapi.documents(uid).update({
        documentId: existing.documentId,
        data,
      });
    }
  } catch (documentError) {
    if (!existing.id) {
      throw documentError;
    }
  }

  if (!existing.id) {
    throw new Error(`update failed for ${uid}: existing entry has no documentId or id`);
  }

  return strapi.db.query(uid).update({
    where: { id: existing.id },
    data,
  });
}

async function upsertRecord(collection: SeedCollection, record: SeedRecord) {
  const contentType = getContentType(collection.uid);

  if (!contentType) {
    stats.collectionsSkipped += 1;
    console.warn(`[skip:collection] ${collection.uid} is not registered in Strapi`);
    return;
  }

  const { picked, omitted } = pickExistingFields(contentType, record.data);
  const filters = buildFilters(contentType, picked, record.identifiers);

  if (!filters) {
    stats.failed += 1;
    console.error(`[failed] ${collection.uid}/${record.label}: no usable identifier field exists`);
    return;
  }

  if (Object.keys(picked).length === 0) {
    stats.failed += 1;
    console.error(`[failed] ${collection.uid}/${record.label}: no payload fields exist in schema`);
    return;
  }

  if (omitted.length > 0) {
    console.log(`[field-filter] ${collection.uid}/${record.label}: omitted ${omitted.join(', ')}`);
  }

  try {
    const existing = await findExisting(collection.uid, filters);

    if (!existing) {
      await createEntry(collection.uid, picked);
      stats.created += 1;
      console.log(`[created] ${collection.uid}/${record.label}`);
      return;
    }

    if (!hasChanges(existing, picked)) {
      stats.skipped += 1;
      console.log(`[skipped] ${collection.uid}/${record.label}`);
      return;
    }

    await updateEntry(collection.uid, existing, picked);
    stats.updated += 1;
    console.log(`[updated] ${collection.uid}/${record.label}`);
  } catch (error) {
    stats.failed += 1;
    console.error(`[failed] ${collection.uid}/${record.label}: ${(error as Error).message}`);
  }
}

function role(
  key: string,
  roleName: string,
  category: string,
  required = false,
  description = ''
): SeedRecord {
  return {
    label: key,
    identifiers: ['guildId', 'roleKey', 'key'],
    data: {
      guildId: GUILD_ID,
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
        guildId: GUILD_ID,
        roleKey: key,
        scopes: [],
      },
      configJson: {
        guildId: GUILD_ID,
      },
    },
  };
}

function channel(
  key: string,
  channelName: string,
  channelType: string,
  purpose: string,
  description = ''
): SeedRecord {
  return {
    label: key,
    identifiers: ['guildId', 'settingKey', 'channelKey', 'key'],
    data: {
      guildId: GUILD_ID,
      key,
      settingKey: key,
      channelKey: key,
      channelId: '',
      channelName,
      channelType,
      categoryName: '',
      purpose,
      required: false,
      description,
      enabled: true,
      sortOrder: 0,
      configJson: {
        guildId: GUILD_ID,
      },
    },
  };
}

function feature(featureKey: string, displayName: string, category: string, enabled = false): SeedRecord {
  return {
    label: featureKey,
    identifiers: ['guildId', 'moduleKey', 'featureKey', 'key'],
    data: {
      guildId: GUILD_ID,
      moduleKey: featureKey,
      featureKey,
      key: featureKey,
      label: displayName,
      displayName,
      enabled,
      description: `${displayName} feature settings`,
      category,
      status: enabled ? 'active' : 'planned',
      sortOrder: 0,
      configJson: {
        guildId: GUILD_ID,
      },
    },
  };
}

function keyedSetting(uidLabel: string, data: Record<string, unknown>, identifiers = ['guildId', 'key']): SeedRecord {
  return {
    label: uidLabel,
    identifiers,
    data: {
      guildId: GUILD_ID,
      key: uidLabel,
      ...data,
    },
  };
}

const seedCollections: SeedCollection[] = [
  {
    uid: 'api::discord-role-mapping.discord-role-mapping',
    records: [
      role('projectlead', 'Projektleitung', 'admin', true, 'Project lead access'),
      role('admin', 'Administrator', 'admin', true, 'Administrator access'),
      role('moderator', 'Moderator', 'team', false, 'Moderation access'),
      role('support', 'Support', 'team', false, 'Support access'),
      role('developer', 'Developer', 'team', false, 'Developer access'),
      role('community', 'Community', 'community', false, 'Community role'),
      role('verified', 'Verified', 'community', false, 'Verified Discord member'),
      role('applicant', 'Bewerber', 'community', false, 'Application role'),
      role('unverified', 'Unverified', 'community', false, 'Unverified Discord member'),
      role('police', 'Polizei', 'fivem', false, 'FiveM police role'),
      role('medic', 'Medic', 'fivem', false, 'FiveM medic role'),
      role('mechanic', 'Mechaniker', 'fivem', false, 'FiveM mechanic role'),
      role('faction', 'Fraktion', 'faction', false, 'FiveM faction role'),
      role('gang', 'Gang', 'gang', false, 'FiveM gang role'),
    ],
  },
  {
    uid: 'api::discord-channel-mapping.discord-channel-mapping',
    records: [
      channel('log_channel', 'Bot Log', 'text', 'logs'),
      channel('mod_log_channel', 'Bot Mod Log', 'text', 'moderation'),
      channel('announcement_channel', 'Announcements', 'announcement', 'announcements'),
      channel('server_status_channel', 'Server Status', 'text', 'status'),
      channel('ticket_channel', 'Ticket System', 'text', 'tickets'),
      channel('welcome_channel', 'Willkommen', 'text', 'welcome'),
      channel('rules_channel', 'Regelwerk', 'text', 'system'),
      channel('news_channel', 'News', 'announcement', 'news'),
      channel('devlog_channel', 'Devlogs', 'announcement', 'devlogs'),
    ],
  },
  {
    uid: 'api::bot-feature-setting.bot-feature-setting',
    records: [
      feature('moderation', 'Moderation', 'moderation'),
      feature('logging', 'Logging', 'core'),
      feature('welcome', 'Welcome', 'community'),
      feature('reaction_roles', 'Reaction Roles', 'community'),
      feature('leveling', 'Leveling', 'community'),
      feature('tickets', 'Tickets', 'tickets'),
      feature('strapi_announcements', 'Strapi Announcements', 'cms'),
      feature('server_status', 'Server Status', 'status'),
      feature('fivem_account_link', 'FiveM Account Link', 'fivem'),
    ],
  },
  {
    uid: 'api::bot-ticket-setting.bot-ticket-setting',
    records: [
      keyedSetting('default', {
        label: 'Default Tickets',
        enabled: false,
        panelTitle: 'MRP:V Support',
        panelDescription: 'Create a ticket for support, applications, whitelist, bugs, team, or faction requests.',
        buttonText: 'Ticket erstellen',
        emoji: '',
        configJson: {
          guildId: GUILD_ID,
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
    uid: 'api::bot-welcome-setting.bot-welcome-setting',
    records: [
      keyedSetting('default', {
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
          guildId: GUILD_ID,
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
    uid: 'api::bot-level-setting.bot-level-setting',
    records: [
      keyedSetting('default', {
        enabled: false,
        xpPerMessageMin: 8,
        xpPerMessageMax: 18,
        cooldownSeconds: 60,
        voiceXpEnabled: false,
        ignoreBots: true,
        ignoreCommands: true,
        levelRolesJson: [],
        configJson: {
          guildId: GUILD_ID,
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
    uid: 'api::bot-reaction-role-panel.bot-reaction-role-panel',
    records: [
      keyedSetting('community_roles', {
        title: 'Community Rollen',
        description: 'Waehle optionale Community Rollen.',
        enabled: false,
        displayMode: 'buttons',
        mode: 'buttons',
        allowMultiple: true,
        exclusiveRoles: false,
        exclusive: false,
        rolesJson: [],
        configJson: {
          guildId: GUILD_ID,
          panelKey: 'community_roles',
        },
      }, ['guildId', 'panelKey', 'key']),
      keyedSetting('interests_games', {
        title: 'Interessen',
        description: 'Waehle Interessen und Spielbereiche.',
        enabled: false,
        displayMode: 'buttons',
        mode: 'buttons',
        allowMultiple: true,
        exclusiveRoles: false,
        exclusive: false,
        rolesJson: [],
        configJson: {
          guildId: GUILD_ID,
          panelKey: 'interests_games',
        },
      }, ['guildId', 'panelKey', 'key']),
      keyedSetting('faction_preview', {
        title: 'Fraktionsinteresse',
        description: 'Waehle Vorschaurollen fuer Fraktionen.',
        enabled: false,
        displayMode: 'select_menu',
        mode: 'select_menu',
        allowMultiple: true,
        exclusiveRoles: false,
        exclusive: false,
        rolesJson: [],
        configJson: {
          guildId: GUILD_ID,
          panelKey: 'faction_preview',
        },
      }, ['guildId', 'panelKey', 'key']),
      keyedSetting('event_notifications', {
        title: 'Event Benachrichtigungen',
        description: 'Waehle Event-Benachrichtigungen.',
        enabled: false,
        displayMode: 'buttons',
        mode: 'buttons',
        allowMultiple: true,
        exclusiveRoles: false,
        exclusive: false,
        rolesJson: [],
        configJson: {
          guildId: GUILD_ID,
          panelKey: 'event_notifications',
        },
      }, ['guildId', 'panelKey', 'key']),
    ],
  },
  {
    uid: 'api::bot-fivem-sync-setting.bot-fivem-sync-setting',
    records: [
      keyedSetting('default', {
        enabled: false,
        accountLinkEnabled: true,
        whitelistSyncEnabled: false,
        banSyncEnabled: false,
        roleSyncEnabled: false,
        logEventsEnabled: true,
        webhookSecretHint: 'Configured through environment secrets',
        configJson: {
          guildId: GUILD_ID,
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
    uid: 'api::server-status-setting.server-status-setting',
    records: [
      keyedSetting('default', {
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
          guildId: GUILD_ID,
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
    uid: 'api::discord-oauth-setting.discord-oauth-setting',
    records: [
      keyedSetting('admin_panel', {
        guildId: GUILD_ID,
        guildName: GUILD_NAME,
        enabled: true,
        projectLeadRoleName: 'Projektleitung',
        adminRoleName: 'Administrator',
        developerRoleName: 'Developer',
        allowedRoleIdsJson: [],
        loginRedirectPath: '/admin-panel',
        deniedRedirectPath: '/admin-panel?error=forbidden',
        configJson: {
          key: 'admin_panel',
          requiredGuildId: GUILD_ID,
          requiredRoleKey: 'projectlead',
          allowedDevBypass: true,
          scopes: ['identify', 'guilds', 'guilds.members.read'],
        },
      }, ['guildId', 'key']),
    ],
  },
];

async function seedNexusV2() {
  for (const collection of seedCollections) {
    for (const record of collection.records) {
      await upsertRecord(collection, record);
    }
  }
}

async function main() {
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();

  app.log.level = 'error';

  try {
    await seedNexusV2();
  } finally {
    await app.destroy();
  }

  console.log('');
  console.log('Nexus V2 seed summary');
  console.log(`created: ${stats.created}`);
  console.log(`updated: ${stats.updated}`);
  console.log(`skipped: ${stats.skipped}`);
  console.log(`failed: ${stats.failed}`);
  console.log(`collectionsSkipped: ${stats.collectionsSkipped}`);

  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(`Nexus V2 seed failed: ${(error as Error).message}`);
  process.exit(1);
});
