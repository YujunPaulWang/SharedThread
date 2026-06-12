import { threadId, threadName, Worker } from "node:worker_threads";
import { Thread, type ThreadConfig, type ThreadStatic, type WorkerMessage } from "./Thread.js";
import { TypeRegistry } from "../Memory/TypeRegistry.js";

import os from "node:os";


export class MainThread extends Thread {

    /**
     * Gets the recommended number of parallel threads based on available hardware resources.
     */
    public static get optimalThreads(): number {
        return os.availableParallelism();
    }

    private worker: Worker;

    private active: boolean = false;

    /**
     * Creates and initializes a new MainThread instance, spawning the underlying worker.
     * @param path The filepath string or a function to be executed as the worker payload.
     * @param config Optional configuration settings for managing worker behaviors and options.
     */
    constructor(path: string | Function, config: ThreadConfig = {}) {
        //setup config
        config = { ...config };
        config.workerOptions ??= {};
        config.workerOptions.transferList ??= [];
        config.workerOptions.workerData = {
            config: {
                timeout: config.timeout,
                logLevel: config.logLevel,
            },
            default: config.workerOptions.workerData
        }
        if (config.useTypescript) {
            if (config.workerOptions.execArgv) {
                config.workerOptions.execArgv.push("--import");
                config.workerOptions.execArgv.push("tsx");
            } else {
                config.workerOptions.execArgv = [...process.execArgv, '--import', 'tsx']
            }
        }

        //send types
        let typeBuffer: ArrayBuffer = TypeRegistry.getTypeBuffer();
        config.workerOptions.transferList.push(typeBuffer);

        //insert extra data into workerData
        config.workerOptions.workerData = {
            orig: config.workerOptions.workerData,
            //extra data here for syncing
            types: typeBuffer,
        }


        //spawn worker
        if (path instanceof Function) {
            path = path.toString();
            config.workerOptions.eval = true;
        }
        let worker = new Worker(path, config.workerOptions);
        let port = worker;

        super(port, config);

        this.worker = worker;

        //set up event handlers
        this.port.on("message", (msg: WorkerMessage) => {
            this.emit("internalmessage", msg);
            switch (msg.tag) {
                case "message":
                    this.emit("message", msg.data, msg.label);
                    //todo
                    break;
                case "sync":
                    this.emit("sync", msg.name, msg.buffer, msg.heapID, msg.rebound);
                    //todo
                    break;
                case "assign":
                    this.emit("assign", msg.name, msg.heapID, msg.addr, msg.rebound);
                    //todo
                    break;
            }

            if (this.config.transient) {
                this.worker.terminate();
            }
        });

        this.worker.on("error", (err: Error) => {
            let caught: boolean = this.emit("error", err);

            if (!caught) {
                this.err(err);
            }
        });

        this.port.on("messageerror", (err: Error) => {
            let caught: boolean = this.emit("messageerror", err);

            if (!caught) {
                this.err(err);
            }
        });

        this.worker.on("online", () => {
            this.emit("online");
            this.active = true;
        });

        this.worker.on("exit", (exitCode: number) => {
            this.active = false;
            this.emit("exit", exitCode);
        });

    }

    /**
     * Resolves asynchronously once the underlying worker thread has completed initialization and is active.
     */
    public async ready(): Promise<void> {
        if (this.active) return;

        return new Promise<void>((res) => {
            this.port.once("online", () => {
                res();
            });
        });
    }

    /**
     * Forces the worker thread to stop execution immediately.
     */
    public terminate(): Promise<number> {
        if (!this.active) this.err("cannot terminate worker(worker is not active)");

        this.active = false;
        return this.worker.terminate();
    }

    // private log(level: number, msg: string): void{
    //     ///////TODO
    //     if(level >= (this.config.logLevel ?? 0)){
    //         console.log(`${new Date().toTimeString()} - ${threadName}(${threadId}) - ${msg}`);
    //     }
    // }
    
    /**
     * Formats and throws an internal execution error for the main thread environment.
     * @param msg The error instance or error message string.
     */
    private err(msg: string | Error): void {
        ///TODO
        throw new Error(`${new Date().toTimeString()} - ${threadName}(${threadId}) - ${msg}`);
    }

    /**
     * Indicates whether the worker thread is actively running.
     */
    public get isActive(): boolean {
        return this.active;
    }

    /**
     * Keeps the Node.js event loop active as long as the worker thread is running.
     */
    public ref(): void {
        this.port.ref();
    }

    /**
     * Allows the Node.js event loop to exit even if the worker thread remains active.
     */
    public unref(): void {
        this.port.unref();
    }

    //todo
    // worker.cpuUsage([prev])
    // worker.getHeapSnapshot([options])
    // worker.getHeapStatistics()
    // worker.performance
    // worker.stderr
    // worker.stdin
    // worker.stdout

}
MainThread satisfies ThreadStatic;

export default MainThread;