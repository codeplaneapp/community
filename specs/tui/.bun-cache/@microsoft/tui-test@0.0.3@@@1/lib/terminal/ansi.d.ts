export declare const enableWin32InputMode: string;
export declare enum MouseKey {
    Left = 0,
    Middle = 1,
    Right = 2
}
export declare enum Key {
    Home = "Home",
    End = "End",
    PageUp = "PageUp",
    PageDown = "PageDown",
    Insert = "Insert",
    Delete = "Delete",
    Backspace = "Backspace",
    Tab = "Tab",
    Enter = "Enter",
    Space = "Space",
    Escape = "Escape",
    F1 = "F1",
    F2 = "F2",
    F3 = "F3",
    F4 = "F4",
    F5 = "F5",
    F6 = "F6",
    F7 = "F7",
    F8 = "F8",
    F9 = "F9",
    F10 = "F10",
    F11 = "F11",
    F12 = "F12"
}
type KeyModifiers = {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
};
declare const _default: {
    keyUp: string;
    keyDown: string;
    keyRight: string;
    keyLeft: string;
    ESC: string;
    keyBackspace: string;
    keyDelete: string;
    keyCtrlC: string;
    keyCtrlD: string;
    saveScreen: string;
    restoreScreen: string;
    clearScreen: string;
    cursorTo: (x: number, y: number) => string;
    mouseDown: (x: number, y: number, button: MouseKey) => string;
    mouseUp: (x: number, y: number, button: MouseKey) => string;
    mouseMove: (x: number, y: number) => string;
    keyCombo: (key: string, modifiers?: KeyModifiers | undefined) => string;
};
export default _default;
