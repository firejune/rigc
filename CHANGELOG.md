# Changelog

## [0.18.1](https://github.com/firejune/rigc/compare/v0.18.0...v0.18.1) (2026-09-05)


### Bug Fixes

* **compile:** the slider wrap guard tests both ends, and the line is past 360 ([#424](https://github.com/firejune/rigc/issues/424)) ([cc3a391](https://github.com/firejune/rigc/commit/cc3a39171a3c786b18c70a82645034b62358d348))
* **deformmeasure:** the artifact names the dial's property, the probe drives it, and the two are checked against each other ([#426](https://github.com/firejune/rigc/issues/426)) ([da8971d](https://github.com/firejune/rigc/commit/da8971d4ef0eacf2d8cbf949502ad07a96416001))

## [0.18.0](https://github.com/firejune/rigc/compare/v0.17.0...v0.18.0) (2026-09-05)


### Features

* **deform:** a transform key over a multi-bone attachment, pushed into each bind space ([#413](https://github.com/firejune/rigc/issues/413)) ([7eb0a32](https://github.com/firejune/rigc/commit/7eb0a32af271d3190fd32228e27c7b83f77ae575))
* **depth:** the turn ceiling says whether it is describing the form or the sheet's grain ([#416](https://github.com/firejune/rigc/issues/416)) ([f1d6a67](https://github.com/firejune/rigc/commit/f1d6a677347505ab2e7aa14cb47bdf6eb87d3d48))
* **gallery:** look — a face whose angle is a value, not a time ([#408](https://github.com/firejune/rigc/issues/408)) ([c2a79d6](https://github.com/firejune/rigc/commit/c2a79d683bc1ab03f53a9acdda21e143c0c2101d))
* **motion:** the animator's words, mapped to the constructs that carry them ([#397](https://github.com/firejune/rigc/issues/397)) ([2ae784f](https://github.com/firejune/rigc/commit/2ae784f8e406e24a67ce487fde354ca22e80a48d))
* **tools:** the editor round trip, promoted out of a scratch shell script ([#396](https://github.com/firejune/rigc/issues/396)) ([19266b5](https://github.com/firejune/rigc/commit/19266b54b03a54a5ab96e79aecb29c8c6b793155))
* **validate:** A40 — two sliders on one target, and the yaw axis that dies at 0° ([#405](https://github.com/firejune/rigc/issues/405)) ([a546b20](https://github.com/firejune/rigc/commit/a546b209fc5ce236684fdea4e67d516786b66a78))


### Bug Fixes

* **tools:** the round trip refuses the Spine trial by name, and says what it can still do ([#414](https://github.com/firejune/rigc/issues/414)) ([7467c1e](https://github.com/firejune/rigc/commit/7467c1e31e1a2ed14cea148f924a6802541800be))
* two claims the repository makes about itself, neither of them derived ([#394](https://github.com/firejune/rigc/issues/394)) ([e43aca9](https://github.com/firejune/rigc/commit/e43aca983a7e5623e97efbd7b3ba5d2d38faefc0))
* **validate:** a triangle that draws no pixels cannot draw them backwards ([#404](https://github.com/firejune/rigc/issues/404)) ([554bfbe](https://github.com/firejune/rigc/commit/554bfbe2c29388b0b74bb1e58187d83f6f899a6f))
* **validate:** A39 poses a slider-applied animation at the slider's own mapping ([#418](https://github.com/firejune/rigc/issues/418)) ([ae6be2a](https://github.com/firejune/rigc/commit/ae6be2a9c4526b4a141f73354b0e44335967891f))
* **validate:** A39 scans the span between keys, in closed form ([#409](https://github.com/firejune/rigc/issues/409)) ([7ebebc9](https://github.com/firejune/rigc/commit/7ebebc974f7429c74872436165a3037b06b2a42d))

## [0.17.0](https://github.com/firejune/rigc/compare/v0.16.0...v0.17.0) (2026-09-05)

**A part can state its own depth, and rigc will tell you how far it turns.**

Until now a 2.5D turn read one radius shared by a whole column of vertices — a
cylinder standing in for a surface. A generator can now name a **depth map**, and
`yaw`/`pitch` read a `z` per vertex off it. The lattice that carries those
vertices is **generated** rather than hand-numbered. A **painted mask** says
which region is soft, so a `physics` constraint answers an impact over exactly
that area. And `build` and `explain` now print the **turn ceiling**: the largest
angle this geometry on this sheet takes before a triangle reverses, per axis and
per direction, naming the triangle that goes first.

That last one changes the loop. The angle was previously found by writing a key,
building, reading `A39`'s refusal and guessing again; it is closed form —
`tan t = A₀/A_axis` — and the compiler now says it up front.

### Features

* **deform:** a depth map gives every vertex its own z, and yaw/pitch read it ([#383](https://github.com/firejune/rigc/issues/383)) ([e0371e8](https://github.com/firejune/rigc/commit/e0371e899feb279dd46c8348ddaa74845bdb62d0)), closes [#382](https://github.com/firejune/rigc/issues/382)
* **mesh:** a `grid` generator, so the lattice stops being hand-numbered ([#386](https://github.com/firejune/rigc/issues/386)) ([b0ec75a](https://github.com/firejune/rigc/commit/b0ec75a8e24cbf2f11754874fa498a79846e5574)), closes [#382](https://github.com/firejune/rigc/issues/382)
* **depth:** a painted mask marks a soft region, and a physics constraint on its bone answers an impact over it ([#390](https://github.com/firejune/rigc/issues/390), [#391](https://github.com/firejune/rigc/issues/391)) ([843aad4](https://github.com/firejune/rigc/commit/843aad49fd44d54a0b000851df9301ea4955ac08))
* **depth:** report the turn a sheet supports, before a key is written ([#393](https://github.com/firejune/rigc/issues/393)) ([cc79286](https://github.com/firejune/rigc/commit/cc7928635673795e98c1089f83fa8e35543555a0))
* **docs:** `FACE.md` §2.2 and `AUTHORING.md` §3.4 — the fold angle belongs to the depth map's steepest slope, not to the mesh density ([#392](https://github.com/firejune/rigc/issues/392)) ([e409077](https://github.com/firejune/rigc/commit/e409077))

### The one rule to read before using any of it

**The angle a part can turn through is a property of its depth map, not of how
finely it is meshed** — approximately `1 / max|dz/du|`, the reciprocal of the
sheet's steepest slope. Refining a lattice does not lower the ceiling; it finds
slopes that were always there. A map that reaches its floor with a *vertical*
edge — a dome, a hemisphere, anything traced straight off a rendered normal —
folds at any angle you like once it is meshed finely enough, while a map whose
slope is bounded holds the same angle at every density. Measured over a 1,300×
range of vertex counts: 62° → 14° for the first, a steady 63–64° for the second.

So a ceiling you cannot live with is fixed by editing the **sheet**, not the
mesh. rigc will not flatten a map for you; a depth map is a measurement, and the
compiler never invents a value that is not in the spec.

### What this release does not do

* **None of it has met real art.** Every figure quoted for the depth work was
  measured on generated fixtures — analytic ramps, domes and checkerboard blobs.
* **The angle and the jiggle cannot ride one attachment yet.** A mesh carried by
  a soft-region bone has two influences on some vertices, and a `transform` key
  needs one bind space, so per part it is one or the other
  ([#389](https://github.com/firejune/rigc/issues/389)).
* **A dense mesh is a large file.** 449 bytes per vertex, plus ~1.77 MB per
  deform key at 32,761 vertices. The gate itself stays linear and green to
  64,800 triangles; the artifact is what grows.

### Bug Fixes

* ignore scratch as a path, not only as a directory ([#385](https://github.com/firejune/rigc/issues/385)) ([87bb21f](https://github.com/firejune/rigc/commit/87bb21febd6ce80086d34e97ac0413abc093f771)) — repository housekeeping, no effect on the published package

### Withdrawn inside this release

Two commits in the log add things that **do not exist in 0.17.0**. They were
built and taken back out before release, and are listed here only so a reader of
the commit history is not left looking for them:

* `parallax` as a deform kind ([#388](https://github.com/firejune/rigc/issues/388), removed in [#391](https://github.com/firejune/rigc/issues/391)) — it was a `yaw` with a term dropped, and baking a pointer-driven value into time keys is a category error. Parallax is camera work and belongs to whatever draws the result.
* a soft region chosen by a **depth threshold** ([#390](https://github.com/firejune/rigc/issues/390), replaced in [#391](https://github.com/firejune/rigc/issues/391)) — softness is not prominence. The most prominent thing on a face is the nose, and a nose does not wobble. The region is painted now.

## [0.16.0](https://github.com/firejune/rigc/compare/v0.15.0...v0.16.0) (2026-09-04)


### Features

* **compile:** a curve on a hold segment is emitted stepped, as the editor writes it ([#376](https://github.com/firejune/rigc/issues/376)) ([04d6f27](https://github.com/firejune/rigc/commit/04d6f27e0341cae6fc14da86739b251280e63e37))
* **compile:** derive a mesh's hull and edges from its triangles and its size from the PNG ([#375](https://github.com/firejune/rigc/issues/375)) ([c62a432](https://github.com/firejune/rigc/commit/c62a432ac6ba9bd11ec28c79a6e9b43e6635db90))
* **emit:** write skeleton.images so the editor finds the parts on import ([#378](https://github.com/firejune/rigc/issues/378)) ([dc16bf1](https://github.com/firejune/rigc/commit/dc16bf12c65bd38434ee03bd332310c6512b77cc))
* **skills:** package the authoring guides as an installable agent plugin ([#371](https://github.com/firejune/rigc/issues/371)) ([9030d5d](https://github.com/firejune/rigc/commit/9030d5d30c93b90cf6502d8aef0d012d9b453412))

## [0.15.0](https://github.com/firejune/rigc/compare/v0.14.1...v0.15.0) (2026-09-03)


### Features

* **gallery:** nod, a sixth example where each mesh is built for the model that bends it ([#353](https://github.com/firejune/rigc/issues/353)) ([fc82e5c](https://github.com/firejune/rigc/commit/fc82e5c12ccb4992205520d786b88b66cea3d93a)), closes [#343](https://github.com/firejune/rigc/issues/343)
* **pack:** a pack gates under spine-html, spilled pages shrink, and PK05's last bit is attributed ([#354](https://github.com/firejune/rigc/issues/354)) ([1168b78](https://github.com/firejune/rigc/commit/1168b78c687128275cf0c157df4094fa9495a643)), closes [#266](https://github.com/firejune/rigc/issues/266)


### Bug Fixes

* **compile:** refuse a deform transform whose evaluation is an all-zero run ([#355](https://github.com/firejune/rigc/issues/355)) ([717888a](https://github.com/firejune/rigc/commit/717888ad5240869b3e9456a35d0b1801561eda07)), closes [#350](https://github.com/firejune/rigc/issues/350)
* **gallery:** loop_seam refuses a reading whose last frame is not at the duration ([#346](https://github.com/firejune/rigc/issues/346)) ([928b91f](https://github.com/firejune/rigc/commit/928b91ff8f7ae0a762ce27cae1b5ec7b402ebd64)), closes [#337](https://github.com/firejune/rigc/issues/337)

## [0.14.1](https://github.com/firejune/rigc/compare/v0.14.0...v0.14.1) (2026-09-03)


### Bug Fixes

* **ci:** fetch-examples absorbs connection blips with a bounded retry ([#341](https://github.com/firejune/rigc/issues/341)) ([5ebb47e](https://github.com/firejune/rigc/commit/5ebb47e7528eab1d24180f59397c39e9e3fec7c9)), closes [#335](https://github.com/firejune/rigc/issues/335)
* **cli:** register --all-bones as the boolean flag it is documented as ([#338](https://github.com/firejune/rigc/issues/338)) ([6cde010](https://github.com/firejune/rigc/commit/6cde010d0536af50454143a4113d77de628759c5)), closes [#328](https://github.com/firejune/rigc/issues/328)


### Instrument

* **chainfit:** the inward step — two anchored descendants determine the bone between them ([#331](https://github.com/firejune/rigc/issues/331)) ([e0f61a0](https://github.com/firejune/rigc/commit/e0f61a091fd09d340d53db7b96fe1cc4930f4851)), closes [#326](https://github.com/firejune/rigc/issues/326)

## [0.14.0](https://github.com/firejune/rigc/compare/v0.13.0...v0.14.0) (2026-09-03)


### Features

* **motion:** a deform key can state its transform instead of its table ([#317](https://github.com/firejune/rigc/issues/317)) ([3c13d7e](https://github.com/firejune/rigc/commit/3c13d7eef8ba4909f631453d61a363e6b1b3dd01)), closes [#294](https://github.com/firejune/rigc/issues/294)
* **motion:** a group track can key a value per member, stated or derived ([#320](https://github.com/firejune/rigc/issues/320)) ([1313b20](https://github.com/firejune/rigc/commit/1313b20189ed06f62ff4a8c9b6441e227afbc466)), closes [#295](https://github.com/firejune/rigc/issues/295)


### Bug Fixes

* **compile:** the motion spec is parsed rather than cast ([#321](https://github.com/firejune/rigc/issues/321)) ([3e7238a](https://github.com/firejune/rigc/commit/3e7238a30886633f1a7e328c84d3e3109c6384d2)), closes [#307](https://github.com/firejune/rigc/issues/307)
* **gallery:** flex's leaf no longer folds, and its exemption is gone ([#318](https://github.com/firejune/rigc/issues/318)) ([fed3ba5](https://github.com/firejune/rigc/commit/fed3ba5bb79380a9b392cf07dc8c809b9bed6f71)), closes [#313](https://github.com/firejune/rigc/issues/313)
* **pose:** the objective interpolates premultiplied, with a stated re-baseline ([#322](https://github.com/firejune/rigc/issues/322)) ([6c00c51](https://github.com/firejune/rigc/commit/6c00c51d720ace9707a67685c2767ce79c50af5f)), closes [#306](https://github.com/firejune/rigc/issues/306)


### Instrument

* **explain:** a per-key DEFORM block, so a deform key's ratios are printed rather than derived ([#319](https://github.com/firejune/rigc/issues/319)) ([aa31aae](https://github.com/firejune/rigc/commit/aa31aae60547d1b6fedb4e83bf37587b634e2f23))
* **validate:** A39_DEFORM_KEEPS_TRIANGLE_WINDING — a deform key may not turn a triangle inside out ([#314](https://github.com/firejune/rigc/issues/314)) ([eec1e60](https://github.com/firejune/rigc/commit/eec1e602056e6e6ae82048ab4304018a35d2fa5f)), closes [#296](https://github.com/firejune/rigc/issues/296)

## [0.13.0](https://github.com/firejune/rigc/compare/v0.12.0...v0.13.0) (2026-09-03)


### Features

* **gallery:** portrait — a 2.5D head turn built from authored deform keys ([#297](https://github.com/firejune/rigc/issues/297)) ([6697308](https://github.com/firejune/rigc/commit/669730845fe623bdb1ccb60b052f982be15f8ec2))


### Bug Fixes

* **compile:** refuse a `setup` entry that is not an object, by name ([#303](https://github.com/firejune/rigc/issues/303)) ([cc53b55](https://github.com/firejune/rigc/commit/cc53b55a37df714cd3774cceb37280190c294199)), closes [#293](https://github.com/firejune/rigc/issues/293)
* **pkg:** ship docs/FACE.md in the npm package ([#302](https://github.com/firejune/rigc/issues/302)) ([fc9f13f](https://github.com/firejune/rigc/commit/fc9f13fa25287e7d3740f143416c3e4fcdcb700a))
* **render:** interpolate premultiplied so a region edge draws no dark rim ([#301](https://github.com/firejune/rigc/issues/301)) ([c7dfe81](https://github.com/firejune/rigc/commit/c7dfe8196c8214e86c05242ac22a7953b4b1b41b)), closes [#292](https://github.com/firejune/rigc/issues/292)

## [0.12.0](https://github.com/firejune/rigc/compare/v0.11.0...v0.12.0) (2026-09-03)


### Features

* **cli:** rigc chainfit — occlusion-aware chain fitting ([#290](https://github.com/firejune/rigc/issues/290)) ([d488154](https://github.com/firejune/rigc/commit/d4881548affd969669a65a106bcb13938cdb7712))


### Bug Fixes

* **chainfit:** the relocation fallback keeps the seed instead of resetting the hinge ([#287](https://github.com/firejune/rigc/issues/287)) ([5d00e4f](https://github.com/firejune/rigc/commit/5d00e4f3f9e5268ce5e24cf27721ac877a132939))

## [0.11.0](https://github.com/firejune/rigc/compare/v0.10.0...v0.11.0) (2026-09-02)


### Features

* **gallery:** ride and flex — a path constraint carries a rider, and a contour mesh is the art ([#276](https://github.com/firejune/rigc/issues/276)) ([be484e1](https://github.com/firejune/rigc/commit/be484e1f0ddbdc0b0e0ea2147fc2def9ead51e23))


### Bug Fixes

* four gallery dogfood findings in the compiler and the mesh report ([#280](https://github.com/firejune/rigc/issues/280)) ([101ab83](https://github.com/firejune/rigc/commit/101ab83b572507c7438223dbbd4c43b6571e7112))
* **render:** correct the Quad corner-order comment (bl, ul, ur, br) ([#283](https://github.com/firejune/rigc/issues/283)) ([3afb7d8](https://github.com/firejune/rigc/commit/3afb7d8b98ee254f4bacb34f77550ba0212d8547))

## [0.10.0](https://github.com/firejune/rigc/compare/v0.9.0...v0.10.0) (2026-09-02)


### Features

* **bench:** three reported instruments — mesh edges, key density, stage-3 pose distance ([#269](https://github.com/firejune/rigc/issues/269)) ([02b838e](https://github.com/firejune/rigc/commit/02b838e3efdd2cf9d0bb8eda981edde4118c092f))
* **emitter:** atlas packer and importer — parts onto shared pages, and a pack as an input ([#263](https://github.com/firejune/rigc/issues/263)) ([28bf37f](https://github.com/firejune/rigc/commit/28bf37ff8034d56c46296efcfb562f4c8569638f))


### Bug Fixes

* **emitter:** the two INGEST findings — an imported page's scale:, and A35's deform-run parity ([#272](https://github.com/firejune/rigc/issues/272)) ([a89a450](https://github.com/firejune/rigc/commit/a89a4507048e1d3f347efe352d368a1469e69596))

## [0.9.0](https://github.com/firejune/rigc/compare/v0.8.1...v0.9.0) (2026-09-02)


### Features

* **emitter:** contour mesh generator — trace a part's own alpha and triangulate it ([#251](https://github.com/firejune/rigc/issues/251)) ([3127d13](https://github.com/firejune/rigc/commit/3127d13d9dee8857c8def405fd908eac3f76c5ee)), closes [#6](https://github.com/firejune/rigc/issues/6) [#1](https://github.com/firejune/rigc/issues/1)
* **rig:** path and slider constraints, path attachments, and per-skin member lists ([#253](https://github.com/firejune/rigc/issues/253)) ([cb7376f](https://github.com/firejune/rigc/commit/cb7376fd9e2ac1569f2a775119d02fd4a9a22a06))


### Bug Fixes

* **check:** attribute the texture floor, substitute texture only, and stop the extent test punishing a silhouette ([#254](https://github.com/firejune/rigc/issues/254)) ([ad7aec4](https://github.com/firejune/rigc/commit/ad7aec4248b8c73412e605336ed98a0a8a8c2e86))

## [0.8.1](https://github.com/firejune/rigc/compare/v0.8.0...v0.8.1) (2026-09-02)


### Bug Fixes

* **packaging:** ship the remaining tools/ files (contact, png_probe, measure_contact_depth) ([#249](https://github.com/firejune/rigc/issues/249)) ([cc00c99](https://github.com/firejune/rigc/commit/cc00c996ec633e168f56f0158ae467246fc82d84))

## [0.8.0](https://github.com/firejune/rigc/compare/v0.7.0...v0.8.0) (2026-09-02)


### Features

* **cli:** rigc pose — read each part's rigid placement out of a pose frame ([#243](https://github.com/firejune/rigc/issues/243)) ([1a10489](https://github.com/firejune/rigc/commit/1a104894b42e485dbdcbe35fc4566945ca264a81)), closes [#241](https://github.com/firejune/rigc/issues/241)

## [0.7.0](https://github.com/firejune/rigc/compare/v0.6.0...v0.7.0) (2026-08-29)


### Features

* **cli:** rigc vote — the A/B ballot and its append-only vote ledger ([#232](https://github.com/firejune/rigc/issues/232)) ([126fe8f](https://github.com/firejune/rigc/commit/126fe8ff4fb73c4cd89635693cb0a8889c7417e3))
* **emitter:** key IK, transform and deform timelines from the motion spec ([#233](https://github.com/firejune/rigc/issues/233)) ([da7366e](https://github.com/firejune/rigc/commit/da7366e8f9632e6d4c80ca11b76b23f16e024336)), closes [#87](https://github.com/firejune/rigc/issues/87) [#88](https://github.com/firejune/rigc/issues/88) [#89](https://github.com/firejune/rigc/issues/89)


### Bug Fixes

* **deps:** refresh bun.lock to match package.json typescript range ([#237](https://github.com/firejune/rigc/issues/237)) ([565666c](https://github.com/firejune/rigc/commit/565666cddae00dc5cb25a60e639463bfb7bccf46))

## [0.6.0](https://github.com/firejune/rigc/compare/v0.5.0...v0.6.0) (2026-08-29)


### Features

* **cli:** add --copy-images to make build --out self-contained ([#224](https://github.com/firejune/rigc/issues/224)) ([efeda1a](https://github.com/firejune/rigc/commit/efeda1a04b8240e493d6609c2377480cc0e3b28e)), closes [#217](https://github.com/firejune/rigc/issues/217)
* **cli:** default --profile is now spine ([#231](https://github.com/firejune/rigc/issues/231)) ([b430413](https://github.com/firejune/rigc/commit/b430413e23c5b61f81d299c4ab6f92d831222fda)), closes [#221](https://github.com/firejune/rigc/issues/221)
* **cli:** ergonomics batch, and name the file behind an error ([#227](https://github.com/firejune/rigc/issues/227)) ([d3e8966](https://github.com/firejune/rigc/commit/d3e89662cf09bd634a0666eb5f3c02416d582ef7)), closes [#218](https://github.com/firejune/rigc/issues/218) [#219](https://github.com/firejune/rigc/issues/219)
* **cli:** rigc render and rigc preview — a user-facing way to see the rig ([#230](https://github.com/firejune/rigc/issues/230)) ([79ab6b3](https://github.com/firejune/rigc/commit/79ab6b3f9cb2d18934d480dadb9d363ab123a3f9))


### Bug Fixes

* **cli:** explain the Bun requirement at the point of failure ([#228](https://github.com/firejune/rigc/issues/228)) ([5a194b2](https://github.com/firejune/rigc/commit/5a194b21fc920a7b7147e649f1b62d2b0912567b)), closes [#220](https://github.com/firejune/rigc/issues/220)
* **validate:** A19 accepts PNGs whose transparency lives in tRNS ([#223](https://github.com/firejune/rigc/issues/223)) ([5083c5b](https://github.com/firejune/rigc/commit/5083c5bf9090378e0c28f961736eefbc047715cb)), closes [#215](https://github.com/firejune/rigc/issues/215)

## [0.5.0](https://github.com/firejune/rigc/compare/v0.4.0...v0.5.0) (2026-08-28)


### Features

* **ladder:** the ladder is complete — spineboy clears the graduation exam ([#209](https://github.com/firejune/rigc/issues/209)) ([32b9753](https://github.com/firejune/rigc/commit/32b97534f74c8b1565cf8452e1aa0800151e0d3b))

## [0.4.0](https://github.com/firejune/rigc/compare/v0.3.0...v0.4.0) (2026-08-26)


### Features

* **bench:** rung 1 re-authored — the frame-change clause clears on both rates ([#172](https://github.com/firejune/rigc/issues/172)) ([ae610bf](https://github.com/firejune/rigc/commit/ae610bfdeaf1e18a352c6d183a1ab69df393c2a2))
* **bench:** rung 3 re-authored — the frame-change clause clears on both shots ([#170](https://github.com/firejune/rigc/issues/170)) ([71d81de](https://github.com/firejune/rigc/commit/71d81de812263560a10664724512a95fbae02628))
* **bench:** rung 4 re-authored from brief revision 3 — the sheet clause clears on all three shots ([#175](https://github.com/firejune/rigc/issues/175)) ([c32c824](https://github.com/firejune/rigc/commit/c32c82400566b36c745818a1a5ef9ccf223c3705))
* **bench:** rung 5 re-authored from brief revision 3 — the frame-change clause clears on both shots ([#173](https://github.com/firejune/rigc/issues/173)) ([e3a9d15](https://github.com/firejune/rigc/commit/e3a9d15adc264d191073f1953d7e9a7521af80e3))
* **bench:** rung 7's local-only render exception, and its first brief ([#168](https://github.com/firejune/rigc/issues/168)) ([c70fba7](https://github.com/firejune/rigc/commit/c70fba7177aa23498294c67e408cb3b3d0dde051))


### Bug Fixes

* **bench:** make the stored rung-5 atlas loadable from a clone ([#183](https://github.com/firejune/rigc/issues/183)) ([efb6f3f](https://github.com/firejune/rigc/commit/efb6f3f5d42b4bdf1b7e10b056254ef2db2ba5b4)), closes [#181](https://github.com/firejune/rigc/issues/181)
* **release:** give the check: commit type a changelog section ([#182](https://github.com/firejune/rigc/issues/182)) ([2a865bb](https://github.com/firejune/rigc/commit/2a865bbd90bc4068fe149b630d608f44861b2487)), closes [#163](https://github.com/firejune/rigc/issues/163)


### Instrument

* the three instrument fixes — an MAE-refined framing pass, contact sheets, and blobs that are not parts ([#159](https://github.com/firejune/rigc/issues/159)) ([d850a4e](https://github.com/firejune/rigc/commit/d850a4ed82090fc61f06b464d7c26bff2c542a80))

## [0.3.0](https://github.com/firejune/rigc/compare/v0.2.1...v0.3.0) (2026-08-24)


### Features

* **attachments:** emit bounding box and clipping attachments ([#86](https://github.com/firejune/rigc/issues/86)) ([0437320](https://github.com/firejune/rigc/commit/0437320f6c73d85ed9f0b257bca59defcfb0b033))
* **bench:** author the spineboy ess rung, third attempt ([#136](https://github.com/firejune/rigc/issues/136)) ([53acfe7](https://github.com/firejune/rigc/commit/53acfe725e02faba041f5eb3a1a7f4ed3be74e62))
* **check:** attribute drift and MAE to the candidate's own bone chains ([#130](https://github.com/firejune/rigc/issues/130)) ([7c6e318](https://github.com/firejune/rigc/commit/7c6e318f6b4eaa1cc7f58fbce8307fb90f25187a))
* **check:** report the MAE over the reference's own pixels, and warn on overdraw ([#125](https://github.com/firejune/rigc/issues/125)) ([83fa2cd](https://github.com/firejune/rigc/commit/83fa2cd63ad8426e63e01fd1c314ae62243b567f))
* **events:** declare events in the rig spec and fire them from the motion spec ([#84](https://github.com/firejune/rigc/issues/84)) ([ee11b34](https://github.com/firejune/rigc/commit/ee11b346b8765415ae82c3d47cb1c7c4299e2113))
* **viewer:** play a bench run beside its reference frames ([#129](https://github.com/firejune/rigc/issues/129)) ([a994981](https://github.com/firejune/rigc/commit/a99498121d5a65ae43e8a6ea17094ddf99aee785))


### Bug Fixes

* **bench:** stop copying the rung's gate string into bench.json ([#144](https://github.com/firejune/rigc/issues/144)) ([89f2bc6](https://github.com/firejune/rigc/commit/89f2bc6b77332b6997036f5db67d11bedeccf8ba)), closes [#137](https://github.com/firejune/rigc/issues/137)
* **check:** decide the framing per frame set, not once over the whole root ([#108](https://github.com/firejune/rigc/issues/108)) ([9e1da21](https://github.com/firejune/rigc/commit/9e1da210ce367fc3f2a9469e5a6212d199622db6)), closes [#100](https://github.com/firejune/rigc/issues/100)
* **compile:** round key times down onto the emit grid, never to nearest ([#107](https://github.com/firejune/rigc/issues/107)) ([7caf24e](https://github.com/firejune/rigc/commit/7caf24e57e41ca37ac4be4c0450c495b1117a447)), closes [#99](https://github.com/firejune/rigc/issues/99)

## [0.2.1](https://github.com/firejune/rigc/compare/v0.2.0...v0.2.1) (2026-08-23)


### Bug Fixes

* **package:** publish as spine-rigc — npm refuses rigc as too similar to rc ([#71](https://github.com/firejune/rigc/issues/71)) ([f80fcef](https://github.com/firejune/rigc/commit/f80fcefe7943724ecdca63b36e14c29251c1c3fa))

## [0.2.0](https://github.com/firejune/rigc/compare/v0.1.0...v0.2.0) (2026-08-23)


### Features

* **bench:** rung 6 briefed — frames, brief, verification pass ([#43](https://github.com/firejune/rigc/issues/43)) ([cbd1469](https://github.com/firejune/rigc/commit/cbd1469c4c7a1aad714a2167a089ec56dcfe00ea))
* **bench:** rung 6 transcribed — expressiveness proof ([#48](https://github.com/firejune/rigc/issues/48)) ([7c4e35f](https://github.com/firejune/rigc/commit/7c4e35f5f0ab147f8ff3230aaae980a0fc47fd75))
* **check:** report per-frame change fidelity ([#65](https://github.com/firejune/rigc/issues/65)) ([8ecb1c7](https://github.com/firejune/rigc/commit/8ecb1c7aa29c4126d6d1c3047e19def200d3ba9e)), closes [#53](https://github.com/firejune/rigc/issues/53)
* **diff:** name-agnostic section figures for bones and slots ([#60](https://github.com/firejune/rigc/issues/60)) ([05ca3fa](https://github.com/firejune/rigc/commit/05ca3faaee396158f3774d9abf12625226e1770a))
* **render:** rasterise mesh attachments through spine-core world vertices ([#42](https://github.com/firejune/rigc/issues/42)) ([96fe043](https://github.com/firejune/rigc/commit/96fe043259114500f5163040744d93170220c6bf)), closes [#27](https://github.com/firejune/rigc/issues/27)
* **rig:** carry a bone's editor icon through to the skeleton ([#66](https://github.com/firejune/rigc/issues/66)) ([754d3ab](https://github.com/firejune/rigc/commit/754d3ab6fc32e74a91045cb81923984f2e904a0b)), closes [#47](https://github.com/firejune/rigc/issues/47)


### Bug Fixes

* **check:** frame the candidate by its drawn pixels, not by quad corners ([#39](https://github.com/firejune/rigc/issues/39)) ([87ce9bf](https://github.com/firejune/rigc/commit/87ce9bf64d659a5c00cfef0808a762ebddeafd98)), closes [#34](https://github.com/firejune/rigc/issues/34)
* **check:** use the frames' own box when the candidate is measured into it ([#64](https://github.com/firejune/rigc/issues/64)) ([26e8fc6](https://github.com/firejune/rigc/commit/26e8fc6412731ef68eb9755270f16adf2c3b0bb0)), closes [#52](https://github.com/firejune/rigc/issues/52)
* **compile:** refuse a key time past the animation's declared duration ([#61](https://github.com/firejune/rigc/issues/61)) ([7f67928](https://github.com/firejune/rigc/commit/7f67928e5a39ec92037b64aeb6f799a2faecf8ff)), closes [#54](https://github.com/firejune/rigc/issues/54)
* **rig:** authored mesh vertices bind bones by name; generator-topology assertions skip authored meshes ([#50](https://github.com/firejune/rigc/issues/50)) ([da2072d](https://github.com/firejune/rigc/commit/da2072da197618530253d378d6b178032e55b0ec))
