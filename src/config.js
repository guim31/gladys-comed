// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with unknown values.
// -----------------------------------------------------------------------------

/** The languages every text carries, in this order. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  // Language of the feature names and of the texts the container writes
  // (a device integration is not told the user's language).
  language: 'fr',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    language: LANGUAGES.includes(raw.language) ? raw.language : DEFAULT_CONFIG.language,
  };
}
