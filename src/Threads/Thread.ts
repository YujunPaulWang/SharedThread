import { EventEmitter } from "node:events";
import { SharedHeap } from "../Memory/SharedHeap.js";
import { type Worker, type MessagePort, type WorkerOptions, postMessageToThread, type Transferable } from "node:worker_threads";
import { SharedType, type SharedTypeClass } from "../Memory/SharedType.js";
import { SharedArray } from "../Memory/SharedArray.js";
import { TypeRegistry } from "../Memory/TypeRegistry.js";
import { SharedPointer } from "../Memory/SharedPointer.js";


//standard message
interface WorkerMessageData {
    tag: "message",
    label: string,
    data: any,
}

//accepts a SharedArrayBuffer with a corresponding id
interface WorkerMessageSync {
    tag: "sync",
    name: string,
    buffer: SharedArrayBuffer | null,
    heapID: number,
    rebound: boolean,
}

//allocate a type on heapID at addr
interface WorkerMessageAllocate {
    tag: "assign",
    name: string,
    heapID: number,
    addr: number,
    rebound: boolean,
}


export type WorkerMessage = WorkerMessageData | WorkerMessageSync | WorkerMessageAllocate;

export type ThreadEvent = {
    internalmessage: [WorkerMessage],
    message: [data: any, label: string];
    sync: [name: string, buffer: SharedArrayBuffer | null, heapID: number, rebound: boolean];
    assign: [name: string, heapID: number, addr: number, rebound: boolean];
    error: [err: Error];
    messageerror: [err: Error];
    online: [];
    exit: [exitCode: number];
}

export interface ThreadStatic {
    sendToThread(threadId: number, data: any, label: string | null): void;

    transferToThread(threadId: number, data: any, transferList: Transferable[], label: string | null): void;
}

interface UnifiedPort {
    postMessage(value: any, transferList?: ReadonlyArray<any>): void;
}

export type PortHandle = (Worker | MessagePort) & EventEmitter & UnifiedPort;

export interface ThreadConfig {
    transient?: boolean,
    logLevel?: 0 | 1 | 2,
    timeout?: number | undefined,
    useTypescript?: boolean,

    //see https://nodejs.org/api/worker_threads.html#new-workerfilename-options
    workerOptions?: WorkerOptions,
    /*  argv?: any[],
        env?: any,
        eval?: boolean,
        execArgv?: boolean,
        stdin?: boolean,
        stdout?: boolean,
        stderr?: boolean,
        workerData?: any,
        trackUnmanagedFds?: boolean,
        transferList?: Transferable[],
        resourceLimits?: ResourceLimits,
            maxOldGenerationSizeMb?: number;
            maxYoungGenerationSizeMb?: number;
            codeRangeSizeMb?: number;
            stackSizeMb?: number;
        maxOldGenerationSizeMb?: number,
        maxYoungGenerationSizeMb?: number,
        codeRangeSizeMb?: number,
        stackSizeMb?: number,
        name?: string,*/
}

export abstract class Thread extends EventEmitter<ThreadEvent> {

    /**
     * Sends data to a specific thread.
     * @param threadId The unique identifier of the target thread.
     * @param data The payload payload to be sent.
     * @param label An optional filter label for the message.
     */
    public static async sendToThread(threadId: number, data: any, label: string | null = null): Promise<void> {
        if (!data) return;

        return postMessageToThread(threadId, {
            tag: "message",
            label,
            data,
        });
    }

    /**
     * Transfers memory or objects to a specific thread using a transfer list.
     * @param threadId The unique identifier of the target thread.
     * @param data The payload payload to be transferred.
     * @param transferList An array of transferable objects to move ownership.
     * @param label An optional filter label for the message.
     */
    public static async transferToThread(threadId: number, data: any, transferList: Transferable[], label: string | null = null): Promise<void> {
        if (!data) return;

        return postMessageToThread(threadId, {
            tag: "message",
            label,
            data,
        }, transferList);
    }

    protected port: PortHandle;

    protected config: ThreadConfig;

    /**
     * Creates an instance of the Thread class.
     * @param port The communication port handle for the thread.
     * @param config Optional configuration settings for the thread instance.
     */
    constructor(port: PortHandle, config: ThreadConfig = {}) {
        super();
        this.port = port;
        this.config = config;
    }


    /**
     * Sends a message through the thread port.
     * @param data The payload to be sent.
     * @param label An optional filter label for the message.
     */
    public send(data: any, label: string | null = null): void {
        if (!data) return;

        this.port.postMessage({
            tag: "message",
            label,
            data,
        });
    }

