'use strict';

/**
 * bot-level-setting service.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::bot-level-setting.bot-level-setting');
