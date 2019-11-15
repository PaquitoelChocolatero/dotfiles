"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const latex_utensils_1 = require("latex-utensils");
const workerpool = require("workerpool");
function parseLatex(s, options) {
    try {
        return latex_utensils_1.latexParser.parse(s, options);
    }
    catch (e) {
        if (e.name && e.message) {
            console.log(`${e.name}: ${e.message}`);
        }
        return undefined;
    }
}
workerpool.worker({
    parseLatex
});
//# sourceMappingURL=syntax_worker.js.map