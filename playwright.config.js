const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  // Run in the installed Microsoft Edge so no browser download is needed.
  use: { channel: 'msedge' },
});
