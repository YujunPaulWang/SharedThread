import { type SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";

export type int32 = number & { __brand: "int32" };
export function Int32(value: number): int32 {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
        throw new RangeError("cannot cast value to int32");
    }
    return value as int32;
}

export class SharedInt32 implements SharedPrimitive<int32> {
    static readonly size: number = 4;
    private _addr: number;
    private _heap: SharedHeap;

    constructor(heap: SharedHeap, v: int32 | null = null) {
        this._heap = heap;
        this._addr = heap.allocate(SharedInt32.size);

        if (v != null) this.value = Int32(v);
    }

    // static parse(heap: SharedHeap, addr: number): int32{
    //     return heap.view.getInt32(addr) as int32;
    // }

    get addr(): number {
        return this._addr;
    }
    get heap(): SharedHeap {
        return this._heap;
    }
    set value(v: int32) {
        this._heap.view.setInt32(this._addr, Int32(v));
    }
    get value(): int32 {
        return this._heap.view.getInt32(this._addr) as int32;
    }
}
SharedInt32 satisfies SharedPrimitiveStatic<int32>;