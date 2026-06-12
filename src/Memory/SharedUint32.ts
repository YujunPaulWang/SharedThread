import { SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";
import { TypeRegistry } from "./TypeRegistry.js";

export type uint32 = number & { __brand: "uint32" };

/**
 * Casts a number to a 32-bit unsigned integer after validating its bounds.
 * @param value - The number to validate and cast.
 * @returns The validated 32-bit unsigned integer.
 * @throws {RangeError} If the value is not an integer or falls outside the 32-bit signed range.
 */
export function Uint32(value: number): uint32 {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
        throw new RangeError("cannot cast value to uint32");
    }
    return value as uint32;
}

export class SharedUint32 extends SharedPrimitive<uint32> {
    static readonly byteSize: number = 4;

    /**
     * Allocates space on the shared heap and initializes a new SharedUint32 instance with a value.
     * @param heap - The shared heap instance where memory will be allocated.
     * @param v - The initial 32-bit unsigned integer value to store.
     * @returns A new instance of SharedUint32 pointing to the allocated memory.
     */
    static fromData(heap: SharedHeap, v: uint32): SharedUint32{
        let addr = heap.allocate(SharedUint32.byteSize, SharedUint32.typeID);
        let obj = new SharedUint32(heap, addr);
        obj.value = v;
        
        return obj;
    }

    /**
     * Sets the 32-bit unsigned integer value at the allocated heap address.
     * @param v - The 32-bit unsigned integer value to write.
     */
    set value(v: uint32) {
        this._heap.view.setUint32(this._addr, Uint32(v));
    }

    /**
     * Gets the 32-bit unsigned integer value from the allocated heap address.
     * @returns The stored 32-bit unsigned integer value.
     */
    get value(): uint32 {
        return this._heap.view.getUint32(this._addr) as uint32;
    }
}
SharedUint32 satisfies SharedPrimitiveStatic<uint32>;

TypeRegistry.registerType(SharedUint32);