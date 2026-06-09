export class SharedHeap {
    private static heaps: SharedHeap[] = [];

    public static getHeapByID(i: number): SharedHeap {
        if (SharedHeap.heaps[i] === undefined) throw new Error(`cannot find heap with heapID`);
        return SharedHeap.heaps[i];
    }

    private readonly _heapID: number;
    private readonly _heapSize: number;
    private readonly _buffer: SharedArrayBuffer;
    private readonly _view: DataView;

    // Bit-Packing Constants for the Lower 32-bit Header
    private static readonly SHIFT_TYPEID = 0;
    private static readonly SHIFT_ARRAY = 23;
    private static readonly SHIFT_PTR = 26;
    private static readonly SHIFT_ALLOC = 29;

    private static readonly MASK_TYPEID = 0x7FFFFF;   // 23 bits
    private static readonly MASK_ARRAY = 0x7;        // 3 bits
    private static readonly MASK_PTR = 0x7;        // 3 bits
    private static readonly MASK_ALLOC = 0x7;        // 3 bits

    constructor(b: number | SharedArrayBuffer, heapID: number = SharedHeap.heaps.length) {
        if (SharedHeap.heaps[heapID] !== undefined) throw new Error("heap assignment overlap");
        this._heapID = heapID;
        SharedHeap.heaps[this._heapID] = this;

        if (b instanceof SharedArrayBuffer) {
            this._heapSize = b.byteLength;
            this._buffer = b;
            this._view = new DataView(this._buffer);
        } else {
            // Add 4 bytes to accommodate the listHead storing mechanism at the start of SAB
            this._heapSize = ((b + 4) + 3) & ~3;
            this._buffer = new SharedArrayBuffer(this._heapSize);
            this._view = new DataView(this._buffer);

            // Set default listhead value in the buffer
            this.listHead = -1;

            // First chunk header starts at offset 4 now instead of 0
            const initialPayloadSize = this._heapSize - 4 - 8;
            this.writeHeader(4, initialPayloadSize, 0, 0, 0, 0);

            // Set up pointers for the initial giant free node (offset 4)
            // next pointer at 4 + 8, prev pointer at 4 + 12
            this._view.setInt32(12, -1, true);
            this._view.setInt32(16, -1, true);

            this.syncFreeList();
        }
    }

    public get heapID(): number { return this._heapID; }
    public get view(): DataView { return this._view; }
    public get heapSize(): number { return this._heapSize; }
    public get buffer(): SharedArrayBuffer { return this._buffer; }
    
    // Dynamically reads and writes to the beginning of the SharedArrayBuffer
    public get listHead(): number { return this._view.getInt32(0, true); }
    public set listHead(offset: number) { this._view.setInt32(0, offset, true); }

    // --- Fixed Dual 32-Bit Bit-Packing Utilities ---

    private getHeaderSize(offset: number): number {
        return this._view.getUint32(offset, true);
    }

    public getHeaderAllocated(offset: number): number {
        const lowerHeader = this._view.getUint32(offset + 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_ALLOC) & SharedHeap.MASK_ALLOC;
    }

    private writeHeader(offset: number, size: number, alloc: number, ptr: number, array: number, typeID: number): void {
        if (typeID < 0 || typeID > SharedHeap.MASK_TYPEID) throw new Error("typeID out of bounds");
        if (size < 0 || size > 0xFFFFFFFF) throw new Error("size exceeds 32-bit limit");
        if (alloc < 0 || alloc > 7 || ptr < 0 || ptr > 7 || array < 0 || array > 7) throw new Error("alloc, ptr, and array must fit in 3 bits (0-7)");

        this._view.setUint32(offset, size, true);

        const lowerHeader = ((alloc & SharedHeap.MASK_ALLOC) << SharedHeap.SHIFT_ALLOC) |
            ((ptr & SharedHeap.MASK_PTR) << SharedHeap.SHIFT_PTR) |
            ((array & SharedHeap.MASK_ARRAY) << SharedHeap.SHIFT_ARRAY) |
            ((typeID & SharedHeap.MASK_TYPEID) << SharedHeap.SHIFT_TYPEID);

        this._view.setUint32(offset + 4, lowerHeader >>> 0, true);
    }

    public syncFreeList(): void {
        let current = 4; // Start evaluating past the 4-byte shared head
        this.listHead = -1;
        let lastFree = -1;

        while (current < this._heapSize) {
            const size = this.getHeaderSize(current);
            const allocVal = this.getHeaderAllocated(current);

            if (allocVal === 0) { 
                if (this.listHead === -1) {
                    this.listHead = current;
                }
                if (lastFree !== -1) {
                    this._view.setInt32(lastFree + 8, current, true);
                    this._view.setInt32(current + 12, lastFree, true);
                }
                lastFree = current;
            }
            current += 8 + size;
        }

        if (lastFree !== -1) {
            this._view.setInt32(lastFree + 8, -1, true);
        }
    }

    public allocate(requestedSize: number, typeID: number, isPtr: boolean = false, isArray: boolean = false): number {
        if (isNaN(requestedSize)) throw new Error("cannot allocate NaN size");
        if (requestedSize <= 0) throw new Error("cannot allocate negative size");

        const allocValue = 1;
        const ptrValue = isPtr ? 1 : 0;
        const arrayValue = isArray ? 1 : 0;

        const alignedSize = Math.max((requestedSize + 3) & ~3, 4);
        let currentOffset = this.listHead;

        while (currentOffset !== -1) {
            const size = this.getHeaderSize(currentOffset);

            if (size >= alignedSize) {
                const remainingSpace = size - alignedSize - 8;

                if (remainingSpace >= 12) {
                    const nextFreeOffset = currentOffset + 8 + alignedSize;

                    this.replaceFreeNode(currentOffset, nextFreeOffset);

                    this.writeHeader(currentOffset, alignedSize, allocValue, ptrValue, arrayValue, typeID);
                    this.writeHeader(nextFreeOffset, remainingSpace, 0, 0, 0, 0);
                } else {
                    this.removeFreeNode(currentOffset);
                    this.writeHeader(currentOffset, size, allocValue, ptrValue, arrayValue, typeID);
                }

                return currentOffset + 8;
            }
            currentOffset = this._view.getInt32(currentOffset + 8, true);
        }

        throw new Error("heap out of memory");
    }

    public free(ptr: number): void {
        // Minimum valid data pointer address is now 12 (4 bytes listHead + 8 bytes header)
        if (ptr < 12 || ptr >= this._heapSize) throw new Error("cannot free out of bounds");

        const headerOffset = ptr - 8;
        const size = this.getHeaderSize(headerOffset);

        this.writeHeader(headerOffset, size, 0, 0, 0, 0);
        this.addFreeNodeToFront(headerOffset);
    }

    private addFreeNodeToFront(offset: number): void {
        const oldHead = this.listHead;
        this.listHead = offset;

        this._view.setInt32(offset + 8, oldHead, true);
        this._view.setInt32(offset + 12, -1, true);

        if (oldHead !== -1) {
            this._view.setInt32(oldHead + 12, offset, true);
        }
    }

    // --- Public External Metadata Readers (Accepts Pointer Address, Reads Header) ---

    public getTypeIDAt(ptr: number): number {
        if (ptr < 12 || ptr >= this._heapSize) return 0;
        const lowerHeader = this._view.getUint32(ptr - 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_TYPEID) & SharedHeap.MASK_TYPEID;
    }

    public getAllocAt(ptr: number): number {
        if (ptr < 12 || ptr >= this._heapSize) return 0;
        const lowerHeader = this._view.getUint32(ptr - 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_ALLOC) & SharedHeap.MASK_ALLOC;
    }

    public getPtrAt(ptr: number): number {
        if (ptr < 12 || ptr >= this._heapSize) return 0;
        const lowerHeader = this._view.getUint32(ptr - 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_PTR) & SharedHeap.MASK_PTR;
    }

    public getArrayAt(ptr: number): number {
        if (ptr < 12 || ptr >= this._heapSize) return 0;
        const lowerHeader = this._view.getUint32(ptr - 4, true);
        return (lowerHeader >>> SharedHeap.SHIFT_ARRAY) & SharedHeap.MASK_ARRAY;
    }

    // --- Private Free-List Node Handlers ---

    private removeFreeNode(offset: number): void {
        const next = this._view.getInt32(offset + 8, true);
        const prev = this._view.getInt32(offset + 12, true);

        if (prev !== -1) this._view.setInt32(prev + 8, next, true);
        else this.listHead = next;

        if (next !== -1) this._view.setInt32(next + 12, prev, true);
    }

    private replaceFreeNode(oldOffset: number, newOffset: number): void {
        const next = this._view.getInt32(oldOffset + 8, true);
        const prev = this._view.getInt32(oldOffset + 12, true);

        if (next !== -1) this._view.setInt32(next + 12, newOffset, true);
        if (prev !== -1) this._view.setInt32(prev + 8, newOffset, true);
        else this.listHead = newOffset;

        this._view.setInt32(newOffset + 8, next, true);
        this._view.setInt32(newOffset + 12, prev, true);
    }
}
