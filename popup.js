import { detectPageContext, modeLabel, resolveAppPath } from "./lib/page-context.js";
import {
  BALANCE_DEFAULT_BODY,
  BALANCE_DEFAULT_SUBJECT,
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  STORAGE_KEY_BALANCE,
  STORAGE_KEY_RSVP,
  TEMPLATE_HELP_BALANCE,
  TEMPLATE_HELP_RSVP,
  TEMPLATE_RECIPIENT_NOTE,
  renderTemplate,
} from "./lib/template.js";

/** @type {'event' | 'balances' | 'general'} */
let pageMode = "general";

/** @type {Array<Record<string, unknown>>} */
let lastPeople = [];
/** @type {Array<{ person: Record<string, unknown>, email: string, role: string }>} */
let mailQueue = [];
let mailQueueIndex = 0;

const $ = (id) => document.getElementById(id);

const resultsSection = $("resultsSection");
const resultsTitle = $("resultsTitle");
const recipientList = $("recipientList");
const statusEl = $("status");

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

function activeTemplateFields() {
  if (pageMode === "balances") {
    return { subject: $("subjectBalance"), body: $("bodyBalance") };
  }
  return { subject: $("subjectRsvp"), body: $("bodyRsvp") };
}

function initStaticCopy() {
  $("placeholderHelpRsvp").textContent = `Placeholders: ${TEMPLATE_HELP_RSVP}`;
  $("placeholderHelpBalance").textContent = `Placeholders: ${TEMPLATE_HELP_BALANCE}`;
  $("templateRecipientNoteRsvp").textContent = TEMPLATE_RECIPIENT_NOTE;
  $("templateRecipientNoteBalance").textContent = TEMPLATE_RECIPIENT_NOTE;
}

async function loadTemplates() {
  const stored = await chrome.storage.local.get([
    STORAGE_KEY_RSVP,
    STORAGE_KEY_BALANCE,
    "emailTemplate",
  ]);

  if (!stored[STORAGE_KEY_RSVP] && stored.emailTemplate) {
    await chrome.storage.local.set({
      [STORAGE_KEY_RSVP]: stored.emailTemplate,
    });
  }

  const rsvp = stored[STORAGE_KEY_RSVP] ?? {};
  const balance = stored[STORAGE_KEY_BALANCE] ?? {};

  $("subjectRsvp").value = rsvp.subject ?? DEFAULT_SUBJECT;
  $("bodyRsvp").value = rsvp.body ?? DEFAULT_BODY;
  $("subjectBalance").value = balance.subject ?? BALANCE_DEFAULT_SUBJECT;
  $("bodyBalance").value = balance.body ?? BALANCE_DEFAULT_BODY;
}

async function saveTemplate(mode) {
  const isBalance = mode === "balance";
  const key = isBalance ? STORAGE_KEY_BALANCE : STORAGE_KEY_RSVP;
  const subject = isBalance ? $("subjectBalance") : $("subjectRsvp");
  const body = isBalance ? $("bodyBalance") : $("bodyRsvp");

  await chrome.storage.local.set({
    [key]: { subject: subject.value, body: body.value },
  });
  setStatus("Template saved.", "ok");
}

function applyUiMode(context) {
  const { mode, eventId } = context;
  pageMode = mode;

  document.body.dataset.mode = mode;
  document.title = modeLabel(mode);

  const onEvent = mode === "event";
  const onBalances = mode === "balances";

  $("idlePanel").classList.toggle("hidden", onEvent || onBalances);
  $("rsvpTool").classList.toggle("hidden", !onEvent);
  $("balanceTool").classList.toggle("hidden", !onBalances);

  if (onEvent) {
    $("rsvpContextHint").textContent = eventId
      ? `Event ${eventId} — invitees with no RSVP (rsvpCode empty).`
      : "This event — invitees with no RSVP.";
  }

  if (!onEvent && !onBalances) {
    $("idleHint").textContent =
      "Open a ScoutBook+ event page for RSVP reminders, or Unit Payment Logs / Balance Messaging for balance collection.";
  }

  $("previewSection").classList.add("hidden");
  resultsSection.classList.add("hidden");
}

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (!tab?.id) throw new Error("No active tab.");
    return tab;
  });
}

async function refreshPageContext() {
  try {
    const tab = await getActiveTab();
    if (!tab.url?.includes("advancements.scouting.org")) {
      applyUiMode({ mode: "general", eventId: null, path: "" });
      setStatus("Open ScoutBook+ in this tab.", "error");
      return;
    }

    let context = null;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: "GET_PAGE_CONTEXT",
        payload: {},
      });
      if (response?.ok && response.result) {
        context = response.result;
      }
    } catch {
      /* content script may be stale */
    }

    if (!context) {
      const path = resolveAppPath(tab.url);
      context = detectPageContext(path);
    }

    applyUiMode(context);

    if (context.mode === "event" || context.mode === "balances") {
      setStatus(`Ready — ${modeLabel(context.mode)}.`, "ok");
    } else {
      setStatus("Navigate to an event or Unit Payment Logs.", "");
    }
  } catch {
    applyUiMode({ mode: "general", eventId: null, path: "" });
    setStatus("Refresh the ScoutBook+ tab, then reopen the extension.", "error");
  }
}

