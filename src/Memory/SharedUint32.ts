import { SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";
import { TypeRegistry } from "./TypeRegistry.js";

export type uint32 = number & { __brand: "uint32" };
export function Uint32(value: number): uint32 {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
        throw new RangeError("cannot cast value to uint32");
    }
    return value as uint32;
}

export class SharedUint32 extends SharedPrimitive<uint32> {
    static readonly byteSize: number = 4;

    static fromData(heap: SharedHeap, v: uint32): SharedUint32{
        let addr = heap.allocate(SharedUint32.byteSize, SharedUint32.typeID);
        let obj = new SharedUint32(heap, addr);
        obj.value = v;
        
        return obj;
    }

    set value(v: uint32) {
        this._heap.view.setUint32(this._addr, Uint32(v));
    }
    get value(): uint32 {
        return this._heap.view.getUint32(this._addr) as uint32;
    }
}
SharedUint32 satisfies SharedPrimitiveStatic<uint32>;

TypeRegistry.registerType(SharedUint32);