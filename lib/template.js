/** @typedef {{ firstName?: string, lastName?: string, fullName?: string, nickName?: string, email?: string, eventName?: string, eventDate?: string, eventLocation?: string, eventId?: string, eventUrl?: string }} TemplateVars */

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

Thanks,
{{fullName}}
`;

export const TEMPLATE_HELP = [
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
