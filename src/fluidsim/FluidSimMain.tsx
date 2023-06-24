'use client';

import { PerlinNoise2D } from './PerlinNoise';

export interface IFluidSimState {
    running: boolean;
    sim: IFluidSim;
    canvasTemp: HTMLCanvasElement;
}

export interface ICanvasTargetDef {
    canvas: HTMLCanvasElement;
    name: string;
}

export interface IFluidSim {
    width: number;
    height: number;
    numPressureIterations: number;
    cells: Float32Array; // 2d array of floats, with values for (temperature, density, velocityX, velocityY)

    cells2: Float32Array;
    cells3: Float32Array;

    pressure0: Float32Array;
    pressure1: Float32Array;
    divergence0: Float32Array;
    divergence1: Float32Array;

    cellSize: number;

    aggregates: ISimAggregates | null;

    iterCount: number;
}

export function initFluidSimState(): IFluidSimState {
    return {
        sim: initFluidSim(64, 64),
        running: false,
        canvasTemp: document.createElement('canvas'),
    };
}

export function initFluidSim(w: number, h: number): IFluidSim {
    let width = w;
    let height = h;

    let boxSizeM = 0.1; // 10cm
    let cellSize = boxSizeM / width;

    let sim: IFluidSim = {
        width,
        height,
        numPressureIterations: 1,
        cells: new Float32Array(width * height * 4),
        cells2: new Float32Array(width * height * 4),
        cells3: new Float32Array(width * height * 4),
        pressure0: new Float32Array(width * height),
        pressure1: new Float32Array(width * height),
        divergence0: new Float32Array(width * height),
        divergence1: new Float32Array(width * height),
        cellSize,
        aggregates: null,
        iterCount: 0,
    };

     let scaleX = 4 / width;
     let scaleY = 4 / height;
     let perlin = new PerlinNoise2D(4);
     let perlinVelX = new PerlinNoise2D(7);
     let perlinVelY = new PerlinNoise2D(8);
     let maxVelX = 0;
     for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            sim.cells[(y * width + x) * 4 + 0] = perlin.octaveNoise((x + 10) * scaleX, (y + 10) * scaleY, 5, 0.8); // temperature
            sim.cells[(y * width + x) * 4 + 1] = 1.0; // density

            // let velX = perlinVelX.octaveNoise((x + 10) * scaleX, (y + 10) * scaleY, 4, 0.2) / 40.0;
            // let velY = perlinVelY.octaveNoise((x + 10) * scaleX, (y + 10) * scaleY, 4, 0.2) / 40.0;
            let velX = 0;
            let velY = 0;

            // units: m/s
            // a rectangular region of velocity, in the center of the screen, pointing up and to the right a bit
            if (x > width * 4 / 10 && x < width * 6 / 10 && y > height * 4 / 10 && y < height * 6 / 10) {
                velX = 4 / 100; // 0.4 cm/s
                velY = 4 / 100;
                maxVelX = Math.max(maxVelX, velX);
            }

            sim.cells[(y * width + x) * 4 + 2] = velX;
            sim.cells[(y * width + x) * 4 + 3] = velY;
        }
    }

    console.log(`maxVelX: ${maxVelX}, cellSize: ${cellSize}, maxVelX / cellSize: ${maxVelX / cellSize}`);

    fixBoundaries(sim);
    computeAggregateValues(sim);

    return sim;
}

