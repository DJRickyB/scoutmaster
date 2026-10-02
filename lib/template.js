/** @typedef {{ firstName?: string, lastName?: string, fullName?: string, nickName?: string, email?: string, eventName?: string, eventDate?: string, eventLocation?: string, eventId?: string, eventUrl?: string, unitName?: string, balanceAmount?: string, balanceFormatted?: string }} TemplateVars */

export const STORAGE_KEY_RSVP = "emailTemplate_rsvp";
export const STORAGE_KEY_BALANCE = "emailTemplate_balance";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Replace `{{field}}` placeholders; unknown keys become empty strings.
 * @param {string} text
 * @param {TemplateVars} vars
 */
export function renderTemplate(text, vars) {
  return text.replace(PLACEHOLDER_RE, (_, key) => {
    const value = vars[key];
    return value == null ? "" : String(value);
  });
}

export const DEFAULT_SUBJECT = "RSVP reminder: {{eventName}}";

export const DEFAULT_BODY = `Hi {{firstName}},

We still need your RSVP for {{eventName}} on {{eventDate}}.

Please respond in ScoutBook+ when you can.

Thank you,
`;

export const TEMPLATE_HELP_RSVP = [
  "{{firstName}}",
  "{{lastName}}",
  "{{fullName}}",
  "{{nickName}}",
  "{{email}}",
  "{{eventName}}",
  "{{eventDate}}",
  "{{eventLocation}}",
  "{{eventId}}",
  "{{eventUrl}}",
].join(", ");

export const TEMPLATE_HELP_BALANCE = [
  "{{firstName}}",
  "{{lastName}}",
  "{{fullName}}",
  "{{email}}",
  "{{unitName}}",
  "{{balanceAmount}}",
  "{{balanceFormatted}}",
].join(", ");

export const BALANCE_DEFAULT_SUBJECT = "Troop balance reminder — {{unitName}}";

export const BALANCE_DEFAULT_BODY = `Hi {{firstName}},

Our records show a balance of {{balanceFormatted}} on your ScoutBook+ account for {{unitName}}.

Please settle the balance when you can. Reply if you have questions.

Thank you,
`;

/** Shown under the placeholder list in the popup. */
export const TEMPLATE_RECIPIENT_NOTE =
  "Name and email placeholders are filled per recipient when you send. Sign with your own name as plain text in the template.";
