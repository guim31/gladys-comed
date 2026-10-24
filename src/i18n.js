// -----------------------------------------------------------------------------
// Every text the integration shows to the user, in the four languages of the
// Gladys interface (en, fr, de, es). German says "du", Spanish says "usted",
// like the rest of guim31's integrations. ComEd, Hourly Pricing and PJM are
// names: they are not translated.
//
//   - NAMES    : the feature names, frozen when the user adds the device, in
//                the language of the configuration;
//   - TEXT     : the fixed texts (widget, connection status);
//   - MESSAGES : the texts built from a value.
//
// test/i18n.test.js checks that every entry carries exactly the four
// languages.
// -----------------------------------------------------------------------------

/** Feature names, by language then feature key (≤ 40 characters). */
export const NAMES = {
  en: {
    price_5min: '5-minute price (¢/kWh)',
    hour_average: 'Current hour average (¢/kWh)',
    average_today: 'Average price today (¢/kWh)',
    min_hour_today: 'Lowest hourly price today (¢/kWh)',
    max_hour_today: 'Highest hourly price today (¢/kWh)',
    forecast_now: 'Day-ahead price this hour (¢/kWh)',
    tomorrow_average: "Tomorrow's day-ahead average (¢/kWh)",
    tomorrow_min: "Tomorrow's day-ahead low (¢/kWh)",
    tomorrow_max: "Tomorrow's day-ahead high (¢/kWh)",
    tomorrow_available: "Tomorrow's prices published",
  },
  fr: {
    price_5min: 'Prix 5 minutes (¢/kWh)',
    hour_average: "Moyenne de l'heure en cours (¢/kWh)",
    average_today: 'Prix moyen du jour (¢/kWh)',
    min_hour_today: 'Prix horaire min du jour (¢/kWh)',
    max_hour_today: 'Prix horaire max du jour (¢/kWh)',
    forecast_now: "Prix prévu de l'heure (¢/kWh)",
    tomorrow_average: 'Moyenne prévue demain (¢/kWh)',
    tomorrow_min: 'Prix min prévu demain (¢/kWh)',
    tomorrow_max: 'Prix max prévu demain (¢/kWh)',
    tomorrow_available: 'Prix de demain publiés',
  },
  de: {
    price_5min: '5-Minuten-Preis (¢/kWh)',
    hour_average: 'Schnitt aktuelle Stunde (¢/kWh)',
    average_today: 'Durchschnittspreis heute (¢/kWh)',
    min_hour_today: 'Tiefster Stundenpreis heute (¢/kWh)',
    max_hour_today: 'Höchster Stundenpreis heute (¢/kWh)',
    forecast_now: 'Day-Ahead-Preis dieser Stunde (¢/kWh)',
    tomorrow_average: 'Day-Ahead-Schnitt morgen (¢/kWh)',
    tomorrow_min: 'Day-Ahead-Tiefstwert morgen (¢/kWh)',
    tomorrow_max: 'Day-Ahead-Höchstwert morgen (¢/kWh)',
    tomorrow_available: 'Preise für morgen veröffentlicht',
  },
  es: {
    price_5min: 'Precio de 5 minutos (¢/kWh)',
    hour_average: 'Media de la hora actual (¢/kWh)',
    average_today: 'Precio medio de hoy (¢/kWh)',
    min_hour_today: 'Precio horario mínimo hoy (¢/kWh)',
    max_hour_today: 'Precio horario máximo hoy (¢/kWh)',
    forecast_now: 'Precio previsto de la hora (¢/kWh)',
    tomorrow_average: 'Media prevista de mañana (¢/kWh)',
    tomorrow_min: 'Mínimo previsto de mañana (¢/kWh)',
    tomorrow_max: 'Máximo previsto de mañana (¢/kWh)',
    tomorrow_available: 'Precios de mañana publicados',
  },
};

