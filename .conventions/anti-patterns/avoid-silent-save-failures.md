# Anti-Pattern: Silent localStorage Failures

Never catch a `localStorage.setItem` error without surfacing it to the player.
Browsers throw `QuotaExceededError` (quota full) and `NS_ERROR_DOM_QUOTA_REACHED`
(Firefox) when disk/memory caps are hit — if the catch block swallows the error,
the player continues playing on state that WILL NOT persist, and discovers the
data loss only on next reload.

Phase 1C established the rule: the SaveManager MUST flag the failure, emit an
EventBus `saveError` signal, and let the Toast wiring show the player a
human-readable message ("Не удаётся сохранить — память переполнена").

## The rule

When you wrap `localStorage.setItem` (or any persistence call) in a `try/catch`:

1. **DO** set a durable instance flag the game can query later
   (`this.saveFailed = true`)
2. **DO** emit a typed event on `eventBus` with a classified reason
   (`"quota"` vs `"unknown"`) and the raw error message
3. **DO** `console.error` for dev visibility
4. **DO NOT** swallow the error with an empty catch
5. **DO NOT** retry in a loop
6. **DO NOT** fall back to `sessionStorage` or in-memory state without telling
   the player — silent fallback is still silent failure

## WRONG — silent swallow

```typescript
save(): void {
  if (!this.data || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
  } catch {
    // TODO: handle quota exceeded
  }
}
```

The player's relationship deltas, XP, and inventory changes all look persisted
in-memory but vanish on page reload. The `TODO` comment will outlive the
project.

## CORRECT — flag + emit + log

```typescript
save(): void {
  if (!this.data || typeof localStorage === "undefined") return;
  this.data.lastSavedAt = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    this.saveFailed = false;
  } catch (err) {
    this.saveFailed = true;
    const isQuota =
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" ||
        err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        err.code === 22 ||
        err.code === 1014);
    const message = err instanceof Error ? err.message : String(err);
    eventBus.emit("saveError", {
      reason: isQuota ? "quota" : "unknown",
      error: message,
    });
    console.error("SaveManager: save failed", err);
  }
}
```

The Toast wiring in `src/v2/index.ts` picks up the `saveError` event and shows
the player "Не удаётся сохранить — память переполнена" on the active scene.
`isSaveFailed()` lets downstream code (e.g. future end-of-session prompt) ask
"should I pester the player to export their save?" without racing the event.

## Quota error classification

Different browsers report quota differently:

| Browser | Detection                                  |
|---------|--------------------------------------------|
| Chromium| `err.name === "QuotaExceededError"`        |
| Firefox | `err.name === "NS_ERROR_DOM_QUOTA_REACHED"`|
| Safari  | `err.code === 22` (historic)               |
| Older FF| `err.code === 1014`                        |

Check all four in an `||` chain. Anything else → classify as `"unknown"` so
the player gets a generic "Ошибка сохранения" instead of a misleading quota
message.

## Importing JSON — same rule, different shape

Shape-validated imports return a discriminated union so the caller is forced
to narrow on `ok` before reading `error`:

```typescript
importJson(json: string): { ok: true } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Invalid JSON: ${message}` };
  }
  // ... shape validation, orphan cleanup, lastSavedAt clamp, migrate ...
  return { ok: true };
}
```

Callers MUST check `ok` — they cannot accidentally treat a failed import as a
success because `error` does not exist on the success branch. No `boolean`
return, no implicit fall-through.

## Related

- Gold standard: `.conventions/gold-standards/toast-notifications.ts` (§5
  EventBus bridge)
- Gold standard: `.conventions/gold-standards/content-validation.ts` (parallel
  "surface errors loudly" ethos for content)
- DECISIONS.md R8, R9 — `importJson` signature and orphan-cleanup contract
- DECISIONS.md §4 — EventBus locked shape for `saveError`
