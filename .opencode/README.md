# Opencode Agents

This project uses project-local opencode agents adapted from the sibling `FantasyApp` setup.

## Project Focus

Treasure Hunt is a personal, mobile-targeted webapp for friends to play. Players find real-world codes, enter them into the app, and unlock the next clue as they progress through the hunt.

The agents should prioritize:

- Mobile-first web UI and touch-friendly flows
- Clear clue progression and code-entry feedback
- Simple operation for a private friend group
- Practical protection against spoilers and casual code tampering
- Small, maintainable changes over large architecture unless requested

## Primary Agent

- `architect` is the default primary agent.
- It uses `openai/gpt-5.5` with variant `high`.
- It delegates implementation and review work to specialist subagents.

## Subagents

- `builder` - mobile-first UI, routes, state, code-entry flows, storage, and integrations (`openai/gpt-5.5`, variant `low`)
- `debugger` - mobile browser, routing, state, form, validation, storage, build, and deployment fixes (`openai/gpt-5.5`, variant `low`)
- `refactorer` - safe cleanup and deduplication (`nvidia/qwen/qwen3.5-397b-a17b`)
- `game` - clue progression, code validation, hints, puzzle state, and anti-spoiler game logic (`nvidia/qwen/qwen3.5-397b-a17b`)
- `ux` - mobile-first UX, clue screens, code input, accessibility, and friend-friendly flows (`nvidia/qwen/qwen3.5-397b-a17b`)
- `docs` - README, setup notes, clue authoring docs, game setup instructions, and runbooks (`nvidia/qwen/qwen3.5-397b-a17b`)
- `performance` - mobile loading, bundle size, offline behavior, images, animations, and low-connectivity usage (`nvidia/qwen/qwen3.5-397b-a17b`)
- `security` - code secrecy, client-side tampering, secrets, privacy, deployment exposure, and safe defaults (`nvidia/qwen/qwen3.5-397b-a17b`)

## Files

- Config: `.opencode/opencode.json`
- Agents: `.opencode/agent/*.md`

After changing these files, quit and restart opencode. Config is loaded only at startup.

Check registered agents with:

```bash
opencode agent list
```
