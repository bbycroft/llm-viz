import { base64ToArrayBuffer } from "./data";

export interface ITensorJson {
    shape: number[];
    dtype: string; // 'torch.float32', 'torch.int32', etc
    data: string // base64 encoded (using python's base64.b64encode)
}

// more gpt related than tensor related
export type ITensorSet = Record<string, TensorF32> & { 'config': IGptModelConfig };

export interface IGptModelConfig {
    model_type: string;
    n_layer: number;
    n_head: number;
    n_embd: number;

    vocab_size: number;
    block_size: number;

    B?: number;
}

// Just support float32 for now, cuz we're lazy
export class TensorF32 {
    isContiguous: boolean;
    constructor(
        public readonly shape: number[],
        public readonly buffer: Float32Array,
        public readonly stride: number[] = [],
    ) {
        let totalEls = shape.reduce((a, b) => a * b, 1);
        if (totalEls > buffer.length) {
            throw new Error(`Shape ${shape.join(', ')} requires ${totalEls} buffer, but buffer has size ${buffer.length}`);
        }

        let strideContiguous = new Array(shape.length);
        let s = 1;
        for (let i = shape.length - 1; i >= 0; i--) {
            strideContiguous[i] = s;
            s *= shape[i];
        }

        if (stride.length === 0) {
            this.stride = strideContiguous;
        } else if (stride.length !== shape.length) {
            throw new Error(`Stride length ${stride.length} does not match shape length ${shape.length}`);
        }

        this.isContiguous = true;
        for (let i = 0; i < stride.length; i++) {
            if (stride[i] !== strideContiguous[i]) {
                this.isContiguous = false;
                break;
            }
        }
    }

    view(shape: number[]) {
        let size = shape.reduce((a, b) => a * b, 1);
        let existingSize = this.shape.reduce((a, b) => a * b, 1);
        if (size !== existingSize) {
            throw new Error(`Invalid reshape: new size ${size} (${shape.join(', ')}) does not match existing size ${existingSize} (${this.shape.join(', ')})`);
        }
        if (!this.isContiguous) {
            throw new Error(`Cannot view non-contiguous tensor (or at least, there are potential cases where it would work, but we don't support them yet)`);
        }
        return new TensorF32(shape, this.buffer);
    }

    transpose(a: number, b: number) {
        if (a < 0 || a >= this.shape.length || b < 0 || b >= this.shape.length || a === b) {
            throw new Error(`Invalid transpose indices: ${a}, ${b} over shape ${this.shape.join(', ')}`);
        }
        let shape = [...this.shape];
        let stride = [...this.stride];
        let temp = shape[a]; shape[a] = shape[b]; shape[b] = temp;
        let temp2 = stride[a]; stride[a] = stride[b]; stride[b] = temp2;
        return new TensorF32(shape, this.buffer, stride);
    }

    permute(...axes: number[]) {
        let setItems = new Set(new Array(this.shape.length).fill(0).map((_, i) => i));
        axes.forEach(a => setItems.delete(a));
        if (axes.length !== this.shape.length || setItems.size !== 0) {
            throw new Error(`Invalid permute axes: ${axes.join(', ')} over shape ${this.shape.join(', ')}`);
        }

        let shape = axes.map(a => this.shape[a]);
        let stride = axes.map(a => this.stride[a]);
        return new TensorF32(shape, this.buffer, stride);
    }

    g(index: number[]) {
        return this.buffer[this.indexToOffset(index)];
    }

    s(index: number[], a: number) {
        this.buffer[this.indexToOffset(index)] = a;
    }

    indexToOffset(index: number[]) {
        if (index.length !== this.shape.length) {
            throw new Error(`Index length ${index.length} does not match shape length ${this.shape.length}`);
        }
        let offset = 0;
        for (let i = 0; i < index.length; i++) {
            if (index[i] >= this.shape[i]) {
                throw new Error(`Index ${index[i]} out of bounds for shape ${this.shape[i]}`);
            }
            offset += index[i] * this.stride[i];
        }
        return offset;
    }

    *indexIterator(): Generator<number[]> {
        // returns an iterator that returns the index of each element, where the index is an array
        let index = new Array(this.shape.length).fill(0);
        while (true) {
            yield index;
            let i = this.shape.length - 1;
            while (i >= 0) {
                index[i]++;
                if (index[i] < this.shape[i]) {
                    break;
                }
                index[i] = 0;
                i--;
            }
            if (i < 0) {
                break;
            }
        }
    }

    contiguous() {
        if (this.isContiguous) {
            return this;
        }
        return new TensorF32(this.shape, this.toFloat32Array());
    }

    // always returns a copy of a contiguous array
    toFloat32Array() {
        let size = this.shape.reduce((a, b) => a * b, 1);
        let array = new Float32Array(size);

        if (this.isContiguous) {
            array.set(this.buffer);
        } else {
            let index = new Array(this.shape.length).fill(0);
            let destIdx = 0;
            let offset = 0;
            while (true) {
                array[destIdx++] = this.buffer[offset];
                let i = this.shape.length - 1;
                while (i >= 0) {
                    index[i]++;
                    offset += this.stride[i];
                    if (index[i] < this.shape[i]) {
                        break;
                    }
                    offset -= index[i] * this.stride[i];
                    index[i] = 0;
                    i--;
                }
                if (i < 0) {
                    break;
                }
            }
        }
        return array;
    }

    static fromJson(obj: ITensorJson) {
        if (!obj.shape || !obj.dtype || !obj.data) {
            console.error('Invalid tensor json', obj);
            throw new Error('Invalid tensor json');
        }
        if (obj.dtype !== 'torch.float32') {
            console.error('Invalid tensor dtype', obj);
            throw new Error('Invalid tensor dtype');
        }
        let buf = base64ToArrayBuffer(obj.data);
        let array = new Float32Array(buf);
        return new TensorF32(obj.shape, array);
    }

    copyFrom(source: TensorF32) {
        if (source.shape.length !== this.shape.length || !source.contiguous || !this.contiguous) {
            throw new Error(`Invalid copy: source shape length ${source.shape.length} does not match target shape length ${this.shape.length}`);
        }
        for (let i = 0; i < this.shape.length; i++) {
            if (source.shape[i] !== this.shape[i]) {
                throw new Error(`Invalid copy: source shape ${source.shape[i]} does not match target shape ${this.shape[i]}`);
            }
        }
        this.buffer.set(source.buffer);
    }
}

function test() {
    let tensor = new TensorF32([2, 3], new Float32Array([1, 2, 3, 4, 5, 6]));

    // expected output: [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]
    for (let index of tensor.indexIterator()) {
        console.log(index, tensor.g(index));
    }
}

// test();
