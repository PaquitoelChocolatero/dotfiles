"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const cp = require("child_process");
/**
 * Performs a forward synchronisation using synctex.
 */
function view(opts) {
    const args = [
        "synctex view",
        `-i "${opts.line}:${opts.column}:${opts.input}"`,
        `-o "${opts.output}"`,
    ];
    if (typeof opts.directory !== "undefined") {
        args.push(`-d "${opts.directory}"`);
    }
    return new Promise((resolve, reject) => {
        cp.exec(args.join(" "), (err, out) => {
            if (err) {
                reject(err);
            }
            else {
                resolve(parse(out));
            }
        });
    });
}
exports.view = view;
/**
 * Gets the edit location from a document location.
 */
function edit(opts) {
    const command = `synctex edit -o "${opts.page}:${opts.x}:${opts.y}:${opts.file}"`;
    return new Promise((resolve, reject) => {
        cp.exec(command, (err, out) => {
            if (err) {
                return reject(err);
            }
            const result = parse(out);
            if (result.length === 0) {
                resolve(null);
            }
            else {
                resolve({
                    input: result[0]["input"],
                    line: parseInt(result[0]["line"], 10),
                    column: parseInt(result[0]["column"], 10),
                });
            }
        });
    });
}
exports.edit = edit;
function parse(out) {
    let records = [];
    let record;
    let begun = false;
    for (const line of out.split("\n")) {
        if (line === "SyncTeX result begin") {
            begun = true;
            record = {};
            records.push(record);
            continue;
        }
        else if (line === "SyncTeX result end") {
            break;
        }
        else if (!begun) {
            continue;
        }
        const index = line.indexOf(":");
        if (index === -1) {
            continue;
        }
        const k = line.substr(0, index).toLowerCase();
        const v = line.substr(index + 1);
        // If we see a duplicate field, start a new record.
        if (record.hasOwnProperty(k)) {
            record = {};
            records.push(record);
        }
        record[k] = v;
    }
    return records;
}
//# sourceMappingURL=synctex.js.map