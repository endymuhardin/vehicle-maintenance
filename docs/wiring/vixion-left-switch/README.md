# Installing the V-ixion 3C1 left switch on an All New Vixion

Fits the 2007 V-ixion (3C1) left handlebar switch to an All New Vixion
(R15 V3 platform) while keeping the bike-side harness stock. Every splice is
on the switch side, between the 3C1 wires and replacement plugs that mate
with the bike's connectors.

The light switch stays at ON permanently. On this bike the headlamp is fed Br
from the main harness, and the ECU switches the low beam on its ground side
(Y/B), so the low beam is always on and the left switch only adds the high
beam. The 3C1 high/low switch gets power only through the light switch's ON
contact, inside the housing, so ON is the only position where high beam works.

## 1. Bike-side connectors

Every position below is as seen from the **mating face** (the side that plugs
into the switch), latch on top.

![4-pin and 3-pin plug layout](plug-layout.svg)

### 4-pin

| Position | Wire colour | Code | Function |
|---|---|---|---|
| Top-left | pink | P | Horn. The horn's other terminal is on Br, and the switch grounds P. |
| Top-right | brown | Br | 12 V (ignition) for high beam and PASS |
| Bottom-left | red/black | R/B | Clutch switch signal (starter safety). Not a ground. |
| Bottom-right | brown | Br | 12 V, same supply as top-right |

Measured with the ignition off and the horn connected:

| Pair | Reading |
|---|---|
| Br–Br | beep (≈ 0 Ω) |
| P–Br | 4 Ω (horn coil) |
| R/B–Br | 1.3 MΩ (open) |

### 3-pin

| Position | Wire colour | Code | Function |
|---|---|---|---|
| Left | green | Dg | Right turn signal |
| Middle | black | B/W | Clutch switch ground (through the ECU) |
| Right | brown | Ch | Left turn signal |

Measured: B/W to frame gives a delayed beep, since it grounds through the ECU.

### Bullets (male on the bike side)

| Wire colour | Code | Function |
|---|---|---|
| yellow | Y | High beam |
| brown/white | Br/W | 12 V from the flasher |
| black | B | Horn ground (chassis) |

## 2. Stock switch vs 3C1 switch

Both diagrams use the same bike-side pin positions.

![Stock switch to bike-side plugs](stock-switch-to-bike.svg)

![3C1 switch to bike-side plugs](old-switch-to-bike.svg)

| Function | Stock ANV switch | 3C1 switch |
|---|---|---|
| High beam | HI: Br→Y | ON + HI: Br→Y |
| Low beam | no output (always on) | ON + LO: Br→G (not used) |
| PASS | Br→Y (its own Br wire) | Br→Y (same Br), any light-switch position |
| Small light | none | Br→L (not used) |
| Horn | P→B | P→B |
| Turn signals | Br/W→Ch / Dg | Br/W→Ch / Dg |
| Clutch switch | R/B→B/W | own wire pair → R/B, B/W |

The 3C1 has one Br wire for both HI and PASS, so one of the two Br
pigtails on the replacement plug goes unused. Its terminal stays in the
cavity; only its wire end is sealed.

## 3. Parts and tools

| Item | Note |
|---|---|
| Replacement 4-pin and 3-pin plugs, with pigtails | must mate with the bike's plugs; pigtail colours don't matter |
| 3 female bullet terminals (≈ 4 mm) with sleeves | for Y, Br/W and B; "terminal peluru betina" |
| Multimeter with continuity beep | |
| Soldering iron (40–60 W), rosin-core 60/40 or 63/37 solder | |
| Heat shrink and hot glue | the glue seals single-wall heat shrink |
| Masking tape and a pen | to tag wires |

## 4. Identify the wires

### 3C1 switch wires

Continuity between the bare wire ends, switch unplugged.

| Action | Pair | Beep |
|---|---|---|
| Nothing pressed | each pair below | no |
| Horn | pink–black | yes |
| ON + HI | light brown–yellow | yes |
| ON + LO | light brown–yellow | no |
| PASS (any position) | light brown–yellow | yes |
| Left signal | brown/white–dark brown | yes |
| Right signal | brown/white–dark green | yes |
| Clutch lever pulled / released | clutch wire pair | yes / no |

The 3C1 black wire splits into two branches near the plug (the old headlight
ground). Both branches are the horn ground. Use one and trim the other.

Tag each wire with its code.

### Replacement plug pigtails

Pigtail colours are arbitrary. Hold each replacement plug with its mating face
toward you, latch on top, and beep each cavity's terminal to the loose wires.
The replacement plug's mating face is the mirror image of the bike's:

| Plug | Position (replacement plug, mating face) | Mates with |
|---|---|---|
| 4-pin | Top-left | Br |
| 4-pin | Top-right | P |
| 4-pin | Bottom-left | Br |
| 4-pin | Bottom-right | R/B |
| 3-pin | Left | Ch |
| 3-pin | Middle | B/W |
| 3-pin | Right | Dg |

Tag each pigtail with the code it mates with.

## 5. Splicing sequence

The order runs from easiest and lowest risk (unused wires, signals, lights) to
the 12 V feed and the starter-safety pair last.

For each row:

1. Slide heat shrink onto one wire.
2. Twist the two ends together using the inline mesh (step 6).
3. Do the beep check with the joint twisted but not yet soldered.
4. Solder only if it beeps as expected.

