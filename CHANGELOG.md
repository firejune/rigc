# Changelog

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
