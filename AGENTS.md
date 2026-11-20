<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Domain logic lives in `src/lib/ftf/` (pure, testable); step screens in `src/components/ftf/`. Why: keeps clinical rules testable apart from UI.
- Prototype persistence is browser localStorage via `src/lib/ftf/store.ts`; all mutations go through `ftf.update` so each change can append an audit entry. Why: brief requires a no-backend demo with auditability.
- Workflow gates (retrieval prerequisites, approval readiness, invalidation on material change, follow-up reconciliation) live in `src/lib/ftf/workflow.ts` and run inside `ftf.update` via `enforceInvariants`. Why: UI paths and direct calls cannot bypass them.
- Approved documents are append-only `certificates` versions; never edit a version, supersede it. Why: preserves the signed historical record.
- Interoperability (FHIR R4 mapping, adapters, SMART design, provenance, patient context) lives in `src/lib/interop/`, depends on `src/lib/ftf` one-way, and never changes clinical rules. Imported facts must enter as `review: "unverified"`. Why: keeps the internal model vendor-neutral and preserves physician verification.
