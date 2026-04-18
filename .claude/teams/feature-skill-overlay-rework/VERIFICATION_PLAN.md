# Verification Plan
## Feature: Skill Apply Overlay Rework

## Build & Types
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` no errors

## Spec Checks
- [ ] File `src/ui/SkillApplyOverlay.ts` exports `SkillApplyOverlay` class and `SkillApplyOverlayOptions` interface
- [ ] File `src/ui/Meter.ts` exports `Meter` class with `showPreview` and `clearPreview` methods
- [ ] `SkillApplyOverlayOptions` interface unchanged (skill, level, onConfirm, onCancel, onOpen, onClose)
- [ ] No X button / close button code in SkillApplyOverlay
- [ ] Backdrop alpha is 0.3-0.4 (not 0.7)
- [ ] OVERLAY_DEPTH remains 1500
- [ ] `.conventions/gold-standards/confirmation-overlay.ts` updated with new compact card pattern

## Human Checks
- [ ] Card is compact and horizontal, NOT fullscreen modal
  Context: open any skill, verify card is small and positioned above the board
  -> Tap a skill button, check that the info card is compact (~300px wide) and positioned above the game board, not covering the full screen
- [ ] Game field visible through lighter overlay
  -> With overlay open, verify you can see the game board tiles behind the semi-transparent backdrop
- [ ] HP bar shows damage/heal preview
  -> Tap a damage skill: boss HP bar should show a white section indicating pending damage. Tap a heal skill: player HP bar should show green section indicating pending heal
- [ ] Tap outside card closes overlay without applying
  -> Tap in the game board area while overlay is open, verify it closes without using the skill
- [ ] Apply button works and activates skill
  -> Tap "Применить!", verify skill activates (mana deducted, effect applied)
- [ ] Skill button pulses while overlay is open
  -> With overlay open, verify the corresponding skill button at the bottom has a pulsing animation
