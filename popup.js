import {
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  TEMPLATE_HELP,
  renderTemplate,
} from "./lib/template.js";

const STORAGE_KEY = "emailTemplate";

/** @type {Array<Record<string, unknown>>} */
let lastPeople = [];
/** @type {Array<{ person: Record<string, unknown>, email: string, role: string }>} */
let mailQueue = [];
let mailQueueIndex = 0;

const $ = (id) => document.getElementById(id);

const subjectEl = $("subject");
const bodyEl = $("body");
const placeholderHelp = $("placeholderHelp");
const statusEl = $("status");
const resultsSection = $("resultsSection");
const resultsTitle = $("resultsTitle");
const recipientList = $("recipientList");

placeholderHelp.textContent = `Placeholders: ${TEMPLATE_HELP}`;

async function loadTemplate() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const t = stored[STORAGE_KEY] ?? {};
  subjectEl.value = t.subject ?? DEFAULT_SUBJECT;
  bodyEl.value = t.body ?? DEFAULT_BODY;
}

async function saveTemplate() {
  await chrome.storage.local.set({
    [STORAGE_KEY]: {
      subject: subjectEl.value,
      body: bodyEl.value,
    },
  });
  setStatus("Template saved.", "ok");
}

async function previewWithMyInfo() {
  const previewSection = $("previewSection");
  setStatus("Loading your profile…");

  try {
    const tab = await getActiveTab();
    if (!tab.url?.includes("advancements.scouting.org")) {
      throw new Error("Open ScoutBook+ in this tab to detect your profile.");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "GET_MY_TEMPLATE_VARS",
      payload: {},
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Could not load profile.");
    }

    const { vars } = response.result;
    const subject = renderTemplate(subjectEl.value, vars);
    const body = renderTemplate(bodyEl.value, vars);

    $("previewAs").textContent = vars.email
      ? `Filled with your profile: ${vars.fullName} <${vars.email}>`
      : `Filled with your profile: ${vars.fullName}`;
    $("previewSubject").textContent = subject;
    $("previewBody").textContent = body;
    previewSection.classList.remove("hidden");

    const eventNote = vars.eventName
      ? ` Event: ${vars.eventName}.`
      : " Open an event page to fill event placeholders.";
    setStatus(`Preview updated.${eventNote}`, "ok");
  } catch (err) {
    previewSection.classList.add("hidden");
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(msg, "error");
  }
}

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`.trim();
}

function getActiveTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tab = tabs[0];
    if (!tab?.id) throw new Error("No active tab.");
    return tab;
  });
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
}

async function scan(audience) {
  setStatus("Scanning…");
  setScanButtonsDisabled(true);
  resultsSection.classList.add("hidden");
  lastPeople = [];
  mailQueue = [];
  mailQueueIndex = 0;

  try {
    const tab = await getActiveTab();
    if (!tab.url?.includes("advancements.scouting.org")) {
      throw new Error("Switch to a ScoutBook+ tab (advancements.scouting.org).");
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: "SCAN_NO_RSVP",
      payload: { audience },
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Scan failed.");
    }

    const { result } = response;
    lastPeople = result.people ?? [];
    mailQueue = buildMailQueue(lastPeople);

    const emailCount = countRecipientEmails(lastPeople);
    const noEmailRows = lastPeople.filter(
      (p) => !(p.emails && p.emails.length)
    ).length;
    const label = audience === "youth" ? "Youths" : "All";

    resultsTitle.textContent = `${label}: ${result.noRsvpCount} no RSVP · ${emailCount} addresses`;
    renderRecipientList(lastPeople);
    resultsSection.classList.remove("hidden");

    setStatus(
      `“${result.eventMeta.eventName}”: ${result.noRsvpCount} people, ${emailCount} emails (${noEmailRows} with none on file).`,
      "ok"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(msg, "error");
  } finally {
    setScanButtonsDisabled(false);
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

function renderRecipientList(people) {
  recipientList.replaceChildren();
  for (const p of people) {
    const li = document.createElement("li");
    const recs = p.recipients ?? [];
    const emailHtml = recs.length
      ? recs.map((r) => formatRecipientLine(r)).join("<br>")
      : '<span class="warn">no email on file</span>';
    const tag = p.isAdult ? "" : ' <span class="meta">(youth)</span>';
    li.innerHTML = `<div class="name">${escapeHtml(p.fullName || p.firstName)}${tag}</div>
      <div class="meta">${emailHtml}</div>`;
    recipientList.appendChild(li);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function templateForPerson(person) {
  const subject = renderTemplate(subjectEl.value, person);
  const body = renderTemplate(bodyEl.value, person);
  return { subject, body };
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

$("saveTemplate").addEventListener("click", () => saveTemplate());
$("previewTemplate").addEventListener("click", () => previewWithMyInfo());
$("scanYouth").addEventListener("click", () => scan("youth"));
$("scanAll").addEventListener("click", () => scan("all"));
$("openMail").addEventListener("click", () => openNextMail());
$("copyBcc").addEventListener("click", () => copyBcc());

loadTemplate();
