"use client";

import React, { Suspense, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { usePoseStore } from "../../store/PoseStore";
import { createAutoRiggedMesh } from "./AutoRigger";

function DebugCube() {
    const ref = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (ref.current) {
            ref.current.rotation.x += 0.01;
            ref.current.rotation.y += 0.01;
        }
    });
    return (
        <mesh ref={ref} position={[-2, 2, 0]}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshStandardMaterial color="hotpink" />
        </mesh>
    );
}

/**
 * 3D Garment Component
 * Loads a GLTF/GLB model and renders it in the scene.
 */
function GarmentModel({ url }: { url: string }) {
    const isGLTF = url.endsWith('.glb') || url.endsWith('.gltf');
    const safeUrl = isGLTF ? url : "/garments/3d-assets/free_lowpoly_jacket.glb";
    const { scene } = useGLTF(safeUrl);

    const garmentRef = useRef<THREE.Group>(null);
    const bonesRef = useRef<{ lShoulder: THREE.Bone, rShoulder: THREE.Bone } | null>(null);

    const { viewport } = useThree();

    // Mapping empirical scale multipliers per 3D model.
    const GARMENT_SCALES: Record<string, number> = {
        "short_sleeve_t-_shirt": 1.6,
        "free_lowpoly_jacket": 2.8,
    };

    let baseMultiplier = 2.0; // Default fallback
    for (const [key, value] of Object.entries(GARMENT_SCALES)) {
        if (safeUrl.includes(key)) {
            baseMultiplier = value;
            break;
        }
    }

    // ── NORMALIZE THE 3D MODEL ONCE ──
    React.useLayoutEffect(() => {
        // 1. Reset scene scale and position to identity before measuring
        scene.scale.set(1, 1, 1);
        scene.position.set(0, 0, 0);
        scene.updateMatrixWorld();

        const box = new THREE.Box3().setFromObject(scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        const maxDim = Math.max(size.x, size.y, size.z);
        if (maxDim > 0) {
            scene.scale.setScalar(1 / maxDim);
        }

        // 2. Center the geometry relative to its parent group
        scene.position.x = -center.x / maxDim;
        scene.position.y = -center.y / maxDim;
        scene.position.z = -center.z / maxDim;

        // Calculate the relative coordinate of the collar (top of the mesh)
        const topY = (box.max.y - center.y) / maxDim;
        scene.userData.collarLocalY = topY * 0.85;

        // 3. Auto-Rig the Meshes!
        // We collect them first to avoid modifying the tree during traversal.
        const meshesToRig: THREE.Mesh[] = [];
        scene.traverse((child) => {
            if ((child as any).isMesh && !(child as any).isSkinnedMesh && !child.userData.rigged) {
                meshesToRig.push(child as THREE.Mesh);
            }
        });

        meshesToRig.forEach((child) => {
            const skinned = createAutoRiggedMesh(child);
            if (skinned) {
                skinned.userData.rigged = true;

                // Keep references to bones for animation
                if (!bonesRef.current) {
                    bonesRef.current = {
                        lShoulder: skinned.skeleton.bones[1],
                        rShoulder: skinned.skeleton.bones[3]
                    };
                }

                child.parent?.add(skinned);
                child.parent?.remove(child);
            }
        });

        // DEBUG: Visualize the procedural bones
        const skeletonHelper = new THREE.SkeletonHelper(scene);
        (skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 5;
        scene.add(skeletonHelper);

    }, [scene]);

    const baseScaleRef = useRef<number>(0);

    useFrame(() => {
        const state = usePoseStore.getState();
        if (!state.isActive || !garmentRef.current) return;

        // 1. Calculate the midpoint between the shoulders in 2D Canvas Space
        const midX = (state.leftShoulder.x + state.rightShoulder.x) / 2;

        const midY = state.collarY && isFinite(state.collarY)
            ? state.collarY
            : (state.leftShoulder.y + state.rightShoulder.y) / 2;

        // 2. Convert Canvas [0...W, 0...H] to Normalized Device Coordinates [-1...1, -1...1]
        const ndcX = (midX / state.canvasWidth) * 2 - 1;
        const ndcY = -(midY / state.canvasHeight) * 2 + 1;

        // 3. Map NDC to Three.js World Space using viewport dimensions
        const worldX = ndcX * (viewport.width / 2);
        const worldY = ndcY * (viewport.height / 2);

        // 4. Calculate 3D Rotations (Yaw/Pitch/Roll)
        const yawAngle = state.bodyYawAngle;
        const pitchAngle = (1.0 - state.torsoPitchScale) * Math.PI * 0.8;

        const shoulderDx = Math.abs(state.rightShoulder.x - state.leftShoulder.x);
        const shoulderDy = state.rightShoulder.y - state.leftShoulder.y;
        const shoulderAngle = -Math.atan2(shoulderDy, shoulderDx);

        const hipDx = Math.abs(state.rightHip.x - state.leftHip.x);
        const hipDy = state.rightHip.y - state.leftHip.y;
        const hipAngle = -Math.atan2(hipDy, hipDx);

        const isHipGuessed = Math.abs(hipDy) < 0.01;
        const rollAngle = isHipGuessed
            ? shoulderAngle * 0.5
            : (hipAngle * 0.6) + (shoulderAngle * 0.4);

        // 5. Calculate Scale based on Yaw-Deprojected Shoulder Width
        const projectedShoulderDist2D = Math.hypot(
            state.rightShoulder.x - state.leftShoulder.x,
            state.rightShoulder.y - state.leftShoulder.y
        );

        const yawCos = Math.abs(Math.cos(yawAngle));
        if (yawCos > 0.6 || baseScaleRef.current === 0) {
            baseScaleRef.current = projectedShoulderDist2D / Math.max(0.4, yawCos);
        }
        const trueShoulderDist2D = baseScaleRef.current;

        const shoulderRatio = trueShoulderDist2D / state.canvasWidth;
        const depthStabilizedRatio = Math.pow(shoulderRatio, 0.85);
        const scaleFactor = depthStabilizedRatio * viewport.width;

        const targetScale = scaleFactor * baseMultiplier;

        // 6. Translate the Garment
        // B2B Fix: Shift origin downward to clear the face and sit on true shoulders
        const collarOffsetScaled = (scene.userData.collarLocalY || 0.4) * targetScale;
        const neckClearanceOffset = scaleFactor * 0.18; // Pull mesh down significantly
        const targetX = worldX;
        const targetY = worldY - collarOffsetScaled - neckClearanceOffset;

        garmentRef.current.position.x = THREE.MathUtils.lerp(garmentRef.current.position.x, targetX, 0.45);
        garmentRef.current.position.y = THREE.MathUtils.lerp(garmentRef.current.position.y, targetY, 0.45);
        garmentRef.current.position.z = 0;

        const currentScale = garmentRef.current.scale.x;
        const smoothScale = THREE.MathUtils.lerp(currentScale, targetScale, 0.45);
        garmentRef.current.scale.set(smoothScale, smoothScale, smoothScale);

        garmentRef.current.rotation.y = THREE.MathUtils.lerp(garmentRef.current.rotation.y, yawAngle, 0.45);
        garmentRef.current.rotation.x = THREE.MathUtils.lerp(garmentRef.current.rotation.x, pitchAngle, 0.45);
        garmentRef.current.rotation.z = THREE.MathUtils.lerp(garmentRef.current.rotation.z, rollAngle, 0.45);

        // 7. Animate Bones (Sleeves) using Pure 3D Quaternions
        if (bonesRef.current && state.leftElbow && state.rightElbow) {
            // Fetch exact Rest Unit Vectors from the AutoRigger
            // Fallback to horizontal vectors just in case
            const lRestDir = bonesRef.current.lShoulder.userData.restDir || new THREE.Vector3(-1, 0, 0);
            const rRestDir = bonesRef.current.rShoulder.userData.restDir || new THREE.Vector3(1, 0, 0);

            // Construct True 3D Target Directions.
            // X is already mirrored upstream by Engine.ts for the selfie view.
            // Y is inverted (Canvas tracks top-down, WebGL maps bottom-up).
            // Z is inverted (MediaPipe Z: Smaller=Closer.  WebGL Z: Larger=Closer).
            const lTargetDir = new THREE.Vector3(
                state.leftElbow.x - state.leftShoulder.x,
                -(state.leftElbow.y - state.leftShoulder.y),
                -((state.leftElbow.z || 0) - (state.leftShoulder.z || 0))
            ).normalize();

            const rTargetDir = new THREE.Vector3(
                state.rightElbow.x - state.rightShoulder.x,
                -(state.rightElbow.y - state.rightShoulder.y),
                -((state.rightElbow.z || 0) - (state.rightShoulder.z || 0))
            ).normalize();

            // Calculate Required Quaternions to map the Armature Rest State directly to the 3D Tracking Point
            const lQuat = new THREE.Quaternion().setFromUnitVectors(lRestDir, lTargetDir);
            const rQuat = new THREE.Quaternion().setFromUnitVectors(rRestDir, rTargetDir);

            // The body roll angle needs to be subtracted because the entire garment container is already rotated by 'rollAngle'
            // We construct a counter-roll quaternion and apply it before the arm rotation
            const counterRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -rollAngle);
            lQuat.premultiply(counterRoll);
            rQuat.premultiply(counterRoll);

            // Smooth 3D Interpolation (Slerp) prevents gimbal lock and looks perfectly organic
            bonesRef.current.lShoulder.quaternion.slerp(lQuat, 0.4);
            bonesRef.current.rShoulder.quaternion.slerp(rQuat, 0.4);
        }
    });

    return (
        <group ref={garmentRef}>
            <primitive object={scene} />
        </group>
    );
}

// Prefetch the models to avoid hanging on first load
useGLTF.preload("/garments/3d-assets/free_lowpoly_jacket.glb");
useGLTF.preload("/garments/3d-assets/short_sleeve_t-_shirt.glb");

export default function Scene3D({ garmentUrl }: { garmentUrl?: string }) {
    return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
            <Canvas
                camera={{ position: [0, 0, 5], fov: 45 }}
                gl={{ alpha: true, antialias: true }}
            >
                {/* Lights Setup */}
                <ambientLight intensity={0.5} />
                <directionalLight position={[5, 5, 5]} intensity={1.5} castShadow />

                {/* Photorealistic Environment Lighting */}
                <Environment preset="city" />

                <DebugCube />

                <Suspense fallback={null}>
                    <GarmentModel url={garmentUrl || "/garments/3d-assets/free_lowpoly_jacket.glb"} />
                </Suspense>

                <OrbitControls enableZoom={true} enablePan={false} makeDefault />
            </Canvas>
        </div>
    );
}
