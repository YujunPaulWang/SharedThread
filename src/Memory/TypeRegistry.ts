import type { SharedTypeClass } from "./SharedType.js";

export class TypeRegistry {
    private static indexToType: Map<number, SharedTypeClass> = new Map();
    private static typeToIndex: Map<SharedTypeClass, number> = new Map();
    private static hashToType: Map<number, SharedTypeClass> = new Map();
    private static typeToHash: Map<SharedTypeClass, number> = new Map();
    private static indexToHash: Uint32Array = new Uint32Array(0);

    // private static cyrb53(str: string, seed: number = 0): number {
    //     let h1 = 0xdeadbeef ^ seed;
    //     let h2 = 0x41c6ce57 ^ seed;

    //     for (let i = 0, ch: number; i < str.length; i++) {
    //         ch = str.charCodeAt(i);
    //         h1 = Math.imul(h1 ^ ch, 2654435761);
    //         h2 = Math.imul(h2 ^ ch, 1597334677);
    //     }

    //     h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    //     h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);

    //     h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    //     h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    //     // Combine the two 32-bit hashes into a single 53-bit unsigned integer
    //     return 4294967296 * (2097151 & h2) + (h1 >>> 0);
    // }

    public static fnv1(str: string): number {
        let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis

        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i); // XOR the bottom 8 or 16 bits
            // Math.imul emulates 32-bit C-style multiplication overflow perfectly
            hash = Math.imul(hash, 0x01000193); // FNV-1a 32-bit prime
        }

        return hash >>> 0; // Force to unsigned 32-bit integer
    }

    public static registerType(dataType: SharedTypeClass): number {
        if (this.typeToIndex.has(dataType)) throw new Error("class is alreadly registered");

        let idx: number = TypeRegistry.indexToType.size;
        let hash: number;

        do {
            hash = TypeRegistry.fnv1(dataType.toString());
        } while (TypeRegistry.hashToType.has(hash));


        TypeRegistry.indexToType.set(idx, dataType);
        TypeRegistry.typeToIndex.set(dataType, idx);
        TypeRegistry.hashToType.set(hash, dataType);
        TypeRegistry.typeToHash.set(dataType, hash);

        let nextHashes = new Uint32Array(idx + 1);
        nextHashes.set(TypeRegistry.indexToHash);
        nextHashes[idx] = hash;
        TypeRegistry.indexToHash = nextHashes;

        dataType.typeID = idx;
        return idx;
    }

    public static getTypeBuffer(): ArrayBuffer {
        return new Uint32Array(TypeRegistry.indexToHash).buffer;
    }

    public static verifyTypeBuffer(typeBuffer: ArrayBuffer): void {
        const arrayEqual = (a: Uint32Array, b: Uint32Array) => a.length == b.length && a.every((v, i) => v == b[i]);
        const setEqual = (a: Uint32Array, b: Uint32Array) => a.length === b.length && ((m) => a.every(x => m.set(x, (m.get(x) || 0) + 1)) && b.every(x => m.get(x) && m.set(x, m.get(x) - 1)))(new Map());
        let hashArray: Uint32Array = new Uint32Array(typeBuffer);

        let isEqual = arrayEqual(this.indexToHash, hashArray);
        let isSetEqual = setEqual(this.indexToHash, hashArray);

        if (!isEqual) {
            if (isSetEqual) {
                //this is important for rare cases of hash collisions
                throw new Error("type registrations are out of order");
            } else {
                throw new Error("type registrations mismatched");
            }
        }
    }

    public static getTypeByIndex(index: number): SharedTypeClass {
        if(!this.indexToType.has(index)) throw new Error("cannot find type by index");
        return this.indexToType.get(index) as SharedTypeClass;
    }

    public static getTypeByHash(hash: number): SharedTypeClass {
        if(!this.hashToType.has(hash)) throw new Error("cannot find type by hash");
        return this.hashToType.get(hash) as SharedTypeClass;
    }

    public static getIndexByType(type: SharedTypeClass): number {
        if(!this.typeToIndex.has(type)) throw new Error("cannot find id by type");
        return this.typeToIndex.get(type) as number;
    }

    public static getHashByType(type: SharedTypeClass): number {
        if(!this.typeToHash.has(type)) throw new Error("cannot find hash by index");
        return this.typeToHash.get(type) as number;
    }

    private constructor(){};
}