/** @typedef {'event' | 'balances' | 'general'} PageMode */

const BALANCE_PATH_RE =
  /^\/(balance-messaging|unitPaymentLogs|paymentLogs)(\/|$)/;

/**
 * ScoutBook+ is a hash router (#/unitPaymentLogs) or path router.
 * @param {string} urlOrPath Full tab URL or path starting with /
 */
export function resolveAppPath(urlOrPath = "") {
  if (!urlOrPath) {
    if (typeof location === "undefined") return "";
    const { pathname, hash } = location;
    if (hash && hash.startsWith("#/")) {
      return hash.slice(1).split("?")[0];
    }
    return pathname;
  }

  if (urlOrPath.startsWith("http")) {
    try {
      const u = new URL(urlOrPath);
      if (u.hash && u.hash.startsWith("#/")) {
        return u.hash.slice(1).split("?")[0];
      }
      return u.pathname;
    } catch {
      return "";
    }
  }

  return urlOrPath.split("?")[0];
}

/**
 * @param {string} [urlOrPath]
 * @returns {{ mode: PageMode, eventId: string | null, path: string }}
 */
export function detectPageContext(urlOrPath = "") {
  const path = resolveAppPath(urlOrPath);

  const eventMatch = path.match(/\/calendar\/event\/(\d+)/);
  if (eventMatch) {
    return { mode: "event", eventId: eventMatch[1], path };
  }

  if (BALANCE_PATH_RE.test(path)) {
    return { mode: "balances", eventId: null, path };
  }

  return { mode: "general", eventId: null, path };
}

export function modeLabel(mode) {
  switch (mode) {
    case "event":
      return "RSVP reminders";
    case "balances":
      return "Balance reminders";
    default:
      return "Scoutmaster";
  }
}
