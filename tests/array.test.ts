import { describe, it, expect, vi, beforeEach } from "vitest";

// 1. MOCK THE INTERNAL DEPENDENCIES FIRST
// We must declare a shared holder object for the class reference so both the mock registry 
// and the tests point to the exact same constructor instance.
let CapturedPrimitiveClass: any;

vi.mock("../src/Memory/TypeRegistry.js", () => ({
  TypeRegistry: {
    getTypeByIndex: () => CapturedPrimitiveClass,
    registerType: () => {} 
  }
}));

vi.mock("../src/Memory/SharedPointer.js", () => ({
  SharedPointer: class MockSharedPointer {
    static byteSize = 8;
    static typeID = 99;
  }
}));

// Import your real library base class so our mock can inherit from it
import { SharedPrimitive } from "../src/Memory/SharedPrimitive.js";
// Import your actual production file safely now
import { SharedArray } from "../src/Memory/SharedArray.js"; 

// --- LIGHTWEIGHT RUNTIME TEST MOCKS ---

class MockDataView {
  private storage = new Map<number, number>();
  setUint32(addr: number, value: number) { this.storage.set(addr, value); }
  getUint32(addr: number): number { return this.storage.get(addr) || 0; }
  setInt32(addr: number, value: number) { this.storage.set(addr, value); }
  getInt32(addr: number): number { return this.storage.get(addr) || 0; }
}

// Inherit directly from your SharedPrimitive so (type.prototype instanceof SharedPrimitive) passes
class MockSharedPrimitive extends SharedPrimitive<any> {
  static byteSize = 4;
  static typeID = 42;
  
  set value(v: any) { this.heap.view.setInt32(this.addr, v); }
  get value() { return this.heap.view.getInt32(this.addr); }
}

// Assign the holder reference so TypeRegistry resolves this constructor inside your production code
CapturedPrimitiveClass = MockSharedPrimitive;

class MockHeap {
  public view = new MockDataView();
  public nextAddr = 100;

  allocate(size: number, typeID: number, isPtr: boolean = false, isArray: boolean = false): number {
    const allocated = this.nextAddr;
    this.nextAddr += size;
    return allocated;
  }
  getTypeIDAt() { return 42; }
  getPtrAt() { return 0; }
}

// --- THE VITEST TESTS ---

describe("SharedArray Framework (Production Import)", () => {
  let heap: any;

  beforeEach(() => {
    heap = new MockHeap();
  });

  describe("Static Flags", () => {
    it("should report true for identity array flags", () => {
      expect(SharedArray.isArr).toBe(true);
    });

    it("should throw error attempting to pull raw static byteSize property", () => {
      expect(() => SharedArray.byteSize).toThrow("cannot precalculate array size");
    });
  });

  describe("fromData Initialization", () => {
    it("should accurately calculate total allocation footprint and write lengths into layouts", () => {
      const allocateSpy = vi.spyOn(heap, "allocate");
      
      const arr = SharedArray.fromData<any>(heap, {
        type: MockSharedPrimitive as any,
        length: 5
      });

      // 4 bytes header + (4 bytes * 5 items) = 24 bytes
      expect(allocateSpy).toHaveBeenCalledWith(24, MockSharedPrimitive.typeID, false, true);
      expect(heap.view.getUint32(arr.addr)).toBe(5);
    });

    it("should auto-fill values across backing stores if optional data array exists", () => {
      const arr = SharedArray.fromData<any>(heap, {
        type: MockSharedPrimitive as any,
        length: 3,
        array: [10, 20, 30]
      });

      expect(arr[0].value).toBe(10);
      expect(arr[1].value).toBe(20);
      expect(arr[2].value).toBe(30);
    });
  });

  describe("Proxy Trapping Mechanism", () => {
    it("should capture access requests via integer indices", () => {
      const arr = SharedArray.fromData<any>(heap, {
        type: MockSharedPrimitive as any,
        length: 2
      });

      arr[0].value = 99;
      expect(arr[0].value).toBe(99);
    });

    it("should allow data writing mutations directly to indices via the setter proxy trap", () => {
      const arr = SharedArray.fromData<any>(heap, {
        type: MockSharedPrimitive as any,
        length: 2
      });

      // Validates your proxy assignment hooks
      arr[1] = 500 as any;
      expect(arr[1].value).toBe(500);
    });

    it("should ignore outbound array range indices and return undefined values safely", () => {
      const arr = SharedArray.fromData<any>(heap, {
        type: MockSharedPrimitive as any,
        length: 2
      });

      expect(arr[5]).toBeUndefined();
    });
  });
});
