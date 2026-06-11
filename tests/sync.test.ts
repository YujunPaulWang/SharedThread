import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mocking required internal structures to isolate your asynchronous methods
class MockHeap {
  public heapID = 123;
  public buffer = new SharedArrayBuffer(1024);
  public view = new DataView(this.buffer);
  
  static getHeapByID() {
    return new MockHeap();
  }
  getArrayAt() { return 0; }
  getPtrAt() { return 0; }
  getTypeIDAt() { return 1; }
  allocate() { return 0; }
}

class MockSharedType {
  public heap = new MockHeap();
  public addr = 0;
}

// Mocking a Registry for the variable decoding step
const TypeRegistry = {
  getTypeByIndex: () => {
    return class {
      constructor(public heap: any, public addr: number) {}
    };
  }
};

// This is the Class containing your provided methods
class TestThread {
  public port = { postMessage: vi.fn() };
  public config = { timeout: 1000 };
  private listeners: Record<string, Function[]> = {};

  // Stub event emitter framework based on your .on() / .off() calls
  public on(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  public off(event: string, handler: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(h => h !== handler);
  }

  // Helper method used in tests to simulate incoming worker worker messages
  public emit(event: string, ...args: any[]) {
    if (this.listeners[event]) {
      // Copy array to protect against modification during loop execution
      [...this.listeners[event]].forEach(handler => handler(...args));
    }
  }

  /* --- YOUR METHODS UNDER TEST --- */

  public async addHeap(heap: any, name: string): Promise<void> {
    if (heap instanceof SharedArrayBuffer) {
      heap = new MockHeap(); // adapted for mock
    }
    const buffer = heap.buffer;

    this.port.postMessage({
      tag: "sync",
      name,
      buffer,
      heapID: heap.heapID,
      rebound: false,
    });

    return new Promise<void>((res, rej) => {
      const handler = (name2: string, buffer: any, heapID: number, rebound: boolean) => {
        if (rebound && name == name2 && buffer == null && heapID == heap.heapID) {
          res();
          this.off("sync", handler);
        }
      }
      this.on("sync", handler);

      if (this.config.timeout) setTimeout(() => {
        rej(new Error("failed to receive response"));
        this.off("sync", handler);
      }, this.config.timeout);
    });
  }

  public async syncHeap(name: string): Promise<any> {
    return new Promise<any>((res, rej) => {
      const handler = (name2: string, buffer: any, heapID: number, rebound: boolean) => {
        if (!rebound && name == name2) {
          const heap = new MockHeap();
          heap.heapID = heapID;

          this.port.postMessage({
            tag: "sync",
            name,
            buffer: null,
            heapID: heap.heapID,
            rebound: true,
          });

          this.off("sync", handler);
          res(heap);
        }
      }
      this.on("sync", handler);

      if (this.config.timeout) setTimeout(() => {
        rej(new Error("failed to receive response"));
        this.off("sync", handler);
      }, this.config.timeout);
    });
  }

  public async addVar(data: any, name: string): Promise<void> {
    let heapID: number = data.heap.heapID;
    let addr: number = data.addr;

    this.port.postMessage({
      tag: "assign",
      name,
      heapID,
      addr,
      rebound: false,
    });

    return new Promise<void>((res, rej) => {
      const handler = (name2: string, heapID2: number, addr2: number, rebound: boolean) => {
        if (rebound && name2 == name && heapID2 == heapID && addr2 == addr) {
          this.off("assign", handler);
          res();
        }
      }
      this.on("assign", handler);

      if (this.config.timeout) setTimeout(() => {
        rej(new Error("failed to receive response"));
        this.off("assign", handler);
      }, this.config.timeout);
    });
  }

  public async syncVar(name: string): Promise<any> {
    return new Promise<any>((res, rej) => {
      const handler = (name2: string, heapID: number, addr: number, rebound: boolean) => {
        if (!rebound && name2 == name) {
          let heap: any = MockHeap.getHeapByID();
          let isArr: number = heap.getArrayAt(addr);
          let isPtr: number = heap.getPtrAt(addr);
          let dataType: any = TypeRegistry.getTypeByIndex();
          let data: any;

          if(isArr){
              data = {};
          }else if(isPtr){
              data = {};
          }else{
              data = new dataType(heap, addr);
          }

          this.port.postMessage({
              tag: "assign",
              name,
              heapID,
              addr,
              rebound: true,
          });

          res(data);
          this.off("assign", handler);
        }
      }
      this.on("assign", handler);

      if (this.config.timeout) setTimeout(() => {
        rej(new Error("failed to receive response"));
        this.off("assign", handler);
      }, this.config.timeout);
    });
  }
}

/* --- THE VITEST TESTS --- */

describe("SharedThread Communication Layer", () => {
  let instance: TestThread;

  beforeEach(() => {
    vi.useFakeTimers();
    instance = new TestThread();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("addHeap", () => {
    it("should send sync message and resolve when worker returns rebound message", async () => {
      const mockHeap = new MockHeap();
      const promise = instance.addHeap(mockHeap, "myHeap");

      // Verify immediate outbound message payload
      expect(instance.port.postMessage).toHaveBeenCalledWith({
        tag: "sync",
        name: "myHeap",
        buffer: mockHeap.buffer,
        heapID: mockHeap.heapID,
        rebound: false,
      });

      // Simulate thread rebound confirmation message
      instance.emit("sync", "myHeap", null, mockHeap.heapID, true);

      await expect(promise).resolves.toBeUndefined();
    });

    it("should timeout and reject if rebound message is missing", async () => {
      const mockHeap = new MockHeap();
      const promise = instance.addHeap(mockHeap, "myHeap");

      // Speed up timeline to trigger config.timeout execution
      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow("failed to receive response");
    });
  });

  describe("syncHeap", () => {
    it("should resolve with a heap and send rebound confirmation on initial event", async () => {
      const promise = instance.syncHeap("myHeap");

      // Trigger incoming event payload from main thread
      const incomingBuffer = new SharedArrayBuffer(1024);
      instance.emit("sync", "myHeap", incomingBuffer, 555, false);

      const resultHeap = await promise;
      expect(resultHeap.heapID).toBe(555);

      // Verify that syncHeap responded back with the vital rebound ack
      expect(instance.port.postMessage).toHaveBeenCalledWith({
        tag: "sync",
        name: "myHeap",
        buffer: null,
        heapID: 555,
        rebound: true,
      });
    });

    it("should timeout and reject if initial sync message does not arrive", async () => {
      const promise = instance.syncHeap("myHeap");

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow("failed to receive response");
    });
  });

  describe("addVar", () => {
    it("should transmit assign metadata and clear on matching rebound confirmation", async () => {
      const mockVar = new MockSharedType();
      mockVar.heap.heapID = 777;
      mockVar.addr = 32;

      const promise = instance.addVar(mockVar, "myInt");

      expect(instance.port.postMessage).toHaveBeenCalledWith({
        tag: "assign",
        name: "myInt",
        heapID: 777,
        addr: 32,
        rebound: false,
      });

      // Simulate a matching variable handshake event back
      instance.emit("assign", "myInt", 777, 32, true);

      await expect(promise).resolves.toBeUndefined();
    });

    it("should timeout and reject if confirmation fails to return", async () => {
      const mockVar = new MockSharedType();
      const promise = instance.addVar(mockVar, "myInt");

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow("failed to receive response");
    });
  });

  describe("syncVar", () => {
    it("should capture assign events, register data object, and emit rebound", async () => {
      const promise = instance.syncVar("myInt");

      // Send inbound state configuration variable
      instance.emit("assign", "myInt", 123, 64, false);

      const variable = await promise;
      expect(variable).toBeDefined();

      // Ensure confirmation message returned down the pipeline
      expect(instance.port.postMessage).toHaveBeenCalledWith({
        tag: "assign",
        name: "myInt",
        heapID: 123,
        addr: 64,
        rebound: true,
      });
    });

    it("should trigger standard timeout error on dropped packet streams", async () => {
      const promise = instance.syncVar("myInt");

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow("failed to receive response");
    });
  });
});
