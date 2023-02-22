import { Random } from "@/src/utils/random";


export function runLayer() {

    // Let's create a layer definition, which has some weights

    // Weights are a 2D array of numbers
    // The first dimension is the number of neurons in the layer, and the second dimension is the
    // number of neurons in the previous layer
    // We then have an activation function on each neuron

    let rand = new Random(1234);

    let wIn = 10;
    let wOut = 16;
    let weights = new Float32Array(wIn * wOut);
    let biases = new Float32Array(wOut);

    let inputs = new Float32Array(wIn);
    let outputs = new Float32Array(wOut);

    for (let i = 0; i < wIn; i++) {
        inputs[i] = rand.normal();
    }

    // setup weights randomly
    for (let i = 0; i < wOut; i++) {
        for (let j = 0; j < wIn; j++) {
            weights[j * wOut + i] = rand.normal() / Math.sqrt(wIn);
        }
        biases[i] = rand.normal();
    }

    // run the layer
    for (let i = 0; i < wOut; i++) {
        let a = biases[i];
        for (let j = 0; j < wIn; j++) {
            a += weights[j * wOut + i] * inputs[j];
        }
        outputs[i] = Math.max(0, a); // relu
    }

    // how would we do this on the gpu?
    // each shader is a neuron & sums up the weights & biases, applies activation and writes to output
    // what about the next phase? Do we always store the output of each layer?
    // I guess there's all the mixing so basically have to have a sync point there

    // What about for a transformer:
    // For each input, we generate V, Q, K, where each requires a matrix-vector multiply
    // Then we do a softmax on the QK^T matrix, and then a matrix-matrix multiply on the V matrix

    console.log(inputs, outputs);
}

