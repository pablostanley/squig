// Local-dev shim only. Delta Chat injects window.webxdc at runtime —
// never ship this file inside the .xdc (make build-xdc excludes it).
if (typeof window !== "undefined" && !window.webxdc) {
  window.webxdc = {
    sendUpdate() {},
    setUpdateListener(cb) {
      return Promise.resolve().then(() => cb && undefined);
    },
    getAllUpdates() {
      return Promise.resolve([]);
    },
    sendToChat() {
      return Promise.resolve();
    },
    importFiles() {
      return Promise.resolve([]);
    },
    selfAddr: "dev@local",
    selfName: "Dev",
  };
}
