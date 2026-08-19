// background.js — service worker. Logs install event.
chrome.runtime.onInstalled.addListener(() => {
  console.log('hackathon-todo: installed');
});
