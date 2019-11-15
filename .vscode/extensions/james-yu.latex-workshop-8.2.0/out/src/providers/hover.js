"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs-extra");
const latex_utensils_1 = require("latex-utensils");
const path = require("path");
const stripJsonComments = require("strip-json-comments");
const utils = require("../utils");
const textdocumentlike_1 = require("../components/textdocumentlike");
const tokenizer_1 = require("./tokenizer");
const utils_1 = require("../utils");
class HoverProvider {
    constructor(extension) {
        this.jaxInitialized = false;
        this.extension = extension;
        Promise.resolve().then(() => require('mathjax-node')).then(mj => {
            this.mj = mj;
            mj.config({
                MathJax: {
                    jax: ['input/TeX', 'output/SVG'],
                    extensions: ['tex2jax.js', 'MathZoom.js'],
                    showMathMenu: false,
                    showProcessingMessages: false,
                    messageStyle: 'none',
                    SVG: {
                        useGlobalCache: false
                    },
                    TeX: {
                        extensions: ['AMSmath.js', 'AMSsymbols.js', 'autoload-all.js', 'color.js', 'noUndefined.js']
                    }
                }
            });
            mj.start();
            this.jaxInitialized = true;
        });
    }
    provideHover(document, position, _token) {
        this.getColor();
        return new Promise((resolve, _reject) => {
            const configuration = vscode.workspace.getConfiguration('latex-workshop');
            const hov = configuration.get('hover.preview.enabled');
            const hovReference = configuration.get('hover.ref.enabled');
            const hovCitation = configuration.get('hover.citation.enabled');
            const hovCommand = configuration.get('hover.command.enabled');
            if (hov) {
                const tex = this.findHoverOnTex(document, position);
                if (tex) {
                    this.findNewCommand(document.getText()).then(newCommands => {
                        this.provideHoverOnTex(document, tex, newCommands).then(hover => resolve(hover));
                    });
                    return;
                }
            }
            const token = tokenizer_1.tokenizer(document, position);
            if (!token) {
                resolve();
                return;
            }
            // Test if we are on a command
            if (token.startsWith('\\')) {
                if (!hovCommand) {
                    resolve();
                    return;
                }
                this.provideHoverOnCommand(token).then(hover => resolve(hover));
                return;
            }
            if (tokenizer_1.onAPackage(document, position, token)) {
                const pkg = encodeURIComponent(JSON.stringify(token));
                const md = `Package **${token}** \n\n`;
                const mdLink = new vscode.MarkdownString(`[View documentation](command:latex-workshop.texdoc?${pkg})`);
                mdLink.isTrusted = true;
                resolve(new vscode.Hover([md, mdLink]));
                return;
            }
            const refs = this.extension.completer.reference.getRefDict();
            if (hovReference && token in refs) {
                const refData = refs[token];
                this.provideHoverOnRef(document, position, refData, token)
                    .then(hover => resolve(hover));
                return;
            }
            const cites = this.extension.completer.citation.getEntryDict();
            if (hovCitation && token in cites) {
                const range = document.getWordRangeAtPosition(position, /\{.*?\}/);
                resolve(new vscode.Hover('```\n' + cites[token].detail + '\n```\n', range));
                return;
            }
            resolve();
        });
    }
    async findNewCommand(content) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        let commandsString = '';
        const newCommandFile = configuration.get('hover.preview.newcommand.newcommandFile');
        if (newCommandFile !== '') {
            if (path.isAbsolute(newCommandFile)) {
                if (fs.existsSync(newCommandFile)) {
                    commandsString = fs.readFileSync(newCommandFile, { encoding: 'utf8' });
                }
            }
            else {
                if (this.extension.manager.rootFile === undefined) {
                    await this.extension.manager.findRoot();
                }
                const rootDir = this.extension.manager.rootDir;
                if (rootDir === undefined) {
                    this.extension.logger.addLogMessage(`Cannot identify the absolute path of new command file ${newCommandFile} without root file.`);
                    return '';
                }
                const newCommandFileAbs = path.join(rootDir, newCommandFile);
                if (fs.existsSync(newCommandFileAbs)) {
                    commandsString = fs.readFileSync(newCommandFileAbs, { encoding: 'utf8' });
                }
            }
        }
        commandsString = commandsString.replace(/^\s*$/gm, '');
        if (!configuration.get('hover.preview.newcommand.parseTeXFile.enabled')) {
            return commandsString;
        }
        let commands = [];
        try {
            const ast = latex_utensils_1.latexParser.parsePreamble(content);
            const regex = /((re)?new|provide)command(\\*)?|DeclareMathOperator(\\*)?/;
            for (const node of ast.content) {
                if (latex_utensils_1.latexParser.isCommand(node) && node.name.match(regex)) {
                    const s = latex_utensils_1.latexParser.stringify(node);
                    commands.push(s);
                }
            }
        }
        catch (e) {
            commands = [];
            const regex = /(\\(?:(?:(?:(?:re)?new|provide)command|DeclareMathOperator)(\*)?{\\[a-zA-Z]+}(?:\[[^[\]{}]*\])*{.*})|\\(?:def\\[a-zA-Z]+(?:#[0-9])*{.*}))/gm;
            const noCommentContent = content.replace(/([^\\]|^)%.*$/gm, '$1'); // Strip comments
            let result;
            do {
                result = regex.exec(noCommentContent);
                if (result) {
                    let command = result[1];
                    if (result[2]) {
                        command = command.replace(/\*/, '');
                    }
                    commands.push(command);
                }
            } while (result);
        }
        return commandsString + '\n' + commands.join('');
    }
    provideHoverOnCommand(token) {
        const signatures = [];
        const pkgs = [];
        const tokenWithoutSlash = token.substring(1);
        this.extension.manager.getIncludedTeX().forEach(cachedFile => {
            const cachedCmds = this.extension.manager.cachedContent[cachedFile].element.command;
            if (cachedCmds === undefined) {
                return;
            }
            cachedCmds.forEach(cmd => {
                const key = this.extension.completer.command.getCmdName(cmd);
                if (key.startsWith(tokenWithoutSlash) &&
                    ((key.length === tokenWithoutSlash.length) ||
                        (key.charAt(tokenWithoutSlash.length) === '[') ||
                        (key.charAt(tokenWithoutSlash.length) === '{'))) {
                    if (typeof cmd.documentation !== 'string') {
                        return;
                    }
                    const doc = cmd.documentation;
                    const packageName = cmd.package;
                    if (packageName && (!pkgs.includes(packageName))) {
                        pkgs.push(packageName);
                    }
                    signatures.push(doc);
                }
            });
        });
        let pkgLink = '';
        if (pkgs.length > 0) {
            pkgLink = '\n\nView documentation for package(s) ';
            pkgs.forEach(p => {
                const pkg = encodeURIComponent(JSON.stringify(p));
                pkgLink += `[${p}](command:latex-workshop.texdoc?${pkg}),`;
            });
            pkgLink = pkgLink.substr(0, pkgLink.lastIndexOf(',')) + '.';
        }
        if (signatures.length > 0) {
            const mdLink = new vscode.MarkdownString(signatures.join('  \n')); // We need two spaces to ensure md newline
            mdLink.appendMarkdown(pkgLink);
            mdLink.isTrusted = true;
            return Promise.resolve(new vscode.Hover(mdLink));
        }
        return Promise.resolve(undefined);
    }
    addDummyCodeBlock(md) {
        // We need a dummy code block in hover to make the width of hover larger.
        const dummyCodeBlock = '```\n```';
        return dummyCodeBlock + '\n' + md + '\n' + dummyCodeBlock;
    }
    async provideHoverOnTex(document, tex, newCommand) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const scale = configuration.get('hover.preview.scale');
        let s = this.renderCursor(document, tex.range);
        s = this.mathjaxify(s, tex.envname);
        const data = await this.mj.typeset({
            math: newCommand + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
        });
        this.scaleSVG(data, scale);
        this.colorSVG(data);
        const xml = data.svgNode.outerHTML;
        const md = this.svgToDataUrl(xml);
        return new vscode.Hover(new vscode.MarkdownString(this.addDummyCodeBlock(`![equation](${md})`)), tex.range);
    }
    async provideHoverOnRef(document, position, refData, token) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const line = refData.position.line;
        const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) });
        const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`);
        mdLink.isTrusted = true;
        if (configuration.get('hover.ref.enabled')) {
            const tex = this.findHoverOnRef(document, position, token, refData);
            if (tex) {
                const newCommands = await this.findNewCommand(document.getText());
                return this.provideHoverPreviewOnRef(tex, newCommands, refData);
            }
        }
        const md = '```latex\n' + refData.documentation + '\n```\n';
        const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/);
        const refNumberMessage = this.refNumberMessage(refData);
        if (refNumberMessage !== undefined && configuration.get('hover.ref.number.enabled')) {
            return new vscode.Hover([md, refNumberMessage, mdLink], refRange);
        }
        return new vscode.Hover([md, mdLink], refRange);
    }
    async provideHoverPreviewOnRef(tex, newCommand, refData) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const scale = configuration.get('hover.preview.scale');
        let tag;
        if (refData.prevIndex !== undefined && configuration.get('hover.ref.number.enabled')) {
            tag = refData.prevIndex.refNumber;
        }
        else {
            tag = refData.label;
        }
        const newTex = this.replaceLabelWithTag(tex.texString, refData.label, tag);
        const s = this.mathjaxify(newTex, tex.envname, { stripLabel: false });
        const obj = { labels: {}, IDs: {}, startNumber: 0 };
        const data = await this.mj.typeset({
            width: 50,
            equationNumbers: 'AMS',
            math: newCommand + this.stripTeX(s),
            format: 'TeX',
            svgNode: true,
            state: { AMS: obj }
        });
        this.scaleSVG(data, scale);
        this.colorSVG(data);
        const xml = data.svgNode.outerHTML;
        const md = this.svgToDataUrl(xml);
        const line = refData.position.line;
        const link = vscode.Uri.parse('command:latex-workshop.synctexto').with({ query: JSON.stringify([line, refData.file]) });
        const mdLink = new vscode.MarkdownString(`[View on pdf](${link})`);
        mdLink.isTrusted = true;
        return new vscode.Hover([this.addDummyCodeBlock(`![equation](${md})`), mdLink], tex.range);
    }
    refNumberMessage(refData) {
        if (refData.prevIndex) {
            const refNum = refData.prevIndex.refNumber;
            const refMessage = `numbered ${refNum} at last compilation`;
            return refMessage;
        }
        return undefined;
    }
    replaceLabelWithTag(tex, refLabel, tag) {
        let newTex = tex.replace(/\\label\{(.*?)\}/g, (_matchString, matchLabel, _offset, _s) => {
            if (refLabel) {
                if (refLabel === matchLabel) {
                    if (tag) {
                        return `\\tag{${tag}}`;
                    }
                    else {
                        return `\\tag{${matchLabel}}`;
                    }
                }
                return '\\notag';
            }
            else {
                return `\\tag{${matchLabel}}`;
            }
        });
        newTex = newTex.replace(/^$/g, '');
        // To work around a bug of \tag with multi-line environments,
        // we have to put \tag after the environments.
        // See https://github.com/mathjax/MathJax/issues/1020
        newTex = newTex.replace(/(\\tag\{.*?\})([\r\n\s]*)(\\begin\{(aligned|alignedat|gathered|split)\}[^]*?\\end\{\4\})/gm, '$3$2$1');
        newTex = newTex.replace(/^\\begin\{(\w+?)\}/, '\\begin{$1*}');
        newTex = newTex.replace(/\\end\{(\w+?)\}$/, '\\end{$1*}');
        return newTex;
    }
    scaleSVG(data, scale) {
        const svgelm = data.svgNode;
        // w0[2] and h0[2] are units, i.e., pt, ex, em, ...
        const w0 = svgelm.getAttribute('width').match(/([.\d]+)(\w*)/);
        const h0 = svgelm.getAttribute('height').match(/([.\d]+)(\w*)/);
        const w = scale * Number(w0[1]);
        const h = scale * Number(h0[1]);
        svgelm.setAttribute('width', w + w0[2]);
        svgelm.setAttribute('height', h + h0[2]);
    }
    svgToDataUrl(xml) {
        const svg64 = Buffer.from(unescape(encodeURIComponent(xml))).toString('base64');
        const b64Start = 'data:image/svg+xml;base64,';
        return b64Start + svg64;
    }
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16) / 255,
            g: parseInt(result[2], 16) / 255,
            b: parseInt(result[3], 16) / 255
        } : null;
    }
    colorSVG(data) {
        const svgelm = data.svgNode;
        const g = svgelm.getElementsByTagName('g')[0];
        g.setAttribute('fill', this.color);
    }
    stripTeX(tex) {
        if (tex.startsWith('$$') && tex.endsWith('$$')) {
            tex = tex.slice(2, tex.length - 2);
        }
        else if (tex.startsWith('$') && tex.endsWith('$')) {
            tex = tex.slice(1, tex.length - 1);
        }
        else if (tex.startsWith('\\(') && tex.endsWith('\\)')) {
            tex = tex.slice(2, tex.length - 2);
        }
        else if (tex.startsWith('\\[') && tex.endsWith('\\]')) {
            tex = tex.slice(2, tex.length - 2);
        }
        return tex;
    }
    getColor() {
        const colorTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme');
        for (const extension of vscode.extensions.all) {
            if (extension.packageJSON === undefined || extension.packageJSON.contributes === undefined || extension.packageJSON.contributes.themes === undefined) {
                continue;
            }
            const candidateThemes = extension.packageJSON.contributes.themes.filter((themePkg) => themePkg.label === colorTheme || themePkg.id === colorTheme);
            if (candidateThemes.length === 0) {
                continue;
            }
            try {
                const themePath = path.resolve(extension.extensionPath, candidateThemes[0].path);
                let theme = JSON.parse(stripJsonComments(fs.readFileSync(themePath, 'utf8')));
                while (theme.include) {
                    const includedTheme = JSON.parse(stripJsonComments(fs.readFileSync(path.resolve(path.dirname(themePath), theme.include), 'utf8')));
                    theme.include = undefined;
                    theme = Object.assign({}, theme, includedTheme);
                }
                const bgColor = this.hexToRgb(theme.colors['editor.background']);
                if (bgColor) {
                    // http://stackoverflow.com/a/3943023/112731
                    const r = bgColor.r <= 0.03928 ? bgColor.r / 12.92 : Math.pow((bgColor.r + 0.055) / 1.055, 2.4);
                    const g = bgColor.r <= 0.03928 ? bgColor.g / 12.92 : Math.pow((bgColor.g + 0.055) / 1.055, 2.4);
                    const b = bgColor.r <= 0.03928 ? bgColor.b / 12.92 : Math.pow((bgColor.b + 0.055) / 1.055, 2.4);
                    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    if (L > 0.179) {
                        this.color = '#000000';
                    }
                    else {
                        this.color = '#ffffff';
                    }
                    return;
                }
                else if (theme.type && theme.type === 'dark') {
                    this.color = '#ffffff';
                    return;
                }
            }
            catch (e) {
                console.log('Error when JSON.parse theme files.');
                console.log(e.message);
            }
            const uiTheme = candidateThemes[0].uiTheme;
            if (!uiTheme || uiTheme === 'vs') {
                this.color = '#000000';
                return;
            }
            else {
                this.color = '#ffffff';
                return;
            }
        }
        if (utils_1.themeColorMap[colorTheme] === 'dark') {
            this.color = '#ffffff';
            return;
        }
        this.color = '#000000';
    }
    // Test whether cursor is in tex command strings
    // like \begin{...} \end{...} \xxxx{ \[ \] \( \) or \\
    isCursorInTeXCommand(document) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return false;
        }
        const cursor = editor.selection.active;
        const r = document.getWordRangeAtPosition(cursor, /\\(?:begin|end|label)\{.*?\}|\\[a-zA-Z]+\{?|\\[()[\]]|\\\\/);
        if (r && r.start.isBefore(cursor) && r.end.isAfter(cursor)) {
            return true;
        }
        return false;
    }
    renderCursor(document, range) {
        const editor = vscode.window.activeTextEditor;
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const conf = configuration.get('hover.preview.cursor.enabled');
        if (editor && conf && !this.isCursorInTeXCommand(document)) {
            const cursor = editor.selection.active;
            const symbol = configuration.get('hover.preview.cursor.symbol');
            const color = configuration.get('hover.preview.cursor.color');
            let sym = `{\\color{${this.color}}${symbol}}`;
            if (color !== 'auto') {
                sym = `{\\color{${color}}${symbol}}`;
            }
            if (range.contains(cursor) && !range.start.isEqual(cursor) && !range.end.isEqual(cursor)) {
                return document.getText(new vscode.Range(range.start, cursor)) + sym + document.getText(new vscode.Range(cursor, range.end));
            }
        }
        return document.getText(range);
    }
    mathjaxify(tex, envname, opt = { stripLabel: true }) {
        // remove TeX comments
        let s = tex.replace(/^\s*%.*\r?\n/mg, '');
        s = s.replace(/^((?:\\.|[^%])*).*$/mg, '$1');
        // remove \label{...}
        if (opt.stripLabel) {
            s = s.replace(/\\label\{.*?\}/g, '');
        }
        if (envname.match(/^(aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|gathered|matrix|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)$/)) {
            s = '\\begin{equation}' + s + '\\end{equation}';
        }
        return s;
    }
    findHoverOnTex(document, position) {
        const envBeginPat = /\\begin\{(align|align\*|alignat|alignat\*|aligned|alignedat|array|Bmatrix|bmatrix|cases|CD|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*|gathered|matrix|multline|multline\*|pmatrix|smallmatrix|split|subarray|Vmatrix|vmatrix)\}/;
        let r = document.getWordRangeAtPosition(position, envBeginPat);
        if (r) {
            const envname = this.getFirstRmemberedSubstring(document.getText(r), envBeginPat);
            return this.findHoverOnEnv(document, envname, r.start);
        }
        const parenBeginPat = /(\\\[|\\\(|\$\$)/;
        r = document.getWordRangeAtPosition(position, parenBeginPat);
        if (r) {
            const paren = this.getFirstRmemberedSubstring(document.getText(r), parenBeginPat);
            return this.findHoverOnParen(document, paren, r.start);
        }
        return this.findHoverOnInline(document, position);
    }
    findHoverOnRef(document, position, token, refData) {
        const docOfRef = textdocumentlike_1.TextDocumentLike.load(refData.file);
        const envBeginPatMathMode = /\\begin\{(align|align\*|alignat|alignat\*|eqnarray|eqnarray\*|equation|equation\*|gather|gather\*)\}/;
        const l = docOfRef.lineAt(refData.position.line).text;
        const pat = new RegExp('\\\\label\\{' + utils.escapeRegExp(token) + '\\}');
        const m = l.match(pat);
        if (m && m.index !== undefined) {
            const labelPos = new vscode.Position(refData.position.line, m.index);
            const beginPos = this.findBeginPair(docOfRef, envBeginPatMathMode, labelPos);
            if (beginPos) {
                const t = this.findHoverOnTex(docOfRef, beginPos);
                if (t) {
                    const beginEndRange = t.range;
                    const refRange = document.getWordRangeAtPosition(position, /\{.*?\}/);
                    if (refRange && beginEndRange.contains(labelPos)) {
                        t.range = refRange;
                        return t;
                    }
                }
            }
        }
        return undefined;
    }
    getFirstRmemberedSubstring(s, pat) {
        const m = s.match(pat);
        if (m && m[1]) {
            return m[1];
        }
        return 'never return here';
    }
    removeComment(line) {
        return line.replace(/^((?:\\.|[^%])*).*$/, '$1');
    }
    //  \begin{...}                \end{...}
    //             ^
    //             startPos1
    findEndPair(document, endPat, startPos1) {
        const currentLine = document.lineAt(startPos1).text.substring(startPos1.character);
        const l = this.removeComment(currentLine);
        let m = l.match(endPat);
        if (m && m.index !== undefined) {
            return new vscode.Position(startPos1.line, startPos1.character + m.index + m[0].length);
        }
        let lineNum = startPos1.line + 1;
        while (lineNum <= document.lineCount) {
            m = this.removeComment(document.lineAt(lineNum).text).match(endPat);
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index + m[0].length);
            }
            lineNum += 1;
        }
        return undefined;
    }
    //  \begin{...}                \end{...}
    //  ^                          ^
    //  return pos                 endPos1
    findBeginPair(document, beginPat, endPos1, limit = 20) {
        const currentLine = document.lineAt(endPos1).text.substr(0, endPos1.character);
        let l = this.removeComment(currentLine);
        let m = l.match(beginPat);
        if (m && m.index !== undefined) {
            return new vscode.Position(endPos1.line, m.index);
        }
        let lineNum = endPos1.line - 1;
        let i = 0;
        while (lineNum >= 0 && i < limit) {
            l = document.lineAt(lineNum).text;
            l = this.removeComment(l);
            m = l.match(beginPat);
            if (m && m.index !== undefined) {
                return new vscode.Position(lineNum, m.index);
            }
            lineNum -= 1;
            i += 1;
        }
        return undefined;
    }
    //  \begin{...}                \end{...}
    //  ^
    //  startPos
    findHoverOnEnv(document, envname, startPos) {
        const pattern = new RegExp('\\\\end\\{' + utils.escapeRegExp(envname) + '\\}');
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length + '\\begin{}'.length);
        const endPos = this.findEndPair(document, pattern, startPos1);
        if (endPos) {
            const range = new vscode.Range(startPos, endPos);
            return { texString: document.getText(range), range, envname };
        }
        return undefined;
    }
    //  \[                \]
    //  ^
    //  startPos
    findHoverOnParen(document, envname, startPos) {
        const pattern = envname === '\\[' ? /\\\]/ : envname === '\\(' ? /\\\)/ : /\$\$/;
        const startPos1 = new vscode.Position(startPos.line, startPos.character + envname.length);
        const endPos = this.findEndPair(document, pattern, startPos1);
        if (endPos) {
            const range = new vscode.Range(startPos, endPos);
            return { texString: document.getText(range), range, envname };
        }
        return undefined;
    }
    findHoverOnInline(document, position) {
        const currentLine = document.lineAt(position.line).text;
        const regex = /(?<!\$|\\)\$(?!\$)(?:\\.|[^\\])+?\$|\\\(.+?\\\)/;
        let s = currentLine;
        let base = 0;
        let m = s.match(regex);
        while (m) {
            if (m.index !== undefined) {
                const matchStart = base + m.index;
                const matchEnd = base + m.index + m[0].length;
                if (matchStart <= position.character && position.character <= matchEnd) {
                    const range = new vscode.Range(position.line, matchStart, position.line, matchEnd);
                    return { texString: document.getText(range), range, envname: '$' };
                }
                else {
                    base = matchEnd;
                    s = currentLine.substring(base);
                }
            }
            else {
                break;
            }
            m = s.match(regex);
        }
        return undefined;
    }
}
exports.HoverProvider = HoverProvider;
//# sourceMappingURL=hover.js.map