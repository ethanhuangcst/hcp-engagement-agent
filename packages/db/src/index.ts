export {
  getPool,
  pingDatabase,
  closePool,
  _resetPoolForTests,
} from "./client.js";

export {
  AGENT_GENERAL_HCP_ID,
  upsertTwin,
  getTwin,
  deleteTwin,
  listTwins,
  queryTwins,
  nameMatches,
  nameMatchTier,
  filtersMatch,
  upsertInsights,
  getInsights,
  updateTwinTags,
  updateTwinIdentity,
  type TwinListItem,
  type QueryTwinsInput,
  type QueryTwinsResult,
  type NameMatchTier,
} from "./twins.js";
export {
  confirmAndSaveTwin,
  normalizeAuthorIds,
  type ConfirmAndSaveInput,
  type ConfirmAndSaveResult,
  type PossibleDuplicate,
} from "./confirm.js";

export {
  upsertEngagementOptions,
  getEngagementOptionsRun,
  getLatestEngagementOptions,
  upsertChatSession,
  getChatSession,
  listChatSessions,
} from "./engagement.js";