    /**
     * Sends a message through the thread port along with a transfer list.
     * @param data The payload to be transferred.
     * @param transferList An array of transferable objects to move ownership.
     * @param label An optional filter label for the message.
     */
    public sendWithTransfer(data: any, transferList: Transferable[], label: string | null = null): void {
        if (!data) return;

        this.port.postMessage({
            tag: "message",
            label,
            data,
        }, transferList);
    }

    /**
     * Sends a request message and waits asynchronously for a matching response label.
     * @param data The request payload to be sent.
     * @param label An optional filter label to match the upcoming response.
     */
    public async request(data: any, label: string | null = null): Promise<any> {
        if (!data) return;

        this.port.postMessage({
            tag: "message",
            label,
            data,
        });

        return new Promise<void>((res, rej) => {
            const handler = (data: any, label2: string) => {
                if (label == label2) {
                    res(data);
                    this.off("message", handler);
                }
            }
            this.on("message", handler);

            if (this.config.timeout) setTimeout(() => {
                rej(new Error("failed to receive response"));
                this.off("message", handler);
            }, this.config.timeout);
        });
    }

    /**
     * Listens for a single message matching the specified label and invokes a callback.
     * @param cb The callback function executed when a matching message arrives.
     * @param label An optional filter label to match incoming messages.
     */
    public listenOnce(cb: Function, label: string | null = null): void {
        const handler = (data: any, label2: string) => {
            if (label == label2) {
                cb(data);
                this.off("message", handler);
            }
        }
        this.on("message", handler);
    }

    /**
     * Listens for all messages matching the specified label and invokes a callback.
     * @param cb The callback function executed whenever a matching message arrives.
     * @param label An optional filter label to match incoming messages.
     */
    public listenAll(cb: Function, label: string | null = null): void {
        this.on("message", (data: any, label2: string) => {
            if (label == label2) {
                cb(data);
            }
        });
    }

    /**
     * Listens for a single message, executes a callback, and responds back with the return value.
     * @param cb The callback function that processes the data and returns a response.
     * @param label An optional filter label to match the incoming message and outgoing response.
     */
    public respondOnce(cb: Function, label: string | null = null): void {
        const handler = (data: any, label2: string) => {
            if (label == label2) {
                this.send(cb(data), label);
                this.off("message", handler);
            }
        }
        this.on("message", handler);
    }

    /**
     * Listens for all incoming messages, executes a callback, and responds back with the return values.
     * @param cb The callback function that processes incoming data and returns responses.
     * @param label An optional filter label to match incoming messages and outgoing responses.
     */
    public respondAll(cb: Function, label: string | null = null): void {
        this.on("message", (data: any, label2: string) => {
            if (label == label2) {
                this.send(cb(data), label);
            }
        });
    }

    /**
     * Adds a shared memory heap to the thread and waits for confirmation.
     * @param heap The SharedHeap or SharedArrayBuffer instance to share.
     * @param name The identification name for the shared heap.
     */
    public async addHeap(heap: SharedHeap | SharedArrayBuffer, name: string): Promise<void> {
        if (heap instanceof SharedArrayBuffer) {
            heap = new SharedHeap(heap);
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
            const handler = (name2: string, buffer: SharedArrayBuffer | null, heapID: number, rebound: boolean) => {
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

    /**
     * Synchronizes and builds a local reference to a shared heap from the thread.
     * @param name The identification name of the shared heap to sync.
     */
    public async syncHeap(name: string): Promise<SharedHeap> {
        return new Promise<SharedHeap>((res, rej) => {
            const handler = (name2: string, buffer: SharedArrayBuffer | null, heapID: number, rebound: boolean) => {
                if (!rebound && name == name2) {
                    const heap: SharedHeap = new SharedHeap(buffer as SharedArrayBuffer, heapID);

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

    /**
     * Assigns a shared variable to the thread environment and waits for acknowledgement.
     * @param data The shared variable instance containing heap identifiers and addresses.
     * @param name The identification name for the shared variable.
     */
    public async addVar(data: SharedType, name: string): Promise<void> {
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

    /**
     * Synchronizes a specific shared variable from the thread and resolves its instance type.
     * @param name The identification name of the shared variable to sync.
     */
    public async syncVar(name: string): Promise<SharedType> {
        return new Promise<SharedType>((res, rej) => {
            const handler = (name2: string, heapID: number, addr: number, rebound: boolean) => {
                if (!rebound && name2 == name) {
                    let heap: SharedHeap = SharedHeap.getHeapByID(heapID);
                    let isArr: number = heap.getArrayAt(addr);
                    let isPtr: number = heap.getPtrAt(addr);
                    let dataType: SharedTypeClass = TypeRegistry.getTypeByIndex(heap.getTypeIDAt(addr));
                    let data: SharedType;

                    if(isArr){
                        data = new SharedArray(heap, addr);
                    }else if(isPtr){
                        data = new SharedPointer(heap, addr);
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