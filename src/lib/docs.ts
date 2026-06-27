// CAPSULE — the big-bets DOCUMENT CONTENT MODEL.
// Three Payments Copilot requirement documents, each broken into the
// sections the 8090 doc surface renders. The sidebar tree shows the ACTIVE
// doc's sections; the editor renders the selected section's `body`.
//
// This module is canonical and immutable — like data.ts, it is never
// mutated. Edit state (which doc/section is active, its DocStatus) lives in
// the store overlay. `body` is plain text; `\n\n` separates paragraphs so a
// renderer can split on blank lines without parsing markup.

export type DocId = 'requirements' | 'product-overview' | 'technical-requirements';
export type DocStatus = 'editing' | 'read-only' | 'inactive';

export interface DocSection {
  id: string;
  label: string;
  body: string; // plain text, paragraphs separated by \n\n
}

export interface Doc {
  id: DocId;
  label: string;
  status?: DocStatus;
  sections: DocSection[];
}

export const docs: Doc[] = [
  // ------------------------------------------------------------------
  // 1) Feature Requirements — the active, editable spec.
  // ------------------------------------------------------------------
  {
    id: 'requirements',
    label: 'Feature Requirements',
    status: 'editing',
    sections: [
      {
        id: 'req-overview',
        label: 'Overview',
        body:
          'The Payments Copilot turns a plain-English payment intent into a settled, auditable real-time transfer on the clearing rail. This document captures the feature-level requirements the agent factory implements: idempotent settlement, ISO 20022 interoperability, PCI redaction, and Strong Customer Authentication.\n\nEach requirement below is written as the business outcome a customer or auditor can verify, not as an implementation. Work orders decompose these into agent-ready tasks, and capsules captured during delivery feed the enterprise skills that satisfy them.',
      },
      {
        id: 'req-idempotency',
        label: 'Idempotent Settlement',
        body:
          'A customer who taps Pay twice — or whose client retries on a flaky network — must never be charged twice. The system treats a payment as an identity keyed on debtor, amount, and currency, persisted inside the same ledger transaction as the booking so a retry can never open a double-charge window.\n\nAcceptance: replaying an identical request within the 24-hour scheme retry envelope returns the original result without a second debit, while a genuine second payment of the same value to the same payee still settles normally.',
      },
      {
        id: 'req-iso20022',
        label: 'ISO 20022 Interoperability',
        body:
          'Outbound pacs.008 and inbound camt.053 messages must map cleanly to the schemas the clearing network publishes, with currency-correct decimal scaling driven by the ISO 4217 exponent table — never a hardcoded two-decimal divide.\n\nAcceptance: a JPY (0-decimal) and a BHD (3-decimal) payment both serialize to amounts that pass the network-published XSD, and reconciliation parses the returned camt.053 without false mismatches on re-issued references.',
      },
      {
        id: 'req-pci',
        label: 'PCI Redaction',
        body:
          'No primary account number or CVV may ever reach a log, a prompt, a model tool-call argument, or a stored capsule. A Luhn-validated scrubber runs independently at every trust boundary, because no single boundary is sufficient on its own.\n\nAcceptance: synthetic PAN/CVV pairs injected into a webhook payload are redacted before egress, before the capsule writer, and before any model call — while seventeen-to-nineteen digit order IDs survive untouched.',
      },
      {
        id: 'req-sca',
        label: 'Strong Customer Authentication',
        body:
          'High-value or risky payments must trigger a second-factor challenge that the bank — not the client — decides. The requirement is computed server-side from a risk score, and the challenge token is a single-use capability bound to exactly one payment intent.\n\nAcceptance: a low-value exempt payment settles without a challenge but logs the exemption reason; a high-risk payment returns challenge_required, and re-using its token against a second intent is rejected.',
      },
      {
        id: 'req-acceptance',
        label: 'Acceptance & Audit',
        body:
          'Every requirement ships with a regression test in the payment suite and an audit trail an examiner can replay. Adopted skill versions are pinned per project; the compounding metric tracks tokens saved as capsules are reused across sessions.\n\nSign-off requires green end-to-end tests, a clean PCI scan, and a reconciliation run that matches the ledger against a partially-settled camt.053 batch with zero unexplained breaks.',
      },
    ],
  },

  // ------------------------------------------------------------------
  // 2) Product Overview — sections mirror the 8090 look.
  //    Business Problem · Current State · Product Description ·
  //    Personas · Success Metrics · Technical Requirements.
  // ------------------------------------------------------------------
  {
    id: 'product-overview',
    label: 'Product Overview',
    status: 'editing',
    sections: [
      {
        id: 'po-business-problem',
        label: 'Business Problem',
        body:
          'Meridian Bank runs real-time payments on a rail where a single mistake — a double charge, a corrupted JPY amount, a leaked card number — becomes a regulatory incident, not just a bug. Engineering teams re-solve the same hard payment problems on every new endpoint because the hard-won lessons live in people\'s heads and closed pull requests.\n\nThe cost is paid twice: once in the tokens and hours spent re-deriving a known pattern, and again in the risk that a tired re-derivation gets it subtly wrong. Meridian needs the institution to learn once and apply everywhere.',
      },
      {
        id: 'po-current-state',
        label: 'Current State',
        body:
          'Today the Payments Copilot ships features through an agent factory, but each session starts cold. An agent asked to add idempotency to a refund endpoint re-discovers the cache-versus-ledger trap, burns roughly twenty-seven thousand tokens, and only catches the scoping bug after a double-charge surfaces in test.\n\nReviews catch most issues, but the second leak path — model tool-call arguments — and the network\'s re-issued reconciliation references are exactly the kind of detail a cold run forgets. Knowledge exists; it just is not reaching the next session.',
      },
      {
        id: 'po-product-description',
        label: 'Product Description',
        body:
          'CAPSULE compresses each completed session into a capsule: a small, typed record of the intent, the mental model, the decisions, the gotchas, and a single transferable finding. Capsules are stored in Backboard and routed to the enterprise skills and agents they improve, proposing a version bump the team can adopt.\n\nThe surface is a familiar requirements document with side panels: a Knowledge Graph of provenance, a Skills recommender driven by use-case search, a Versions history per skill, and A/B trials that prove a capsule-recalled run beats a cold one on tokens, steps, and transfer score.',
      },
      {
        id: 'po-personas',
        label: 'Personas',
        body:
          'Priya, Staff Payments Engineer — owns the rail and wants new endpoints to inherit idempotency and ISO mapping correctly without re-litigating them. She lives in the Skills recommender and the A/B panel.\n\nMarcus, Compliance Reviewer — must prove PAN/CVV never leaks and that SCA decisions are auditable. He keeps PCI Redaction on manual adoption and reads the capsule provenance before signing off.\n\nLena, Engineering Manager — watches the compounding metric and adoption rate to justify the platform, and decides when a proposed skill version is promoted org-wide.',
      },
      {
        id: 'po-success-metrics',
        label: 'Success Metrics',
        body:
          'North star: cumulative tokens saved through capsule reuse, tracking toward seventy-five thousand and compounding week over week as more sessions are captured.\n\nSupporting metrics: average transfer score across capsules (target high-sixties and rising), adoption rate of proposed skill versions (target above seventy percent), and time-to-first-correct on a benchmark task — where a capsule-recalled run should pass on the first try while the cold run re-derives the pattern.',
      },
      {
        id: 'po-technical-requirements',
        label: 'Technical Requirements',
        body:
          'The capsule store must be immutable and append-only: adoption is modelled as a metadata overlay, never a mutation of a captured record, so provenance is always replayable. Redaction runs before any capsule is written, so the store can never hold cardholder data.\n\nSkills are versioned with semantic bumps derived from the capsule that taught them, carry a token delta per use, and support both auto (publish-on-accept) and manual (human sign-off) adoption policies. The Knowledge Graph must stay fully connected with Backboard as the central hub so every node is reachable from any session.',
      },
    ],
  },

  // ------------------------------------------------------------------
  // 3) Technical Requirements — defaults to read-only to demo the mode.
  // ------------------------------------------------------------------
  {
    id: 'technical-requirements',
    label: 'Technical Requirements',
    status: 'read-only',
    sections: [
      {
        id: 'tr-architecture',
        label: 'Architecture',
        body:
          'The Payments Copilot is an agent factory wrapped around an immutable capsule store. Requirements decompose into work orders; agents execute work orders using versioned enterprise skills; completed sessions are distilled into capsules that route findings back into those skills. Backboard is the single memory hub every model reads from and every capsule writes to.\n\nThis document is frozen for review — it is the contract the implementation is measured against, so it opens read-only. Switch the doc mode to editing to propose changes through the normal review flow.',
      },
      {
        id: 'tr-data-model',
        label: 'Data Model',
        body:
          'Capsules are strongly typed: intent, mental model, learnings, gotchas, decisions (each with what, why, and file), and a single finding routed to one or more skills or agents. Skills carry an ordered version list; each version records the capsule it was derived from, its changelog, a token delta per use, and a published-or-proposed status.\n\nThe canonical dataset is never mutated at runtime. Adoption is an overlay map of skillId to adopted version, so the published view is derived rather than stored, and history is never lost.',
      },
      {
        id: 'tr-idempotency-spec',
        label: 'Idempotency Spec',
        body:
          'Idempotency keys are scoped to the tuple (debtorId, amount, currency) and persisted inside the same database transaction as the ledger insert, backed by a unique constraint so durability survives a Redis failover. Keys carry a twenty-four-hour TTL aligned to the card scheme retry envelope, and timestamps are server-issued to defeat clock skew between application nodes.\n\nA replayed request resolves to the stored result; a genuine repeat of the same value is a distinct key and settles independently.',
      },
      {
        id: 'tr-iso-spec',
        label: 'ISO 20022 Mapping Spec',
        body:
          'Amount scaling is driven by an ISO 4217 exponent table — JPY at zero fraction digits, BHD at three — never a fixed divide by one hundred. Amounts serialize as ActiveCurrencyAndAmount with the currency as an attribute, and CI validates against the network-published XSD rather than a locally pinned copy that silently drifts stale.\n\nReconciliation matches camt.053 on a composite (EndToEndId, amount) key with a value-date fallback, summing fee and principal entries before comparison because one logical payment can fan out into several booked entries.',
      },
      {
        id: 'tr-security',
        label: 'Security & Compliance',
        body:
          'PAN/CVV redaction is defense-in-depth: a Luhn-validated scrubber runs independently at the prompt egress, the model tool-call boundary, and the capsule writer, redacting an adjacent PAN/CVV pair together. SCA step-up is computed server-side from a risk score; the challenge token is single-use and bound to one payment intent, and every exemption is logged with its reason for the auditor.\n\nNo cardholder data may exist in any capsule, prompt, log, or tool argument — verified by a scan in CI on every change.',
      },
      {
        id: 'tr-testing',
        label: 'Testing & Rollout',
        body:
          'Every adopted skill version is exercised by the end-to-end payment regression suite before promotion. A/B trials run the same task with the capsule recalled and without it; the capsule-recalled run must win on tokens, steps, and transfer score, and the result is recorded as the verdict.\n\nRollout is staged by adoption policy: auto skills publish on accept and propagate to opted-in projects, while manual skills (PCI Redaction, SCA Challenge) require an explicit human sign-off before any agent picks up the new version.',
      },
    ],
  },
];

// Resolve the store's free-form activeDocId against either a doc id or its
// label, so the initial value ('Technical Requirements') still lands on the
// right doc. Falls back to the first doc. SHARED by the editor tab strip and
// the TopBar tab strip so both always agree on the active document.
export function resolveDoc(activeDocId: string): Doc {
  return docs.find((d) => d.id === activeDocId || d.label === activeDocId) ?? docs[0];
}

// Public tab wording per the spec. The requirements doc is "Feature
// Requirements" internally, so the tab strips use the shorter public name.
export const TAB_LABEL: Record<DocId, string> = {
  requirements: 'Requirements',
  'product-overview': 'Product Overview',
  'technical-requirements': 'Technical Requirements',
};
