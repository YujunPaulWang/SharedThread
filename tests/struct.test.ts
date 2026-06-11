import { describe, it, expect, vi, beforeEach } from "vitest";

// --- ENV / REGISTRY CAPTURE HOLDERS ---
let CapturedPrimitiveClass: any;
let CapturedArrayClass: any;

// --- STEP 1: MOCK MODULE RESOLUTION DIRECTORIES ---

vi.mock("../src/Memory/TypeRegistry.js", () => ({
  TypeRegistry: {
    getTypeByIndex: (index: number) => {
      if (index === 42) return CapturedPrimitiveClass;
      if (index === 88) return CapturedArrayClass;
      return null;
    },
    registerType: () => {} 
  }
}));

vi.mock("../src/Memory/SharedPointer.js", () => ({
  SharedPointer: class MockSharedPointer {
    static byteSize = 8;
    static typeID = 99;
    public addr: number;
    private _value: number = 0;

    constructor(public heap: any, addr: number, public targetType?: any) {
      this.addr = addr;
    }

    // Emulate your system's .deref mechanic for reference types
    get deref() {
      // Return an instance of the target type constructed from the stored pointer address
      return new this.targetType(this.heap, this.value);
    }

    set value(v: number) {
      this._value = v;
      this.heap.view.setUint32(this.addr, v);
    }
    get value() {
      return this.heap.view.getUint32(this.addr);
    }
  }
}));

// Import base module targets
import { SharedPrimitive } from "../src/Memory/SharedPrimitive.js";
import { SharedArray } from "../src/Memory/SharedArray.js";
import { SharedStruct } from "../src/Memory/SharedStruct.js";
import { SharedPointer } from "../src/Memory/SharedPointer.js";

// --- STEP 2: RUNTIME EMULATION UTILITIES ---

class MockDataView {
  private storage = new Map<number, number>();
  setUint32(addr: number, value: number) { this.storage.set(addr, value); }
  getUint32(addr: number): number { return this.storage.get(addr) || 0; }
  setInt32(addr: number, value: number) { this.storage.set(addr, value); }
  getInt32(addr: number): number { return this.storage.get(addr) || 0; }
}

class MockHeap {
  public view = new MockDataView();
  public nextAddr = 100;

  allocate(size: number, typeID: number): number {
    const allocated = this.nextAddr;
    this.nextAddr += size;
    return allocated;
  }
  getTypeIDAt(addr: number) { return 42; }
  getPtrAt(addr: number) { return 0; }
}

// Ensure the primitives pass prototyping inspections cleanly
class MockSharedPrimitive extends SharedPrimitive<any> {
  static byteSize = 4;
  static typeID = 42;
  set value(v: any) { this.heap.view.setInt32(this.addr, v); }
  get value() { return this.heap.view.getInt32(this.addr); }
}

// Assign captured references so constructor dependencies link accurately
CapturedPrimitiveClass = MockSharedPrimitive;
CapturedArrayClass = SharedArray;

// --- STEP 3: DEFINE TESTING STRUCTURES MIRRORING YOUR EXAMPLES ---

class MyStruct extends SharedStruct {
  static override typeID = 202;
  static override properties: any = {
    foo: { type: MockSharedPrimitive, param: 9 },
    bar: { 
      type: SharedArray, 
      param: { type: MockSharedPrimitive, length: 7 } 
    }
  };
}

// --- STEP 4: THE VITEST TESTING SUITE ---

describe("SharedStruct Integration Contract", () => {
  let heap: MockHeap;

  beforeEach(() => {
    heap = new MockHeap();
    // Pre-seed memory addresses so that reconstructive array operations resolve safely
    heap.view.setUint32(104, 7); // Set SharedArray element length inside the heap header slot
  });

  describe("API Design and Size Calculation", () => {
    it("should aggregate static sizes by summing primitives and reference pointers", () => {
      // 1 primitive (4 bytes) + 1 reference pointer (8 bytes) = 12 total bytes
      expect(MyStruct.byteSize).toBe(12);
    });
  });

  describe("fromData Initialization and Imprinting", () => {
    it("should instantiate fields, write to heap buffers, and allow explicit overloads", () => {
      const myStruct = MyStruct.fromData(heap, {
        foo: 6
      }) as any;

      // Assert that primitive parameters accurately bypassed defaults and imprinted values
      // Note: If your proxy un-wraps primitives directly, evaluate `expect(myStruct.foo).toBe(6)`
      expect(myStruct.foo.value).toBe(6);
    });

    it("should seamlessly establish nested reference pointers using the .deref channel", () => {
      const myStruct = MyStruct.fromData(heap, { foo: 9 }) as any;

      // Verify that the reference field was securely packaged into a pointer structure
      expect(myStruct.bar).toBeInstanceOf(SharedPointer);

      // Mutate an array slot by traversing through the dereferenced array index pointer
      myStruct.bar.deref[2].value = 5;

      // Verify the value was accurately marshaled back down into underlying heap memory
      expect(myStruct.bar.deref[2].value).toBe(5);
    });
  });

  describe("Imprint Automation Loops", () => {
    it("should patch active instances during full object state synchronization dumps", () => {
      const myStruct = new MyStruct(heap, 500) as any;

      myStruct.imprint({ foo: 101 });

      expect(myStruct.foo.value).toBe(101);
    });
  });
});