/** Fixed texts. */
export const TEXT = {
  // Widget (labels ≤ 24, captions ≤ 80)
  fiveMinutes: {
    en: 'Last 5 minutes',
    fr: '5 dernières minutes',
    de: 'Letzte 5 Minuten',
    es: 'Últimos 5 minutos',
  },
  hourAverage: { en: 'This hour', fr: 'Heure en cours', de: 'Aktuelle Stunde', es: 'Hora actual' },
  todayAverage: {
    en: "Today's average",
    fr: 'Moyenne du jour',
    de: 'Schnitt heute',
    es: 'Media de hoy',
  },
  realTime: {
    en: 'Real-time (5 min)',
    fr: 'Temps réel (5 min)',
    de: 'Echtzeit (5 Min.)',
    es: 'Tiempo real (5 min)',
  },
  dayAhead: { en: 'Day-ahead', fr: 'Prévision', de: 'Day-Ahead', es: 'Previsión' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  min: { en: 'Min', fr: 'Min', de: 'Min', es: 'Mín' },
  max: { en: 'Max', fr: 'Max', de: 'Max', es: 'Máx' },
  cheapestLeft: {
    en: 'Cheapest hour left',
    fr: 'Heure la moins chère',
    de: 'Günstigste Stunde',
    es: 'Hora más barata',
  },
  cheapestTomorrow: {
    en: 'Cheapest tomorrow',
    fr: 'La moins chère demain',
    de: 'Günstigste morgen',
    es: 'Más barata mañana',
  },
  tomorrowAverage: {
    en: "Tomorrow's average",
    fr: 'Moyenne de demain',
    de: 'Schnitt morgen',
    es: 'Media de mañana',
  },
  tomorrowPending: {
    en: 'In the afternoon',
    fr: "Dans l'après-midi",
    de: 'Am Nachmittag',
    es: 'Por la tarde',
  },
  lastPrice: { en: 'Last price', fr: 'Dernier prix', de: 'Letzter Preis', es: 'Último precio' },
  caption: {
    en: 'ComEd Hourly Pricing, supply price in ¢/kWh, Chicago time',
    fr: 'ComEd Hourly Pricing, prix de fourniture en ¢/kWh, heure de Chicago',
    de: 'ComEd Hourly Pricing, Energiepreis in ¢/kWh, Uhrzeit Chicago',
    es: 'ComEd Hourly Pricing, precio de suministro en ¢/kWh, hora de Chicago',
  },
  noPrices: {
    en: 'No price received from ComEd yet: check the integration logs.',
    fr: "Aucun prix reçu de ComEd pour l'instant : consultez les logs de l'intégration.",
    de: 'Noch kein Preis von ComEd erhalten: Sieh in den Logs der Integration nach.',
    es: 'Todavía no se ha recibido ningún precio de ComEd: consulte los registros de la integración.',
  },

  // Configuration screen
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
    de: 'Die Initialisierung ist fehlgeschlagen, sieh in den Logs der Integration nach.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
  unreachable: {
    en: 'ComEd cannot be reached: the last known prices stay in use.',
    fr: 'ComEd est injoignable : les derniers prix connus restent utilisés.',
    de: 'ComEd ist nicht erreichbar: Die zuletzt bekannten Preise bleiben in Gebrauch.',
    es: 'No se puede acceder a ComEd: se siguen usando los últimos precios conocidos.',
  },
  stale: {
    en: 'ComEd answers, but has published no 5-minute price for 30 minutes.',
    fr: 'ComEd répond, mais ne publie plus de prix à 5 minutes depuis 30 minutes.',
    de: 'ComEd antwortet, hat aber seit 30 Minuten keinen 5-Minuten-Preis veröffentlicht.',
    es: 'ComEd responde, pero no ha publicado ningún precio de 5 minutos desde hace 30 minutos.',
  },
};

/** Texts built from a value. */
export const MESSAGES = {
  /**
   * Result of the "Refresh now" action, each language with its own decimal
   * separator.
   * @param {{ price: number | null, average: number | null, tomorrow: boolean }} r
   */
  refreshed: ({ price, average, tomorrow }) => ({
    en: [
      price !== null
        ? `5-minute price: ${decimal(price, 'en')} ¢/kWh${average !== null ? `, current hour average: ${decimal(average, 'en')} ¢/kWh` : ''}.`
        : 'No recent 5-minute price.',
      tomorrow
        ? "Tomorrow's day-ahead prices are published."
        : "Tomorrow's day-ahead prices are not published yet.",
    ].join('\n'),
    fr: [
      price !== null
        ? `Prix 5 minutes : ${decimal(price, 'fr')} ¢/kWh${average !== null ? `, moyenne de l'heure en cours : ${decimal(average, 'fr')} ¢/kWh` : ''}.`
        : 'Aucun prix 5 minutes récent.',
      tomorrow
        ? 'Les prix prévus pour demain sont publiés.'
        : 'Les prix prévus pour demain ne sont pas encore publiés.',
    ].join('\n'),
    de: [
      price !== null
        ? `5-Minuten-Preis: ${decimal(price, 'de')} ¢/kWh${average !== null ? `, Schnitt der aktuellen Stunde: ${decimal(average, 'de')} ¢/kWh` : ''}.`
        : 'Kein aktueller 5-Minuten-Preis.',
      tomorrow
        ? 'Die Day-Ahead-Preise für morgen sind veröffentlicht.'
        : 'Die Day-Ahead-Preise für morgen sind noch nicht veröffentlicht.',
    ].join('\n'),
    es: [
      price !== null
        ? `Precio de 5 minutos: ${decimal(price, 'es')} ¢/kWh${average !== null ? `, media de la hora actual: ${decimal(average, 'es')} ¢/kWh` : ''}.`
        : 'No hay ningún precio de 5 minutos reciente.',
      tomorrow
        ? 'Los precios previstos para mañana están publicados.'
        : 'Los precios previstos para mañana todavía no están publicados.',
    ].join('\n'),
  }),

  /**
   * The refresh action failed.
   * @param {string} reason technical reason (no secret: a public API)
   */
  refreshFailed: (reason) => ({
    en: `ComEd cannot be reached (${reason}). The last known prices stay in use.`,
    fr: `ComEd est injoignable (${reason}). Les derniers prix connus restent utilisés.`,
    de: `ComEd ist nicht erreichbar (${reason}). Die zuletzt bekannten Preise bleiben in Gebrauch.`,
    es: `No se puede acceder a ComEd (${reason}). Se siguen usando los últimos precios conocidos.`,
  }),
};

/**
 * A price with one decimal, as `lang` writes it (2.5, 2,5).
 * @param {number} value
 * @param {string} lang
 */
export function decimal(value, lang) {
  return new Intl.NumberFormat(lang, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    value,
  );
}

/**
 * The text of a multi-language object in `language`, English otherwise.
 * @param {Record<string, string>} text
 * @param {string} language
 */
export function pick(text, language) {
  return text[language] ?? text.en;
}
