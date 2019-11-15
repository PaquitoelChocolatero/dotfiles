"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const constants = require("./constants");
const synctex = require("./synctex");
const cp = require("child_process");
const fs_1 = require("fs");
const http = require("http");
const path_1 = require("path");
const tmp = require("tmp");
const vscode = require("vscode");
const ws = require("ws");
/**
 * Provides preview content and creates a websocket server which communicates with the preview.
 */
class LatexDocumentProvider {
    constructor(context) {
        this.context = context;
        this.directories = new Map();
        this.clients = new Map();
        this.connected = new Map();
        this.connectedResolve = new Map();
        this.http = http.createServer();
        this.server = ws.createServer({ server: this.http });
        this.listening = new Promise((c, e) => {
            this.http.listen(0, "localhost", undefined, err => err ? e(err) : c());
        });
        this.server.on("connection", client => {
            client.on("message", this.onClientMessage.bind(this, client));
            client.on("close", this.onClientClose.bind(this, client));
        });
        this.diagnostics = vscode.languages.createDiagnosticCollection("LaTeX Preview");
        this.output = vscode.window.createOutputChannel("LaTeX Preview");
    }
    dispose() {
        this.server.close();
        this.diagnostics.dispose();
        this.output.dispose();
    }
    /**
     * Returns true if a client with the specified path is connected.
     */
    isPreviewing(path) {
        return this.clients.has(path);
    }
    /**
     * Creates a working dir and returns client HTML.
     */
    provideTextDocumentContent(uri, token) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.listening;
            // Create a working dir and start listening.
            const path = uri.fsPath;
            this.directories.set(path, yield this.createTempDir(path));
            this.listenForConnection(path);
            // Generate the document content.
            const { address, port } = this.http.address();
            const ws = `ws://${address}:${port}`;
            return `
    <!DOCTYPE html>
    <html>
    <head>
      <link rel="stylesheet" href="${this.getResourcePath("media/style.css")}">

      <script src="${this.getResourcePath("node_modules/pdfjs-dist/build/pdf.js")}"></script>
      <script src="${this.getResourcePath("node_modules/pdfjs-dist/build/pdf.worker.js")}"></script>
      <script src="${this.getResourcePath("out/src/client.js")}"></script>
    </head>
    <body class="preview" data-path="${attr(path)}" data-websocket="${attr(ws)}">
      <div id="zoom">
        <span class="icon">🔎</span>
        <input id="zoom-input" type="number" value="100" min="0" />
        <button id="zoom-in">➕</a>
        <button id="zoom-out">➖</a>
      </div>

      <div id="compile-error">
        ⚠ error compiling preview
      </div>
    </body>
    </html>`;
        });
    }
    update(uri) {
        let paths;
        if (vscode.workspace.getConfiguration().get(constants.CONFIG_UPDATE_ALL_ON_SAVE)) {
            paths = Array.from(this.clients.keys());
        }
        else {
            paths = [uri.fsPath];
        }
        paths.filter(path => this.isPreviewing(path)).forEach(path => {
            this
                .build(path, this.directories.get(path))
                .then(pdf => ({ type: "update", path: pdf }))
                .catch(() => ({ type: "error" }))
                .then(data => this.clients.get(path).send(JSON.stringify(data)));
        });
    }
    /**
     * Shows a text editor position in the preview.
     */
    showPosition(uri, position) {
        return __awaiter(this, void 0, void 0, function* () {
            const path = uri.fsPath;
            if (!this.isPreviewing(path)) {
                yield vscode.commands.executeCommand("latex-preview.showPreview", uri);
            }
            // Make sure the client is connected.
            yield this.connected.get(path);
            // Get the position and send to the client.
            const rects = yield synctex.view({
                line: position.line + 1,
                column: position.character + 1,
                input: path,
                output: `${this.directories.get(path)}/preview.pdf`,
            });
            if (rects.length === 0) {
                return;
            }
            this.clients.get(path).send(JSON.stringify({ type: "show", rect: rects[0] }));
        });
    }
    showOutputChannel() {
        this.output.show();
    }
    /**
     * Builds a PDF and returns the path to it.
     */
    build(path, dir) {
        let command = vscode.workspace.getConfiguration().get(constants.CONFIG_COMMAND, "pdflatex");
        let args = ["-jobname=preview", "-synctex=1", "-interaction=nonstopmode", "-file-line-error"];
        if (command === "latexmk") {
            args.push("-pdf");
        }
        args.push(`-output-directory=${arg(dir)}`);
        args.push(arg(path));
        command = [command].concat(...args).join(" ");
        this.output.clear();
        this.output.appendLine(command);
        return new Promise((resolve, reject) => {
            let env = Object.assign({}, process.env, { "OUTPUTDIR": arg(dir) });
            cp.exec(command, { cwd: path_1.dirname(path), env: env }, (err, stdout, stderr) => {
                this.diagnostics.clear();
                this.output.append(stdout);
                this.output.append(stderr);
                if (err) {
                    let regexp = new RegExp(constants.ERROR_REGEX, "gm");
                    let entries = [];
                    let matches;
                    while ((matches = regexp.exec(stdout)) != null) {
                        const line = parseInt(matches[2], 10) - 1;
                        const range = new vscode.Range(line, 0, line, Number.MAX_VALUE);
                        entries.push([
                            vscode.Uri.file(matches[1]),
                            [new vscode.Diagnostic(range, matches[3], vscode.DiagnosticSeverity.Error)],
                        ]);
                    }
                    this.diagnostics.set(entries);
                    reject(err);
                }
                else {
                    resolve(`${dir}/preview.pdf`);
                }
            });
        });
    }
    listenForConnection(path) {
        this.connected.set(path, new Promise(resolve => {
            this.connectedResolve.set(path, resolve);
        }));
    }
    onClientMessage(client, message) {
        const data = JSON.parse(message);
        if (data.type === "open") {
            const path = data.path;
            this.clients.set(path, client);
            this.connectedResolve.get(path)();
            this.update(vscode.Uri.file(path));
        }
        if (data.type === "click") {
            this.onClientClick(client, data);
        }
        if (data.type === "showOutput") {
            this.showOutputChannel();
        }
    }
    onClientClick(client, data) {
        return __awaiter(this, void 0, void 0, function* () {
            const path = this.getPathForClient(client);
            const file = `${this.directories.get(path)}/preview.pdf`;
            const location = yield synctex.edit(Object.assign(data, { file }));
            if (!location) {
                return;
            }
            const character = (location.column > 0) ? location.column - 1 : 0;
            const position = new vscode.Position(location.line - 1, character);
            const document = yield vscode.workspace.openTextDocument(location.input);
            const editor = yield vscode.window.showTextDocument(document);
            editor.selection = new vscode.Selection(position, position);
        });
    }
    onClientClose(closed) {
        const path = this.getPathForClient(closed);
        this.clients.delete(path);
        this.listenForConnection(path);
    }
    getPathForClient(client) {
        for (const [path, candidate] of this.clients.entries()) {
            if (client === candidate) {
                return path;
            }
        }
    }
    /**
     * Creates a new temporary directory.
     */
    createTempDir(target) {
        return __awaiter(this, void 0, void 0, function* () {
            const dir = yield new Promise((c, e) => tmp.dir({ unsafeCleanup: true }, (err, path) => err ? e(err) : c(path)));
            const wd = path_1.dirname(vscode.workspace.asRelativePath(target));
            const texs = yield vscode.workspace.findFiles(path_1.join(wd, '**/*.tex'), "");
            const mkdirs = new Set(texs.map(file => path_1.dirname(file.fsPath))
                .map(dir => path_1.relative(path_1.dirname(target), dir))
                .filter(dir => !!dir)
                .sort((a, b) => a.length - b.length));
            yield Promise.all([...mkdirs].map(subdir => new Promise((c, e) => {
                fs_1.mkdir(path_1.join(dir, subdir), err => err ? e(err) : c());
            })));
            return dir;
        });
    }
    getResourcePath(file) {
        return this.context.asAbsolutePath(file);
    }
}
exports.default = LatexDocumentProvider;
function arg(str) {
    return '"' + str.replace(/([\\"$])/g, "\\$1") + '"';
}
function attr(str) {
    return str.replace("&", "&amp;").replace('"', "&quot;");
}
//# sourceMappingURL=document-provider.js.map