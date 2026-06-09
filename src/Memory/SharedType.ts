import type { SharedHeap } from "./SharedHeap.js";
import type { SharedPrimitiveClass } from "./SharedPrimitive.js";
import type { SharedReferenceClass } from "./SharedReference.js";

export interface SharedType {
    typeID: number;
}

export abstract class SharedType {
    protected _addr: number;
    protected _heap: SharedHeap;

    constructor(heap: SharedHeap, addr: number) {
        if (!isFinite(addr) || addr < 0) throw new Error("invalid address");
        this._heap = heap;
        this._addr = addr;
    }

    get addr(): number {
        return this._addr;
    }
    get heap(): SharedHeap {
        return this._heap;
    }
}

export type SharedTypeClass = SharedReferenceClass | SharedPrimitiveClass<any>;