# Fit-to-Fly: instructor feedback fixes

Fixes the existing app in place: same look, same demo cases, same clinical rules and thresholds.

## Phase 1: Workflow integrity (no backend needed)
1. **Approval invalidation and certificate versions (P1)**
   - Save an unchangeable snapshot when the physician approves: the inputs, decision, signature, time and version number.
   - Each edit compares the clinically relevant inputs with the latest snapshot: departure date, diagnosis, procedure, findings, symptoms, vitals, medications, investigations and NYHA class.
   - If any of these change, the approval and risk review are marked "Reassessment required". The screen lists the changed fields, and the certificate shows SUPERSEDED. Earlier versions stay viewable.
   - Approving again creates certificate v2, v3 and so on under the same Case ID.
   - Pending follow-ups are recalculated from the new date with no duplicates. Completed follow-ups are left unchanged.
2. **Retrieval prerequisites (P2)**: registration must be complete, identity must be verified (new step: document checked, by whom, when) and consent must be recorded. A guard in the case-update logic enforces this, so it does not rely only on disabling the button. Each status is saved with a timestamp.
3. **One clearance check (P3)**: `clearanceReadiness()` lists missing data, unverified facts, unreviewed high-risk flags, the deferral requirement and any invalidated approval. Approval is refused unless every item passes. Values are shown as Missing, Negative, Positive, N/A, Pending verification or Unknown.
4. **AI fact extraction (P5)**
   - Every extracted fact keeps its exact quote, document ID, confidence and the label "AI-EXTRACTED — AWAITING PHYSICIAN VERIFICATION".
   - The physician can Accept, Edit, Reject, mark Uncertain or mark Not documented.
   - Only verified facts feed the risk rules. Conflicting and missing facts are flagged as such.
   - Extraction stays rule-based and labeled SIMULATED, unless Lovable AI is approved.
5. **Follow-up (P6)**: the screen separates responded without symptoms, responded with symptoms, no response, unknown, pending and completed. Escalation logic stays as it is.
6. **Roles (P7)**: a visible "SIMULATED ROLE — not secure access control" label, plus a roles section on the documentation page.
7. **Six demo scenarios (A–F)** as synthetic cases.

## Phase 2: Backend and n8n (depends on your answers)
- Lovable Cloud: cases and event tables, physician and coordinator accounts, server-side permission checks.
- A server function posts case events to your n8n webhook, with an idempotency key. The secret is stored securely.
- A verified callback endpoint lets n8n update the processing status.
- n8n Wait/resume steps run on n8n's side. I will document the exact node setup.
- Without the webhook URL or credentials, the integration stays labeled "not connected". It never fakes a successful response.

## Tests and report (P8)
- Vitest tests for each rule above, plus a browser walkthrough of scenarios A–F.
- A final report that classifies each feature as IMPLEMENTED, SIMULATED or PLANNED, and lists only tests that were actually run.
