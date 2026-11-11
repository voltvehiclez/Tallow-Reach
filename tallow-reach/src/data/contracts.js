// Compatibility entry point for the original contract table. Step 13 keeps
// existing data imports working while the definitions now live under the
// mission data folder and are consumed by sim/missions.js.

export {
  CONTRACT_TYPES,
  MINE_ORES,
  CONTRACT,
  DESCRIBE,
  CONTRACTS_PER_BOARD,
  CONTRACT_MISSION_TEMPLATES,
  missionFromContract,
  describeMission,
  contractObjectiveKind,
} from "./missions/contracts.js";
