import { InjectionToken } from '@angular/core';
import { DropElementDirective } from './drop-element.directive';

export function moveItemInArray<T = any>(array: T[], fromIndex: number, toIndex: number): void {
    const from = clamp(fromIndex, array.length - 1);
    const to = clamp(toIndex, array.length - 1);

    if (from === to) {
        return;
    }

    const target = array[from];
    const delta = to < from ? -1 : 1;

    for (let i = from; i !== to; i += delta) {
        array[i] = array[i + delta];
    }

    array[to] = target;
}
export const App_DropElement = new InjectionToken<DropElementDirective>('appDropElement');
/** Point on the page or within an element. */
export interface Point {
    x: number;
    y: number;
}
type Writeable<T> = { -readonly [P in keyof T]-?: T[P] };

/**
 * Extended CSSStyleDeclaration that includes a couple of drag-related
 * properties that aren't in the built-in TS typings.
 */
interface DragCSSStyleDeclaration extends CSSStyleDeclaration {
    webkitUserDrag: string;
    MozUserSelect: string; // For some reason the Firefox property is in PascalCase.
}

/**
 * Shallow-extends a stylesheet object with another stylesheet object.
 * @docs-private
 */
export function extendStyles(
    dest: Writeable<CSSStyleDeclaration>,
    source: Partial<DragCSSStyleDeclaration>) {
    for (let key in source) {
        if (source.hasOwnProperty(key)) {
            dest[key as keyof CSSStyleDeclaration] = source[key as keyof CSSStyleDeclaration];
        }
    }

    return dest;
}


/**
 * Toggles whether the native drag interactions should be enabled for an element.
 * @param element Element on which to toggle the drag interactions.
 * @param enable Whether the drag interactions should be enabled.
 * @docs-private
 */
export function toggleNativeDragInteractions(element: HTMLElement, enable: boolean) {
    const userSelect = enable ? '' : 'none';

    extendStyles(element.style, {
        touchAction: enable ? '' : 'none',
        webkitUserDrag: enable ? '' : 'none',
        webkitTapHighlightColor: enable ? '' : 'transparent',
        userSelect: userSelect,
        msUserSelect: userSelect,
        webkitUserSelect: userSelect,
        MozUserSelect: userSelect
    });
}
function clamp(value: number, max: number): number {
    return Math.max(0, Math.min(max, value));
}