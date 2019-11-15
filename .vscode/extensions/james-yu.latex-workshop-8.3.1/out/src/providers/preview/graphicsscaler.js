"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const workerpool = require("workerpool");
class GraphicsScaler {
    constructor(extension) {
        this.extension = extension;
        this.pool = workerpool.pool(path.join(__dirname, 'graphicsscaler_worker.js'), { maxWorkers: 1, workerType: 'process' });
    }
    scale(filePath, options) {
        return this.pool.exec('scale', [filePath, options]);
    }
}
exports.GraphicsScaler = GraphicsScaler;
//# sourceMappingURL=graphicsscaler.js.map