export {
  AuthorIdsSchema,
  ACTIVE_P0_AUTHOR_KEYS,
  hasActiveP0AuthorId,
  assertAuthorIdsForLiteratureIngest,
  type AuthorIds,
} from "./author-ids.js";

export {
  HcpTierSchema,
  RoleTagSchema,
  TagMethodSchema,
  HcpTagsSchema,
  FORBIDDEN_TAG_SIGNALS,
  type HcpTier,
  type RoleTag,
  type TagMethod,
  type HcpTags,
} from "./tags.js";

export {
  SCHEMA_VERSION,
  DisambiguationStatusSchema,
  TwinIdentitySchema,
  TwinProfileSchema,
  TwinResearchSchema,
  TwinMetaSchema,
  VirtualTwinSchema,
  HcpInsightsSchema,
  assertNoComplianceForbiddenFields,
  type TwinIdentity,
  type VirtualTwin,
  type HcpInsights,
} from "./twin.js";

export {
  McpErrorCodeSchema,
  McpErrorSchema,
  mcpError,
  isMcpError,
  type McpErrorCode,
  type McpError,
} from "./mcp-error.js";
