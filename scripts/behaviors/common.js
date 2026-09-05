/**
 * Fields shared by every click behavior (hover label, highlight mode,
 * highlight colour). Localised under TILECOMPANIONS.ClickCommon.FIELDS —
 * each behavior class lists that prefix after its own.
 */

export const fields = foundry.data.fields;

export const COMMON_PREFIX = 'TILECOMPANIONS.ClickCommon';

export function clickFields() {
  return {
    // Label shown above the region on hover; empty = a per-behavior default (see displayName).
    label: new fields.StringField({ required: true, blank: true, initial: '' }),
    highlight: new fields.StringField({
      required: true, blank: false, initial: 'hover',
      choices: {
        hover: `${COMMON_PREFIX}.FIELDS.highlight.choices.hover`,
        always: `${COMMON_PREFIX}.FIELDS.highlight.choices.always`,
        never: `${COMMON_PREFIX}.FIELDS.highlight.choices.never`
      }
    }),
    // Empty = the region's own colour.
    color: new fields.ColorField({ required: false, nullable: true, initial: null })
  };
}
