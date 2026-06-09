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

    public static fromData(heap: SharedHeap, v: PointerDefinition) {
        let addr = heap.allocate(SharedPointer.byteSize, v.type.typeID, SharedPointer.isPtr);
        let obj = new SharedPointer(heap, addr);
        if (v.addr) obj.value = addr;

        return obj;
    }

    protected readonly _heldType: SharedTypeClass;
    protected _deref: SharedType | null = null;

    constructor(heap: SharedHeap, addr: number, dataType?: SharedTypeClass) {
        super(heap, addr);

        this._heldType = dataType ?? (TypeRegistry.getTypeByIndex(heap.getTypeIDAt(addr)));
    }

    get heldType(): SharedTypeClass {
        return this._heldType;
    }
    get addr(): number {
        return this._addr;
    }
    get heap(): SharedHeap {
        return this._heap;
    }
    set value(p: number) {
        this._heap.view.setUint32(this._addr, p);
        if (this.heap.getArrayAt(p)) {
            if (this._heldType != SharedArray) throw new Error("pointer points to wrong type");
        } else {
            if (this._heldType != (TypeRegistry.getTypeByIndex(this._heap.getTypeIDAt(this._addr)))) throw new Error("pointer points to wrong type");
        }
        this._deref = new this._heldType(this._heap, p);
    }
    get value(): number {
        return this._heap.view.getUint32(this._addr) as number;
    }
    set deref(v: T) {
        if (!(v instanceof this._heldType)) throw new Error("assigned wrong type to pointer");
        this.value = v.addr;
        this._deref = v;
    }
    get deref(): T {
        return this._deref as T;
    }
}
SharedPointer satisfies SharedPrimitiveStatic<any>;