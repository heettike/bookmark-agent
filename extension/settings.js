const urlInput = document.getElementById("apiUrl");
const keyInput = document.getElementById("apiKey");
const saveBtn = document.getElementById("save");
const testBtn = document.getElementById("test");
const statusEl = document.getElementById("status");

// load saved config
chrome.storage.local.get({ apiUrl: "", apiKey: "" }, (r) => {
  urlInput.value = r.apiUrl || "";
  keyInput.value = r.apiKey || "";
});

saveBtn.addEventListener("click", () => {
  const apiUrl = urlInput.value.trim().replace(/\/$/, "");
  const apiKey = keyInput.value.trim();

  chrome.storage.local.set({ apiUrl, apiKey }, () => {
    statusEl.className = "status ok";
    statusEl.textContent = "saved";
    setTimeout(() => { statusEl.textContent = ""; }, 2000);
  });
});

testBtn.addEventListener("click", async () => {
  const apiUrl = urlInput.value.trim().replace(/\/$/, "");
  const apiKey = keyInput.value.trim();

  if (!apiUrl || !apiKey) {
    statusEl.className = "status err";
    statusEl.textContent = "enter api url and key first";
    return;
  }

  statusEl.className = "status";
  statusEl.textContent = "testing...";

  chrome.runtime.sendMessage(
    { action: "testConnection", apiUrl, apiKey },
    (result) => {
      if (result?.ok) {
        statusEl.className = "status ok";
        statusEl.textContent = "connected";
      } else {
        statusEl.className = "status err";
        statusEl.textContent = result?.error || "connection failed";
      }
    }
  );
});
