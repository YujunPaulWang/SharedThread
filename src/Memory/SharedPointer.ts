import type { SharedReference } from "./SharedReference.js";
import type { SharedType, SharedTypeClass } from "./SharedType.js";
import { SharedHeap } from "./SharedHeap.js";


export class SharedPointer<T extends SharedType> implements SharedReference {
    static readonly size: number = 4;

    private readonly _heldType: SharedTypeClass;
    private readonly _addr: number;
    private readonly _heap: SharedHeap;
    private heldVar: T;

    constructor(heap: SharedHeap, heldType: SharedTypeClass, p: number | T = -1) {
        this._heap = heap;
        this._addr = heap.allocate(SharedPointer.size);
        this._heldType = heldType;
        if (typeof p == "number") {
            this.heldVar = new this._heldType(this._heap, p) as T;
        } else if (p instanceof this._heldType) {
            this.heldVar = p;
        } else {
            throw new Error("pointer type mismatch");
        }
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
    set pointer(p: number) {
        this._heap.view.setInt32(this._addr, p);
    }
    get pointer(): number {
        return this._heap.view.getInt32(this._addr);
    }
    set value(p: number | T) {
        if (typeof p == "number") {
            this.heldVar = new this._heldType(this._heap, p) as T;
        } else if (p instanceof this._heldType) {
            this.heldVar = p;
        } else {
            throw new Error("pointer type mismatch");
        }
    }
    get value(): T {
        return this.heldVar;
    }
}