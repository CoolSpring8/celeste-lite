# celeste-lite

`celeste-lite` is an unofficial TypeScript/Phaser browser prototype focused on studying Celeste-like player movement, input timing, room flow, assists, and small player-facing visual systems.

It is a small programming study, not a full game, engine, or content recreation. It exists with respect for Celeste's design craft and for the technical material its creators have shared with the community.

This project is not affiliated with, endorsed by, or associated with Maddy Makes Games, Inc. or Extremely OK Games, Ltd. It does not include Celeste art, audio, maps, screenshots, commercial game files, or other official game assets.

## What This Is

- A Phaser 3 prototype with fixed-step platformer movement at a 320x180 pixel-art viewport.
- A TypeScript implementation of Celeste-inspired player movement, including jump timing, dash states, climbing, stamina, refills, spikes, jump-throughs, room transitions, death/respawn flow, and pause/unpause timing.
- A test-backed mechanics sandbox. The deeper technique coverage lives in [docs/tech-checklist.md](docs/tech-checklist.md).
- A code-generated visual prototype. Player glyphs, particles, lighting, tiles, and transition effects are created locally rather than copied from Celeste assets.

## What This Is Not

- Not an official Celeste project.
- Not a Celeste asset, level, story, or content clone.
- Not a complete recreation of Celeste's engine or entity catalogue.
- Not currently a controller or mobile-ready game. The runtime is keyboard-first.
- Not a claim of exact parity where the available reference material does not support it.

## Controls

Default keyboard controls:

- Arrow keys: move and aim
- `C`: jump / confirm / start
- `X`: dash / cancel
- `Z`: grab
- `Esc`: pause / cancel
- Backtick: debug overlay

Keyboard bindings and assist options can be changed from the pause menu.

## Development

This project uses Bun, TypeScript, Vite, and Phaser.

```sh
bun install
bun run dev
```

Useful checks:

```sh
bun test
bun run build
```

The build script runs `tsc --noEmit` before `vite build`, so TypeScript checking and the production bundle stay separate.

## Credits and References

Celeste and related IP belong to their respective owners, including Maddy Makes Games, Inc. as stated in the Celeste64 source release. Extremely OK Games, Ltd. is the studio formed by members of the Celeste team for later work. No official endorsement is implied by this repository.

Reference and inspiration sources include:

- [Celeste](https://www.celestegame.com/) by its original creators and team, from [Maddy Makes Games](https://www.mattmakesgames.com/) and [Extremely OK Games](https://exok.com/).
- The publicly released [`Player.cs`](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs) from [NoelFB/Celeste](https://github.com/NoelFB/Celeste), used as the main technical reference for player movement, states, physics constants, and some visual behavior. That repository presents the released class files as a learning resource and notes that its MIT license applies to the released code, not to the commercial Celeste game or assets.
- Maddy Thorson's [Monocle Engine](https://github.com/JamesMcMahon/monocle-engine), consulted through a public mirror, which informed parts of the local entity, collider, state machine, actor movement, and virtual input architecture.
- Noel Berry's public explanation of Madeline's hair implementation on [Reddit](https://www.reddit.com/r/gamedev/comments/9a0cfr/comment/e4rvrg2/) and the [smalleste](https://github.com/CelesteClassic/smalleste/blob/main/smalleste.p8) source, which inspired the optional dynamic hair implementation.
- The tiny player glyph is original and generated in code. It is inspired by the community sqrt(11) shorthand for Madeline, especially Blank_Fei / 空白飞呜's sqrt(11) mod pages on [GameBanana](https://gamebanana.com/mods/607960) and [Bilibili](https://www.bilibili.com/video/BV1TDGuzWEHn/). It carries over the idea, not the mod sprite or Celeste assets.
- Noel Berry's post [Remaking Celeste's Lighting](https://noelberry.ca/posts/celeste_lighting/), which inspired the lighting experiment. This prototype uses a local mesh/visibility-polygon approach rather than reproducing the optimized cutout pipeline described there.
- Solid tile presentation is loosely inspired by gym rooms in the [Strawberry Jam Collab](https://gamebanana.com/mods/424541). No Strawberry Jam assets are included.

Third-party reference files under [reference/](reference/) retain their own notices.

## License

Unless otherwise noted, this repository's original source code and documentation are licensed under the MIT License. See [LICENSE](LICENSE).

Some documentation or reference materials may carry separate notices at the file level. In particular, files marked `SPDX-License-Identifier: GPL-3.0-only` are licensed under GPLv3 only.

Third-party reference files under [reference/](reference/) retain their own notices and are not authored by this project.

Celeste IP, names, characters, art, audio, maps, screenshots, and commercial game assets are not included in this repository and are not licensed by this repository. Celeste-related names are used only for attribution and descriptive reference.
