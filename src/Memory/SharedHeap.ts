export class SharedHeap {
    private static heaps: SharedHeap[] = [];

    public static getHeapByID(i: number): SharedHeap {
        if (SharedHeap.heaps[i] == undefined) throw new Error(`cannot find heap with heapID`);
        return SharedHeap.heaps[i];
    }

    private readonly _heapID: number;
    private readonly _heapSize: number;
    private readonly _buffer: SharedArrayBuffer;
    private readonly _view: DataView;
    private _listHead: number;

    constructor(b: number | SharedArrayBuffer, heapID: number = SharedHeap.heaps.length, listHead: number = -1) {
        if (SharedHeap.heaps[heapID] != undefined) throw new Error("heap assignment overlap");
        this._heapID = heapID;
        SharedHeap.heaps[this._heapID] = this;
        this._listHead = listHead;

        if (b instanceof SharedArrayBuffer) {
            this._heapSize = b.byteLength;
            this._buffer = b;
            this._view = new DataView(this._buffer);
        } else {
            this._heapSize = (b + 3) & ~3;
            this._buffer = new SharedArrayBuffer(this._heapSize);
            this._view = new DataView(this._buffer);
            this.syncFreeList();
        }
    }

    public get heapID(): number {
        return this._heapID;
    }
    public get view(): DataView {
        return this._view;
    }
    public get heapSize(): number {
        return this._heapSize;
    }
    public get buffer(): SharedArrayBuffer {
        return this._buffer;
    }
    public get listHead(): number {
        return this._listHead;
    }

    private syncFreeList(): void {
        let current = 0;
        this._listHead = -1;
        let lastFree = -1;

        while (current < this._heapSize) {
            const header = this._view.getUint32(current);
            const isAllocated = (header & 1) === 1;
            const size = header & ~1;

            if (!isAllocated) {
                if (this._listHead === -1) {
                    this._listHead = current;
                }
                if (lastFree !== -1) {
                    this._view.setInt32(lastFree + 4, current);
                    this._view.setInt32(current + 8, lastFree);
                }
                lastFree = current;
            }
            current += 4 + size;
        }

        if (lastFree !== -1) {
            this._view.setInt32(lastFree + 4, -1);
        }
    }

    allocate(requestedSize: number): number {
        if (requestedSize <= 0) throw new Error("cannot allocate negative size");

        const alignedSize = Math.max((requestedSize + 3) & ~3, 8);

        let currentOffset = this._listHead;

        while (currentOffset !== -1) {
            const header = this._view.getUint32(currentOffset);
            const size = header & ~1;

            if (size >= alignedSize) {
                const remainingSpace = size - alignedSize - 4;

                if (remainingSpace >= 8) {
                    this._view.setUint32(currentOffset, alignedSize | 1);
                    const nextFreeOffset = currentOffset + 4 + alignedSize;
                    this._view.setUint32(nextFreeOffset, remainingSpace | 0);

                    this.replaceFreeNode(currentOffset, nextFreeOffset);
                } else {
                    this._view.setUint32(currentOffset, size | 1);

                    this.removeFreeNode(currentOffset);
                }

                return currentOffset + 4;
            }
            currentOffset = this._view.getInt32(currentOffset + 4);
        }

        throw new Error("heap out of memory");
    }

    public free(ptr: number): void {
        if (ptr < 4 || ptr >= this._heapSize) throw new Error("cannot free out of bounds");

        const headerOffset = ptr - 4;
        const header = this._view.getUint32(headerOffset);
        const size = header & ~1;

        this._view.setUint32(headerOffset, size | 0);

        this.addFreeNodeToFront(headerOffset);

        this.coalesce();
    }

    private removeFreeNode(offset: number): void {
        const next = this._view.getInt32(offset + 4);
        const prev = this._view.getInt32(offset + 8);

        if (prev !== -1) this._view.setInt32(prev + 4, next);
        else this._listHead = next;

        if (next !== -1) this._view.setInt32(next + 8, prev);
    }

    private replaceFreeNode(oldOffset: number, newOffset: number): void {
        const next = this._view.getInt32(oldOffset + 4);
        const prev = this._view.getInt32(oldOffset + 8);

        if (prev !== -1) this._view.setInt32(prev + 4, newOffset);
        else this._listHead = newOffset;

        if (next !== -1) this._view.setInt32(next + 8, newOffset);

        this._view.setInt32(newOffset + 4, next);
        this._view.setInt32(newOffset + 8, prev);
    }

    private addFreeNodeToFront(offset: number): void {
        this._view.setInt32(offset + 4, this._listHead);
        this._view.setInt32(offset + 8, -1);

        if (this._listHead !== -1) {
            this._view.setInt32(this._listHead + 8, offset);
        }
        this._listHead = offset;
    }

    private coalesce(): void {
        let currentOffset = 0;

        while (currentOffset < this._heapSize) {
            const currentHeader = this._view.getUint32(currentOffset);
            const currentAlloc = (currentHeader & 1) === 1;
            const currentSize = currentHeader & ~1;

            const nextOffset = currentOffset + 4 + currentSize;
            if (nextOffset >= this._heapSize) break;

            const nextHeader = this._view.getUint32(nextOffset);
            const nextAlloc = (nextHeader & 1) === 1;
            const nextSize = nextHeader & ~1;

            if (!currentAlloc && !nextAlloc) {
                this.removeFreeNode(nextOffset);

                const newSize = currentSize + 4 + nextSize;
                this._view.setUint32(currentOffset, newSize | 0);

                this.removeFreeNode(currentOffset);
                this.addFreeNodeToFront(currentOffset);
                continue;
            }

            currentOffset = nextOffset;
        }
    }
}