export function stepFluidSim(sim: IFluidSim, dtMs: number) {
    let startTime = performance.now();
    let dt = dtMs / 1000.0; // convert to seconds, since we're working in SI units

    function getCell(arr: Float32Array, i: number, j: number, k: number) {
        return arr[(i * sim.width + j) * 4 + k];
    }

    function getCellClamped(arr: Float32Array, i: number, j: number, k: number) {
        i = i < 0 ? 0 : i >= sim.height ? sim.height - 1 : i;
        j = j < 0 ? 0 : j >= sim.width ? sim.width - 1 : j;
        return arr[(i * sim.width + j) * 4 + k];
    }

    function setCell(arr: Float32Array, i: number, j: number, k: number, value: number) {
        arr[(i * sim.width + j) * 4 + k] = value;
    }

    function getCell0(arr: Float32Array, i: number, j: number) {
        return arr[i * sim.width + j];
    }

    function setCell0(arr: Float32Array, i: number, j: number, v: number) {
        arr[i * sim.width + j] = v;
    }

    function getCell0Clamped(arr: Float32Array, i: number, j: number) {
        i = i < 0 ? 0 : i >= sim.height ? sim.height - 1 : i;
        j = j < 0 ? 0 : j >= sim.width ? sim.width - 1 : j;
        return arr[i * sim.width + j];
    }

    function getCellBilinearClamped(arr: Float32Array, y: number, x: number, k: number) {
        let ya = Math.floor(y);
        let xa = Math.floor(x);
        let yb = ya + 1;
        let xb = xa + 1;

        let a = getCellClamped(arr, ya, xa, k);
        let b = getCellClamped(arr, yb, xa, k);
        let c = getCellClamped(arr, ya, xb, k);
        let d = getCellClamped(arr, yb, xb, k);

        let y0 = y - ya;
        let x0 = x - xa;

        let y1 = 1 - y0;
        let x1 = 1 - x0;

        return (a * x1 * y1) + (b * x1 * y0) + (c * x0 * y1) + (d * x0 * y0);
    }

    // advection

    if (sim.iterCount > 0) {
        let maxDx = 0;
        let maxVx = 0;
        for (let y = 0; y < sim.height; y++) {
            for (let x = 0; x < sim.width; x++) {
                let vX = getCell(sim.cells, y, x, 2);
                let vY = getCell(sim.cells, y, x, 3);

                // given velocity, where would we have been at -dtMs?
                let x0 = x - vX * dt / sim.cellSize;
                let y0 = y - vY * dt / sim.cellSize;

                maxDx = Math.max(maxDx, Math.abs(x0 - x));
                maxVx = Math.max(maxVx, Math.abs(vX));

                // get all the state variables at that point
                let tempSrc = getCellBilinearClamped(sim.cells, y0, x0, 0);
                let densitySrc = getCellBilinearClamped(sim.cells, y0, x0, 1);
                let velXSrc = getCellBilinearClamped(sim.cells, y0, x0, 2);
                let velYSrc = getCellBilinearClamped(sim.cells, y0, x0, 3);

                setCell(sim.cells2, y, x, 0, tempSrc);
                setCell(sim.cells2, y, x, 1, densitySrc);
                setCell(sim.cells2, y, x, 2, velXSrc);
                setCell(sim.cells2, y, x, 3, velYSrc);
            }
        }

        // console.log(`maxDx: ${maxDx * 1000/20} (cells/s), maxVx: ${maxVx * 100} (cm/s)`);
    } else {
        sim.cells2.set(sim.cells);
    }

    // diffusion (not really needed, since we get plenty of numerical diffusion from the advection step)

    let arrOrig = sim.cells2;
    let arrFrom = sim.cells;
    arrFrom.set(arrOrig);
    let arrTo = sim.cells3;

    let tempDiffusionRate = 0.0; // 1.0 / 1000;
    let tempAlpha = tempDiffusionRate * dt / (sim.cellSize * sim.cellSize);
    let tempBeta = 1 + 4 * tempAlpha;

    let densityDiffusionRate = 0.1;
    let densityAlpha = densityDiffusionRate * dt / (sim.cellSize * sim.cellSize);
    let densityBeta = 1 + 4 * densityAlpha;

    let viscosity = 0.5 / 1000;
    let velocityAlpha = viscosity * dt / (sim.cellSize * sim.cellSize);
    let velocityBeta = 1 + 4 * velocityAlpha;

    function diffuseCell(i: number, j: number, k: number, alpha: number, beta: number) {
        let orig = getCell(arrOrig, i, j, k);
        let up = getCellClamped(arrFrom, i - 1, j, k);
        let down = getCellClamped(arrFrom, i + 1, j, k);
        let left = getCellClamped(arrFrom, i, j - 1, k);
        let right = getCellClamped(arrFrom, i, j + 1, k);

        // gauss-seidel relaxation
        let laplace = left + right + up + down;
        let dst = (orig + alpha * laplace) / beta;
        setCell(arrTo, i, j, k, dst);
    }

    if (false) {
        for (let iter = 0; iter < 4; iter++) {
            for (let i = 0; i < sim.height; i++) {
                for (let j = 0; j < sim.width; j++) {
                    // temps:
                    diffuseCell(i, j, 0, tempAlpha, tempBeta);
                    diffuseCell(i, j, 1, densityAlpha, densityBeta);
                    diffuseCell(i, j, 2, velocityAlpha, velocityBeta);
                    diffuseCell(i, j, 3, velocityAlpha, velocityBeta);
                }
            }

            // swap arrays
            let tmp = arrFrom;
            arrFrom = arrTo;
            arrTo = tmp;
        }
    }

    // projection

    // (we've already got our tentative velocity field in arrFrom, and don't have things like gravity to worry about)

    // solve pressure-poisson equation
    // let pressureAlpha = sim.cellSize * sim.cellSize;
    // let pressureBeta = 1;

    let pressureFrom = sim.pressure0;
    let pressureTo = sim.pressure1;

    function calcDivergence(srcArr: Float32Array, divArray: Float32Array) {
        // precompute the divergence of the tentative velocity field
        for (let y = 0; y < sim.height; y++) {
            for (let x = 0; x < sim.width; x++) {
                let divX = getCellClamped(srcArr, y, x + 1, 2) - getCellClamped(srcArr, y, x - 1, 2);
                let divY = getCellClamped(srcArr, y + 1, x, 3) - getCellClamped(srcArr, y - 1, x, 3);
                let divergence = (divX + divY) / (2 * sim.cellSize);
                setCell0(divArray, y, x, divergence);
            }
        }
    }

    function calcDivergenceFreeVelocityField(arrFrom: Float32Array, arrTo: Float32Array, pressure: Float32Array) {
        for (let y = 0; y < sim.height; y++) {
            for (let x = 0; x < sim.width; x++) {
                let pressureUp = getCell0Clamped(pressure, y - 1, x);
                let pressureDown = getCell0Clamped(pressure, y + 1, x);
                let pressureLeft = getCell0Clamped(pressure, y, x - 1);
                let pressureRight = getCell0Clamped(pressure, y, x + 1);

                let velXSrc = getCell(arrFrom, y, x, 2);
                let velXDst = velXSrc - (pressureRight - pressureLeft) / (2 * sim.cellSize);
                setCell(arrTo, y, x, 2, velXDst);

                let velYSrc = getCell(arrFrom, y, x, 3);
                let velYDst = velYSrc - (pressureDown - pressureUp) / (2 * sim.cellSize);
                setCell(arrTo, y, x, 3, velYDst);
            }
        }
    }

    function calcPressureField(divergenceField: Float32Array, pressureFrom: Float32Array, pressureTo: Float32Array) {
        for (let y = 0; y < sim.height; y++) {
            for (let x = 0; x < sim.width; x++) {
                let divergence = getCell0(divergenceField, y, x);
                let pressureUp = getCell0Clamped(pressureFrom, y - 1, x);
                let pressureDown = getCell0Clamped(pressureFrom, y + 1, x);
                let pressureLeft = getCell0Clamped(pressureFrom, y, x - 1);
                let pressureRight = getCell0Clamped(pressureFrom, y, x + 1);

                let pressureLaplace = pressureLeft + pressureRight + pressureUp + pressureDown;
                let pressureDst = (pressureLaplace - divergence * sim.cellSize * sim.cellSize) / 4;
                setCell0(pressureTo, y, x, pressureDst);
            }
        }
    }

    function logDivergenceStats(divergenceField: Float32Array) {
        let min = 0;
        let max = 0;
        let sum = 0;
        let count = 0;
        for (let y = 0; y < sim.height; y++) {
            for (let x = 0; x < sim.width; x++) {
                let divergence = getCell0(divergenceField, y, x);
                min = Math.min(min, divergence);
                max = Math.max(max, divergence);
                sum += divergence;
                count++;
            }
        }
        console.log("divergence: min=" + min + ", max=" + max + ", avg=" + (sum / count));
    }

    if (true) {

        pressureFrom.fill(0);

        calcDivergence(arrFrom, sim.divergence0);
        sim.divergence1.set(sim.divergence0);

        let pressureIterCount = sim.iterCount === 0 ? 1024 : 200;

        // iteratively calculate the pressure field
        for (let iter = 0; iter < pressureIterCount; iter++) {
            calcPressureField(sim.divergence0, pressureFrom, pressureTo);

            // swap arrays
            let tmp = pressureFrom;
            pressureFrom = pressureTo;
            pressureTo = tmp;

            // check for convergence
            // logDivergenceStats(sim.divergence1);
        }
        calcDivergenceFreeVelocityField(arrFrom, arrTo, pressureFrom);
        calcDivergence(arrTo, sim.divergence1);

        // now we have the pressure field in pressureFrom
        // use it to calculate the final velocity field, which will be stored in arrFrom (which currently contains the tentative velocity field)
        calcDivergenceFreeVelocityField(arrFrom, arrFrom, pressureFrom);
    }

    sim.pressure0 = pressureFrom;
    sim.pressure1 = pressureTo;

    // woo, now we have the complete set of state variables for the next frame in arrFrom
    // so shuffle them around, ensuring arrFrom is stored to the main array (the others are just temporary)
    sim.cells = arrFrom;
    sim.cells2 = arrTo;
    sim.cells3 = arrOrig;

    fixBoundaries(sim);
    computeAggregateValues(sim);

    sim.iterCount += 1;

    console.log("step took " + (performance.now() - startTime) + "ms");
}

