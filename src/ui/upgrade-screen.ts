// Re-export from systems/upgrades to keep the UI module structure consistent.
// The actual logic lives in systems/upgrades.ts since it interacts with game state.
export { showUpgradeScreen, showUpgradeFromHost, finishUpgrade } from '../systems/upgrades';