function countRecipientEmails(people) {
  const set = new Set();
  for (const p of people) {
    for (const e of p.emails ?? []) {
      if (e) set.add(e.toLowerCase());
    }
  }
  return set.size;
}

function buildMailQueue(people) {
  const queue = [];
  const seen = new Set();
  for (const person of people) {
    for (const r of person.recipients ?? []) {
      const key = `${person.userId}:${r.email.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({ person, email: r.email, role: r.role });
    }
  }
  return queue;
}

function setScanButtonsDisabled(disabled) {
  $("scanYouth").disabled = disabled;
  $("scanAll").disabled = disabled;
  $("scanBalances").disabled = disabled;
}

function sendPreviewLabel(entry) {
  const name = entry.person.fullName || entry.person.firstName;
  const role =
    entry.role === "parent"
      ? "parent"
      : entry.role === "scout"
        ? "scout"
        : "recipient";
  return `${name} → ${entry.email} (${role})`;
}

function populateSendPreviewTargets() {
  const select = $("sendPreviewTarget");
  select.replaceChildren();
  for (let i = 0; i < mailQueue.length; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = sendPreviewLabel(mailQueue[i]);
    select.appendChild(opt);
  }
  $("sendPreviewSection").classList.toggle("hidden", !mailQueue.length);
}

function selectedSendPreviewEntry() {
  const idx = Number($("sendPreviewTarget").value);
  if (!Number.isFinite(idx) || idx < 0 || idx >= mailQueue.length) {
    return null;
  }
  return mailQueue[idx];
}

function showResults(people, title, statusMessage) {
  lastPeople = people;
  mailQueue = buildMailQueue(lastPeople);
  mailQueueIndex = 0;
  resultsTitle.textContent = title;
  renderRecipientList(lastPeople);
  populateSendPreviewTargets();
  resultsSection.classList.remove("hidden");
  setStatus(statusMessage, "ok");
}

async function scanRsvp(audience) {
  if (pageMode !== "event") {
    setStatus("Open a calendar event page first.", "error");
    return;
  }

  setStatus("Scanning RSVPs…");
  setScanButtonsDisabled(true);
  resultsSection.classList.add("hidden");

  try {
    const tab = await getActiveTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SCAN_NO_RSVP",
      payload: { audience },
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Scan failed.");
    }

    const { result } = response;
    const people = result.people ?? [];
    const emailCount = countRecipientEmails(people);
    const noEmailRows = people.filter((p) => !(p.emails && p.emails.length)).length;
    const label = audience === "youth" ? "Youths" : "All";

    showResults(
      people,
      `${label}: ${result.noRsvpCount} no RSVP · ${emailCount} addresses`,
      `“${result.eventMeta.eventName}”: ${result.noRsvpCount} no RSVP, ${emailCount} emails (${noEmailRows} rows with none).`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(msg, "error");
  } finally {
    setScanButtonsDisabled(false);
  }
}

async function scanBalances() {
  if (pageMode !== "balances") {
    setStatus("Open Unit Payment Logs or Balance Messaging first.", "error");
    return;
  }

  setStatus("Scanning balances…");
  setScanButtonsDisabled(true);
  resultsSection.classList.add("hidden");

  try {
    const tab = await getActiveTab();
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SCAN_DELINQUENT_BALANCES",
      payload: {},
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Balance scan failed.");
    }

    const { result } = response;
    const people = result.people ?? [];
    const emailCount = countRecipientEmails(people);

    showResults(
      people,
      `${result.delinquentCount} delinquent · ${emailCount} addresses`,
      `${result.unitName}: ${result.delinquentCount} with balance > $0, ${emailCount} emails.`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(msg, "error");
  } finally {
    setScanButtonsDisabled(false);
  }
}

function renderRecipientList(people) {
  recipientList.replaceChildren();
  for (const p of people) {
    const li = document.createElement("li");
    const recs = p.recipients ?? [];
    const balanceLine =
      p.balanceFormatted != null && p.balanceFormatted !== ""
        ? `<div class="meta balance">Balance: ${escapeHtml(String(p.balanceFormatted))}</div>`
        : "";
    const emailHtml = recs.length
      ? recs.map((r) => formatRecipientLine(r)).join("<br>")
      : '<span class="warn">no email on file</span>';
    const tag = p.isAdult ? "" : ' <span class="meta">(youth)</span>';
    li.innerHTML = `<div class="name">${escapeHtml(p.fullName || p.firstName)}${tag}</div>
      ${balanceLine}
      <div class="meta">${emailHtml}</div>`;
    recipientList.appendChild(li);
  }
}

function formatRecipientLine(r) {
  if (r.role === "parent") {
    const rel = r.relationship ? ` (${r.relationship})` : "";
    return `Parent${rel}: ${escapeHtml(r.email)}`;
  }
  if (r.role === "scout") {
    return `Scout: ${escapeHtml(r.email)}`;
  }
  return escapeHtml(r.email);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function templateForPerson(person) {
  const { subject, body } = activeTemplateFields();
  return {
    subject: renderTemplate(subject.value, person),
    body: renderTemplate(body.value, person),
  };
}

function mailtoUrl(to, subject, body) {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const qs = params.toString();
  return `mailto:${encodeURIComponent(to)}${qs ? `?${qs}` : ""}`;
}

function openNextMail() {
  if (!mailQueue.length) {
    setStatus("No recipient email addresses.", "error");
    return;
  }

  if (mailQueueIndex >= mailQueue.length) {
    mailQueueIndex = 0;
    setStatus("Finished all messages. Click again to restart.", "ok");
    return;
  }

  const { person, email, role } = mailQueue[mailQueueIndex];
  const { subject, body } = templateForPerson(person);
  chrome.tabs.create({ url: mailtoUrl(email, subject, body) });
  mailQueueIndex += 1;
  const roleLabel = role === "parent" ? "parent" : person.firstName;
  setStatus(
    `Opened mail ${mailQueueIndex}/${mailQueue.length} (${roleLabel}).`,
    "ok"
  );
}

async function copyBcc() {
  const seen = new Set();
  const emails = [];
  for (const p of lastPeople) {
    for (const e of p.emails ?? []) {
      const key = e.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(e);
    }
  }
  if (!emails.length) {
    setStatus("No emails to copy.", "error");
    return;
  }
  await navigator.clipboard.writeText(emails.join(", "));
  setStatus(`Copied ${emails.length} addresses (comma-separated).`, "ok");
}

function viewSendPreview() {
  const entry = selectedSendPreviewEntry();
  if (!entry) {
    setStatus("Run a scan first.", "error");
    return;
  }

  const { person, email, role } = entry;
  const { subject, body } = templateForPerson(person);

  $("previewAs").textContent = `Send preview for ${person.fullName || person.firstName} → ${email} (${role})`;
  $("previewSubject").textContent = subject;
  $("previewBody").textContent = body;
  $("previewSection").classList.remove("hidden");
  setStatus("Exact outbound subject and body.", "ok");
}

async function emailSendPreviewToMe() {
  const entry = selectedSendPreviewEntry();
  if (!entry) {
    setStatus("Run a scan first.", "error");
    return;
  }

  try {
    const tab = await getActiveTab();
    const contactRes = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_SIGNED_IN_CONTACT",
      payload: {},
    });
    if (!contactRes?.ok) {
      throw new Error(contactRes?.error || "Could not load your email.");
    }

    const { email: myEmail } = contactRes.result;
    const { person } = entry;
    const { subject, body } = templateForPerson(person);

    chrome.tabs.create({
      url: mailtoUrl(myEmail, subject, body),
    });
    setStatus("Opened a draft to your email with the preview.", "ok");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(msg, "error");
  }
}

async function previewSample() {
  setStatus("Building preview…");

  try {
    const tab = await getActiveTab();
    if (!tab.url?.includes("advancements.scouting.org")) {
      throw new Error("Open ScoutBook+ in this tab.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_PREVIEW_TEMPLATE_VARS",
      payload: {},
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not build preview.");
    }

    const { vars, signedInAs } = response.result;
    const { subject, body } = activeTemplateFields();
    const renderedSubject = renderTemplate(subject.value, vars);
    const renderedBody = renderTemplate(body.value, vars);

    const who = `Sample recipient: ${vars.fullName} <${vars.email}>`;
    $("previewAs").textContent = signedInAs
      ? `${who} · Signed in as ${signedInAs}`
      : who;
    $("previewSubject").textContent = renderedSubject;
    $("previewBody").textContent = renderedBody;
    $("previewSection").classList.remove("hidden");

    setStatus("Sample recipient preview (not from scan).", "ok");
  } catch (err) {
    $("previewSection").classList.add("hidden");
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(msg, "error");
  }
}

initStaticCopy();
loadTemplates().then(() => refreshPageContext());

$("saveTemplateRsvp").addEventListener("click", () => saveTemplate("rsvp"));
$("saveTemplateBalance").addEventListener("click", () => saveTemplate("balance"));
$("previewTemplateRsvp").addEventListener("click", () => previewSample());
$("previewTemplateBalance").addEventListener("click", () => previewSample());
$("scanYouth").addEventListener("click", () => scanRsvp("youth"));
$("scanAll").addEventListener("click", () => scanRsvp("all"));
$("scanBalances").addEventListener("click", () => scanBalances());
$("openMail").addEventListener("click", () => openNextMail());
$("copyBcc").addEventListener("click", () => copyBcc());
$("viewSendPreview").addEventListener("click", () => viewSendPreview());
$("emailSendPreviewToMe").addEventListener("click", () => emailSendPreviewToMe());
