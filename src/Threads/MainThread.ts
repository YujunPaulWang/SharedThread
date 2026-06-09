import { threadId, threadName, Worker } from "node:worker_threads";
import { Thread, type ThreadConfig, type ThreadStatic, type WorkerMessage } from "./Thread.js";
import { TypeRegistry } from "../Memory/TypeRegistry.js";

import os from "node:os";


export class MainThread extends Thread {

    public static get optimalTypeRegistrys(): number {
        return os.availableParallelism();
    }

    private worker: Worker;

    private active: boolean = false;

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

    public async ready(): Promise<void> {
        if (this.active) return;

        return new Promise<void>((res) => {
            this.port.once("online", () => {
                res();
            });
        });
    }

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
    private err(msg: string | Error): void {
        ///TODO
        throw new Error(`${new Date().toTimeString()} - ${threadName}(${threadId}) - ${msg}`);
    }

    public get isActive(): boolean {
        return this.active;
    }

    //functions that pass through the call
    public ref(): void {
        this.port.ref();
    }
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