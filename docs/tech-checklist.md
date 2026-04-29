<!-- SPDX-License-Identifier: GPL-3.0-only -->

# Celeste Tech Checklist (Current Implementation Snapshot)

This checklist is a coverage matrix for this prototype. The technique taxonomy and behavior summaries are adapted from [Tech - Celeste Wiki](https://celeste.ink/wiki/Tech), whose text content is available under the GNU General Public License, version 3 only. This file is marked `GPL-3.0-only` to keep that adapted material's licensing explicit.

The implementation notes describe this prototype's own TypeScript/Phaser behavior. No Celeste game assets, maps, art, audio, screenshots, or commercial game files are included.

Legend:
- `WORKS`: implemented and behavior is broadly correct
- `EXCLUDED`: requires missing entities or input systems, or depends on exact subpixel/engine behavior that cannot be derived confidently from the local Celeste reference snapshot

## Mechanics

| Technique | Status | Notes |
| --- | --- | --- |
| Berry Mechanics | EXCLUDED | No strawberry system |
| Climbhop | WORKS | Climb hop state transition and speeds present |
| Corner Correction | WORKS | Upward + dash corner correction set to 4px |
| Coyote Time / Coyote Jump | WORKS | Usable window matches the Celeste timing path in the local reference |
| Dash Attack | WORKS | Timer and wallbounce/super interaction timing match the Celeste reference constants |
| Directional Spikes | WORKS | Spike checks now use direction-aware edge contact instead of raw overlap |
| Fastbubbling | EXCLUDED | No bubble entities |
| Fastfalling | WORKS | 160 -> 240 max fall path implemented |
| Input Buffering | WORKS | Usable jump buffer window matches the expected 5-frame behavior at 60 Hz |
| Liftboost | EXCLUDED | Core storage exists, but no movers using it |
| Screen Transition | WORKS | Authored rooms, adjacency lookup, camera scroll transitions, room-local checkpoint updates, dash/stamina refill, and upward-transition bounce are implemented and covered by focused model/gameplay tests; the transition orchestration is a local/speculated implementation rather than behavior derived from the local Celeste reference snapshot |

## Dash Tech

| Technique | Status | Notes |
| --- | --- | --- |
| Spring Cancel | EXCLUDED | No springs |
| Superdash | WORKS | 260 speed behavior present |
| Hyperdash | WORKS | 325 speed, halved jump height behavior present |
| Wavedash | WORKS | Wavedash path emits and uses hyper values |
| Extended Dashes | WORKS | Dash refill + jump timing produces extended supers/wavedashes |
| Reverse Dashes | WORKS | Reverse super/hyper path present |
| Superwave | WORKS | Composed from the verified extended super + reverse wavedash behavior |
| Ultradash | WORKS | Down-diagonal ground conversion and 1.2x multiplier behavior present |
| Chained Ultras | WORKS | Ultra state carries correctly; chaining depends on terrain/setup rather than a separate mechanic |
| Grounded Ultras | WORKS | 390 burst observed from 325 * 1.2 |
| Grounded Ultra Cancel | EXCLUDED | Requires dash interruption sources not present |
| Delayed Ultra | WORKS | Landing after a down-diagonal dash still applies the ultra slide conversion |
| Demodash | WORKS | Dedicated configurable crouch-dash input and manual down+dash startup both use the 6px crouched hitbox / 4px hurtbox; manual down+dash can redirect left/right before dash motion commits and ignores direction changes after commit |
| Demohyper | WORKS | Horizontal crouch dash / demodash into jump resolves through the crouched super-jump path, produces hyper values, and keeps faster horizontal dash startup than a down-diagonal hyper setup |
| Up Diagonal Demo | WORKS | Manual down+dash startup can redirect to up-diagonal before dash motion commits, preserves the crouched hurtbox through the dash, then returns to normal height after dash end |
| Wallbounce | WORKS | Updash + wall jump yields super wall jump values (170/-160) |
| Spiked Wallbounce | WORKS | Enabled by the corrected directional spike handling |

## Dashless Tech

| Technique | Status | Notes |
| --- | --- | --- |
| Bunnyhop | WORKS | Ground jump timing preserves speed as expected |
| Cornerkick | WORKS | Corner wall-jump interactions are present |
| Ceiling Pop | EXCLUDED | Subpixel-exact ceiling-pop behavior is not derived confidently from the local reference snapshot |
| Crouch Jumps | WORKS | Crouched jump state flow exists |
| Neutral Jump | WORKS | Neutral climb jump + return works |
| 5jump | WORKS | Top-of-wall climb/wallkick behavior allows it |
| Cornerboost | EXCLUDED | The retained-speed primitive is present, but exact cornerboost parity is a subpixel-emergent behavior not fully derived from the local reference |
| Downward Cornerboosts | EXCLUDED | Depends on the excluded cornerboost audit |
| 6jump | EXCLUDED | Depends on the excluded cornerboost audit |
| Double Cornerboost | EXCLUDED | Depends on the excluded cornerboost audit |
| 7jump | EXCLUDED | Depends on the excluded cornerboost audit |
| 8jump | EXCLUDED | Depends on the excluded cornerboost audit |
| 9jump | EXCLUDED | Depends on the excluded cornerboost audit |
| Reverse Cornerboost | EXCLUDED | Depends on the excluded cornerboost audit |
| Neutral Reverse Cornerboost | EXCLUDED | Depends on the excluded cornerboost audit |
| Spiked Cornerboost | EXCLUDED | Depends on the excluded cornerboost audit plus exact spike-tech parity |
| Disappearing Block Cornerboost | EXCLUDED | No disappearing/cassette/door blocks |
| Spike Climb | EXCLUDED | Exact spike-wall interaction needed for faithful spike climbing is not derived confidently from the local reference snapshot |
| Spike Clip | EXCLUDED | Exact spike hitbox/step-order parity is not derived confidently from the local reference snapshot |
| Spike Jumps | EXCLUDED | Requires wind/moving entities |
| Stamina Cancel | EXCLUDED | Precise tap-grab stamina behavior is not derived confidently from the local reference snapshot |
| Wallboost | WORKS | Neutral climbjump + opposite direction refunds climbjump stamina |
| Cornerboost Wallboost (cobwob) | EXCLUDED | Depends on the excluded cornerboost audit |
| Wallboost Neutral | WORKS | Repeated wallboost sequence works functionally |
| Cornerslip | EXCLUDED | Exact ground-graze refill behavior is not derived confidently from the local reference snapshot |

## Entity Tech

All items in this section are currently `EXCLUDED` because required entities/systems are missing:
- Archie
- Bubble Super / Hyper
- Bumper Clip
- Explosion Boost
- Fish / Iceball / Oshiro / Seeker / Snowball Jump
- Cloud Jump / Spiked Cloud Jump
- Cloud Hyper/Super
- Cloud Hyper Bunnyhop
- Core Hyper/Super
- Delayed Blockboost
- Dream Grab
- Dream Jump
- Dream Double-Jump
- Dream Hyper
- Dream Smuggle
- Dream Grab Hyper
- Holdable Dream Hyper
- Holdable Grabless Dream Hyper
- Holdable Core Super/Hyper
- Featherboost
- Feather Super
- Heart Ultras
- Jumpthrough Clip
- Feather Clip
- Feather Hitbox Preservation
- Lava Neutrals
- Moon Boost
- Reform Tech
- Reform Kick
- Reform Boost (Cassette Boost)
- Cassoosted Fuper
- Core Block Entity Displacement
- Seeker Bounce
- Theo/Jelly Regrabs
- Holdable Slash
- Neutral Drop
- Holdable Stall
- Holdable Climb
- Holdable Neutral Jump
- Holdable Laddering
- Theo/Jelly Ultras
- Holdable Dash Smuggle (From bumpers)
- Throwable Backboost (Backboost)
- Jellyvator / Theovator
- Waterboost
- Koral Clip
- Springboost cancel

## Other Tech

| Technique | Status | Notes |
| --- | --- | --- |
| Bino Tech (all variants) | EXCLUDED | No binocular system |
| Bubsdrop | EXCLUDED | Room routing and upward-transition bounce exist, but bubsdrop-specific momentum cancellation during the transition, return-to-original-room flow, and nearest-available re-entry spawn behavior are not implemented or tested |
| Cassette Raise | EXCLUDED | No cassette blocks |
| Cutscene Warps | EXCLUDED | No cutscene state machine |
| Half Stamina Climbing | EXCLUDED | Requires a tighter audit of wallboost/climbjump timing than the local reference snapshot currently supports |
| Kermit Dash | EXCLUDED | Room transitions exist, but Celeste-style dash cancellation while preserving dashattack behavior is not implemented/tested; the relevant target entities such as dream blocks, Kevins, and break blocks are also missing |
| Pause Buffering | WORKS | Pause/unpause includes a Celeste-style 10-frame recovery, 6-frame late hold window, and frame-11 repause path |
| Roboboost | EXCLUDED | Requires moving blocks and advanced interactions |
| Screen Transition Cassette Offset | EXCLUDED | Room transitions exist, but cassette blocks/color phases and their transition-time pixel offsets are not implemented |
| Spinner Stunning | EXCLUDED | No spinner entity |
| Spinner Freeze | EXCLUDED | No spinner/timeactive system |
| Undemo Dashing | WORKS | Neutral/non-down dash startup can redirect downward before dash motion commits without setting the crouched demo flag, so the downward dash keeps the normal hurtbox |
