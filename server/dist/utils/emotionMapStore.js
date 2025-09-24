"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEmotionStore = loadEmotionStore;
exports.saveEmotionStore = saveEmotionStore;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const filePath = path_1.default.join(__dirname, '../data/emotionCoordinates.json');
if (!fs_1.default.existsSync(filePath)) {
    fs_1.default.mkdirSync(path_1.default.dirname(filePath), { recursive: true });
    fs_1.default.writeFileSync(filePath, '{}', 'utf-8');
}
function loadEmotionStore() {
    try {
        const raw = fs_1.default.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw);
    }
    catch (err) {
        console.error('⚠️ Erro lendo emotionCoordinates.json', err);
        return {};
    }
}
function saveEmotionStore(data) {
    try {
        fs_1.default.writeFileSync(filePath, JSON.stringify(data, null, 2));
    }
    catch (err) {
        console.error('⚠️ Erro escrevendo emotionCoordinates.json', err);
    }
}
//# sourceMappingURL=emotionMapStore.js.map