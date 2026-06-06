import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 1. Setup Hoisted Parent Port Mocks before code imports
const { mockParentPort, mockWorkerData } = vi.hoisted(() => {
    const listeners: Record<string, Function[]> = {};

    const parentPortMock = {
        postMessage: vi.fn(),
        on: vi.fn().mockImplementation((event: string, cb: any) => {
            if (!listeners[event]) listeners[event] = [];
            listeners[event].push(cb);
            return parentPortMock;
        }),
        off: vi.fn().mockImplementation((event: string, cb: any) => {
            if (listeners[event]) {
                listeners[event] = listeners[event].filter(l => l !== cb);
            }
            return parentPortMock;
        }),

        emitTestMessage(msg: any) {
            if (listeners["message"]) {
                listeners["message"].forEach(cb => cb(msg));
            }
        }
    };

    const workerDataMock = {
        config: { timeout: 5000, transient: false },
        workerData: { initProp: "mock-value" }
    };

    return {
        mockParentPort: parentPortMock,
        mockWorkerData: workerDataMock
    };
});

// 2. Mock environment protocols
vi.mock("node:worker_threads", () => {
    return {
        isMainThread: false,
        parentPort: mockParentPort,
        workerData: mockWorkerData,
        threadName: "worker-env",
        threadId: 1,
        Worker: class MockWorker { }
    };
});

vi.mock("worker_threads", () => {
    return {
        isMainThread: false,
        parentPort: mockParentPort,
        workerData: mockWorkerData,
        threadName: "worker-env",
        threadId: 1,
        Worker: class MockWorker { }
    };
});

// 3. Import targets
import { WorkerThread } from "../src/index.js";

