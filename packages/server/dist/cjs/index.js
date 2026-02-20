'use strict';

const load = () => import('../esm/index.js');

module.exports = {
  STARTUP_ERROR_MESSAGE: 'Failed to start mail-magic:',
  createMailMagicServer: async (...args) => (await load()).createMailMagicServer(...args),
  startMailMagicServer: async (...args) => (await load()).startMailMagicServer(...args)
};
