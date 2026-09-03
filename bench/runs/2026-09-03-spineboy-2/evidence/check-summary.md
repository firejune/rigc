### `check` against the frames — every committed set

| set | frames | framing | MAE (union) | MAE (ref px) | drawnRatio | worst attributable drift | slot | frame | blank-drift frames | change pairs | disagreements |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| `aim` | 1/1 | frames-viewport | 45.09 | 47.49 | 0.934 | 4.20 | front-shin | 0 | 0/1 | 0 | 0 |
| `aim@30fps` | 1/1 | frames-viewport | 45.09 | 47.49 | 0.934 | 4.20 | front-shin | 0 | 0/1 | 0 | 0 |
| `death` | 60/60 | frames-viewport | 63.55 | 73.29 | 1.024 | 18.98 | rear-shin | 7 | 19/60 | 59 | 5 |
| `death@30fps` | 2/2 | frames-viewport | 69.73 | 78.37 | 0.770 | 15.27 | front-shin | 0 | 1/2 | 0 | 0 |
| `hit` | 5/5 | frames-viewport | 60.30 | 67.81 | 0.949 | 4.36 | rear-shin | 4 | 1/5 | 4 | 0 |
| `hit@30fps` | 2/2 | frames-viewport | 53.98 | 59.66 | 0.961 | 4.36 | rear-shin | 10 | 0/2 | 0 | 0 |
| `idle` | 21/21 | frames-viewport | 49.59 | 53.59 | 0.945 | 6.44 | torso | 15 | 0/21 | 20 | 2 |
| `idle@30fps` | 2/2 | frames-viewport | 49.00 | 52.77 | 0.941 | 4.87 | torso | 0 | 0/2 | 0 | 0 |
| `jump` | 17/17 | frames-viewport | 48.95 | 52.33 | 0.929 | 6.89 | torso | 11 | 0/17 | 16 | 0 |
| `jump@30fps` | 2/2 | frames-viewport | 50.97 | 54.69 | 0.945 | 1.78 | mouth | 0 | 0/2 | 0 | 0 |
| `run` | 9/9 | frames-viewport | 51.99 | 56.80 | 0.946 | 4.92 | rear-shin | 3 | 0/9 | 8 | 0 |
| `run@30fps` | 2/2 | frames-viewport | 54.25 | 58.29 | 0.897 | 3.66 | rear-foot | 0 | 0/2 | 0 | 0 |
| `shoot` | 6/6 | frames-viewport | 42.70 | 45.29 | 0.765 | 3.94 | front-shin | 5 | 0/6 | 5 | 0 |
| `shoot@30fps` | 2/2 | frames-viewport | 44.00 | 46.75 | 0.958 | 3.94 | front-shin | 12 | 0/2 | 0 | 0 |
| `walk` | 13/13 | frames-viewport | 41.21 | 43.92 | 0.965 | 5.65 | front-shin | 7 | 0/13 | 12 | 0 |
| `walk@30fps` | 2/2 | frames-viewport | 47.53 | 51.43 | 0.957 | 1.99 | mouth | 30 | 0/2 | 0 | 0 |

### The sheets — G7 reads a ratio inside one sheet

| set | tiles | sheet MAE mean | worst tile | worst / mean |
| --- | ---: | ---: | ---: | ---: |
| `death@30fps` | 149/— | 68.99 | 97.92 (18) | **1.419** |
| `hit@30fps` | 11/— | 69.86 | 86.83 (7) | **1.243** |
| `idle@30fps` | 51/— | 50.50 | 59.14 (39) | **1.171** |
| `jump@30fps` | 41/— | 61.10 | 89.05 (36) | **1.457** |
| `run@30fps` | 21/— | 63.40 | 81.25 (16) | **1.282** |
| `shoot@30fps` | 13/— | 45.32 | 51.82 (3) | **1.143** |
| `walk@30fps` | 31/— | 51.32 | 74.98 (14) | **1.461** |

### The chain rollup — one line per chain, pooled across every set

| chain | slots drawn | worst slot drift | mean drift | MAE in it | ref px | sets with any attribution |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `torso` | 1/1 | 6.89 px `torso` (jump f11) | 1.76 px | 18.60 | 43045 | 13/16 |
| `head` | 5/5 | 4.73 px `goggles` (run f3) | 0.74 px | 11.15 | 389625 | 16/16 |
| `rear-upper-arm` | 6/6 | 5.21 px `rear-bracer` (jump f1) | 5.21 px | 25.50 | 81538 | 1/16 |
| `front-upper-arm` | 3/3 | 4.10 px `front-upper-arm` (jump f15) | 0.84 px | 19.97 | 73133 | 13/16 |
| `rear-thigh` | 3/3 | 18.98 px `rear-shin` (death f7) | 3.01 px | 18.96 | 89884 | 11/16 |
| `front-thigh` | 3/3 | 15.27 px `front-shin` (death f0) | 3.75 px | 20.99 | 119510 | 13/16 |

### The headline

- **worst attributable slot drift, over every measured set: 18.98 px** (`rear-shin` in `death` at f7)
- **`changeDisagreements`, summed over every set: 7**
- **`⚠️ overdraw`: no set** (the bar is `drawnRatio` > 1.5)
- sets whose drift table is entirely blank (G2's 🕳️ HOLE): none
- `frames.json`'s own box: TAKEN, extent-spread — a fit there asks for 13.92 px against the 16.29 px the extent-spread tolerance reaches
