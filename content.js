const SOURCE_PAGE = "scoutbook-rsvp-helper-page";
const SOURCE_CONTENT = "scoutbook-rsvp-helper-content";

function ensureInjected() {
  if (document.documentElement.dataset.scoutbookRsvpHelperInjected) return;
  document.documentElement.dataset.scoutbookRsvpHelperInjected = "1";

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

function callPage(type, payload) {
  ensureInjected();

  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();

    const onMessage = (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.source !== SOURCE_PAGE || data.requestId !== requestId) {
        return;
      }
      window.removeEventListener("message", onMessage);
      if (data.ok) resolve(data.result);
      else reject(new Error(data.error || "Request failed"));
    };

    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: SOURCE_CONTENT, requestId, type, payload },
      "*"
    );

    setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Timed out waiting for ScoutBook+ page script."));
    }, 120_000);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SCAN_NO_RSVP") {
    callPage("SCAN_NO_RSVP", message.payload ?? {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    return true;
  }
  if (message?.type === "GET_MY_TEMPLATE_VARS") {
    callPage("GET_MY_TEMPLATE_VARS", message.payload ?? {})
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    return true;
  }
  return false;
});

ensureInjected();