describe("WorkerThread Singleton Complete Suite", () => {
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
    it("should dispatch standard updates to the main thread with exact values via send()", () => {
        const complexData = { system: "ok", metrics: [1, 2, 3] };
        WorkerThread.send(complexData, "WORKER_SEND");

        expect(mockParentPort.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                tag: "message",
                label: "WORKER_SEND",
                data: { system: "ok", metrics: [1, 2, 3] } // Strict match
            })
        );
    });

    it("should forward low-overhead allocations via sendWithTransfer()", () => {
        const buffer = new ArrayBuffer(16);
        WorkerThread.sendWithTransfer({ raw: buffer }, [buffer], "WORKER_TRANSFER");

        expect(mockParentPort.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                tag: "message",
                label: "WORKER_TRANSFER",
                data: { raw: buffer }
            }),
            [buffer]
        );
    });

    // =========================================================================
    // REQUEST CONTEXT TESTS
    // =========================================================================
    it("should resolve request() promise and return correct matching payload data values", async () => {
        let internalMessageCallback: any = () => { };
        vi.spyOn(WorkerThread as any, "on").mockImplementation((...args: any[]) => {
            const [event, cb] = args;
            if (event === "message") internalMessageCallback = cb;
            return WorkerThread;
        });

        const pendingRequest = WorkerThread.request({ operation: "sort" }, "WORKER_REQ");

        setTimeout(() => {
            // Return the explicit output payload from the main thread
            internalMessageCallback("sorted_array_data", "WORKER_REQ");
        }, 15);

        vi.advanceTimersByTime(15);

        // Verifies that the data passed down to your resolving function is completely accurate
        await expect(pendingRequest).resolves.toBe("sorted_array_data");
    });

    // =========================================================================
    // LISTEN (INCOMING DATA) CONTEXT TESTS
    // =========================================================================
    it("should resolve single runtime incoming events and pass correct data to listenOnce()", () => {
        let messageHandlers: Function[] = [];
        vi.spyOn(WorkerThread as any, "on").mockImplementation((...args: any[]) => {
            const [event, cb] = args;
            if (event === "message") messageHandlers.push(cb);
            return WorkerThread;
        });
        vi.spyOn(WorkerThread as any, "off").mockImplementation((...args: any[]) => {
            const [event, cb] = args;
            if (event === "message") messageHandlers = messageHandlers.filter(h => h !== cb);
            return WorkerThread;
        });

        const cb = vi.fn();
        WorkerThread.listenOnce(cb, "WORKER_ONCE");

        const emitEvent = (data: any, label: string) => {
            [...messageHandlers].forEach(handler => handler(data, label));
        };

        emitEvent("correct_initial_data", "WORKER_ONCE");
        emitEvent("stale_secondary_data", "WORKER_ONCE");

        expect(cb).toHaveBeenCalledTimes(1);
        // VERIFIED: Data checks out safely
        expect(cb).toHaveBeenCalledWith("correct_initial_data");
    });

    it("should track recurring data elements sequentially via listenAll()", () => {
        const messageHandlers: Function[] = [];
        vi.spyOn(WorkerThread as any, "on").mockImplementation((...args: any[]) => {
            const [event, cb] = args;
            if (event === "message") messageHandlers.push(cb);
            return WorkerThread;
        });

        const cb = vi.fn();
        WorkerThread.listenAll(cb, "WORKER_STREAM");

        const emitEvent = (data: any, label: string) => {
            messageHandlers.forEach(handler => handler(data, label));
        };

        emitEvent({ chunkId: 1 }, "WORKER_STREAM");
        emitEvent({ chunkId: 2 }, "WORKER_STREAM");

        expect(cb).toHaveBeenCalledTimes(2);
        // VERIFIED: Sequential values passed to your continuous callbacks are exact
        expect(cb).toHaveBeenNthCalledWith(1, { chunkId: 1 });
        expect(cb).toHaveBeenNthCalledWith(2, { chunkId: 2 });
    });

    // =========================================================================
    // RESPOND (RPC REQUEST-RESPONSE) CONTEXT TESTS
    // =========================================================================
    it("should intercept main thread commands once, check input params, and reply with respondOnce()", () => {
        let messageHandlers: Function[] = [];
        vi.spyOn(WorkerThread as any, "on").mockImplementation((...args: any[]) => {
            const [event, cb] = args;
            if (event === "message") messageHandlers.push(cb);
            return WorkerThread;
        });
        vi.spyOn(WorkerThread as any, "off").mockImplementation((...args: any[]) => {
            const [event, cb] = args;
            if (event === "message") messageHandlers = messageHandlers.filter(h => h !== cb);
            return WorkerThread;
        });

        const handlerFn = vi.fn().mockImplementation((input) => `processed_${input}`);
        WorkerThread.respondOnce(handlerFn, "WORKER_RPC_ONCE");

        const emitEvent = (data: any, label: string) => {
            [...messageHandlers].forEach(handler => handler(data, label));
        };

        emitEvent("raw_input_data", "WORKER_RPC_ONCE");

        // VERIFIED: Input into your handler was correct
        expect(handlerFn).toHaveBeenCalledWith("raw_input_data");

        // VERIFIED: Final payload transmitted out to postMessage matches the computed processing logic
        expect(mockParentPort.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                tag: "message",
                label: "WORKER_RPC_ONCE",
                data: "processed_raw_input_data"
            })
        );
    });

    it("should check continuous inputs and map cascading outputs correctly via respondAll()", () => {
        const messageHandlers: Function[] = [];
        vi.spyOn(WorkerThread as any, "on").mockImplementation((...args: any[]) => {
            const [event, cb] = args;
            if (event === "message") messageHandlers.push(cb);
            return WorkerThread;
        });

        const handlerFn = vi.fn().mockImplementation((num) => num * 10);
        WorkerThread.respondAll(handlerFn, "WORKER_RPC_ALL");

        const emitEvent = (data: any, label: string) => {
            messageHandlers.forEach(handler => handler(data, label));
        };

        emitEvent(5, "WORKER_RPC_ALL");
        emitEvent(9, "WORKER_RPC_ALL");

        // VERIFIED: Inbound variables map smoothly
        expect(handlerFn).toHaveBeenNthCalledWith(1, 5);
        expect(handlerFn).toHaveBeenNthCalledWith(2, 9);

        // VERIFIED: Accurate tracking on multiple outputs dispatched to the parentPort channel
        expect(mockParentPort.postMessage).toHaveBeenCalledTimes(2);
        expect(mockParentPort.postMessage).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ tag: "message", label: "WORKER_RPC_ALL", data: 50 })
        );
        expect(mockParentPort.postMessage).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ tag: "message", label: "WORKER_RPC_ALL", data: 90 })
        );
    });
});
