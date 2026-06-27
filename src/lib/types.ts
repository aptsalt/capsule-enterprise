// CAPSULE — strict TypeScript types for the canonical dataset.
// Every entity that appears in src/lib/data.ts is typed here.
// Enums are expressed as string-literal unions.

// ------------------------------------------------------------------
// Enums (string-literal unions)
// ------------------------------------------------------------------
export type RequirementStatus = 'active' | 'in_review' | 'done';
export type WorkOrderStatus = 'queued' | 'in_progress' | 'done';
export type Bump = 'major' | 'minor' | 'patch';
export type RouteStatus = 'adopted' | 'proposed';
export type VersionStatus = 'published' | 'proposed';
export type SkillScope = 'enterprise' | 'project' | 'org';
export type AdoptionPolicy = 'auto' | 'manual';
export type StoreName = 'Backboard';
export type ModelProvider = 'Anthropic' | 'Meta' | string;
export type McpStatus = 'connected' | 'available' | 'disconnected';
export type McpKind = 'memory' | 'workorder' | 'vcs' | 'validator' | 'security' | string;
export type FactoryStatus = 'active' | 'healthy' | 'degraded' | 'down';

export type GraphNodeType =
  | 'requirement'
  | 'workorder'
  | 'agent'
  | 'skill'
  | 'capsule'
  | 'model'
  | 'mcp'
  | 'memory';

export type GraphLinkKind =
  | 'implements'
  | 'executes'
  | 'uses'
  | 'produces'
  | 'derives'
  | 'stores'
  | 'reads'
  | 'learns';

// ------------------------------------------------------------------
// Workspace / tenant
// ------------------------------------------------------------------
export interface Workspace {
  enterprise: string;
  project: string;
  tenantAssistantId: string;
  memoryStore: string;
  memoryTier: string;
  seats: number;
  plan: string;
}

// ------------------------------------------------------------------
// Requirements & work orders
// ------------------------------------------------------------------
export interface Requirement {
  id: string;
  title: string;
  plainEnglish: string;
  status: RequirementStatus;
}

export interface WorkOrder {
  id: string;
  title: string;
  requirementId: string;
  status: WorkOrderStatus;
  agentId: string;
}

// ------------------------------------------------------------------
// Capsules
// ------------------------------------------------------------------
export interface CapsuleDecision {
  what: string;
  why: string;
  file: string;
}

export interface CapsuleRoute {
  entity: string;
  entityName: string;
  learns: string;
  proposes: Bump;
  proposedVersion: string;
  status: RouteStatus;
}

export interface Capsule {
  id: string;
  session: string;
  project: string;
  author: string;
  model: string;
  createdAt: string;
  novelty: number;
  importance: number;
  transferScore: number;
  summary: string;
  intent: string;
  mentalModel: string;
  learnings: string[];
  gotchas: string[];
  decisions: CapsuleDecision[];
  finding: string;
  routedTo: CapsuleRoute[];
  tokensSpent: number;
  tokensSavedPerReuse: number;
  reuses: number;
  storedIn: StoreName;
  threadId: string;
  producedVersion: string;
}

// ------------------------------------------------------------------
// Skills & skill versions
// ------------------------------------------------------------------
export interface SkillLearnedFrom {
  capsule: string;
  finding: string;
}

export interface SkillVersion {
  version: string;
  bump: Bump;
  derivedFromCapsule: string;
  learnedFrom: SkillLearnedFrom;
  changelog: string;
  tokenDeltaPerUse: number;
  scoreDelta: number;
  adoptedBy: number;
  publishedAt: string;
  status: VersionStatus;
  name?: string;
}

export interface Skill {
  id: string;
  name: string;
  scope: SkillScope;
  description: string;
  repoPath: string;
  currentVersion: string;
  optedIn: boolean;
  adoptionPolicy: AdoptionPolicy;
  usedByAgents: string[];
  versions: SkillVersion[];
}

// ------------------------------------------------------------------
// Agents
// ------------------------------------------------------------------
export interface AgentVersion {
  version: string;
  bump: Bump;
  derivedFromCapsule: string;
  changelog: string;
  publishedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  currentVersion: string;
  usesSkills: string[];
  executes: string[];
  versions: AgentVersion[];
}

// ------------------------------------------------------------------
// Models & MCP connections
// ------------------------------------------------------------------
export interface Model {
  id: string;
  name: string;
  provider: ModelProvider;
  contextK: number;
}

export interface Mcp {
  id: string;
  name: string;
  kind: McpKind;
  status: McpStatus;
}

// ------------------------------------------------------------------
// Knowledge graph
// ------------------------------------------------------------------
export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  sub: string;
  refId: string;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: GraphLinkKind;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ------------------------------------------------------------------
// A/B trials
// ------------------------------------------------------------------
export interface AbRun {
  tokens: number;
  steps: number;
  passed: boolean;
  transferScore: number;
  durationS: number;
  outcome: string;
}

export interface AbTrial {
  id: string;
  task: string;
  skillId: string;
  model: string;
  mcp: string;
  withCapsule: AbRun;
  withoutCapsule: AbRun;
  verdict: string;
}

// ------------------------------------------------------------------
// Factory modules
// ------------------------------------------------------------------
export interface FactoryStat {
  primary: number;
  primaryLabel: string;
  secondary: number;
  secondaryLabel: string;
}

export interface FactoryModule {
  id: string;
  name: string;
  label: string;
  blurb: string;
  status: FactoryStatus;
  stat: FactoryStat;
}

// ------------------------------------------------------------------
// Roll-up metrics
// ------------------------------------------------------------------
export interface CompoundingPoint {
  week: string;
  tokensSaved: number;
}

export interface Metrics {
  tokensSavedTotal: number;
  sessionsCaptured: number;
  capsules: number;
  skillsEvolved: number;
  avgTransfer: number;
  adoptionRate: number;
  compounding: CompoundingPoint[];
}

// ------------------------------------------------------------------
// Top-level dataset
// ------------------------------------------------------------------
export interface Dataset {
  workspace: Workspace;
  requirements: Requirement[];
  workOrders: WorkOrder[];
  capsules: Capsule[];
  skills: Skill[];
  agents: Agent[];
  models: Model[];
  mcps: Mcp[];
  graph: Graph;
  abTrials: AbTrial[];
  factoryModules: FactoryModule[];
  metrics: Metrics;
}
