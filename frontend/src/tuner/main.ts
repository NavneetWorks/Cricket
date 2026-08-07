import { Tuner } from "./Tuner";

const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const jsonOutput = document.getElementById("json-output") as HTMLTextAreaElement;
const arcSelector = document.getElementById("arc-selector") as HTMLSelectElement;
const addBtn = document.getElementById("add-point") as HTMLButtonElement;

const tuner = new Tuner(canvas, jsonOutput);

arcSelector.addEventListener("change", (e) => {
    tuner.setActiveArc((e.target as HTMLSelectElement).value);
});

// addBtn.addEventListener("click", () => {
//     tuner.addControlPoint();
// });

document.getElementById("add-10")!.addEventListener("click", () => tuner.modifyAllPoints(10, 1));
document.getElementById("sub-10")!.addEventListener("click", () => tuner.modifyAllPoints(-10, 1));
document.getElementById("mul-11")!.addEventListener("click", () => tuner.modifyAllPoints(0, 1.1));
document.getElementById("mul-09")!.addEventListener("click", () => tuner.modifyAllPoints(0, 0.9));

// Start loop
function loop() {
    tuner.draw();
    requestAnimationFrame(loop);
}
loop();
