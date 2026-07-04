'use strict';

const os = require('os');
const path = require('path');

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function projectsDir() {
  return path.join(claudeDir(), 'projects');
}

function configDir() {
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'splitclaude');
}

function configFile() {
  return path.join(configDir(), 'config.json');
}

function stateFile() {
  return path.join(configDir(), 'state.json');
}

module.exports = { claudeDir, projectsDir, configDir, configFile, stateFile };
