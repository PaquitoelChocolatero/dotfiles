"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const workerpool = require("workerpool");
class PDFRenderer {
    constructor(extension) {
        this.extension = extension;
        this.pool = workerpool.pool(path.join(__dirname, 'pdfrenderer_worker.js'), { maxWorkers: 1, workerType: 'process' });
    }
    renderToSVG(pdfPath, options) {
        return this.pool.exec('renderToSvg', [pdfPath, options]);
    }
}
exports.PDFRenderer = PDFRenderer;
//# sourceMappingURL=pdfrenderer.js.map