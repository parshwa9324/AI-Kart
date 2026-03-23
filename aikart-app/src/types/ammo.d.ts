// basic types for Ammo.js since official typings are missing or outdated
declare namespace Ammo {
    function destroy(obj: any): void;

    class btVector3 {
        constructor(x?: number, y?: number, z?: number);
        x(): number;
        y(): number;
        z(): number;
        setX(x: number): void;
        setY(y: number): void;
        setZ(z: number): void;
        setValue(x: number, y: number, z: number): void;
    }

    class btQuaternion {
        constructor(x?: number, y?: number, z?: number, w?: number);
        x(): number;
        y(): number;
        z(): number;
        w(): number;
        setValue(x: number, y: number, z: number, w: number): void;
    }

    class btTransform {
        constructor();
        setIdentity(): void;
        setOrigin(origin: btVector3): void;
        setRotation(rotation: btQuaternion): void;
        getOrigin(): btVector3;
        getRotation(): btQuaternion;
    }

    class btDefaultCollisionConfiguration { constructor(); }
    class btCollisionDispatcher { constructor(conf: btDefaultCollisionConfiguration); }
    class btDbvtBroadphase { constructor(); }
    class btSequentialImpulseConstraintSolver { constructor(); }

    class btDiscreteDynamicsWorld {
        constructor(
            dispatcher: btCollisionDispatcher,
            broadphase: btDbvtBroadphase,
            solver: btSequentialImpulseConstraintSolver,
            collisionConfiguration: btDefaultCollisionConfiguration
        );
        setGravity(gravity: btVector3): void;
        stepSimulation(timeStep: number, maxSubSteps?: number, fixedTimeStep?: number): void;
        addRigidBody(body: btRigidBody): void;
        removeRigidBody(body: btRigidBody): void;
    }

    class btSoftBodyRigidBodyDynamicsWorld extends btDiscreteDynamicsWorld {
        constructor(
            dispatcher: btCollisionDispatcher,
            broadphase: btDbvtBroadphase,
            solver: btSequentialImpulseConstraintSolver,
            collisionConfiguration: btDefaultCollisionConfiguration,
            softBodySolver: any
        );
        addSoftBody(body: btSoftBody): void;
        removeSoftBody(body: btSoftBody): void;
        getWorldInfo(): btSoftBodyWorldInfo;
    }

    class btSoftBodyWorldInfo {
        set_m_gravity(gravity: btVector3): void;
        // more properties
    }

    class btSoftBodyConfig {
        set_viterations(iterations: number): void;
        set_piterations(iterations: number): void;
        set_collisions(collisions: number): void;
        set_kDF(kDF: number): void;
        set_kDP(kDP: number): void;
        set_kPR(kPR: number): void;
        set_kVC(kVC: number): void;
    }

    class btSoftBodyMaterial {
        set_m_kLST(kLST: number): void;
        set_m_kAST(kAST: number): void;
        set_m_kVST(kVST: number): void;
    }

    class btSoftBodyNode {
        get_m_x(): btVector3;
        get_m_n(): btVector3;
    }

    class btSoftBodyNodeArray {
        size(): number;
        at(n: number): btSoftBodyNode;
    }

    class btSoftBody {
        get_m_cfg(): btSoftBodyConfig;
        get_m_nodes(): btSoftBodyNodeArray;
        appendMaterial(): btSoftBodyMaterial;
        setTotalMass(mass: number, fromfaces: boolean): void;
        generateBendingConstraints(distance: number, material: btSoftBodyMaterial): void;
    }

    class btRigidBody {
        constructor(constructionInfo: btRigidBodyConstructionInfo);
        getMotionState(): btMotionState;
        setWorldTransform(trans: btTransform): void;
        setCollisionFlags(flags: number): void;
        getCollisionFlags(): number;
        setActivationState(newState: number): void;
    }

    class btRigidBodyConstructionInfo {
        constructor(mass: number, motionState: btMotionState, collisionShape: btCollisionShape, localInertia: btVector3);
    }

    class btMotionState {
        getWorldTransform(trans: btTransform): void;
        setWorldTransform(trans: btTransform): void;
    }

    class btDefaultMotionState extends btMotionState {
        constructor(startTrans?: btTransform, centerOfMassOffset?: btTransform);
    }

    class btCollisionShape {
        setMargin(margin: number): void;
        calculateLocalInertia(mass: number, inertia: btVector3): void;
    }

    class btCapsuleShape extends btCollisionShape {
        constructor(radius: number, height: number);
    }

    class btBoxShape extends btCollisionShape {
        constructor(boxHalfExtents: btVector3);
    }

    class btSphereShape extends btCollisionShape {
        constructor(radius: number);
    }

    class btSoftBodyHelpers {
        CreateFromTriMesh(
            worldInfo: btSoftBodyWorldInfo,
            vertices: number,
            indices: number,
            numTriangles: number,
            randomizeConstraints: boolean
        ): btSoftBody;
    }

    class btDefaultSoftBodySolver {
        constructor();
    }

    function _malloc(size: number): number;
    function _free(ptr: number): void;

    const HEAPF32: Float32Array;
    const HEAPU16: Uint16Array;
    const HEAPU32: Uint32Array;
}

declare function Ammo(AmmoCore?: any): Promise<typeof Ammo>;

// Used optionally if loaded via <script> tag natively
interface Window {
    Ammo: any;
}
