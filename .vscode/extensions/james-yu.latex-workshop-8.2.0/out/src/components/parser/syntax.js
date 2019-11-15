"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const workerpool = require("workerpool");
class UtensilsParser {
    constructor(extension) {
        this.extension = extension;
        this.pool = workerpool.pool(path.join(__dirname, 'syntax_worker.js'), { maxWorkers: 1 });
    }
    parseLatex(s, options) {
        return this.pool.exec('parseLatex', [s, options]);
    }
}
exports.UtensilsParser = UtensilsParser;
//# sourceMappingURL=syntax.js.map