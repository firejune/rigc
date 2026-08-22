// bench/count_features.ts
//
// Measures which parts of the Spine 4.3 export format the official example
// projects actually use, so the benchmark ladder is ordered by what the rungs
// need rather than by the spec's alphabet. Reads every skeleton JSON and .atlas
// under examples/<name>/export/ (put there by scripts/fetch-examples.sh, which
// must be run first -- examples/ is gitignored) and writes the two derived
// matrices that docs/SPEC_COVERAGE.md Part 3 tabulates:
//
//   docs/feature_matrix.json  full nested detail, per file
//   docs/feature_matrix.csv   one row per skeleton JSON, one column per counter
//
// This mirrors the field-reading behaviour of spine-core 4.3's SkeletonJson.ts
// (https://github.com/EsotericSoftware/spine-runtimes/blob/4.3/spine-ts/spine-core/src/SkeletonJson.ts).
// It deliberately does NOT construct runtime objects: it counts and classifies
// raw JSON shapes using the same field names and the same defaulting rule the
// real parser uses (getValue(map, key, default)). Constructing real objects
// would hide exactly what this is measuring -- which keys are present.
//
// Run with: bun bench/count_features.ts   (or: bun run bench:usage)

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// Resolved from import.meta rather than __dirname: this package is
// "type": "module", so the CommonJS globals are not guaranteed to exist.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES_DIR = path.join(ROOT, "examples");
const OUT_DIR = path.join(ROOT, "docs");
const EXAMPLES = [
	"1-weight-and-mass",
	"2-the-12-principles",
	"3-timing-and-spacing",
	"4-wave-principle",
	"5-squash-and-stretch",
	"6-arcs",
	"7-anticipation",
	"8-follow-through",
	"spineboy",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMap = Record<string, any>;

function has(map: AnyMap | undefined | null, key: string): boolean {
	return !!map && Object.prototype.hasOwnProperty.call(map, key) && map[key] !== undefined;
}

function getValue<T>(map: AnyMap | undefined | null, key: string, def: T): T {
	if (!map) return def;
	return map[key] !== undefined ? map[key] : def;
}

function incr(rec: Record<string, number>, key: string, by = 1) {
	rec[key] = (rec[key] ?? 0) + by;
}

function addToSet(set: Set<string>, key: string) {
	set.add(key);
}

// Mirrors Utils.enumValue()'s normalization: only the first character is
// capitalized before matching against the TS enum member name. So the JSON
// string "noRotationOrReflection" matches Inherit.NoRotationOrReflection, and
// "normal"/"Normal"/"NORMAL" would all equally mean BlendMode.Normal /
// Inherit.Normal. Comparisons against the "is this the default?" question
// must normalize the same way or they misclassify differently-cased defaults.
function enumNormalize(name: string): string {
	if (!name) return name;
	return name[0].toUpperCase() + name.slice(1);
}

// Known field lists the 4.3 SkeletonJson.ts parser actually reads (see readSkeletonData).
const KNOWN_BONE_KEYS = new Set([
	"name", "parent", "length", "x", "y", "rotation", "scaleX", "scaleY",
	"shearX", "shearY", "inherit", "skin", "color", "icon", "iconSize", "iconRotation",
]);
const KNOWN_SLOT_KEYS = new Set([
	"name", "bone", "color", "dark", "attachment", "blend", "visible",
]);
// Fields read across all attachment types combined (region/mesh/linkedmesh/boundingbox/path/point/clipping).
const KNOWN_ATTACHMENT_KEYS = new Set([
	"name", "type", "path", "sequence", "x", "y", "scaleX", "scaleY", "rotation",
	"width", "height", "color", "vertexCount", "vertices", "uvs", "triangles",
	"edges", "hull", "source", "slot", "skin", "timelines", "closed",
	"constantSpeed", "lengths", "end", "convex", "inverse",
]);

const TOP_LEVEL_KNOWN_43 = new Set(["skeleton", "bones", "slots", "constraints", "skins", "events", "animations"]);
const TOP_LEVEL_LEGACY = new Set(["ik", "transform", "path", "physics"]);

// ---------------------------------------------------------------------------
// Curve classification
// ---------------------------------------------------------------------------

interface CurveStats {
	curve_linear: number;
	curve_stepped: number;
	curve_bezier: number;
	bezier_arrayLengths: Set<number>;
}

function newCurveStats(): CurveStats {
	return { curve_linear: 0, curve_stepped: 0, curve_bezier: 0, bezier_arrayLengths: new Set() };
}

// Classify the "curve" field found on a transition key (i.e. keys[0 .. length-2]).
function classifyCurve(keyMap: AnyMap, stats: CurveStats) {
	const curve = keyMap?.curve;
	if (curve === undefined || curve === null) {
		stats.curve_linear++;
	} else if (curve === "stepped") {
		stats.curve_stepped++;
	} else if (Array.isArray(curve)) {
		stats.curve_bezier++;
		stats.bezier_arrayLengths.add(curve.length);
	} else {
		// Unexpected shape; treat as linear-ish but don't silently drop it.
		stats.curve_linear++;
	}
}

// Walk a "timeline map" (array of keyframes) and classify curves on every
// transition (frames[0..length-2]); frames.length-1 has no "curve" (it's the last key).
function classifyTimelineCurves(frames: AnyMap[], stats: CurveStats) {
	for (let i = 0; i < frames.length - 1; i++) classifyCurve(frames[i], stats);
}

// ---------------------------------------------------------------------------
// Skeleton JSON feature extraction
// ---------------------------------------------------------------------------

function analyzeSkeletonJson(filePath: string, relPath: string): AnyMap {
	const raw = fs.readFileSync(filePath, "utf8");
	const root: AnyMap = JSON.parse(raw);

	const detail: AnyMap = { file: relPath };

	// ---- unknown top-level keys -------------------------------------------------
	const knownTop = new Set([...TOP_LEVEL_KNOWN_43, ...TOP_LEVEL_LEGACY]);
	const unknownTopLevelKeys = Object.keys(root).filter((k) => !knownTop.has(k));
	detail.unknownTopLevelKeys = unknownTopLevelKeys;

	// ---- constraint shape ---------------------------------------------------
	const hasFlatConstraints = Array.isArray(root.constraints) && root.constraints.length > 0;
	const legacyArrays = ["ik", "transform", "path", "physics"].filter(
		(k) => Array.isArray(root[k]) && root[k].length > 0
	);
	let constraintShape: "flat-4.3" | "legacy-arrays" | "none";
	if (hasFlatConstraints) constraintShape = "flat-4.3";
	else if (legacyArrays.length > 0) constraintShape = "legacy-arrays";
	else constraintShape = "none";
	detail.constraintShape = constraintShape;
	detail.legacyConstraintArraysPresent = legacyArrays;

	// ---- skeleton header ------------------------------------------------------
	const skeletonMap: AnyMap = root.skeleton ?? {};
	detail.spineVersion = skeletonMap.spine ?? null;
	detail.hash_present = has(skeletonMap, "hash");
	detail.x_present = has(skeletonMap, "x");
	detail.y_present = has(skeletonMap, "y");
	detail.width_present = has(skeletonMap, "width");
	detail.height_present = has(skeletonMap, "height");
	detail.fps = has(skeletonMap, "fps") ? skeletonMap.fps : null;
	detail.images_present = has(skeletonMap, "images");
	detail.images = skeletonMap.images ?? null;
	detail.audio_present = has(skeletonMap, "audio") && skeletonMap.audio !== null;
	detail.audio = skeletonMap.audio ?? null;
	detail.referenceScale_present = has(skeletonMap, "referenceScale");

	// ---- bones ------------------------------------------------------------
	const bones: AnyMap[] = root.bones ?? [];
	detail.boneCount = bones.length;
	let bone_inherit_nonNormal = 0;
	const inheritBreakdown: Record<string, number> = {};
	let bone_skinRequired = 0;
	let bone_color = 0;
	let bone_icon = 0;
	let bone_length_nonzero = 0;
	let bone_shear_nonzero = 0;
	let bone_scale_nonUnit = 0;
	const unknownBoneKeys = new Set<string>();

	for (const b of bones) {
		const inherit = getValue(b, "inherit", "Normal");
		if (enumNormalize(inherit) !== "Normal") {
			bone_inherit_nonNormal++;
			incr(inheritBreakdown, inherit);
		}
		if (getValue(b, "skin", false) === true) bone_skinRequired++;
		if (has(b, "color")) bone_color++;
		if (has(b, "icon")) bone_icon++;
		if (getValue(b, "length", 0) !== 0) bone_length_nonzero++;
		if (getValue(b, "shearX", 0) !== 0 || getValue(b, "shearY", 0) !== 0) bone_shear_nonzero++;
		if (getValue(b, "scaleX", 1) !== 1 || getValue(b, "scaleY", 1) !== 1) bone_scale_nonUnit++;
		for (const k of Object.keys(b)) if (!KNOWN_BONE_KEYS.has(k)) unknownBoneKeys.add(k);
	}
	detail.bone_inherit_nonNormal = bone_inherit_nonNormal;
	detail.bone_inherit_breakdown = inheritBreakdown;
	detail.bone_skinRequired = bone_skinRequired;
	detail.bone_color = bone_color;
	detail.bone_icon = bone_icon;
	detail.bone_length_nonzero = bone_length_nonzero;
	detail.bone_shear_nonzero = bone_shear_nonzero;
	detail.bone_scale_nonUnit = bone_scale_nonUnit;
	detail.unknownBoneKeys = [...unknownBoneKeys];

	// ---- slots ------------------------------------------------------------
	const slots: AnyMap[] = root.slots ?? [];
	detail.slotCount = slots.length;
	let slot_color = 0;
	let slot_dark = 0;
	let slot_blend_nonNormal = 0;
	const blendBreakdown: Record<string, number> = {};
	let slot_attachment_set = 0;
	let slot_visible_false = 0;
	const unknownSlotKeys = new Set<string>();

	for (const s of slots) {
		if (has(s, "color")) slot_color++;
		if (has(s, "dark")) slot_dark++;
		const blend = getValue(s, "blend", "normal");
		if (enumNormalize(blend) !== "Normal") {
			slot_blend_nonNormal++;
			incr(blendBreakdown, blend);
		}
		if (has(s, "attachment")) slot_attachment_set++;
		if (getValue(s, "visible", true) === false) slot_visible_false++;
		for (const k of Object.keys(s)) if (!KNOWN_SLOT_KEYS.has(k)) unknownSlotKeys.add(k);
	}
	detail.slot_color = slot_color;
	detail.slot_dark = slot_dark;
	detail.slot_blend_nonNormal = slot_blend_nonNormal;
	detail.slot_blend_breakdown = blendBreakdown;
	detail.slot_attachment_set = slot_attachment_set;
	detail.slot_visible_false = slot_visible_false;
	detail.unknownSlotKeys = [...unknownSlotKeys];

	// ---- skins + attachments ------------------------------------------------
	const skins: AnyMap[] = root.skins ?? [];
	detail.skinCount = skins.length;
	detail.skinNames = skins.map((s) => s.name);
	let skin_hasBones = 0;
	let skin_hasConstraints = 0;
	let skin_color = 0;
	let nonDefaultSkinExists = false;

	const att: Record<string, number> = {
		att_region: 0, att_mesh: 0, att_linkedmesh: 0, att_boundingbox: 0,
		att_path: 0, att_point: 0, att_clipping: 0,
	};
	let att_mesh_withSource = 0;
	let att_withSequence = 0;
	let att_region_rotated = 0;
	let att_color = 0;
	let mesh_vertexTotal = 0;
	let mesh_triangleTotal = 0;
	let mesh_weighted = 0;
	let mesh_unweighted = 0;
	let mesh_maxVerticesInOne = 0;
	let mesh_maxTrianglesInOne = 0;
	let mesh_hasEdges = 0;
	let mesh_hasHull = 0;
	const unknownAttachmentKeys = new Set<string>();

	for (const skin of skins) {
		if (skin.name !== "default") nonDefaultSkinExists = true;
		if (Array.isArray(skin.bones) && skin.bones.length > 0) skin_hasBones++;
		const hasAnyConstraintList = ["ik", "transform", "path", "physics", "slider"].some(
			(k) => Array.isArray(skin[k]) && skin[k].length > 0
		);
		if (hasAnyConstraintList) skin_hasConstraints++;
		if (has(skin, "color")) skin_color++;

		const attachmentsBySlot: AnyMap = skin.attachments ?? {};
		for (const slotName of Object.keys(attachmentsBySlot)) {
			const slotMap: AnyMap = attachmentsBySlot[slotName];
			for (const entryName of Object.keys(slotMap)) {
				const map: AnyMap = slotMap[entryName];
				const type = getValue(map, "type", "region");
				const isLinked = (type === "mesh" || type === "linkedmesh") && has(map, "source");

				for (const k of Object.keys(map)) if (!KNOWN_ATTACHMENT_KEYS.has(k)) unknownAttachmentKeys.add(k);

				if (has(map, "sequence")) att_withSequence++;
				if (has(map, "color")) att_color++;

				if (type === "region") {
					att.att_region++;
					if (getValue(map, "rotation", 0) !== 0) att_region_rotated++;
				} else if (type === "mesh" || type === "linkedmesh") {
					if (isLinked) {
						att.att_linkedmesh++;
						att_mesh_withSource++;
					} else {
						att.att_mesh++;
						const uvs: number[] = map.uvs ?? [];
						const triangles: number[] = map.triangles ?? [];
						const vertices: number[] = map.vertices ?? [];
						const vCount = uvs.length / 2;
						const tCount = triangles.length / 3;
						mesh_vertexTotal += vCount;
						mesh_triangleTotal += tCount;
						mesh_maxVerticesInOne = Math.max(mesh_maxVerticesInOne, vCount);
						mesh_maxTrianglesInOne = Math.max(mesh_maxTrianglesInOne, tCount);
						if (vertices.length !== uvs.length) mesh_weighted++;
						else mesh_unweighted++;
						if (has(map, "edges")) mesh_hasEdges++;
						if (has(map, "hull")) mesh_hasHull++;
					}
				} else if (type === "boundingbox") {
					att.att_boundingbox++;
				} else if (type === "path") {
					att.att_path++;
				} else if (type === "point") {
					att.att_point++;
				} else if (type === "clipping") {
					att.att_clipping++;
				}
			}
		}
	}
	detail.skin_hasBones = skin_hasBones;
	detail.skin_hasConstraints = skin_hasConstraints;
	detail.skin_color = skin_color;
	detail.nonDefaultSkinExists = nonDefaultSkinExists;
	Object.assign(detail, att);
	detail.att_mesh_withSource = att_mesh_withSource;
	detail.att_withSequence = att_withSequence;
	detail.att_region_rotated = att_region_rotated;
	detail.att_color = att_color;
	detail.mesh_vertexTotal = mesh_vertexTotal;
	detail.mesh_triangleTotal = mesh_triangleTotal;
	detail.mesh_weighted = mesh_weighted;
	detail.mesh_unweighted = mesh_unweighted;
	detail.mesh_maxVerticesInOne = mesh_maxVerticesInOne;
	detail.mesh_maxTrianglesInOne = mesh_maxTrianglesInOne;
	detail.mesh_hasEdges = mesh_hasEdges;
	detail.mesh_hasHull = mesh_hasHull;
	detail.unknownAttachmentKeys = [...unknownAttachmentKeys];

	// ---- constraints --------------------------------------------------------
	let ikCount = 0, transformCount = 0, pathCount = 0, physicsCount = 0, sliderCount = 0;
	let ik_multiBone = 0;
	const transformShapes = new Set<string>();

	if (constraintShape === "flat-4.3") {
		for (const c of root.constraints as AnyMap[]) {
			switch (c.type) {
				case "ik":
					ikCount++;
					if (Array.isArray(c.bones) && c.bones.length > 1) ik_multiBone++;
					break;
				case "transform":
					transformCount++;
					if (has(c, "source") && has(c, "properties")) transformShapes.add("4.3-source+properties");
					else if (has(c, "target")) transformShapes.add("4.2-target+mix");
					else transformShapes.add("unknown");
					break;
				case "path":
					pathCount++;
					break;
				case "physics":
					physicsCount++;
					break;
				case "slider":
					sliderCount++;
					break;
			}
		}
	} else if (constraintShape === "legacy-arrays") {
		// Older editor export shape: top-level ik/transform/path/physics arrays,
		// each entry is a constraint object without a "type" discriminator.
		const ikArr: AnyMap[] = root.ik ?? [];
		const transformArr: AnyMap[] = root.transform ?? [];
		const pathArr: AnyMap[] = root.path ?? [];
		const physicsArr: AnyMap[] = root.physics ?? [];
		ikCount = ikArr.length;
		ik_multiBone = ikArr.filter((c) => Array.isArray(c.bones) && c.bones.length > 1).length;
		transformCount = transformArr.length;
		for (const c of transformArr) {
			if (has(c, "source") && has(c, "properties")) transformShapes.add("4.3-source+properties");
			else if (has(c, "target")) transformShapes.add("4.2-target+mix");
			else transformShapes.add("unknown");
		}
		pathCount = pathArr.length;
		physicsCount = physicsArr.length;
		// sliders did not exist pre-4.3; sliderCount stays 0.
	}

	detail.ikCount = ikCount;
	detail.transformCount = transformCount;
	detail.pathCount = pathCount;
	detail.physicsCount = physicsCount;
	detail.sliderCount = sliderCount;
	detail.ik_multiBone = ik_multiBone;
	detail.transformShape = transformShapes.size === 0 ? "none"
		: transformShapes.size === 1 ? [...transformShapes][0]
		: "mixed:" + [...transformShapes].join("+");

	// ---- animations ---------------------------------------------------------
	const animations: AnyMap = root.animations ?? {};
	const animNames = Object.keys(animations);
	detail.animationCount = animNames.length;
	detail.animationNames = animNames;

	const tl: Record<string, number> = {};
	const curveStats = newCurveStats();
	let animation_color_present = 0;
	let deform_keys = 0;
	let drawOrder_keys = 0;
	let event_keys = 0;

	for (const animName of animNames) {
		const anim: AnyMap = animations[animName];
		if (has(anim, "color")) animation_color_present++;

		// Bone timelines
		const boneTimelineNames = [
			"rotate", "translate", "translatex", "translatey",
			"scale", "scalex", "scaley", "shear", "shearx", "sheary", "inherit",
		];
		if (anim.bones) {
			for (const boneName of Object.keys(anim.bones)) {
				const boneMap: AnyMap = anim.bones[boneName];
				for (const tlName of Object.keys(boneMap)) {
					const frames: AnyMap[] = boneMap[tlName];
					if (!Array.isArray(frames) || frames.length === 0) continue;
					const key = "tl_" + tlName;
					incr(tl, key);
					incr(tl, key + "_keys", frames.length);
					if (boneTimelineNames.includes(tlName) && tlName !== "inherit") {
						classifyTimelineCurves(frames, curveStats);
					}
					// "inherit" timelines have no curve field (discrete enum steps).
				}
			}
		}

		// Slot timelines
		if (anim.slots) {
			for (const slotName of Object.keys(anim.slots)) {
				const slotMap: AnyMap = anim.slots[slotName];
				for (const tlName of Object.keys(slotMap)) {
					const frames: AnyMap[] = slotMap[tlName];
					if (!Array.isArray(frames) || frames.length === 0) continue;
					const key = "tl_" + tlName;
					incr(tl, key);
					incr(tl, key + "_keys", frames.length);
					if (["attachment"].includes(tlName)) {
						// no curve field on attachment timelines
					} else {
						classifyTimelineCurves(frames, curveStats);
					}
				}
			}
		}

		// IK constraint timelines
		if (anim.ik) {
			for (const constraintName of Object.keys(anim.ik)) {
				const frames: AnyMap[] = anim.ik[constraintName];
				if (!Array.isArray(frames) || frames.length === 0) continue;
				incr(tl, "tl_ik");
				incr(tl, "tl_ik_keys", frames.length);
				classifyTimelineCurves(frames, curveStats);
			}
		}

		// Transform constraint timelines
		if (anim.transform) {
			for (const constraintName of Object.keys(anim.transform)) {
				const frames: AnyMap[] = anim.transform[constraintName];
				if (!Array.isArray(frames) || frames.length === 0) continue;
				incr(tl, "tl_transform");
				incr(tl, "tl_transform_keys", frames.length);
				classifyTimelineCurves(frames, curveStats);
			}
		}

		// Path constraint timelines
		if (anim.path) {
			for (const constraintName of Object.keys(anim.path)) {
				const constraintMap: AnyMap = anim.path[constraintName];
				for (const tlName of Object.keys(constraintMap)) {
					const frames: AnyMap[] = constraintMap[tlName];
					if (!Array.isArray(frames) || frames.length === 0) continue;
					const key = "tl_path_" + tlName;
					incr(tl, key);
					incr(tl, key + "_keys", frames.length);
					classifyTimelineCurves(frames, curveStats);
				}
			}
		}

		// Physics constraint timelines
		if (anim.physics) {
			for (const constraintName of Object.keys(anim.physics)) {
				const constraintMap: AnyMap = anim.physics[constraintName];
				for (const tlName of Object.keys(constraintMap)) {
					const frames: AnyMap[] = constraintMap[tlName];
					if (!Array.isArray(frames) || frames.length === 0) continue;
					const key = "tl_physics_" + tlName;
					incr(tl, key);
					incr(tl, key + "_keys", frames.length);
					if (tlName !== "reset") classifyTimelineCurves(frames, curveStats);
					// "reset" timelines carry only {time}, no curve.
				}
			}
		}

		// Slider constraint timelines
		if (anim.slider) {
			for (const constraintName of Object.keys(anim.slider)) {
				const constraintMap: AnyMap = anim.slider[constraintName];
				for (const tlName of Object.keys(constraintMap)) {
					const frames: AnyMap[] = constraintMap[tlName];
					if (!Array.isArray(frames) || frames.length === 0) continue;
					const key = "tl_slider_" + tlName;
					incr(tl, key);
					incr(tl, key + "_keys", frames.length);
					classifyTimelineCurves(frames, curveStats);
				}
			}
		}

		// Deform + sequence timelines (nested under attachments)
		if (anim.attachments) {
			for (const skinName of Object.keys(anim.attachments)) {
				const skinMap: AnyMap = anim.attachments[skinName];
				for (const slotName of Object.keys(skinMap)) {
					const slotMap: AnyMap = skinMap[slotName];
					for (const attachmentName of Object.keys(slotMap)) {
						const attachmentMap: AnyMap = slotMap[attachmentName];
						for (const tlName of Object.keys(attachmentMap)) {
							const frames: AnyMap[] = attachmentMap[tlName];
							if (!Array.isArray(frames) || frames.length === 0) continue;
							if (tlName === "deform") {
								incr(tl, "tl_deform");
								incr(tl, "deform_keys", frames.length);
								classifyTimelineCurves(frames, curveStats);
							} else if (tlName === "sequence") {
								incr(tl, "tl_sequence");
								incr(tl, "sequence_keys", frames.length);
								// sequence timelines have no curve field.
							}
						}
					}
				}
			}
		}

		// Draw order timeline
		if (Array.isArray(anim.drawOrder) && anim.drawOrder.length > 0) {
			incr(tl, "tl_drawOrder");
			incr(tl, "drawOrder_keys", anim.drawOrder.length);
			// no curve field
		}

		// Draw order folder timelines (4.3 addition)
		if (Array.isArray(anim.drawOrderFolder) && anim.drawOrderFolder.length > 0) {
			for (const folderTl of anim.drawOrderFolder) {
				const keys = folderTl.keys ?? [];
				incr(tl, "tl_drawOrderFolder");
				incr(tl, "drawOrderFolder_keys", keys.length);
			}
		}

		// Event timeline
		if (Array.isArray(anim.events) && anim.events.length > 0) {
			incr(tl, "tl_events");
			incr(tl, "event_keys", anim.events.length);
			// no curve field
		}
	}

	Object.assign(detail, tl);
	detail.animation_color_present = animation_color_present;
	detail.curve_linear = curveStats.curve_linear;
	detail.curve_stepped = curveStats.curve_stepped;
	detail.curve_bezier = curveStats.curve_bezier;
	detail.bezier_arrayLengths = [...curveStats.bezier_arrayLengths].sort((a, b) => a - b);

	// ---- events (skeleton-level defs) ----------------------------------------
	const events: AnyMap = root.events ?? {};
	const eventNames = Object.keys(events);
	detail.eventDefCount = eventNames.length;
	let event_hasInt = 0, event_hasFloat = 0, event_hasString = 0, event_hasAudio = 0, event_hasVolume = 0, event_hasBalance = 0;
	for (const en of eventNames) {
		const e: AnyMap = events[en];
		if (has(e, "int")) event_hasInt++;
		if (has(e, "float")) event_hasFloat++;
		if (has(e, "string")) event_hasString++;
		if (has(e, "audio")) event_hasAudio++;
		if (has(e, "volume")) event_hasVolume++;
		if (has(e, "balance")) event_hasBalance++;
	}
	detail.event_hasInt = event_hasInt;
	detail.event_hasFloat = event_hasFloat;
	detail.event_hasString = event_hasString;
	detail.event_hasAudio = event_hasAudio;
	detail.event_hasVolume = event_hasVolume;
	detail.event_hasBalance = event_hasBalance;

	return detail;
}

// ---------------------------------------------------------------------------
// Atlas parsing (plain text; mirrors TextureAtlas.ts field names)
// ---------------------------------------------------------------------------

interface AtlasRegion {
	name: string;
	fields: Record<string, string>;
}
interface AtlasPage {
	name: string;
	fields: Record<string, string>;
	regions: AtlasRegion[];
}

function parseAtlasText(text: string): AtlasPage[] {
	const lines = text.split(/\r\n|\r|\n/);
	const pages: AtlasPage[] = [];
	let currentPage: AtlasPage | null = null;
	let currentRegion: AtlasRegion | null = null;

	const isEntryLine = (raw: string) => /^\s+\S/.test(raw) && raw.includes(":");

	for (const raw of lines) {
		if (raw.trim() === "") {
			currentPage = null;
			currentRegion = null;
			continue;
		}
		if (isEntryLine(raw)) {
			const m = raw.trim().match(/^([A-Za-z0-9_]+):\s*(.*)$/);
			if (!m) continue;
			const [, key, value] = m;
			if (currentRegion) currentRegion.fields[key] = value;
			else if (currentPage) currentPage.fields[key] = value;
			continue;
		}
		// Name line: page name if no current page, else region name.
		const name = raw.trim();
		if (!currentPage) {
			currentPage = { name, fields: {}, regions: [] };
			pages.push(currentPage);
			currentRegion = null;
		} else {
			currentRegion = { name, fields: {} };
			currentPage.regions.push(currentRegion);
		}
	}
	return pages;
}

function analyzeAtlasFile(filePath: string, relPath: string): AnyMap {
	const text = fs.readFileSync(filePath, "utf8");
	const pages = parseAtlasText(text);

	const pageDetails: AnyMap[] = [];
	let totalRegions = 0;
	let totalRotated = 0;
	let totalCompact = 0;
	let totalLegacy = 0;
	let totalIndex = 0;
	let totalSplit = 0;
	let totalPad = 0;

	for (const page of pages) {
		let pageRotated = 0;
		let pageCompact = 0;
		let pageLegacy = 0;
		let pageIndex = 0;
		let pageSplit = 0;
		let pagePad = 0;
		const rotateValues: string[] = [];

		for (const region of page.regions) {
			const f = region.fields;
			if (has(f, "rotate")) {
				pageRotated++;
				rotateValues.push(f.rotate);
			}
			const isCompact = has(f, "bounds") || has(f, "offsets");
			const isLegacy = has(f, "xy") || has(f, "size") || has(f, "orig") || has(f, "offset");
			if (isCompact) pageCompact++;
			else if (isLegacy) pageLegacy++;
			if (has(f, "index")) pageIndex++;
			if (has(f, "split")) pageSplit++;
			if (has(f, "pad")) pagePad++;
		}

		totalRegions += page.regions.length;
		totalRotated += pageRotated;
		totalCompact += pageCompact;
		totalLegacy += pageLegacy;
		totalIndex += pageIndex;
		totalSplit += pageSplit;
		totalPad += pagePad;

		pageDetails.push({
			pageImageName: page.name,
			size: page.fields.size ?? null,
			format: page.fields.format ?? null,
			filter: page.fields.filter ?? null,
			repeat: page.fields.repeat ?? null,
			pma: page.fields.pma ?? null,
			scale: page.fields.scale ?? null,
			regionCount: page.regions.length,
			region_rotated: pageRotated,
			region_rotated_values: [...new Set(rotateValues)],
			region_compactForm: pageCompact,
			region_legacyForm: pageLegacy,
			region_withIndex: pageIndex,
			region_withSplit: pageSplit,
			region_withPad: pagePad,
		});
	}

	let atlasRegionShape: "compact" | "legacy" | "mixed" | "none";
	if (totalCompact > 0 && totalLegacy > 0) atlasRegionShape = "mixed";
	else if (totalCompact > 0) atlasRegionShape = "compact";
	else if (totalLegacy > 0) atlasRegionShape = "legacy";
	else atlasRegionShape = "none";

	return {
		file: relPath,
		pageCount: pages.length,
		regionCount: totalRegions,
		region_rotated: totalRotated,
		region_withIndex: totalIndex,
		region_withSplit: totalSplit,
		region_withPad: totalPad,
		atlasRegionShape,
		pages: pageDetails,
	};
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
	const skeletonFiles: { example: string; file: string; abs: string; rel: string }[] = [];
	const atlasFiles: { example: string; file: string; abs: string; rel: string }[] = [];

	if (!fs.existsSync(EXAMPLES_DIR)) {
		console.error(`No examples/ directory at ${EXAMPLES_DIR}.`);
		console.error("Run `bun run fetch-examples` first -- the example projects are");
		console.error("owned by Esoteric Software and are not redistributed here (NOTICE.md).");
		process.exit(1);
	}

	for (const ex of EXAMPLES) {
		// scripts/fetch-examples.sh lays each example out as
		// examples/<name>/{export,images}/ plus license.txt; only export/ holds
		// the skeleton data and the atlas.
		const dir = path.join(EXAMPLES_DIR, ex, "export");
		if (!fs.existsSync(dir)) {
			console.error(`WARNING: missing example directory ${dir}`);
			continue;
		}
		const entries = fs.readdirSync(dir);
		for (const f of entries) {
			if (f.endsWith(".json")) {
				skeletonFiles.push({ example: ex, file: f, abs: path.join(dir, f), rel: `${ex}/${f}` });
			} else if (f.endsWith(".atlas")) {
				atlasFiles.push({ example: ex, file: f, abs: path.join(dir, f), rel: `${ex}/${f}` });
			}
		}
	}

	console.log(`Found ${skeletonFiles.length} skeleton JSON files, ${atlasFiles.length} atlas files.`);

	const fileDetails: AnyMap = {};
	for (const sf of skeletonFiles) {
		try {
			fileDetails[sf.rel] = analyzeSkeletonJson(sf.abs, sf.rel);
		} catch (err) {
			console.error(`ERROR analyzing ${sf.rel}:`, err);
			fileDetails[sf.rel] = { file: sf.rel, error: String(err) };
		}
	}

	const atlasDetails: AnyMap = {};
	for (const af of atlasFiles) {
		try {
			atlasDetails[af.rel] = analyzeAtlasFile(af.abs, af.rel);
		} catch (err) {
			console.error(`ERROR analyzing ${af.rel}:`, err);
			atlasDetails[af.rel] = { file: af.rel, error: String(err) };
		}
	}

	// Per-example atlas aggregate (summed across all atlas files found in that
	// example's directory) -- attached to every skeleton JSON row from that
	// example, since the plain-text .atlas format carries no back-reference to
	// which skeleton JSON(s) use it, and pairing is by directory convention only.
	const atlasAggregateByExample: AnyMap = {};
	for (const ex of EXAMPLES) {
		const filesForExample = Object.values(atlasDetails).filter((a: AnyMap) => a.file?.startsWith(ex + "/"));
		const agg: AnyMap = {
			atlas_fileCount: filesForExample.length,
			atlas_pageCount: 0,
			atlas_regionCount: 0,
			atlas_region_rotated: 0,
			atlas_region_withIndex: 0,
			atlas_region_withSplit: 0,
			atlas_region_withPad: 0,
			atlas_regionShapes: new Set<string>(),
			atlas_pma_any: false,
			atlas_filterValues: new Set<string>(),
			atlas_scaleValues: new Set<string>(),
			atlas_sizeValues: new Set<string>(),
		};
		for (const a of filesForExample as AnyMap[]) {
			agg.atlas_pageCount += a.pageCount;
			agg.atlas_regionCount += a.regionCount;
			agg.atlas_region_rotated += a.region_rotated;
			agg.atlas_region_withIndex += a.region_withIndex;
			agg.atlas_region_withSplit += a.region_withSplit;
			agg.atlas_region_withPad += a.region_withPad;
			agg.atlas_regionShapes.add(a.atlasRegionShape);
			for (const p of a.pages) {
				if (p.pma === "true") agg.atlas_pma_any = true;
				if (p.filter) agg.atlas_filterValues.add(p.filter);
				if (p.scale) agg.atlas_scaleValues.add(p.scale);
				if (p.size) agg.atlas_sizeValues.add(p.size);
			}
		}
		agg.atlas_regionShapes = [...agg.atlas_regionShapes].join("+") || "none";
		agg.atlas_filterValues = [...agg.atlas_filterValues].join("+");
		agg.atlas_scaleValues = [...agg.atlas_scaleValues].join("+");
		agg.atlas_sizeValues = [...agg.atlas_sizeValues].join("+");
		atlasAggregateByExample[ex] = agg;
	}

	// ---- write feature_matrix.json ----
	// ⚠️ No timestamp in the committed artifact. A `generatedAt` made every re-run
	// dirty the working tree even when the corpus had not moved, which trains a
	// reader to ignore a diff on this file — and a diff on this file is the only
	// signal that the corpus DID move. The run time goes to stdout, where it
	// describes the run rather than the data.
	const matrixJson = {
		note: "atlas_* columns on each skeleton JSON row are aggregated (summed) across ALL .atlas files found in that example's directory -- the plain-text atlas format has no explicit back-reference to a specific skeleton JSON, so pairing is by directory convention only, not by content matching.",
		files: fileDetails,
		atlases: atlasDetails,
		atlasAggregateByExample,
	};
	fs.writeFileSync(path.join(OUT_DIR, "feature_matrix.json"), JSON.stringify(matrixJson, (_k, v) => (v instanceof Set ? [...v] : v), 2));

	// ---- write feature_matrix.csv ----
	// Collect the union of all keys across all file details (flattening only
	// scalar / array-ish fields; nested breakdown objects are flattened with a
	// prefix, arrays are joined with ";").
	const rows: AnyMap[] = [];
	for (const sf of skeletonFiles) {
		const d = fileDetails[sf.rel];
		const agg = atlasAggregateByExample[sf.example];
		const row: AnyMap = { example: sf.example, ...d };
		for (const k of Object.keys(agg)) row[k] = agg[k];
		rows.push(row);
	}

	function flatten(obj: AnyMap, prefix = ""): AnyMap {
		const out: AnyMap = {};
		for (const [k, v] of Object.entries(obj)) {
			const key = prefix ? `${prefix}_${k}` : k;
			if (v === null || v === undefined) {
				out[key] = "";
			} else if (Array.isArray(v)) {
				out[key] = v.join(";");
			} else if (v instanceof Set) {
				out[key] = [...v].join(";");
			} else if (typeof v === "object") {
				Object.assign(out, flatten(v, key));
			} else {
				out[key] = v;
			}
		}
		return out;
	}

	const flatRows = rows.map((r) => flatten(r));
	const allKeys = new Set<string>();
	for (const r of flatRows) for (const k of Object.keys(r)) allKeys.add(k);

	// Stable, readable column order: put well-known columns first, then the rest sorted.
	const priority = [
		"example", "file", "spineVersion", "constraintShape", "transformShape",
		"boneCount", "slotCount", "skinCount", "skinNames", "nonDefaultSkinExists",
		"animationCount", "animationNames",
		"att_region", "att_mesh", "att_linkedmesh", "att_mesh_withSource", "att_boundingbox", "att_path", "att_point", "att_clipping",
		"mesh_weighted", "mesh_unweighted", "mesh_vertexTotal", "mesh_triangleTotal",
		"ikCount", "ik_multiBone", "transformCount", "pathCount", "physicsCount", "sliderCount",
		"curve_linear", "curve_stepped", "curve_bezier", "bezier_arrayLengths",
		"eventDefCount",
		"atlas_fileCount", "atlas_pageCount", "atlas_regionCount", "atlas_regionShapes", "atlas_region_rotated",
	];
	const rest = [...allKeys].filter((k) => !priority.includes(k)).sort();
	const columns = [...priority.filter((k) => allKeys.has(k)), ...rest];

	function csvEscape(v: unknown): string {
		const s = v === undefined || v === null ? "" : String(v);
		if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
		return s;
	}

	const csvLines = [columns.join(",")];
	for (const r of flatRows) {
		csvLines.push(columns.map((c) => csvEscape(r[c])).join(","));
	}
	fs.writeFileSync(path.join(OUT_DIR, "feature_matrix.csv"), csvLines.join("\n") + "\n");

	console.log(`Generated at ${new Date().toISOString()} (not written into the artifacts — see above)`);
	console.log(`Wrote docs/feature_matrix.json (${Object.keys(fileDetails).length} skeleton files, ${Object.keys(atlasDetails).length} atlas files)`);
	console.log(`Wrote docs/feature_matrix.csv (${flatRows.length} rows, ${columns.length} columns)`);
}

main();
