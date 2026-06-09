import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Interface representation matching your internal architecture
interface WorkerMessage {
  tag: "message" | "sync" | "allocate";
  data?: any;
  label: string | null;
  [key: string]: any; 
}

// 1. Declare and hoist variables so they are available inside the hoisted mock factory
const { mockWorkerInstance, MockWorkerClass } = vi.hoisted(() => {
  // Array registry to store event handlers attached to the worker
  const listeners: Record<string, Function[]> = {};

  const instance = {
    postMessage: vi.fn(),
    on: vi.fn().mockImplementation((event: string, cb: any) => {
      // Proactively trigger the "online" callback to flip MainThread's active state
      if (event === "online") {
        cb(); 
      }
      
      // Store standard message listeners so the test can simulate incoming worker messages
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
      
      return instance;
    }),
    off: vi.fn().mockImplementation((event: string, cb: any) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(l => l !== cb);
      }
      return instance;
    }),
    terminate: vi.fn(),
    
    // Test helper to fire events into this mock worker from our test cases
    emitTestEvent(event: string, ...args: any[]) {
      if (listeners[event]) {
        // Use a copy clone so mutations inside your .off() handlers won't break the loop execution
        [...listeners[event]].forEach(cb => cb(...args));
      }
    }
  };

  const spyConstructor = vi.fn();

  class ConstructableMockWorker {
    constructor(...args: any[]) {
      spyConstructor(...args);
      return instance as any;
    }
  }

  return {
    mockWorkerInstance: instance,
    spyWorkerConstructor: spyConstructor,
    MockWorkerClass: ConstructableMockWorker,
  };
});

