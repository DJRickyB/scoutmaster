(function () {
  const SOURCE_PAGE = "scoutbook-rsvp-helper-page";
  const SOURCE_CONTENT = "scoutbook-rsvp-helper-content";

  const LOGIN_DATA_KEY = "LOGIN_DATA";

  function esbUrlHeader() {
    return btoa(window.location.href);
  }

  function readLoginData() {
    try {
      const raw = localStorage.getItem(LOGIN_DATA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function storeLoginData(patch) {
    const current = readLoginData() || {};
    localStorage.setItem(
      LOGIN_DATA_KEY,
      JSON.stringify({ ...current, ...patch })
    );
  }

  function requireToken() {
    const token = readLoginData()?.token;
    if (!token) {
      throw new Error(
        "No ScoutBook+ session token. Log in on this tab and refresh the page."
      );
    }
    return token;
  }

  async function refreshSessionToken() {
    const token = requireToken();
    const res = await fetch(
      "https://auth.scouting.org/api/users/auth/refresh",
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json; version = 1",
          "Content-Type": "application/json; version = 1",
          Authorization: `bearer ${token}`,
        },
      }
    );
    if (!res.ok) {
      return token;
    }
    const data = await res.json();
    if (data.token) {
      storeLoginData(data);
      return data.token;
    }
    return token;
  }

  function authHeaders(token) {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-esb-url": esbUrlHeader(),
      Authorization: `bearer ${token}`,
    };
  }

  function appPath() {
    const { pathname, hash } = location;
    if (hash && hash.startsWith("#/")) {
      return hash.slice(1).split("?")[0];
    }
    return pathname;
  }

  function detectPageContext() {
    const path = appPath();
    const eventMatch = path.match(/\/calendar\/event\/(\d+)/);
    if (eventMatch) {
      return { mode: "event", eventId: eventMatch[1], path };
    }
    if (
      /^\/(balance-messaging|unitPaymentLogs|paymentLogs)(\/|$)/.test(path)
    ) {
      return { mode: "balances", eventId: null, path };
    }
    return { mode: "general", eventId: null, path };
  }

  function balanceQueryParams() {
    const to = new Date();
    const toDate = to.toISOString().slice(0, 10);
    const from = new Date(to);
    from.setFullYear(from.getFullYear() - 15);
    return { fromDate: from.toISOString().slice(0, 10), toDate };
  }

  function formatMoney(amount) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return "";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
    }).format(n);
  }

  async function apiGet(path, queryParams) {
    let url = path.startsWith("http")
      ? path
      : `https://api.scouting.org${path}`;
    if (queryParams && Object.keys(queryParams).length) {
      const u = new URL(url);
      for (const [key, value] of Object.entries(queryParams)) {
        if (value != null && value !== "") u.searchParams.set(key, String(value));
      }
      url = u.toString();
    }

    let token = requireToken();
    let res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: authHeaders(token),
    });

    if (res.status === 401) {
      token = await refreshSessionToken();
      res = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: authHeaders(token),
      });
    }

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`API ${res.status}: ${detail.slice(0, 200)}`);
    }
    return res.json();
  }

  function parseEventId() {
    const m = appPath().match(/\/calendar\/event\/(\d+)/);
    return m ? m[1] : null;
  }

  function eventUrlForId(eventId) {
    if (!eventId) return "";
    return `https://advancements.scouting.org/calendar/event/${eventId}`;
  }

  const PARENT_RELATIONSHIP_TYPES = new Set([1, 2]); // FatherOf, MotherOf

  function profileAllowsEmail(profileJson) {
    const profile = profileJson.profile ?? profileJson;
    const noEmails = profile.noEmails;
    return noEmails !== true && noEmails !== "True";
  }

  function primaryEmail(profileJson) {
    if (!profileAllowsEmail(profileJson)) return null;
    const emails = profileJson.emails ?? profileJson.profile?.emails ?? [];
    const primary = emails.find(
      (e) => e.isPrimary === true || e.isPrimary === "True"
    );
    return (primary ?? emails[0])?.email ?? null;
  }

  function normalizeRelationships(data) {
    if (Array.isArray(data)) return data;
    if (data?.relationships && Array.isArray(data.relationships)) {
      return data.relationships;
    }
    return [];
  }

  function isParentRelationship(rel) {
    const typeId = Number(
      rel.relationshipTypeId ?? rel.relationshipType?.id ?? rel.typeId
    );
    return PARENT_RELATIONSHIP_TYPES.has(typeId);
  }

  function relatedPersonGuid(rel) {
    return (
      rel.personGuid ??
      rel.relatedPersonGuid ??
      rel.reciprocalPersonGuid ??
      rel.relatedPerson?.personGuid ??
      null
    );
  }

  function parentLabel(rel) {
    const typeId = Number(rel.relationshipTypeId ?? rel.typeId);
    if (typeId === 1) return "Father";
    if (typeId === 2) return "Mother";
    return rel.relationship ?? rel.relationshipToYouth ?? "Parent";
  }

  function formatEventDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  }

  function isEligibleForScan(user, audience) {
    if (user.rsvpCode != null) return false;
    if (audience === "youth" && user.isAdult) return false;
    if (user.isAdult && user.noEmails) return false;
    return true;
  }

  async function mapWithConcurrency(items, limit, fn) {
    const results = [];
    let index = 0;

    async function worker() {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i], i);
      }
    }

    const workers = Array.from(
      { length: Math.min(limit, items.length) },
      () => worker()
    );
    await Promise.all(workers);
    return results;
  }

  async function fetchProfileCached(guid, cache) {
    if (!guid) return null;
    if (cache.has(guid)) return cache.get(guid);
    try {
      const profile = await apiGet(`/persons/v2/${guid}/personprofile`);
      cache.set(guid, profile);
      return profile;
    } catch {
      cache.set(guid, null);
      return null;
    }
  }

  async function parentGuidsForYouth(youthGuid, cache) {
    const guids = [];
    try {
      const relData = await apiGet(
        `/persons/v2/${youthGuid}/relationships?includeIneligibles=false`
      );
      for (const rel of normalizeRelationships(relData)) {
        if (!isParentRelationship(rel)) continue;
        if (rel.noEmails === true) continue;
        const pg = relatedPersonGuid(rel);
        if (pg) guids.push({ personGuid: pg, label: parentLabel(rel), rel });
      }
    } catch {
      /* fall back to profile block */
    }

    if (guids.length === 0) {
      const profile = await fetchProfileCached(youthGuid, cache);
      const info = profile?.parentsGuardiansInfo;
      if (Array.isArray(info)) {
        for (const p of info) {
          if (p.noEmails === true) continue;
          const pg =
            p.personGuid ?? p.parentPersonGuid ?? p.guardianPersonGuid;
          if (pg) {
            guids.push({
              personGuid: pg,
              label: p.relationship ?? p.type ?? "Parent",
              rel: p,
            });
          }
        }
      }
    }

    const seen = new Set();
    return guids.filter((p) => {
      if (seen.has(p.personGuid)) return false;
      seen.add(p.personGuid);
      return true;
    });
  }

  async function resolveRecipients(user, cache) {
    const recipients = [];
    const guid = user.personGuid;

    if (!user.isAdult && !user.noEmails) {
      const profile = await fetchProfileCached(guid, cache);
      const email = profile ? primaryEmail(profile) : null;
      if (email) {
        recipients.push({
          role: "scout",
          email,
          name: user.firstName ?? "",
        });
      }
    }

    if (!user.isAdult) {
      const parents = await parentGuidsForYouth(guid, cache);
      for (const parent of parents) {
        const profile = await fetchProfileCached(parent.personGuid, cache);
        const email = profile ? primaryEmail(profile) : null;
        if (!email) continue;
        const p = profile.profile ?? profile;
        const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
        recipients.push({
          role: "parent",
          email,
          name: name || parent.label,
          relationship: parent.label,
        });
      }
    } else if (!user.noEmails) {
      const profile = await fetchProfileCached(guid, cache);
      const email = profile ? primaryEmail(profile) : null;
      if (email) {
        recipients.push({
          role: "self",
          email,
          name: user.firstName ?? "",
        });
      }
    }

    const seen = new Set();
    const deduped = recipients.filter((r) => {
      const key = r.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return deduped;
  }

  async function resolveActiveOrgGuid() {
    const token = requireToken();
    const res = await fetch(
      "https://auth.scouting.org/api/users/auth/refresh",
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json; version = 1",
          "Content-Type": "application/json; version = 1",
          Authorization: `bearer ${token}`,
        },
      }
    );
    if (!res.ok) {
      throw new Error("Could not read your unit context.");
    }
    const session = await res.json();
    const personGuid = session.personGuid;
    if (!personGuid) {
      throw new Error("No personGuid on session.");
    }

    const pp = await apiGet(`/persons/v2/${personGuid}/personprofile`);
    const positions = pp.organizationPositions ?? [];
    const unit =
      positions.find((p) => p.organizationGuid) ?? positions[0] ?? null;

    const orgGuid = unit?.organizationGuid;
    if (!orgGuid) {
      throw new Error(
        "Could not determine unit. Open ScoutBook+ with your troop selected."
      );
    }

    const unitName =
      unit?.organizationName ?? unit?.unitName ?? unit?.unitNumber ?? "";

    return { orgGuid, unitName, personGuid };
  }

  function rosterUsers(response) {
    if (Array.isArray(response)) return response;
    return response?.users ?? [];
  }

  function balanceByMemberId(balanceRows) {
    const rows = Array.isArray(balanceRows) ? balanceRows : [];
    const map = new Map();
    for (const row of rows) {
      if (!row?.memberId) continue;
      const balance = row.balanceDetails?.balance ?? row.balance ?? 0;
      map.set(String(row.memberId), Number(balance));
    }
    return map;
  }

  async function scanDelinquentBalances() {
    const ctx = detectPageContext();
    if (ctx.mode !== "balances") {
      throw new Error(
        "Open Unit Payment Logs or Balance Messaging (/balance-messaging or /unitPaymentLogs)."
      );
    }

    const { orgGuid, unitName } = await resolveActiveOrgGuid();
    const params = balanceQueryParams();

    const [balanceRows, youthsRes, adultsRes] = await Promise.all([
      apiGet(`/advancements/v2/organization/${orgGuid}/balanceDetails`, params),
      apiGet(`/organizations/v2/units/${orgGuid}/youths`),
      apiGet(`/organizations/v2/units/${orgGuid}/adults`),
    ]);

    const balances = balanceByMemberId(balanceRows);
    const members = [
      ...rosterUsers(youthsRes).map((u) => ({ ...u, isAdult: false })),
      ...rosterUsers(adultsRes).map((u) => ({ ...u, isAdult: true })),
    ];

    const delinquent = members.filter((m) => {
      const bal = balances.get(String(m.memberId)) ?? 0;
      return bal > 0;
    });

    const profileCache = new Map();
    const unitMeta = { unitName, balanceAmount: "", balanceFormatted: "" };

    const people = await mapWithConcurrency(delinquent, 3, async (member) => {
      const firstName = member.firstName ?? "";
      const lastName = member.lastName ?? "";
      const fullName = [firstName, member.middleName, lastName]
        .filter(Boolean)
        .join(" ")
        .trim();
      const balance = balances.get(String(member.memberId)) ?? 0;
      const balanceFormatted = formatMoney(balance);

      const user = {
        userId: member.userId,
        personGuid: member.personGuid,
        firstName,
        lastName,
        nickName: member.nickName ?? "",
        noEmails: member.noEmails ?? false,
        isAdult: member.isAdult,
      };

      const recipients = await resolveRecipients(user, profileCache);
      const emails = recipients.map((r) => r.email);

      return {
        userId: user.userId,
        personGuid: user.personGuid,
        firstName,
        lastName,
        nickName: user.nickName,
        fullName,
        isAdult: user.isAdult,
        balance,
        balanceAmount: String(balance),
        balanceFormatted,
        recipients,
        email: emails[0] ?? null,
        emails,
        ...unitMeta,
        balanceAmount: String(balance),
        balanceFormatted,
      };
    });

    return {
      scanType: "balances",
      orgGuid,
      unitName,
      delinquentCount: delinquent.length,
      rosterCount: members.length,
      people,
    };
  }

  const SAMPLE_RECIPIENT = {
    firstName: "Jamie",
    lastName: "Example",
    fullName: "Jamie Example",
    nickName: "",
    email: "family@example.com",
    balanceAmount: "25.00",
    balanceFormatted: "$25.00",
  };

  async function getSignedInContact() {
    const token = requireToken();
    const res = await fetch(
      "https://auth.scouting.org/api/users/auth/refresh",
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json; version = 1",
          "Content-Type": "application/json; version = 1",
          Authorization: `bearer ${token}`,
        },
      }
    );
    if (!res.ok) {
      throw new Error("Could not read your ScoutBook+ session.");
    }
    const session = await res.json();
    const p = session.profile ?? {};
    const fullName = [p.firstName, p.middleName, p.lastName]
      .filter(Boolean)
      .join(" ");
    let email = session.membership?.email ?? "";
    const personGuid = session.personGuid;
    if (personGuid && !email) {
      const pp = await fetchProfileCached(personGuid, new Map());
      const pe = pp ? primaryEmail(pp) : null;
      if (pe) email = pe;
    }
    if (!email) {
      throw new Error("No email on your ScoutBook+ profile for preview delivery.");
    }
    return { email, fullName };
  }

  async function getPreviewTemplateVars() {
    const vars = {
      ...SAMPLE_RECIPIENT,
      unitName: "",
      eventName: "",
      eventDate: "",
      eventLocation: "",
      eventId: "",
      eventUrl: "",
    };

    try {
      const org = await resolveActiveOrgGuid();
      vars.unitName = org.unitName ?? "";
    } catch {
      /* optional */
    }

    const eventId = parseEventId();
    if (eventId) {
      vars.eventUrl = eventUrlForId(eventId);
      try {
        const event = await apiGet(
          `/advancements/events/${eventId}?swCache=true`
        );
        vars.eventName = event.name ?? "";
        vars.eventDate = formatEventDate(event.startDate);
        vars.eventLocation = event.location ?? "";
        vars.eventId = String(eventId);
      } catch {
        /* optional */
      }
    }

    let signedInAs = "";
    try {
      const contact = await getSignedInContact();
      signedInAs = contact.fullName;
    } catch {
      /* optional */
    }

    return { vars, signedInAs };
  }

  async function scanEventNoRsvp(eventId, audience = "all") {
    const id = eventId || parseEventId();
    if (!id) {
      throw new Error("Open a ScoutBook+ event page (/calendar/event/…).");
    }

    const event = await apiGet(
      `/advancements/events/${id}?swCache=true`
    );

    const candidates = (event.users ?? []).filter((u) =>
      isEligibleForScan(u, audience)
    );

    const eventMeta = {
      eventName: event.name ?? "",
      eventDate: formatEventDate(event.startDate),
      eventLocation: event.location ?? "",
      eventId: String(id),
      eventUrl: eventUrlForId(id),
    };

    const profileCache = new Map();

    const people = await mapWithConcurrency(candidates, 3, async (user) => {
      const firstName = user.firstName ?? "";
      const lastName = user.lastName ?? "";
      const fullName = [firstName, user.middleName, lastName]
        .filter(Boolean)
        .join(" ")
        .trim();

      const recipients = await resolveRecipients(user, profileCache);
      const emails = recipients.map((r) => r.email);

      return {
        userId: user.userId,
        personGuid: user.personGuid,
        firstName,
        lastName,
        nickName: user.nickName ?? "",
        fullName,
        isAdult: user.isAdult,
        recipients,
        email: emails[0] ?? null,
        emails,
        ...eventMeta,
      };
    });

    return {
      eventId: id,
      audience,
      eventMeta,
      totalInvited: (event.users ?? []).length,
      noRsvpCount: candidates.length,
      people,
    };
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== SOURCE_CONTENT) return;

    const { requestId, type, payload } = data;

    try {
      if (type === "SCAN_NO_RSVP") {
        const audience = payload?.audience === "youth" ? "youth" : "all";
        const result = await scanEventNoRsvp(payload?.eventId, audience);
        window.postMessage(
          {
            source: SOURCE_PAGE,
            requestId,
            ok: true,
            result,
          },
          "*"
        );
        return;
      }

      if (type === "GET_PREVIEW_TEMPLATE_VARS") {
        const result = await getPreviewTemplateVars();
        window.postMessage(
          {
            source: SOURCE_PAGE,
            requestId,
            ok: true,
            result,
          },
          "*"
        );
        return;
      }

      if (type === "GET_SIGNED_IN_CONTACT") {
        const result = await getSignedInContact();
        window.postMessage(
          {
            source: SOURCE_PAGE,
            requestId,
            ok: true,
            result,
          },
          "*"
        );
        return;
      }

      if (type === "GET_PAGE_CONTEXT") {
        const page = detectPageContext();
        window.postMessage(
          {
            source: SOURCE_PAGE,
            requestId,
            ok: true,
            result: page,
          },
          "*"
        );
        return;
      }

      if (type === "SCAN_DELINQUENT_BALANCES") {
        const result = await scanDelinquentBalances();
        window.postMessage(
          {
            source: SOURCE_PAGE,
            requestId,
            ok: true,
            result,
          },
          "*"
        );
        return;
      }

      window.postMessage(
        {
          source: SOURCE_PAGE,
          requestId,
          ok: false,
          error: `Unknown request: ${type}`,
        },
        "*"
      );
    } catch (err) {
      window.postMessage(
        {
          source: SOURCE_PAGE,
          requestId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
        "*"
      );
    }
  });
})();
