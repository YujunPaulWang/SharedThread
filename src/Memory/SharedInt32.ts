import { SharedPrimitive, type SharedPrimitiveStatic } from "./SharedPrimitive.js";
import { SharedHeap } from "./SharedHeap.js";
import { TypeRegistry } from "./TypeRegistry.js";

export type int32 = number & { __brand: "int32" };

/**
 * Casts a number to a 32-bit signed integer after validating its bounds.
 * @param value - The number to validate and cast.
 * @returns The validated 32-bit signed integer.
 * @throws {RangeError} If the value is not an integer or falls outside the 32-bit signed range.
 */
export function Int32(value: number): int32 {
    if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
        throw new RangeError("cannot cast value to int32");
    }
    return value as int32;
}

export class SharedInt32 extends SharedPrimitive<int32> {
    static readonly byteSize: number = 4;

    /**
     * Allocates space on the shared heap and initializes a new SharedInt32 instance with a value.
     * @param heap - The shared heap instance where memory will be allocated.
     * @param v - The initial 32-bit signed integer value to store.
     * @returns A new instance of SharedInt32 pointing to the allocated memory.
     */
    static fromData(heap: SharedHeap, v: int32): SharedInt32{
        let addr = heap.allocate(SharedInt32.byteSize, SharedInt32.typeID);
        let obj = new SharedInt32(heap, addr);
        obj.value = v;
        
        return obj;
    }

    /**
     * Sets the 32-bit signed integer value at the allocated heap address.
     * @param v - The 32-bit signed integer value to write.
     */
    set value(v: int32) {
        this._heap.view.setInt32(this._addr, Int32(v));
    }

    /**
     * Gets the 32-bit signed integer value from the allocated heap address.
     * @returns The stored 32-bit signed integer value.
     */
    get value(): int32 {
        return this._heap.view.getInt32(this._addr) as int32;
    }
}
SharedInt32 satisfies SharedPrimitiveStatic<int32>;

TypeRegistry.registerType(SharedInt32);