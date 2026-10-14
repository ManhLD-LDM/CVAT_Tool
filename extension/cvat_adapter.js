/* CVAT 2.76 adapter. Uses ObjectState.save + native Redux update/history.
 * No REST writes, server/client ID guessing or position-based mesh matching.
 */
(function (root) {
    'use strict';
    function createCvatAdapter(env = {}) {
        const win = env.window || root, doc = env.document || win.document;
        const math = env.math || win.__CVAT_COPILOT_MATH;
        const later = env.delay || (ms => new Promise(resolve => win.setTimeout(resolve, ms)));
        const sessionId = `c3d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        let store = env.store || null, canvas = null, unsubscribe = null, interval = null, disposed = false;
        let signature = '', revision = 0, scope = '', currentSnapshot = null;
        let lastFitCase = null;
        let cloudKey = '', cloudIndex = null, spatialIndex = null, cloudLoading = null, groundCache = new Map();
        let qcColors = new Map(), colorView = null, originalColor = null, colorWrapper = null, cameraRestore = null;
        const listeners = new Set(), pendingObjects = new Set();
        const keys = new Set();
        let flightFrame = null, lastFlightTime = 0, looking = false;

        function discoverStore() {
            for (const candidate of [win.__store__, win.__REDUX_STORE__]) if (validStore(candidate)) return candidate;
            const element = doc?.getElementById('root') || doc?.getElementById('cvat-app');
            if (!element) return null;
            const queue = [];
            for (const key of Object.keys(element)) if (/^(__reactContainer|__reactFiber|_reactRootContainer)/.test(key)) queue.push(element[key]);
            const seen = new Set();
            for (let count = 0; queue.length && count < 12000; count++) {
                const node = queue.shift(); if (!node || seen.has(node)) continue; seen.add(node);
                for (const value of [node.memoizedProps?.store, node.memoizedProps?.value?.store, node.stateNode?.store,
                    node.memoizedState?.store, node.memoizedState?.memoizedState?.store]) if (validStore(value)) return value;
                for (const child of [node.current, node._internalRoot?.current, node.stateNode?.current, node.child, node.sibling, node.return, node.alternate])
                    if (child && !seen.has(child)) queue.push(child);
            }
            return null;
        }
        function validStore(candidate) { return !!candidate && typeof candidate.getState === 'function' && typeof candidate.dispatch === 'function'; }
        function editor() { return store?.getState()?.annotation; }
        function publish() {
            if (disposed) return;
            const snapshot = getSnapshot();
            const serialized = JSON.stringify(snapshot);
            if (serialized !== JSON.stringify(currentSnapshot)) {
                currentSnapshot = snapshot;
                listeners.forEach(fn => fn(snapshot));
            }
        }
        function resolveAttributes(state) {
            const raw = state?.attributes || {};
            const labelAttrs = state?.label?.attributes || [];
            const attrMap = {};
            const idToName = new Map();
            for (const attr of labelAttrs) {
                if (attr && attr.id != null) {
                    idToName.set(String(attr.id), attr.name);
                    idToName.set(Number(attr.id), attr.name);
                }
            }
            for (const [key, val] of Object.entries(raw)) {
                const name = idToName.get(key) || idToName.get(Number(key)) || key;
                attrMap[name] = val;
            }
            return attrMap;
        }
        function resolveSubType(state, attrs = null) {
            const resolved = attrs || resolveAttributes(state);
            const candidate = resolved.type || resolved.vehicle_type || resolved.subtype || resolved.sub_type || resolved.category;
            if (candidate) return String(candidate).trim().toLowerCase();
            const knownSubtypes = ['car', 'truck', 'bus', 'van', 'contruction', 'construction', 'pickup', 'trailer', 'tricycle', 'stroller', 'wheelchair', 'other'];
            for (const val of Object.values(resolved)) {
                if (typeof val === 'string' && knownSubtypes.includes(val.trim().toLowerCase())) {
                    return val.trim().toLowerCase();
                }
            }
            return null;
        }
        function connect() {
            const found = discoverStore();
            if (found && found !== store) {
                unsubscribe?.(); store = found;
                unsubscribe = store.subscribe?.(publish) || null;
            } else if (store && !unsubscribe) unsubscribe = store.subscribe?.(publish) || null;
            canvas = editor()?.canvas?.instance || null;
            publish();
        }
        function getSnapshot() {
            const ann = editor(), job = ann?.job?.instance;
            canvas = ann?.canvas?.instance || null;
            const jobId = Number(job?.id || win.location?.pathname?.match(/\/jobs\/(\d+)/)?.[1]) || null;
            const frame = ann?.player?.frame?.number ?? null;
            const nextScope = `${jobId}:${frame}`;
            if (nextScope !== scope) {
                scope = nextScope; lastFitCase=null; cloudIndex = null; spatialIndex = null; cloudKey = ''; cloudLoading = null; groundCache.clear();
                clearAppearance(); stopCamera();
            }
            const states = (ann?.annotations?.states || []).filter(s => s.shapeType === 'cuboid' && !s.outside &&
                (s.frame == null || s.frame === frame));
            const boxes = states.map(s => {
                const attrs = resolveAttributes(s);
                const subType = resolveSubType(s, attrs);
                return { id: s.clientID, clientId: s.clientID, serverId: s.serverID ?? null,
                    objectType: s.objectType, frame, points: Array.from(s.points || []), labelId: s.label?.id ?? null,
                    label_name: s.label?.name || 'Unknown', labelColor: s.label?.color || '#94a3b8',
                    attributes: attrs, subType,
                    locked: !!s.lock, hidden: !!s.hidden, groundTruth: !!s.isGroundTruth };
            });
            const geometrySignature = JSON.stringify([jobId, frame, boxes]);
            if (geometrySignature !== signature) { signature = geometrySignature; revision++; }
            let saveState = 'unknown';
            try {
                const unsaved = job?.annotations?.hasUnsavedChanges?.();
                if (typeof unsaved === 'boolean') saveState = unsaved ? 'unsaved' : 'saved';
                if (ann?.annotations?.saving?.uploading || ann?.annotations?.saving === true) saveState = 'saving';
            } catch (_) { /* not exposed by this build */ }
            const views = canvas?.view?.views;
            const is3D = job?.dimension === '3d' || (!job?.dimension && ann?.workspace === 'standard3d');
            return { sessionId, mode: 'live', connected: !!ann && !!job && !!canvas && is3D, jobId, frame, revision,
                activeBoxId: ann?.annotations?.activatedStateID ?? null, boxes,
                labels: (job?.labels || []).map(l => ({ id: l.id, name: l.name, color: l.color })), saveState,
                freeCam: !!cameraRestore, pointCount: cloudIndex?.count || 0,
                capabilities: { read: !!ann, selection: !!canvas?.activate && !!canvas?.html,
                    edit: !!store && states.some(s => typeof s.save === 'function') && typeof job?.actions?.get === 'function',
                    appearance: !!canvas?.view?.drawnObjects && typeof canvas?.view?.receiveShapeColor === 'function',
                    ground: !!views?.perspective?.scene, freeCam: !!views?.perspective?.camera && !!views?.perspective?.controls },
                reason: ann ? (!is3D ? 'Only 3D jobs are supported' : canvas ? '' : 'Waiting for 3D canvas') : 'Compatible CVAT editor not found' };
        }
        function validate(ref, forEdit = false) {
            const snap = getSnapshot();
            if (!snap.connected) throw new Error(snap.reason || 'CVAT editor not connected');
            if (ref.sessionId !== sessionId || Number(ref.jobId) !== snap.jobId || ref.frame !== snap.frame)
                throw new Error('Job or frame changed; please reselect box');
            if (forEdit && ref.revision !== snap.revision) throw new Error('Box modified; please retry from newest state');
            const target = editor().annotations.states.find(s => s.clientID === ref.clientId && s.shapeType === 'cuboid' && !s.outside);
            if (!target || (target.frame != null && target.frame !== snap.frame)) throw new Error('Box is no longer in current frame');
            if (forEdit && (target.lock || target.isGroundTruth || String(editor().workspace).toLowerCase() === 'review')) throw new Error('Box is locked or workspace is in review mode');
            if (forEdit && typeof canvas.mode === 'function' && canvas.mode() !== 'idle') throw new Error('Finish current drawing/drag interaction first');
            return { target, snap };
        }
        function focusObject(target) {
            const view=canvas?.view?.views?.perspective,cam=view?.camera,controls=view?.controls;
            if(!cam?.getWorldDirection || !controls){
                if(typeof canvas.focus==='function'){canvas.focus(target.clientID);return true;}
                return false;
            }
            stopCamera();
            const center=cam.position.clone().set(...target.points.slice(0,3));
            const direction=cam.getWorldDirection(cam.position.clone()).normalize();
            const radius=Math.hypot(...target.points.slice(6,9))/2;
            const vertical=(cam.fov||50)*Math.PI/360;
            const angle=Math.min(vertical,Math.atan(Math.tan(vertical)*(cam.aspect||1)));
            const distance=Math.max(radius*1.25/Math.sin(angle),radius+(cam.near||.1)*2);
            const position=center.clone().addScaledVector(direction,-distance);
            if(typeof controls.setLookAt==='function'){
                controls.setLookAt(position.x,position.y,position.z,center.x,center.y,center.z,false);
                controls.update?.(0);
            }else if(controls.target?.copy){
                cam.position.copy(position);controls.target.copy(center);cam.lookAt(center);controls.update?.();
            }else return false;
            canvas.render?.();
            return true;
        }
        function selectObject(ref, focus = false) {
            const { target } = validate(ref);
            const perspective = canvas.html().perspective;
            perspective.dispatchEvent(new win.CustomEvent('canvas.selected', { detail: { clientID: target.clientID } }));
            if (getSnapshot().activeBoxId !== target.clientID) throw new Error('CVAT did not accept selection; verify editor state');
            const focused=focus?focusObject(target):false;
            const row = doc?.getElementById(`cvat-objects-sidebar-state-item-${target.clientID}`);
            row?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
            publish(); return { selected: target.clientID,focused,...(focus&&!focused?{message:'Box selected; unable to access 3D camera to focus'}:{}) };
        }
        async function updateObject(ref, changes) {
            const { target, snap } = validate(ref, true), job = editor().job.instance;
            if (pendingObjects.size) throw new Error('Previous operation in progress');
            if (typeof target.save !== 'function' || typeof job.actions?.get !== 'function') throw new Error('This build does not support native editing');
            const oldPoints = Array.from(target.points), oldLabel = target.label;
            pendingObjects.add(target.clientID);
            let committed = false;
            try {
                if (changes.points) {
                    if (!math.parseCVAT16Points(changes.points)) throw new Error('Invalid box coordinates');
                    target.points = Array.from(changes.points);
                }
                if (changes.labelId != null) {
                    const label = job.labels.find(l => l.id === changes.labelId);
                    if (!label) throw new Error('Class does not belong to task');
                    target.label = label;
                }
                // Same ObjectState.save + UPDATE_ANNOTATIONS_SUCCESS route as
                // CVAT 2.76 updateAnnotationsAsync. It records native history.
                const saved = await target.save();
                committed = true;
                const history = await job.actions.get();
                const current = getSnapshot();
                if (current.jobId === snap.jobId && current.frame === snap.frame) {
                    store.dispatch({ type: 'UPDATE_ANNOTATIONS_SUCCESS', payload: { states: [saved], history } });
                    if (changes.points) {
                        const actual = getSnapshot().boxes.find(b => b.id === target.clientID);
                        if (!actual || JSON.stringify(actual.points) !== JSON.stringify(changes.points)) throw new Error('CVAT did not confirm updated geometry');
                    }
                    if (changes.labelId != null && getSnapshot().boxes.find(b => b.id === target.clientID)?.labelId !== changes.labelId)
                        throw new Error('CVAT did not confirm updated class');
                } else {
                    publish(); return { applied: true, previousFrame: true, saveState: 'unsaved', message: 'Updated previous frame; current frame has changed' };
                }
                publish();
                return { applied: true, saveState: getSnapshot().saveState, revision: getSnapshot().revision };
            } catch (error) {
                // Revert only the same ObjectState's uncommitted input. A saved
                // replacement is owned by CVAT and must be reverted via Undo.
                const liveTarget = editor()?.annotations?.states?.find(s => s.clientID === target.clientID);
                if (!committed && liveTarget === target) { target.points = oldPoints; target.label = oldLabel; }
                if (committed) error = new Error('Core CVAT accepted edit but UI confirmation failed; verify box and use Undo if needed. ' + error.message);
                publish(); throw error;
            } finally { pendingObjects.delete(target.clientID); }
        }
        async function ensureCloud() {
            const views = canvas?.view?.views, scene = views?.perspective?.scene;
            if (!scene?.traverse) throw new Error('Cannot access frame point cloud');
            const clouds = [];
            scene.traverse(obj => { if ((obj.isPoints || obj.type === 'Points') && obj.geometry?.attributes?.position) clouds.push(obj); });
            if (!clouds.length) throw new Error('Point cloud has not finished loading');
            for(const obj of clouds)obj.updateWorldMatrix?.(true,false);
            const key = scope + ':' + clouds.map(o => `${o.uuid}:${o.geometry.attributes.position.count}:${o.geometry.attributes.position.version || 0}:${o.matrixWorld?.elements?.join(',')||''}`).join('|');
            if (cloudIndex && cloudKey === key) return cloudIndex;
            if (cloudLoading?.key === key) return cloudLoading.promise;
            const requestedScope = scope;
            const promise = (async () => {
                const points = [], total = clouds.reduce((n, o) => n + o.geometry.attributes.position.count, 0);
                const step = Math.max(1, Math.ceil(total / 160000));
                const spatial=new math.SpatialPointIndex(total);
                let scanned=0;
                for (const obj of clouds) {
                    obj.updateWorldMatrix?.(true, false);
                    const attr = obj.geometry.attributes.position, e = obj.matrixWorld?.elements;
                    for (let i = 0; i < attr.count; i++) {
                        const x = attr.getX(i), y = attr.getY(i), z = attr.getZ(i);
                        const wx=e?e[0]*x+e[4]*y+e[8]*z+e[12]:x,wy=e?e[1]*x+e[5]*y+e[9]*z+e[13]:y,wz=e?e[2]*x+e[6]*y+e[10]*z+e[14]:z;
                        spatial.add(wx,wy,wz);
                        if(i%step===0)points.push([wx,wy,wz]);
                        if (++scanned % 32768 === 0) { await later(0); if (scope !== requestedScope) throw new Error('Frame changed while reading LiDAR'); }
                    }
                }
                if (scope !== requestedScope) throw new Error('Frame changed');
                spatialIndex=spatial; cloudIndex = new math.GroundIndex(points); cloudKey = key; groundCache.clear(); publish(); return cloudIndex;
            })();
            cloudLoading = { key, promise };
            try { return await promise; } finally { if (cloudLoading?.promise === promise) cloudLoading = null; }
        }
        function serializedGround(ground) {
            const { getTargetZ, ...dto } = ground; return dto;
        }
        async function extractLocalPoints(ref, margin = 0.4, searchBox = null) {
            validate(ref,true);
            await ensureCloud();
            const { target } = validate(ref,true);
            margin=Math.max(.3,Math.min(.5,margin));
            // Ground indexing is sampled; fitting scans the original buffers
            // so a sparse local object is not lost to global subsampling.
            const roi=searchBox||target;
            const expanded=Array.from(roi.points);
            for(let i=6;i<9;i++)expanded[i]+=2*margin;
            const vertices=math.cuboidVertices(expanded);
            const lo=[0,1,2].map(i=>Math.min(...vertices.map(p=>p[i]))),hi=[0,1,2].map(i=>Math.max(...vertices.map(p=>p[i])));
            const candidates=spatialIndex.query(lo,hi);
            validate(ref,true);
            return math.extractBoxROI(candidates,roi,margin);
        }
        async function getGrounds(ref, ids) {
            validate(ref); const requestedScope = scope, index = await ensureCloud();
            const result = {};
            for (const id of ids) {
                if (scope !== requestedScope) throw new Error('Frame changed; discarded obsolete ground result');
                const box = getSnapshot().boxes.find(b => b.id === id); if (!box) continue;
                const key = JSON.stringify([scope, id, box.points[0], box.points[1], ...box.points.slice(3, 8)]);
                if (!groundCache.has(key)) { groundCache.set(key, index.estimate(box)); await later(0); }
                result[id] = serializedGround(groundCache.get(key));
            }
            return result;
        }
        function clearAppearance() {
            if (colorView && originalColor) {
                if (colorView.receiveShapeColor === colorWrapper) colorView.receiveShapeColor = originalColor;
                for (const record of Object.values(colorView.drawnObjects || {})) {
                    if (record.cuboid?.setColor && record.data) record.cuboid.setColor(originalColor.call(colorView, record.data));
                }
            }
            qcColors.clear(); colorView = null; originalColor = null; colorWrapper = null;
        }
        function setAppearance(colors) {
            const view = canvas?.view;
            if (!view?.drawnObjects || typeof view.receiveShapeColor !== 'function') throw new Error('Canvas does not support QC color layer');
            if (view !== colorView) {
                clearAppearance(); colorView = view; originalColor = view.receiveShapeColor;
                colorWrapper = function (state) { return qcColors.get(state.clientID) || originalColor.call(this, state); };
                view.receiveShapeColor = colorWrapper;
            }
            qcColors = new Map(colors.map(({ id, color }) => [id, color]));
            for (const [id, record] of Object.entries(view.drawnObjects)) {
                const state = editor().annotations.states.find(s => s.clientID === Number(id));
                if (state) record.cuboid.setColor(qcColors.get(Number(id)) || originalColor.call(view, state));
            }
            canvas.render?.(); return { colored: qcColors.size };
        }
        const editable = target => !!target?.closest?.('input,textarea,select,[contenteditable="true"],[role="dialog"]');
        function keyDown(event) {
            if (!cameraRestore || editable(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.code === 'Escape') { stopCamera(); publish(); return; }
            if (['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight'].includes(event.code)) {
                keys.add(event.code); event.preventDefault(); event.stopImmediatePropagation();
            }
        }
        function keyUp(event) { keys.delete(event.code); }
        function clearKeys() { keys.clear(); looking = false; }
        function pointerDown(event) {
            if (cameraRestore && event.target === cameraRestore.view.renderer.domElement && event.button === 2) {
                looking = true; event.preventDefault(); event.stopImmediatePropagation();
            }
        }
        function pointerUp() { looking = false; }
        function pointerMove(event) {
            if (!cameraRestore || !looking) return;
            const camera = cameraRestore.view.camera, up = camera.position.clone().set(0,0,1);
            const yaw = camera.quaternion.clone().setFromAxisAngle(up, -(event.movementX || 0) * 0.003);
            camera.quaternion.premultiply(yaw);
            const right = camera.position.clone().set(1,0,0).applyQuaternion(camera.quaternion);
            const pitch = camera.quaternion.clone().setFromAxisAngle(right, -(event.movementY || 0) * 0.003);
            const candidate = camera.quaternion.clone().premultiply(pitch), forward = camera.position.clone().set(0,0,-1).applyQuaternion(candidate);
            if (Math.abs(forward.z) < 0.99) camera.quaternion.copy(candidate);
            event.preventDefault(); event.stopImmediatePropagation();
        }
        function contextMenu(event) { if (cameraRestore && event.target === cameraRestore.view.renderer.domElement) { event.preventDefault(); event.stopImmediatePropagation(); } }
        function flight(time) {
            if (!cameraRestore || disposed) return;
            const dt = lastFlightTime ? Math.min(0.05, (time-lastFlightTime)/1000) : 0; lastFlightTime = time;
            const camera = cameraRestore.view.camera, speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 18 : 6) * dt;
            if (!doc?.hidden && !editable(doc?.activeElement)) {
                const forward = camera.position.clone().set(0,0,-1).applyQuaternion(camera.quaternion);
                const right = camera.position.clone().set(1,0,0).applyQuaternion(camera.quaternion);
                const direction = camera.position.clone().set(0,0,0);
                direction.addScaledVector(forward, (keys.has('KeyW') ? 1:0)-(keys.has('KeyS') ? 1:0));
                direction.addScaledVector(right, (keys.has('KeyD') ? 1:0)-(keys.has('KeyA') ? 1:0));
                direction.z += (keys.has('KeyE') ? 1:0)-(keys.has('KeyQ') ? 1:0);
                if (direction.lengthSq()) camera.position.addScaledVector(direction.normalize(), speed);
                camera.updateMatrixWorld?.();
            }
            flightFrame = win.requestAnimationFrame(flight);
        }
        function stopCamera() {
            if (!cameraRestore) return;
            const { view, enabled } = cameraRestore, cam = view.camera;
            const target = cam.position.clone().add(cam.position.clone().set(0,0,-1).applyQuaternion(cam.quaternion).multiplyScalar(10));
            view.controls.setLookAt?.(cam.position.x,cam.position.y,cam.position.z,target.x,target.y,target.z,false);
            view.controls.enabled = enabled;
            win.cancelAnimationFrame?.(flightFrame); cameraRestore = null; lastFlightTime = 0; clearKeys();
        }
        function setFreeCamera(enabled) {
            if (!enabled) { stopCamera(); publish(); return { enabled: false }; }
            if (cameraRestore) return { enabled: true };
            const view = canvas?.view?.views?.perspective;
            if (!view?.camera || !view?.controls || !win.requestAnimationFrame) throw new Error('Cannot access perspective camera');
            cameraRestore = { view, enabled: view.controls.enabled };
            view.controls.enabled = false; flightFrame = win.requestAnimationFrame(flight); publish(); return { enabled: true };
        }
        async function command(type, payload = {}) {
            if (disposed) throw new Error('Adapter is stopped');
            switch (type) {
                case 'GET_SNAPSHOT': connect(); return getSnapshot();
                case 'SELECT_OBJECT': return selectObject(payload.ref, !!payload.focus);
                case 'ROTATE': { const { target } = validate(payload.ref,true); if (![-90,90,180].includes(payload.degrees)) throw new Error('Unsupported rotation angle'); return updateObject(payload.ref,{points:math.rotateYawPoints(target.points,payload.degrees)}); }
                case 'SET_LABEL': return updateObject(payload.ref,{labelId:payload.labelId});
                case 'EXPORT_FIT_CASE': {
                    const {target,snap}=validate(payload.ref);
                    if(!lastFitCase||lastFitCase.jobId!==snap.jobId||lastFitCase.frame!==snap.frame||lastFitCase.clientId!==target.clientID)
                        throw new Error('Run Auto-Fit on this box first, adjust manually, then export case');
                    return {...lastFitCase,exportedAt:new Date().toISOString(),currentBox:{points:Array.from(target.points),label:target.label.name},currentBoxRole:'user-reviewed candidate; not automatically certified ground truth'};
                }
                case 'AUTO_FIT': {
                    const now=()=>win.performance?.now?.()??Date.now(),started=now();
                    validate(payload.ref,true);
                    const grounds = await getGrounds(payload.ref,[payload.ref.clientId]);
                    const groundDone=now();
                    const { target } = validate(payload.ref,true);
                    const attrs = resolveAttributes(target);
                    const subType = resolveSubType(target, attrs);
                    const spec = math.resolveDimensionSpec ? math.resolveDimensionSpec(target.label.name, subType) : math.DIMENSION_SPECS[target.label.name];
                    if(!spec)throw new Error(`No dimension rule configured for class: ${target.label.name}${subType ? ` (${subType})` : ''}`);
                    const ground=grounds[target.clientID],trusted=ground?.accepted&&ground.confidence>=.65;
                    const searchBox=math.autoFitSearchBox(target,target.label.name,ground,subType),search=searchBox.points;
                    const points = await extractLocalPoints(payload.ref,.4,searchBox);
                    const roiDone=now();
                    validate(payload.ref,true);
                    lastFitCase={schema:'cvat-3d-tool-fit-case/v1',toolVersion:'1.6.0',jobId:payload.ref.jobId,frame:payload.ref.frame,clientId:target.clientID,
                        coordinateSystem:'world metres, Z up, Euler XYZ radians',seedBox:{points:Array.from(target.points),label:target.label.name,subType,attributes:attrs},
                        searchBox:{points:search,margin:.4},ground,roiPoints:points,groundSupport:cloudIndex.query(target.points[0],target.points[1],15),
                        parameters:{clusterRadius:.55,xyzVoxel:.12,groundOffset:.08},status:'fit-started'};
                    const neighbors=getSnapshot().boxes.filter(b=>b.id!==target.clientID);
                    lastFitCase.neighborBoxes=neighbors.map(b=>({id:b.id,points:b.points,label:b.label_name,subType:b.subType}));
                    const selection=math.fitSeededBox(points,target.label.name,{points:target.points,ground,allowGroundFallback:true,subType,attributes:attrs},neighbors);
                    const {cluster,fitted}=selection,clusterDone=now();
                    lastFitCase.parameters.selectedClusterRadius=selection.radius;
                    lastFitCase.selection={excludedNeighborPoints:selection.excludedNeighborPoints,attempts:selection.attempts};
                    lastFitCase.clusterPoints=cluster;lastFitCase.fittedBox={points:fitted.slice(),label:target.label.name,subType};
                    // Preserve the measured local plane when the fitted footprint remains
                    // inside its surveyed region. Re-estimating with a larger exclusion
                    // footprint can otherwise lose the same road evidence.
                    if(math.canManuallySnapGround(ground) && Number.isFinite(ground.radius) &&
                       math.cuboidVertices(fitted).every(v=>Math.hypot(v[0]-target.points[0],v[1]-target.points[1])<=ground.radius)){
                        const fittedKey=JSON.stringify([scope,target.clientID,fitted[0],fitted[1],...fitted.slice(3,8)]);
                        groundCache.set(fittedKey,{...ground,reusedFromAutoFit:true});
                    }
                    const fitDone=now(),updated=await updateObject(payload.ref,{points:fitted}),done=now();
                    if(lastFitCase){lastFitCase.status='applied';lastFitCase.elapsedMs=done-started;}
                    return {...updated,pointCount:cluster.length,groundFallback:!trusted,groundReason:ground?.reason,elapsedMs:done-started,
                        timingsMs:{groundAndIndex:groundDone-started,roi:roiDone-groundDone,cluster:clusterDone-roiDone,fit:fitDone-clusterDone,nativeSave:done-fitDone}};
                }
                case 'GET_GROUNDS': return getGrounds(payload.ref, payload.ids || [payload.ref.clientId]);
                case 'SNAP_GROUND': {
                    validate(payload.ref,true); const grounds = await getGrounds(payload.ref,[payload.ref.clientId]);
                    const ground = grounds[payload.ref.clientId];
                    if (!math.canManuallySnapGround(ground)) throw new Error('No sufficient quality ground plane to snap');
                    const { target } = validate(payload.ref,true), plane = math.makePlane(ground.a,ground.b,ground.c), snap = math.snapGroundPoints(target.points,plane);
                    if (Math.abs(snap.deltaZ) > 1.5 && !payload.allowLargeAdjustment) throw new Error('ΔZ > 1.5m: verify ground plane before snapping');
                    const result = await updateObject(payload.ref,{points:snap.newPoints}); return {...result,deltaZ:snap.deltaZ,confidence:ground.confidence};
                }
                case 'SET_QC_APPEARANCE': return setAppearance(payload.colors || []);
                case 'CLEAR_QC_APPEARANCE': clearAppearance(); return {cleared:true};
                case 'FREECAM': return setFreeCamera(!!payload.enabled);
                default: throw new Error('Unsupported command');
            }
        }
        function start() {
            connect(); interval = win.setInterval(connect, 1200);
            for (const [type, fn] of [['keydown',keyDown],['keyup',keyUp],['blur',clearKeys],['pointerdown',pointerDown],['pointerup',pointerUp],['pointermove',pointerMove],['contextmenu',contextMenu]]) win.addEventListener?.(type,fn,true);
        }
        function dispose() {
            if (disposed) return; disposed = true; unsubscribe?.(); win.clearInterval?.(interval); stopCamera(); clearAppearance(); listeners.clear();
            for (const [type, fn] of [['keydown',keyDown],['keyup',keyUp],['blur',clearKeys],['pointerdown',pointerDown],['pointerup',pointerUp],['pointermove',pointerMove],['contextmenu',contextMenu]]) win.removeEventListener?.(type,fn,true);
        }
        return {start,dispose,getSnapshot,command,extractLocalPoints,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},_connect:connect};
    }
    root.__CVAT_COPILOT_CREATE_ADAPTER = createCvatAdapter;
    if (typeof module !== 'undefined' && module.exports) module.exports = {createCvatAdapter};
})(typeof window !== 'undefined' ? window : globalThis);
