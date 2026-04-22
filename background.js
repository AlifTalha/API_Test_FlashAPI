// background.js — Service Worker for API Tester Extension
// Keeps the extension alive and handles any future background tasks.

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") {
    // Seed empty history on first install
    chrome.storage.local.set({ history: [] });
  }
});
