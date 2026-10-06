# Corolla mini projector: wiring survey

Beebot CM2 mini projectors installed by a variation shop without a schematic.
Low beam is yellow only, high beam is white only. Observed behaviour:

| Control | Effect |
|---|---|
| Stick-on switch | yellow low on/off |
| Factory high beam | white high on, regardless of the stick-on switch |

This file is the survey checklist. Once the results are in, it gets replaced by
the schematic.

## Tools

Multimeter (DC volts, continuity), phone camera.

## Photos

| # | Subject | Done |
|---|---|---|
| P1 | Relay(s) under the hood, with their wires visible | |
| P2 | Where the relay power wire connects (battery terminal, fuse box, splice) | |
| P3 | Inline fuse holder, with the fuse rating legible | |
| P4 | Back of the stick-on switch and the wires going into it | |
| P5 | Each projector's wires and connector | |
| P6 | Any splice or tap on the factory headlight wiring | |

## Measurements

Engine off unless stated. Voltages are measured to chassis ground.

| # | Condition | Check | Result |
|---|---|---|---|
| M1 | Key off, headlights off, switch on | Does the yellow light? | |
| M2 | Key on, headlights off, switch on | Does the yellow light? | |
| M3 | Key on, headlights on (low), switch on | Does the yellow light? | |
| M4 | Projector white wire: factory low / factory high | Voltage on each | |
| M5 | Factory high-beam connector, each terminal: factory low / factory high | Voltage on each terminal (finds positive- vs ground-side switching) | |
| M6 | Flash-to-pass on the stalk, headlights off | Does the white flash? | |
| M7 | Each projector | Wire count and colours (low / high / ground) | |
| M8 | Inline fuse | Rating (A), distance from battery | |
| M9 | Engine idling, headlights high, switch on | Battery voltage | |

## What the results decide

| Question | From |
|---|---|
| One relay or two | P1, M4 |
| Low feed: permanent, key-switched or headlight-switched (battery drain risk) | M1–M3 |
| White fed through a relay or tapped straight off the factory high-beam wire | P6, M4 |
| How the factory high beam is switched | M5 |
| PASS covered | M6 |
| Fuse protection adequate | P3, M8 |
| Charging keeps up | M9 |
