// -----------------------------------------------------------------------------
// Every text the integration shows, in the four languages of the Gladys
// interface (en, fr, de, es). German says "du", Spanish says "usted", like the
// rest of guim31's integrations. Brands and model names are not translated.
//
//   - NAMES       : feature names, frozen when the user adds the device: they
//                   follow the `language` field of the configuration;
//   - MODE_LABELS : the options of the "Mode" selects;
//   - AIR_QUALITY : the purifiers' air quality levels (1 to 4);
//   - TEXT        : the fixed texts (widget, statuses);
//   - MESSAGES    : the texts built from a value.
//
// test/i18n.test.js checks that every entry has exactly the four languages.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './config.js';

/** Feature names, by language then feature key. */
export const NAMES = {
  en: {
    power: 'Power',
    mode: 'Mode',
    fan_speed: 'Fan speed',
    pm25: 'PM2.5',
    filter_life: 'Filter life',
    child_lock: 'Child lock',
    display: 'Display',
    humidity: 'Humidity',
    target_humidity: 'Target humidity',
    mist_level: 'Mist level',
    water_tank: 'Water tank',
    active_power: 'Power draw',
    voltage: 'Voltage',
    energy_today: 'Energy today',
  },
  fr: {
    power: 'Marche/arrêt',
    mode: 'Mode',
    fan_speed: 'Vitesse du ventilateur',
    pm25: 'PM2,5',
    filter_life: 'Durée de vie du filtre',
    child_lock: 'Verrouillage enfant',
    display: 'Écran',
    humidity: 'Humidité',
    target_humidity: 'Humidité cible',
    mist_level: 'Niveau de brume',
    water_tank: "Réservoir d'eau",
    active_power: 'Puissance',
    voltage: 'Tension',
    energy_today: "Énergie aujourd'hui",
  },
  de: {
    power: 'Ein/Aus',
    mode: 'Modus',
    fan_speed: 'Lüfterstufe',
    pm25: 'PM2,5',
    filter_life: 'Filterlebensdauer',
    child_lock: 'Kindersicherung',
    display: 'Anzeige',
    humidity: 'Luftfeuchtigkeit',
    target_humidity: 'Zielfeuchtigkeit',
    mist_level: 'Nebelstufe',
    water_tank: 'Wassertank',
    active_power: 'Leistung',
    voltage: 'Spannung',
    energy_today: 'Energie heute',
  },
  es: {
    power: 'Encendido',
    mode: 'Modo',
    fan_speed: 'Velocidad del ventilador',
    pm25: 'PM2,5',
    filter_life: 'Vida útil del filtro',
    child_lock: 'Bloqueo infantil',
    display: 'Pantalla',
    humidity: 'Humedad',
    target_humidity: 'Humedad objetivo',
    mist_level: 'Nivel de vapor',
    water_tank: 'Depósito de agua',
    active_power: 'Potencia',
    voltage: 'Tensión',
    energy_today: 'Energía de hoy',
  },
};

/** Labels of the mode options, by language then mode key. */
export const MODE_LABELS = {
  en: {
    auto: 'Auto',
    manual: 'Manual',
    sleep: 'Sleep',
    pet: 'Pet',
    turbo: 'Turbo',
    humidity: 'Humidity',
  },
  fr: {
    auto: 'Auto',
    manual: 'Manuel',
    sleep: 'Nuit',
    pet: 'Animaux',
    turbo: 'Turbo',
    humidity: 'Humidité',
  },
  de: {
    auto: 'Auto',
    manual: 'Manuell',
    sleep: 'Schlaf',
    pet: 'Haustier',
    turbo: 'Turbo',
    humidity: 'Feuchtigkeit',
  },
  es: {
    auto: 'Automático',
    manual: 'Manual',
    sleep: 'Sueño',
    pet: 'Mascotas',
    turbo: 'Turbo',
    humidity: 'Humedad',
  },
};

/** The purifiers' air quality levels, 1 (best) to 4 (worst). */
export const AIR_QUALITY = {
  1: { en: 'Excellent', fr: 'Excellente', de: 'Ausgezeichnet', es: 'Excelente' },
  2: { en: 'Good', fr: 'Bonne', de: 'Gut', es: 'Buena' },
  3: { en: 'Moderate', fr: 'Moyenne', de: 'Mäßig', es: 'Moderada' },
  4: { en: 'Poor', fr: 'Mauvaise', de: 'Schlecht', es: 'Mala' },
};

