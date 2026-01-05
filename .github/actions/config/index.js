/**
 * Configuration module
 *
 * Provides a centralized, pre-configured instance of the Configuration class
 * that can be imported and used throughout the application.
 *
 * @module config
 * @author AXIVO
 * @license BSD-3-Clause
 */
const Configuration = require('../core/Configuration');
const settings = require('./production');

/**
 * Singleton configuration instance
 */
const config = new Configuration(settings);

module.exports = config;
