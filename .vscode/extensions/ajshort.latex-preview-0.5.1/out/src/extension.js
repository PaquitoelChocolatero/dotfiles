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
const document_provider_1 = require("./document-provider");
const path_1 = require("path");
const vscode_1 = require("vscode");
/**
 * The extension's document provider instance.
 */
let provider;
function activate(ctx) {
    // Commands
    ctx.subscriptions.push(vscode_1.commands.registerCommand(constants.COMMAND_CREATE_BUILD_TASK, createBuildTask), vscode_1.commands.registerCommand(constants.COMMAND_SHOW_PREVIEW, showPreview), vscode_1.commands.registerCommand(constants.COMMAND_SHOW_PREVIEW_TO_SIDE, showPreviewToSide), vscode_1.commands.registerCommand(constants.COMMAND_SHOW_IN_PREVIEW, showInPreview), vscode_1.commands.registerCommand(constants.COMMAND_SHOW_SOURCE, showSource), vscode_1.commands.registerCommand(constants.COMMAND_SHOW_COMPILE_OUTPUT, showCompileOutput));
    // Document provider
    provider = new document_provider_1.default(ctx);
    ctx.subscriptions.push(provider);
    ctx.subscriptions.push(vscode_1.workspace.registerTextDocumentContentProvider(constants.PREVIEW_SCHEME, provider));
    ctx.subscriptions.push(vscode_1.workspace.onDidSaveTextDocument(doc => {
        if (vscode_1.languages.match(constants.LATEX_SELECTOR, doc) > 0) {
            provider.update(doc.uri);
        }
    }));
}
exports.activate = activate;
function createBuildTask() {
    return __awaiter(this, void 0, void 0, function* () {
        const texes = vscode_1.workspace.findFiles("**/*.tex", "").then(uris => uris.map(uri => vscode_1.workspace.asRelativePath(uri)));
        const file = yield vscode_1.window.showQuickPick(texes, { placeHolder: "File to build" });
        if (!file) {
            return;
        }
        vscode_1.workspace.getConfiguration().update("tasks", {
            version: "0.1.0",
            command: vscode_1.workspace.getConfiguration().get(constants.CONFIG_COMMAND, "pdflatex"),
            isShellCommand: true,
            args: ["-interaction=nonstopmode", "-file-line-error", file],
            showOutput: "silent",
            problemMatcher: {
                owner: "latex-preview",
                fileLocation: ["relative", "${workspaceRoot}"],
                pattern: {
                    regexp: constants.ERROR_REGEX,
                    file: 1,
                    line: 2,
                    message: 3,
                },
            },
        });
    });
}
function showPreview(uri, column) {
    // Use the configured filename, or the current editor.
    const filename = vscode_1.workspace.getConfiguration().get(constants.CONFIG_FILENAME);
    if (filename) {
        uri = vscode_1.Uri.file(path_1.resolve(vscode_1.workspace.rootPath, filename));
    }
    else if (!uri && vscode_1.window.activeTextEditor) {
        uri = vscode_1.window.activeTextEditor.document.uri;
    }
    if (!uri) {
        return;
    }
    if (!column) {
        column = vscode_1.window.activeTextEditor ? vscode_1.window.activeTextEditor.viewColumn : vscode_1.ViewColumn.One;
    }
    const previewUri = uri.with({ scheme: constants.PREVIEW_SCHEME });
    const title = `Preview "${path_1.basename(uri.fsPath)}"`;
    return vscode_1.commands.executeCommand("vscode.previewHtml", previewUri, column, title);
}
function showPreviewToSide(uri) {
    if (!vscode_1.window.activeTextEditor) {
        return showPreview(uri);
    }
    switch (vscode_1.window.activeTextEditor.viewColumn) {
        case vscode_1.ViewColumn.One: return showPreview(uri, vscode_1.ViewColumn.Two);
        case vscode_1.ViewColumn.Two: return showPreview(uri, vscode_1.ViewColumn.Three);
        default: return showPreview(uri, vscode_1.ViewColumn.One);
    }
}
/**
 * Shows the preview and jumps to the selected location.
 */
function showInPreview() {
    const uri = vscode_1.window.activeTextEditor.document.uri;
    const position = vscode_1.window.activeTextEditor.selection.active;
    if (!uri || !position) {
        return;
    }
    return provider.showPosition(uri, position);
}
function showSource(uri) {
    if (!uri) {
        return vscode_1.commands.executeCommand("workbench.action.navigateBack");
    }
    uri = uri.with({ scheme: "file" });
    for (const editor of vscode_1.window.visibleTextEditors) {
        if (editor.document.uri.toString() === uri.toString()) {
            return vscode_1.window.showTextDocument(editor.document, editor.viewColumn);
        }
    }
    return vscode_1.workspace.openTextDocument(uri).then(vscode_1.window.showTextDocument);
}
function showCompileOutput() {
    provider.showOutputChannel();
}
//# sourceMappingURL=extension.js.map