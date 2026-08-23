# Changelog

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
