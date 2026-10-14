/* Shared geometry. Metres; Z up; THREE.Euler XYZ convention (CVAT 2.76). */
(function (root) {
    'use strict';

    // Subtype dimension profiles for vehicles according to autonomous driving labeling specifications
    const VEHICLE_SUBTYPES = {
        car: { minL: 2.8, maxL: 5.8, minW: 1.4, maxW: 2.3, minH: 1.1, maxH: 2.2 },
        truck: { minL: 5.0, maxL: 14.0, minW: 1.9, maxW: 3.0, minH: 2.0, maxH: 4.2 },
        bus: { minL: 6.5, maxL: 15.0, minW: 2.2, maxW: 3.2, minH: 2.6, maxH: 4.2 },
        van: { minL: 4.2, maxL: 6.5, minW: 1.7, maxW: 2.4, minH: 1.8, maxH: 2.8 },
        pickup: { minL: 4.5, maxL: 6.5, minW: 1.7, maxW: 2.3, minH: 1.6, maxH: 2.4 },
        contruction: { minL: 3.5, maxL: 12.0, minW: 2.0, maxW: 3.5, minH: 1.8, maxH: 4.5 },
        construction: { minL: 3.5, maxL: 12.0, minW: 2.0, maxW: 3.5, minH: 1.8, maxH: 4.5 },
        Trailer: { minL: 4.0, maxL: 16.0, minW: 1.9, maxW: 3.0, minH: 1.5, maxH: 4.5 },
        trailer: { minL: 4.0, maxL: 16.0, minW: 1.9, maxW: 3.0, minH: 1.5, maxH: 4.5 },
        Tricycle: { minL: 1.8, maxL: 3.8, minW: 0.9, maxW: 1.8, minH: 1.1, maxH: 2.2 },
        tricycle: { minL: 1.8, maxL: 3.8, minW: 0.9, maxW: 1.8, minH: 1.1, maxH: 2.2 },
        Stroller: { minL: 0.6, maxL: 1.4, minW: 0.4, maxW: 0.9, minH: 0.7, maxH: 1.4 },
        stroller: { minL: 0.6, maxL: 1.4, minW: 0.4, maxW: 0.9, minH: 0.7, maxH: 1.4 },
        Wheelchair: { minL: 0.7, maxL: 1.6, minW: 0.5, maxW: 1.1, minH: 0.7, maxH: 1.5 },
        wheelchair: { minL: 0.7, maxL: 1.6, minW: 0.5, maxW: 1.1, minH: 0.7, maxH: 1.5 },
        other: { minL: 1.5, maxL: 15.0, minW: 0.8, maxW: 3.5, minH: 0.8, maxH: 4.5 },
    };

    const BASE_DIMENSION_SPECS = {
        vehicles: { minL: 2.8, maxL: 5.8, minW: 1.4, maxW: 2.3, minH: 1.1, maxH: 2.2 },
        'two-wheels': { minL: 1.4, maxL: 2.6, minW: 0.5, maxW: 1.3, minH: 0.9, maxH: 1.9 },
        pedestrian: { minL: 0.3, maxL: 1.0, minW: 0.3, maxW: 1.0, minH: 1.3, maxH: 2.1 },
        Animal: { minL: 0.4, maxL: 2.5, minW: 0.3, maxW: 1.2, minH: 0.3, maxH: 1.8 },
        Obstacle: { minL: 0.2, maxL: 5.0, minW: 0.2, maxW: 5.0, minH: 0.2, maxH: 5.0 },
    };

    const DIMENSION_SPECS = {
        ...BASE_DIMENSION_SPECS,
        ...Object.fromEntries(Object.entries(VEHICLE_SUBTYPES).map(([k, v]) => [`vehicles:${k}`, v])),
    };

    function resolveDimensionSpec(classLabel, subType = null, profiles = DIMENSION_SPECS) {
        if (!classLabel) return null;
        const cleanLabel = String(classLabel).trim();
        const lowerLabel = cleanLabel.toLowerCase();

        // 1. Vehicles with subtype
        if (['vehicles', 'vehicle', 'car', 'cars'].includes(lowerLabel)) {
            if (subType) {
                const subKey = `vehicles:${subType}`;
                if (Object.hasOwn(profiles, subKey)) return { ...profiles[subKey], resolvedKey: subKey, subType };
                const cleanSub = String(subType).toLowerCase();
                for (const [k, v] of Object.entries(VEHICLE_SUBTYPES)) {
                    if (k.toLowerCase() === cleanSub) {
                        return { ...v, resolvedKey: `vehicles:${k}`, subType: k };
                    }
                }
            }
            return { ...(profiles.vehicles || BASE_DIMENSION_SPECS.vehicles), resolvedKey: 'vehicles', subType: subType || 'car' };
        }

        // 2. Direct key match (e.g. 'vehicles:bus' or 'two-wheels')
        if (Object.hasOwn(profiles, cleanLabel)) return { ...profiles[cleanLabel], resolvedKey: cleanLabel, subType };

        // 3. Fallback matching
        if (['two-wheels', 'two_wheels', 'bicycle', 'motorcycle', 'cyclist'].includes(lowerLabel)) {
            return { ...profiles['two-wheels'], resolvedKey: 'two-wheels', subType };
        }
        if (['pedestrian', 'person'].includes(lowerLabel)) {
            return { ...profiles.pedestrian, resolvedKey: 'pedestrian', subType };
        }
        if (['animal'].includes(lowerLabel)) {
            return { ...profiles.Animal, resolvedKey: 'Animal', subType };
        }
        if (['obstacle'].includes(lowerLabel)) {
            return { ...profiles.Obstacle, resolvedKey: 'Obstacle', subType };
        }

        return null;
    }

    const idOf = box => box.clientId ?? box.clientID ?? box.id;

    function cuboidVertices(p) {
        const [cx, cy, cz, rx, ry, rz, l, w, h] = p;
        const ax = Math.cos(rx), bx = Math.sin(rx), ay = Math.cos(ry), by = Math.sin(ry), az = Math.cos(rz), bz = Math.sin(rz);
        const vertices = [];
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const x = sx * l / 2, y = sy * w / 2, z = sz * h / 2;
            const zx = az * x - bz * y, zy = bz * x + az * y;
            const yx = ay * zx + by * z, yz = -by * zx + ay * z;
            vertices.push([cx + yx, cy + ax * zy - bx * yz, cz + bx * zy + ax * yz]);
        }
        return vertices;
    }

    function parseCVAT16Points(points) {
        if (!points || points.length < 9 || !Array.from(points).every(Number.isFinite) || points.slice(6, 9).some(n => n <= 0)) return null;
        const p = Array.from(points), vertices = cuboidVertices(p);
        return {
            center: p.slice(0, 3), rotation: p.slice(3, 6), dimensions: p.slice(6, 9), length: p[6], width: p[7], height: p[8],
            zBottom: Math.min(...vertices.map(v => v[2])), yawDeg: p[5] * 180 / Math.PI, volume: p[6] * p[7] * p[8], vertices
        };
    }

    function rotateYawPoints(points, degrees) {
        if (!parseCVAT16Points(points) || !Number.isFinite(degrees)) throw new Error('Invalid box coordinates or rotation angle');
        const p = Array.from(points), angle = p[5] + degrees * Math.PI / 180;
        p[5] = Math.atan2(Math.sin(angle), Math.cos(angle)); return p;
    }

    function makePlane(a, b, c, extra = {}) {
        return {
            a, b, c, getTargetZ: (x, y) => a * x + b * y + c,
            desc: `z = ${a.toFixed(4)}x ${b < 0 ? '-' : '+'} ${Math.abs(b).toFixed(4)}y ${c < 0 ? '-' : '+'} ${Math.abs(c).toFixed(3)}m`, ...extra
        };
    }

    function fitPlane(points) {
        if (points.length < 3) return null;
        const mean = points.reduce((m, p) => m.map((v, i) => v + p[i] / points.length), [0, 0, 0]);
        let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0;
        for (const p of points) {
            const x = p[0] - mean[0], y = p[1] - mean[1], z = p[2] - mean[2];
            xx += x * x; xy += x * y; yy += y * y; xz += x * z; yz += y * z;
        }
        const det = xx * yy - xy * xy;
        if (Math.abs(det) < 1e-10) return null;
        const a = (xz * yy - yz * xy) / det, b = (yz * xx - xz * xy) / det;
        return makePlane(a, b, mean[2] - a * mean[0] - b * mean[1]);
    }

    // Legacy cuboid reference, never used as LiDAR ground by the new tool.
    function estimateRoadPlane(shapes) {
        const points = shapes.map(s => parseCVAT16Points(s.points)).filter(Boolean).map(g => [...g.center.slice(0, 2), g.zBottom]);
        points.sort((a, b) => a[2] - b[2]);
        return fitPlane(points.slice(Math.floor(points.length * 0.15), Math.ceil(points.length * 0.85))) || makePlane(0, 0, points[0]?.[2] || 0, { source: 'cuboid-reference', confidence: 0 });
    }

    function snapGroundPoints(points, plane) {
        const geom = parseCVAT16Points(points);
        if (!geom || !plane || typeof plane.getTargetZ !== 'function') throw new Error('No valid ground plane available');
        const clearances = geom.vertices.map(([x, y, z]) => z - plane.getTargetZ(x, y));
        if (!clearances.every(Number.isFinite)) throw new Error('Invalid ground plane');
        const deltaZ = -Math.min(...clearances), newPoints = Array.from(points); newPoints[2] += deltaZ;
        return {
            newPoints, oldCz: points[2], newCz: newPoints[2], deltaZ, targetGroundZ: plane.getTargetZ(points[0], points[1]),
            clearanceSpread: Math.max(...clearances) - Math.min(...clearances)
        };
    }

    function footprint(points) {
        const c = Math.cos(points[5]), s = Math.sin(points[5]);
        return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => {
            x *= points[6] / 2; y *= points[7] / 2; return [points[0] + c * x - s * y, points[1] + s * x + c * y];
        });
    }

    const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);

    function polygonIntersection(subject, clip) {
        let output = subject;
        for (let i = 0; i < clip.length && output.length; i++) {
            const a = clip[i], b = clip[(i + 1) % clip.length], input = output; output = [];
            for (let j = 0; j < input.length; j++) {
                const p = input[j], q = input[(j + 1) % input.length], cp = cross(a, b, p), cq = cross(a, b, q);
                const pin = cp >= -1e-10, qin = cq >= -1e-10;
                if (pin) output.push(p);
                if (pin !== qin) { const t = cp / (cp - cq); output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); }
            }
        }
        return output;
    }

    function polygonArea(polygon) {
        return Math.abs(polygon.reduce((area, p, i) => { const q = polygon[(i + 1) % polygon.length]; return area + p[0] * q[1] - p[1] * q[0]; }, 0)) / 2;
    }

    function orientedIoU(a, b) {
        const ga = parseCVAT16Points(a), gb = parseCVAT16Points(b);
        if (!ga || !gb || [...a.slice(3, 5), ...b.slice(3, 5)].some(r => Math.abs(r) > 1e-4)) return null;
        const height = Math.min(a[2] + a[8] / 2, b[2] + b[8] / 2) - Math.max(a[2] - a[8] / 2, b[2] - b[8] / 2);
        if (height <= 0) return 0;
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > (Math.hypot(a[6], a[7]) + Math.hypot(b[6], b[7])) / 2) return 0;
        const intersection = polygonArea(polygonIntersection(footprint(a), footprint(b))) * height;
        return Math.max(0, Math.min(1, intersection / (ga.volume + gb.volume - intersection)));
    }

    function auditCuboid(box, allBoxes = [], ground = null, profiles = DIMENSION_SPECS) {
        const geom = parseCVAT16Points(box.points), issues = [];
        const add = (severity, code, message, measured, expected) => issues.push({ severity, code, message, measured, expected });
        if (!geom) { add('CRITICAL', 'INVALID_POINTS', 'Non-finite coordinates or non-positive dimensions'); return { geom, issues }; }
        const label = box.label_name || box.labelName;
        const subType = box.subType || box.attributes?.type;
        const spec = resolveDimensionSpec(label, subType, profiles);
        const typeLabel = subType ? `${label} (${subType})` : (label || 'unknown');
        if (!spec) add('INFO', 'NO_CLASS_RULE', `No standard dimension rule configured for ${typeLabel}`);
        if (spec) {
            for (const [name, short, value] of [['LENGTH', 'L', geom.length], ['WIDTH', 'W', geom.width], ['HEIGHT', 'H', geom.height]]) {
                const lo = spec['min' + short], hi = spec['max' + short];
                if (value < lo) add('WARNING', 'UNDERSIZED_' + name, `${short} ${value.toFixed(2)}m < ${lo}m (${typeLabel})`, value, lo);
                if (value > hi) add('WARNING', 'OVERSIZED_' + name, `${short} ${value.toFixed(2)}m > ${hi}m (${typeLabel})`, value, hi);
            }
            if (geom.length < geom.width && ['vehicles', 'two-wheels'].includes(label))
                add('WARNING', 'AXIS_SWAPPED', 'Length is smaller than width: check heading/axes', geom.length / geom.width, 'L ≥ W');
        }
        let groundZ = null, deltaZ = null;
        if (ground && ground.accepted !== false && (ground.confidence == null || ground.confidence >= 0.65)) {
            groundZ = ground.getTargetZ(geom.center[0], geom.center[1]);
            deltaZ = Math.min(...geom.vertices.map(([x, y, z]) => z - ground.getTargetZ(x, y)));
            const tolerance = Math.max(0.15, (ground.rmse || 0) * 3);
            if (deltaZ < -tolerance) add('CRITICAL', 'SUBMERGED_GROUND', `Bottom submerged ${(-deltaZ * 100).toFixed(0)}cm below ground`, deltaZ, -tolerance);
            if (deltaZ > tolerance) add('WARNING', 'FLOATING_GROUND', `Bottom floating ${(deltaZ * 100).toFixed(0)}cm above ground`, deltaZ, tolerance);
        }
        if (geom.rotation.slice(0, 2).some(r => Math.abs(r) > 1e-4))
            add('INFO', 'OVERLAP_UNSUPPORTED_TILT', 'Overlap check unsupported for boxes with pitch/roll');
        for (const other of allBoxes) {
            if (idOf(other) === idOf(box)) continue;
            const iou = orientedIoU(box.points, other.points);
            if (iou !== null && iou > 0.15)
                add(iou > 0.5 ? 'CRITICAL' : 'WARNING', 'DUPLICATE_COLLISION', `Collision with Box #${idOf(other)}: IoU ${(iou * 100).toFixed(1)}%`, iou, 0.15);
        }
        return { geom, issues, groundZ, deltaZ };
    }

    function auditFrame(boxes, groundById = {}, profiles = DIMENSION_SPECS) {
        const issues = [];
        for (const box of boxes) {
            const id = idOf(box), result = auditCuboid(box, [], groundById[id], profiles);
            result.issues.forEach(issue => issues.push({ ...issue, id: `${id}:${issue.code}`, boxId: id, boxIds: [id], label: box.label_name || box.labelName }));
        }
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
            const iou = orientedIoU(boxes[i].points, boxes[j].points);
            if (iou !== null && iou > 0.15) {
                const a = idOf(boxes[i]), b = idOf(boxes[j]);
                issues.push({
                    id: `${Math.min(a, b)}:${Math.max(a, b)}:OVERLAP`, boxId: a, boxIds: [a, b], code: 'DUPLICATE_COLLISION',
                    severity: iou > 0.5 ? 'CRITICAL' : 'WARNING', label: boxes[i].label_name || boxes[i].labelName,
                    measured: iou, expected: 0.15, message: `Box #${a} overlaps #${b}: IoU ${(iou * 100).toFixed(1)}%`
                });
            }
        }
        return issues;
    }

    function estimateLocalGround(points, box, radius = 8) {
        const geom = parseCVAT16Points(box.points);
        const reject = reason => ({ accepted: false, confidence: 0, reason, source: 'point-cloud' });
        if (!geom) return reject('Invalid box coordinates');
        const [x, y] = geom.center, c = Math.cos(box.points[5]), s = Math.sin(box.points[5]), patches = new Map();
        for (const p of points) {
            const dx = p[0] - x, dy = p[1] - y;
            if (Math.hypot(dx, dy) > radius || (Math.abs(c * dx + s * dy) <= geom.length / 2 + 0.35 && Math.abs(-s * dx + c * dy) <= geom.width / 2 + 0.35)) continue;
            const key = `${Math.floor(p[0] / 0.6)},${Math.floor(p[1] / 0.6)}`;
            if (!patches.has(key)) patches.set(key, []); patches.get(key).push(p);
        }
        // One low representative per XY patch: dense vehicle surfaces do not
        // outvote sparse road returns simply because they contain more points.
        const candidates = [...patches.values()].map(a => { a.sort((a, b) => a[2] - b[2]); return a[Math.floor((a.length - 1) * 0.1)]; });
        if (candidates.length < 30) return reject('Insufficient ground patch candidates around box');
        let seed = 1103, best = [];
        const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 400; i++) {
            const plane = fitPlane(Array.from({ length: 3 }, () => candidates[Math.floor(random() * candidates.length)]));
            if (!plane || Math.hypot(plane.a, plane.b) > 0.25) continue;
            const inliers = candidates.filter(p => Math.abs(p[2] - plane.getTargetZ(p[0], p[1])) < 0.055);
            if (inliers.length > best.length) best = inliers;
        }
        const plane = fitPlane(best);
        if (!plane || best.length < 24 || best.length / candidates.length < 0.35 || Math.hypot(plane.a, plane.b) > 0.25)
            return reject('Cannot segment stable ground plane');
        if (new Set(best.map(p => `${p[0] >= x},${p[1] >= y}`)).size < 3)
            return reject('Ground points distributed on one side only');
        const rmse = Math.sqrt(best.reduce((v, p) => v + (p[2] - plane.getTargetZ(p[0], p[1])) ** 2, 0) / best.length);
        if (rmse > 0.04) return reject('Ground plane fit RMSE too high (> 4cm)');
        const confidence = Math.min(0.99, 0.7 * best.length / candidates.length + 0.3 * Math.min(1, best.length / 150));
        return {
            ...plane, accepted: true, confidence, rmse, inlierCount: best.length, candidateCount: candidates.length, radius,
            source: 'point-cloud', method: 'spatial-lower-envelope-ransac', reason: 'Ground from lowest spatial grid cells, density-balanced'
        };
    }

    class GroundIndex {
        constructor(points, cellSize = 2) {
            this.cells = new Map(); this.cellSize = cellSize; this.count = 0;
            for (const p of points) {
                if (p.length < 3 || !p.slice(0, 3).every(Number.isFinite)) continue;
                const key = this.key(p[0], p[1]); if (!this.cells.has(key)) this.cells.set(key, []);
                const cell = this.cells.get(key); if (cell.length < 350) { cell.push(p); this.count++; }
            }
        }
        key(x, y) { return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`; }
        query(x, y, radius) {
            const points = [];
            for (let ix = Math.floor((x - radius) / this.cellSize); ix <= Math.floor((x + radius) / this.cellSize); ix++)
                for (let iy = Math.floor((y - radius) / this.cellSize); iy <= Math.floor((y + radius) / this.cellSize); iy++)
                    for (const p of this.cells.get(`${ix},${iy}`) || []) if (Math.hypot(p[0] - x, p[1] - y) <= radius) points.push(p);
            return points;
        }
        estimate(box, options = {}) {
            const g = parseCVAT16Points(box.points);
            if (!g) return { accepted: false, confidence: 0, reason: 'Invalid box coordinates' };
            const radius = Math.min(15, Math.max(8, Math.hypot(g.length, g.width) / 2 + 3));
            return estimateLocalGround(this.query(g.center[0], g.center[1], radius), box, radius);
        }
    }

    function extractBoxROI(points, currentBox, margin = 0.4) {
        const p = currentBox.points || currentBox, g = parseCVAT16Points(p);
        if (!g) throw new Error('Invalid box coordinates');
        const [rx, ry, rz] = g.rotation, c = Math.cos, s = Math.sin;
        return points.filter(point => {
            if (!point?.slice(0, 3).every(Number.isFinite)) return false;
            const x = point[0] - p[0], y = point[1] - p[1], z = point[2] - p[2];
            const a = c(rz) * x + s(rz) * y, b = -s(rz) * x + c(rz) * y;
            const u = c(ry) * a - s(ry) * z, v = s(ry) * a + c(ry) * z;
            return Math.abs(u) <= p[6] / 2 + margin && Math.abs(c(rx) * b + s(rx) * v) <= p[7] / 2 + margin && Math.abs(-s(rx) * b + c(rx) * v) <= p[8] / 2 + margin;
        });
    }

    function canManuallySnapGround(ground) {
        if (!ground || ground.accepted === false || ![ground.a, ground.b, ground.c].every(Number.isFinite) || Math.hypot(ground.a, ground.b) > 0.25) return false;
        return ground.confidence == null || ground.confidence >= 0.65 ||
            (ground.confidence >= 0.45 && ground.rmse <= 0.04 && ground.inlierCount >= 60);
    }

    function selectSeedCluster(points, currentBox, ground, distance = 0.55) {
        // A plausible plane may remove road returns without authorizing a ground snap.
        // Low support confidence is distinct from a bad plane fit.
        ground = canManuallySnapGround(ground) ? ground : null;
        const p = currentBox.points, bottom = p[2] - p[8] / 2;
        const candidates = points.filter(q => q.slice(0, 3).every(Number.isFinite) && q[2] > (ground ? ground.a * q[0] + ground.b * q[1] + ground.c : bottom) + 0.08);
        // Cluster 3D occupancy cells: XY projection can connect different heights.
        // Duplicate roof returns must not multiply neighborhood work.
        const voxel = 0.12, bins = new Map(), key = q => `${Math.floor(q[0] / voxel)},${Math.floor(q[1] / voxel)},${Math.floor(q[2] / voxel)}`;
        for (const q of candidates) { const k = key(q); if (!bins.has(k)) bins.set(k, { point: q, points: [] }); bins.get(k).points.push(q); }
        const entries = [...bins.values()], representatives = entries.map(e => e.point);
        const cells = new Map(), cellKey = q => `${Math.floor(q[0] / distance)},${Math.floor(q[1] / distance)},${Math.floor(q[2] / distance)}`;
        representatives.forEach((q, i) => { const k = cellKey(q); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(i); });
        const neighbors = i => {
            const q = representatives[i], v = [Math.floor(q[0] / distance), Math.floor(q[1] / distance), Math.floor(q[2] / distance)], out = [];
            for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++)
                for (const j of cells.get(`${v[0] + x},${v[1] + y},${v[2] + z}`) || [])
                    if ((q[0] - representatives[j][0]) ** 2 + (q[1] - representatives[j][1]) ** 2 + (q[2] - representatives[j][2]) ** 2 <= distance * distance) out.push(j);
            return out;
        };
        const seen = new Set(), seedSet = new Set(extractBoxROI(candidates, currentBox, 0.4)), clusters = [];
        for (let i = 0; i < representatives.length; i++) {
            if (seen.has(i)) continue; seen.add(i); const near = neighbors(i); if (near.length < 4) continue;
            const members = new Set([i, ...near]), queue = [...near];
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const j = queue[cursor]; if (seen.has(j)) continue; seen.add(j); const next = neighbors(j);
                if (next.length >= 4) for (const n of next) if (!members.has(n)) { members.add(n); queue.push(n); }
            }
            const cluster = [...members].flatMap(j => entries[j].points), overlap = cluster.filter(q => seedSet.has(q)).length;
            if (overlap) clusters.push({ cluster, overlap });
        }
        clusters.sort((a, b) => b.overlap - a.overlap || b.cluster.length - a.cluster.length);
        return clusters[0]?.cluster || [];
    }

    function fitSeededBox(points, classLabel, currentBox, neighborBoxes = []) {
        // Respect only the interior of existing neighboring annotations.
        // Seed points are always retained, including overlapping annotations.
        const seedPoints = new Set(extractBoxROI(points, currentBox, 0.4)), owned = new Set();
        for (const box of neighborBoxes) {
            if (!parseCVAT16Points(box.points)) continue;
            for (const q of extractBoxROI(points, box, -0.15)) if (!seedPoints.has(q)) owned.add(q);
        }
        const available = owned.size ? points.filter(q => !owned.has(q)) : points;
        let previous = null, lastError = null;
        const attempts = [];
        for (const radius of [0.55, 0.4, 0.3, 0.25, 0.2]) {
            const cluster = selectSeedCluster(available, currentBox, currentBox.ground, radius);
            try {
                const fitted = fitBoxToCluster(cluster, classLabel, { ...currentBox, rejectOversizedCluster: true });
                attempts.push({ radius, pointCount: cluster.length, status: 'valid' });
                const result = { cluster, fitted, radius, excludedNeighborPoints: owned.size, attempts };
                if (radius === 0.55) return result;
                // Do not accept a first smaller fragment just because it fits the class.
                // Require stable geometry at two successive radii.
                if (previous && orientedIoU(previous.fitted, fitted) >= 0.9) return { ...previous, attempts };
                previous = result;
            } catch (error) {
                attempts.push({ radius, pointCount: cluster.length, status: 'rejected', reason: error.message });
                lastError = error; previous = null;
                if (!/exceeds.*dimension|vượt kích thước|insufficient.*point|không đủ điểm|XY spread|phân bố XY/i.test(error.message)) throw error;
            }
        }
        throw new Error(lastError?.message || 'Unable to separate a stable vehicle cluster; please adjust preliminary box.');
    }

    function minimumRectangleYaw(points, initialYaw) {
        const sorted = points.map(p => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower = [], upper = [];
        for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
        for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
        const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
        if (hull.length < 3) return initialYaw;
        let best = Infinity, yaw = initialYaw;
        const angles = [initialYaw, ...hull.map((p, i) => Math.atan2(hull[(i + 1) % hull.length][1] - p[1], hull[(i + 1) % hull.length][0] - p[0]))];
        for (let angle of angles) {
            const cs = Math.cos(angle), sn = Math.sin(angle); let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
            for (const p of hull) { const x = cs * p[0] + sn * p[1], y = -sn * p[0] + cs * p[1]; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
            const l = xmax - xmin, w = ymax - ymin, area = l * w;
            if (w > l) angle += Math.PI / 2;
            if (area < best - 1e-8) { best = area; yaw = angle; }
        }
        return yaw;
    }

    function estimateVerticalHeading(points, initialYaw) {
        const voxels = new Map();
        for (const p of points) { const k = p.map(v => Math.floor(v / 0.08)).join(','); if (!voxels.has(k)) voxels.set(k, p); }
        let support = [...voxels.values()];
        if (support.length > 3500) { const step = Math.ceil(support.length / 3500); support = support.filter((_, i) => i % step === 0); }
        const reject = { accepted: false, yaw: initialYaw, reason: 'Insufficient vertical surfaces to determine heading axis' };
        if (support.length < 30) return reject;
        let seed = 1103, best = null;
        const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 512; i++) {
            const a = support[Math.floor(random() * support.length)], b = support[Math.floor(random() * support.length)];
            const dx = b[0] - a[0], dy = b[1] - a[1], norm = Math.hypot(dx, dy); if (norm < 0.6) continue;
            const nx = -dy / norm, ny = dx / norm, offset = nx * a[0] + ny * a[1], cells = new Set(), levels = new Set();
            let n = 0, zmin = Infinity, zmax = -Infinity, tmin = Infinity, tmax = -Infinity;
            for (const p of support) {
                if (Math.abs(nx * p[0] + ny * p[1] - offset) > 0.045) continue;
                const t = (dx * p[0] + dy * p[1]) / norm; n++; zmin = Math.min(zmin, p[2]); zmax = Math.max(zmax, p[2]); tmin = Math.min(tmin, t); tmax = Math.max(tmax, t);
                cells.add(`${Math.floor(t / 0.2)},${Math.floor(p[2] / 0.2)}`); levels.add(Math.floor(p[2] / 0.2));
            }
            if (n < 20 || n / support.length < 0.08 || levels.size < 4 || zmax - zmin < 0.5 || tmax - tmin < 0.6 || cells.size < 16) continue;
            if (!best || cells.size > best.score) best = { yaw: Math.atan2(dy, dx), score: cells.size, inlierCount: n, verticalSpan: zmax - zmin, normal: [nx, ny], offset };
        }
        if (!best) return reject;
        const c = Math.cos(best.yaw), s = Math.sin(best.yaw); let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
        for (const p of support) { const x = c * p[0] + s * p[1], y = -s * p[0] + c * p[1]; xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); }
        if (ymax - ymin > xmax - xmin) best.yaw += Math.PI / 2;
        while (best.yaw - initialYaw > Math.PI / 2) best.yaw -= Math.PI;
        while (best.yaw - initialYaw < -Math.PI / 2) best.yaw += Math.PI;
        return { ...best, accepted: true, method: 'vertical-surface-ransac', yaw: Math.atan2(Math.sin(best.yaw), Math.cos(best.yaw)) };
    }

    function autoFitSearchBox(currentBox, classLabel, ground, subType = null) {
        const original = currentBox.points || currentBox;
        const effectiveSub = subType || currentBox.subType || currentBox.attributes?.type;
        const resolved = resolveDimensionSpec(classLabel, effectiveSub);
        if (!resolved) throw new Error(`No dimension rule configured for class: ${classLabel}`);
        const p = original.slice(); p[3] = p[4] = p[5] = 0; p[6] = p[7] = Math.max(original[6], original[7], resolved.maxL) * 2;
        // Search height comes from class scale and ground, never an arbitrary 1m seed.
        const trusted = ground?.accepted && ground.confidence >= 0.65;
        if (trusted) { const bottom = ground.a * p[0] + ground.b * p[1] + ground.c; p[2] = bottom + resolved.maxH / 2; p[8] = resolved.maxH; }
        else p[8] = Math.max(original[8], 2 * resolved.maxH);
        return { points: p, margin: 0.4 };
    }

    class SpatialPointIndex {
        constructor(capacity, cellSize = 2) { this.coordinates = new Float32Array(capacity * 3); this.cells = new Map(); this.count = 0; this.cellSize = cellSize; }
        add(x, y, z) { if (!Number.isFinite(x + y + z)) return; const i = this.count++; this.coordinates.set([x, y, z], i * 3); const key = `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`; if (!this.cells.has(key)) this.cells.set(key, []); this.cells.get(key).push(i); }
        query(lo, hi) { const out = [], a = this.coordinates; for (let x = Math.floor(lo[0] / this.cellSize); x <= Math.floor(hi[0] / this.cellSize); x++) for (let y = Math.floor(lo[1] / this.cellSize); y <= Math.floor(hi[1] / this.cellSize); y++) for (const i of this.cells.get(`${x},${y}`) || []) { const j = i * 3; if (a[j] >= lo[0] && a[j] <= hi[0] && a[j + 1] >= lo[1] && a[j + 1] <= hi[1] && a[j + 2] >= lo[2] && a[j + 2] <= hi[2]) out.push([a[j], a[j + 1], a[j + 2]]); } return out; }
    }

    function fitBoxToCluster(points, classLabel, currentBox) {
        const original = currentBox.points || currentBox, ground = currentBox.ground;
        if (!parseCVAT16Points(original)) throw new Error('Invalid box coordinates');
        const effectiveSub = currentBox.subType || currentBox.attributes?.type;
        const resolved = resolveDimensionSpec(classLabel, effectiveSub);
        if (!resolved) throw new Error(`No dimension rule configured for class: ${classLabel}`);
        if (points.filter(p => p?.length >= 3 && p.slice(0, 3).every(Number.isFinite)).length < 10)
            throw new Error('Insufficient LiDAR points for Auto-Fit (minimum 10 points required)');
        const trusted = ground && ground.accepted !== false && (ground.confidence == null || ground.confidence >= 0.65);
        if (!trusted && !currentBox.allowGroundFallback)
            throw new Error('Ground confidence too low for Auto-Fit' + (ground?.reason ? ': ' + ground.reason : ''));
        if (trusted && ![ground.a, ground.b, ground.c].every(Number.isFinite))
            throw new Error('Invalid ground plane for Auto-Fit');
        const plane = trusted ? makePlane(ground.a, ground.b, ground.c) : makePlane(0, 0, original[2] - original[8] / 2);
        const cluster = points.filter(p => p?.length >= 3 && p.slice(0, 3).every(Number.isFinite) && p[2] >= plane.getTargetZ(p[0], p[1]) + 0.08);
        if (cluster.length < 10)
            throw new Error('Insufficient LiDAR points for Auto-Fit (minimum 10 points required)');
        const bins = new Map(); for (const p of cluster) { const k = `${Math.floor(p[0] / 0.05)},${Math.floor(p[1] / 0.05)}`; if (!bins.has(k)) bins.set(k, p); }
        const support = [...bins.values()];
        const mx = support.reduce((a, p) => a + p[0], 0) / support.length, my = support.reduce((a, p) => a + p[1], 0) / support.length;
        let xx = 0, yy = 0, xy = 0;
        for (const p of support) { const x = p[0] - mx, y = p[1] - my; xx += x * x; yy += y * y; xy += x * y; }
        const spread = xx + yy;
        if (spread < 1e-9) throw new Error('Point cluster lacks sufficient XY spread for Auto-Fit');
        let yaw = Math.hypot(xx - yy, 2 * xy) / spread < 0.1 ? original[5] : 0.5 * Math.atan2(2 * xy, xx - yy);
        if (Math.hypot(xx - yy, 2 * xy) / spread >= 0.1) yaw = minimumRectangleYaw(cluster, yaw);
        const surface = estimateVerticalHeading(cluster, original[5]);
        if (surface.accepted) yaw = surface.yaw;
        while (yaw - original[5] > Math.PI / 2) yaw -= Math.PI;
        while (yaw - original[5] < -Math.PI / 2) yaw += Math.PI;
        yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, zmax = -Infinity;
        for (const p of cluster) {
            const x = cs * (p[0] - mx) + sn * (p[1] - my), y = -sn * (p[0] - mx) + cs * (p[1] - my);
            xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, y); ymax = Math.max(ymax, y); zmax = Math.max(zmax, p[2]);
        }
        if (surface.accepted && cluster.length >= 100) {
            // Side/front evidence: trim rare lateral returns (mirrors/noise),
            // but keep sparse longitudinal tips when the far end is occluded.
            const lateral = cluster.map(p => -sn * (p[0] - mx) + cs * (p[1] - my)).sort((a, b) => a - b);
            ymin = lateral[Math.floor((lateral.length - 1) * 0.01)] - 0.04;
            ymax = lateral[Math.ceil((lateral.length - 1) * 0.99)] + 0.04;
            xmin -= 0.04; xmax += 0.04; zmax += 0.02;
        }
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const typeName = effectiveSub ? `${classLabel} (${effectiveSub})` : classLabel;
        if ((classLabel === 'vehicles' || currentBox.rejectOversizedCluster) &&
            (xmax - xmin > resolved.maxL + 0.1 || ymax - ymin > resolved.maxW + 0.1 || zmax - plane.getTargetZ(mx, my) > resolved.maxH + 0.1)) {
            throw new Error(`Cluster exceeds ${typeName} dimensions (max: ${resolved.maxL}x${resolved.maxW}x${resolved.maxH}m); may include adjacent objects.`);
        }
        const l = clamp(xmax - xmin, resolved.minL, resolved.maxL);
        const w = clamp(ymax - ymin, classLabel === 'two-wheels' ? Math.max(0.6, resolved.minW) : resolved.minW, resolved.maxW);
        const cx = mx + cs * (xmin + xmax) / 2 - sn * (ymin + ymax) / 2, cy = my + sn * (xmin + xmax) / 2 + cs * (ymin + ymax) / 2;
        const footprintPoints = [[l / 2, w / 2], [l / 2, -w / 2], [-l / 2, w / 2], [-l / 2, -w / 2]];
        const bottom = Math.max(...footprintPoints.map(([x, y]) => plane.getTargetZ(cx + cs * x - sn * y, cy + sn * x + cs * y)));
        const h = clamp(zmax - bottom, resolved.minH, resolved.maxH), result = original.slice();
        while (result.length < 16) result.push(0);
        result.splice(0, 9, cx, cy, bottom + h / 2, 0, 0, yaw, l, w, h);
        if (!trusted) { result[2] = original[2]; result[8] = original[8]; }
        if (classLabel === 'vehicles' && result[8] > resolved.maxH) {
            throw new Error(`Box height exceeds ${typeName} profile; ground confidence insufficient to adjust height.`);
        }
        return result.slice(0, 16);
    }

    const api = {
        VEHICLE_SUBTYPES, BASE_DIMENSION_SPECS, resolveDimensionSpec,
        fitSeededBox, canManuallySnapGround, estimateLocalGround, estimateVerticalHeading, autoFitSearchBox,
        SpatialPointIndex, minimumRectangleYaw, selectSeedCluster, extractBoxROI, fitBoxToCluster,
        DIMENSION_SPECS, idOf, parseCVAT16Points, cuboidVertices, rotateYawPoints, makePlane, fitPlane,
        estimateRoadPlane, snapGroundPoints, footprint, polygonArea, polygonIntersection, orientedIoU,
        auditCuboid, auditFrame, GroundIndex
    };
    root.__CVAT_COPILOT_MATH = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