// 2. Mock the node module boundary (This call is hoisted right after vi.hoisted)
vi.mock("worker_threads", () => {
  return {
    Worker: MockWorkerClass,
    parentPort: {
      postMessage: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    isMainThread: true,
    threadName: "main-env",
    threadId: 0,
  };
});

// 3. Clean module imports can now safely run without initialization errors
import { MainThread } from "../src/index.js";

describe("MainThread Class Complete Value-Verification Suite", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // =========================================================================
  // SEND CONTEXT TESTS
  // =========================================================================
  it("should transmit plain data structures via send() with exact parameter verification", () => {
    const main = new MainThread("./worker.js");
    const testPayload = { action: "render", payload: [1, 2, 3] };
    
    main.send(testPayload, "MAIN_SEND_LABEL");

    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "message",
        label: "MAIN_SEND_LABEL",
        data: { action: "render", payload: [1, 2, 3] } // Strictly verifying data object values
      })
    );
  });

  it("should carry binary contexts via sendWithTransfer() containing correct buffer layout", () => {
    const main = new MainThread("./worker.js");
    const buffer = new ArrayBuffer(32);
    const testPayload = { data: buffer, meta: "binary" };

    main.sendWithTransfer(testPayload, [buffer], "MAIN_TRANSFER_LABEL");

    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "message",
        label: "MAIN_TRANSFER_LABEL",
        data: { data: buffer, meta: "binary" } // Strictly verifying data context properties
      }),
      [buffer] // Strictly verifying transferable array list references
    );
  });

  // =========================================================================
  // REQUEST CONTEXT TESTS
  // =========================================================================
  it("should resolve request() promise containing the exact returned matching data values", async () => {
    const main = new MainThread("./worker.js");

    const pendingRequest = main.request({ fetchId: 456 }, "FETCH_USER_DATA");

    setTimeout(() => {
      // Create message payload mimicking your custom internal message wrapper
      const incomingMessage: WorkerMessage = {
        tag: "message",
        label: "FETCH_USER_DATA",
        data: { id: 456, name: "John Doe", active: true }
      };
      
      // Simulates the background worker thread returning data up the pipe
      mockWorkerInstance.emitTestEvent("message", incomingMessage);
    }, 50);

    vi.advanceTimersByTime(50);
    
    // VERIFIED: Data parsed by request promise maps out accurately
    await expect(pendingRequest).resolves.toEqual({ id: 456, name: "John Doe", active: true });
  });

  // =========================================================================
  // LISTEN (INCOMING DATA) CONTEXT TESTS
  // =========================================================================
  it("should dispatch target triggers exactly once and verify payload values inside listenOnce()", () => {
    const main = new MainThread("./worker.js");
    const callbackSpy = vi.fn();

    main.listenOnce(callbackSpy, "EVENT_ONCE");
    
    const firstPayload: WorkerMessage = { tag: "message", label: "EVENT_ONCE", data: { status: "success" } };
    const secondPayload: WorkerMessage = { tag: "message", label: "EVENT_ONCE", data: { status: "ignored" } };

    mockWorkerInstance.emitTestEvent("message", firstPayload);
    mockWorkerInstance.emitTestEvent("message", secondPayload); // This should be caught by off() and dropped

    expect(callbackSpy).toHaveBeenCalledTimes(1);
    // VERIFIED: Confirm callback parameter matched the first payload strictly
    expect(callbackSpy).toHaveBeenCalledWith({ status: "success" });
  });

  it("should continuously process multiple unique inputs in the correct sequence inside listenAll()", () => {
    const main = new MainThread("./worker.js");
    const callbackSpy = vi.fn();

    main.listenAll(callbackSpy, "EVENT_STREAM");
    
    mockWorkerInstance.emitTestEvent("message", { tag: "message", label: "EVENT_STREAM", data: "chunk_alpha" });
    mockWorkerInstance.emitTestEvent("message", { tag: "message", label: "EVENT_STREAM", data: "chunk_beta" });

    expect(callbackSpy).toHaveBeenCalledTimes(2);
    // VERIFIED: Elements arriving down stream map into callbacks in chronological sequence order
    expect(callbackSpy).toHaveBeenNthCalledWith(1, "chunk_alpha");
    expect(callbackSpy).toHaveBeenNthCalledWith(2, "chunk_beta");
  });

  // =========================================================================
  // RESPOND (RPC REQUEST-RESPONSE) CONTEXT TESTS
  // =========================================================================
  it("should intercept worker commands once, evaluate params, and pipe calculation values to respondOnce()", () => {
    const main = new MainThread("./worker.js");
    // Implement standard function that manipulates the data parameter
    const handlerFn = vi.fn().mockImplementation((input: string) => `processed_${input}`);

    main.respondOnce(handlerFn, "RPC_CALC_ONCE");
    
    mockWorkerInstance.emitTestEvent("message", { tag: "message", label: "RPC_CALC_ONCE", data: "target_string" });

    // VERIFIED: Inbound parameters hitting the function inside your class are correct
    expect(handlerFn).toHaveBeenCalledWith("target_string");
    
    // VERIFIED: Outbox payload formatting dispatched to the background thread contains the processed text calculation
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tag: "message",
        label: "RPC_CALC_ONCE",
        data: "processed_target_string" // Proves input went through processing and generated the expected output structure
      })
    );
  });

  it("should check continuous variable values and pass cascading calculations to postMessage via respondAll()", () => {
    const main = new MainThread("./worker.js");
    const handlerFn = vi.fn().mockImplementation((val: number) => val + 100);

    main.respondAll(handlerFn, "RPC_STREAM_ALL");
    
    mockWorkerInstance.emitTestEvent("message", { tag: "message", label: "RPC_STREAM_ALL", data: 10 });
    mockWorkerInstance.emitTestEvent("message", { tag: "message", label: "RPC_STREAM_ALL", data: 25 });

    // VERIFIED: Checking that multiple arguments match parameters perfectly over time
    expect(handlerFn).toHaveBeenNthCalledWith(1, 10);
    expect(handlerFn).toHaveBeenNthCalledWith(2, 25);

    // VERIFIED: Multi-step verification showing output array packets arrive exactly containing processed values
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledTimes(2);
    expect(mockWorkerInstance.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ tag: "message", label: "RPC_STREAM_ALL", data: 110 })
    );
    expect(mockWorkerInstance.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ tag: "message", label: "RPC_STREAM_ALL", data: 125 })
    );
  });
});
