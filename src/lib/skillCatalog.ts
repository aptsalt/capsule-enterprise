// SKILL CATALOG — UI-only menu data for the composer's "Skills ▾" dropdown.
// Mirrors the 8090 Software Factory categories (Requirements/Blueprints/Work Orders/
// Feedback/General). Decoupled from the scored `data.skills[]` dataset on purpose:
// this is the *pick-a-skill-to-attach* menu, not the versioned skill registry.
export type SkillCategory =
  | "Requirements"
  | "Blueprints"
  | "Work Orders"
  | "Feedback"
  | "General";

export const SKILL_CATEGORIES: SkillCategory[] = [
  "Requirements",
  "Blueprints",
  "Work Orders",
  "Feedback",
  "General",
];

// Counts match the reference: 5 · 5 · 5 · 3 · 2. Real CAPSULE skill names reused
// where they fit; the rest are on-theme factory skills.
export const SKILL_CATALOG: Record<SkillCategory, string[]> = {
  Requirements: [
    "Capture Session Knowledge",
    "Requirement Distillation",
    "Intent Clarity Check",
    "Scope Guard",
    "Acceptance Criteria",
  ],
  Blueprints: [
    "Memory Management",
    "API Security",
    "Angular Upgrade",
    "Backboard Memory Model",
    "Force Graph Layout",
  ],
  "Work Orders": [
    "Command Verification",
    "API Rate Limiting",
    "Automation Maintenance",
    "A/B Token Measurement",
    "Skill Versioning",
  ],
  Feedback: ["Triage Feedback", "Reward Scoring", "Conflict Do/Undo"],
  General: ["Creative Franchise Expansion", "Quality Reviewer"],
};
