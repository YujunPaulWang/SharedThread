# SharedThread

[![v1.0.8](https://img.shields.io/npm/v/sharedthread)](https://www.npmjs.com/package/sharedthread)


A high-performance asynchronous multithreading library that wraps Node.js Worker Threads and SharedArrayBuffer for efficient, zero-copy variable sharing.

## Features

- **Zero-Copy Architecture**: Uses `SharedArrayBuffer` to mutate variables across threads.
- **Type-Safe Worker Communication**: Fully typed API for passing tasks, payloads, and shared memory structures.
- **Promise-Based API**: Interact with low-level worker threads using clean, modern `async/await` patterns.

## Installation

Install the package and its peer dependencies via npm:

```bash
npm install sharedthread
```
## Usage


### External Worker File (Recommended)

Create a new instance using `new MainThread(filepath)`.

#### `main.js`
```typescript
import { MainThread } from 'sharedthread';

// check optimal parallel threads available on the host machine
console.log(`Optimal Threads: ${MainThread.optimalThreads}`); 

async function startWorker() {
  const thread = new MainThread("./my-worker.js", {
    timeout: 5000, // messaging timeout for functions that expect responses
    workerOptions: { // any data you sent here can be accessed from the worker immediately
      workerData: { initialPayload: "Custom Meta Data" }
    }
  });

  // listen to cross-thread communication events(not required)
  thread.on('message', (data, label) => {
    console.log(`Received message with label [${label}]:`, data);
  });

  thread.on('error', (err) => {
    console.error('Thread threw an unhandled error:', err);
  });

  // wait safely until the worker signals it is online
  await thread.ready();
  console.log(`Thread status active: ${thread.isActive}`); // outputs: true
}

startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from 'sharedthread';

console.log(`Read workerData as ${WorkerThread.workerData}`);

WorkerThread.on('message', (data, label) => {
  console.log(`Received message with label [${label}]:`, data);
});
```
### Same File Worker

In CommonJS(require syntax), `__filename` is the current file.
In ES Modules(import syntax), `import.meta.filename` is is the current file;

#### `main.js`
```typescript
import { MainThread, WorkerThread, isMainThread } from 'sharedthread';

if(isMainThread){
  startWorker().catch(console.error);
}else{
  workerFunction().catch(console.error);
}

async function startWorker() {
  const thread = new MainThread(import.meta.filename);

  //do stuff for main thread
  console.log("main code");
}

async function workerFunction(){
  //do stuff in worker
  console.log("worker code")
}
```

### Variable Sharing

A `SharedHeap` instance acts as a memory manager allowing for shared variables across threads.

#### `main.js`
```typescript
import { MainThread, SharedHeap, SharedInt32 } from "sharedthread";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);
  await thread.ready();

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a shared int32 with a starting value of 10 on the heap
  const myInt32 = SharedInt32.fromData(myHeap, 10);

  // make the worker aware of the int32 and wait for confirmation
  await thread.addVar(myInt32, "myInt32");

  //change value
    myInt32.value = 25;

  //tell the worker that the value was modified
  thread.signal("modify value");


}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from "sharedthread";

async function runWorker(){
  // sync the heap
  await WorkerThread.syncHeap("myHeap");

  // sync to the int32 of the main thread
  const myInt32 = await WorkerThread.syncVar("myInt32");

  //wait for the value to be mofified
  await WorkerThread.waitFor("modify value");


  console.log(myInt32.value); // outputs: 25
}
runWorker();
```

### Shared Array

A `SharedArray` is a array of a fixed size that can be accessed across workers.

#### `main.js`
```typescript
import { MainThread, SharedHeap, SharedArray, SharedInt32 } from "sharedthread";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);
  await thread.ready();

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a array of size 6 and type int32
  const myArray = SharedArray.fromData(myHeap, {
    type: SharedInt32,
    length: 3,
    // the array property can be used to set an initial value(optional)
    array: [3, 8, 4],
  });

  // make the worker aware of the array and wait for confirmation
  await thread.addVar(myArray, "myArray");

  //subtract 5 from every value
  for(let i = 0; i < 3; i++){
    myArray[i].value -= 5;
  }

  thread.signal("modify value");

}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
async function runWorker(){
  // sync the heap
  await WorkerThread.syncHeap("myHeap");

  // sync to the array
  const myArray = await WorkerThread.syncVar("myArray");

  //read value before modification
  console.log(myArray[0].value); //outputs: 3
  console.log(myArray[1].value); //outputs: 8
  console.log(myArray[2].value); //outputs: 4

  await WorkerThread.waitFor("modify value");

  //read data from array after modification
  console.log(myArray[0].value); //outputs: -2
  console.log(myArray[1].value); //outputs: 3
  console.log(myArray[2].value); //outputs: -1
}
runWorker();
```

### Custom Struct

Any class that extends SharedStruct can act as a shared struct. Structs automatically convert reference types to pointers to that reference type.

#### `my-types.js`
```typescript
import { TypeRegistry, SharedStruct, SharedArray, SharedInt32 } from "sharedthread";

//it is reccomended to have the type declaration in a different file
//this allows both the main thead and the worker to access the type
export class MyStruct extends SharedStruct{
  static properties = {
    foo: { type: SharedInt32, param: 9},// int32 foo = 9
    bar: { type: SharedArray, param: { // int32[] bar = new int[7]
      type: SharedInt32,
      length: 7,
    }},
  }
}
/*equivalent structure
struct MyStruct{
  int32 foo = 9;
  int32[] arr = new int32[7];
}
*/

//notifies the libary to a custom type
TypeRegistry.registerType(MyStruct);
```

#### `main.js`
```typescript
import { MainThread, SharedHeap } from "sharedthread";
import { MyStruct } from "./my-types.js";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  // create a array of size 6 and type int32
  const myStruct = MyStruct.fromData(myHeap, {
    foo: 6, // set the initial value of foo to 6
  });
  // array is a reference type so it needs to be dereferenced when on another reference type
  myStruct.bar.deref[2].value = 5;

  // make the worker aware of the struct and wait for confirmation
  await thread.addVar(myStruct, "myStruct");

}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { WorkerThread } from 'sharedthread';
//this import is required to load the custom type properly
import { MyStruct } from "./my-types.js";

async function runWorker(){
  // sync the heap
  await WorkerThread.syncHeap("myHeap");

  // sync to the array
  const myStruct = await WorkerThread.syncVar("myStruct");

  //read data from array
  console.log(myStruct.foo.value); // outputs: 6
  console.log(myStruct.bar.deref[2].value); // outputs: 5
}
runWorker();
```

### Pointers

Pointers can point to any shared primitive or reference variable in the **same** heap. 

#### `main.js`
```typescript
import { MainThread, SharedHeap, SharedFloat64, SharedPointer } from "sharedthread";

async function startWorker(){
  // create worker
  const thread = new MainThread("./my-worker.js");
  thread.on("error", console.error);

  // create and add heap with 1000 bytes to worker thread
  const myHeap = new SharedHeap(1000);
  thread.addHeap(myHeap, "myHeap");

  //create a float64(equivalent to js number) and a pointer
  let myFloat64 = SharedFloat64.fromData(myHeap, Math.PI);
  let myPointer = SharedPointer.fromData(myHeap, {
    type: SharedFloat64,
    //optionally add the initial address it points to
    addr: myFloat64.addr
  });

  //because the float64 is indirectly referenced, it doesn't need to be synced
  await thread.addVar(myPointer, "myPointer");

  //wait for the worker thread
  await thread.waitFor("pointer modified");

  //read the new number
  console.log(myPointer.deref.value);//outputs: 2.718281828459045(Math.E)

}
startWorker().catch(console.error);
```

#### `my-worker.js`
```typescript
import { SharedFloat64, WorkerThread } from 'sharedthread';

async function runWorker(){
  // sync the heap
  let heap = await WorkerThread.syncHeap("myHeap");

  //only the pointer needs to be synced
  let myPointer = await WorkerThread.syncVar("myPointer");

  console.log(myPointer.heldType);// outputs: Class SharedFloat64{...}
  console.log(myPointer.deref.value);// outputs: 3.141592653589793(Math.PI)

  //add a different float32 to the pointer(has to bee same type as before and same heap as pointer)
  let myNewFloat64 = SharedFloat64.fromData(heap, Math.E);
  myPointer.deref = myNewFloat64;

  //tell the main thread the pointer has been modified
  WorkerThread.signal("pointer modified");
}
runWorker();
```