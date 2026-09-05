export const MODULE_ID = 'tile-companions';

/** Companion kinds, in creation order. */
export const KINDS = ['region', 'sound', 'light'];

/** Embedded document name per kind (Scene collections: regions / sounds / lights). */
export const DOC_NAME = { region: 'Region', sound: 'AmbientSound', light: 'AmbientLight' };
export const COLLECTION = { region: 'regions', sound: 'sounds', light: 'lights' };

/**
 * Operation option stamped on every write the module makes itself, so its
 * own hooks can tell a user edit from an echo of their own update
 * (Foundry forwards operation options to every client).
 */
export const OPT = 'tileCompanions';

/** World settings. */
export const SETTING_CASCADE = 'cascadeDelete';
export const SETTING_AUTO_RETRACE = 'autoRetrace';
export const SETTING_SYNC_HIDDEN = 'syncHidden';
