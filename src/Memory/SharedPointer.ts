import { type SharedType, type SharedTypeClass } from "./SharedType.js";
import { SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";
import { TypeRegistry } from "./TypeRegistry.js";
import { SharedArray } from "./SharedArray.js";

interface PointerDefinition {
    type: SharedTypeClass;
    addr?: number;
}

export class SharedPointer<T extends SharedType> extends SharedPrimitive<any> {
    public static readonly byteSize: number = 4;
    public static readonly isPtr: boolean = true;

    /**
     * Allocates memory on the heap and creates a new SharedPointer instance.
     * @param heap - The shared heap instance for memory allocation.
     * @param v - The configuration object with the target type and optional address.
     * @returns A new instance of SharedPointer pointing to the allocated space.
     */
    public static fromData(heap: SharedHeap, v: PointerDefinition) {
        let addr = heap.allocate(SharedPointer.byteSize, v.type.typeID, SharedPointer.isPtr);
        let obj = new SharedPointer(heap, addr);
        if (v.addr) obj.value = addr;

        return obj;
    }

    protected readonly _heldType: SharedTypeClass;
    protected _deref: SharedType | null = null;

    /**
     * Creates an instance of SharedPointer.
     * @param heap - The shared heap instance managing memory.
     * @param addr - The heap address where this pointer metadata is stored.
     * @param dataType - The target constructor type, inferred from the heap if omitted.
     */
    constructor(heap: SharedHeap, addr: number, dataType?: SharedTypeClass) {
        super(heap, addr);

        this._heldType = dataType ?? (TypeRegistry.getTypeByIndex(heap.getTypeIDAt(addr)));
    }

    /**
     * Gets the class constructor of the target data type.
     * @returns The constructor of the pointed-to type.
     */
    get heldType(): SharedTypeClass {
        return this._heldType;
    }

    /**
     * Gets the heap address where this pointer itself is located.
     * @returns The memory address of the pointer metadata.
     */
    get addr(): number {
        return this._addr;
    }

    /**
     * Gets the managing shared heap instance.
     * @returns The associated shared heap.
     */
    get heap(): SharedHeap {
        return this._heap;
    }

    /**
     * Sets the raw target heap address and instantiates the referenced object after validation.
     * @param p - The target memory address to store.
     * @throws {Error} If the target type does not match the configured pointer type.
     */
    set value(p: number) {
        this._heap.view.setUint32(this._addr, p);
        if (this.heap.getArrayAt(p)) {
            if (this._heldType != SharedArray) throw new Error("pointer points to wrong type");
        } else {
            if (this._heldType != (TypeRegistry.getTypeByIndex(this._heap.getTypeIDAt(this._addr)))) throw new Error("pointer points to wrong type");
        }
        this._deref = new this._heldType(this._heap, p);
    }

    /**
     * Gets the raw memory address currently stored by this pointer.
     * @returns The target memory address.
     */
    get value(): number {
        return this._heap.view.getUint32(this._addr) as number;
    }

    /**
     * Points the pointer to the address of the given shared object instance.
     * @param v - The shared object instance to reference.
     * @throws {Error} If the object instance type mismatches the expected pointer type.
     */
    set deref(v: T) {
        if (!(v instanceof this._heldType)) throw new Error("assigned wrong type to pointer");
        this.value = v.addr;
        this._deref = v;
    }

    /**
     * Gets the instantiated shared object that this pointer references.
     * @returns The referenced object instance.
     */
    get deref(): T {
        return this._deref as T;
    }
}
SharedPointer satisfies SharedPrimitiveStatic<any>;