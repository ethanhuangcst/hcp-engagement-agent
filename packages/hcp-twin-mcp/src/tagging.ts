import type { HcpTags, RoleTag, VirtualTwin } from "@hca/domain";

const TITLE_T1 = /^(?!.*副).*(院长|主任医师|教授|主委|院士)/;
const TITLE_T2 = /副主任|副教授|秘书/;

export function ruleTagFromProfile(input: {
  title?: string;
  hospital?: string;
  roleHints?: string[];
}): HcpTags {
  const title = input.title ?? "";
  let hcp_tier: HcpTags["hcp_tier"] = "unclassified";
  if (TITLE_T2.test(title)) {
    hcp_tier = "T2";
  } else if (TITLE_T1.test(title) || (input.hospital ?? "").includes("中山")) {
    hcp_tier = "T1";
  } else if (title) {
    hcp_tier = "T3";
  }

  const role_tags: RoleTag[] = [];
  const hints = (input.roleHints ?? []).map((h) => h.toLowerCase());
  if (hints.some((h) => h.includes("kol")) || hcp_tier === "T1") {
    role_tags.push("kol");
  }
  if (hints.some((h) => h.includes("kme"))) role_tags.push("kme");
  if (hints.some((h) => h.includes("行政") || h.includes("admin"))) {
    role_tags.push("administrator");
  }
  if (hints.some((h) => h.includes("政策"))) role_tags.push("policy_voice");
  if (hcp_tier === "T3") role_tags.push("frontline");

  return {
    hcp_tier,
    role_tags: [...new Set(role_tags)],
    tag_confidence: hcp_tier === "unclassified" ? "low" : "medium",
    tag_as_of: new Date().toISOString().slice(0, 10),
    tag_method: "rule",
    evidence_refs: ["profile.title", "profile.hospital"],
  };
}

export function applyTagOverride(
  existing: HcpTags | undefined,
  override: { hcp_tier?: HcpTags["hcp_tier"]; role_tags?: RoleTag[] },
  forceRule: boolean,
  ruleTags: HcpTags,
): HcpTags {
  if (
    existing?.tag_method === "user_override" &&
    !forceRule &&
    !override.hcp_tier &&
    !override.role_tags
  ) {
    return existing;
  }

  if (override.hcp_tier || override.role_tags) {
    return {
      hcp_tier: override.hcp_tier ?? existing?.hcp_tier ?? ruleTags.hcp_tier,
      role_tags: override.role_tags ?? existing?.role_tags ?? ruleTags.role_tags,
      tag_confidence: "high",
      tag_as_of: new Date().toISOString().slice(0, 10),
      tag_method: "user_override",
      evidence_refs: ["user_override"],
    };
  }

  if (existing?.tag_method === "user_override" && !forceRule) {
    return existing;
  }

  return ruleTags;
}

export function tagsFromTwin(twin: VirtualTwin): HcpTags {
  return ruleTagFromProfile({
    title: twin.profile.title,
    hospital: twin.profile.hospital,
    roleHints: twin.profile.role_labels,
  });
}