/** Fixed texts. */
export const TEXT = {
  on: { en: 'On', fr: 'En marche', de: 'An', es: 'Encendido' },
  off: { en: 'Off', fr: 'Arrêté', de: 'Aus', es: 'Apagado' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  tankEmpty: { en: 'Tank empty', fr: 'Réservoir vide', de: 'Tank leer', es: 'Depósito vacío' },
  airQuality: {
    en: 'Air quality',
    fr: "Qualité de l'air",
    de: 'Luftqualität',
    es: 'Calidad del aire',
  },
  noDevice: {
    en: 'No VeSync purifier, humidifier or plug added to Gladys yet.',
    fr: "Aucun purificateur, humidificateur ni prise VeSync n'a encore été ajouté à Gladys.",
    de: 'Noch kein VeSync-Luftreiniger, -Luftbefeuchter oder -Stecker zu Gladys hinzugefügt.',
    es: 'Aún no se ha añadido a Gladys ningún purificador, humidificador ni enchufe VeSync.',
  },
  notConfigured: {
    en: 'Enter your VeSync e-mail and password in the integration configuration.',
    fr: "Saisissez l'e-mail et le mot de passe VeSync dans la configuration de l'intégration.",
    de: 'Gib deine VeSync-E-Mail und dein Passwort in der Konfiguration der Integration ein.',
    es: 'Introduzca su correo y su contraseña de VeSync en la configuración de la integración.',
  },
  authFailed: {
    en: 'VeSync refused the e-mail or the password.',
    fr: "VeSync a refusé l'e-mail ou le mot de passe.",
    de: 'VeSync hat die E-Mail oder das Passwort abgelehnt.',
    es: 'VeSync ha rechazado el correo o la contraseña.',
  },
  initFailed: {
    en: 'The integration could not start, see its logs.',
    fr: "L'intégration n'a pas pu démarrer, voir ses journaux.",
    de: 'Die Integration konnte nicht starten, sieh dir ihre Protokolle an.',
    es: 'La integración no ha podido iniciarse, consulte sus registros.',
  },
  deviceOffline: {
    en: 'The device is not connected to the VeSync cloud.',
    fr: "L'appareil n'est pas connecté au cloud VeSync.",
    de: 'Das Gerät ist nicht mit der VeSync-Cloud verbunden.',
    es: 'El dispositivo no está conectado a la nube de VeSync.',
  },
  rateLimited: {
    en: 'VeSync asks to slow down: try again in a minute.',
    fr: 'VeSync demande de ralentir : réessayez dans une minute.',
    de: 'VeSync bittet um eine Pause: versuch es in einer Minute erneut.',
    es: 'VeSync pide ir más despacio: vuelva a intentarlo en un minuto.',
  },
};

/** Texts built from a value. Every function returns a multi-language object. */
export const MESSAGES = {
  /** The cloud could not be reached, or answered an error. */
  unreachable: (reason) => ({
    en: `VeSync cannot be reached: ${reason}`,
    fr: `VeSync est injoignable : ${reason}`,
    de: `VeSync ist nicht erreichbar: ${reason}`,
    es: `No se puede acceder a VeSync: ${reason}`,
  }),

  /** The device refused a command, or the command failed. */
  commandFailed: (reason) => ({
    en: `The command failed: ${reason}`,
    fr: `La commande a échoué : ${reason}`,
    de: `Der Befehl ist fehlgeschlagen: ${reason}`,
    es: `La orden ha fallado: ${reason}`,
  }),

  /** A value outside what the device accepts. */
  invalidValue: (value) => ({
    en: `Value not accepted by this device: ${value}`,
    fr: `Valeur refusée par cet appareil : ${value}`,
    de: `Wert von diesem Gerät nicht akzeptiert: ${value}`,
    es: `Valor no aceptado por este dispositivo: ${value}`,
  }),

  /** "Test the connection" succeeded: what the account holds. */
  connected: ({ total, supported, region }) => ({
    en: `Connected (${region.toUpperCase()} server): ${total} device(s) on the account, ${supported} supported.`,
    fr: `Connecté (serveur ${region.toUpperCase()}) : ${total} appareil(s) sur le compte, ${supported} pris en charge.`,
    de: `Verbunden (Server ${region.toUpperCase()}): ${total} Gerät(e) im Konto, ${supported} unterstützt.`,
    es: `Conectado (servidor ${region.toUpperCase()}): ${total} dispositivo(s) en la cuenta, ${supported} compatibles.`,
  }),

  /** The unsupported models found on the account, appended to the test report. */
  unsupported: (models) => ({
    en: `Not supported: ${models}.`,
    fr: `Non pris en charge : ${models}.`,
    de: `Nicht unterstützt: ${models}.`,
    es: `No compatibles: ${models}.`,
  }),

  /** The account lives on the other region: said in the test report. */
  regionChanged: (region) => ({
    en: `The account is on the ${region.toUpperCase()} server: select that region.`,
    fr: `Le compte est sur le serveur ${region.toUpperCase()} : choisissez cette région.`,
    de: `Das Konto liegt auf dem Server ${region.toUpperCase()}: wähle diese Region.`,
    es: `La cuenta está en el servidor ${region.toUpperCase()}: elija esa región.`,
  }),

  /** Widget: the filter life. */
  filter: (percent) => ({
    en: `filter ${percent} %`,
    fr: `filtre ${percent} %`,
    de: `Filter ${percent} %`,
    es: `filtro ${percent} %`,
  }),
};

/** The text of `value` in `language`, English when it is missing. */
export function pick(value, language) {
  if (typeof value === 'string') {
    return value;
  }
  return value?.[language] ?? value?.en ?? '';
}

/** The feature names of a language (French when unknown). */
export function namesFor(language) {
  return NAMES[LANGUAGES.includes(language) ? language : 'fr'];
}
