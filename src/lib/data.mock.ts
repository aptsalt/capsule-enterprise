// CAPSULE — typed canonical dataset.
// Ported verbatim from _build/data.js (`const DATA = {...}`); no data loss.
// Enterprise RL-loop workspace on the 8090 Software Factory.
// All numbers are internally consistent (see metrics.tokensSavedTotal ==
// sum over capsule reuses of tokensSavedPerReuse).

import type { Dataset } from './types';

export const data: Dataset = {
  // ------------------------------------------------------------------
  // Workspace / tenant
  // ------------------------------------------------------------------
  workspace: {
    enterprise: 'Meridian Bank',
    project: 'Payments Copilot',
    tenantAssistantId: 'capsule-meridian',
    memoryStore: 'Backboard',
    memoryTier: 'Memory Pro',
    seats: 24,
    plan: 'Software Factory — Enterprise',
  },

  // ------------------------------------------------------------------
  // Requirements (business intent)
  // ------------------------------------------------------------------
  requirements: [
    {
      id: 'REQ-001',
      title: 'Idempotent real-time payments',
      plainEnglish:
        "A customer who taps 'Pay' twice must never be charged twice, even if the network retries.",
      status: 'active',
    },
    {
      id: 'REQ-002',
      title: 'ISO 20022 message interoperability',
      plainEnglish:
        'Outbound and inbound payment messages must map cleanly to the ISO 20022 pacs/camt schemas the clearing network expects.',
      status: 'active',
    },
    {
      id: 'REQ-003',
      title: 'PCI cardholder-data redaction',
      plainEnglish:
        'No primary account number or CVV may ever reach a log, a prompt, or a stored capsule.',
      status: 'in_review',
    },
    {
      id: 'REQ-004',
      title: 'Strong Customer Authentication (SCA)',
      plainEnglish:
        'High-value or risky payments must trigger a second-factor challenge before they settle.',
      status: 'active',
    },
  ],

  // ------------------------------------------------------------------
  // Work orders (units of agent work, each implements a requirement)
  // ------------------------------------------------------------------
  workOrders: [
    {
      id: 'WO-101',
      title: 'Implement idempotency-key middleware',
      requirementId: 'REQ-001',
      status: 'in_progress',
      agentId: 'agent/payments-implementer',
    },
    {
      id: 'WO-102',
      title: 'Build ISO 20022 pacs.008 mapper',
      requirementId: 'REQ-002',
      status: 'done',
      agentId: 'agent/payments-implementer',
    },
    {
      id: 'WO-103',
      title: 'PCI redaction middleware + capsule scrubber',
      requirementId: 'REQ-003',
      status: 'in_progress',
      agentId: 'agent/compliance-reviewer',
    },
    {
      id: 'WO-104',
      title: 'SCA challenge / step-up flow',
      requirementId: 'REQ-004',
      status: 'queued',
      agentId: 'agent/payments-implementer',
    },
    {
      id: 'WO-105',
      title: 'Reconciliation ledger sync (camt.053)',
      requirementId: 'REQ-002',
      status: 'done',
      agentId: 'agent/integration-tester',
    },
    {
      id: 'WO-106',
      title: 'End-to-end payment regression suite',
      requirementId: 'REQ-001',
      status: 'queued',
      agentId: 'agent/integration-tester',
    },
  ],

  // ------------------------------------------------------------------
  // Capsules (compressed session learnings stored in Backboard)
  // tokensSavedTotal = Σ reuses * tokensSavedPerReuse
  //   12*1800 + 7*2400 + 5*1500 + 9*1100 + 3*3200 + 6*900 + 2*2100 + 0
  //   = 21600 + 16800 + 7500 + 9900 + 9600 + 5400 + 4200 + 0 = 75000
  // Each capsule carries a single `finding` (the novel learnable insight)
  // that is `routedTo` the skills/agents which absorb it.
  // ------------------------------------------------------------------
  capsules: [
    {
      id: 'CAP-1001',
      session: 'sess-4af2',
      project: 'Payments Copilot',
      author: 'agent/payments-implementer',
      model: 'claude-opus-4-8',
      createdAt: '2026-05-02T14:21:00Z',
      novelty: 82,
      importance: 91,
      transferScore: 88,
      summary:
        'Idempotency keys must be scoped per-debtor AND per-amount, persisted before the ledger write, with a 24h TTL to survive client retries without blocking legitimate repeats.',
      intent:
        'Make payment retries safe without ever blocking a legitimate repeat payment of the same value.',
      mentalModel:
        "Idempotency is an identity problem: the key must encode WHAT the payment is (debtor + amount + currency), and durability has to come from the ledger's own transaction — never a cache alone.",
      learnings: [
        'Storing the idempotency key AFTER the ledger write leaves a retry window — persist first.',
        'Scope the key to (debtorId, amount, currency) so a genuine second payment of the same value still goes through.',
        'A 24h TTL matches the card scheme retry envelope.',
      ],
      gotchas: [
        'Redis SETNX alone is not durable across failover — back it with the ledger\'s own unique constraint.',
        'Clock skew between app nodes can expire keys early; use server-issued timestamps.',
      ],
      decisions: [
        {
          what: 'Persist idempotency key inside the same DB transaction as the ledger insert',
          why: 'Eliminates the retry race entirely instead of papering over it with a cache.',
          file: 'src/payments/idempotency.ts',
        },
      ],
      finding:
        'Persist the idempotency key inside the same ledger transaction and scope it to (debtor, amount, currency) so retries are safe without ever blocking a legitimate repeat payment.',
      routedTo: [
        {
          entity: 'skill/payment-idempotency',
          entityName: 'Payment Idempotency',
          learns:
            'Transaction-scoped key persistence with (debtor, amount, currency) scoping and a 24h TTL.',
          proposes: 'minor',
          proposedVersion: '2.1.0',
          status: 'adopted',
        },
        {
          entity: 'agent/payments-implementer',
          entityName: 'Payments Implementer',
          learns: 'Default to transaction-scoped idempotency before any ledger write.',
          proposes: 'minor',
          proposedVersion: '2.3.0',
          status: 'adopted',
        },
      ],
      tokensSpent: 41200,
      tokensSavedPerReuse: 1800,
      reuses: 12,
      storedIn: 'Backboard',
      threadId: 'thr-idem-4af2',
      producedVersion: 'skill/payment-idempotency@2.1.0',
    },
    {
      id: 'CAP-1002',
      session: 'sess-9c10',
      project: 'Payments Copilot',
      author: 'agent/payments-implementer',
      model: 'claude-sonnet-4-6',
      createdAt: '2026-05-09T09:48:00Z',
      novelty: 67,
      importance: 78,
      transferScore: 74,
      summary:
        'pacs.008 amount fields are decimal strings with currency-driven fraction digits; mapping from internal minor-units requires a per-currency exponent table, not a fixed /100.',
      intent:
        'Map internal minor-unit amounts onto ISO 20022 pacs.008 decimal fields correctly for every currency.',
      mentalModel:
        'Currency is a type, not a format: fraction digits are a per-currency property (the ISO 4217 exponent), so amount scaling must be data-driven rather than a hardcoded constant.',
      learnings: [
        'JPY has 0 fraction digits, BHD has 3 — never hardcode 2 decimals.',
        'ISO 20022 expects ActiveCurrencyAndAmount with the currency as an attribute, not a sibling field.',
      ],
      gotchas: [
        'Trailing-zero normalization differs between pacs.008 and camt.053 — validate against the network XSD, not just our own.',
      ],
      decisions: [
        {
          what: 'Drive decimal scaling from an ISO 4217 exponent table',
          why: 'Single source of truth for both outbound mapping and inbound parsing.',
          file: 'src/iso20022/amount.ts',
        },
      ],
      finding:
        'Currency fraction digits are a per-currency ISO 4217 property, so amount scaling must come from an exponent table rather than a hardcoded /100.',
      routedTo: [
        {
          entity: 'skill/iso20022-mapper',
          entityName: 'ISO 20022 Mapper',
          learns: 'Drive decimal scaling from an ISO 4217 exponent table for every currency.',
          proposes: 'minor',
          proposedVersion: '1.3.0',
          status: 'adopted',
        },
        {
          entity: 'agent/payments-implementer',
          entityName: 'Payments Implementer',
          learns: 'Use currency-correct amount mapping in the default toolchain.',
          proposes: 'minor',
          proposedVersion: '2.3.0',
          status: 'adopted',
        },
      ],
      tokensSpent: 28800,
      tokensSavedPerReuse: 2400,
      reuses: 7,
      storedIn: 'Backboard',
      threadId: 'thr-iso-9c10',
      producedVersion: 'skill/iso20022-mapper@1.3.0',
    },
    {
      id: 'CAP-1003',
      session: 'sess-2b77',
      project: 'Payments Copilot',
      author: 'agent/compliance-reviewer',
      model: 'claude-opus-4-8',
      createdAt: '2026-05-15T16:05:00Z',
      novelty: 71,
      importance: 95,
      transferScore: 69,
      summary:
        'Redaction must run on the capsule BEFORE it is written to Backboard, and on prompts BEFORE they reach any model — a PAN regex plus Luhn check catches 17-19 digit sequences without false-positiving on order IDs.',
      intent:
        'Keep raw card data (PAN/CVV) out of capsules, prompts, and model tool-call arguments to shrink PCI scope.',
      mentalModel:
        'Every boundary that leaves the trust zone — capsule writer, prompt egress, tool-call args — is a leak path; redact at each one independently because no single boundary is sufficient (defense in depth).',
      learnings: [
        'Luhn validation cuts redaction false positives on long numeric IDs by ~90%.',
        'Redact at the capsule-writer boundary so no downstream view can ever leak the raw value.',
      ],
      gotchas: [
        'CVV can appear as a 3-4 digit field adjacent to a PAN — context window matters, redact the pair together.',
        'Model tool-call arguments are a second leak path that bypasses the prompt scrubber.',
      ],
      decisions: [
        {
          what: 'Place the scrubber as middleware on both the prompt egress and the capsule writer',
          why: 'Defense in depth — neither path alone is sufficient for PCI scope reduction.',
          file: 'src/compliance/redact.ts',
        },
      ],
      finding:
        'Redact PAN/CVV independently at every trust boundary — capsule writer, prompt egress, and tool-call args — using a Luhn check to avoid false positives on long IDs.',
      routedTo: [
        {
          entity: 'skill/pci-redaction',
          entityName: 'PCI Redaction',
          learns:
            'Dual-boundary scrubbing with Luhn validation across prompts, tool args, and capsules.',
          proposes: 'patch',
          proposedVersion: '1.2.0',
          status: 'adopted',
        },
        {
          entity: 'agent/compliance-reviewer',
          entityName: 'Compliance Reviewer',
          learns: 'Enforce redaction at both prompt egress and the capsule writer.',
          proposes: 'minor',
          proposedVersion: '1.4.0',
          status: 'adopted',
        },
      ],
      tokensSpent: 35600,
      tokensSavedPerReuse: 1500,
      reuses: 5,
      storedIn: 'Backboard',
      threadId: 'thr-pci-2b77',
      producedVersion: 'skill/pci-redaction@1.2.0',
    },
    {
      id: 'CAP-1004',
      session: 'sess-7d31',
      project: 'Payments Copilot',
      author: 'agent/integration-tester',
      model: 'claude-sonnet-4-6',
      createdAt: '2026-05-21T11:33:00Z',
      novelty: 58,
      importance: 73,
      transferScore: 81,
      summary:
        'Reconciliation against camt.053 needs a two-key match (end-to-end id + amount) because the clearing network re-issues transaction references on partial settlement.',
      intent:
        "Reconcile our internal ledger entries against the bank's incoming camt.053 statements without false mismatches.",
      mentalModel:
        'Network references are mutable, so identity must be reconstructed from stable business keys (EndToEndId first, then amount + value-date) — and a single logical payment can fan out into several booked entries.',
      learnings: [
        'Match on EndToEndId first, fall back to (amount, value-date) for re-issued references.',
        'Booked vs pending entries arrive in separate camt.053 pages — paginate fully before reconciling.',
      ],
      gotchas: [
        'A single logical payment can split into two booked entries (fee + principal); sum before comparing.',
      ],
      decisions: [
        {
          what: 'Reconcile with a composite (EndToEndId, amount) key and a value-date fallback',
          why: "Survives the network's reference re-issuance on partial settlement.",
          file: 'src/ledger/reconcile.ts',
        },
      ],
      finding:
        'Reconcile camt.053 on a composite (EndToEndId, amount) key with a value-date fallback, because the network re-issues references on partial settlement.',
      routedTo: [
        {
          entity: 'skill/reconciliation-ledger',
          entityName: 'Reconciliation Ledger',
          learns: 'Composite-key matching with a value-date fallback for re-issued references.',
          proposes: 'minor',
          proposedVersion: '1.1.0',
          status: 'adopted',
        },
        {
          entity: 'agent/integration-tester',
          entityName: 'Integration Tester',
          learns: 'Reconcile with composite key + value-date fallback in the regression harness.',
          proposes: 'minor',
          proposedVersion: '1.1.0',
          status: 'adopted',
        },
      ],
      tokensSpent: 22400,
      tokensSavedPerReuse: 1100,
      reuses: 9,
      storedIn: 'Backboard',
      threadId: 'thr-recon-7d31',
      producedVersion: 'skill/reconciliation-ledger@1.1.0',
    },
    {
      id: 'CAP-1005',
      session: 'sess-1e08',
      project: 'Payments Copilot',
      author: 'agent/payments-implementer',
      model: 'claude-opus-4-8',
      createdAt: '2026-05-28T13:12:00Z',
      novelty: 76,
      importance: 84,
      transferScore: 55,
      summary:
        "SCA step-up should be evaluated server-side from a risk score, returning a 'challenge_required' state the client renders — never trust a client flag that says auth already happened.",
      intent:
        'Decide and enforce Strong Customer Authentication step-up correctly, with an auditable trail.',
      mentalModel:
        'Authentication authority belongs to the bank, not the client: compute the requirement server-side and treat the challenge token as a single-use capability bound to one payment intent.',
      learnings: [
        'Exemptions (low-value, TRA) must be logged with their reason for the auditor.',
        'The challenge token must be single-use and bound to the payment intent id.',
      ],
      gotchas: [
        'Re-using a challenge token across two payment intents is the classic SCA bypass — bind and burn it.',
      ],
      decisions: [
        {
          what: 'Compute SCA requirement server-side and return an explicit challenge state',
          why: 'Client flags are forgeable; the bank must own the decision and its audit trail.',
          file: 'src/auth/sca.ts',
        },
      ],
      finding:
        'Compute SCA step-up server-side from a risk score and treat the challenge token as a single-use capability bound to one payment intent.',
      routedTo: [
        {
          entity: 'skill/sca-challenge',
          entityName: 'SCA Challenge',
          learns: 'Server-evaluated challenge state with single-use, intent-bound tokens.',
          proposes: 'major',
          proposedVersion: '1.0.0',
          status: 'adopted',
        },
      ],
      tokensSpent: 38900,
      tokensSavedPerReuse: 3200,
      reuses: 3,
      storedIn: 'Backboard',
      threadId: 'thr-sca-1e08',
      producedVersion: 'skill/sca-challenge@1.0.0',
    },
    {
      id: 'CAP-1006',
      session: 'sess-3a55',
      project: 'Payments Copilot',
      author: 'agent/payments-implementer',
      model: 'claude-sonnet-4-6',
      createdAt: '2026-04-18T10:02:00Z',
      novelty: 49,
      importance: 70,
      transferScore: 72,
      summary:
        'First idempotency pass: a request-hash header dedup. Worked for happy path but missed amount-scoping — superseded by CAP-1001.',
      intent:
        "First attempt at de-duplicating retried payment requests so a double-submit can't double-charge.",
      mentalModel:
        'Request identity is not transport identity — hashing the whole request body conflates the payment\'s intent with incidental HTTP noise (headers, user-agent).',
      learnings: [
        'A raw request-body hash dedups too aggressively and blocks legitimate repeat payments.',
      ],
      gotchas: [
        "Hashing the whole body means a changed user-agent created a 'new' payment — narrow the hash inputs.",
      ],
      decisions: [
        {
          what: 'Introduce a dedicated idempotency table rather than header hashing',
          why: 'Header hashing conflated transport noise with payment identity.',
          file: 'src/payments/idempotency.ts',
        },
      ],
      finding:
        'Hashing the whole request body for dedup conflates payment intent with transport noise and blocks legitimate repeat payments.',
      routedTo: [
        {
          entity: 'skill/payment-idempotency',
          entityName: 'Payment Idempotency',
          learns: 'Replace request-hash dedup with a dedicated idempotency table.',
          proposes: 'major',
          proposedVersion: '2.0.0',
          status: 'adopted',
        },
      ],
      tokensSpent: 31000,
      tokensSavedPerReuse: 900,
      reuses: 6,
      storedIn: 'Backboard',
      threadId: 'thr-idem-3a55',
      producedVersion: 'skill/payment-idempotency@2.0.0',
    },
    {
      id: 'CAP-1007',
      session: 'sess-6f29',
      project: 'Payments Copilot',
      author: 'agent/payments-implementer',
      model: 'claude-sonnet-4-6',
      createdAt: '2026-04-30T15:40:00Z',
      novelty: 53,
      importance: 64,
      transferScore: 63,
      summary:
        'Early ISO 20022 mapper handled EUR/USD only with hardcoded 2-decimal scaling — the seed that CAP-1002 generalized.',
      intent: 'Stand up a first working ISO 20022 amount mapper for the EUR/USD happy path.',
      mentalModel:
        "The network's published XSD is the contract; a locally-pinned schema is just a copy that silently drifts out of date and passes local validation while failing at the network.",
      learnings: ['Hardcoding 2 decimals silently corrupts JPY and BHD amounts.'],
      gotchas: [
        'Schema validation passed locally but failed at the network because our XSD was a year stale.',
      ],
      decisions: [
        {
          what: 'Pin the mapper to the network-published XSD version in CI',
          why: "Local schemas drift; the network's copy is the contract.",
          file: 'src/iso20022/schema.ts',
        },
      ],
      finding:
        'A locally-pinned ISO 20022 XSD silently drifts out of date, so CI must validate against the network-published schema.',
      routedTo: [
        {
          entity: 'skill/iso20022-mapper',
          entityName: 'ISO 20022 Mapper',
          learns: 'Pin the mapper to the network-published XSD version in CI.',
          proposes: 'minor',
          proposedVersion: '1.2.0',
          status: 'adopted',
        },
      ],
      tokensSpent: 24700,
      tokensSavedPerReuse: 2100,
      reuses: 2,
      storedIn: 'Backboard',
      threadId: 'thr-iso-6f29',
      producedVersion: 'skill/iso20022-mapper@1.2.0',
    },
    {
      id: 'CAP-1008',
      session: 'sess-8b14',
      project: 'Payments Copilot',
      author: 'agent/payments-implementer',
      model: 'claude-opus-4-8',
      createdAt: '2026-06-19T17:55:00Z',
      novelty: 88,
      importance: 79,
      transferScore: 40,
      summary:
        'Proposed: device-binding the SCA challenge to a WebAuthn passkey to drop SMS OTP entirely. Promising but unproven — awaiting human adoption before the skill version is published.',
      intent:
        'Explore replacing SMS OTP with a WebAuthn passkey for SCA step-up to cut cost and phishing surface.',
      mentalModel:
        'A single passkey gesture can satisfy two SCA factors at once (inherence + possession), but attestation is platform-specific, so the design must stay heterogeneous-by-default with an OTP fallback.',
      learnings: [
        'WebAuthn passkeys satisfy SCA inherence+possession in a single gesture.',
        'Fallback to OTP is still required for un-enrolled devices.',
      ],
      gotchas: [
        'Passkey attestation varies by platform authenticator — do not assume a uniform format.',
      ],
      decisions: [
        {
          what: 'Prototype passkey-based step-up behind a feature flag',
          why: 'Reduces OTP cost and phishing surface, but needs compliance sign-off first.',
          file: 'src/auth/sca.ts',
        },
      ],
      finding:
        'A single WebAuthn passkey gesture can satisfy SCA inherence and possession together, but platform-specific attestation keeps an OTP fallback mandatory.',
      routedTo: [
        {
          entity: 'skill/sca-challenge',
          entityName: 'SCA Challenge',
          learns:
            'Device-bind step-up to a WebAuthn passkey with an OTP fallback for un-enrolled devices.',
          proposes: 'minor',
          proposedVersion: '1.1.0',
          status: 'proposed',
        },
      ],
      tokensSpent: 44100,
      tokensSavedPerReuse: 0,
      reuses: 0,
      storedIn: 'Backboard',
      threadId: 'thr-sca-8b14',
      producedVersion: 'skill/sca-challenge@1.1.0',
    },
  ],

  // ------------------------------------------------------------------
  // Skills (enterprise-scoped, versioned, derived from capsules)
  // negative tokenDeltaPerUse == tokens SAVED per use
  // optedIn == org is running the latest published version
  // adoptionPolicy == auto (publish-on-accept) | manual (human sign-off)
  // each version records the capsule + finding it learnedFrom
  // ------------------------------------------------------------------
  skills: [
    {
      id: 'skill/payment-idempotency',
      name: 'Payment Idempotency',
      scope: 'enterprise',
      description:
        'Transaction-scoped idempotency keys with durable persistence and scheme-aligned TTLs for safe payment retries.',
      repoPath: 'capsule://skills/payment-idempotency',
      currentVersion: '2.1.0',
      optedIn: true,
      adoptionPolicy: 'auto',
      usedByAgents: ['agent/payments-implementer'],
      versions: [
        {
          version: '2.0.0',
          bump: 'major',
          derivedFromCapsule: 'CAP-1006',
          learnedFrom: {
            capsule: 'CAP-1006',
            finding:
              'Hashing the whole request body for dedup conflates payment intent with transport noise and blocks legitimate repeat payments.',
          },
          changelog: 'Replaced request-hash dedup with a dedicated idempotency table.',
          tokenDeltaPerUse: -900,
          scoreDelta: 11,
          adoptedBy: 3,
          publishedAt: '2026-04-19T09:20:00Z',
          status: 'published',
        },
        {
          version: '2.1.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1001',
          learnedFrom: {
            capsule: 'CAP-1001',
            finding:
              'Persist the idempotency key inside the same ledger transaction and scope it to (debtor, amount, currency) so retries are safe without ever blocking a legitimate repeat payment.',
          },
          changelog:
            'Scope keys to (debtor, amount, currency); persist within the ledger transaction; 24h TTL.',
          tokenDeltaPerUse: -1800,
          scoreDelta: 16,
          adoptedBy: 5,
          name: 'Transaction-scoped keys',
          publishedAt: '2026-05-03T13:13:00Z',
          status: 'published',
        },
      ],
    },
    {
      id: 'skill/iso20022-mapper',
      name: 'ISO 20022 Mapper',
      scope: 'enterprise',
      description:
        'Bidirectional mapping between internal payment models and ISO 20022 pacs/camt messages with currency-correct decimal scaling.',
      repoPath: 'capsule://skills/iso20022-mapper',
      currentVersion: '1.3.0',
      optedIn: true,
      adoptionPolicy: 'auto',
      usedByAgents: ['agent/payments-implementer'],
      versions: [
        {
          version: '1.2.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1007',
          learnedFrom: {
            capsule: 'CAP-1007',
            finding:
              'A locally-pinned ISO 20022 XSD silently drifts out of date, so CI must validate against the network-published schema.',
          },
          changelog: 'Pin mapper to network-published XSD in CI; EUR/USD coverage.',
          tokenDeltaPerUse: -2100,
          scoreDelta: 9,
          adoptedBy: 2,
          publishedAt: '2026-05-01T11:42:00Z',
          status: 'published',
        },
        {
          version: '1.3.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1002',
          learnedFrom: {
            capsule: 'CAP-1002',
            finding:
              'Currency fraction digits are a per-currency ISO 4217 property, so amount scaling must come from an exponent table rather than a hardcoded /100.',
          },
          changelog:
            'ISO 4217 exponent table for per-currency fraction digits; JPY/BHD support.',
          tokenDeltaPerUse: -2400,
          scoreDelta: 13,
          adoptedBy: 4,
          name: 'Per-currency scaling',
          publishedAt: '2026-05-10T15:08:00Z',
          status: 'published',
        },
      ],
    },
    {
      id: 'skill/pci-redaction',
      name: 'PCI Redaction',
      scope: 'enterprise',
      description:
        'Luhn-validated PAN/CVV scrubbing applied to prompts, tool arguments, and capsules before they leave the trust boundary.',
      repoPath: 'capsule://skills/pci-redaction',
      currentVersion: '1.2.0',
      optedIn: true,
      adoptionPolicy: 'manual',
      usedByAgents: ['agent/compliance-reviewer'],
      versions: [
        {
          version: '1.0.0',
          bump: 'major',
          derivedFromCapsule: 'CAP-1003',
          learnedFrom: {
            capsule: 'CAP-1003',
            finding:
              'Redact PAN/CVV independently at every trust boundary — capsule writer, prompt egress, and tool-call args — using a Luhn check to avoid false positives on long IDs.',
          },
          changelog: 'Initial PAN regex scrubber on prompt egress.',
          tokenDeltaPerUse: -600,
          scoreDelta: 8,
          adoptedBy: 2,
          publishedAt: '2026-05-16T10:05:00Z',
          status: 'published',
        },
        {
          version: '1.1.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1003',
          learnedFrom: {
            capsule: 'CAP-1003',
            finding:
              'Redact PAN/CVV independently at every trust boundary — capsule writer, prompt egress, and tool-call args — using a Luhn check to avoid false positives on long IDs.',
          },
          changelog: 'Add Luhn validation to cut false positives on long IDs.',
          tokenDeltaPerUse: -1100,
          scoreDelta: 10,
          adoptedBy: 4,
          publishedAt: '2026-05-18T14:30:00Z',
          status: 'published',
        },
        {
          version: '1.2.0',
          bump: 'patch',
          derivedFromCapsule: 'CAP-1003',
          learnedFrom: {
            capsule: 'CAP-1003',
            finding:
              'Redact PAN/CVV independently at every trust boundary — capsule writer, prompt egress, and tool-call args — using a Luhn check to avoid false positives on long IDs.',
          },
          changelog: 'Extend scrubber to capsule writer and model tool-call arguments.',
          tokenDeltaPerUse: -1500,
          scoreDelta: 6,
          adoptedBy: 5,
          name: 'Dual-boundary scrubber',
          publishedAt: '2026-05-20T16:20:00Z',
          status: 'published',
        },
      ],
    },
    {
      id: 'skill/reconciliation-ledger',
      name: 'Reconciliation Ledger',
      scope: 'enterprise',
      description:
        'camt.053 reconciliation with composite key matching and partial-settlement handling.',
      repoPath: 'capsule://skills/reconciliation-ledger',
      currentVersion: '1.1.0',
      optedIn: true,
      adoptionPolicy: 'auto',
      usedByAgents: ['agent/integration-tester'],
      versions: [
        {
          version: '1.0.0',
          bump: 'major',
          derivedFromCapsule: 'CAP-1004',
          learnedFrom: {
            capsule: 'CAP-1004',
            finding:
              'Reconcile camt.053 on a composite (EndToEndId, amount) key with a value-date fallback, because the network re-issues references on partial settlement.',
          },
          changelog: 'Single-key EndToEndId reconciliation.',
          tokenDeltaPerUse: -700,
          scoreDelta: 7,
          adoptedBy: 2,
          publishedAt: '2026-05-22T09:50:00Z',
          status: 'published',
        },
        {
          version: '1.1.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1004',
          learnedFrom: {
            capsule: 'CAP-1004',
            finding:
              'Reconcile camt.053 on a composite (EndToEndId, amount) key with a value-date fallback, because the network re-issues references on partial settlement.',
          },
          changelog:
            'Composite (EndToEndId, amount) key with value-date fallback for re-issued refs.',
          tokenDeltaPerUse: -1100,
          scoreDelta: 12,
          adoptedBy: 3,
          name: 'Composite-key reconcile',
          publishedAt: '2026-05-24T13:40:00Z',
          status: 'published',
        },
      ],
    },
    {
      id: 'skill/sca-challenge',
      name: 'SCA Challenge',
      scope: 'enterprise',
      description:
        'Server-side Strong Customer Authentication: risk-driven step-up, single-use challenge tokens, and audited exemptions.',
      repoPath: 'capsule://skills/sca-challenge',
      currentVersion: '1.0.0',
      optedIn: true,
      adoptionPolicy: 'manual',
      usedByAgents: ['agent/payments-implementer'],
      versions: [
        {
          version: '1.0.0',
          bump: 'major',
          derivedFromCapsule: 'CAP-1005',
          learnedFrom: {
            capsule: 'CAP-1005',
            finding:
              'Compute SCA step-up server-side from a risk score and treat the challenge token as a single-use capability bound to one payment intent.',
          },
          changelog:
            'Server-evaluated challenge state; single-use tokens bound to payment intent.',
          tokenDeltaPerUse: -3200,
          scoreDelta: 14,
          adoptedBy: 3,
          name: 'Server-side SCA',
          publishedAt: '2026-05-29T11:15:00Z',
          status: 'published',
        },
        {
          version: '1.1.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1008',
          learnedFrom: {
            capsule: 'CAP-1008',
            finding:
              'A single WebAuthn passkey gesture can satisfy SCA inherence and possession together, but platform-specific attestation keeps an OTP fallback mandatory.',
          },
          changelog:
            'Proposed: WebAuthn passkey device-binding to replace SMS OTP. Awaiting human adoption.',
          tokenDeltaPerUse: -2600,
          scoreDelta: 9,
          adoptedBy: 0,
          publishedAt: '2026-06-20T17:55:00Z',
          status: 'proposed',
        },
      ],
    },
  ],

  // ------------------------------------------------------------------
  // Agents (execute work orders, use skills, evolve from capsules)
  // ------------------------------------------------------------------
  agents: [
    {
      id: 'agent/payments-implementer',
      name: 'Payments Implementer',
      currentVersion: '2.3.0',
      usesSkills: [
        'skill/payment-idempotency',
        'skill/iso20022-mapper',
        'skill/sca-challenge',
      ],
      executes: ['WO-101', 'WO-102', 'WO-104'],
      versions: [
        {
          version: '2.0.0',
          bump: 'major',
          derivedFromCapsule: 'CAP-1006',
          changelog: 'Adopted dedicated idempotency table; retired header-hash dedup.',
          publishedAt: '2026-04-20T08:00:00Z',
        },
        {
          version: '2.3.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1001',
          changelog:
            'Wired transaction-scoped idempotency and currency-correct ISO mapping into the default toolchain.',
          publishedAt: '2026-05-04T08:00:00Z',
        },
      ],
    },
    {
      id: 'agent/compliance-reviewer',
      name: 'Compliance Reviewer',
      currentVersion: '1.4.0',
      usesSkills: ['skill/pci-redaction'],
      executes: ['WO-103'],
      versions: [
        {
          version: '1.4.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1003',
          changelog: 'Enforce dual-boundary PCI redaction on prompts and capsules.',
          publishedAt: '2026-05-21T08:00:00Z',
        },
      ],
    },
    {
      id: 'agent/integration-tester',
      name: 'Integration Tester',
      currentVersion: '1.1.0',
      usesSkills: ['skill/reconciliation-ledger'],
      executes: ['WO-105', 'WO-106'],
      versions: [
        {
          version: '1.1.0',
          bump: 'minor',
          derivedFromCapsule: 'CAP-1004',
          changelog: 'Reconcile with composite key + value-date fallback in the regression harness.',
          publishedAt: '2026-05-25T08:00:00Z',
        },
      ],
    },
  ],

  // ------------------------------------------------------------------
  // Models available as session backends
  // ------------------------------------------------------------------
  models: [
    { id: 'claude-opus-4-8', name: 'Claude Opus 4.8', provider: 'Anthropic', contextK: 1000 },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', contextK: 200 },
    { id: 'claude-haiku-4-2', name: 'Claude Haiku 4.2', provider: 'Anthropic', contextK: 200 },
    { id: 'llama-4-maverick', name: 'Llama 4 Maverick', provider: 'Meta', contextK: 128 },
  ],

  // ------------------------------------------------------------------
  // MCP connections
  // ------------------------------------------------------------------
  mcps: [
    { id: 'backboard-memory', name: 'Backboard Memory', kind: 'memory', status: 'connected' },
    { id: '8090-workorders', name: '8090 Work Orders', kind: 'workorder', status: 'connected' },
    { id: 'github', name: 'GitHub', kind: 'vcs', status: 'connected' },
    { id: 'iso20022-validator', name: 'ISO 20022 Validator', kind: 'validator', status: 'available' },
    { id: 'pci-vault', name: 'PCI Vault', kind: 'security', status: 'available' },
  ],

  // ------------------------------------------------------------------
  // Knowledge graph — connected topology, every node reachable.
  // mem/backboard is the central hub.
  // ------------------------------------------------------------------
  graph: {
    nodes: [
      // requirements
      { id: 'REQ-001', type: 'requirement', label: 'Idempotent payments', sub: 'REQ-001', refId: 'REQ-001' },
      { id: 'REQ-002', type: 'requirement', label: 'ISO 20022 interop', sub: 'REQ-002', refId: 'REQ-002' },
      { id: 'REQ-003', type: 'requirement', label: 'PCI redaction', sub: 'REQ-003', refId: 'REQ-003' },
      // work orders
      { id: 'WO-101', type: 'workorder', label: 'Idempotency middleware', sub: 'in_progress', refId: 'WO-101' },
      { id: 'WO-102', type: 'workorder', label: 'pacs.008 mapper', sub: 'done', refId: 'WO-102' },
      { id: 'WO-103', type: 'workorder', label: 'PCI scrubber', sub: 'in_progress', refId: 'WO-103' },
      { id: 'WO-105', type: 'workorder', label: 'Ledger sync', sub: 'done', refId: 'WO-105' },
      { id: 'WO-106', type: 'workorder', label: 'Regression suite', sub: 'queued', refId: 'WO-106' },
      // agents
      { id: 'agent/payments-implementer', type: 'agent', label: 'Payments Implementer', sub: 'v2.3.0', refId: 'agent/payments-implementer' },
      { id: 'agent/compliance-reviewer', type: 'agent', label: 'Compliance Reviewer', sub: 'v1.4.0', refId: 'agent/compliance-reviewer' },
      { id: 'agent/integration-tester', type: 'agent', label: 'Integration Tester', sub: 'v1.1.0', refId: 'agent/integration-tester' },
      // skills
      { id: 'skill/payment-idempotency', type: 'skill', label: 'Payment Idempotency', sub: 'v2.1.0', refId: 'skill/payment-idempotency' },
      { id: 'skill/iso20022-mapper', type: 'skill', label: 'ISO 20022 Mapper', sub: 'v1.3.0', refId: 'skill/iso20022-mapper' },
      { id: 'skill/pci-redaction', type: 'skill', label: 'PCI Redaction', sub: 'v1.2.0', refId: 'skill/pci-redaction' },
      { id: 'skill/reconciliation-ledger', type: 'skill', label: 'Reconciliation Ledger', sub: 'v1.1.0', refId: 'skill/reconciliation-ledger' },
      { id: 'skill/sca-challenge', type: 'skill', label: 'SCA Challenge', sub: 'v1.0.0', refId: 'skill/sca-challenge' },
      // capsules
      { id: 'CAP-1001', type: 'capsule', label: 'Idempotency scoping', sub: 'transfer 88', refId: 'CAP-1001' },
      { id: 'CAP-1002', type: 'capsule', label: 'Decimal scaling', sub: 'transfer 74', refId: 'CAP-1002' },
      { id: 'CAP-1003', type: 'capsule', label: 'PAN/CVV scrub', sub: 'transfer 69', refId: 'CAP-1003' },
      { id: 'CAP-1004', type: 'capsule', label: 'Composite reconcile', sub: 'transfer 81', refId: 'CAP-1004' },
      { id: 'CAP-1005', type: 'capsule', label: 'Server-side SCA', sub: 'transfer 55', refId: 'CAP-1005' },
      // models (sessions)
      { id: 'claude-opus-4-8', type: 'model', label: 'Claude Opus 4.8', sub: '1000K ctx', refId: 'claude-opus-4-8' },
      { id: 'claude-sonnet-4-6', type: 'model', label: 'Claude Sonnet 4.6', sub: '200K ctx', refId: 'claude-sonnet-4-6' },
      // mcp
      { id: 'backboard-memory', type: 'mcp', label: 'Backboard MCP', sub: 'connected', refId: 'backboard-memory' },
      // central memory hub
      { id: 'mem/backboard', type: 'memory', label: 'Backboard', sub: 'Memory Pro hub', refId: 'mem/backboard' },
    ],
    links: [
      // workorder -implements-> requirement
      { source: 'WO-101', target: 'REQ-001', kind: 'implements' },
      { source: 'WO-102', target: 'REQ-002', kind: 'implements' },
      { source: 'WO-103', target: 'REQ-003', kind: 'implements' },
      { source: 'WO-105', target: 'REQ-002', kind: 'implements' },
      { source: 'WO-106', target: 'REQ-001', kind: 'implements' },
      // agent -executes-> workorder
      { source: 'agent/payments-implementer', target: 'WO-101', kind: 'executes' },
      { source: 'agent/payments-implementer', target: 'WO-102', kind: 'executes' },
      { source: 'agent/compliance-reviewer', target: 'WO-103', kind: 'executes' },
      { source: 'agent/integration-tester', target: 'WO-105', kind: 'executes' },
      { source: 'agent/integration-tester', target: 'WO-106', kind: 'executes' },
      // agent -uses-> skill
      { source: 'agent/payments-implementer', target: 'skill/payment-idempotency', kind: 'uses' },
      { source: 'agent/payments-implementer', target: 'skill/iso20022-mapper', kind: 'uses' },
      { source: 'agent/payments-implementer', target: 'skill/sca-challenge', kind: 'uses' },
      { source: 'agent/compliance-reviewer', target: 'skill/pci-redaction', kind: 'uses' },
      { source: 'agent/integration-tester', target: 'skill/reconciliation-ledger', kind: 'uses' },
      // capsule -produces-> skill version
      { source: 'CAP-1001', target: 'skill/payment-idempotency', kind: 'produces' },
      { source: 'CAP-1002', target: 'skill/iso20022-mapper', kind: 'produces' },
      { source: 'CAP-1003', target: 'skill/pci-redaction', kind: 'produces' },
      { source: 'CAP-1004', target: 'skill/reconciliation-ledger', kind: 'produces' },
      { source: 'CAP-1005', target: 'skill/sca-challenge', kind: 'produces' },
      // capsule -derives-> session (model)
      { source: 'CAP-1001', target: 'claude-opus-4-8', kind: 'derives' },
      { source: 'CAP-1002', target: 'claude-sonnet-4-6', kind: 'derives' },
      { source: 'CAP-1003', target: 'claude-opus-4-8', kind: 'derives' },
      { source: 'CAP-1004', target: 'claude-sonnet-4-6', kind: 'derives' },
      { source: 'CAP-1005', target: 'claude-opus-4-8', kind: 'derives' },
      // capsule -stores-> memory hub
      { source: 'CAP-1001', target: 'mem/backboard', kind: 'stores' },
      { source: 'CAP-1002', target: 'mem/backboard', kind: 'stores' },
      { source: 'CAP-1003', target: 'mem/backboard', kind: 'stores' },
      { source: 'CAP-1004', target: 'mem/backboard', kind: 'stores' },
      { source: 'CAP-1005', target: 'mem/backboard', kind: 'stores' },
      // model -reads-> memory hub
      { source: 'claude-opus-4-8', target: 'mem/backboard', kind: 'reads' },
      { source: 'claude-sonnet-4-6', target: 'mem/backboard', kind: 'reads' },
      // mcp -stores-> memory hub
      { source: 'backboard-memory', target: 'mem/backboard', kind: 'stores' },
    ],
  },

  // ------------------------------------------------------------------
  // A/B trials — same task, run WITH the capsule recalled vs WITHOUT.
  // Capsuled runs win on tokens, steps, and transfer score; transfer
  // scores mirror the source capsule's transferScore.
  // ------------------------------------------------------------------
  abTrials: [
    {
      id: 'AB-01',
      task: 'Add idempotency to a new refund endpoint',
      skillId: 'skill/payment-idempotency',
      model: 'claude-opus-4-8',
      mcp: 'backboard-memory',
      withCapsule: {
        tokens: 9200,
        steps: 4,
        passed: true,
        transferScore: 88,
        durationS: 142,
        outcome: 'Reused CAP-1001 pattern; transaction-scoped key correct on first try',
      },
      withoutCapsule: {
        tokens: 27400,
        steps: 11,
        passed: true,
        transferScore: 41,
        durationS: 388,
        outcome: 'Re-derived scoping only after a double-charge surfaced in test',
      },
      verdict:
        'Capsule recall skipped the cache-vs-ledger dead end, cutting tokens 66% and 7 steps.',
    },
    {
      id: 'AB-02',
      task: 'Map a JPY pacs.008 outbound message',
      skillId: 'skill/iso20022-mapper',
      model: 'claude-sonnet-4-6',
      mcp: 'iso20022-validator',
      withCapsule: {
        tokens: 7100,
        steps: 3,
        passed: true,
        transferScore: 74,
        durationS: 119,
        outcome: 'Pulled the ISO 4217 exponent table; JPY 0-decimal amount correct',
      },
      withoutCapsule: {
        tokens: 19800,
        steps: 9,
        passed: false,
        transferScore: 33,
        durationS: 305,
        outcome: 'Hardcoded /100, corrupted the JPY amount, failed network XSD',
      },
      verdict:
        'Without the capsule the run hardcoded 2 decimals and failed validation; capsuled run passed first try.',
    },
    {
      id: 'AB-03',
      task: 'Scrub PAN from a new webhook log path',
      skillId: 'skill/pci-redaction',
      model: 'claude-opus-4-8',
      mcp: 'pci-vault',
      withCapsule: {
        tokens: 8300,
        steps: 4,
        passed: true,
        transferScore: 69,
        durationS: 131,
        outcome: 'Applied Luhn-checked scrubber at writer, egress, and tool args',
      },
      withoutCapsule: {
        tokens: 21600,
        steps: 10,
        passed: true,
        transferScore: 38,
        durationS: 342,
        outcome: 'Missed the tool-call argument leak path on the first pass',
      },
      verdict:
        'Capsule recalled the second leak path (tool-call args) the cold run forgot, halving review steps.',
    },
    {
      id: 'AB-04',
      task: 'Reconcile a partially-settled camt.053 batch',
      skillId: 'skill/reconciliation-ledger',
      model: 'claude-sonnet-4-6',
      mcp: '8090-workorders',
      withCapsule: {
        tokens: 8900,
        steps: 5,
        passed: true,
        transferScore: 81,
        durationS: 150,
        outcome: 'Composite key + value-date fallback matched every entry',
      },
      withoutCapsule: {
        tokens: 23100,
        steps: 12,
        passed: false,
        transferScore: 35,
        durationS: 401,
        outcome: "Single-key match failed on the network's re-issued references",
      },
      verdict:
        'The composite-key insight from CAP-1004 avoided the false-mismatch that broke the cold run.',
    },
  ],

  // ------------------------------------------------------------------
  // Factory modules — the native 8090 Software Factory surfaces that
  // CAPSULE renders alongside. Stats roll up from the data above.
  // ------------------------------------------------------------------
  factoryModules: [
    {
      id: 'refinery',
      name: 'Capsule Refinery',
      label: 'Refinery',
      blurb: 'Compresses raw sessions into reusable capsules stored in Backboard.',
      status: 'active',
      stat: { primary: 8, primaryLabel: 'capsules', secondary: 34, secondaryLabel: 'sessions ingested' },
    },
    {
      id: 'foundry',
      name: 'Skill Foundry',
      label: 'Foundry',
      blurb: 'Forges and versions enterprise skills from accepted capsule findings.',
      status: 'active',
      stat: { primary: 5, primaryLabel: 'skills', secondary: 11, secondaryLabel: 'versions forged' },
    },
    {
      id: 'planner',
      name: 'Work Planner',
      label: 'Planner',
      blurb: 'Decomposes business requirements into agent-ready work orders.',
      status: 'healthy',
      stat: { primary: 4, primaryLabel: 'requirements', secondary: 6, secondaryLabel: 'work orders' },
    },
    {
      id: 'assembler',
      name: 'Agent Assembler',
      label: 'Assembler',
      blurb: 'Wires versioned skills into the agents that execute work orders.',
      status: 'active',
      stat: { primary: 3, primaryLabel: 'agents', secondary: 5, secondaryLabel: 'skills wired' },
    },
    {
      id: 'tests',
      name: 'Test Harness',
      label: 'Tests',
      blurb: 'Runs the payment regression suite against every adopted skill version.',
      status: 'healthy',
      stat: { primary: 75000, primaryLabel: 'tokens saved', secondary: 72, secondaryLabel: '% adoption' },
    },
    {
      id: 'validator',
      name: 'Validator',
      label: 'Validator',
      blurb: 'Enforces ISO 20022 schema and PCI redaction at the network boundary.',
      status: 'active',
      stat: { primary: 68, primaryLabel: 'avg transfer', secondary: 5, secondaryLabel: 'checks wired' },
    },
  ],

  // ------------------------------------------------------------------
  // Roll-up metrics
  // tokensSavedTotal == Σ capsule.reuses * capsule.tokensSavedPerReuse == 75000
  // avgTransfer == mean of capsule transferScores
  //   (88+74+69+81+55+72+63+40)/8 = 67.75 -> 68
  // ------------------------------------------------------------------
  metrics: {
    tokensSavedTotal: 75000,
    sessionsCaptured: 34,
    capsules: 8,
    skillsEvolved: 5,
    avgTransfer: 68,
    adoptionRate: 72,
    compounding: [
      { week: '2026-W18', tokensSaved: 4200 },
      { week: '2026-W19', tokensSaved: 9600 },
      { week: '2026-W20', tokensSaved: 16500 },
      { week: '2026-W21', tokensSaved: 24800 },
      { week: '2026-W22', tokensSaved: 36000 },
      { week: '2026-W23', tokensSaved: 48000 },
      { week: '2026-W24', tokensSaved: 61000 },
      { week: '2026-W25', tokensSaved: 75000 },
    ],
  },
};