| Step | 3C1 wire | Function | Connect to | Probe 1 | Probe 2 | Operate | Beep when |
|---|---|---|---|---|---|---|---|
| 1 | blue (L) | small light | nothing: insulate the end | – | – | – | – |
| 2 | green (G) | low beam | nothing: insulate the end | – | – | – | – |
| 3 | dark brown (Ch) | left signal | 3-pin, left position (Ch pigtail) | dark brown | brown/white | turn switch | at L; no beep at centre or R |
| 4 | dark green (Dg) | right signal | 3-pin, right position (Dg pigtail) | dark green | brown/white | turn switch | at R; no beep at centre or L |
| 5 | brown/white (Br/W) | flasher 12 V | female bullet | brown/white | dark brown | turn switch | at L; no beep at centre |
| 6 | yellow (Y) | high beam | female bullet | yellow | light brown | PASS button | while pressed; no beep released (high/low at LO) |
| 7 | pink (P) | horn | 4-pin, top-right position (P pigtail) | pink | black (the branch you keep) | horn button | while pressed; no beep released |
| 8 | black, one branch (B) | horn ground | female bullet; trim the other branch and insulate it | black | pink | horn button | while pressed; no beep released |
| 9 | light brown (Br) | 12 V for high beam and PASS | 4-pin, top-left position (Br pigtail). Bottom-left Br pigtail: leave the terminal in, cut the pigtail to 2–3 cm and seal the end (live 12 V) | light brown | yellow | PASS button, then light switch at ON + high/low | PASS pressed; also ON + HI. No beep at ON + LO with PASS released |
| 10 | clutch wire 2 | clutch ground | 3-pin, middle position (B/W pigtail) | clutch wire 2 | clutch wire 1 | clutch lever | lever pulled; no beep released |
| 11 | clutch wire 1 | starter safety | 4-pin, bottom-right position (R/B pigtail) | clutch wire 1 | clutch wire 2 | clutch lever | lever pulled; no beep released |

Probes go on the bare copper of the 3C1 switch wires. A wire that is already
twisted to its pigtail is probed at the joint. The pigtail-to-cavity mapping
was checked in section 4, so the plug terminals aren't probed here.

Positions refer to the replacement plug, mating face toward you, latch on top.

The replacement plug is mirrored: Ch sits on its left and Dg on its right.
On the bike side they're the other way round.

The two clutch wires are interchangeable, as are the two Br cavities.

### Final isolation check (before plugging in)

Nothing pressed, light switch at ON, high/low at LO, turn switch centred,
clutch released:

| Pair | Beep |
|---|---|
| any two of: Br, P, R/B, Ch, B/W, Dg terminals, Y, Br/W, B bullets | no |
| R/B ↔ B bullet, horn pressed | no |
| R/B ↔ anything, lever released | no |

## 6. Soldering

| Step | Action |
|---|---|
| 1 | Strip about 10 mm of bright copper on each end. |
| 2 | Fan the strands slightly, push the ends into each other, and twist them flat along the wire (inline mesh). |
| 3 | Do the beep check from step 5. |
| 4 | Iron at 330–350 °C with a tinned tip. Heat the joint from below and feed solder from above until it soaks through, about 2–3 s. |
| 5 | Hold still until it sets. The joint should be shiny with the strands still visible; a dull or blobbed joint needs redoing. |
| 6 | Put a dab of hot glue on the joint, slide the heat shrink over and shrink it until glue squeezes out at both ends. |
| 7 | Stagger the joints 2–3 cm apart. Wrap the bundle and cable-tie it so the joints don't flex. |

## 7. Test on the bike

| Test | Expected |
|---|---|
| Horn, any gear, clutch released, any light-switch position | sounds |
| PASS, any light-switch position | high beam flashes |
| Light switch ON, HI | high beam on |
| Signal left / right | correct side blinks |
| In gear, clutch released, press start | does not crank |
| In gear, clutch pulled, press start | cranks |
| Handlebar lock to lock, engine running | horn, signals and lights don't cut out |

## Notes

- R/B carries only the clutch switch. No ground wire goes there.
- The horn ground goes to the B bullet, not to B/W (the ECU's ground).
- Switchable headlight (not done): route the headlamp's Br through the 3C1
  light switch with an adapter at the 6-pin headlamp plug. OFF would then kill
  the whole headlamp, including the position light. Daytime headlight is
  mandatory under UU 22/2009 Pasal 107(2).

## References

Local copies are in `refs/`, which is gitignored (copyrighted material).
Photos of the bike-side plugs are in `photos/`.

- Yamaha V-ixion 3C1 service manual (3C1-F8197), p. 8-57 and the wiring diagram: [ManualsLib](https://www.manualslib.com/manual/1210149/Yamaha-V-Ixion.html)
- Yamaha YZF155 2019 (B2P1) electric diagram: [pdfcoffee](https://pdfcoffee.com/wiring-r15-v3-pdf-free.html)
- 3C1 switch wire colours: [i&a channel, T9wMZdShkFc](https://www.youtube.com/watch?v=T9wMZdShkFc)
- R15 V3 stock switch colours: [Lukman1002, tnLK5tPQGH8](https://www.youtube.com/watch?v=tnLK5tPQGH8)
