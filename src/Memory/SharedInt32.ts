import { SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";
import { TypeRegistry } from "./TypeRegistry.js";

export type int32 = number & { __brand: "int32" };
export function Int32(value: number): int32 {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
        throw new RangeError("cannot cast value to int32");
    }
    return value as int32;
}

export class SharedInt32 extends SharedPrimitive<int32> {
    static readonly byteSize: number = 4;

    static fromData(heap: SharedHeap, v: int32): SharedInt32{
        let addr = heap.allocate(SharedInt32.byteSize, SharedInt32.typeID);
        let obj = new SharedInt32(heap, addr);
        obj.value = v;
        
        return obj;
    }

    set value(v: int32) {
        this._heap.view.setInt32(this._addr, Int32(v));
    }
    get value(): int32 {
        return this._heap.view.getInt32(this._addr) as int32;
    }
}
SharedInt32 satisfies SharedPrimitiveStatic<int32>;

TypeRegistry.registerType(SharedInt32);