function fixBoundaries(sim: IFluidSim) {
    function setCell(cells: Float32Array, y: number, x: number, k: number, value: number) {
        cells[(y * sim.width + x) * 4 + k] = value;
    }

    // top and bottom
    for (let x = 0; x < sim.width; x++) {
        setCell(sim.cells, 0, x, 2, 0);
        setCell(sim.cells, 0, x, 3, 0);
        setCell(sim.cells, sim.height - 1, x, 2, 0);
        setCell(sim.cells, sim.height - 1, x, 3, 0);
    }

    // left and right
    for (let y = 0; y < sim.height; y++) {
        setCell(sim.cells, y, 0, 2, 0);
        setCell(sim.cells, y, 0, 3, 0);
        setCell(sim.cells, y, sim.width - 1, 2, 0);
        setCell(sim.cells, y, sim.width - 1, 3, 0);
    }
}

interface ISimAggregates {
    totalMass: number;
    totalKineticEnergy: number;
    totalMomentumX: number;
    totalMomentumY: number;
    averageTemperature: number;
}

function computeAggregateValues(sim: IFluidSim): ISimAggregates {
    function getCell(cells: Float32Array, y: number, x: number, k: number) {
        return cells[(y * sim.width + x) * 4 + k];
    }

    let aggs: ISimAggregates = {
        totalMass: 0,
        totalKineticEnergy: 0,
        totalMomentumX: 0,
        totalMomentumY: 0,
        averageTemperature: 0
    };

    for (let y = 0; y < sim.height; y++) {
        for (let x = 0; x < sim.width; x++) {
            let temperature = getCell(sim.cells, y, x, 0);
            let density = getCell(sim.cells, y, x, 1);
            let velX = getCell(sim.cells, y, x, 2);
            let velY = getCell(sim.cells, y, x, 3);

            let mass = density * sim.cellSize * sim.cellSize;
            aggs.totalMass += mass;
            aggs.totalKineticEnergy += mass * (velX * velX + velY * velY) / 2;
            aggs.totalMomentumX += mass * velX;
            aggs.totalMomentumY += mass * velY;
            aggs.averageTemperature += mass * temperature;
        }
    }
    aggs.averageTemperature /= aggs.totalMass;

    sim.aggregates = aggs;

    // console.log(`aggregates: mass=${aggs.totalMass.toFixed(2)}, p_x=${aggs.totalMomentumX.toFixed(2)}, p_y=${aggs.totalMomentumY.toFixed(2)}, E_k=${aggs.totalKineticEnergy.toFixed(2)}, T=${aggs.averageTemperature.toFixed(2)}`);

    return aggs;
}