/// <reference path="../node_modules/@types/pdf/index.d.ts" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
let path;
let socket;
let canvases = [];
let pages = [];
let viewports = [];
let zoom = 1.0;
let zoomInput;
document.addEventListener("DOMContentLoaded", () => {
    const error = document.getElementById("compile-error");
    path = document.body.dataset["path"];
    socket = new WebSocket(document.body.dataset["websocket"]);
    socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "open", path }));
    });
    socket.addEventListener("message", event => {
        const data = JSON.parse(event.data);
        if (data.type === "update") {
            error.style.display = "none";
            loadAndRender(data.path);
        }
        if (data.type === "error") {
            error.style.display = "block";
        }
        if (data.type === "show") {
            const rect = data.rect;
            const offset = canvases[rect.page - 1].offsetTop;
            const position = viewports[rect.page - 1].convertToViewportPoint(rect.x, rect.y)[1];
            window.scrollTo(0, offset + position);
        }
    });
    // Re-render pages on resize.
    let timeout;
    window.onresize = () => {
        clearTimeout(timeout);
        timeout = setTimeout(renderPages, 200);
    };
    // Zoom handlers.
    zoomInput = document.getElementById("zoom-input");
    document.getElementById("zoom-in").onclick = getOnZoomClick(0.25);
    document.getElementById("zoom-out").onclick = getOnZoomClick(-0.25);
    zoomInput.onchange = () => {
        zoom = zoomInput.valueAsNumber / 100;
        renderPages();
    };
    // Show output when click on error.
    error.addEventListener("click", () => {
        socket.send(JSON.stringify({ type: "showOutput" }));
    });
});
function loadAndRender(source) {
    return PDFJS.getDocument(source).then((pdf) => __awaiter(this, void 0, void 0, function* () {
        // Ensure the right number of canvases.
        while (canvases.length < pdf.numPages) {
            const canvas = document.createElement("canvas");
            canvas.onclick = onCanvasClick;
            canvases.push(canvas);
            document.body.appendChild(canvas);
        }
        while (canvases.length > pdf.numPages) {
            canvases.pop().remove();
        }
        // Create the page objects.
        pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            pages.push(yield pdf.getPage(i));
        }
        // Draw the pages.
        renderPages();
    }));
}
function renderPages() {
    viewports = [];
    // Get the widest page.
    const width = Math.max(...pages.map(page => page.getViewport(1).width));
    for (let i = 0; i < pages.length; i++) {
        const scale = zoom * document.body.clientWidth / width;
        const viewport = pages[i].getViewport(scale);
        viewports.push(viewport);
        const canvas = canvases[i];
        const canvasContext = canvas.getContext("2d");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        pages[i].render({ viewport, canvasContext });
    }
}
function onCanvasClick(e) {
    const page = canvases.indexOf(this) + 1;
    const point = viewports[page - 1].convertToPdfPoint(e.x, e.y);
    socket.send(JSON.stringify({ type: "click", page, x: point[0], y: point[1] }));
}
function getOnZoomClick(change) {
    return () => {
        zoom = zoom + change;
        zoomInput.value = (100 * zoom).toString();
        renderPages();
    };
}
//# sourceMappingURL=client.js.map