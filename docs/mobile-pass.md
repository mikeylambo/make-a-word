# Mobile studio pass

Scope: responsive web gameplay, not native packaging or a claim of iOS certification.

- Compact portrait studio menu; desktop artwork unchanged.
- VisualViewport-driven keyboard layout, with normal-height fallback.
- Submit and bank preserve input focus; no autocorrect; Send keyboard hint.
- Large touch targets, wrapping long phrase words, reachable results actions.
- Pause navigation scopes to visible modal controls; stale focus callbacks ignored.
- Pause → Settings → Back returns to the paused round.
- System reduced-motion preference respected; no hover movement on touch.

Checks: full existing verification suite plus an executable mocked viewport test.

Required device acceptance: iPhone Safari and installed PWA, Android Chrome,
small phone and tablet, portrait/landscape, keyboard open/close, hardware keyboard,
large text, reduced motion, repeated submit, Burn board transition, pause/settings
return, phone lock/resume, local multiplayer handoff, and online reconnect.
Native iOS keyboard presentation, performance, and VoiceOver need physical-device
testing. Offline installation, cloud saves, haptics, native packaging, and online
server behavior are not added by this pass.
