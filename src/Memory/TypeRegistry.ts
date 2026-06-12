import type { SharedTypeClass } from "./SharedType.js";

export class TypeRegistry {
    private static indexToType: Map<number, SharedTypeClass> = new Map();
    private static typeToIndex: Map<SharedTypeClass, number> = new Map();
    private static hashToType: Map<number, SharedTypeClass> = new Map();
    private static typeToHash: Map<SharedTypeClass, number> = new Map();
    private static indexToHash: Uint32Array = new Uint32Array(0);

    /**
     * Calculates the 32-bit FNV-1a hash of a given string.
     * @param str - The input string to hash.
     * @returns The unsigned 32-bit integer hash value.
     */
    public static fnv1(str: string): number {
        let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis

        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i); // XOR the bottom 8 or 16 bits
            // Math.imul emulates 32-bit C-style multiplication overflow perfectly
            hash = Math.imul(hash, 0x01000193); // FNV-1a 32-bit prime
        }

        return hash >>> 0; // Force to unsigned 32-bit integer
    }

    /**
     * Registers a shared type class, assigns it a type ID, and tracks its hash.
     * @param dataType - The shared type class constructor to register.
     * @returns The newly assigned index-based type ID.
     * @throws {Error} If the class definition has already been registered.
     */
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

    /**
     * Extracts an ArrayBuffer representation of the registered type hash array.
     * @returns The underlying buffer containing the chronological sequence of type hashes.
     */
    public static getTypeBuffer(): ArrayBuffer {
        return new Uint32Array(TypeRegistry.indexToHash).buffer;
    }

    /**
     * Verifies that an external type buffer matches the internal registry order and content.
     * @param typeBuffer - The external array buffer containing type hashes to validate.
     * @throws {Error} If the hashes are out of chronological order or contain mismatched definitions.
     */
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

    /**
     * Resolves a registered type class constructor using its index-based type ID.
     * @param index - The index ID associated with the class.
     * @returns The matching shared type class constructor.
     * @throws {Error} If no class definition matches the provided index.
     */
    public static getTypeByIndex(index: number): SharedTypeClass {
        if(!this.indexToType.has(index)) throw new Error("cannot find type by index");
        return this.indexToType.get(index) as SharedTypeClass;
    }

    /**
     * Resolves a registered type class constructor using its computed FNV-1a hash.
     * @param hash - The unsigned 32-bit hash value associated with the class.
     * @returns The matching shared type class constructor.
     * @throws {Error} If no class definition matches the provided hash.
     */
    public static getTypeByHash(hash: number): SharedTypeClass {
        if(!this.hashToType.has(hash)) throw new Error("cannot find type by hash");
        return this.hashToType.get(hash) as SharedTypeClass;
    }

    /**
     * Resolves the numeric index-based type ID for a given type class constructor.
     * @param type - The shared type class constructor to look up.
     * @returns The registered index ID.
     * @throws {Error} If the type class constructor has not been registered.
     */
    public static getIndexByType(type: SharedTypeClass): number {
        if(!this.typeToIndex.has(type)) throw new Error("cannot find id by type");
        return this.typeToIndex.get(type) as number;
    }

    /**
     * Resolves the computed FNV-1a hash for a given type class constructor.
     * @param type - The shared type class constructor to look up.
     * @returns The registered hash value.
     * @throws {Error} If the type class constructor has not been registered.
     */
    public static getHashByType(type: SharedTypeClass): number {
        if(!this.typeToHash.has(type)) throw new Error("cannot find hash by index");
        return this.typeToHash.get(type) as number;
    }

    /**
     * Disallows instance creation since TypeRegistry is a fully static utility class.
     */
    private constructor(){};
}