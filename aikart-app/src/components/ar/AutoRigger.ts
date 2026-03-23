import * as THREE from 'three';

// Helper: Calculate distance from point p to line segment ab
function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const ab = new THREE.Vector3().subVectors(b, a);
    const ap = new THREE.Vector3().subVectors(p, a);
    const lengthSq = ab.lengthSq();
    if (lengthSq === 0) return p.distanceTo(a);
    let t = ap.dot(ab) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const projection = new THREE.Vector3().copy(a).add(ab.multiplyScalar(t));
    return p.distanceTo(projection);
}

export function createAutoRiggedMesh(originalMesh: THREE.Mesh): THREE.SkinnedMesh | null {
    if (!originalMesh.geometry) return null;

    // Clone geometry so we don't mutate the cached GLTF
    const geometry = originalMesh.geometry.clone();

    // Ensure bounding box exists
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return null;

    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;

    // ── 1. Create Bones ──
    const rootBone = new THREE.Bone();
    rootBone.name = "Root";
    const lShoulder = new THREE.Bone();
    lShoulder.name = "LeftShoulder";
    const lElbow = new THREE.Bone();
    lElbow.name = "LeftElbow";
    const rShoulder = new THREE.Bone();
    rShoulder.name = "RightShoulder";
    const rElbow = new THREE.Bone();
    rElbow.name = "RightElbow";

    // ── Calculate Absolute Bone Positions based on Bounding Box Proportions ──
    const posRoot = new THREE.Vector3(0, box.min.y, 0);
    const posSpineTop = new THREE.Vector3(0, box.max.y - h * 0.1, 0);

    const posLShoulder = new THREE.Vector3(-w * 0.18, box.max.y - h * 0.15, 0);
    const posLElbow = new THREE.Vector3(-w * 0.35, box.max.y - h * 0.5, 0);
    const posLWrist = new THREE.Vector3(-w * 0.5, box.max.y - h * 0.8, 0);

    const posRShoulder = new THREE.Vector3(w * 0.18, box.max.y - h * 0.15, 0);
    const posRElbow = new THREE.Vector3(w * 0.35, box.max.y - h * 0.5, 0);
    const posRWrist = new THREE.Vector3(w * 0.5, box.max.y - h * 0.8, 0);

    // Apply Relative Local Offsets (Three.js Bone Hierarchy requirement)
    rootBone.position.copy(posRoot);
    lShoulder.position.copy(posLShoulder).sub(posRoot);
    lElbow.position.copy(posLElbow).sub(posLShoulder);
    rShoulder.position.copy(posRShoulder).sub(posRoot);
    rElbow.position.copy(posRElbow).sub(posRShoulder);

    // Build hierarchy
    rootBone.add(lShoulder);
    rootBone.add(rShoulder);
    lShoulder.add(lElbow);
    rShoulder.add(rElbow);

    // CRITICAL for IK MATH: A THREE.Bone applies 'rotation.z' relative to its Rest Pose.
    // To point an arm at a specific world angle, we must know its Rest Angle first!
    lShoulder.userData.restAngle = Math.atan2(lElbow.position.y, lElbow.position.x);
    rShoulder.userData.restAngle = Math.atan2(rElbow.position.y, rElbow.position.x);

    // Export true 3D Unit Vector relative to parent shoulder for Quaternion mathematics
    lShoulder.userData.restDir = lElbow.position.clone().normalize();
    rShoulder.userData.restDir = rElbow.position.clone().normalize();

    // CRITICAL BUGFIX: We MUST calculate the World Matrices of the bones before passing them 
    // to THREE.Skeleton. Otherwise, the inverse bind matrices will be Identity, 
    // causing explosive mesh distortion or failed vertex mappings.
    rootBone.updateMatrixWorld(true);

    const bones = [rootBone, lShoulder, lElbow, rShoulder, rElbow];
    const skeleton = new THREE.Skeleton(bones);

    // ── 2. Procedural Skin Weights (Heat Bone Weighting Math) ──
    const positions = geometry.attributes.position;
    const skinIndices = [];
    const skinWeights = [];

    const v = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        v.fromBufferAttribute(positions, i);

        // Distance from vertex to each bone's physical "tube" line-segment
        const d0 = distToSegment(v, posRoot, posSpineTop);
        const d1 = distToSegment(v, posLShoulder, posLElbow);
        const d2 = distToSegment(v, posLElbow, posLWrist);
        const d3 = distToSegment(v, posRShoulder, posRElbow);
        const d4 = distToSegment(v, posRElbow, posRWrist);

        // Strongly bias the root (torso) to prevent sleeves from pulling the chest
        const dists = [
            { index: 0, d: d0 * 0.6 }, // 0.6 multiplier makes the Torso "magnetically" stronger
            { index: 1, d: d1 },
            { index: 2, d: d2 },
            { index: 3, d: d3 },
            { index: 4, d: d4 },
        ];

        // Sort by closest bone
        dists.sort((a, b) => a.d - b.d);

        // Blend the top 2 closest bones using Inverse Distance Weighting squared
        const b1 = dists[0];
        const b2 = dists[1];

        // The +0.0001 prevents division by zero if vertex is exactly on a bone
        const w1 = 1.0 / (b1.d * b1.d + 0.0001);
        let w2 = 1.0 / (b2.d * b2.d + 0.0001);

        // If the second bone is significantly further, just ignore it and clamp to 100% bone 1
        if (b2.d > b1.d * 3) {
            w2 = 0;
        }

        const sum = w1 + w2;
        const normW1 = w1 / sum;
        const normW2 = w2 / sum;

        // WebGL strictly requires 4 indices/weights per vertex
        skinIndices.push(b1.index, b2.index, 0, 0);
        skinWeights.push(normW1, normW2, 0, 0);
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    // ── 3. Create SkinnedMesh ──

    // CRITICAL BUGFIX: If we reuse the exact same material object from the static THREE.Mesh,
    // Three.js will use the cached Shader Program which lacks #define USE_SKINNING. 
    // We MUST clone the material to force WebGL to recompile the vertex shader to accept Bone Vectors.
    const material = (originalMesh.material as THREE.Material).clone();

    // Some formats use array of materials. We handle single for now as per original code.
    const skinnedMesh = new THREE.SkinnedMesh(geometry, material);

    // Bind Skeleton
    skinnedMesh.add(rootBone);
    skinnedMesh.bind(skeleton);

    skinnedMesh.position.copy(originalMesh.position);
    skinnedMesh.rotation.copy(originalMesh.rotation);
    skinnedMesh.scale.copy(originalMesh.scale);

    skinnedMesh.castShadow = true;
    skinnedMesh.receiveShadow = true;

    return skinnedMesh;
}
