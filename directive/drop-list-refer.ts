import { DragRefer, deepCloneNode, getTransform, getPreviewInsertionPoint } from './drag-refer';
import { ElementRef } from '@angular/core';
import { DragDropRegistryService } from './drag-drop-registry.service';
import { Subject } from 'rxjs';
import { moveItemInArray, Point, extendStyles, toggleNativeDragInteractions } from './controls-drop-ref';
const DROP_PROXIMITY_THRESHOLD = 0.05;
interface CachedItemPosition {
    /** Instance of the drag item. */
    drag: DragRefer;
    /** Dimensions of the item. */
    clientRect: ClientRect;
    /** Amount by which the item has been moved since dragging started. */
    offset: number;
}
export class DropListRefer<T = any> {
    private _siblings: ReadonlyArray<DropListRefer> = [];
    private _document: Document;
    enterPredicate: (drag: DragRefer, drop: DropListRefer) => boolean = () => true;
    element: HTMLElement | ElementRef<HTMLElement>;
    private _clientRect: ClientRect;
    beforeStarted = new Subject<void>();
    private _isDragging = false;
    private _activeDraggables: DragRefer[];
    private _itemPositions: CachedItemPosition[] = [];
    _draggables: Array<DragRefer> = [];
    private _activeSiblings = new Set<DropListRefer>();
    private _previousSwap = { drag: null as DragRefer | null, delta: 0 };
    private lasteItem: number = -1;
    private lastePoint: Point;
    cloneElement: HTMLElement;
    dropped = new Subject<{
        item: DragRefer,
        currentIndex: number,
        previousIndex: number,
        container: DropListRefer
    }>();
    constructor(
        element: ElementRef<HTMLElement> | HTMLElement,
        private _dragDropRegistry: DragDropRegistryService<DragRefer, DropListRefer>,
        _document: any) {
        _dragDropRegistry.registerDropContainer(this);
        this._document = _document;
        this.element = element instanceof ElementRef ? element.nativeElement : element;
    }
    _getSiblingContainerFromPosition(item: DragRefer, x: number, y: number): DropListRefer | undefined {
        return this._siblings.find(sibling => sibling._canReceive(item, x, y));
    }
    _canReceive(item: DragRefer, x: number, y: number): boolean {
        if (!this.enterPredicate(item, this) || !isInsideClientRect(this._clientRect, x, y)) {
            return false;
        }

        const elementFromPoint = this._document.elementFromPoint(x, y) as HTMLElement | null;

        // If there's no element at the pointer position, then
        // the client rect is probably scrolled out of the view.
        if (!elementFromPoint) {
            return false;
        }
        const nativeElement = (<HTMLElement>this.element);
        return elementFromPoint === nativeElement || nativeElement.contains(elementFromPoint);
    }
    _isOverContainer(x: number, y: number): boolean {
        return isInsideClientRect(this._clientRect, x, y);
    }
    private _cacheOwnPosition() {
        this._clientRect = (<HTMLElement>this.element).getBoundingClientRect();
    }
    /** Starts dragging an item. */
    start(): void {
        this.beforeStarted.next();
        this.lasteItem = -1;
        this.lastePoint = null;
        this._isDragging = true;
        this._cacheItems();
        this._siblings.forEach(sibling => sibling._startReceiving(this));
        this.cloneElement = this._createPreviewElement();
        (<HTMLElement>this.element).style.visibility = 'hidden';
        getPreviewInsertionPoint(this._document).appendChild(this.cloneElement);
    }
    private _cacheItems(): void {
        this._activeDraggables = this._draggables.slice();
        this._cacheItemPositions();
        this._cacheOwnPosition();
    }
    private _cacheItemPositions() {
        this._itemPositions = this._activeDraggables.map(drag => {
            const elementToMeasure = this._dragDropRegistry.isDragging(drag) ?
                // If the element is being dragged, we have to measure the
                // placeholder, because the element is hidden.
                drag.getPlaceholderElement() :
                drag.getRootElement();
            const clientRect = elementToMeasure.getBoundingClientRect();

            return {
                drag,
                offset: 0,
                // We need to clone the `clientRect` here, because all the values on it are readonly
                // and we need to be able to update them. Also we can't use a spread here, because
                // the values on a `ClientRect` aren't own properties. See:
                // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect#Notes
                clientRect: {
                    top: clientRect.top,
                    right: clientRect.right,
                    bottom: clientRect.bottom,
                    left: clientRect.left,
                    width: clientRect.width,
                    height: clientRect.height
                }
            };
        });
    }
    _startReceiving(sibling: DropListRefer) {
        const activeSiblings = this._activeSiblings;
        if (!activeSiblings.has(sibling)) {
            activeSiblings.add(sibling);
            this._cacheOwnPosition();
        }
    }
    _sortItem(item: DragRefer, pointerX: number, pointerY: number): void {
        if (!this._isPointerNearDropContainer(pointerX, pointerY)) {
            this.lastePoint = { x: pointerX, y: pointerY };
            return;
        }
        const siblings = this._itemPositions;
        const currentIndex = findIndex(siblings, currentItem => currentItem.drag === item);
        const newIndex = this._getItemIndexFromPointerPosition(this.cloneElement, pointerX, pointerY, currentIndex);

        if (newIndex === -1 && siblings.length > 0) {
            this.lastePoint = { x: pointerX, y: pointerY };
            return;
        }
        const parent = this.cloneElement;
        if (!parent.children) return;
        if (this.lasteItem > -1) {
            if (this.lastePoint) {
                const rect = parent.children[newIndex].getBoundingClientRect();
                const flag1 = pointerX >= Math.floor(rect.left) && pointerX <= Math.floor(rect.right) &&
                    pointerY >= Math.floor(rect.top) && pointerY <= Math.floor(rect.bottom);
                const flag2 = this.lastePoint.x >= Math.floor(rect.left) && this.lastePoint.x <= Math.floor(rect.right) &&
                    this.lastePoint.y >= Math.floor(rect.top) && this.lastePoint.y <= Math.floor(rect.bottom);
                if (flag1 && flag2) {
                    return;
                }
            }
        }
        this.lastePoint = { x: pointerX, y: pointerY };

        const siblingAtNewPosition = siblings[newIndex];
        if (currentIndex === newIndex) {
            return;
        }
        this._previousSwap.drag = siblingAtNewPosition.drag;
        // const itemOffset = this._getItemOffsetPx(currentPosition, newPosition, delta);
        this.lasteItem = newIndex;
        // const siblingOffset = this._getSiblingOffsetPx(currentIndex, siblings, delta);
        moveItemInArray(siblings, currentIndex, newIndex);
        moveItemInArray(this._draggables, currentIndex, newIndex);
        const cloneChild = this.cloneElement.children[currentIndex];
        // parent.removeChild(cloneChild);
        if (currentIndex < newIndex) {
            if (newIndex > siblings.length - 1) {
                parent.insertBefore(cloneChild, null);
            } else {
                parent.insertBefore(cloneChild, parent.children[newIndex + 1]);
            }
        } else {
            parent.insertBefore(cloneChild, parent.children[newIndex]);
        }
        // siblings.forEach((sibling) => {
        //     const clientRect = sibling.drag.getRootElement().getBoundingClientRect();
        //     sibling.clientRect = {
        //         top: clientRect.top,
        //         right: clientRect.right,
        //         bottom: clientRect.bottom,
        //         left: clientRect.left,
        //         width: clientRect.width,
        //         height: clientRect.height
        //     };
        // });
        // siblings.forEach((sibling, index) => {
        //     if (oldOrder[index] === sibling) {
        //         return;
        //     }
        //     const isDraggedItem = sibling.drag === item;
        //     // const offset = isDraggedItem ? itemOffset : siblingOffset;
        //     const elementToOffset = isDraggedItem ? item.getPlaceholderElement() :
        //         sibling.drag.getRootElement();
        //     // sibling.offset += offset;
        //     // if (isHorizontal) {
        //     //     elementToOffset.style.transform = `translate3d(${Math.round(sibling.offset)}px, 0, 0)`;
        //     // } else {
        //     //     elementToOffset.style.transform = `translate3d(0, ${Math.round(sibling.offset)}px, 0)`;
        //     // }
        // });
    }
    private _isPointerNearDropContainer(pointerX: number, pointerY: number): boolean {
        const { top, right, bottom, left, width, height } = this._clientRect;
        const xThreshold = width * DROP_PROXIMITY_THRESHOLD;
        const yThreshold = height * DROP_PROXIMITY_THRESHOLD;

        return pointerY > top - yThreshold && pointerY < bottom + yThreshold &&
            pointerX > left - xThreshold && pointerX < right + xThreshold;
    }
    private _getItemIndexFromPointerPosition(container: HTMLElement, pointerX: number, pointerY: number, index: number) {
        if (!container!.children) return -1;
        const length = container.children.length;
        for (let k = 0; k < length; k++) {
            if (index === k) {
                if (length < 2) return k;
            }
            else {
                const clientRect = container.children[k].getBoundingClientRect();
                if (pointerX >= Math.floor(clientRect.left) && pointerX <= Math.floor(clientRect.right) &&
                    pointerY >= Math.floor(clientRect.top) && pointerY <= Math.floor(clientRect.bottom)) {
                    return k;
                }
            }
        }
        return -1;
        // return findIndex(this._itemPositions, ({ drag, clientRect }, _, array) => {
        //     if (drag === item) {
        //         return array.length < 2;
        //     }
        //     return pointerX >= Math.floor(clientRect.left) && pointerX <= Math.floor(clientRect.right) &&
        //         pointerY >= Math.floor(clientRect.top) && pointerY <= Math.floor(clientRect.bottom);
        // });
    }
    getItemIndex(item: DragRefer): number {
        if (!this._isDragging) {
            return this._draggables.indexOf(item);
        }
        const items = this._itemPositions;

        return findIndex(items, currentItem => currentItem.drag === item);
    }
    drop(item: DragRefer, currentIndex: number, previousContainer: DropListRefer, previousIndex: number): void {
        this._reset();
        this.dropped.next({
            item,
            currentIndex,
            previousIndex: previousIndex,
            container: this,
        });
    }
    private _reset() {
        this._isDragging = false;
        this._activeDraggables = [];
        this._itemPositions = [];
        this._previousSwap.drag = null;
        this._previousSwap.delta = 0;
    }
    private _createPreviewElement(): HTMLElement {
        let preview: HTMLElement;

        const element = <HTMLElement>(this.element);
        const elementRect = element.getBoundingClientRect();

        preview = deepCloneNode(element);
        preview.style.width = `${elementRect.width}px`;
        preview.style.height = `${elementRect.height}px`;
        preview.style.transform = getTransform(elementRect.left, elementRect.top);

        extendStyles(preview.style, {
            // It's important that we disable the pointer events on the preview, because
            // it can throw off the `document.elementFromPoint` calls in the `CdkDropList`.
            pointerEvents: 'none',
            position: 'fixed',
            top: '0',
            left: '0',
            zIndex: '1000'
        });

        toggleNativeDragInteractions(preview, false);

        preview.classList.add('cdk-drag-preview');
        return preview;
    }
}
function isInsideClientRect(clientRect: ClientRect, x: number, y: number) {
    const { top, bottom, left, right } = clientRect;
    return y >= top && y <= bottom && x >= left && x <= right;
}
function findIndex<T>(array: T[],
    predicate: (value: T, index: number, obj: T[]) => boolean): number {

    for (let i = 0; i < array.length; i++) {
        if (predicate(array[i], i, array)) {
            return i;
        }
    }

    return -1;
}